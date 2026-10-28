// The Android shell exposes `KalTohAndroid` (see MainActivity.java). In a plain browser these
// calls do nothing, so the game also runs on a desktop for development.
const bridge = window.KalTohAndroid;

export const native = {
  present: Boolean(bridge),
  haptic(kind) {
    try {
      bridge?.haptic(kind);
    } catch {
      // Haptics are a courtesy; never let them interrupt play.
    }
  },
};
