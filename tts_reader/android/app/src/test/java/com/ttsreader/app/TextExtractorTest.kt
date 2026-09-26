package com.ttsreader.app

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class TextExtractorTest {
    private fun resource(name: String) = File(javaClass.classLoader!!.getResource(name).toURI())

    @Test
    fun readsWordParagraphs() {
        assertEquals(
            "Chapter One\n\nFish & chips cost £5 <today>.\n\nSecond paragraph with a tab.",
            TextExtractor.docx(resource("sample.docx")),
        )
    }

    @Test
    fun readsEpubChaptersInSpineOrder() {
        val stripTags = { html: String -> html.replace(Regex("<[^>]+>"), "") }
        assertEquals("First chapter.\n\nSecond chapter.", TextExtractor.epub(resource("sample.epub"), stripTags))
    }
}
