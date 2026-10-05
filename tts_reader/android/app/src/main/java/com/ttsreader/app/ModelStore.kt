package com.ttsreader.app

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.ZipInputStream
import kotlin.concurrent.thread

/**
 * The voices aren't inside the APK, so the app stays small enough to download reliably.
 * They come in packs, downloaded (and deleted) from the app, from this repository's
 * "tts-reader-models" release: resumable, retried automatically, and checked against
 * the SHA-256 sums in its manifest.
 *
 * - "kokoro": the 27 US and UK voices, which all share one model (about 355 MB).
 * - "au": the 10 Australian voices, which share a smaller model (about 80 MB).
 * - "common": pronunciation data both need (about 3 MB), fetched with either.
 *
 * Phones that already have the voices from an earlier version (copied out of a bigger
 * APK into the same folder) keep them: both packs count as installed.
 */
object ModelStore {

    enum class Pack(val id: String) { KOKORO("kokoro"), AU("au") }

    private const val BASE = "https://github.com/dotails/Christopher/releases/download/tts-reader-models/"
    private const val COMMON = "common"

    class Status(val installed: Set<String>, val running: Set<String>, val done: Long, val total: Long, val step: String, val error: String)

    @Volatile private var running: Set<String> = emptySet()
    @Volatile private var done = 0L
    @Volatile private var total = 0L
    @Volatile private var step = ""
    @Volatile private var error = ""
    private val listeners = ArrayList<() -> Unit>()

    fun dir(context: Context) = File(context.filesDir, "models")

    private fun marker(context: Context, id: String) = File(dir(context), ".pack-$id")

    /** Versions 2 to 8 installed everything at once and left this marker. */
    private fun migrate(context: Context) {
        val legacy = File(dir(context), ".complete-v2")
        if (legacy.exists()) {
            for (id in listOf(COMMON, Pack.KOKORO.id, Pack.AU.id)) marker(context, id).createNewFile()
            legacy.delete()
        }
    }

    fun isInstalled(context: Context, pack: Pack): Boolean {
        migrate(context)
        return marker(context, COMMON).exists() && marker(context, pack.id).exists()
    }

    fun anyInstalled(context: Context) = Pack.entries.any { isInstalled(context, it) }

    /** True once a download was asked for and hasn't finished, so it resumes on the next launch. */
    fun pendingRequest(context: Context): Set<String> =
        File(context.filesDir, "models-download-requested").takeIf { it.exists() }?.readText()
            ?.split(",")?.filter { it.isNotBlank() }?.toSet().orEmpty()

    fun status(context: Context) = Status(
        Pack.entries.filter { isInstalled(context, it) }.map { it.id }.toSet(), running, done, total, step, error,
    )

    /** Called (on a background thread) whenever packs are installed or deleted. */
    fun onChange(action: () -> Unit) {
        synchronized(listeners) { listeners.add(action) }
    }

    private fun changed() = synchronized(listeners) { ArrayList(listeners) }.forEach { runCatching { it() } }

    /** Downloads the given packs (ids), skipping any already installed. */
    @Synchronized
    fun start(context: Context, packs: Set<String>) {
        if (running.isNotEmpty()) return
        val app = context.applicationContext
        val wanted = Pack.entries.filter { it.id in packs && !isInstalled(app, it) }.map { it.id }.toSet()
        if (wanted.isEmpty()) return
        running = wanted
        error = ""
        done = 0
        total = 0
        File(app.filesDir, "models-download-requested").writeText(wanted.joinToString(","))
        thread(name = "model-download") {
            try {
                downloadInto(dir(app), BASE, wanted)
                File(app.filesDir, "models-download-requested").delete()
                step = "Done"
            } catch (e: Throwable) {
                error = e.message ?: e.toString()
            } finally {
                running = emptySet()
                changed()
            }
        }
    }

    /** Deletes a pack's files. The shared data goes too once no pack is left. */
    @Synchronized
    fun delete(context: Context, pack: Pack) {
        if (pack.id in running) return
        val models = dir(context)
        marker(context, pack.id).delete()
        when (pack) {
            Pack.KOKORO -> File(models, "kokoro").listFiles()?.filter { it.name != "espeak-ng-data" }?.forEach { it.deleteRecursively() }
            Pack.AU -> File(models, "au").deleteRecursively()
        }
        if (!anyInstalled(context)) {
            marker(context, COMMON).delete()
            File(models, "kokoro").deleteRecursively()
        }
        changed()
    }

    private class Item(val sha256: String, val size: Long, val name: String, val pack: String)

    /** Downloads and unpacks [packs] (plus the shared data if it's missing) into [models]. */
    internal fun downloadInto(models: File, base: String, packs: Set<String>) {
        val staging = File(models, ".download").apply { mkdirs() }

        // manifest.txt lines: "<sha256> <size> <file name> <pack>"
        step = "Checking what to download…"
        val needCommon = !File(models, ".pack-$COMMON").exists()
        val items = withRetries { URL(base + "manifest.txt").readText() }
            .lines().filter { it.isNotBlank() }
            .map { line -> line.trim().split(Regex("\\s+")).let { Item(it[0], it[1].toLong(), it[2], it[3]) } }
            .filter { it.pack in packs || (it.pack == COMMON && needCommon) }
        total = items.sumOf { it.size }

        var finished = 0L
        for (item in items) {
            val part = File(staging, item.name)
            step = "Downloading ${item.name}"
            fetch(base + item.name, part, item.size) { have -> done = finished + have }
            step = "Checking ${item.name}"
            if (sha256(part) != item.sha256) {
                part.delete()
                throw IOException("${item.name} was corrupted in transit. Tap Retry.")
            }
            finished += item.size
            done = finished
        }

        // Install pack by pack: the shared data first, then each pack's files, then its marker.
        step = "Unpacking…"
        for (pack in listOf(COMMON) + packs) {
            val packItems = items.filter { it.pack == pack }
            if (packItems.isEmpty()) continue
            for (item in packItems) {
                val part = File(staging, item.name)
                when {
                    item.name == "kokoro-model.onnx" -> move(part, File(models, "kokoro/model.onnx"))
                    item.name == "kokoro-voices.bin" -> move(part, File(models, "kokoro/voices.bin"))
                    item.name == "au-model.onnx" -> move(part, File(models, "au/model.onnx"))
                    item.name.endsWith(".zip") -> unzip(part, models).also { part.delete() }
                }
            }
            File(models, ".pack-$pack").createNewFile()
        }
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
