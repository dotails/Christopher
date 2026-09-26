package com.ttsreader.app

import android.content.Context
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** On-device Kokoro speech synthesis via sherpa-onnx. All methods are thread-safe. */
class Speech(private val context: Context) {

    data class Voice(val id: String, val sid: Int, val name: String, val lang: Lang)

    /** One engine is loaded at a time; switching language reloads it (a few seconds). */
    enum class Lang(val espeak: String, val lexicon: String, val label: String) {
        US("en-us", "lexicon-us-en.txt", "US"),
        UK("en", "lexicon-gb-en.txt", "UK"),
        ES("es", "", "Spanish"),
        FR("fr", "", "French"),
        HI("hi", "", "Hindi"),
        IT("it", "", "Italian"),
        PT("pt-br", "", "Portuguese"),
    }

    val voices: List<Voice>

    private val lock = Object()
    private var engine: OfflineTts? = null
    private var engineLang: Lang? = null
    private val latestEpoch = HashMap<String, Long>()
    private val cache = object : LinkedHashMap<String, ByteArray>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ByteArray>) = size > 32
    }

    init {
        val byPrefix = mapOf(
            'a' to Lang.US, 'b' to Lang.UK, 'e' to Lang.ES, 'f' to Lang.FR,
            'h' to Lang.HI, 'i' to Lang.IT, 'p' to Lang.PT,
        )
        // Speaker IDs are the positions in the model's speaker list (see its metadata).
        val all = SPEAKERS.mapIndexedNotNull { sid, id ->
            val lang = byPrefix[id[0]] ?: return@mapIndexedNotNull null
            val gender = if (id[1] == 'f') "female" else "male"
            val name = id.substringAfter('_').replaceFirstChar { it.uppercase() }
            Voice(id, sid, "$name (${lang.label} $gender)", lang)
        }
        voices = all.sortedBy { v -> FAVORITES.indexOf(v.id).let { if (it < 0) FAVORITES.size else it } }
    }

    fun voice(id: String?): Voice = voices.firstOrNull { it.id == id } ?: voices.first()

    /** Loads the engine for [voiceId] ahead of time so the first Play is quick. */
    fun warmUp(voiceId: String?) {
        synchronized(lock) { engineFor(voice(voiceId).lang) }
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
            val audio = engineFor(v.lang).generate(text, v.sid, s)
            return toWav(audio.samples, audio.sampleRate).also { cache[key] = it }
        }
    }

    private fun engineFor(lang: Lang): OfflineTts {
        engine?.let { if (engineLang == lang) return it }
        engine?.release()
        engine = null
        val dir = modelDir()
        val config = OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                kokoro = OfflineTtsKokoroModelConfig(
                    model = "$dir/model.int8.onnx",
                    voices = "$dir/voices.bin",
                    tokens = "$dir/tokens.txt",
                    dataDir = "$dir/espeak-ng-data",
                    lexicon = if (lang.lexicon.isEmpty()) "" else "$dir/${lang.lexicon}",
                    lang = lang.espeak,
                ),
                numThreads = Runtime.getRuntime().availableProcessors().coerceIn(2, 4),
                debug = false,
                provider = "cpu",
            ),
            maxNumSentences = 1,
        )
        return OfflineTts(config = config).also {
            engine = it
            engineLang = lang
        }
    }

    /** The engine reads plain files, so the bundled model is copied out of the APK once. */
    private fun modelDir(): File {
        val dir = File(context.filesDir, "kokoro")
        val marker = File(dir, ".complete-v$MODEL_VERSION")
        if (marker.exists()) return dir
        dir.deleteRecursively()
        copyAssets("kokoro", dir)
        marker.createNewFile()
        return dir
    }

    private fun copyAssets(path: String, target: File) {
        val children = context.assets.list(path).orEmpty()
        if (children.isEmpty()) {
            target.parentFile?.mkdirs()
            context.assets.open(path).use { input -> target.outputStream().use { input.copyTo(it, 1 shl 16) } }
        } else {
            target.mkdirs()
            for (child in children) copyAssets("$path/$child", File(target, child))
        }
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
        /** Bump when the bundled model changes, so the copied files are refreshed. */
        private const val MODEL_VERSION = 1

        private val FAVORITES = listOf(
            "af_heart", "af_bella", "am_michael", "am_fenrir", "bf_emma", "bm_george", "af_nicole", "am_puck",
        )

        // Speaker order of kokoro-multi-lang-v1_0 (model metadata "speaker_names").
        private val SPEAKERS = (
            "af_alloy,af_aoede,af_bella,af_heart,af_jessica,af_kore,af_nicole,af_nova,af_river,af_sarah,af_sky," +
                "am_adam,am_echo,am_eric,am_fenrir,am_liam,am_michael,am_onyx,am_puck,am_santa," +
                "bf_alice,bf_emma,bf_isabella,bf_lily,bm_daniel,bm_fable,bm_george,bm_lewis," +
                "ef_dora,em_alex,ff_siwis,hf_alpha,hf_beta,hm_omega,hm_psi,if_sara,im_nicola," +
                "jf_alpha,jf_gongitsune,jf_nezumi,jf_tebukuro,jm_kumo,pf_dora,pm_alex,pm_santa," +
                "zf_xiaobei,zf_xiaoni,zf_xiaoxiao,zf_xiaoyi,zm_yunjian,zm_yunxi,zm_yunxia,zm_yunyang,em_santa"
            ).split(",")
    }
}
