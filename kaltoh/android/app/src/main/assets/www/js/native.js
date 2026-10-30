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
  // The game in play, written down by the shell at once (keep.js), and read back.
  keep(text) {
    try {
      bridge?.keep?.(text);
    } catch {
      // The page's own storage keeps it still.
    }
  },
  kept() {
    try {
      return bridge?.kept?.() || null;
    } catch {
      return null;
    }
  },
  // A sound felt: its signature (audio.js feel), played by the shell's vibrator; and whether
  // vibration is on at all (the shell makes the music's notes felt only then).
  feel(kind, strength) {
    try {
      bridge?.feel?.(kind, strength);
    } catch {
      // Haptics are a courtesy; never let them interrupt play.
    }
  },
  vibration(on) {
    try {
      bridge?.vibration?.(Boolean(on));
    } catch {
      // As above.
    }
  },
};
