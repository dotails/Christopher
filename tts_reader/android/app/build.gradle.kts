import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The speech engine (sherpa-onnx) and the Kokoro voice model are too big for git,
// so the build downloads them once into android/downloads/.
val sherpaVersion = "1.13.8"
val modelName = "kokoro-int8-multi-lang-v1_0"
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
val modelArchive = download(
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/$modelName.tar.bz2",
    "$modelName.tar.bz2",
)

// Unpack only what the app uses: the model, voices, English lexicons and the
// eSpeak data for the supported languages (the Chinese extras are left out).
val espeakDicts = listOf("en", "es", "fr", "it", "pt", "hi").map { "${it}_dict" }
val kokoroAssets = layout.buildDirectory.dir("generated/kokoroAssets")
val prepareModel by tasks.registering(Sync::class) {
    from(tarTree(resources.bzip2(modelArchive))) {
        include(
            "$modelName/model.int8.onnx",
            "$modelName/voices.bin",
            "$modelName/tokens.txt",
            "$modelName/lexicon-us-en.txt",
            "$modelName/lexicon-gb-en.txt",
            "$modelName/LICENSE",
            "$modelName/espeak-ng-data/**",
        )
        exclude("$modelName/espeak-ng-data/*_dict")
        eachFile { path = path.replaceFirst("$modelName/", "kokoro/") }
        includeEmptyDirs = false
    }
    from(tarTree(resources.bzip2(modelArchive))) {
        include(espeakDicts.map { "$modelName/espeak-ng-data/$it" })
        eachFile { path = path.replaceFirst("$modelName/", "kokoro/") }
        includeEmptyDirs = false
    }
    into(kokoroAssets)
}

android {
    namespace = "com.ttsreader.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ttsreader.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
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

    sourceSets["main"].assets.srcDirs(kokoroAssets, "../../static")

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

tasks.named("preBuild") { dependsOn(prepareModel) }

dependencies {
    implementation(files(sherpaAar))
    implementation("androidx.webkit:webkit:1.12.1")
}
