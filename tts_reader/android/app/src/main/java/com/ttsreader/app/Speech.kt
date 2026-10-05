package com.ttsreader.app

import android.content.Context
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * On-device English speech synthesis via sherpa-onnx.
 * US and UK voices come from Kokoro; Australian voices come from a Piper model.
 * All methods are thread-safe.
 */
class Speech private constructor(private val context: Context) {

    enum class Accent(val label: String) { US("US"), UK("UK"), AU("Australian") }

    data class Voice(val id: String, val sid: Int, val name: String, val accent: Accent)

    val voices: List<Voice>

    private val lock = Object()
    private val engines = HashMap<Accent, OfflineTts>() // kept loaded, so switching accents is instant after first use
    private val latestEpoch = HashMap<String, Long>()
    private val cache = object : LinkedHashMap<String, ByteArray>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ByteArray>) = size > 32
    }

    init {
        val kokoro = KOKORO_SPEAKERS.mapIndexedNotNull { sid, id ->
            val accent = when (id[0]) { 'a' -> Accent.US; 'b' -> Accent.UK; else -> return@mapIndexedNotNull null }
            if (id in SKIPPED) return@mapIndexedNotNull null
            Voice(id, sid, label(id.substringAfter('_'), accent, id[1] == 'f'), accent)
        }
        val australian = AU_SPEAKERS.map { (name, sid, female) -> Voice("au_$name", sid, label(name, Accent.AU, female), Accent.AU) }
        val order = { v: Voice -> FAVORITES.indexOf(v.id).let { if (it < 0) FAVORITES.size else it } }
        voices = (kokoro + australian).sortedWith(compareBy<Voice>({ it.accent.ordinal }, order))
    }

    private fun label(name: String, accent: Accent, female: Boolean) =
        "${name.replaceFirstChar { it.uppercase() }} (${accent.label} ${if (female) "female" else "male"})"

    fun isInstalled(v: Voice) = ModelStore.isVoiceInstalled(context, v.id)

    /** The voice with [id] if its pack is downloaded, otherwise the first downloaded voice. */
    fun voice(id: String?): Voice =
        voices.firstOrNull { it.id == id && isInstalled(it) } ?: voices.firstOrNull { isInstalled(it) } ?: voices.first()

    init {
        // Voices were added or deleted: reload the models next time (a newly downloaded
        // voice's data is only read when a model loads; a deleted model frees its memory).
        ModelStore.onChange {
            synchronized(lock) {
                engines.values.forEach { it.release() }
                engines.clear()
            }
        }
    }

    /** Generates [text] at normal speed (playback applies the speed). Returns samples and sample rate. */
    fun generate(text: String, voiceId: String?): Pair<FloatArray, Int> {
        val v = voice(voiceId)
        synchronized(lock) {
            val audio = engineFor(v.accent).generate(text, v.sid, 1f)
            return audio.samples to audio.sampleRate
        }
    }

    /** Loads the engine for [voiceId] ahead of time so the first Play is quick. */
    fun warmUp(voiceId: String?) {
        synchronized(lock) { engineFor(voice(voiceId).accent) }
    }

    /**
     * Returns a WAV file, or null when the request is from before the page's latest jump
     * (the page no longer needs it, so it isn't worth making the current request wait).
     */
    fun synthesize(text: String, voiceId: String?, speed: Float, client: String, epoch: Long): ByteArray? {
        synchronized(latestEpoch) {
            if (epoch > (latestEpoch[client] ?: -1L)) latestEpoch[client] = epoch
        }
        val v = voice(voiceId)
        val s = speed.coerceIn(0.5f, 2.0f)
        val key = "${v.id}|$s|$text"
        synchronized(lock) {
            cache[key]?.let { return it }
            val latest = synchronized(latestEpoch) { latestEpoch[client] ?: epoch }
            if (epoch < latest) return null
            val audio = engineFor(v.accent).generate(text, v.sid, s)
            return toWav(audio.samples, audio.sampleRate).also { cache[key] = it }
        }
    }

    private fun engineFor(accent: Accent): OfflineTts = engines.getOrPut(accent) {
        if (voices.none { it.accent == accent && isInstalled(it) }) throw IllegalStateException("Those voices haven't been downloaded.")
        val dir = modelDir()
        val espeak = "$dir/kokoro/espeak-ng-data"
        val model = when (accent) {
            Accent.US, Accent.UK -> OfflineTtsModelConfig(
                kokoro = OfflineTtsKokoroModelConfig(
                    model = "$dir/kokoro/model.onnx",
                    voices = "$dir/kokoro/voices.bin",
                    tokens = "$dir/kokoro/tokens.txt",
                    dataDir = espeak,
                    lexicon = if (accent == Accent.US) "$dir/kokoro/lexicon-us-en.txt" else "$dir/kokoro/lexicon-gb-en.txt",
                    lang = if (accent == Accent.US) "en-us" else "en",
                ),
                numThreads = THREADS,
                debug = false,
                provider = "cpu",
            )
            Accent.AU -> OfflineTtsModelConfig(
                vits = OfflineTtsVitsModelConfig(
                    model = "$dir/au/model.onnx",
                    tokens = "$dir/au/tokens.txt",
                    dataDir = espeak,
                    noiseScale = 0.667f,
                    noiseScaleW = 0.8f,
                    lengthScale = 1.0f,
                ),
                numThreads = THREADS,
                debug = false,
                provider = "cpu",
            )
        }
        OfflineTts(config = OfflineTtsConfig(model = model, maxNumSentences = 1))
    }

    /** The downloaded models (see [ModelStore]). */
    private fun modelDir(): File {
        File(context.filesDir, "kokoro").deleteRecursively() // left over from version 1.0
        return ModelStore.dir(context)
    }

    private fun toWav(samples: FloatArray, sampleRate: Int): ByteArray {
        val dataSize = samples.size * 2
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray()); putInt(36 + dataSize); put("WAVE".toByteArray())
            put("fmt ".toByteArray()); putInt(16); putShort(1); putShort(1)
            putInt(sampleRate); putInt(sampleRate * 2); putShort(2); putShort(16)
            put("data".toByteArray()); putInt(dataSize)
        }
        val pcm = ByteBuffer.allocate(dataSize).order(ByteOrder.LITTLE_ENDIAN)
        for (x in samples) pcm.putShort((x.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
        return ByteArrayOutputStream(44 + dataSize).apply { write(header.array()); write(pcm.array()) }.toByteArray()
    }

    companion object {
        // Leave two cores for the UI and audio; flagship phones get up to 6 synthesis threads.
        private val THREADS = (Runtime.getRuntime().availableProcessors() - 2).coerceIn(2, 6)

        @Volatile private var instance: Speech? = null

        /** One shared instance, so the loaded models are reused by the page and the playback service. */
        fun get(context: Context): Speech =
            instance ?: synchronized(this) { instance ?: Speech(context.applicationContext).also { instance = it } }

        private val FAVORITES = listOf(
            "af_heart", "af_bella", "am_michael", "am_fenrir", "af_nicole", "am_puck",
            "bf_emma", "bm_george", "bm_fable",
            "au_banjo", "au_kirra", "au_tully", "au_clancy", "au_matilda",
        )
        private val SKIPPED = setOf("am_santa")

        // Speaker order of kokoro-multi-lang-v1_0 (model metadata "speaker_names").
        private val KOKORO_SPEAKERS = (
            "af_alloy,af_aoede,af_bella,af_heart,af_jessica,af_kore,af_nicole,af_nova,af_river,af_sarah,af_sky," +
                "am_adam,am_echo,am_eric,am_fenrir,am_liam,am_michael,am_onyx,am_puck,am_santa," +
                "bf_alice,bf_emma,bf_isabella,bf_lily,bm_daniel,bm_fable,bm_george,bm_lewis"
            ).split(",")

        // Speaker IDs of en_AU-librivox-medium (its voice_to_speaker.yaml): name, id, female.
        private val AU_SPEAKERS = listOf(
            Triple("clancy", 0, false), Triple("bindi", 1, true), Triple("marlo", 2, true),
            Triple("kirra", 3, true), Triple("angus", 4, false), Triple("banjo", 5, false),
            Triple("flynn", 6, false), Triple("matilda", 7, true), Triple("tully", 8, true),
            Triple("willow", 9, true),
        )
    }
}
