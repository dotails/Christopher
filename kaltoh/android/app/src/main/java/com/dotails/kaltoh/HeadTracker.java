package com.dotails.kaltoh;

import android.graphics.Bitmap;
import android.graphics.PointF;
import android.graphics.Rect;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.media.FaceDetector;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;

import java.nio.ShortBuffer;
import java.util.List;

/**
 * Follows the player's face with the front camera, unseen (nothing is ever displayed), so the
 * game can shift its perspective like a hologram.
 *
 * It prefers the camera's own face detection; if that is missing or silent, it finds the face
 * itself in small grey preview frames with android.media.FaceDetector. Both need nothing beyond
 * the Android framework.
 *
 * Positions are reported as the player sees themselves in a mirror: x from -1 (left) to 1
 * (right), y from -1 (top) to 1 (bottom), and a size that grows as the face comes closer.
 */
@SuppressWarnings("deprecation") // android.hardware.Camera: small, universal, and enough here
final class HeadTracker implements Camera.FaceDetectionListener, Camera.PreviewCallback {

    interface Listener {
        void onHead(float x, float y, float size);

        void onStatus(String status);
    }

    private static final long HARDWARE_GRACE_MS = 2500;
    private static final long SOFTWARE_INTERVAL_MS = 70;
    private static final int TARGET_PIXELS = 320 * 240;

    private final Listener listener;
    private final int displayDegrees;
    private HandlerThread thread;
    private Handler handler;
    private Camera camera;
    private SurfaceTexture texture;
    private int rotation; // clockwise degrees that make the camera's frames upright
    private int previewWidth;
    private int previewHeight;
    private boolean hardware;
    private long hardwareStarted;
    private long lastHardwareEvent;
    private long lastSoftware;
    private FaceDetector detector;
    private Bitmap frame;
    private short[] pixels;
    private int step;
    private final FaceDetector.Face[] found = new FaceDetector.Face[1];
    private final PointF mid = new PointF();

    HeadTracker(Listener listener, int displayDegrees) {
        this.listener = listener;
        this.displayDegrees = displayDegrees;
    }

    void start() {
        if (thread != null) return;
        thread = new HandlerThread("kaltoh-head");
        thread.start();
        handler = new Handler(thread.getLooper());
        // The camera reports to the thread that opened it, keeping all of this off the UI thread.
        handler.post(this::open);
    }

    void stop() {
        if (thread == null) return;
        Handler h = handler;
        HandlerThread t = thread;
        handler = null;
        thread = null;
        h.post(() -> {
            close();
            t.quitSafely();
        });
    }

    private void open() {
        int id = -1;
        Camera.CameraInfo info = new Camera.CameraInfo();
        for (int i = 0; i < Camera.getNumberOfCameras(); i++) {
            Camera.getCameraInfo(i, info);
            if (info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT) {
                id = i;
                break;
            }
        }
        if (id < 0) {
            listener.onStatus("unavailable");
            return;
        }
        try {
            camera = Camera.open(id);
            rotation = (info.orientation + displayDegrees) % 360;
            Camera.Parameters params = camera.getParameters();
            Camera.Size size = smallPreview(params.getSupportedPreviewSizes());
            if (size != null) params.setPreviewSize(size.width, size.height);
            camera.setParameters(params);
            Camera.Size actual = camera.getParameters().getPreviewSize();
            previewWidth = actual.width;
            previewHeight = actual.height;
            texture = new SurfaceTexture(17);
            camera.setPreviewTexture(texture);
            camera.startPreview();
            if (params.getMaxNumDetectedFaces() > 0) {
                try {
                    camera.setFaceDetectionListener(this);
                    camera.startFaceDetection();
                    hardware = true;
                    hardwareStarted = SystemClock.uptimeMillis();
                    handler.postDelayed(this::checkHardware, HARDWARE_GRACE_MS);
                } catch (RuntimeException unsupported) {
                    camera.setFaceDetectionListener(null);
                    useSoftware();
                }
            } else {
                useSoftware();
            }
            listener.onStatus("on");
        } catch (RuntimeException | java.io.IOException e) {
            close();
            listener.onStatus("unavailable");
        }
    }

    private void close() {
        if (camera != null) {
            try {
                if (hardware) camera.stopFaceDetection();
            } catch (RuntimeException ignored) {
                // Already stopped.
            }
            camera.setPreviewCallbackWithBuffer(null);
            camera.setFaceDetectionListener(null);
            camera.stopPreview();
            camera.release();
            camera = null;
        }
        if (texture != null) {
            texture.release();
            texture = null;
        }
        hardware = false;
    }

    // The smallest preview near 320x240, preferring the sensor's 4:3 shape.
    private static Camera.Size smallPreview(List<Camera.Size> sizes) {
        Camera.Size best = null;
        long bestScore = Long.MAX_VALUE;
        for (Camera.Size s : sizes) {
            long pixels = (long) s.width * s.height;
            if (pixels < 160 * 120) continue;
            long score = Math.abs(pixels - TARGET_PIXELS) + (s.width * 3 == s.height * 4 ? 0 : TARGET_PIXELS / 4);
            if (score < bestScore) {
                bestScore = score;
                best = s;
            }
        }
        return best;
    }

    // Some cameras claim face detection but never report; then look for faces ourselves.
    private void checkHardware() {
        if (camera == null || !hardware) return;
        if (lastHardwareEvent < hardwareStarted) {
            try {
                camera.stopFaceDetection();
            } catch (RuntimeException ignored) {
                // Nothing to stop.
            }
            camera.setFaceDetectionListener(null);
            hardware = false;
            useSoftware();
        }
    }

    private void useSoftware() {
        // Upright, greyscale, and small: about 160 pixels across.
        boolean turned = rotation % 180 != 0;
        int uprightWidth = turned ? previewHeight : previewWidth;
        step = Math.max(1, uprightWidth / 160);
        int w = (uprightWidth / step) & ~1; // FaceDetector needs an even width
        int h = (turned ? previewWidth : previewHeight) / step;
        frame = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
        pixels = new short[w * h];
        detector = new FaceDetector(w, h, 1);
        int bytes = previewWidth * previewHeight * 3 / 2;
        camera.addCallbackBuffer(new byte[bytes]);
        camera.addCallbackBuffer(new byte[bytes]);
        camera.setPreviewCallbackWithBuffer(this);
    }

    @Override
    public void onFaceDetection(Camera.Face[] faces, Camera cam) {
        lastHardwareEvent = SystemClock.uptimeMillis();
        Camera.Face best = null;
        for (Camera.Face f : faces) if (best == null || f.score > best.score) best = f;
        if (best == null || best.score < 30) return;
        Rect r = best.rect;
        // Sensor coordinates run from -1000 to 1000; turn them upright like the frames.
        report(r.exactCenterX() / 1000f, r.exactCenterY() / 1000f, Math.max(r.width(), r.height()) / 2000f);
    }

    @Override
    public void onPreviewFrame(byte[] data, Camera cam) {
        long now = SystemClock.uptimeMillis();
        if (now - lastSoftware >= SOFTWARE_INTERVAL_MS && detector != null) {
            lastSoftware = now;
            findFace(data);
        }
        cam.addCallbackBuffer(data);
    }

    // Grey pixels from the frame's luminance, turned upright, then the strongest face.
    private void findFace(byte[] nv21) {
        int w = frame.getWidth();
        int h = frame.getHeight();
        int pw = previewWidth;
        int ph = previewHeight;
        for (int v = 0; v < h; v++) {
            for (int u = 0; u < w; u++) {
                int ux = u * step;
                int vy = v * step;
                int x;
                int y;
                switch (rotation) {
                    case 90: x = vy; y = ph - 1 - ux; break;
                    case 180: x = pw - 1 - ux; y = ph - 1 - vy; break;
                    case 270: x = pw - 1 - vy; y = ux; break;
                    default: x = ux; y = vy; break;
                }
                int g = nv21[y * pw + x] & 0xff;
                pixels[v * w + u] = (short) (((g >> 3) << 11) | ((g >> 2) << 5) | (g >> 3));
            }
        }
        frame.copyPixelsFromBuffer(ShortBuffer.wrap(pixels));
        found[0] = null;
        if (detector.findFaces(frame, found) < 1 || found[0] == null) return;
        if (found[0].confidence() < 0.3f) return;
        found[0].getMidPoint(mid);
        // Already upright: report as a mirror image.
        listener.onHead(1f - 2f * mid.x / w, 2f * mid.y / h - 1f, found[0].eyesDistance() / w);
    }

    // Raw sensor position (-1..1) to the player's mirror view.
    private void report(float rx, float ry, float size) {
        float ux;
        float uy;
        switch (rotation) {
            case 90: ux = -ry; uy = rx; break;
            case 180: ux = -rx; uy = -ry; break;
            case 270: ux = ry; uy = -rx; break;
            default: ux = rx; uy = ry; break;
        }
        listener.onHead(-ux, uy, size);
    }
}
