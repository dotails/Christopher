package com.ttsreader.app

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.ZipInputStream
import kotlin.concurrent.thread

/**
 * The voices aren't inside the APK, so the app stays small enough to download reliably.
 * The user picks voices one by one; they're downloaded (and deleted) from the app, from
 * this repository's "tts-reader-models" release: resumable, retried automatically, and
 * checked against the SHA-256 sums in its manifest.
 *
 * What a voice needs:
 * - "common": pronunciation data every voice uses (about 0.5 MB).
 * - US and UK voices: the Kokoro model they all share (about 328 MB, with the first
 *   one) plus the voice's own data (0.5 MB), written into a local voices.bin.
 * - Australian voices: the Piper model (77 MB, with the first one). All ten are inside
 *   it, so the others then cost nothing.
 *
 * Phones that already have voices from an earlier version keep them.
 */
object ModelStore {

    private const val BASE = "https://github.com/dotails/Christopher/releases/download/tts-reader-models/"
    private const val COMMON = "common"
    private const val KOKORO = "kokoro"
    private const val AU = "au"
    /** Kokoro's voices.bin: 54 voices of 510 x 256 float32 each (only the downloaded ones are filled in). */
    private const val VOICES_BIN_SIZE = 54L * 510 * 256 * 4

    class Status(val running: Set<String>, val done: Long, val total: Long, val step: String, val error: String)

    @Volatile private var running: Set<String> = emptySet()
    @Volatile private var done = 0L
    @Volatile private var total = 0L
    @Volatile private var step = ""
    @Volatile private var error = ""
    private val listeners = ArrayList<() -> Unit>()

    fun dir(context: Context) = File(context.filesDir, "models")

    /** Australian voice ids start with "au_"; the rest are Kokoro (US and UK). */
    fun familyOf(voiceId: String) = if (voiceId.startsWith("au_")) AU else KOKORO

    // ---- what's installed ----
    // models/.part-<name> marks a shared part as installed; models/voices.txt lists installed
    // voices, where "*kokoro" / "*au" mean every voice of that family (earlier versions).

    private fun hasPart(models: File, part: String) = File(models, ".part-$part").exists()

    private fun installedList(models: File): Set<String> =
        File(models, "voices.txt").takeIf { it.exists() }?.readLines()?.map { it.trim() }?.filter { it.isNotEmpty() }?.toSet().orEmpty()

    private fun saveInstalled(models: File, ids: Set<String>) {
        models.mkdirs()
        File(models, "voices.txt").writeText(ids.sorted().joinToString("\n"))
    }

    /** Versions 2-9 installed everything ("complete-v2"); version 10 installed whole packs. */
    @Synchronized
    private fun migrate(models: File) {
        val legacy = File(models, ".complete-v2")
        val packs = listOf(COMMON, KOKORO, AU).filter { File(models, ".pack-$it").exists() }
        if (!legacy.exists() && packs.isEmpty()) return
        val all = legacy.exists()
        val families = if (all) listOf(KOKORO, AU) else packs.filter { it != COMMON }
        if (all || COMMON in packs) File(models, ".part-$COMMON").createNewFile()
        for (f in families) File(models, ".part-$f").createNewFile()
        saveInstalled(models, installedList(models) + families.map { "*$it" })
        legacy.delete()
        packs.forEach { File(models, ".pack-$it").delete() }
    }

    fun isVoiceInstalled(context: Context, voiceId: String): Boolean {
        val models = dir(context)
        migrate(models)
        val family = familyOf(voiceId)
        if (!hasPart(models, COMMON) || !hasPart(models, family)) return false
        val ids = installedList(models)
        return voiceId in ids || "*$family" in ids
    }

    fun anyInstalled(context: Context): Boolean {
        val models = dir(context)
        migrate(models)
        return hasPart(models, COMMON) && installedList(models).isNotEmpty()
    }

    /** Voice ids asked for but not finished, so an interrupted download resumes on the next launch. */
    fun pendingRequest(context: Context): Set<String> =
        File(context.filesDir, "voices-download-requested").takeIf { it.exists() }?.readText()
            ?.split(",")?.filter { it.isNotBlank() }?.toSet().orEmpty()

    fun status() = Status(running, done, total, step, error)

    /** Called (on a background thread) whenever voices are installed or deleted. */
    fun onChange(action: () -> Unit) {
        synchronized(listeners) { listeners.add(action) }
    }

    private fun changed() = synchronized(listeners) { ArrayList(listeners) }.forEach { runCatching { it() } }

    /** Downloads the given voices (ids), skipping any already installed. */
    @Synchronized
    fun start(context: Context, voiceIds: Set<String>) {
        if (running.isNotEmpty()) return
        val app = context.applicationContext
        val wanted = voiceIds.filter { !isVoiceInstalled(app, it) }.toSet()
        if (wanted.isEmpty()) return
        running = wanted
        error = ""
        done = 0
        total = 0
        File(app.filesDir, "voices-download-requested").writeText(wanted.joinToString(","))
        thread(name = "voice-download") {
            try {
                downloadInto(dir(app), BASE, wanted)
                File(app.filesDir, "voices-download-requested").delete()
                step = "Done"
            } catch (e: Throwable) {
                error = e.message ?: e.toString()
            } finally {
                running = emptySet()
                changed()
            }
        }
    }

    /**
     * Deletes voices. [catalog] is every voice id the app offers (to resolve "all of a
     * family"). A family's shared model goes once none of its voices are left.
     */
    @Synchronized
    fun remove(context: Context, voiceIds: Set<String>, catalog: List<String>) {
        if (running.isNotEmpty()) return
        val models = dir(context)
        migrate(models)
        val expanded = installedList(models).flatMap { id ->
            if (id.startsWith("*")) catalog.filter { familyOf(it) == id.drop(1) } else listOf(id)
        }.toSet()
        val left = expanded - voiceIds
        saveInstalled(models, left)
        if (left.none { familyOf(it) == KOKORO }) {
            File(models, ".part-$KOKORO").delete()
            File(models, "kokoro").listFiles()?.filter { it.name != "espeak-ng-data" }?.forEach { it.deleteRecursively() }
        }
        if (left.none { familyOf(it) == AU }) {
            File(models, ".part-$AU").delete()
            File(models, "au").deleteRecursively()
        }
        if (left.isEmpty()) {
            File(models, ".part-$COMMON").delete()
            File(models, "kokoro").deleteRecursively()
        }
        changed()
    }

    private class Item(val sha256: String, val size: Long, val name: String, val part: String, val offset: Long)

    /** Downloads what [voiceIds] need (shared parts only if missing) into [models], then installs it. */
    internal fun downloadInto(models: File, base: String, voiceIds: Set<String>) {
        migrate(models)
        val staging = File(models, ".download").apply { mkdirs() }
        val families = voiceIds.map { familyOf(it) }.toSet()

        step = "Checking what to download…"
        val items = withRetries { URL(base + "manifest.txt").readText() }
            .lines().filter { it.isNotBlank() }
            .map { line ->
                line.trim().split(Regex("\\s+")).let { Item(it[0], it[1].toLong(), it[2], it[3], it.getOrNull(4)?.toLong() ?: -1) }
            }
            .filter { item ->
                when {
                    item.part == COMMON -> !hasPart(models, COMMON)
                    item.part == KOKORO || item.part == AU -> item.part in families && !hasPart(models, item.part)
                    item.part.startsWith("voice:") -> item.part.removePrefix("voice:") in voiceIds
                    else -> false
                }
            }
        total = items.sumOf { it.size }

        var finished = 0L
        for (item in items) {
            val file = File(staging, item.name)
            step = "Downloading ${item.name}"
            fetch(base + item.name, file, item.size) { have -> done = finished + have }
            step = "Checking ${item.name}"
            if (sha256(file) != item.sha256) {
                file.delete()
                throw IOException("${item.name} was corrupted in transit. Tap Retry.")
            }
            finished += item.size
            done = finished
        }

        // Install: shared parts first (each marked when complete), then the voices.
        step = "Installing…"
        for (part in listOf(COMMON, KOKORO, AU)) {
            val partItems = items.filter { it.part == part }
            if (partItems.isEmpty()) continue
            for (item in partItems) {
                val file = File(staging, item.name)
                when {
                    item.name == "kokoro-model.onnx" -> move(file, File(models, "kokoro/model.onnx"))
                    item.name == "au-model.onnx" -> move(file, File(models, "au/model.onnx"))
                    item.name.endsWith(".zip") -> unzip(file, models).also { file.delete() }
                }
            }
            File(models, ".part-$part").createNewFile()
        }
        val voicesBin = File(models, "kokoro/voices.bin")
        for (item in items.filter { it.part.startsWith("voice:") }) {
            voicesBin.parentFile?.mkdirs()
            RandomAccessFile(voicesBin, "rw").use { out ->
                if (out.length() < VOICES_BIN_SIZE) out.setLength(VOICES_BIN_SIZE)
                out.seek(item.offset)
                out.write(File(staging, item.name).readBytes())
            }
        }
        saveInstalled(models, installedList(models) + voiceIds) // Australian voices just need the model
        staging.deleteRecursively()
    }

    /** Downloads [url] into [part], resuming from what's already there. */
    private fun fetch(url: String, part: File, size: Long, progress: (Long) -> Unit) {
        withRetries {
            var have = if (part.exists()) part.length() else 0L
            if (have > size) {
                part.delete()
                have = 0
            }
            if (have < size) {
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20_000
                    readTimeout = 30_000
                    if (have > 0) setRequestProperty("Range", "bytes=$have-")
                }
                try {
                    val code = conn.responseCode
                    if (code != 200 && code != 206) throw IOException("Download failed (HTTP $code)")
                    if (code == 200) have = 0 // the server sent the whole file again
                    FileOutputStream(part, code == 206).use { out ->
                        conn.inputStream.use { input ->
                            val buffer = ByteArray(1 shl 16)
                            while (true) {
                                val n = input.read(buffer)
                                if (n < 0) break
                                out.write(buffer, 0, n)
                                have += n
                                progress(have)
                            }
                        }
                    }
                } finally {
                    conn.disconnect()
                }
                if (have < size) throw IOException("The connection dropped")
            }
            progress(size)
        }
    }

    /** Retries network trouble with growing pauses (2 s up to 30 s), about 3 minutes in all. */
    private fun <T> withRetries(block: () -> T): T {
        var wait = 2_000L
        repeat(10) { attempt ->
            try {
                return block()
            } catch (e: IOException) {
                if (attempt == 9) throw IOException("Couldn't download the voices (${e.message}). Check the connection and tap Retry.")
                step = "Connection problem, retrying…"
                Thread.sleep(wait)
                wait = minOf(wait * 2, 30_000)
            }
        }
        error("unreachable")
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(1 shl 20)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                digest.update(buffer, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun move(from: File, to: File) {
        to.parentFile?.mkdirs()
        to.delete()
        if (!from.renameTo(to)) throw IOException("Couldn't save ${to.name}")
    }

    private fun unzip(zip: File, into: File) {
        val root = into.canonicalPath + File.separator
        ZipInputStream(zip.inputStream().buffered()).use { input ->
            while (true) {
                val entry = input.nextEntry ?: break
                val target = File(into, entry.name)
                if (!target.canonicalPath.startsWith(root)) throw IOException("Bad file in download")
                if (entry.isDirectory) {
                    target.mkdirs()
                } else {
                    target.parentFile?.mkdirs()
                    target.outputStream().use { input.copyTo(it) }
                }
            }
        }
    }
}
