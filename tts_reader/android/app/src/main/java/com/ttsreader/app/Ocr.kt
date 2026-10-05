package com.ttsreader.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File

/** Reads text from pictures on the phone (ML Kit's bundled, offline Latin-script model). */
object Ocr {

    private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

    /** Text in a photo or screenshot. EXIF rotation is applied, so sideways photos read correctly. */
    fun readImage(context: Context, uri: Uri): String = read(InputImage.fromFilePath(context, uri))

    /** Text in a scanned PDF (pages that are pictures), one page at a time. */
    fun readScannedPdf(file: File, progress: (String) -> Unit): String {
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
            PdfRenderer(fd).use { pdf ->
                val pages = ArrayList<String>()
                for (i in 0 until pdf.pageCount) {
                    progress("Reading scanned page ${i + 1} of ${pdf.pageCount}…")
                    pdf.openPage(i).use { page ->
                        // About 2x the page's point size: sharp enough for body text.
                        val scale = minOf(2.5f, 2400f / page.width)
                        val bitmap = Bitmap.createBitmap((page.width * scale).toInt(), (page.height * scale).toInt(), Bitmap.Config.ARGB_8888)
                        bitmap.eraseColor(Color.WHITE)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        pages.add(read(InputImage.fromBitmap(bitmap, 0)))
                        bitmap.recycle()
                    }
                }
                return pages.filter { it.isNotBlank() }.joinToString("\n\n")
            }
        }
    }

    private fun read(image: InputImage): String = paragraphs(Tasks.await(recognizer.process(image)))

    /** ML Kit's blocks are roughly paragraphs; their lines are joined back into flowing text. */
    private fun paragraphs(result: Text): String =
        result.textBlocks.map { block -> TextExtractor.joinLines(block.lines.map { it.text }) }
            .filter { it.isNotBlank() }
            .joinToString("\n\n")
}
