// Everything the kal-toh says. Each line is a pair: v, what is carved in Vulcan, and s, its
// Federation Standard translation. The Vulcan is Golic Vulcan, in the words of the Vulcan Language
// Institute's dictionaries and the order of its grammar (see docs/vulcan.md): the verb first, then
// who does it, then what to; no "the"; a prefix for "on", "in", "of" (fi', svi', t'); "~lar" for
// more than one, but not after a number; "'uh" to bid. The Vulcan fonts carry letters only, so
// numbers are spelled out, and the stroke (-), double stroke (--) and half-stop (') are cut by hand.

// Numbers as Golic Vulcan counts them: wuh, dah, reh ... leh (ten), leh-wuh (eleven), dah-leh
// (twenty), dah-leh kau (twenty-five), teh (a hundred), leh-teh (a thousand); ris, nothing.
const ONES = ['', 'wuh', 'dah', 'reh', 'keh', 'kau', 'sheh', 'steh', 'oh', 'nau'];
export function spell(n) {
  n = Math.round(Math.abs(n));
  if (n === 0) return 'ris';
  if (n >= 1000) return [`${spell(Math.floor(n / 1000) * 10)}-teh`, n % 1000 ? spell(n % 1000) : ''].filter(Boolean).join(' ');
  const parts = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(h === 1 ? 'teh' : `${ONES[h]}-teh`);
  if (r >= 20) parts.push(`${ONES[Math.floor(r / 10)]}-leh`, ...(r % 10 ? [ONES[r % 10]] : []));
  else if (r > 10) parts.push(`leh-${ONES[r - 10]}`);
  else if (r === 10) parts.push('leh');
  else if (r) parts.push(ONES[r]);
  return parts.join(' ');
}
// First, second, ... as joined to a word: wuhr-, dahr-, rehr-.
const ordinal = (n) => `${n < 10 ? ONES[n] : spell(n)}r`;
// A shape of n sides: reh-vla, a triangle; keh-vla, a square.
export const sided = (n) => `${spell(n)}-vla`;

// What is carved in Vulcan: its letters, the stroke between a word's roots, the double stroke
// (written --) and the half-stop; nothing else.
export const vulcanOnly = (text) => text.toLowerCase().replace(/--/g, '–').replace(/[^a-z '\-–]+/g, '').replace(/\s+/g, ' ').trim();

export const TEXT = {
  title: { v: 'kal-toh', s: 'KAL-TOH' },
  begin: { v: "tal'uh zek svi'nezhak", s: 'Find the order within the chaos' },
  translateGlyph: { v: 'mesukh', s: 'Translate' },
  applied: { v: 'palikau uzh-zhagra', s: 'A new game begins' },
  // Glyph labels. The glyph that begins anew is named for shaking the phone, which does the same.
  anew: { v: "huta'uh", s: 'Shake' },
  rules: { v: 'to-golar', s: 'Rules' },
  back: { v: "fun'uh", s: 'Return' },
  waysTitle: { v: "renyutlar t'mavau", s: 'Ways to play' },
  rulesTitle: { v: 'to-golar', s: 'The rules' },
  pending: { v: "huta'uh na'nash-renyut", s: 'Shake to play this way' },
  // The marks of the plays under each seat (the rules page names them).
  markJoined: { v: 'teral', s: 'joined' },
  markPlaced: { v: 'shital', s: 'placed' },
  markHoop: { v: 'suk-pakuv', s: 'a hoop' },
  markLoop: { v: 'pakuv', s: 'a loop' },
  markFell: { v: 'tevan', s: 'fell' },
  markForm: { v: 'shid', s: 'a form' },
};

// The first player, the second ...: wuhr-mavausu, dahr-mavausu.
export const playerText = (i) => ({ v: `${ordinal(i + 1)}-mavausu`, s: `Player ${i + 1}` });
// So many of so many, as a seat's score: true joins of those tried, say. Seven of nine: steh t'nau.
export const ofText = (x, o) => ({ v: `${spell(x)} t'${spell(o)}`, s: `${x}/${o}` });

export function rulesText(settings) {
  if (settings.way === 'zen') return ZEN_RULES;
  if (settings.way === 'forms') return MANY_RULES;
  return CLASSIC_RULES;
}

// The original kal-toh's words (classic.js).
export const CLASSIC = {
  begin: { v: "tal'uh zek svi'nezhak", s: 'Find the order within the chaos' },
  // The shape it builds, carved beneath its name.
  shape: { v: 'dah ka-svitanik reh-leh dah-muk', s: 'Two concentric icosidodecahedra' },
  aimSame: { v: "dvel'uh dah natya-um", s: 'Choose two different tips' },
  aimJoined: { v: "ki'teral ish-umlar", s: 'Those tips are already joined' },
  aimFar: { v: "nuh'irak na'wuh t'an", s: "Too far apart for one t'an" },
  aimNear: { v: "nuh'beik na'wuh t'an", s: "Too close together for one t'an" },
  eases: { v: "betau nezhak na'zek t'ish-veh", s: 'No true join within reach: the jumble eases toward its order' },
  harmony: { v: "kril'es -- sasarlah zek", s: 'Harmony. Order emerges.' },
  hoop: { v: "lo'uk suk-pakuv ikapik", s: 'A great hoop is closed' },
  discord: { v: "raskril'es -- ri behsular", s: 'Discord: not neighbours. Where it belongs glows' },
  shaken: { v: "raskril'es -- wuh t'an thal", s: "Discord: a t'an is shaken loose. Where it belongs glows" },
  flung: { v: "lehm-tor padan ish-veh sa'le", s: 'Unbalanced. The spin flings it away.' },
  wobble: { v: "welhutau ish-veh -- ekufun'uh vo'ektaya", s: 'It wobbles. Restore its balance.' },
};

const CLASSIC_RULES = [
  { v: "ip-sut nezhak ek'kal", s: 'The jumble hides a sphere:' },
  { v: "dah t'an-fo - teral um k'um", s: "two shells of t'an, joined tip to tip." },
  { v: 'ma tik um keh yeht-behsu', s: 'Each tip has four true neighbours.' },
  { v: "tera'uh dah um t'an-wu-vath k'wuhli", s: "Join two tips about a t'an apart with another:" },
  { v: "katau yeht-behsular kril'es heh zek", s: 'true neighbours bring harmony and order,' },
  { v: "vravshau riyeht-tel heh hutau wuh t'an thal", s: 'a false bond fails and shakes one loose.' },
  { v: "pada-tor ish-veh fi'ip-da-sfek", s: 'It spins on a hidden axis: build evenly' },
  { v: "torva'uh kauk - lehm-tor padan rikauk t'an sa'le", s: "round it, or the spin flings t'an away." },
  { v: "vikau welhutaya na'rivo'ektaya", s: 'A wobble warns of imbalance.' },
  { v: "ovsoh sheh-leh t'an ek'kal", s: "Sixty t'an complete the sphere." },
];

// Many forms' words (forms.js).
export const MANY = {
  begin: { v: "ip-sut uzh-shid svi'nezhak", s: 'A new form hides in the jumble' },
  harmony: { v: 'yeht-behsular', s: 'True neighbours' },
  discord: { v: "raskril'es -- ri behsular", s: 'Discord: not neighbours. Where it belongs glows' },
  shaken: { v: "raskril'es -- wuh t'an thal", s: "Discord: a t'an is shaken loose. Where it belongs glows" },
  noiseTouched: { v: "ralash -- tev-tor ish-veh sa'le", s: 'That was noise: it falls away' },
  noiseFalls: { v: "tev-tor ralash sa'le", s: 'Noise falls away' },
  whole: { v: "tvi-shid elkhrul -- torva'uh ish-veh va'ashiv fi'kel-feklar", s: 'The inner form is whole: build it again on the struts' },
  aimOuter: { v: "bek-tor si-fo na'tvi-fo", s: 'The outer shell waits for the inner' },
  aimInner: { v: "tvi-shid elkhrul -- torva'uh fi'kel-feklar", s: 'The inner form is whole: build on the struts' },
  eases: { v: "betau nezhak na'shid t'ish-veh", s: 'No true join within reach: the jumble eases toward its form' },
  easesOuter: { v: "betau kel-feklar na'yeht-zehllar t'au", s: 'No true join within reach: the struts ease toward their true lines' },
};

const LOOPS = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon' };
// Loops of the form closed whole: what they are, and that struts brace out from them (in Vulcan, a
// loop is named by its sides: reh-vla, a triangle; several are so many pakuv, loops).
export function loopText(sizes, braced) {
  const names = [...new Set(sizes)].map((n) => LOOPS[n] ?? `loop of ${n}`);
  const what = sizes.length === 1 ? `a ${names[0]}` : `${sizes.length} loops`;
  const said = `${what[0].toUpperCase()}${what.slice(1)} closed true`;
  const closes = sizes.length === 1 ? `${sided(sizes[0])} ikapik` : `${spell(sizes.length)} pakuv ikapik`;
  return braced ? { v: `${closes} -- fir-tor kel-feklar sa'le`, s: `${said}: struts brace outward` } : { v: closes, s: said };
}

// How far each shell has come: its loops closed, of how many.
export const loopsText = (p) => ({
  v: `ikap-pakuvlar -- ${spell(p.inner)} t'${spell(p.loops)} tvik - ${spell(p.outer)} sik`,
  s: `Loops closed: ${p.inner} of ${p.loops} within, ${p.outer} without`,
});

const MANY_RULES = [
  { v: "ip-sut nezhak uzh-shid svi'tik zhagra", s: 'Each game the jumble hides a new form:' },
  { v: "dah fo t'ish-veh - teral k'kel-feklar", s: 'two shells of it, joined by struts.' },
  { v: "potau leseklar t'ish-veh yeht-vulular t'au", s: 'Its joints keep their true angles:' },
  { v: 'reh-vla sheh-leh - keh-vla nau-leh - kau-vla teh oh', s: '60° a triangle, 90° a square, 108° a pentagon,' },
  { v: 'sheh-vla teh dah-leh - oh-vla teh reh-leh kau', s: '120° a hexagon, 135° an octagon.' },
  { v: "tera'uh dah um t'an-wu-vath k'wuhli", s: "Join two tips about a t'an apart with another:" },
  { v: "ikap-tor yeht-behsular pakuvlar t'ish-veh - tev-tor riyeht-tel", s: 'true neighbours close its loops; a false bond falls.' },
  { v: "meskarau elkhrul ikap-pakuv - fir-tor kel-feklar sa'le", s: 'A loop closed whole holds, and struts brace out.' },
  { v: "tvi-shid elkhrul - torva'uh ish-veh va'ashiv fi'kel-feklar", s: 'The inner form whole, build it again on the struts.' },
  { v: "ralash -- thal-t'anlar svi'ish-veh", s: "Loose t'an hanging among it are noise." },
];

export function manyCompleteText(game, form) {
  const name = { v: `${form.v} elkhrul`, s: `The ${form.s} is whole` };
  if (game.players > 1) {
    const w = game.winner;
    return { v: `${name.v} -- fakovau ${playerText(w).v}`, s: `${name.s}. Player ${w + 1} prevails` };
  }
  const st = game.stats[0];
  const moves = st.joined + st.discord;
  return { v: `${name.v} -- k'${spell(moves)} dvun`, s: `${name.s}, in ${moves} moves` };
}

// Zen's words (zen.js).
export const ZEN = {
  begin: { v: "hayal'uh -- ti'uh t'an wilat istau du", s: "Be still. Lay t'an where you will" },
  nest: { v: "ki'an", s: 'The nest' },
  rests: { v: "ti ish-veh mes'au", s: 'It rests across them' },
  oneMore: { v: "wuh t'an weht -- nem-tor ish-veh uzh-shid", s: "One more t'an, and it takes a new form" },
  gathers: { v: "hoknau ish-veh vi'uzh-shid", s: 'It gathers itself into a new form' },
  aimSame: { v: "ti'uh shahtlar t'ish-veh fi'dah natya-t'an", s: "Lay its ends on two different t'an" },
};

// How far it has come (zen-rules.js progress), under what just happened: the forms taken, and the
// t'an placed toward the next.
export function zenStatusText(p) {
  if (p.complete) return { v: `ki'nem-tor ${spell(p.forms)} shid -- elkhrulu shidal`, s: `All ${p.forms} forms taken: fully formed` };
  const placed = { v: `${spell(p.placed)} t'${spell(p.per)} t'an`, s: `${p.placed} of ${p.per} t'an` };
  if (!p.stage) return { v: `riwi shid -- ${placed.v} na'wuh'rak`, s: `No form yet: ${placed.s} toward the first` };
  return { v: `shid ${spell(p.stage)} t'${spell(p.forms)} -- ${placed.v} na'thurai`, s: `Form ${p.stage} of ${p.forms}: ${placed.s} toward the next` };
}

export const zenBecomesText = (form) => ({ v: `shetau ish-veh ${form.v}`, s: `It becomes the ${form.s}` });
export const zenWholeText = (form) => ({ v: `elkhrulu shidal -- ${form.v}`, s: `Fully formed: the ${form.s}` });

const ZEN_RULES = [
  { v: "wuh kash sa'awek -- rim karm - rim padan", s: 'One mind alone: no score, no spin;' },
  { v: "his-tor ri'el heh tev-tor ri'el", s: 'nothing strains and nothing falls.' },
  { v: "palikau ish-veh u'ki'an", s: "It begins as a nest of t'an" },
  { v: "t'an hoknal pa'shivak-svitan", s: 'gathered about a centre mass.' },
  { v: "ti'uh t'an mes'dah fan-t'an", s: "Lay a t'an across any two others:" },
  { v: "ti ish-veh fan-wilat ti shahtlar t'ish-veh", s: 'it rests wherever its ends lie.' },
  { v: "kanok leh t'an -- nem-tor ish-veh uzh-shid", s: "Every ten t'an, it takes a new form;" },
  { v: "saspoh-tor ribolaya t'shid", s: 'what the form needs not fades away.' },
  { v: 'kau shid - tik weh-wehkonik do kim-shah', s: 'Five forms, each richer than the last,' },
  { v: 'heh elkhrulu shidal ish-veh', s: 'and it is fully formed.' },
];

export function classicCompleteText(game) {
  if (game.players > 1) {
    const w = game.winner;
    return { v: `ovsoh ${playerText(w).v} ek'kal`, s: `Player ${w + 1} completes the sphere` };
  }
  const s = game.stats[0];
  const moves = s.joined + s.discord + s.flung;
  return { v: `ek'kal ovsotik -- k'${spell(moves)} dvun`, s: `The sphere is complete in ${moves} moves, ${s.fallen} fallen` };
}
