// The ways to play, and how the game presents itself. Remembered between sessions.
// Each label is a pair: v, what is written in Vulcan (letters only - the Vulcan fonts carry no
// digits or punctuation), and s, its Federation Standard translation.

// The game comes first; what follows depends on it. A choice may carry a line saying what it means.
export const OPTIONS = [
  {
    key: 'way', v: 'the game', s: 'The game',
    choices: [
      ['classic', 'the kal toh', 'The kal-toh', { v: 'join true neighbours until the jumble is a sphere', s: 'Join true neighbours until the jumble becomes the sphere' }],
      ['forms', 'many forms', 'Many forms', { v: 'a new form each game built from within', s: 'A new form each game: find its loops, build it from the inside out' }],
      ['zen', 'stillness', 'Zen', { v: 'lay tan across any two and let it take form', s: "Alone and calm: lay t'an across any two; every ten, a new form" }],
    ],
  },
  {
    // Zen is played alone.
    key: 'players', v: 'minds at the board', s: 'Players taking turns', when: (s) => s.way !== 'zen',
    choices: [[1, 'one', '1'], [2, 'two', '2'], [3, 'three', '3'], [4, 'four', '4']],
    value: 2, // at first: two, passing and playing
  },
  // Sliders: drawn along their groove under the base, from silent to full.
  // The mess hall around the stone: its hum, its air, the voices in it.
  { key: 'music', v: 'the room', s: 'Room', slider: true, value: 1 },
  { key: 'sfx', v: 'the sound of the tan', s: 'Sound effects', slider: true, value: 0.8 },
  // The voice guiding the play aloud, for every way; silent, it guides no more.
  { key: 'voice', v: 'the guiding voice', s: 'Voice', slider: true, value: 1 },
  { key: 'haptics', v: 'touch', s: 'Vibration', choices: [[true, 'on', 'On'], [false, 'off', 'Off']] },
];

// Each option's first value (or the one it names), and the script the carving under the base reads
// in: Standard at first, then whichever the Starfleet delta last left it in.
export const DEFAULT_SETTINGS = { ...Object.fromEntries(OPTIONS.map((o) => [o.key, o.value ?? o.choices[0][0]])), script: 'standard' };

const KEY = 'kaltoh.settings.v2';

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const out = { ...DEFAULT_SETTINGS };
    // A value no longer offered (the way of rings, say) falls back to the default (the first).
    for (const o of OPTIONS) {
      const v = saved[o.key];
      if (o.slider ? Number.isFinite(v) && v >= 0 && v <= 1 : o.choices.some(([value]) => value === v)) out[o.key] = v;
    }
    // Sound was once simply on or off.
    if (saved.sound === false && !('sfx' in saved)) out.sfx = 0;
    // The music was once quieter by default (0.6, then 0.85): left where it was put, it rises with it.
    if (saved.music === 0.6 || saved.music === 0.85) out.music = DEFAULT_SETTINGS.music;
    // One player was once the first value: saved before the voice came, it moves to two.
    if (saved.players === 1 && !('voice' in saved)) out.players = DEFAULT_SETTINGS.players;
    if (saved.script === 'vulcan') out.script = 'vulcan';
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode: the choices simply aren't remembered.
  }
}

// The settings a game was begun with, as one string: the ways shown that shape the game (not
// sound, voice or vibration, which the carving keeps at its foot). A change shows as a different
// string.
export const UNSHAPING = new Set(['music', 'sfx', 'voice', 'haptics']);
export function shapeOf(settings) {
  return JSON.stringify(OPTIONS.filter((o) => !UNSHAPING.has(o.key) && (!o.when || o.when(settings))).map((o) => settings[o.key]));
}
