package com.ttsreader.app

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.text.Html
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import java.util.zip.ZipFile

/**
 * Pulls readable text out of documents: PDF (including scanned ones), EPUB, Word (.docx),
 * HTML, plain text/Markdown, and pictures of text (photos, screenshots).
 */
object TextExtractor {

    /** [usedOcr] is true when the text was read from pictures. */
    class Document(val title: String, val text: String, val usedOcr: Boolean = false)

    private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "webp", "heic", "heif", "bmp", "gif")

    /** Several files (for example a few photos of pages) read in order as one text. */
    fun extractAll(context: Context, uris: List<Uri>, progress: (String) -> Unit): Document {
        if (uris.size == 1) return extract(context, uris[0], progress)
        val docs = uris.mapIndexedNotNull { i, uri ->
            progress("Reading ${i + 1} of ${uris.size}…")
            runCatching { extract(context, uri) {} }.getOrNull()
        }
        if (docs.isEmpty()) throw IllegalStateException("No readable text found.")
        return Document(docs.first().title, docs.joinToString("\n\n") { it.text }, docs.any { it.usedOcr })
    }

    fun extract(context: Context, uri: Uri, progress: (String) -> Unit = {}): Document {
        val name = displayName(context, uri) ?: uri.lastPathSegment ?: "Document"
        val mime = context.contentResolver.getType(uri).orEmpty()
        val ext = name.substringAfterLast('.', "").lowercase()
        val title = name.substringBeforeLast('.').ifBlank { name }

        if (mime.startsWith("image/") || ext in IMAGE_EXTENSIONS) {
            progress("Reading the text in the picture…")
            val text = tidy(Ocr.readImage(context, uri))
            if (text.isEmpty()) throw IllegalStateException("No text found in that picture.")
            return Document(if (name.startsWith("photo-")) "Photo ${java.text.DateFormat.getDateTimeInstance().format(java.util.Date())}" else title, text, usedOcr = true)
        }

        // Zip-based formats need random access, so work from a temporary copy.
        val tmp = File.createTempFile("import", ".$ext", context.cacheDir)
        try {
            context.contentResolver.openInputStream(uri)!!.use { input -> tmp.outputStream().use { input.copyTo(it) } }
            var usedOcr = false
            val text = when {
                ext == "pdf" || mime == "application/pdf" -> pdf(context, tmp).ifBlank {
                    // No text layer: a scanned PDF. Read the page images instead.
                    usedOcr = true
                    Ocr.readScannedPdf(tmp, progress)
                }
                ext == "epub" || mime == "application/epub+zip" -> epub(tmp)
                ext == "docx" || mime.contains("wordprocessingml") -> docx(tmp)
                ext in setOf("html", "htm", "xhtml") || mime.contains("html") -> html(tmp.readText())
                else -> decodeText(tmp.readBytes())
            }
            val cleaned = tidy(text)
            if (cleaned.isEmpty()) throw IllegalStateException("No readable text found.")
            return Document(title, cleaned, usedOcr)
        } finally {
            tmp.delete()
        }
    }

    private fun tidy(text: String) = text.replace("\r\n", "\n").replace(Regex("[ \\t\\u00A0]+\\n"), "\n")
        .replace(Regex("\\n{3,}"), "\n\n").trim()

    /** Joins hard-wrapped lines into one paragraph, rejoining words split with a hyphen. */
    internal fun joinLines(lines: List<String>): String {
        val sb = StringBuilder()
        for (line in lines.map { it.trim() }.filter { it.isNotEmpty() }) {
            when {
                sb.isEmpty() -> sb.append(line)
                // "exam-" + "ple" -> "example" (a word split across lines)
                sb.endsWith("-") && line.first().isLowerCase() -> sb.setLength(sb.length - 1).also { sb.append(line) }
                else -> sb.append(' ').append(line)
            }
        }
        return sb.toString()
    }

    private fun displayName(context: Context, uri: Uri): String? = runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull()

    private fun decodeText(bytes: ByteArray): String {
        if (bytes.size >= 2 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xFE.toByte()) return String(bytes, Charsets.UTF_16LE).drop(1)
        if (bytes.size >= 2 && bytes[0] == 0xFE.toByte() && bytes[1] == 0xFF.toByte()) return String(bytes, Charsets.UTF_16BE).drop(1)
        return String(bytes, Charsets.UTF_8).removePrefix("\uFEFF")
    }

    private fun pdf(context: Context, file: File): String {
        PDFBoxResourceLoader.init(context.applicationContext)
        PDDocument.load(file).use { doc ->
            val stripper = PDFTextStripper().apply {
                sortByPosition = true
                paragraphStart = "\n"
                paragraphEnd = "\n"
            }
            // PDF lines are hard-wrapped: join lines inside a paragraph, keep blank-line breaks.
            val raw = stripper.getText(doc)
            return raw.split(Regex("\\n\\s*\\n")).joinToString("\n\n") { joinLines(it.lines()) }
        }
    }

    private fun html(source: String): String {
        val body = source
            .replace(Regex("(?is)<head\\b.*?</head>"), "")
            .replace(Regex("(?is)<(script|style|noscript)\\b.*?</\\1>"), "")
            .replace(Regex("(?i)<br\\s*/?>"), "\n")
            .replace(Regex("(?i)</(p|div|h[1-6]|li|blockquote|tr|section|article)>"), "$0\n\n")
        return Html.fromHtml(body, Html.FROM_HTML_MODE_LEGACY).toString()
            .replace('\uFFFC', ' ') // image placeholders
    }

    internal fun epub(file: File, toText: (String) -> String = ::html): String {
        ZipFile(file).use { zip ->
            fun read(path: String) = zip.getEntry(path)?.let { e -> zip.getInputStream(e).use { String(it.readBytes(), Charsets.UTF_8) } }
            val container = read("META-INF/container.xml") ?: throw IllegalStateException("Not a valid EPUB file.")
            val opfPath = Regex("full-path=\"([^\"]+)\"").find(container)?.groupValues?.get(1)
                ?: throw IllegalStateException("Not a valid EPUB file.")
            val opf = read(opfPath) ?: throw IllegalStateException("Not a valid EPUB file.")
            val base = opfPath.substringBeforeLast('/', "").let { if (it.isEmpty()) "" else "$it/" }

            val manifest = HashMap<String, String>()
            for (item in Regex("(?s)<item\\b[^>]*>").findAll(opf)) {
                val tag = item.value
                val id = Regex("\\bid=\"([^\"]+)\"").find(tag)?.groupValues?.get(1) ?: continue
                val href = Regex("\\bhref=\"([^\"]+)\"").find(tag)?.groupValues?.get(1) ?: continue
                manifest[id] = href
            }
            val order = Regex("<itemref\\b[^>]*\\bidref=\"([^\"]+)\"").findAll(opf).map { it.groupValues[1] }.toList()
            return order.mapNotNull { id ->
                val href = manifest[id] ?: return@mapNotNull null
                val path = normalize(base + percentDecode(href.substringBefore('#')))
                read(path)?.let { toText(it).trim() }?.takeIf { it.isNotEmpty() }
            }.joinToString("\n\n")
        }
    }

    /** "chapter%202.xhtml" -> "chapter 2.xhtml" (UTF-8 percent-encoding, no '+' handling: these are paths). */
    private fun percentDecode(s: String): String {
        if ('%' !in s) return s
        val out = java.io.ByteArrayOutputStream()
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (c == '%' && i + 2 < s.length) {
                val hex = s.substring(i + 1, i + 3).toIntOrNull(16)
                if (hex != null) {
                    out.write(hex)
                    i += 3
                    continue
                }
            }
            out.write(c.toString().toByteArray(Charsets.UTF_8))
            i++
        }
        return out.toString("UTF-8")
    }

    private fun normalize(path: String): String {
        val parts = ArrayList<String>()
        for (p in path.split('/')) {
            when (p) {
                "", "." -> {}
                ".." -> if (parts.isNotEmpty()) parts.removeAt(parts.size - 1)
                else -> parts.add(p)
            }
        }
        return parts.joinToString("/")
    }

    internal fun docx(file: File): String {
        ZipFile(file).use { zip ->
            val xml = zip.getEntry("word/document.xml")?.let { e -> zip.getInputStream(e).use { String(it.readBytes(), Charsets.UTF_8) } }
                ?: throw IllegalStateException("Not a valid Word document.")
            return Regex("(?s)<w:p[ >].*?</w:p>").findAll(xml).map { p ->
                Regex("(?s)<w:t(?:\\s[^>]*)?>(.*?)</w:t>|<w:tab/>|<w:br/>").findAll(p.value).joinToString("") { m ->
                    when {
                        m.value == "<w:tab/>" -> " "
                        m.value == "<w:br/>" -> "\n"
                        else -> unescapeXml(m.groupValues[1])
                    }
                }.trim()
            }.filter { it.isNotEmpty() }.joinToString("\n\n")
        }
    }

    private fun unescapeXml(s: String) = s
        .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'")
        .replace(Regex("&#(\\d+);")) { it.groupValues[1].toInt().toChar().toString() }
        .replace(Regex("&#x([0-9a-fA-F]+);")) { it.groupValues[1].toInt(16).toChar().toString() }
        .replace("&amp;", "&")
}
