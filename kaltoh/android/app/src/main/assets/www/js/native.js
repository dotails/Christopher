// The Android shell exposes `KalTohAndroid` (see MainActivity.java). In a plain browser these
// calls do nothing, so the game also runs on a desktop for development.
const bridge = window.KalTohAndroid;

export const native = {
  present: Boolean(bridge),
  get hologram() {
    return Boolean(bridge?.hologram);
  },
  // Ask the shell to start or stop following the player's face.
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
