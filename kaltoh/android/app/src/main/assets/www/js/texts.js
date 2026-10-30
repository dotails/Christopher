// Everything the kal-toh says. Each line is a pair: v, what is carved in Vulcan (letters only:
// the Vulcan fonts carry no digits or punctuation, so numbers are spelled out), and s, its
// Federation Standard translation.

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
  turn: { v: 'drag the stone or the tan to turn them', s: "Drag the stone to turn it, the t'an to spin them" },
  shake: { v: 'shake three seconds to begin anew', s: 'Shake for three seconds to begin anew' },
  rim: { v: 'turn the stone by its rim', s: 'Turn the stone by its rim, outside this circle' },
  translateGlyph: { v: 'translate', s: 'Translate' },
  applied: { v: 'a new game begins', s: 'A new game begins' },
  // Glyph labels.
  ways: { v: 'ways', s: 'Ways to play' },
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
  markLoop: { v: 'a loop', s: 'a loop' },
  markFell: { v: 'fell', s: 'fell' },
  markForm: { v: 'a form', s: 'a form' },
};

export const playerText = (i) => ({ v: `player ${spell(i + 1)}`, s: `Player ${i + 1}` });
// So many of so many, as a seat's score: true joins of those tried, say.
export const ofText = (x, o) => ({ v: `${spell(x)} of ${spell(o)}`, s: `${x}/${o}` });

export function rulesText(settings) {
  if (settings.way === 'zen') return ZEN_RULES;
  if (settings.way === 'forms') return MANY_RULES;
  return CLASSIC_RULES;
}

// The original kal-toh's words (classic.js).
export const CLASSIC = {
  begin: { v: 'find the order within the chaos', s: 'Find the order within the chaos' },
  lift: { v: 'take up a tan then hold it with two fingers', s: "Take up a t'an from the tray, then hold it with two fingers" },
  touch: { v: 'lay its ends on two tips a tan apart', s: "Lay its ends on two tips about a t'an apart to join them" },
  truth: { v: 'true neighbours bring order', s: 'True neighbours bring order; false bonds fall' },
  angles: { v: 'read the angles of each joint', s: 'Joints keep true angles: 60° a triangle, 108° a pentagon' },
  axis: { v: 'it spins on a hidden axis', s: 'It spins on a hidden axis' },
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
  { v: 'a wobble warns of imbalance', s: 'A wobble warns of imbalance.' },
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

// Zen's words (zen.js).
export const ZEN = {
  begin: { v: 'be still lay tan where you will', s: "Be still. Lay t'an where you will" },
  nest: { v: 'the nest', s: 'The nest' },
  touch: { v: 'lay its ends on any two tan', s: "Lay its ends on any two t'an: it rests across them" },
  every: { v: 'every ten tan it takes a new form', s: "Every ten t'an placed, it takes a new form" },
  richer: { v: 'five forms each richer than the last', s: 'Five forms, each richer than the last' },
  rests: { v: 'it rests across them', s: 'It rests across them' },
  oneMore: { v: 'one more and it takes a new form', s: "One more t'an, and it takes a new form" },
  gathers: { v: 'it gathers itself into a new form', s: 'It gathers itself into a new form' },
  aimSame: { v: 'lay its ends on two different tan', s: "Lay its ends on two different t'an" },
};

// Which of its forms it has taken (form: forms-rules.js buildForm's, or null for the nest).
export function zenFormText(p, form) {
  if (p.complete) return zenWholeText(form);
  if (!form) return { v: `the nest none of ${spell(p.forms)} forms yet`, s: `The nest: none of the ${p.forms} forms yet` };
  return { v: `form ${spell(p.stage)} of ${spell(p.forms)} the ${form.v}`, s: `Form ${p.stage} of ${p.forms}: the ${form.s}` };
}

export const zenPlacedText = (p) => ({
  v: `${spell(p.placed)} of ${spell(p.per)} tan toward the next form`,
  s: `${p.placed} of ${p.per} t'an toward the next form`,
});
export const zenBecomesText = (form) => ({ v: `it becomes the ${form.v}`, s: `It becomes the ${form.s}` });
export const zenWholeText = (form) => ({ v: `fully formed the ${form.v}`, s: `Fully formed: the ${form.s}` });

const ZEN_RULES = [
  { v: 'one mind alone no score and no spin', s: 'One mind alone: no score, no spin;' },
  { v: 'nothing strains and nothing falls', s: 'nothing strains and nothing falls.' },
  { v: 'it begins as a nest of tan', s: "It begins as a nest of t'an" },
  { v: 'gathered about a centre mass', s: 'gathered about a centre mass.' },
  { v: 'lay a tan across any two others', s: "Lay a t'an across any two others:" },
  { v: 'it rests wherever its ends lie', s: 'it rests wherever its ends lie.' },
  { v: 'every ten tan it takes a new form', s: "Every ten t'an, it takes a new form;" },
  { v: 'what the form needs not fades away', s: 'what the form needs not fades away.' },
  { v: 'five forms each richer than the last', s: 'Five forms, each richer than the last,' },
  { v: 'and it is fully formed', s: 'and it is fully formed.' },
];

export function classicCompleteText(game) {
  if (game.players > 1) {
    const w = game.winner;
    return { v: `player ${spell(w + 1)} completes the sphere`, s: `Player ${w + 1} completes the sphere` };
  }
  const s = game.stats[0];
  const moves = s.joined + s.discord + s.flung;
  return { v: `the sphere is complete in ${spell(moves)} moves`, s: `The sphere is complete in ${moves} moves, ${s.fallen} fallen` };
}
