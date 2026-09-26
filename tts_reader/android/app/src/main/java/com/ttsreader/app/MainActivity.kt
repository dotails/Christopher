package com.ttsreader.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.net.Uri
import android.webkit.JavascriptInterface
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
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var speech: Speech
    private var pageLoaded = false
    private val pendingJs = ArrayList<String>() // calls into the page made before it finished loading
    @Volatile private var player: PlaybackService? = null
    private var askedForNotifications = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            player = (binder as PlaybackService.LocalBinder).service
        }

        override fun onServiceDisconnected(name: ComponentName) {
            player = null
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

            override fun onPageFinished(view: WebView, url: String) {
                pageLoaded = true
                pendingJs.forEach { webView.evaluateJavascript(it, null) }
                pendingJs.clear()
            }
        }
        setContentView(webView)
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

    /** Text or a document shared to / opened with TTS Reader replaces the text box contents. */
    private fun handleIncoming(intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_SEND -> {
                @Suppress("DEPRECATION")
                val stream = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                when {
                    stream != null -> importDocument(stream)
                    text != null -> showText(text, intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty())
                }
            }
            Intent.ACTION_VIEW -> intent.data?.let { importDocument(it) }
        }
    }

    private fun importDocument(uri: Uri) {
        runJs("window.appMessage && window.appMessage('Opening document…')")
        thread(name = "import") {
            try {
                val doc = TextExtractor.extract(this, uri)
                runOnUiThread { showText(doc.text, doc.title) }
            } catch (e: Throwable) {
                val msg = "Couldn't open that file: " + (e.message ?: e.javaClass.simpleName)
                runOnUiThread { runJs("window.appMessage && window.appMessage(${JSONObject.quote(msg)})") }
            }
        }
    }

    private fun showText(text: String, title: String) {
        runJs("window.receiveSharedText(${JSONObject.quote(text)}, ${JSONObject.quote(title)})")
    }

    private fun runJs(code: String) {
        if (pageLoaded) webView.evaluateJavascript(code, null) else pendingJs.add(code)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_OPEN && resultCode == RESULT_OK) data?.data?.let { importDocument(it) }
    }

    /** Back closes the page's menu sheet first (the page adds a history entry for it). */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        unbindService(connection) // the service keeps reading if it was playing
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
                @Suppress("DEPRECATION")
                startActivityForResult(intent, REQUEST_OPEN)
            }
        }

        @JavascriptInterface
        fun clipboardText(): String {
            val clip = getSystemService(ClipboardManager::class.java).primaryClip ?: return ""
            return (0 until clip.itemCount).joinToString("\n") { clip.getItemAt(it).coerceToText(this@MainActivity).toString() }
        }

        private fun control(action: (PlaybackService) -> Unit) {
            runOnUiThread { player?.let(action) }
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
        private val OPENABLE_TYPES = arrayOf(
            "text/*",
            "application/pdf",
            "application/epub+zip",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    }
}
