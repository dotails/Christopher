package com.dotails.kaltoh;

import android.graphics.Bitmap;
import android.graphics.ImageFormat;
import android.graphics.PointF;
import android.graphics.Rect;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.Face;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetectorOptions;
import com.google.mlkit.vision.face.FaceLandmark;

import java.nio.ShortBuffer;
import java.util.List;
import java.util.concurrent.Executor;

/**
 * Follows the player's head with the front camera, unseen (nothing is ever displayed or kept), so
 * the game can draw the screen as a window onto the kal-toh.
 *
 * Every preview frame it can keep up with goes to ML Kit's face detector, whose model is bundled
 * in the app: the largest face, its two eyes, and how far the head is turned, in the upright
 * picture. The eyes' spacing gives the head's distance and their middle its direction (head.js).
 * A frame that arrives while the last is still being read is handed straight back, so what is
 * found is always fresh.
 *
 * If ML Kit cannot run here, the camera's own face detection, or failing that
 * android.media.FaceDetector on small grey frames, finds the face more roughly: its centre and
 * size, reported as the player sees themselves in a mirror, x from -1 (left) to 1 (right) and y
 * from -1 (top) to 1 (bottom).
 */
@SuppressWarnings("deprecation") // android.hardware.Camera: small, universal, and enough here
final class HeadTracker implements Camera.FaceDetectionListener, Camera.PreviewCallback {

    interface Listener {
        /**
         * A face found by ML Kit, in an upright picture of width x height pixels as the camera sees
         * it (not mirrored): the player's own left and right eyes (NaN where not found), the middle
         * and width of the box round the face, how far the head is turned aside (degrees), and how
         * old the picture is (ms).
         */
        void onFace(float leftX, float leftY, float rightX, float rightY, float boxX, float boxY, float boxWidth,
                    int width, int height, float yaw, long age);

        /** A rougher sighting: the face's centre as in a mirror, and its size. */
        void onHead(float x, float y, float size);

        void onStatus(String status);

        /** What finds the face: "mlkit", "camera" (its own face detection) or "android". */
        void onEngine(String engine);
    }

    private static final long HARDWARE_GRACE_MS = 2500;
    // ML Kit wants faces of a fair size in pixels; at arm's length 640 x 480 gives it plenty.
    private static final int TARGET_PIXELS = 640 * 480;
    // From light reaching the sensor to the frame arriving here, roughly: its exposure and readout.
    private static final long CAMERA_LAG_MS = 30;
    // This many failed frames in a row, before any has succeeded, and ML Kit cannot run here.
    private static final int GIVE_UP_AFTER = 5;

    private final Listener listener;
    private final int displayDegrees;
    private HandlerThread thread;
    private Handler handler;
    // ML Kit's results come back on the tracker's own thread.
    private final Executor here = command -> {
        Handler h = handler;
        if (h != null) h.post(command);
    };
    private Camera camera;
    private SurfaceTexture texture;
    private int rotation; // clockwise degrees that make the camera's frames upright
    private int previewWidth;
    private int previewHeight;
    private com.google.mlkit.vision.face.FaceDetector finder;
    private boolean reading;
    private boolean worked;
    private int failures;
    private boolean hardware;
    private long hardwareStarted;
    private long lastHardwareEvent;
    private android.media.FaceDetector detector;
    private Bitmap frame;
    private short[] pixels;
    private int step;
    private final android.media.FaceDetector.Face[] found = new android.media.FaceDetector.Face[1];
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
            Camera.Size size = previewNear(params.getSupportedPreviewSizes());
            if (size != null) params.setPreviewSize(size.width, size.height);
            params.setPreviewFormat(ImageFormat.NV21);
            // As many frames a second as the camera offers, so sightings are frequent and fresh.
            int[] fastest = fastestRange(params.getSupportedPreviewFpsRange());
            if (fastest != null) params.setPreviewFpsRange(fastest[0], fastest[1]);
            camera.setParameters(params);
            Camera.Size actual = camera.getParameters().getPreviewSize();
            previewWidth = actual.width;
            previewHeight = actual.height;
            texture = new SurfaceTexture(17);
            camera.setPreviewTexture(texture);
            camera.startPreview();
            try {
                finder = FaceDetection.getClient(new FaceDetectorOptions.Builder()
                        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                        .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
                        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
                        .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
                        .setMinFaceSize(0.15f)
                        .build());
                int bytes = previewWidth * previewHeight * 3 / 2;
                for (int i = 0; i < 3; i++) camera.addCallbackBuffer(new byte[bytes]);
                camera.setPreviewCallbackWithBuffer(this);
                listener.onEngine("mlkit");
            } catch (Throwable unavailable) { // its native library may be missing on this phone
                finder = null;
                rough();
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
        if (finder != null) {
            finder.close();
            finder = null;
        }
        if (texture != null) {
            texture.release();
            texture = null;
        }
        hardware = false;
    }

    // The preview size nearest 640 x 480, preferring the sensor's 4:3 shape.
    private static Camera.Size previewNear(List<Camera.Size> sizes) {
        Camera.Size best = null;
        long bestScore = Long.MAX_VALUE;
        for (Camera.Size s : sizes) {
            long pixels = (long) s.width * s.height;
            if (pixels < 320 * 240) continue;
            long score = Math.abs(pixels - TARGET_PIXELS) + (s.width * 3 == s.height * 4 ? 0 : TARGET_PIXELS / 4);
            if (score < bestScore) {
                bestScore = score;
                best = s;
            }
        }
        return best;
    }

    // The preview frame-rate range with the highest ceiling (and, of those, the highest floor).
    private static int[] fastestRange(List<int[]> ranges) {
        if (ranges == null) return null;
        int[] best = null;
        for (int[] r : ranges) {
            if (best == null || r[1] > best[1] || (r[1] == best[1] && r[0] > best[0])) best = r;
        }
        return best;
    }

    @Override
    public void onPreviewFrame(byte[] data, Camera cam) {
        if (finder != null) {
            if (reading) cam.addCallbackBuffer(data);
            else read(data, cam);
            return;
        }
        if (detector != null) findFace(data);
        cam.addCallbackBuffer(data);
    }

    // One frame to ML Kit; its buffer goes back to the camera once the frame has been read.
    private void read(byte[] data, Camera cam) {
        reading = true;
        long taken = SystemClock.uptimeMillis() - CAMERA_LAG_MS;
        InputImage image = InputImage.fromByteArray(data, previewWidth, previewHeight, rotation, InputImage.IMAGE_FORMAT_NV21);
        finder.process(image)
                .addOnSuccessListener(here, faces -> {
                    worked = true;
                    failures = 0;
                    report(faces, taken);
                })
                .addOnFailureListener(here, error -> {
                    if (!worked && ++failures >= GIVE_UP_AFTER) withoutMlKit();
                })
                .addOnCompleteListener(here, task -> {
                    reading = false;
                    if (camera == cam) cam.addCallbackBuffer(data);
                });
    }

    // The largest face: its eyes and the box round it.
    private void report(List<Face> faces, long taken) {
        Face best = null;
        long bestArea = 0;
        for (Face f : faces) {
            Rect r = f.getBoundingBox();
            long area = (long) r.width() * r.height();
            if (best == null || area > bestArea) {
                best = f;
                bestArea = area;
            }
        }
        if (best == null) return;
        boolean turned = rotation % 180 != 0;
        FaceLandmark left = best.getLandmark(FaceLandmark.LEFT_EYE);
        FaceLandmark right = best.getLandmark(FaceLandmark.RIGHT_EYE);
        Rect box = best.getBoundingBox();
        listener.onFace(
                left != null ? left.getPosition().x : Float.NaN, left != null ? left.getPosition().y : Float.NaN,
                right != null ? right.getPosition().x : Float.NaN, right != null ? right.getPosition().y : Float.NaN,
                box.exactCenterX(), box.exactCenterY(), box.width(),
                turned ? previewHeight : previewWidth, turned ? previewWidth : previewHeight,
                best.getHeadEulerAngleY(), SystemClock.uptimeMillis() - taken);
    }

    // ML Kit will not run: find the face the rougher ways.
    private void withoutMlKit() {
        if (finder == null || camera == null) return;
        finder.close();
        finder = null;
        camera.setPreviewCallbackWithBuffer(null);
        rough();
    }

    // The camera's own face detection where it has it, else android.media.FaceDetector.
    private void rough() {
        if (camera.getParameters().getMaxNumDetectedFaces() > 0) {
            try {
                camera.setFaceDetectionListener(this);
                camera.startFaceDetection();
                hardware = true;
                hardwareStarted = SystemClock.uptimeMillis();
                handler.postDelayed(this::checkHardware, HARDWARE_GRACE_MS);
                listener.onEngine("camera");
                return;
            } catch (RuntimeException unsupported) {
                camera.setFaceDetectionListener(null);
            }
        }
        useSoftware();
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
        // Upright, greyscale, and small: about 128 pixels across, quick to search.
        boolean turned = rotation % 180 != 0;
        int uprightWidth = turned ? previewHeight : previewWidth;
        step = Math.max(1, uprightWidth / 128);
        int w = (uprightWidth / step) & ~1; // FaceDetector needs an even width
        int h = (turned ? previewWidth : previewHeight) / step;
        frame = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
        pixels = new short[w * h];
        detector = new android.media.FaceDetector(w, h, 1);
        int bytes = previewWidth * previewHeight * 3 / 2;
        camera.addCallbackBuffer(new byte[bytes]);
        camera.addCallbackBuffer(new byte[bytes]);
        camera.setPreviewCallbackWithBuffer(this);
        listener.onEngine("android");
    }

    @Override
    public void onFaceDetection(Camera.Face[] faces, Camera cam) {
        lastHardwareEvent = SystemClock.uptimeMillis();
        Camera.Face best = null;
        for (Camera.Face f : faces) if (best == null || f.score > best.score) best = f;
        if (best == null || best.score < 30) return;
        Rect r = best.rect;
        // Sensor coordinates run from -1000 to 1000; turn them upright like the frames.
        roughly(r.exactCenterX() / 1000f, r.exactCenterY() / 1000f, Math.max(r.width(), r.height()) / 2000f);
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
    private void roughly(float rx, float ry, float size) {
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
