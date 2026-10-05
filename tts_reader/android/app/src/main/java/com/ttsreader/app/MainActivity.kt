package com.ttsreader.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.provider.MediaStore
import android.net.Uri
import android.widget.LinearLayout
import androidx.activity.ComponentActivity
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import kotlin.concurrent.thread

/**
 * Shows the same web UI as the Python server version, from the APK's assets.
 * The page's `api/voices` requests are answered by [Speech], and its playback
 * controls (the `AndroidApp` bridge) drive [PlaybackService], which does the reading.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var speech: Speech
    private var pageLoaded = false
    private val pendingJs = ArrayList<String>() // calls into the page made before it finished loading
    @Volatile private var player: PlaybackService? = null
    private val pendingControls = ArrayList<(PlaybackService) -> Unit>() // sent before the service connected
    private var askedForNotifications = false
    private val events = ArrayList<String>()
    private lateinit var camera: CameraPanel
    private var cameraHasText = false // false until the first photo of this camera session is read

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            val service = (binder as PlaybackService.LocalBinder).service
            player = service
            note("service connected, running ${pendingControls.size} queued controls")
            pendingControls.forEach { it(service) }
            pendingControls.clear()
        }

        override fun onServiceDisconnected(name: ComponentName) {
            note("service disconnected")
            player = null
            bindPlayer()
        }
    }

    private fun bindPlayer() {
        bindPlayer()
    }

    private fun note(message: String) {
        synchronized(events) {
            events.add(java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(java.util.Date()) + " app: " + message)
            while (events.size > 20) events.removeAt(0)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        speech = Speech.get(this)
        bindService(Intent(this, PlaybackService::class.java), connection, BIND_AUTO_CREATE)
        // Copy the model out of the APK (first launch only) and load it while the page opens.
        thread(name = "tts-warmup") { runCatching { speech.warmUp(null) } }

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
        }
        webView.addJavascriptInterface(Bridge(), "AndroidApp")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url
                if (url.host == ASSET_HOST && url.path?.startsWith("/api/") == true) return handleApi(request)
                return assetLoader.shouldInterceptRequest(url)
            }

            // Android may kill the page's renderer while the app is in the background.
            // Rebuild the screen instead of leaving a dead page (reading continues meanwhile).
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                note("page renderer gone (crash=${detail.didCrash()})")
                runOnUiThread { recreate() }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageLoaded = true
                pendingJs.forEach { webView.evaluateJavascript(it, null) }
                pendingJs.clear()
            }
        }
        // The page on top; the camera, when it's on, takes the bottom half.
        camera = CameraPanel(
            this,
            onText = { text -> cameraText(text) },
            onInfo = { message(it) },
            onClose = { closeCamera() },
        )
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(webView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
            addView(camera, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        })
        handleIncoming(intent)
        webView.loadUrl("https://$ASSET_HOST/index.html")
    }

    // Runs on a WebView background thread, so it's fine for synthesis to block here.
    private fun handleApi(request: WebResourceRequest): WebResourceResponse {
        val url = request.url
        return try {
            when (url.path) {
                "/api/voices" -> {
                    val list = JSONArray()
                    for (v in speech.voices) {
                        list.put(JSONObject().put("id", v.id).put("name", v.name).put("group", v.accent.label))
                    }
                    response(200, "application/json", list.toString().toByteArray())
                }
                "/api/tts" -> {
                    val text = url.getQueryParameter("text").orEmpty().trim().take(2000)
                    if (text.isEmpty()) return response(400, "application/json", """{"error":"no text"}""".toByteArray())
                    val wav = speech.synthesize(
                        text,
                        url.getQueryParameter("voice"),
                        url.getQueryParameter("speed")?.toFloatOrNull() ?: 1f,
                        url.getQueryParameter("client").orEmpty(),
                        url.getQueryParameter("epoch")?.toLongOrNull() ?: 0L,
                    ) ?: return response(409, "application/json", """{"error":"superseded"}""".toByteArray())
                    response(200, "audio/wav", wav)
                }
                else -> response(404, "text/plain", "not found".toByteArray())
            }
        } catch (e: Throwable) {
            response(500, "text/plain", (e.message ?: e.toString()).toByteArray())
        }
    }

    private fun response(status: Int, mime: String, body: ByteArray): WebResourceResponse {
        val reason = when (status) { 200 -> "OK"; 400 -> "Bad Request"; 404 -> "Not Found"; 409 -> "Conflict"; else -> "Error" }
        return WebResourceResponse(mime, null, status, reason, mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(body))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIncoming(intent)
    }

    /** Text, documents or pictures shared to / opened with TTS Reader replace the text box contents. */
    private fun handleIncoming(intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_SEND -> {
                @Suppress("DEPRECATION")
                val stream = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                when {
                    stream != null -> importDocuments(listOf(stream))
                    text != null -> showText(text, intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty(), false)
                }
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                @Suppress("DEPRECATION")
                val streams = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
                if (streams.isNotEmpty()) importDocuments(streams)
            }
            Intent.ACTION_VIEW -> intent.data?.let { importDocuments(listOf(it)) }
            ACTION_READ_PHOTO -> openCamera()
        }
    }

    /** Reads the files' text and shows it. Pictures start reading aloud straight away. */
    private fun importDocuments(uris: List<Uri>) {
        message("Opening…")
        thread(name = "import") {
            try {
                val doc = TextExtractor.extractAll(this, uris) { progress -> runOnUiThread { message(progress) } }
                runOnUiThread { showText(doc.text, doc.title, autoplay = doc.usedOcr) }
            } catch (e: Throwable) {
                note("import failed: $e")
                runOnUiThread { message("Couldn't read that: " + (e.message ?: e.javaClass.simpleName)) }
            }
        }
    }

    private fun showText(text: String, title: String, autoplay: Boolean) {
        runJs("window.receiveSharedText(${JSONObject.quote(text)}, ${JSONObject.quote(title)}, $autoplay)")
    }

    private fun message(text: String) {
        runJs("window.appMessage && window.appMessage(${JSONObject.quote(text)})")
    }

    /** Runs a playback control now, or as soon as the service is connected. */
    private fun control(action: (PlaybackService) -> Unit) {
        runOnUiThread {
            val service = player
            if (service != null) {
                action(service)
            } else {
                note("control queued: service not connected")
                pendingControls.add(action)
                bindPlayer()
            }
        }
    }

    /** Camera in the bottom half: every photo's text is added to the end of what's being read. */
    private fun openCamera() {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            @Suppress("DEPRECATION")
            requestPermissions(arrayOf(Manifest.permission.CAMERA), REQUEST_CAMERA)
            return
        }
        if (camera.isOpen) return
        note("camera on")
        cameraHasText = false
        camera.open()
        control { it.setHoldAtEnd(true) }
        runJs("window.cameraMode && window.cameraMode(true)")
    }

    private fun closeCamera() {
        if (!camera.isOpen) return
        note("camera off")
        camera.close()
        control { it.setHoldAtEnd(false) }
        runJs("window.cameraMode && window.cameraMode(false)")
    }

    /** The first photo starts a new text; later ones are added to its end. */
    private fun cameraText(text: String) {
        val first = !cameraHasText
        cameraHasText = true
        runJs("window.cameraText(${JSONObject.quote(text)}, $first)")
    }

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        @Suppress("DEPRECATION")
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_CAMERA) {
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) openCamera()
            else message("The camera needs permission to read photos. You can allow it in Settings.")
        }
    }

    private fun pickPictures() {
        val intent = if (Build.VERSION.SDK_INT >= 33) {
            Intent(MediaStore.ACTION_PICK_IMAGES).putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, 50)
        } else {
            Intent(Intent.ACTION_GET_CONTENT).setType("image/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(intent, REQUEST_PICTURES)
        } catch (e: ActivityNotFoundException) {
            message("No gallery app found.")
        }
    }

    /** The files picked in a picker, in the order they were picked. */
    private fun pickedUris(data: Intent?): List<Uri> {
        val clip = data?.clipData
        if (clip != null && clip.itemCount > 0) return List(clip.itemCount) { clip.getItemAt(it).uri }
        return listOfNotNull(data?.data)
    }

    private fun runJs(code: String) {
        if (pageLoaded) webView.evaluateJavascript(code, null) else pendingJs.add(code)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK) return
        when (requestCode) {
            REQUEST_OPEN, REQUEST_PICTURES -> pickedUris(data).takeIf { it.isNotEmpty() }?.let { importDocuments(it) }
        }
    }

    /** Back closes the page's menu sheet first (the page adds a history entry for it). */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        @Suppress("DEPRECATION")
        when {
            webView.canGoBack() -> webView.goBack()
            camera.isOpen -> closeCamera()
            else -> super.onBackPressed()
        }
    }

    override fun onDestroy() {
        runCatching { unbindService(connection) } // the service keeps reading if it was playing
        webView.destroy()
        super.onDestroy()
    }

    /** Called from the page. Controls run on the main thread, in the order the page sent them. */
    inner class Bridge {
        @JavascriptInterface
        fun hasPlayer() = true

        @JavascriptInterface
        fun state(): String = player?.stateJson() ?: "{}"

        @JavascriptInterface
        fun load(key: String, textsJson: String, parasJson: String, voice: String, start: Int) {
            val texts = JSONArray(textsJson).let { a -> List(a.length()) { a.getString(it) } }
            val paras = JSONArray(parasJson).let { a -> IntArray(a.length()) { a.getInt(it) } }
            control { it.load(key, texts, paras, voice, start) }
        }

        @JavascriptInterface
        fun play() {
            askForNotifications()
            control { it.play() }
        }

        @JavascriptInterface
        fun pause() = control { it.pause() }

        @JavascriptInterface
        fun seek(index: Int) = control { it.seek(index) }

        @JavascriptInterface
        fun setSpeed(speed: Float) = control { it.setSpeed(speed) }

        @JavascriptInterface
        fun setVoice(voice: String) = control { it.setVoice(voice) }

        @JavascriptInterface
        fun setSleepTimer(minutes: Int) = control { it.setSleepTimer(minutes) }

        @JavascriptInterface
        fun setAutoSave(on: Boolean) = control { it.setAutoSave(on) }

        @JavascriptInterface
        fun saveNow() = control { it.saveNow() }

        @JavascriptInterface
        fun openFile() {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("*/*")
                    .putExtra(Intent.EXTRA_MIME_TYPES, OPENABLE_TYPES)
                    .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                @Suppress("DEPRECATION")
                startActivityForResult(intent, REQUEST_OPEN)
            }
        }

        @JavascriptInterface
        fun toggleCamera() = runOnUiThread { if (camera.isOpen) closeCamera() else openCamera() }

        @JavascriptInterface
        fun append(oldKey: String, newKey: String, textsJson: String, parasJson: String): Boolean {
            val texts = JSONArray(textsJson).let { a -> List(a.length()) { a.getString(it) } }
            val paras = JSONArray(parasJson).let { a -> IntArray(a.length()) { a.getInt(it) } }
            return player?.append(oldKey, newKey, texts, paras) ?: false
        }

        @JavascriptInterface
        fun pickPictures() = runOnUiThread { this@MainActivity.pickPictures() }

        @JavascriptInterface
        fun clipboardText(): String {
            val clip = getSystemService(ClipboardManager::class.java).primaryClip ?: return ""
            return (0 until clip.itemCount).joinToString("\n") { clip.getItemAt(it).coerceToText(this@MainActivity).toString() }
        }

        @JavascriptInterface
        fun debugInfo(): String {
            val app = synchronized(events) { events.joinToString("\n") }
            val service = player?.debugInfo() ?: "Service not connected"
            return "TTS Reader ${BuildConfig.VERSION_NAME} · Android ${Build.VERSION.RELEASE} · ${Build.MANUFACTURER} ${Build.MODEL}\n" +
                "$service\n$app"
        }

        @JavascriptInterface
        fun copyText(text: String) {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("TTS Reader", text))
        }
    }

    /** Lets the playback notification show on Android 13+ (asked once, on the first Play). */
    private fun askForNotifications() {
        if (Build.VERSION.SDK_INT < 33 || askedForNotifications) return
        askedForNotifications = true
        runOnUiThread {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
            }
        }
    }

    companion object {
        private const val ASSET_HOST = "appassets.androidplatform.net"
        private const val REQUEST_OPEN = 7
        private const val REQUEST_CAMERA = 8
        private const val REQUEST_PICTURES = 9
        private const val ACTION_READ_PHOTO = "com.ttsreader.app.READ_PHOTO"
        private val OPENABLE_TYPES = arrayOf(
            "text/*",
            "image/*",
            "application/pdf",
            "application/epub+zip",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    }
}
