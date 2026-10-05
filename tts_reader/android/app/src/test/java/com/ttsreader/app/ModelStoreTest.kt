package com.ttsreader.app

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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

    private fun zipOf(name: String, text: String) = ByteArrayOutputStream().also { bytes ->
        ZipOutputStream(bytes).use { z -> z.putNextEntry(ZipEntry(name)); z.write(text.toByteArray()); z.closeEntry() }
    }.toByteArray()

    private val voiceSize = 510 * 256 * 4
    private val model = Random(1).nextBytes(3_000_000)
    private val au = Random(3).nextBytes(700_000)
    private val heart = Random(4).nextBytes(voiceSize)
    private val george = Random(5).nextBytes(voiceSize)
    private val bella = Random(6).nextBytes(voiceSize)
    private val files = mapOf(
        "common.zip" to zipOf("kokoro/espeak-ng-data/en_dict", "dict"),
        "kokoro-model.onnx" to model,
        "kokoro-extras.zip" to zipOf("kokoro/tokens.txt", "a 1\n"),
        "au-model.onnx" to au,
        "au-extras.zip" to zipOf("au/tokens.txt", "b 2\n"),
        "voice-af_bella.bin" to bella,
        "voice-af_heart.bin" to heart,
        "voice-bm_george.bin" to george,
    )
    private val parts = mapOf(
        "common.zip" to "common", "kokoro-model.onnx" to "kokoro", "kokoro-extras.zip" to "kokoro",
        "au-model.onnx" to "au", "au-extras.zip" to "au",
        "voice-af_bella.bin" to "voice:af_bella 2", "voice-af_heart.bin" to "voice:af_heart 3", "voice-bm_george.bin" to "voice:bm_george 26",
    )
    private val manifest = files.entries.joinToString("") { (name, b) ->
        val (part, sid) = parts.getValue(name).split(" ").let { it[0] to it.getOrNull(1) }
        "${sha(b)} ${b.size} $name $part${sid?.let { " " + it.toInt() * voiceSize } ?: ""}\n"
    }.toByteArray()

    /** A tiny HTTP server: supports Range, and drops the first download of the big model a third of the way in. */
    private fun serve(requested: MutableList<String>, ranges: MutableList<String>): ServerSocket {
        var dropped = false
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
                    requested.add(path)
                    val body = if (path == "manifest.txt") manifest else files.getValue(path)
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
        return server
    }

    @Test
    fun downloadsVoicesOneByOne() {
        val requested = ArrayList<String>()
        val ranges = ArrayList<String>()
        val server = serve(requested, ranges)
        try {
            val dir = Files.createTempDirectory("models").toFile()
            val base = "http://127.0.0.1:${server.localPort}/"

            // An Australian voice: the shared data and the Australian model only.
            ModelStore.downloadInto(dir, base, setOf("au_banjo"))
            assertEquals(listOf("manifest.txt", "common.zip", "au-model.onnx", "au-extras.zip"), requested)
            assertArrayEquals(au, File(dir, "au/model.onnx").readBytes())
            assertEquals("dict", File(dir, "kokoro/espeak-ng-data/en_dict").readText())
            assertEquals(setOf("au_banjo"), File(dir, "voices.txt").readLines().toSet())

            // Two US/UK voices: the Kokoro model (resumed after the drop) and just those two voices.
            requested.clear()
            ModelStore.downloadInto(dir, base, setOf("af_heart", "bm_george"))
            assertEquals(
                listOf("manifest.txt", "kokoro-model.onnx", "kokoro-model.onnx", "kokoro-extras.zip", "voice-af_heart.bin", "voice-bm_george.bin"),
                requested,
            )
            assertEquals(listOf("kokoro-model.onnx bytes=1000000-"), ranges)
            assertArrayEquals(model, File(dir, "kokoro/model.onnx").readBytes())
            val bin = File(dir, "kokoro/voices.bin").readBytes()
            assertEquals(54 * voiceSize, bin.size)
            assertArrayEquals(heart, bin.copyOfRange(3 * voiceSize, 4 * voiceSize))
            assertArrayEquals(george, bin.copyOfRange(26 * voiceSize, 27 * voiceSize))
            assertTrue(bin.copyOfRange(2 * voiceSize, 3 * voiceSize).all { it == 0.toByte() }) // Bella not downloaded
            assertEquals(setOf("au_banjo", "af_heart", "bm_george"), File(dir, "voices.txt").readLines().toSet())
            assertEquals(false, File(dir, ".download").exists())
        } finally {
            server.close()
        }
    }

    @Test
    fun earlierVersionsKeepTheirVoices() {
        val requested = ArrayList<String>()
        val server = serve(requested, ArrayList())
        try {
            // A phone from versions 2-9: everything was installed at once.
            val dir = Files.createTempDirectory("models").toFile()
            File(dir, "kokoro").mkdirs()
            File(dir, ".complete-v2").createNewFile()
            ModelStore.downloadInto(dir, "http://127.0.0.1:${server.localPort}/", setOf("af_bella"))
            assertEquals(listOf("manifest.txt", "voice-af_bella.bin"), requested) // shared parts already there
            assertEquals(setOf("*kokoro", "*au", "af_bella"), File(dir, "voices.txt").readLines().toSet())
            assertTrue(File(dir, ".part-common").exists() && File(dir, ".part-kokoro").exists() && File(dir, ".part-au").exists())
        } finally {
            server.close()
        }
    }
}
