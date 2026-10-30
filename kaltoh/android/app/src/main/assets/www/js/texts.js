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
  lift: { v: 'take up a tan then hold it with two fingers', s: "Take up a t'an from the tray, then hold it with two fingers" },
  touch: { v: 'lay its ends on two tan within its reach', s: "Lay its ends on two t'an no further apart than its length" },
  ring: { v: 'close a loop around the hidden spin', s: 'Close a loop around the hidden spin: a ring' },
  hold: { v: 'what cannot bear the spin will fall', s: 'What cannot bear the spin will fall' },
  turn: { v: 'drag the stone or the tan to turn them', s: "Drag the stone to turn it, the t'an to spin them" },
  shake: { v: 'shake three seconds to begin anew', s: 'Shake for three seconds to begin anew' },
  rim: { v: 'turn the stone by its rim', s: 'Turn the stone by its rim, outside this circle' },
  translateGlyph: { v: 'translate', s: 'Translate' },
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
  applied: { v: 'a new game begins', s: 'A new game begins' },
  // Glyph labels.
  ways: { v: 'ways', s: 'Ways to play' },
  test: { v: 'spin', s: 'Test the spin' },
  anew: { v: 'anew', s: 'Begin anew' },
  rules: { v: 'rules', s: 'Rules' },
  back: { v: 'return', s: 'Return' },
  waysTitle: { v: 'ways to play', s: 'Ways to play' },
  rulesTitle: { v: 'the rules', s: 'The rules' },
  pending: { v: 'begin anew to play this way', s: 'Begin anew to play this way' },
  // The marks of the plays under each seat (the rules page names them).
  markJoined: { v: 'joined', s: 'joined' },
  markPlaced: { v: 'placed', s: 'placed' },
  markHoop: { v: 'a hoop', s: 'a hoop' },
  markRing: { v: 'a ring', s: 'a ring' },
  markLoop: { v: 'a loop', s: 'a loop' },
  markFell: { v: 'fell', s: 'fell' },
  markTested: { v: 'tested', s: 'tested' },
};

export const ringText = (k) => ({ v: `a ring of ${spell(k)}`, s: `A ring of ${k}` });
export const fellText = (n) => ({ v: n === 1 ? 'one tan falls' : `${spell(n)} tan fall`, s: n === 1 ? "A t'an falls" : `${n} t'an fall` });
export const playerText = (i) => ({ v: `player ${spell(i + 1)}`, s: `Player ${i + 1}` });
// A seat's name, carved over its mark.
export const seatText = (i, vulcan) => (vulcan ? { v: 'the vulcan', s: 'The Vulcan' } : playerText(i));
// So many of so many, as a seat's score: true joins of those tried, say.
export const ofText = (x, o) => ({ v: `${spell(x)} of ${spell(o)}`, s: `${x}/${o}` });
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
  if (settings.way === 'forms') return MANY_RULES;
  if (settings.way !== 'rings') return CLASSIC_RULES;
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

// The original kal-toh's words (classic.js).
export const CLASSIC = {
  begin: { v: 'find the order within the chaos', s: 'Find the order within the chaos' },
  lift: { v: 'take up a tan then hold it with two fingers', s: "Take up a t'an from the tray, then hold it with two fingers" },
  touch: { v: 'lay its ends on two tips a tan apart', s: "Lay its ends on two tips about a t'an apart to join them" },
  truth: { v: 'true neighbours bring order', s: 'True neighbours bring order; false bonds fall' },
  angles: { v: 'read the angles of each joint', s: 'Joints keep true angles: 60° a triangle, 108° a pentagon' },
  axis: { v: 'it spins on a hidden axis', s: 'It spins on a hidden axis: two taps on it test the spin' },
  balance: { v: 'build evenly round the axis', s: "Build evenly round the axis, or the spin flings t'an away" },
  goal: { v: 'complete the sphere', s: "Complete the sphere: sixty t'an round two shells" },
  aimSame: { v: 'choose two different tips', s: 'Choose two different tips' },
  aimJoined: { v: 'already joined', s: 'Those tips are already joined' },
  aimFar: { v: 'too far apart for one tan', s: "Too far apart for one t'an" },
  aimNear: { v: 'too close together for one tan', s: "Too close together for one t'an" },
  eases: { v: 'the jumble eases toward its order', s: 'No true join within reach: the jumble eases toward its order' },
  harmony: { v: 'harmony', s: 'Harmony. Order emerges.' },
  hoop: { v: 'a great hoop is closed', s: 'A great hoop is closed' },
  discord: { v: 'discord not neighbours in the sphere', s: 'Discord: not neighbours. Where it belongs glows' },
  shaken: { v: 'discord a tan is shaken loose', s: "Discord: a t'an is shaken loose. Where it belongs glows" },
  flung: { v: 'the spin flings it away', s: 'Unbalanced. The spin flings it away.' },
  wobble: { v: 'it wobbles', s: 'It wobbles. Restore its balance.' },
  steady: { v: 'it spins true', s: 'It spins true: balanced about its axis' },
  testing: { v: 'it spins on its hidden axis', s: 'It spins on its hidden axis' },
};

const CLASSIC_RULES = [
  { v: 'the jumble hides a sphere', s: 'The jumble hides a sphere:' },
  { v: 'two shells of tan joined tip to tip', s: "two shells of t'an, joined tip to tip." },
  { v: 'each tip has four true neighbours', s: 'Each tip has four true neighbours.' },
  { v: 'join two tips a tan apart with another', s: "Join two tips about a t'an apart with another:" },
  { v: 'true neighbours bring harmony and order', s: 'true neighbours bring harmony and order,' },
  { v: 'a false bond fails and shakes one loose', s: 'a false bond fails and shakes one loose.' },
  { v: 'it spins on a hidden axis', s: 'It spins on a hidden axis: build evenly' },
  { v: 'build evenly or the spin flings tan away', s: "round it, or the spin flings t'an away." },
  { v: 'two taps test the spin a wobble warns', s: 'Two taps test the spin; a wobble warns.' },
  { v: 'sixty tan complete the sphere', s: "Sixty t'an complete the sphere." },
];

// Many forms' words (forms.js).
export const MANY = {
  begin: { v: 'a new form hides in the jumble', s: 'A new form hides in the jumble' },
  angles: { v: 'the angles that repeat tell its loops', s: 'Joint angles that repeat tell its loops:' },
  corners: { v: 'sixty a triangle ninety a square', s: '60° a triangle, 90° a square, 108° a pentagon, 120° a hexagon' },
  noise: { v: 'loose tan among it are noise', s: "Loose t'an hanging among it are noise" },
  holds: { v: 'a loop closed whole holds and braces out', s: 'A loop closed whole holds, and struts brace outward' },
  outer: { v: 'then build it again on the struts', s: 'Then build the same form again on the struts' },
  harmony: { v: 'true neighbours', s: 'True neighbours' },
  discord: { v: 'discord not neighbours in this form', s: 'Discord: not neighbours. Where it belongs glows' },
  shaken: { v: 'discord a tan is shaken loose', s: "Discord: a t'an is shaken loose. Where it belongs glows" },
  noiseTouched: { v: 'that was noise it falls away', s: 'That was noise: it falls away' },
  noiseFalls: { v: 'noise falls away', s: 'Noise falls away' },
  whole: { v: 'the inner form is whole build it again on the struts', s: 'The inner form is whole: build it again on the struts' },
  aimOuter: { v: 'the outer shell waits for the inner', s: 'The outer shell waits for the inner' },
  aimInner: { v: 'build on the struts now', s: 'The inner form is whole: build on the struts' },
  eases: { v: 'the jumble eases toward its form', s: 'No true join within reach: the jumble eases toward its form' },
  easesOuter: { v: 'the struts ease toward their true lines', s: 'No true join within reach: the struts ease toward their true lines' },
};

const LOOPS = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon' };
// Loops of the form closed whole: what they are, and that struts brace out from them.
export function loopText(sizes, braced) {
  const names = [...new Set(sizes)].map((n) => LOOPS[n] ?? `loop of ${n}`);
  const what = sizes.length === 1 ? `a ${names[0]}` : `${spell(sizes.length)} loops`;
  const closes = `${what} ${sizes.length === 1 ? 'closes' : 'close'} true`;
  const said = `${what[0].toUpperCase()}${what.slice(1)} closed true`;
  return braced ? { v: `${closes} struts brace outward`, s: `${said}: struts brace outward` } : { v: closes, s: said };
}

// How far each shell has come: its loops closed, of how many.
export const loopsText = (p) => ({
  v: `loops closed ${spell(p.inner)} within ${spell(p.outer)} without of ${spell(p.loops)}`,
  s: `Loops closed: ${p.inner} of ${p.loops} within, ${p.outer} without`,
});

const MANY_RULES = [
  { v: 'each game the jumble hides a new form', s: 'Each game the jumble hides a new form:' },
  { v: 'two shells of it joined by struts', s: 'two shells of it, joined by struts.' },
  { v: 'its joints keep their true angles', s: 'Its joints keep their true angles:' },
  { v: 'sixty a triangle ninety a square', s: '60° a triangle, 90° a square, 108° a pentagon,' },
  { v: 'one hundred twenty a hexagon', s: '120° a hexagon, 135° an octagon.' },
  { v: 'join two tips a tan apart with another', s: "Join two tips about a t'an apart with another:" },
  { v: 'true neighbours close its loops', s: 'true neighbours close its loops; a false bond falls.' },
  { v: 'a loop closed whole holds and braces out', s: 'A loop closed whole holds, and struts brace out.' },
  { v: 'then build the form again on the struts', s: 'The inner form whole, build it again on the struts.' },
  { v: 'loose tan among it are noise', s: "Loose t'an hanging among it are noise." },
];

export function manyCompleteText(game, form) {
  const name = { v: `the ${form.v} is whole`, s: `The ${form.s} is whole` };
  if (game.players > 1) {
    const w = game.winner;
    return { v: `${name.v} player ${spell(w + 1)} prevails`, s: `${name.s}. Player ${w + 1} prevails` };
  }
  const st = game.stats[0];
  const moves = st.joined + st.discord;
  return { v: `${name.v} in ${spell(moves)} moves`, s: `${name.s}, in ${moves} moves` };
}

export function classicCompleteText(game) {
  if (game.players > 1) {
    const w = game.winner;
    return { v: `player ${spell(w + 1)} completes the sphere`, s: `Player ${w + 1} completes the sphere` };
  }
  const s = game.stats[0];
  const moves = s.joined + s.discord + s.flung;
  return { v: `the sphere is complete in ${spell(moves)} moves`, s: `The sphere is complete in ${moves} moves, ${s.fallen} fallen` };
}
