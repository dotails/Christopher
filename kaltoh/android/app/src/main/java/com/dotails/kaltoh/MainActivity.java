package com.dotails.kaltoh;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.audiofx.LoudnessEnhancer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationAttributes;
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

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;

/**
 * Hosts the game - a WebGL page in assets/www - full screen, and lends it the phone's senses:
 * the accelerometer for shake-to-begin-anew, and the vibrator, so that every sound is felt.
 *
 * Pages are served from the APK's assets under a private https origin, so the game's ES
 * modules, textures and fonts load as same-origin content without touching the network.
 *
 * The game's room and music play here rather than in the page: a page's media takes the phone's
 * audio focus, which pauses whatever else is playing. These players never ask for it, so they play
 * along with any other app's sound.
 */
public class MainActivity extends Activity implements SensorEventListener {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    // Linear acceleration (m/s^2) worth reporting; the page decides what counts as a shake.
    private static final float SHAKE_FLOOR = 6f;
    private static final long SHAKE_INTERVAL_MS = 33;
    // Where the game in play is kept between sessions, with the levels of the room and the music
    // (so they begin at once, before the page is loaded) and whether vibration is on.
    private static final String KEPT = "kaltoh";
    private static final String KEPT_GAME = "game";
    private static final String KEPT_FEEL = "vibration";

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
        readHaptics();
        readNotes();
        // The room and the music begin at once, as they were last left (onResume): not only once
        // the page is loaded and asks for them.
        SharedPreferences kept = getSharedPreferences(KEPT, MODE_PRIVATE);
        room.recall(kept);
        theme.recall(kept);
        feeling = kept.getBoolean(KEPT_FEEL, true);

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
        resumeMusic();
        if (pageReady) run("window.kaltoh&&window.kaltoh.resume()");
    }

    @Override
    protected void onPause() {
        pauseMusic();
        if (pageReady) run("window.kaltoh&&window.kaltoh.pause()");
        if (sensors != null) sensors.unregisterListener(this);
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        fade.removeCallbacksAndMessages(null);
        room.release();
        theme.release();
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

    // Every sound felt as well as heard (feel, from the page; the music's notes, here): a signature
    // for each kind, as strong as the sound. Where the phone has tuned haptic primitives - crisp
    // clicks and ticks, thuds, swells - they are composed; elsewhere the motor is driven in pulses
    // long and strong enough to be felt on any phone (a few milliseconds, as some once were, are felt
    // on none). Felt as a game's are, with its media.
    private static final int CLICK = 0, TICK = 1, LOW = 2, THUD = 3, RISE = 4, FALL = 5, SWELL = 6;
    private static final AudioAttributes FELT_AS = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    private boolean composes; // the phone's tuned primitives: click, tick and low tick
    private boolean thuds; // ... and a thud
    private boolean swells; // ... and rises and falls
    private volatile boolean feeling = true; // vibration on (the page's setting)
    private long feltUntil; // a signature felt until then (uptime ms): the music's notes wait for it

    private void readHaptics() {
        if (vibrator != null && !vibrator.hasVibrator()) vibrator = null;
        if (vibrator == null || Build.VERSION.SDK_INT < 31) return;
        composes = vibrator.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK,
                VibrationEffect.Composition.PRIMITIVE_TICK, VibrationEffect.Composition.PRIMITIVE_LOW_TICK);
        thuds = composes && vibrator.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_THUD);
        swells = composes && vibrator.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_QUICK_RISE,
                VibrationEffect.Composition.PRIMITIVE_SLOW_RISE, VibrationEffect.Composition.PRIMITIVE_QUICK_FALL);
    }

    // A sound's signature, at its strength (0 to 1).
    private void feel(String kind, float strength) {
        if (vibrator == null) return;
        float s = Math.max(0f, Math.min(1f, strength));
        Signature f = new Signature();
        switch (kind) {
            case "tick": f.beat(TICK, 0.5f + 0.5f * s, 20); break;
            case "tap": f.beat(CLICK, 0.3f + 0.7f * s, 22); break;
            case "lift": f.beat(CLICK, 0.75f, 30); break;
            case "place": f.beat(CLICK, 1f, 35).pause(25).beat(CLICK, 0.75f, 25); break;
            case "knock": f.beat(THUD, 0.45f + 0.55f * s, 45); break;
            case "slide": f.beat(LOW, 0.3f + 0.6f * s, 16); break;
            case "grind": f.beat(LOW, 0.35f + 0.6f * s, 22).pause(20).beat(LOW, 0.3f + 0.5f * s, 18); break;
            case "toss": f.beat(FALL, 0.35f + 0.65f * s, 45); break;
            case "harmony":
                // Rising, as the chord does, note by note.
                for (int i = 0; i < 4; i++) f.pause(i == 0 ? 0 : 45).beat(CLICK, (0.45f + 0.15f * i) * (0.6f + 0.4f * s), 22);
                break;
            case "hoop":
                // A ring of strikes, a moment after.
                f.pause(240);
                for (int i = 0; i < 5; i++) f.pause(i == 0 ? 0 : 45).beat(i < 4 ? TICK : CLICK, 0.6f + 0.1f * i, 20);
                break;
            case "wobble":
                for (int i = 0; i < 3; i++) f.pause(i == 0 ? 0 : 260).beat(LOW, 0.8f, 70);
                break;
            case "discord": f.beat(THUD, 1f, 70).pause(50).beat(THUD, 0.85f, 100); break;
            case "fling": f.beat(SWELL, 1f, 90).beat(FALL, 0.85f, 70); break;
            case "dissolve": f.beat(RISE, 0.9f, 80).beat(FALL, 0.75f, 120); break;
            case "complete":
                // Whole: strikes rising, then a swell and a knock.
                for (int i = 0; i < 8; i++) f.pause(i == 0 ? 0 : 80).beat(CLICK, 0.5f + 0.07f * i, 25);
                f.pause(160).beat(SWELL, 1f, 150).beat(THUD, 1f, 80);
                break;
            case "note": f.beat(s > 0.55f ? CLICK : TICK, 0.25f + 0.6f * s, 18); break;
            default: return;
        }
        if (!"note".equals(kind)) feltUntil = SystemClock.uptimeMillis() + f.length;
        f.play();
    }

    private int primitive(int kind) {
        switch (kind) {
            case TICK: return VibrationEffect.Composition.PRIMITIVE_TICK;
            case LOW: return VibrationEffect.Composition.PRIMITIVE_LOW_TICK;
            case THUD: return thuds ? VibrationEffect.Composition.PRIMITIVE_THUD : VibrationEffect.Composition.PRIMITIVE_CLICK;
            case RISE: return swells ? VibrationEffect.Composition.PRIMITIVE_QUICK_RISE : VibrationEffect.Composition.PRIMITIVE_CLICK;
            case SWELL: return swells ? VibrationEffect.Composition.PRIMITIVE_SLOW_RISE : VibrationEffect.Composition.PRIMITIVE_CLICK;
            case FALL: return swells ? VibrationEffect.Composition.PRIMITIVE_QUICK_FALL : VibrationEffect.Composition.PRIMITIVE_TICK;
            default: return VibrationEffect.Composition.PRIMITIVE_CLICK;
        }
    }

    /** Beats felt one after another: tuned primitives where the phone has them, pulses elsewhere. */
    private final class Signature {
        private final Object composition; // a VibrationEffect.Composition, on phones that compose
        private final long[] timings = new long[64];
        private final int[] amplitudes = new int[64];
        private int count;
        private long pause;
        long length; // ms, as pulses

        Signature() {
            composition = composes && Build.VERSION.SDK_INT >= 31 ? VibrationEffect.startComposition() : null;
        }

        Signature pause(long ms) {
            pause += ms;
            return this;
        }

        // A beat of the given kind and strength; as a pulse, `ms` long (and never shorter than a
        // motor can be felt to turn).
        Signature beat(int kind, float strength, long ms) {
            if (count + 2 > timings.length) return this;
            if (Build.VERSION.SDK_INT >= 31 && composition != null) {
                ((VibrationEffect.Composition) composition).addPrimitive(primitive(kind), strength, (int) pause);
            }
            long on = Math.max(ms, kind == THUD || kind == SWELL ? 40 : 20);
            timings[count] = pause;
            amplitudes[count++] = 0;
            timings[count] = on;
            amplitudes[count++] = Math.round(70 + 185 * strength);
            length += pause + on;
            pause = 0;
            return this;
        }

        @SuppressWarnings("deprecation")
        void play() {
            if (count == 0) return;
            try {
                long[] t = Arrays.copyOf(timings, count);
                if (Build.VERSION.SDK_INT < 26) {
                    vibrator.vibrate(t, -1);
                    return;
                }
                VibrationEffect effect = Build.VERSION.SDK_INT >= 31 && composition != null
                        ? ((VibrationEffect.Composition) composition).compose()
                        : vibrator.hasAmplitudeControl()
                                ? VibrationEffect.createWaveform(t, Arrays.copyOf(amplitudes, count), -1)
                                : VibrationEffect.createWaveform(t, -1);
                if (Build.VERSION.SDK_INT >= 33) {
                    vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_MEDIA));
                } else {
                    vibrator.vibrate(effect, FELT_AS);
                }
            } catch (RuntimeException refused) {
                // A phone that will not have it: the game is simply not felt.
            }
        }
    }

    // The music felt as well as heard: each note the piano strikes (assets/theme-notes.json, found
    // in the recording by tools/make_theme_notes.py) a light tap as it sounds, as hard as it was
    // played and as loud as the music is heard - never over a signature still being felt.
    private int[] noteAt = new int[0]; // ms into the recording
    private float[] noteForce = new float[0];
    private int nextNote;
    private int noteWas = -1; // where the music was when last looked at (ms)
    private final Runnable noteStep = this::stepNotes;

    private void readNotes() {
        try (InputStream in = getAssets().open("www/assets/theme-notes.json")) {
            ByteArrayOutputStream text = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            for (int n; (n = in.read(chunk)) > 0; ) text.write(chunk, 0, n);
            JSONArray notes = new JSONObject(new String(text.toByteArray(), StandardCharsets.UTF_8)).getJSONArray("notes");
            int[] at = new int[notes.length()];
            float[] force = new float[notes.length()];
            for (int i = 0; i < at.length; i++) {
                JSONArray note = notes.getJSONArray(i);
                at[i] = note.getInt(0);
                force[i] = (float) note.getDouble(1);
            }
            noteAt = at;
            noteForce = force;
        } catch (IOException | JSONException | RuntimeException none) {
            noteAt = new int[0]; // the music is only heard
            noteForce = new float[0];
        }
    }

    private void stepNotes() {
        fade.removeCallbacks(noteStep);
        MediaPlayer player = theme.player;
        if (!feeling || vibrator == null || player == null || !theme.ready || noteAt.length == 0) return;
        int at;
        try {
            if (!player.isPlaying()) return;
            at = player.getCurrentPosition();
        } catch (IllegalStateException letGo) {
            return;
        }
        // Begun, come round again, or taken up somewhere new: from the notes still to come.
        if (noteWas < 0 || at < noteWas || at - noteWas > 500) {
            nextNote = 0;
            while (nextNote < noteAt.length && noteAt[nextNote] < at - 20) nextNote++;
        }
        while (nextNote < noteAt.length && noteAt[nextNote] <= at) {
            float force = noteForce[nextNote] * theme.now;
            if (force > 0.05f && SystemClock.uptimeMillis() >= feltUntil) feel("note", force);
            nextNote++;
        }
        noteWas = at;
        fade.postDelayed(noteStep, 15);
    }

    // --- Music ----------------------------------------------------------------------------------

    // The recordings looping beneath the play, each in a player of its own: the room, and the
    // music. Each is raised past what its player's own volume allows, by this much (millibels),
    // with the effect's own limiting to keep it clean.
    private static final int LOOP_BOOST_MB = 400;
    private final Loop room = new Loop("www/assets/music.mp3", "room", 1f);
    private final Loop theme = new Loop("www/assets/theme.mp3", "theme", 0.5f);
    private boolean away; // the game is out of sight
    private final Handler fade = new Handler(Looper.getMainLooper());

    // Out of sight, each player is let go, and its loudness effect with it, keeping only where it
    // was: coming back, a fresh one takes it up there from silence. (Paused and started again, the
    // same player came back, now and then, with a pop.)
    private void pauseMusic() {
        away = true;
        room.pause();
        theme.pause();
    }

    private void resumeMusic() {
        away = false;
        room.resume();
        theme.resume();
    }

    /** One recording, looping, at the level the page asks for (kept, to begin at next time). */
    private final class Loop {
        private final String asset;
        private final String key;
        private MediaPlayer player;
        private LoudnessEnhancer louder;
        private boolean ready;
        private int at; // where it was when the game went out of sight (ms), to take it up there
        private float level; // as the page asks, 0 to 1
        private float now; // as heard, easing toward it
        private final Runnable step = this::step;

        Loop(String asset, String key, float level) {
            this.asset = asset;
            this.key = key;
            this.level = level;
        }

        void recall(SharedPreferences kept) {
            level = Math.max(0f, Math.min(1f, kept.getFloat(key, level)));
        }

        void set(float asked) {
            float was = level;
            level = Math.max(0f, Math.min(1f, asked));
            if (level != was) getSharedPreferences(KEPT, MODE_PRIVATE).edit().putFloat(key, level).apply();
            if (level > 0 && player == null) open();
            fade.removeCallbacks(step);
            fade.post(step);
        }

        // Never given audio focus (it is never asked for): other apps play on, and this mixes in.
        private void open() {
            try (AssetFileDescriptor fd = getAssets().openFd(asset)) {
                MediaPlayer opened = new MediaPlayer();
                opened.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_GAME)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build());
                opened.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
                opened.setLooping(true);
                opened.setVolume(0f, 0f);
                opened.setOnPreparedListener(prepared -> {
                    if (at <= 0) {
                        ready(prepared);
                        return;
                    }
                    prepared.setOnSeekCompleteListener(this::ready);
                    prepared.seekTo(at);
                });
                opened.prepareAsync();
                player = opened;
                try {
                    louder = new LoudnessEnhancer(opened.getAudioSessionId());
                    louder.setTargetGain(LOOP_BOOST_MB);
                    louder.setEnabled(true);
                } catch (RuntimeException unsupported) {
                    louder = null; // a phone without the effect plays it as loud as it is
                }
            } catch (IOException | RuntimeException failed) {
                player = null; // without it the game is simply quieter
            }
        }

        private void ready(MediaPlayer prepared) {
            if (prepared != player) return; // let go of meanwhile
            ready = true;
            fade.post(step);
        }

        // Eased toward the level asked for (over a second or so), playing while above silence and
        // paused once it reaches it. It starts from nothing: begun at once at any level, it would
        // come in with a click.
        private void step() {
            if (player == null || !ready) return;
            float target = away ? 0f : level;
            if (target > 0 && !player.isPlaying()) {
                now = 0;
                player.setVolume(0f, 0f);
                player.start();
                fade.postDelayed(step, 30);
                if (this == theme) {
                    noteWas = -1;
                    fade.post(noteStep);
                }
                return;
            }
            now += (target - now) * 0.1f;
            if (Math.abs(target - now) < 0.004f) now = target;
            player.setVolume(now, now);
            if (now == 0 && player.isPlaying()) player.pause();
            if (now != target) fade.postDelayed(step, 30);
        }

        void pause() {
            fade.removeCallbacks(step);
            if (player != null) {
                if (ready) at = player.getCurrentPosition();
                release();
            }
            now = 0;
        }

        void resume() {
            if (level > 0 && player == null) open();
            fade.post(step);
        }

        void release() {
            if (louder != null) {
                louder.release();
                louder = null;
            }
            if (player != null) {
                player.release();
                player = null;
            }
            ready = false;
        }
    }

    /** Called from the page as window.KalTohAndroid. */
    private final class Bridge {
        // The room.
        @JavascriptInterface
        public void music(float level) {
            runOnUiThread(() -> room.set(level));
        }

        // The music.
        @JavascriptInterface
        public void theme(float level) {
            runOnUiThread(() -> theme.set(level));
        }

        // A sound felt (its kind and strength, from audio.js).
        @JavascriptInterface
        public void feel(String kind, float strength) {
            runOnUiThread(() -> MainActivity.this.feel(kind, strength));
        }

        // Vibration on or off: the music's notes are felt only while it is on.
        @JavascriptInterface
        public void vibration(boolean on) {
            runOnUiThread(() -> {
                if (feeling == on) return;
                feeling = on;
                getSharedPreferences(KEPT, MODE_PRIVATE).edit().putBoolean(KEPT_FEEL, on).apply();
                noteWas = -1;
                fade.post(noteStep);
            });
        }

        // The game in play (keep.js), written down as soon as it is given: the page's own storage
        // writes it only some seconds later, and the app may be closed sooner.
        @JavascriptInterface
        public void keep(String text) {
            SharedPreferences.Editor kept = getSharedPreferences(KEPT, MODE_PRIVATE).edit();
            if (text == null || text.isEmpty()) kept.remove(KEPT_GAME);
            else kept.putString(KEPT_GAME, text);
            kept.apply();
        }

        @JavascriptInterface
        public String kept() {
            return getSharedPreferences(KEPT, MODE_PRIVATE).getString(KEPT_GAME, null);
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
