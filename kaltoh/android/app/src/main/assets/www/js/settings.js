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
  { key: 'strain', v: 'strain', s: 'Strained t\'an tremble', choices: [[true, 'shown', 'Yes'], [false, 'hidden', 'No']] },
  { key: 'chains', v: 'chains', s: 'A ring earns another turn', choices: [[false, 'no', 'No'], [true, 'yes', 'Yes']] },
  {
    key: 'supply', v: 'tan to place', s: 'T\'an to place',
    choices: [[40, 'forty', '40'], [30, 'thirty', '30'], [60, 'sixty', '60'], [0, 'without end', 'Unlimited']],
  },
  { key: 'lives', v: 'lives', s: 'Lives in collapse', when: (s) => s.mode === 'collapse', choices: [[3, 'three', '3'], [1, 'one', '1'], [5, 'five', '5']] },
  { key: 'hologram', v: 'hologram', s: 'Hologram: the view follows your eyes', native: true, choices: [[false, 'off', 'Off'], [true, 'on', 'On']] },
  { key: 'sound', v: 'sound', s: 'Sound', choices: [[true, 'on', 'On'], [false, 'off', 'Off']] },
  { key: 'haptics', v: 'touch', s: 'Vibration', choices: [[true, 'on', 'On'], [false, 'off', 'Off']] },
  { key: 'language', v: 'script', s: 'Text appears in', choices: [['vulcan', 'vulcan', 'Vulcan (touch a line to translate)'], ['standard', 'standard', 'Standard (touch a line for Vulcan)']] },
];

export const DEFAULT_SETTINGS = Object.fromEntries(OPTIONS.map((o) => [o.key, o.choices[0][0]]));

const KEY = 'kaltoh.settings.v2';

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const out = { ...DEFAULT_SETTINGS };
    for (const o of OPTIONS) if (o.choices.some(([value]) => value === saved[o.key])) out[o.key] = saved[o.key];
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
