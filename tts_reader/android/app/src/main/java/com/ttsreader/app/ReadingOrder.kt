package com.ttsreader.app

/**
 * Puts text blocks recognized in a photo into reading order, for pages with columns
 * and photos of two facing pages.
 *
 * Recursive XY-cut: within a region, a vertical gap that no block crosses (a column
 * gutter or a book's spine) splits it into left then right; otherwise a horizontal gap
 * splits it into top then bottom (a title above columns, a footnote below them). Vertical
 * gaps are tried first so a column is read to the end before the next one starts, even
 * when paragraph breaks happen to line up across columns.
 */
object ReadingOrder {

    data class Box(val left: Int, val top: Int, val right: Int, val bottom: Int, val text: String)

    /** Paragraph texts in reading order, with page numbers dropped and split paragraphs rejoined. */
    fun paragraphs(boxes: List<Box>): List<String> {
        val body = boxes.filter { it.text.isNotBlank() && !isPageNumber(it.text) }
        if (body.isEmpty()) return emptyList()
        val width = body.maxOf { it.right } - body.minOf { it.left }
        val ordered = order(body, minGap = maxOf(4, width / 60))
        return rejoin(ordered.map { it.text.trim() })
    }

    private fun isPageNumber(text: String) =
        Regex("""^\s*(?:page\s+)?\d{1,4}\s*$|^\s*[-–]\s*\d{1,4}\s*[-–]\s*$""", RegexOption.IGNORE_CASE).matches(text)

    internal fun order(boxes: List<Box>, minGap: Int): List<Box> {
        if (boxes.size <= 1) return boxes
        splitAt(boxes, vertical = true, minGap)?.let { (first, second) -> return order(first, minGap) + order(second, minGap) }
        splitAt(boxes, vertical = false, minGap = 1)?.let { (first, second) -> return order(first, minGap) + order(second, minGap) }
        return boxes.sortedWith(compareBy({ it.top }, { it.left }))
    }

    /**
     * The widest gap in the boxes' projection onto one axis (x for [vertical]), if at least
     * [minGap] wide: the boxes before it and after it.
     */
    private fun splitAt(boxes: List<Box>, vertical: Boolean, minGap: Int): Pair<List<Box>, List<Box>>? {
        val spans = boxes.map { if (vertical) it.left to it.right else it.top to it.bottom }.sortedBy { it.first }
        var reach = spans.first().second
        var bestGap = 0
        var bestAt = 0
        for (span in spans.drop(1)) {
            val gap = span.first - reach
            if (gap > bestGap) {
                bestGap = gap
                bestAt = span.first
            }
            reach = maxOf(reach, span.second)
        }
        if (bestGap < minGap) return null
        val (first, second) = boxes.partition { (if (vertical) it.left else it.top) < bestAt }
        return if (first.isEmpty() || second.isEmpty()) null else first to second
    }

    /**
     * A paragraph that runs from the bottom of one column (or page) to the top of the next
     * comes back as two blocks. Join them when the first doesn't end a sentence and the
     * next carries on in lower case.
     */
    private fun rejoin(texts: List<String>): List<String> {
        val out = ArrayList<String>()
        for (text in texts) {
            val prev = out.lastOrNull()
            val continues = prev != null && !Regex("""[.!?:;…"”’)\]]$""").containsMatchIn(prev) &&
                (text.first().isLowerCase() || prev.endsWith("-"))
            if (continues) out[out.size - 1] = TextExtractor.joinLines(listOf(prev!!, text)) else out.add(text)
        }
        return out
    }
}
