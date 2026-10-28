// Everything the kal-toh says. Each line is a pair: v, what is carved in Vulcan (letters only:
// the Vulcan fonts carry no digits or punctuation, so numbers are spelled out), and s, its
// Federation Standard translation.
import { FORMS } from './rules.js';

const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function spell(n) {
  n = Math.round(n);
  if (n < 0) return `less ${spell(-n)}`;
  if (n < 20) return NUMBERS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${NUMBERS[n % 10]}` : '');
  return `${spell(Math.floor(n / 100))} hundred${n % 100 ? ` ${spell(n % 100)}` : ''}`;
}

export const vulcanOnly = (text) => text.toLowerCase().replace(/[^a-z ]+/g, '').replace(/\s+/g, ' ').trim();

export const TEXT = {
  title: { v: 'kaltoh', s: 'KAL-TOH' },
  begin: { v: 'find the order within the chaos', s: 'Find the order within the chaos' },
  lift: { v: 'lift a tan with two fingers', s: "Lift a t'an from the tray with two fingers" },
  touch: { v: 'touch two tan within its reach', s: "Touch two t'an no further apart than its length" },
  ring: { v: 'close a loop around the hidden spin', s: 'Close a loop around the hidden spin: a ring' },
  hold: { v: 'what cannot bear the spin will fall', s: 'What cannot bear the spin will fall' },
  turn: { v: 'drag the stone or the tan to turn them', s: "Drag the stone to turn it, the t'an to spin them" },
  shake: { v: 'shake three seconds to begin anew', s: 'Shake for three seconds to begin anew' },
  translate: { v: 'touch the carving to translate it', s: 'Touch anywhere on the carving to translate it' },
  holds: { v: 'it holds', s: 'It holds' },
  ringLost: { v: 'the ring could not hold', s: 'The ring could not hold' },
  vulcanThinks: { v: 'the vulcan considers', s: 'The Vulcan considers' },
  vulcanTests: { v: 'the vulcan tests the spin', s: 'The Vulcan tested the spin' },
  yourTurn: { v: 'your turn', s: 'Your turn' },
  testing: { v: 'it spins on its hidden axis', s: 'It spun on its hidden axis' },
  testNotNow: { v: 'not now', s: 'Not now' },
  testOff: { v: 'testing is not allowed', s: 'Testing the spin is not allowed' },
  lifeLost: { v: 'a life is lost', s: 'A life is lost' },
  quickens: { v: 'the spin quickens', s: 'The spin quickens' },
  hologramOn: { v: 'it follows your eyes', s: 'Hologram: the view follows your eyes' },
  hologramOff: { v: 'the view is still', s: 'Hologram off' },
  hologramDenied: { v: 'the camera was refused', s: 'The hologram needs the front camera' },
  hologramUnavailable: { v: 'no camera to follow you', s: 'No front camera for the hologram' },
  applied: { v: 'a new game begins', s: 'A new game begins' },
  // Glyph labels.
  ways: { v: 'ways', s: 'Ways to play' },
  test: { v: 'spin', s: 'Test the spin' },
  lens: { v: 'eyes', s: 'Hologram' },
  anew: { v: 'anew', s: 'Begin anew' },
  rules: { v: 'rules', s: 'Rules' },
  back: { v: 'return', s: 'Return' },
  more: { v: 'more', s: 'More' },
  waysTitle: { v: 'ways to play', s: 'Ways to play' },
  tune: { v: 'tune', s: 'Tune the hologram' },
  tuneTitle: { v: 'the hologram', s: 'Hologram tuning' },
  centre: { v: 'centre', s: 'Recentre' },
  reset: { v: 'as made', s: 'Defaults' },
  rulesTitle: { v: 'the rules', s: 'The rules' },
};

export const ringText = (k) => ({ v: `a ring of ${spell(k)}`, s: `A ring of ${k}` });
export const fellText = (n) => ({ v: n === 1 ? 'one tan falls' : `${spell(n)} tan fall`, s: n === 1 ? "A t'an falls" : `${n} t'an fall` });
export const playerText = (i) => ({ v: `player ${spell(i + 1)}`, s: `Player ${i + 1}` });
export const supplyText = (n) => ({ v: `${spell(n)} tan remain`, s: `${n} t'an remain` });

export function formText(form) {
  if (form === 'lantern') return { v: 'three rings above and below make the lantern', s: 'Three rings, above and below, make the lantern' };
  if (form === 'sphere') return { v: 'six rings crowned at both poles make the sphere', s: 'Six rings, crowned at both poles, make the sphere' };
  return { v: 'four rings above below and about the middle', s: 'Four rings, above, below and about the middle' };
}

export function scoreText(game, p) {
  const mode = game.settings.mode;
  if (mode === 'collapse') return { v: `${spell(p.lives)} ${p.lives === 1 ? 'life' : 'lives'}`, s: `${p.lives} ${p.lives === 1 ? 'life' : 'lives'}` };
  if (mode === 'meditation') return { v: `${spell(game.moves)} moves`, s: `${game.moves} moves` };
  return { v: spell(p.score), s: String(p.score) };
}

export function completeText(game) {
  const form = game.settings.form;
  if (game.settings.mode === 'meditation') {
    return { v: `the ${form} is complete in ${spell(game.moves)} moves`, s: `The ${form} is complete in ${game.moves} moves` };
  }
  return winnerText(game, `the ${form} is complete`, `The ${form} is complete`);
}

export function winnerText(game, v = '', s = '') {
  const w = game.winner;
  const lead = v ? `${v} ` : '';
  const leadS = s ? `${s}. ` : '';
  if (w < 0) return { v: `${lead}no one prevails`, s: `${leadS}No one prevails` };
  if (game.players[w].vulcan) return { v: `${lead}the vulcan prevails`, s: `${leadS}The Vulcan prevails` };
  if (game.players.some((p) => p.vulcan)) return { v: `${lead}you prevail`, s: `${leadS}You prevail` };
  if (game.players.length === 1) return { v: v || 'it is done', s: s || 'It is done' };
  return { v: `${lead}player ${spell(w + 1)} prevails`, s: `${leadS}Player ${w + 1} prevails` };
}

export function rulesText(settings) {
  const form = FORMS[settings.form] ?? FORMS.globe;
  return [
    { v: 'the tan cling where they touch', s: "The t'an cling where they touch" },
    { v: 'all gathered about a centre mass', s: 'all gathered about a centre mass.' },
    { v: 'it spins on a hidden axis', s: 'It spins on a hidden axis,' },
    { v: 'each game another axis and speed', s: 'each game another axis and speed.' },
    { v: 'place one tan touching two others', s: "Place one t'an touching two others" },
    { v: 'no further apart than its length', s: 'no further apart than its length.' },
    { v: 'a loop around the axis becomes a ring', s: 'A loop around the axis becomes a ring;' },
    { v: 'what cannot bear the spin falls', s: 'what cannot bear the spin falls.' },
    { v: `this form needs ${spell(form.rings)} rings`, s: `This form needs ${form.rings} rings.` },
    { v: 'a ring scores its tan a fall costs them', s: "A ring scores its t'an; a fall costs them." },
  ];
}
