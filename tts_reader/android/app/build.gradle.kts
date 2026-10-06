import java.io.ByteArrayOutputStream
import java.net.URI
import java.security.MessageDigest

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The speech engine (sherpa-onnx) and the voice models are too big for git,
// so the build downloads them once into android/downloads/.
val sherpaVersion = "1.13.8"
val kokoroName = "kokoro-multi-lang-v1_0" // full-precision Kokoro v1.0: US and UK voices
val auRevision = "7f35faf19fe1789ece4b14233448f7c04e35a84f" // DataCraftsmanAustralia/piper-en_AU-librivox-medium
val downloadsDir = rootProject.file("downloads")

fun download(url: String, name: String): File {
    val target = File(downloadsDir, name)
    if (!target.exists()) {
        downloadsDir.mkdirs()
        logger.lifecycle("Downloading $url")
        val part = File(downloadsDir, "$name.part")
        URI(url).toURL().openStream().use { input -> part.outputStream().use { input.copyTo(it) } }
        part.renameTo(target)
    }
    return target
}

val sherpaAar = download(
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/v$sherpaVersion/sherpa-onnx-$sherpaVersion.aar",
    "sherpa-onnx-$sherpaVersion.aar",
)
val kokoroArchive = download(
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/$kokoroName.tar.bz2",
    "$kokoroName.tar.bz2",
)
val auBase = "https://huggingface.co/DataCraftsmanAustralia/piper-en_AU-librivox-medium/resolve/$auRevision"
val auModel = download("$auBase/en_AU-librivox-medium.onnx", "en_AU-librivox-medium.onnx")
val auConfig = download("$auBase/en_AU-librivox-medium.onnx.json", "en_AU-librivox-medium.onnx.json")
val auAttribution = download("$auBase/ATTRIBUTION.md", "en_AU-librivox-medium-ATTRIBUTION.md")

val modelAssets = layout.buildDirectory.dir("generated/modelAssets")

// Kokoro: only the model, voices, English lexicons and English eSpeak data.
val prepareKokoro by tasks.registering(Sync::class) {
    from(tarTree(resources.bzip2(kokoroArchive))) {
        include(
            "$kokoroName/model.onnx",
            "$kokoroName/voices.bin",
            "$kokoroName/tokens.txt",
            "$kokoroName/lexicon-us-en.txt",
            "$kokoroName/lexicon-gb-en.txt",
            "$kokoroName/LICENSE",
            "$kokoroName/espeak-ng-data/**",
        )
        exclude("$kokoroName/espeak-ng-data/*_dict")
        includeEmptyDirs = false
    }
    from(tarTree(resources.bzip2(kokoroArchive))) {
        include("$kokoroName/espeak-ng-data/en_dict")
    }
    eachFile { path = path.replaceFirst("$kokoroName/", "") }
    includeEmptyDirs = false
    into(modelAssets.map { it.dir("models/kokoro") })
}

// Piper (Australian): sherpa-onnx needs the voice settings stored inside the .onnx
// file and a tokens.txt, so write both here from the model's .onnx.json.
val prepareAustralian by tasks.registering {
    val out = modelAssets.map { it.dir("models/au") }
    inputs.files(auModel, auConfig, auAttribution)
    outputs.dir(out)
    doLast {
        val dir = out.get().asFile.apply { deleteRecursively(); mkdirs() }
        @Suppress("UNCHECKED_CAST")
        val config = groovy.json.JsonSlurper().parse(auConfig) as Map<String, Any>
        val espeak = config["espeak"] as Map<String, Any>
        val audio = config["audio"] as Map<String, Any>

        // ModelProto.metadata_props is field 14; appending encoded entries to the
        // serialized model adds them without having to parse the whole file.
        fun varint(value: Int): ByteArray {
            val bytes = ByteArrayOutputStream()
            var v = value
            while (true) {
                val b = v and 0x7F
                v = v ushr 7
                if (v == 0) { bytes.write(b); break }
                bytes.write(b or 0x80)
            }
            return bytes.toByteArray()
        }
        fun field(number: Int, data: ByteArray) = varint((number shl 3) or 2) + varint(data.size) + data
        val meta = mapOf(
            "model_type" to "vits",
            "comment" to "piper",
            "language" to "English",
            "voice" to espeak["voice"].toString(),
            "has_espeak" to "1",
            "n_speakers" to config["num_speakers"].toString(),
            "sample_rate" to audio["sample_rate"].toString(),
        )
        File(dir, "model.onnx").outputStream().use { outStream ->
            auModel.inputStream().use { it.copyTo(outStream) }
            for ((k, v) in meta) outStream.write(field(14, field(1, k.toByteArray()) + field(2, v.toByteArray())))
        }

        // sherpa-onnx reads one character per token. The model's merged vowel
        // clusters ("aɪ", "eɪ", ...) are left out; their letters are read separately.
        @Suppress("UNCHECKED_CAST")
        val ids = config["phoneme_id_map"] as Map<String, List<Number>>
        File(dir, "tokens.txt").writeText(
            ids.filterKeys { it.codePointCount(0, it.length) == 1 }
                .entries.joinToString("") { (phoneme, id) -> "$phoneme ${id.first()}\n" },
            Charsets.UTF_8,
        )
        auAttribution.copyTo(File(dir, "ATTRIBUTION.md"))
    }
}

// The voice files the app downloads (see ModelStore.kt), published by CI to the
// "tts-reader-models" release. Users pick voices one by one:
// - "common": pronunciation data every voice uses (zip).
// - "kokoro": the model all US and UK voices share (model + zip of extras).
// - "au": the Australian model; all 10 Australian voices are inside it (model + zip).
// - "voice:<id>": one US/UK voice's data, a 522,240-byte slice of Kokoro's voices.bin,
//   which the app writes back into its own voices.bin at the given offset.
// manifest.txt lines: "<sha256> <size> <file> <part> [<offset>]".
val modelRelease = layout.buildDirectory.dir("model-release")
val modelsDir = modelAssets.map { it.dir("models") }
// Speaker order of kokoro-multi-lang-v1_0 (as in Speech.kt); US/UK voices are published.
val kokoroSpeakers = ("af_alloy,af_aoede,af_bella,af_heart,af_jessica,af_kore,af_nicole,af_nova,af_river,af_sarah,af_sky," +
    "am_adam,am_echo,am_eric,am_fenrir,am_liam,am_michael,am_onyx,am_puck,am_santa," +
    "bf_alice,bf_emma,bf_isabella,bf_lily,bm_daniel,bm_fable,bm_george,bm_lewis").split(",")
val voiceBytes = 510 * 256 * 4 // one voice's style vectors (float32)
fun Zip.reproducible(name: String) {
    dependsOn(prepareKokoro, prepareAustralian)
    archiveFileName.set(name)
    destinationDirectory.set(modelRelease)
    isPreserveFileTimestamps = false // the same bytes every build, so the manifest stays stable
    isReproducibleFileOrder = true
}
val zipCommon by tasks.registering(Zip::class) {
    reproducible("common.zip")
    from(modelsDir) { include("kokoro/espeak-ng-data/**") }
}
val zipKokoroExtras by tasks.registering(Zip::class) {
    reproducible("kokoro-extras.zip")
    from(modelsDir) { include("kokoro/tokens.txt", "kokoro/lexicon-*.txt", "kokoro/LICENSE") }
}
val zipAuExtras by tasks.registering(Zip::class) {
    reproducible("au-extras.zip")
    from(modelsDir) { include("au/tokens.txt", "au/ATTRIBUTION.md") }
}
val packageModels by tasks.registering {
    dependsOn(zipCommon, zipKokoroExtras, zipAuExtras)
    doLast {
        val out = modelRelease.get().asFile
        val models = modelsDir.get().asFile
        out.listFiles()?.filter { it.name.startsWith("voice-") || it.name in setOf("kokoro-voices.bin", "tts-reader-extras.zip") }
            ?.forEach { it.delete() } // left from earlier layouts
        models.resolve("kokoro/model.onnx").copyTo(out.resolve("kokoro-model.onnx"), overwrite = true)
        models.resolve("au/model.onnx").copyTo(out.resolve("au-model.onnx"), overwrite = true)

        val entries = mutableListOf(
            "common.zip" to "common",
            "kokoro-model.onnx" to "kokoro", "kokoro-extras.zip" to "kokoro",
            "au-model.onnx" to "au", "au-extras.zip" to "au",
        )
        val offsets = HashMap<String, Long>()
        val allVoices = models.resolve("kokoro/voices.bin").readBytes()
        kokoroSpeakers.forEachIndexed { sid, id ->
            if (id == "am_santa") return@forEachIndexed // not offered in the app
            val name = "voice-$id.bin"
            out.resolve(name).writeBytes(allVoices.copyOfRange(sid * voiceBytes, (sid + 1) * voiceBytes))
            entries.add(name to "voice:$id")
            offsets[name] = sid.toLong() * voiceBytes
        }
        val lines = entries.map { (name, part) ->
            val file = out.resolve(name)
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer = ByteArray(1 shl 20)
                while (true) {
                    val n = input.read(buffer)
                    if (n < 0) break
                    digest.update(buffer, 0, n)
                }
            }
            val hex = digest.digest().joinToString("") { "%02x".format(it) }
            listOfNotNull(hex, file.length().toString(), name, part, offsets[name]?.toString()).joinToString(" ")
        }
        out.resolve("manifest.txt").writeText(lines.joinToString("\n") + "\n")
    }
}

android {
    namespace = "com.ttsreader.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ttsreader.app"
        minSdk = 29 // Android 10+: saving to Downloads needs no storage permission
        targetSdk = 34
        versionCode = 12
        versionName = "12.0"
        ndk { abiFilters += "arm64-v8a" }
    }

    // A fixed key checked into the repo, so every build (local or GitHub Actions)
    // can install over the previous one. Fine for a personal sideloaded app.
    signingConfigs {
        create("shared") {
            storeFile = file("tts-reader.keystore")
            storePassword = "ttsreader"
            keyAlias = "ttsreader"
            keyPassword = "ttsreader"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("shared")
        }
        debug {
            signingConfig = signingConfigs.getByName("shared")
        }
    }

    sourceSets["main"].assets.srcDirs("../../static")

    packaging {
        // Compress native libraries and code: a smaller download (they're unpacked on install).
        jniLibs.useLegacyPackaging = true
        dex.useLegacyPackaging = true
        // Post-quantum crypto tables from pdfbox's Bouncy Castle dependency; never used to read PDFs.
        resources.excludes += "org/bouncycastle/pqc/**"
    }

    androidResources {
        // The model files barely compress; storing them as-is makes the first-launch copy faster.
        noCompress += listOf("onnx", "bin")
    }

    buildFeatures {
        buildConfig = true // the version name shown in "Copy debug info"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// The models aren't in the APK; packageModels prepares them for the release download.

dependencies {
    implementation(files(sherpaAar))
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.tom-roush:pdfbox-android:2.0.27.0") // text from PDFs
    implementation("com.google.mlkit:text-recognition:16.0.1") // text from pictures, on the phone
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.camera:camera-camera2:1.4.2") // in-app camera for reading pages
    implementation("androidx.camera:camera-lifecycle:1.4.2")
    implementation("androidx.camera:camera-view:1.4.2")
    testImplementation("junit:junit:4.13.2")
}
