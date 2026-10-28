// The ways to play, and how the game presents itself. Remembered between sessions.
// Each label is a pair: v, what is written in Vulcan (letters only - the Vulcan fonts carry no
// digits or punctuation), and s, its Federation Standard translation.

export const OPTIONS = [
  {
    key: 'opponent', v: 'opponent', s: 'Opponent',
    choices: [
      ['adept', 'a vulcan adept', 'A Vulcan adept'],
      ['master', 'a vulcan master', 'A Vulcan master'],
      ['novice', 'a vulcan novice', 'A Vulcan novice'],
      ['none', 'none', 'None: pass and play'],
    ],
  },
  {
    key: 'players', v: 'minds at the board', s: 'Players at the board', when: (s) => s.opponent === 'none',
    choices: [[1, 'one', '1'], [2, 'two', '2'], [3, 'three', '3'], [4, 'four', '4']],
  },
  {
    key: 'mode', v: 'the way', s: 'Way of play',
    choices: [
      ['harmony', 'harmony', 'Harmony: rings score, falls cost'],
      ['collapse', 'collapse', 'Collapse: the spin quickens; do not drop it'],
      ['meditation', 'meditation', 'Meditation: alone, in few moves'],
    ],
  },
  {
    key: 'form', v: 'the form', s: 'Form to complete',
    choices: [
      ['globe', 'globe', 'Globe: four rings, girdled'],
      ['lantern', 'lantern', 'Lantern: three rings, above and below'],
      ['sphere', 'sphere', 'Sphere: six rings, crowned at both poles'],
    ],
  },
  {
    key: 'spin', v: 'the spin', s: 'Hidden spin',
    choices: [['random', 'unknown', 'Unknown'], ['calm', 'calm', 'Calm'], ['moderate', 'moderate', 'Moderate'], ['strong', 'strong', 'Strong']],
  },
  { key: 'drift', v: 'a drift', s: 'A steady drift as well', choices: [[false, 'none', 'No'], [true, 'present', 'Yes']] },
  { key: 'axis', v: 'the axis', s: 'The axis', choices: [['hidden', 'hidden', 'Hidden'], ['shown', 'shown', 'Shown']] },
  { key: 'density', v: 'the nest', s: 'Starting nest', choices: [['medium', 'medium', 'Medium'], ['light', 'light', 'Light'], ['dense', 'dense', 'Dense']] },
  {
    key: 'test', v: 'testing the spin', s: 'Testing the spin',
    choices: [['turn', 'costs a turn', 'Costs a turn'], ['free', 'free', 'Free'], ['off', 'forbidden', 'Not allowed']],
  },
  {
    key: 'foresight', v: 'foresight', s: 'See the ring a move would make',
    choices: [['known', 'once the axis is known', 'Once the axis is known'], ['always', 'always', 'Always'], ['off', 'never', 'Never']],
  },
  { key: 'strain', v: 'strain', s: 'Strained t\'an glow amber', choices: [[true, 'shown', 'Yes'], [false, 'hidden', 'No']] },
  { key: 'chains', v: 'chains', s: 'A ring earns another turn', choices: [[false, 'no', 'No'], [true, 'yes', 'Yes']] },
  {
    key: 'supply', v: 'tan to place', s: 'T\'an to place',
    choices: [[40, 'forty', '40'], [30, 'thirty', '30'], [60, 'sixty', '60'], [0, 'without end', 'Unlimited']],
  },
  { key: 'lives', v: 'lives', s: 'Lives in collapse', when: (s) => s.mode === 'collapse', choices: [[3, 'three', '3'], [1, 'one', '1'], [5, 'five', '5']] },
  { key: 'hologram', v: 'hologram', s: 'Hologram: the view follows your eyes', choices: [[false, 'off', 'Off'], [true, 'on', 'On']] },
  { key: 'sound', v: 'sound', s: 'Sound', choices: [[true, 'on', 'On'], [false, 'off', 'Off']] },
  { key: 'haptics', v: 'touch', s: 'Vibration', choices: [[true, 'on', 'On'], [false, 'off', 'Off']] },
  { key: 'language', v: 'script', s: 'Carving first reads in', choices: [['vulcan', 'vulcan', 'Vulcan (touch to translate)'], ['standard', 'standard', 'Standard (touch for Vulcan)']] },
];

// Tuning for the hologram's window (see head.js and scene.js), on a carved page of its own. Each
// is chosen from its steps; touching the left of a value steps down, the right steps up. Values
// are always written in numerals so the page can be read off and the best ones made the defaults.
export const TUNING = [
  { key: 'depth', v: 'depth', s: 'Depth behind the glass', unit: 'mm', steps: [0, 10, 20, 30, 40, 50, 60, 80, 100, 130, 160, 200], value: 40 },
  { key: 'size', v: 'size', s: 'Size', unit: '\u00d7', steps: [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75], value: 1 },
  { key: 'origin', v: 'straight ahead', s: 'Straight ahead is', steps: ['rest', 'screen'], names: { rest: 'Where you first held it', screen: 'The middle of the screen' }, value: 'rest' },
  { key: 'shift', v: 'head motion', s: 'Head motion', unit: '\u00d7', steps: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3], value: 1 },
  { key: 'lean', v: 'leaning', s: 'Leaning in and out', unit: '\u00d7', steps: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2], value: 1 },
  { key: 'steady', v: 'steadiness', s: 'Steadiness: cutoff when still', unit: 'Hz', steps: [0.25, 0.4, 0.6, 0.9, 1.3, 2, 3, 5], value: 0.9 },
  { key: 'quick', v: 'quickness', s: 'Quickness: cutoff per mm/s', unit: '', steps: [0, 0.002, 0.004, 0.007, 0.012, 0.02, 0.035, 0.06], value: 0.007 },
  { key: 'ahead', v: 'looking ahead', s: 'Looking ahead', unit: 'ms', steps: ['auto', 0, 20, 40, 60, 80, 100, 130], value: 'auto' },
  { key: 'fov', v: 'camera view', s: 'Camera view, long side', unit: '\u00b0', steps: ['auto', 50, 55, 60, 65, 70, 75, 80, 85, 90], value: 'auto' },
  { key: 'camera', v: 'camera place', s: 'Camera above screen centre', unit: 'mm', steps: ['auto', 50, 55, 60, 65, 70, 75, 80, 85, 90], value: 'auto' },
  { key: 'iris', v: 'iris', s: 'Iris width', unit: 'mm', steps: [10.8, 11.2, 11.7, 12.2, 12.6], value: 11.7 },
  { key: 'eye', v: 'seen from', s: 'Seen from', steps: ['both', 'left', 'right'], names: { both: 'Between the eyes', left: 'Left eye', right: 'Right eye' }, value: 'both' },
  { key: 'engine', v: 'tracker', s: 'Face tracker runs on', steps: ['gpu', 'cpu'], names: { gpu: 'GPU', cpu: 'CPU' }, value: 'gpu' },
];

export const DEFAULT_TUNING = Object.fromEntries(TUNING.map((t) => [t.key, t.value]));

// A tuning value as written on the page.
export function tuningText(t, value) {
  if (t.names) return t.names[value] ?? String(value);
  if (value === 'auto') return 'auto';
  return t.unit === '\u00d7' ? `${value}\u00d7` : `${value}${t.unit ? ` ${t.unit}` : ''}`;
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
