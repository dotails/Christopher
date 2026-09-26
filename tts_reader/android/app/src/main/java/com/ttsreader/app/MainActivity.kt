package com.ttsreader.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
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
 * The page's `api/voices` and `api/tts` requests are answered on the phone by [Speech].
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var speech: Speech
    private var pageLoaded = false
    private var pendingSharedText: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        speech = Speech(applicationContext)
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
                pendingSharedText?.let { deliverSharedText(it) }
                pendingSharedText = null
            }
        }
        setContentView(webView)
        handleShareIntent(intent)
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
        handleShareIntent(intent)
    }

    /** Text shared from another app ("Share → TTS Reader") replaces the text box contents. */
    private fun handleShareIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND) return
        val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
        if (pageLoaded) deliverSharedText(text) else pendingSharedText = text
    }

    private fun deliverSharedText(text: String) {
        webView.evaluateJavascript("window.receiveSharedText(${JSONObject.quote(text)})", null)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    inner class Bridge {
        @JavascriptInterface
        fun keepScreenOn(on: Boolean) {
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    companion object {
        private const val ASSET_HOST = "appassets.androidplatform.net"
    }
}
