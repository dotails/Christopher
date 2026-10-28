// The Android shell exposes `KalTohAndroid` (see MainActivity.java). In a plain browser these
// calls do nothing, so the game also runs on a desktop for development.
const bridge = window.KalTohAndroid;

export const native = {
  present: Boolean(bridge),
  get hologram() {
    return Boolean(bridge?.hologram);
  },
  // The phone's screen and front camera, for the hologram's window: { xdpi, ydpi, fovLong,
  // fovShort, cutout: { x, y } (the camera's hole in the screen, in device pixels) }, or null.
  device() {
    try {
      return JSON.parse(bridge?.device?.() ?? 'null');
    } catch {
      return null;
    }
  },
  // Ask the shell to follow the player's face itself (when the page cannot watch the camera).
  setHologram(on) {
    try {
      bridge?.hologram(on);
    } catch {
      // Without the camera the view simply stays still.
    }
  },
  haptic(kind) {
    try {
      bridge?.haptic(kind);
    } catch {
      // Haptics are a courtesy; never let them interrupt play.
    }
  },
};
