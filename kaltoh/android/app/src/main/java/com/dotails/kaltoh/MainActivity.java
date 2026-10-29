package com.dotails.kaltoh;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.graphics.Rect;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.DisplayMetrics;
import android.util.Size;
import android.util.SizeF;
import android.view.DisplayCutout;
import android.view.Surface;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/**
 * Hosts the game - a WebGL page in assets/www - full screen, and lends it the phone's senses:
 * the accelerometer for shake-to-begin-anew and the vibrator for touch feedback.
 *
 * Pages are served from the APK's assets under a private https origin, so the game's ES
 * modules, textures and fonts load as same-origin content without touching the network.
 *
 * When the player asks for the hologram view, the shell follows their head with the front camera
 * (HeadTracker; never shown or kept), and tells the page the screen's true size and where the
 * camera sits, so the screen can be drawn as a window. The page can instead watch the camera for
 * the player's eyes itself, if they choose; then the shell grants it the camera.
 *
 * The game's music plays here rather than in the page: a page's media takes the phone's audio
 * focus, which pauses whatever else is playing. This player never asks for it, so the music plays
 * along with any other app's sound.
 */
public class MainActivity extends Activity implements SensorEventListener {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    // Linear acceleration (m/s^2) worth reporting; the page decides what counts as a shake.
    private static final float SHAKE_FLOOR = 6f;
    private static final long SHAKE_INTERVAL_MS = 33;
    private static final long HEAD_INTERVAL_MS = 15;
    private static final int REQUEST_CAMERA = 7;
    private static final int REQUEST_PAGE_CAMERA = 8;

    private WebView web;
    private SensorManager sensors;
    private Sensor motion;
    private boolean linearSensor;
    private PermissionRequest pendingCamera; // the page's request for the camera, while asking the player
    private float[] cameraFov; // the front camera's field of view (long side, short side), degrees
    private volatile String deviceInfo = "null"; // see deviceJson(); kept current on the UI thread
    private final float[] gravity = new float[3];
    private long lastShakeSample;
    private Vibrator vibrator;
    private volatile boolean pageReady;
    private volatile float insetTop;
    private volatile float insetBottom;
    private HeadTracker head;
    private boolean headWanted;
    private volatile long lastHeadSample;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams attrs = getWindow().getAttributes();
            attrs.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attrs);
        }
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(8, 9, 12));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setHapticFeedbackEnabled(false);
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true);
        web.addJavascriptInterface(new Bridge(), "KalTohAndroid");
        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new PageCamera());
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            readInsets(insets);
            return v.onApplyWindowInsets(insets);
        });
        setContentView(web);
        immerse();
        cameraFov = frontCameraFov();
        deviceInfo = deviceJson(null);

        sensors = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensors != null) {
            motion = sensors.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
            linearSensor = motion != null;
            if (motion == null) motion = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        }
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);

        web.loadUrl(START);
    }

    // Full screen: system bars hidden, returning briefly on a swipe from the edge.
    @SuppressWarnings("deprecation")
    private void immerse() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    // Keep the title clear of a camera cutout and the tray clear of the home gesture.
    private void readInsets(WindowInsets insets) {
        float density = getResources().getDisplayMetrics().density;
        int top = 0;
        int bottom = 0;
        if (Build.VERSION.SDK_INT >= 28) {
            DisplayCutout cutout = insets.getDisplayCutout();
            if (cutout != null) {
                top = cutout.getSafeInsetTop();
                bottom = cutout.getSafeInsetBottom();
            }
        }
        if (Build.VERSION.SDK_INT >= 29) {
            bottom = Math.max(bottom, insets.getMandatorySystemGestureInsets().bottom);
        }
        insetTop = top / density;
        insetBottom = bottom / density;
        deviceInfo = deviceJson(insets);
        if (pageReady) {
            run(String.format(Locale.US, "window.kaltoh&&window.kaltoh.insets(%.1f,%.1f)", insetTop, insetBottom));
        }
    }

    private void run(String script) {
        if (web != null) web.evaluateJavascript(script, null);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immerse();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
        if (sensors != null && motion != null) {
            sensors.registerListener(this, motion, SensorManager.SENSOR_DELAY_GAME);
        }
        immerse();
        resumeMusic();
        if (pageReady) run("window.kaltoh&&window.kaltoh.resume()");
        if (headWanted && cameraAllowed()) startHead();
    }

    @Override
    protected void onPause() {
        pauseMusic();
        if (pageReady) run("window.kaltoh&&window.kaltoh.pause()");
        if (sensors != null) sensors.unregisterListener(this);
        stopHead(); // never hold the camera while the game is out of sight
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        musicFade.removeCallbacksAndMessages(null);
        if (music != null) {
            music.release();
            music = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // --- Shake -------------------------------------------------------------------------------

    @Override
    public void onSensorChanged(SensorEvent event) {
        float x = event.values[0];
        float y = event.values[1];
        float z = event.values[2];
        if (!linearSensor) {
            // Without a linear-acceleration sensor, remove gravity with a low-pass filter.
            final float keep = 0.8f;
            gravity[0] = keep * gravity[0] + (1 - keep) * x;
            gravity[1] = keep * gravity[1] + (1 - keep) * y;
            gravity[2] = keep * gravity[2] + (1 - keep) * z;
            x -= gravity[0];
            y -= gravity[1];
            z -= gravity[2];
        }
        float magnitude = (float) Math.sqrt(x * x + y * y + z * z);
        long now = SystemClock.uptimeMillis();
        if (pageReady && magnitude > SHAKE_FLOOR && now - lastShakeSample > SHAKE_INTERVAL_MS) {
            lastShakeSample = now;
            run(String.format(Locale.US, "window.kaltoh&&window.kaltoh.shake(%.2f)", magnitude));
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
    }

    // --- Hologram view: following the player's face ------------------------------------------

    private void setHologram(boolean on) {
        headWanted = on;
        if (!on) {
            stopHead();
            headStatus("off");
        } else if (cameraAllowed()) {
            startHead();
        } else {
            requestPermissions(new String[] {Manifest.permission.CAMERA}, REQUEST_CAMERA);
        }
    }

    private boolean cameraAllowed() {
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQUEST_PAGE_CAMERA) {
            if (pendingCamera != null) {
                if (granted) pendingCamera.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                else pendingCamera.deny();
                pendingCamera = null;
            }
            return;
        }
        if (requestCode != REQUEST_CAMERA) return;
        if (granted) {
            if (headWanted) startHead();
        } else {
            headWanted = false;
            headStatus("denied");
        }
    }

    private void startHead() {
        if (head != null) return;
        head = new HeadTracker(new HeadTracker.Listener() {
            @Override
            public void onFace(float leftX, float leftY, float rightX, float rightY, float boxX, float boxY, float boxWidth,
                               int width, int height, float yaw, long age) {
                long now = SystemClock.uptimeMillis();
                if (now - lastHeadSample < HEAD_INTERVAL_MS) return;
                lastHeadSample = now;
                String script = String.format(Locale.US,
                        "window.kaltoh&&window.kaltoh.face(%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%d,%d,%.2f,%d)",
                        leftX, leftY, rightX, rightY, boxX, boxY, boxWidth, width, height, yaw, age);
                runOnUiThread(() -> run(script));
            }

            @Override
            public void onEngine(String engine) {
                if (pageReady) runOnUiThread(() -> run("window.kaltoh&&window.kaltoh.headEngine('" + engine + "')"));
            }

            @Override
            public void onHead(float x, float y, float size) {
                long now = SystemClock.uptimeMillis();
                if (now - lastHeadSample < HEAD_INTERVAL_MS) return;
                lastHeadSample = now;
                String script = String.format(Locale.US, "window.kaltoh&&window.kaltoh.head(%.4f,%.4f,%.4f)", x, y, size);
                runOnUiThread(() -> run(script));
            }

            @Override
            public void onStatus(String status) {
                runOnUiThread(() -> {
                    if (!"on".equals(status)) {
                        stopHead();
                        headWanted = false;
                    }
                    headStatus(status);
                });
            }
        }, displayDegrees());
        head.start();
    }

    private void stopHead() {
        if (head != null) {
            head.stop();
            head = null;
        }
    }

    private void headStatus(String status) {
        if (pageReady) run("window.kaltoh&&window.kaltoh.headStatus('" + status + "')");
    }

    @SuppressWarnings("deprecation")
    private int displayDegrees() {
        switch (getWindowManager().getDefaultDisplay().getRotation()) {
            case Surface.ROTATION_90: return 90;
            case Surface.ROTATION_180: return 180;
            case Surface.ROTATION_270: return 270;
            default: return 0;
        }
    }

    // The page asks for the camera to watch the player's eyes (if they chose that over the head):
    // granted if the player allows it.
    private final class PageCamera extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> {
                boolean video = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) video = true;
                }
                if (!video || !HOST.equals(request.getOrigin().getHost())) {
                    request.deny();
                    return;
                }
                stopHead(); // one watcher of the camera at a time
                if (cameraAllowed()) {
                    request.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    if (pendingCamera != null) pendingCamera.deny();
                    pendingCamera = request;
                    requestPermissions(new String[] {Manifest.permission.CAMERA}, REQUEST_PAGE_CAMERA);
                }
            });
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (pendingCamera == request) pendingCamera = null;
        }
    }

    // The screen's density and the front camera's field of view and place, for the page to draw
    // the screen as a window of its true size (JSON; see native.js).
    @SuppressWarnings("deprecation")
    private String deviceJson(WindowInsets insets) {
        DisplayMetrics metrics = new DisplayMetrics();
        getWindowManager().getDefaultDisplay().getRealMetrics(metrics);
        StringBuilder json = new StringBuilder();
        json.append(String.format(Locale.US, "{\"xdpi\":%.2f,\"ydpi\":%.2f", metrics.xdpi, metrics.ydpi));
        float[] fov = cameraFov;
        if (fov != null) json.append(String.format(Locale.US, ",\"fovLong\":%.2f,\"fovShort\":%.2f", fov[0], fov[1]));
        if (Build.VERSION.SDK_INT >= 28 && insets != null) {
            DisplayCutout cutout = insets.getDisplayCutout();
            if (cutout != null) {
                // The camera's hole: the cutout nearest the top of the screen.
                Rect best = null;
                for (Rect r : cutout.getBoundingRects()) {
                    if (best == null || r.top < best.top) best = r;
                }
                if (best != null && best.top < metrics.heightPixels / 4) {
                    json.append(String.format(Locale.US, ",\"cutout\":{\"x\":%.1f,\"y\":%.1f}", best.exactCenterX(), best.exactCenterY()));
                }
            }
        }
        return json.append('}').toString();
    }

    // The front camera's field of view across its sensor's long and short sides, in degrees.
    private float[] frontCameraFov() {
        try {
            CameraManager cameras = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
            if (cameras == null) return null;
            for (String id : cameras.getCameraIdList()) {
                CameraCharacteristics c = cameras.getCameraCharacteristics(id);
                Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                if (facing == null || facing != CameraCharacteristics.LENS_FACING_FRONT) continue;
                SizeF sensor = c.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
                float[] focal = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
                if (sensor == null || focal == null || focal.length == 0) continue;
                // The physical size is the whole pixel array's; the picture comes from its active part.
                Size array = c.get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE);
                Rect active = c.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE);
                float w = sensor.getWidth();
                float h = sensor.getHeight();
                if (array != null && active != null && array.getWidth() > 0 && array.getHeight() > 0) {
                    w *= (float) active.width() / array.getWidth();
                    h *= (float) active.height() / array.getHeight();
                }
                double f = focal[0];
                double longSide = Math.toDegrees(2 * Math.atan(Math.max(w, h) / (2 * f)));
                double shortSide = Math.toDegrees(2 * Math.atan(Math.min(w, h) / (2 * f)));
                return new float[] {(float) longSide, (float) shortSide};
            }
        } catch (Exception unavailable) {
            // No camera details: the page assumes a typical front camera.
        }
        return null;
    }

    // --- Haptics ------------------------------------------------------------------------------

    @SuppressWarnings("deprecation")
    private void buzz(String kind) {
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] timings;
        int[] amplitudes;
        switch (kind) {
            case "tick":
                timings = new long[] {0, 7};
                amplitudes = new int[] {0, 45};
                break;
            case "lift":
                timings = new long[] {0, 14};
                amplitudes = new int[] {0, 90};
                break;
            case "place":
                timings = new long[] {0, 18};
                amplitudes = new int[] {0, 140};
                break;
            case "harmony":
                timings = new long[] {0, 22, 70, 30};
                amplitudes = new int[] {0, 110, 0, 70};
                break;
            case "discord":
                timings = new long[] {0, 60, 45, 90};
                amplitudes = new int[] {0, 200, 0, 150};
                break;
            case "fling":
                timings = new long[] {0, 110};
                amplitudes = new int[] {0, 190};
                break;
            case "complete":
                timings = new long[] {0, 30, 60, 30, 60, 90};
                amplitudes = new int[] {0, 140, 0, 160, 0, 255};
                break;
            case "restart":
                timings = new long[] {0, 80, 40, 80};
                amplitudes = new int[] {0, 180, 0, 120};
                break;
            default:
                return;
        }
        if (Build.VERSION.SDK_INT >= 26) {
            vibrator.vibrate(vibrator.hasAmplitudeControl()
                    ? VibrationEffect.createWaveform(timings, amplitudes, -1)
                    : VibrationEffect.createWaveform(timings, -1));
        } else {
            vibrator.vibrate(timings, -1);
        }
    }

    // --- Music ----------------------------------------------------------------------------------

    private MediaPlayer music;
    private boolean musicReady;
    private boolean musicAway; // the game is out of sight
    private float musicLevel; // as the page asks, 0 to 1
    private float musicNow; // as heard, easing toward it
    private final Handler musicFade = new Handler(Looper.getMainLooper());
    private final Runnable musicStep = this::stepMusic;

    private void setMusic(float level) {
        musicLevel = Math.max(0f, Math.min(1f, level));
        if (musicLevel > 0 && music == null) openMusic();
        musicFade.removeCallbacks(musicStep);
        musicFade.post(musicStep);
    }

    // Never given audio focus (it is never asked for): other apps play on, and this mixes in.
    private void openMusic() {
        try (AssetFileDescriptor fd = getAssets().openFd("www/assets/music.mp3")) {
            MediaPlayer player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
            player.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
            player.setLooping(true);
            player.setVolume(0f, 0f);
            player.setOnPreparedListener(prepared -> {
                musicReady = true;
                musicFade.post(musicStep);
            });
            player.prepareAsync();
            music = player;
        } catch (IOException | RuntimeException failed) {
            music = null; // without it the game is simply quieter
        }
    }

    // Eased toward the level asked for (over a second or so), playing while above silence and
    // paused once it reaches it.
    private void stepMusic() {
        if (music == null || !musicReady) return;
        float target = musicAway ? 0f : musicLevel;
        musicNow += (target - musicNow) * 0.1f;
        if (Math.abs(target - musicNow) < 0.004f) musicNow = target;
        music.setVolume(musicNow, musicNow);
        if (musicNow > 0 && !music.isPlaying()) music.start();
        if (musicNow == 0 && music.isPlaying()) music.pause();
        if (musicNow != target) musicFade.postDelayed(musicStep, 30);
    }

    private void pauseMusic() {
        musicAway = true;
        musicFade.removeCallbacks(musicStep);
        if (music != null && musicReady && music.isPlaying()) music.pause();
        musicNow = 0;
    }

    private void resumeMusic() {
        musicAway = false;
        musicFade.post(musicStep);
    }

    /** Called from the page as window.KalTohAndroid. */
    private final class Bridge {
        @JavascriptInterface
        public void music(float level) {
            runOnUiThread(() -> setMusic(level));
        }

        @JavascriptInterface
        public void haptic(String kind) {
            runOnUiThread(() -> buzz(kind));
        }

        @JavascriptInterface
        public void hologram(boolean on) {
            runOnUiThread(() -> setHologram(on));
        }

        @JavascriptInterface
        public String device() {
            return deviceInfo;
        }

        @JavascriptInterface
        public String insets() {
            return String.format(Locale.US, "{\"top\":%.1f,\"bottom\":%.1f}", insetTop, insetBottom);
        }
    }

    // --- Serving the game from assets ---------------------------------------------------------

    private final class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String scheme = url.getScheme();
            if (!"https".equals(scheme) && !"http".equals(scheme)) return null; // data: and the like
            if (!HOST.equals(url.getHost())) {
                // The game is entirely local; nothing else may load.
                return response(403, "Forbidden", "text/plain", new ByteArrayInputStream(new byte[0]));
            }
            String path = url.getPath();
            if (path == null || path.contains("..")) {
                return response(404, "Not Found", "text/plain", new ByteArrayInputStream(new byte[0]));
            }
            try {
                InputStream in = getAssets().open(path.substring(1), AssetManager.ACCESS_STREAMING);
                return response(200, "OK", mimeOf(path), in);
            } catch (IOException missing) {
                return response(404, "Not Found", "text/plain", new ByteArrayInputStream(new byte[0]));
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !HOST.equals(request.getUrl().getHost());
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            pageReady = true;
            view.requestApplyInsets();
        }
    }

    private static WebResourceResponse response(int status, String reason, String mime, InputStream body) {
        String encoding = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json") ? "utf-8" : null;
        return new WebResourceResponse(mime, encoding, status, reason, null, body);
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase(Locale.US);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".otf")) return "font/otf";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }
}
