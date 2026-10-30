// The Android shell exposes `KalTohAndroid` (see MainActivity.java). In a plain browser these
// calls do nothing, so the game also runs on a desktop for development.
const bridge = window.KalTohAndroid;

export const native = {
  present: Boolean(bridge),
  // The shell plays the recordings looping beneath the play itself - the room ('music') and the
  // music ('theme') - alongside other apps' sound (a page's would silence them).
  plays(loop) {
    return typeof bridge?.[loop] === 'function';
  },
  play(loop, level) {
    try {
      bridge?.[loop](level);
    } catch {
      // Without it, the game is simply quieter.
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
