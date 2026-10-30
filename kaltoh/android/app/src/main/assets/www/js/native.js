// The Android shell exposes `KalTohAndroid` (see MainActivity.java). In a plain browser these
// calls do nothing, so the game also runs on a desktop for development.
const bridge = window.KalTohAndroid;

export const native = {
  present: Boolean(bridge),
  // The shell plays the music itself, alongside other apps' sound (a page's would silence them).
  get music() {
    return typeof bridge?.music === 'function';
  },
  playMusic(level) {
    try {
      bridge?.music(level);
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
