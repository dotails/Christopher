package com.ttsreader.app

import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Size
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors

/**
 * Live camera in the bottom half of the screen. Each shutter press takes a photo, and
 * the text in it is recognized on the phone. Results are delivered in the order the
 * photos were taken, even while earlier ones are still being read.
 */
@SuppressLint("ViewConstructor")
class CameraPanel(
    private val activity: ComponentActivity,
    private val onText: (String) -> Unit,
    private val onInfo: (String) -> Unit,
    private val onClose: () -> Unit,
) : FrameLayout(activity) {

    private val preview = PreviewView(activity).apply { scaleType = PreviewView.ScaleType.FILL_CENTER }
    private val flash = View(activity).apply { setBackgroundColor(Color.WHITE); alpha = 0f }
    private val status = TextView(activity)
    private val ocrQueue = Executors.newSingleThreadExecutor() // one photo at a time, in order
    private val main = Handler(Looper.getMainLooper())
    private var provider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var capture: ImageCapture? = null
    private var pending = 0
    private var taken = 0

    init {
        setBackgroundColor(Color.BLACK)
        addView(preview, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(flash, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        val shutter = View(activity).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.WHITE)
                setStroke(dp(5), Color.parseColor("#e0834f"))
            }
            contentDescription = "Take photo"
            setOnClickListener { takePhoto() }
        }
        addView(shutter, LayoutParams(dp(76), dp(76), Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = dp(18) })

        val close = TextView(activity).apply {
            text = "✕"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0x66000000) }
            contentDescription = "Close camera"
            setOnClickListener { onClose() }
        }
        addView(close, LayoutParams(dp(44), dp(44), Gravity.TOP or Gravity.END).apply { setMargins(0, dp(10), dp(10), 0) })

        status.apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(dp(10), dp(6), dp(10), dp(6))
            background = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(0x88000000.toInt()) }
            text = "Tap to focus · press the button to add a page"
        }
        addView(status, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START).apply { setMargins(dp(10), dp(12), dp(60), 0) })

        // Tap the preview to focus on that spot (handy for close-up pages).
        preview.setOnTouchListener { v, event ->
            if (event.action == MotionEvent.ACTION_UP) {
                val point = preview.meteringPointFactory.createPoint(event.x, event.y)
                camera?.cameraControl?.startFocusAndMetering(FocusMeteringAction.Builder(point).build())
                v.performClick()
            }
            true
        }
        visibility = GONE
    }

    val isOpen get() = visibility == VISIBLE

    fun open() {
        visibility = VISIBLE
        taken = 0
        updateStatus()
        val future = ProcessCameraProvider.getInstance(activity)
        future.addListener({
            try {
                val p = future.get()
                provider = p
                val previewUseCase = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
                // About 12 MP: plenty for text, and much quicker to read than a full 50 MP photo.
                val capture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .setResolutionSelector(
                        ResolutionSelector.Builder()
                            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                            .setResolutionStrategy(ResolutionStrategy(Size(4000, 3000), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                            .build(),
                    )
                    .build()
                this.capture = capture
                p.unbindAll()
                camera = p.bindToLifecycle(activity, CameraSelector.DEFAULT_BACK_CAMERA, previewUseCase, capture)
            } catch (e: Exception) {
                onInfo("Couldn't start the camera: ${e.message ?: e}")
                close()
                onClose()
            }
        }, activity.mainExecutor)
    }

    fun close() {
        provider?.unbindAll()
        camera = null
        capture = null
        visibility = GONE
    }

    private fun takePhoto() {
        val capture = capture ?: return
        val dir = File(activity.cacheDir, "photos").apply { mkdirs() }
        val file = File(dir, "page-${System.nanoTime()}.jpg")
        val saved = CompletableFuture<File?>()
        pending++
        taken++
        updateStatus()
        flash.alpha = 0.7f
        flash.animate().alpha(0f).setDuration(250).start()

        // Queued now, so pages are read in the order they were taken.
        ocrQueue.execute {
            val photo = saved.get()
            val text = photo?.let { runCatching { Ocr.readImage(activity, Uri.fromFile(it)) }.getOrDefault("") }.orEmpty()
            photo?.delete()
            main.post {
                pending--
                updateStatus()
                if (photo == null) return@post
                if (text.isBlank()) onInfo("No text found in that photo.") else onText(text)
            }
        }
        capture.takePicture(
            ImageCapture.OutputFileOptions.Builder(file).build(),
            activity.mainExecutor,
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    saved.complete(file)
                }

                override fun onError(exception: ImageCaptureException) {
                    onInfo("Couldn't take the photo: ${exception.message}")
                    saved.complete(null)
                }
            },
        )
    }

    private fun updateStatus() {
        status.text = when {
            pending > 0 -> "Reading ${if (pending == 1) "1 photo" else "$pending photos"}…"
            taken > 0 -> "$taken ${if (taken == 1) "page" else "pages"} added · take the next"
            else -> "Tap to focus · press the button to add a page"
        }
    }

    private fun dp(value: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()
}
