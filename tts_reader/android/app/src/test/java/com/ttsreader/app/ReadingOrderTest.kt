package com.ttsreader.app

import com.ttsreader.app.ReadingOrder.Box
import org.junit.Assert.assertEquals
import org.junit.Test

class ReadingOrderTest {

    @Test
    fun twoColumnsWithTitleAndFootnote() {
        // A title across the top, two columns whose paragraph breaks line up, a footnote across the bottom.
        val page = listOf(
            Box(100, 900, 1100, 960, "* A footnote across the page."),
            Box(620, 120, 1100, 400, "Right column, first paragraph."),
            Box(100, 120, 580, 400, "Left column, first paragraph."),
            Box(100, 30, 1100, 80, "The Title"),
            Box(620, 420, 1100, 800, "Right column, second paragraph."),
            Box(100, 420, 580, 800, "Left column, second paragraph."),
        )
        assertEquals(
            listOf(
                "The Title",
                "Left column, first paragraph.", "Left column, second paragraph.",
                "Right column, first paragraph.", "Right column, second paragraph.",
                "* A footnote across the page.",
            ),
            ReadingOrder.paragraphs(page),
        )
    }

    @Test
    fun twoFacingPagesSkipPageNumbersAndRejoinASentenceAcrossTheSpine() {
        val spread = listOf(
            Box(1400, 1500, 1460, 1540, "57"),
            Box(80, 1500, 140, 1540, "56"),
            Box(1100, 100, 2000, 700, "page and carried on."),
            Box(80, 100, 980, 700, "It began on the left page."),
            Box(1100, 750, 2000, 1400, "A new paragraph."),
            Box(80, 750, 980, 1400, "The sentence ran right to the bottom of the"),
        )
        assertEquals(
            listOf("It began on the left page.", "The sentence ran right to the bottom of the page and carried on.", "A new paragraph."),
            ReadingOrder.paragraphs(spread),
        )
    }

    @Test
    fun wordHyphenatedAcrossColumns() {
        val page = listOf(
            Box(620, 100, 1100, 400, "ful day. The end."),
            Box(100, 100, 580, 400, "It was a beauti-"),
        )
        assertEquals(listOf("It was a beautiful day. The end."), ReadingOrder.paragraphs(page))
    }

    @Test
    fun singleColumnStaysInOrder() {
        val page = listOf(
            Box(100, 500, 1000, 700, "Third."),
            Box(100, 100, 1000, 280, "First paragraph, which"),
            Box(100, 300, 1000, 480, "continues here. Second part."),
        )
        assertEquals(listOf("First paragraph, which continues here. Second part.", "Third."), ReadingOrder.paragraphs(page))
    }
}
