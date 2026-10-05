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
 * The voice models (about 430 MB) aren't inside the APK, so the app stays small enough
 * to download reliably. They're fetched once, on first launch, from this repository's
 * "tts-reader-models" release: resumable, retried automatically, and checked against
 * the SHA-256 sums in its manifest.
 *
 * Phones that already have the models from an earlier version (which copied them out
 * of a bigger APK into the same folder) are ready straight away.
 */
object ModelStore {

    /** Same folder layout and files as the copies made by versions 2 to 8. */
    private const val VERSION = 2
    private const val BASE = "https://github.com/dotails/Christopher/releases/download/tts-reader-models/"

    class Status(val ready: Boolean, val running: Boolean, val done: Long, val total: Long, val step: String, val error: String)

    @Volatile private var running = false
    @Volatile private var done = 0L
    @Volatile private var total = 0L
    @Volatile private var step = ""
    @Volatile private var error = ""
    private val listeners = ArrayList<() -> Unit>()

    fun dir(context: Context) = File(context.filesDir, "models")

    fun isReady(context: Context) = File(dir(context), ".complete-v$VERSION").exists()

    /** True once the user has asked for the download, so an interrupted one resumes on the next launch. */
    fun wasRequested(context: Context) = File(context.filesDir, "models-download-requested").exists()

    fun status(context: Context) = Status(isReady(context), running, done, total, step, error)

    /** Runs [action] (once) when the models become ready. */
    fun whenReady(context: Context, action: () -> Unit) {
        synchronized(listeners) {
            if (isReady(context)) action() else listeners.add(action)
        }
    }

    @Synchronized
    fun start(context: Context) {
        if (running || isReady(context)) return
        running = true
        error = ""
        val app = context.applicationContext
        File(app.filesDir, "models-download-requested").createNewFile()
        thread(name = "model-download") {
            try {
                download(app)
                File(dir(app), ".complete-v$VERSION").createNewFile()
                step = "Done"
                val ready = synchronized(listeners) { ArrayList(listeners).also { listeners.clear() } }
                ready.forEach { runCatching { it() } }
            } catch (e: Throwable) {
                error = e.message ?: e.toString()
            } finally {
                running = false
            }
        }
    }

    private class Item(val name: String, val size: Long, val sha256: String)

    private fun download(context: Context) = downloadInto(dir(context), BASE)

    internal fun downloadInto(models: File, base: String) {
        val staging = File(models, ".download").apply { mkdirs() }

        // manifest.txt lines: "<sha256> <size> <name>"
        step = "Checking what to download…"
        val manifest = withRetries { URL(base + "manifest.txt").readText() }
            .lines().filter { it.isNotBlank() }
            .map { line -> line.trim().split(Regex("\\s+")).let { Item(it[2], it[1].toLong(), it[0]) } }
        total = manifest.sumOf { it.size }

        var finished = 0L
        for (item in manifest) {
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

        step = "Unpacking…"
        for (item in manifest) {
            val part = File(staging, item.name)
            when (item.name) {
                "kokoro-model.onnx" -> move(part, File(models, "kokoro/model.onnx"))
                "kokoro-voices.bin" -> move(part, File(models, "kokoro/voices.bin"))
                "au-model.onnx" -> move(part, File(models, "au/model.onnx"))
                else -> if (item.name.endsWith(".zip")) {
                    unzip(part, models)
                    part.delete()
                }
            }
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
