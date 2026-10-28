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
    key: 'players', v: 'minds at the board', s: 'Players taking turns', when: (s) => s.way !== 'rings' || s.opponent === 'none',
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
    choices: [['random', 'unknown', 'Unknown until tested'], ['calm', 'calm', 'Calmly'], ['moderate', 'moderate', 'Moderately'], ['strong', 'strong', 'Strongly']],
  },
  { key: 'drift', v: 'a drift', s: 'A sideways drift as well', when: rings, choices: [[false, 'none', 'No'], [true, 'present', 'Yes']] },
  { key: 'axis', v: 'the axis', s: 'The spin\'s axis', when: rings, choices: [['hidden', 'hidden', 'Hidden until found'], ['shown', 'shown', 'Shown from the start']] },
  { key: 'density', v: 'the nest', s: 'Starting jumble', when: rings, choices: [['medium', 'medium', 'Medium'], ['light', 'light', 'Light'], ['dense', 'dense', 'Dense']] },
  {
    key: 'test', v: 'testing the spin', s: 'Testing the spin (two taps)', when: rings,
    choices: [['turn', 'costs a turn', 'Costs your turn'], ['free', 'free', 'Free'], ['off', 'forbidden', 'Not allowed']],
  },
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
  { key: 'hologram', v: 'hologram', s: 'Hologram: the view follows you', choices: [[false, 'off', 'Off'], [true, 'on', 'On']] },
  { key: 'sound', v: 'sound', s: 'Sound', choices: [[true, 'on', 'On'], [false, 'off', 'Off']] },
  { key: 'haptics', v: 'touch', s: 'Vibration', choices: [[true, 'on', 'On'], [false, 'off', 'Off']] },
  { key: 'language', v: 'script', s: 'Carving first reads in', choices: [['vulcan', 'vulcan', 'Vulcan (touch to translate)'], ['standard', 'standard', 'Standard (touch for Vulcan)']] },
];

// Tuning for the hologram's window (see head.js and scene.js), on carved pages of their own. Each
// is chosen from its steps; touching the left of a value steps down, the right steps up. Values
// are always written in numerals so the pages can be read off and the best ones made the defaults.
const percent = (v) => `${Math.round(v * 100)}%`;
const asWindow = (v) => (v === 0 ? '0%: not at all' : v === 1 ? '100%: as through a window' : percent(v));
export const TUNE_PAGES = [
  { v: 'what you see', s: 'What you see' },
  { v: 'how it follows you', s: 'How it follows you' },
  { v: 'your phone', s: 'Your phone' },
];
export const TUNING = [
  {
    key: 'depth', page: 0, v: 'how deep it stands', s: 'How deep it stands behind the screen', steps: [0, 10, 20, 30, 40, 50, 60, 80, 100, 130, 160, 200], value: 40,
    text: (v) => (v === 0 ? '0 cm: on the glass' : `${v / 10} cm`),
  },
  { key: 'size', page: 0, v: 'how big it looks', s: 'How big it looks', steps: [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75], value: 1, text: percent },
  { key: 'shift', page: 0, v: 'turning as your head moves', s: 'How far it turns as your head moves', steps: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3], value: 1, text: asWindow },
  { key: 'lean', page: 0, v: 'nearing as you lean in', s: 'How much it nears as you lean in', steps: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2], value: 1, text: asWindow },
  { key: 'origin', page: 1, v: 'straight on is', s: 'Straight on is', steps: ['rest', 'screen'], names: { rest: 'Where you first held it', screen: 'Square to the screen' }, value: 'rest' },
  {
    key: 'steady', page: 1, v: 'calm when you are still', s: 'Calm when you hold still: lower is calmer', steps: [0.25, 0.4, 0.6, 0.9, 1.3, 2, 3, 5], value: 0.9,
    text: (v) => `${v} Hz`,
  },
  {
    key: 'quick', page: 1, v: 'keeping up', s: 'Keeping up when you move fast: higher is quicker', steps: [0, 0.002, 0.004, 0.007, 0.012, 0.02, 0.035, 0.06], value: 0.007,
    text: String,
  },
  {
    key: 'ahead', page: 1, v: 'running ahead', s: "Running ahead of the camera's delay", steps: ['auto', 0, 20, 40, 60, 80, 100, 130], value: 'auto',
    text: (v) => (v === 'auto' ? 'Auto: as long as the delay' : `${v} ms`),
  },
  { key: 'eye', page: 1, v: 'seen from', s: 'Seen from', steps: ['both', 'left', 'right'], names: { both: 'Between your eyes', left: 'Your left eye', right: 'Your right eye' }, value: 'both' },
  {
    key: 'follow', page: 2, v: 'it follows your', s: 'It follows your', steps: ['head', 'eyes'], value: 'head',
    names: { head: 'Head: the phone finds your face', eyes: 'Eyes: finer, where the phone can' },
  },
  {
    key: 'fov', page: 2, v: 'what the camera sees', s: "The front camera's view, long side", steps: ['auto', 50, 55, 60, 65, 70, 75, 80, 85, 90], value: 'auto',
    text: (v) => (v === 'auto' ? 'Auto: as the phone says' : `${v}\u00b0`),
  },
  {
    key: 'camera', page: 2, v: 'where the camera is', s: "The front camera, above the screen's middle", steps: ['auto', 50, 55, 60, 65, 70, 75, 80, 85, 90], value: 'auto',
    text: (v) => (v === 'auto' ? 'Auto: as the phone says' : `${v} mm`),
  },
  {
    key: 'ipd', page: 2, v: 'your eyes apart', s: 'Your eyes, apart (63 mm fits most)', steps: [56, 58, 60, 61, 62, 63, 64, 65, 66, 68, 70], value: 63,
    text: (v) => `${v} mm`, when: (h) => h.follow !== 'eyes',
  },
  { key: 'iris', page: 2, v: 'your iris', s: 'Your iris, across (11.7 mm fits most)', steps: [10.8, 11.2, 11.7, 12.2, 12.6], value: 11.7, text: (v) => `${v} mm`, when: (h) => h.follow === 'eyes' },
  {
    key: 'engine', page: 2, v: 'the eye finder', s: 'The eye finder runs on', steps: ['gpu', 'cpu'], names: { gpu: 'The GPU: quicker', cpu: 'The CPU: surer' }, value: 'gpu',
    when: (h) => h.follow === 'eyes',
  },
];

export const DEFAULT_TUNING = Object.fromEntries(TUNING.map((t) => [t.key, t.value]));

// A tuning value as written on the page.
export function tuningText(t, value) {
  if (t.names) return t.names[value] ?? String(value);
  return t.text ? t.text(value) : String(value);
}

export const DEFAULT_SETTINGS = { ...Object.fromEntries(OPTIONS.map((o) => [o.key, o.choices[0][0]])), holo: { ...DEFAULT_TUNING } };

const KEY = 'kaltoh.settings.v2';

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const out = { ...DEFAULT_SETTINGS, holo: { ...DEFAULT_TUNING } };
    for (const o of OPTIONS) if (o.choices.some(([value]) => value === saved[o.key])) out[o.key] = saved[o.key];
    for (const t of TUNING) if (t.steps.includes(saved.holo?.[t.key])) out.holo[t.key] = saved.holo[t.key];
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS, holo: { ...DEFAULT_TUNING } };
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
// the hologram, sound, vibration or script). A change shows as a different string.
const UNSHAPING = new Set(['hologram', 'sound', 'haptics', 'language']);
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
    test: settings.test,
    strain: settings.strain,
    chains: settings.chains,
    lives: settings.lives,
    supply: settings.supply || Infinity,
  };
}
