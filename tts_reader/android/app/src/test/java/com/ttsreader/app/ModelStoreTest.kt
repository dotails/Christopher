package com.ttsreader.app

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.ServerSocket
import java.nio.file.Files
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.concurrent.thread
import kotlin.random.Random

class ModelStoreTest {
    private fun sha(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }

    @Test
    fun downloadsResumesAfterDroppedConnectionAndUnpacks() {
        val model = Random(1).nextBytes(3_000_000)
        val voices = Random(2).nextBytes(500_000)
        val au = Random(3).nextBytes(700_000)
        fun zipOf(name: String, text: String) = ByteArrayOutputStream().also { bytes ->
            ZipOutputStream(bytes).use { z -> z.putNextEntry(ZipEntry(name)); z.write(text.toByteArray()); z.closeEntry() }
        }.toByteArray()
        val files = mapOf(
            "common.zip" to zipOf("kokoro/espeak-ng-data/en_dict", "dict"),
            "kokoro-model.onnx" to model, "kokoro-voices.bin" to voices, "kokoro-extras.zip" to zipOf("kokoro/tokens.txt", "a 1\n"),
            "au-model.onnx" to au, "au-extras.zip" to zipOf("au/tokens.txt", "b 2\n"),
        )
        val packOf = mapOf("common.zip" to "common", "au-model.onnx" to "au", "au-extras.zip" to "au")
        val manifest = files.entries.joinToString("") { (name, b) -> "${sha(b)} ${b.size} $name ${packOf[name] ?: "kokoro"}\n" }.toByteArray()
        val requested = ArrayList<String>()

        // A tiny HTTP server: supports Range, and drops the first download of the big file a third of the way in.
        var dropped = false
        val ranges = ArrayList<String>()
        val server = ServerSocket(0)
        thread(isDaemon = true) {
            while (!server.isClosed) {
                val socket = runCatching { server.accept() }.getOrNull() ?: break
                socket.use { s ->
                    val reader = s.getInputStream().bufferedReader()
                    val path = reader.readLine().split(" ")[1].removePrefix("/")
                    var range: String? = null
                    while (true) {
                        val line = reader.readLine() ?: break
                        if (line.isEmpty()) break
                        if (line.startsWith("Range:", ignoreCase = true)) range = line.substringAfter(":").trim()
                    }
                    val body = if (path == "manifest.txt") manifest else files.getValue(path)
                    requested.add(path)
                    val out = s.getOutputStream()
                    if (range != null) {
                        ranges.add("$path $range")
                        val start = range.removePrefix("bytes=").removeSuffix("-").toInt()
                        out.write(("HTTP/1.1 206 Partial Content\r\nContent-Length: ${body.size - start}\r\n" +
                            "Content-Range: bytes $start-${body.size - 1}/${body.size}\r\nConnection: close\r\n\r\n").toByteArray())
                        out.write(body, start, body.size - start)
                    } else {
                        out.write("HTTP/1.1 200 OK\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray())
                        if (path == "kokoro-model.onnx" && !dropped) {
                            dropped = true
                            out.write(body, 0, body.size / 3)
                        } else {
                            out.write(body)
                        }
                    }
                    out.flush()
                }
            }
        }
        try {
            val dir = Files.createTempDirectory("models").toFile()
            val base = "http://127.0.0.1:${server.localPort}/"

            // Just the Australian pack first: only its files and the shared data are fetched.
            ModelStore.downloadInto(dir, base, setOf("au"))
            assertEquals(listOf("manifest.txt", "common.zip", "au-model.onnx", "au-extras.zip"), requested)
            assertArrayEquals(au, File(dir, "au/model.onnx").readBytes())
            assertEquals("dict", File(dir, "kokoro/espeak-ng-data/en_dict").readText())
            assertEquals(true, File(dir, ".pack-au").exists() && File(dir, ".pack-common").exists())
            assertEquals(false, File(dir, ".pack-kokoro").exists())

            // Then US & UK: the shared data isn't fetched again.
            requested.clear()
            ModelStore.downloadInto(dir, base, setOf("kokoro"))
            assertEquals(listOf("manifest.txt", "kokoro-model.onnx", "kokoro-model.onnx", "kokoro-voices.bin", "kokoro-extras.zip"), requested)
            assertEquals(true, File(dir, ".pack-kokoro").exists())
            assertArrayEquals(model, File(dir, "kokoro/model.onnx").readBytes())
            assertArrayEquals(voices, File(dir, "kokoro/voices.bin").readBytes())
            assertArrayEquals(au, File(dir, "au/model.onnx").readBytes())
            assertEquals("a 1\n", File(dir, "kokoro/tokens.txt").readText())
            assertEquals("b 2\n", File(dir, "au/tokens.txt").readText())
            assertEquals(false, File(dir, ".download").exists())
            // The dropped file was resumed from where it stopped, not started over.
            assertEquals(listOf("kokoro-model.onnx bytes=1000000-"), ranges)
        } finally {
            server.close()
        }
    }
}
