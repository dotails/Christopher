package com.dotails.kaltoh;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
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
 */
public class MainActivity extends Activity implements SensorEventListener {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    // Linear acceleration (m/s^2) worth reporting; the page decides what counts as a shake.
    private static final float SHAKE_FLOOR = 6f;
    private static final long SHAKE_INTERVAL_MS = 33;

    private WebView web;
    private SensorManager sensors;
    private Sensor motion;
    private boolean linearSensor;
    private final float[] gravity = new float[3];
    private long lastShakeSample;
    private Vibrator vibrator;
    private volatile boolean pageReady;
    private volatile float insetTop;
    private volatile float insetBottom;

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
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            readInsets(insets);
            return v.onApplyWindowInsets(insets);
        });
        setContentView(web);
        immerse();

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
        if (pageReady) run("window.kaltoh&&window.kaltoh.resume()");
    }

    @Override
    protected void onPause() {
        if (pageReady) run("window.kaltoh&&window.kaltoh.pause()");
        if (sensors != null) sensors.unregisterListener(this);
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
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

    /** Called from the page as window.KalTohAndroid. */
    private final class Bridge {
        @JavascriptInterface
        public void haptic(String kind) {
            runOnUiThread(() -> buzz(kind));
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
        return "application/octet-stream";
    }
}
