// The ways to play, and how the game presents itself. Remembered between sessions.
// Each label is a pair: v, what is written in Vulcan (letters only - the Vulcan fonts carry no
// digits or punctuation), and s, its Federation Standard translation.

// The game comes first; what follows depends on it. A choice may carry a line saying what it means.
const rings = (s) => s.way === 'rings';
export const OPTIONS = [
  {
    key: 'way', v: 'the game', s: 'The game',
    choices: [
      ['classic', 'the kal toh', 'The kal-toh', { v: 'join true neighbours until the jumble is a sphere', s: 'Join true neighbours until the jumble becomes the sphere' }],
      ['forms', 'many forms', 'Many forms', { v: 'a new form each game built from within', s: 'A new form each game: find its loops, build it from the inside out' }],
      ['rings', 'rings', 'Rings', { v: 'close loops round the hidden spin', s: 'Close loops round the hidden spin to build a shape of rings' }],
      ['zen', 'stillness', 'Zen', { v: 'lay tan across any two and let it take form', s: "Alone and calm: lay t'an across any two; every ten, a new form" }],
    ],
  },
  {
    key: 'opponent', v: 'opponent', s: 'Playing against', when: rings,
    choices: [
      ['adept', 'a vulcan adept', 'A Vulcan adept'],
      ['master', 'a vulcan master', 'A Vulcan master'],
      ['novice', 'a vulcan novice', 'A Vulcan novice'],
      ['none', 'none', 'No one: players take turns'],
    ],
  },
  {
    // Zen is played alone.
    key: 'players', v: 'minds at the board', s: 'Players taking turns', when: (s) => s.way !== 'zen' && (s.way !== 'rings' || s.opponent === 'none'),
    choices: [[1, 'one', '1'], [2, 'two', '2'], [3, 'three', '3'], [4, 'four', '4']],
  },
  {
    key: 'mode', v: 'how to win', s: 'How to win', when: rings,
    choices: [
      ['harmony', 'score', 'Most points', { v: 'a ring scores its tan a fall costs one', s: "A ring scores its t'an; each fall costs one" }],
      ['collapse', 'survive', 'Last standing', { v: 'drop two tan at once and lose a life', s: "Drop two t'an at once and lose a life" }],
      ['meditation', 'alone', 'Fewest moves', { v: 'complete the shape alone', s: 'Complete the shape alone, in as few moves as you can' }],
    ],
  },
  {
    key: 'form', v: 'the shape', s: 'Shape to build', when: rings,
    choices: [
      ['globe', 'globe', 'The globe', { v: 'four rings above below and round the middle', s: 'Four rings: above, below and round the middle' }],
      ['lantern', 'lantern', 'The lantern', { v: 'three rings above and below', s: 'Three rings, above and below' }],
      ['sphere', 'sphere', 'The sphere', { v: 'six rings crowned at both poles', s: 'Six rings, crowned at both poles' }],
    ],
  },
  {
    key: 'spin', v: 'the spin', s: 'How hard it spins', when: rings,
    choices: [['random', 'unknown', 'Unknown'], ['calm', 'calm', 'Calmly'], ['moderate', 'moderate', 'Moderately'], ['strong', 'strong', 'Strongly']],
  },
  { key: 'drift', v: 'a drift', s: 'A sideways drift as well', when: rings, choices: [[false, 'none', 'No'], [true, 'present', 'Yes']] },
  { key: 'axis', v: 'the axis', s: 'The spin\'s axis', when: rings, choices: [['hidden', 'hidden', 'Hidden until found'], ['shown', 'shown', 'Shown from the start']] },
  { key: 'density', v: 'the nest', s: 'Starting jumble', when: rings, choices: [['medium', 'medium', 'Medium'], ['light', 'light', 'Light'], ['dense', 'dense', 'Dense']] },
  {
    key: 'foresight', v: 'foresight', s: "Show the ring a t'an would make", when: rings,
    choices: [['known', 'once the axis is known', 'Once the axis is known'], ['always', 'always', 'Always'], ['off', 'never', 'Never']],
  },
  { key: 'strain', v: 'strain', s: "Strained t'an glow amber", when: rings, choices: [[true, 'shown', 'Yes'], [false, 'hidden', 'No']] },
  { key: 'chains', v: 'chains', s: 'A ring earns another turn', when: rings, choices: [[false, 'no', 'No'], [true, 'yes', 'Yes']] },
  {
    key: 'supply', v: 'tan to place', s: "T'an to place", when: rings,
    choices: [[40, 'forty', '40'], [30, 'thirty', '30'], [60, 'sixty', '60'], [0, 'without end', 'Unlimited']],
  },
  { key: 'lives', v: 'lives', s: 'Lives, when surviving', when: (s) => rings(s) && s.mode === 'collapse', choices: [[3, 'three', '3'], [1, 'one', '1'], [5, 'five', '5']] },
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

// Settings that shape a game (as rules.createGame takes them).
export function gameOptions(settings) {
  return {
    mode: settings.mode,
    opponent: settings.opponent,
    players: settings.opponent === 'none' ? settings.players : 2,
    spin: settings.spin,
    drift: settings.drift,
    axis: settings.axis,
    density: settings.density,
    form: settings.form,
    test: 'off', // no one tests the spin, the Vulcan included
    strain: settings.strain,
    chains: settings.chains,
    lives: settings.lives,
    supply: settings.supply || Infinity,
  };
}
