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
  },
  // Sliders: drawn along their groove under the base, from silent to full.
  { key: 'music', v: 'music', s: 'Music', slider: true, value: 0.85 },
  { key: 'sfx', v: 'the sound of the tan', s: 'Sound effects', slider: true, value: 0.8 },
  { key: 'haptics', v: 'touch', s: 'Vibration', choices: [[true, 'on', 'On'], [false, 'off', 'Off']] },
  { key: 'language', v: 'script', s: 'Carving first reads in', choices: [['vulcan', 'vulcan', 'Vulcan'], ['standard', 'standard', 'Standard']] },
];

export const DEFAULT_SETTINGS = Object.fromEntries(OPTIONS.map((o) => [o.key, o.slider ? o.value : o.choices[0][0]]));

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
    // The music was once quieter by default (0.6): left where it was put, it rises with it.
    if (saved.music === 0.6) out.music = DEFAULT_SETTINGS.music;
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
// sound, vibration or script). A change shows as a different string.
const UNSHAPING = new Set(['music', 'sfx', 'haptics', 'language']);
export function shapeOf(settings) {
  return JSON.stringify(OPTIONS.filter((o) => !UNSHAPING.has(o.key) && (!o.when || o.when(settings))).map((o) => settings[o.key]));
}
