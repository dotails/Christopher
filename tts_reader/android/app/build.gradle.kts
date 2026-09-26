import java.io.ByteArrayOutputStream
import java.net.URI

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

android {
    namespace = "com.ttsreader.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ttsreader.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 2
        versionName = "2.0"
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

    sourceSets["main"].assets.srcDirs(modelAssets, "../../static")

    packaging {
        jniLibs.useLegacyPackaging = true // compress the native libraries (smaller APK download)
    }

    androidResources {
        // The model files barely compress; storing them as-is makes the first-launch copy faster.
        noCompress += listOf("onnx", "bin")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

tasks.named("preBuild") { dependsOn(prepareKokoro, prepareAustralian) }

dependencies {
    implementation(files(sherpaAar))
    implementation("androidx.webkit:webkit:1.12.1")
}
