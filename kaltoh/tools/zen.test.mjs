// Checks zen (zen-rules.js): it begins as a seed's nest (rules.js), a t'an rests across any two
// pieces, every ten placed the assembly takes the next form - each t'an to a rod of it, the rest
// fading, new ones filling what none reached - and after five forms, each richer than the last, it
// is fully formed; and its progress in words (texts.js). And the ways to play (settings.js): the
// kal-toh, many forms and zen, where the way of rings once was.
// Run: node kaltoh/tools/zen.test.mjs
import assert from 'node:assert/strict';
import * as G from '../android/app/src/main/assets/www/js/geom.js';
import * as R from '../android/app/src/main/assets/www/js/rules.js';
import * as Z from '../android/app/src/main/assets/www/js/zen-rules.js';
import { buildForm, FORM_KEYS } from '../android/app/src/main/assets/www/js/forms-rules.js';
import { OPTIONS, UNSHAPING, loadSettings } from '../android/app/src/main/assets/www/js/settings.js';
import { zenStatusText } from '../android/app/src/main/assets/www/js/texts.js';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (${a} vs ${b})`);
const T = R.ROD_THICKNESS;
const segDist = (p, q) => Math.sqrt(G.closestSegSeg(p.a, p.b, q.a, q.b).d2);
const eye = [0, 0.4, 3];

// --- The forms it takes ----------------------------------------------------------------------------
{
  const edges = Z.FORMS.map((key) => buildForm(key).edges.length);
  ok(Z.FORMS.length === 5 && Z.FORMS.every((key) => FORM_KEYS.includes(key)), `five forms of many forms (${Z.FORMS.join(', ')})`);
  ok(edges.every((n, i) => i === 0 || n > edges[i - 1]), `each richer than the last: more rods (${edges.join(', ')})`);
  ok(Z.PER_FORM === 10, 'ten t\'an placed bring each form');
}

// --- The ways to play: the kal-toh first, many forms, zen -----------------------------------------
{
  const saved = new Map();
  globalThis.localStorage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, String(v)) };
  const ways = OPTIONS.find((o) => o.key === 'way').choices.map(([value]) => value);
  ok(JSON.stringify(ways) === JSON.stringify(['classic', 'forms', 'zen']) && loadSettings().way === 'classic', `the ways: ${ways.join(', ')}, the kal-toh first`);
  saved.set('kaltoh.settings.v2', JSON.stringify({ way: 'rings', opponent: 'adept', players: 2, music: 0.4 }));
  const old = loadSettings();
  ok(old.way === 'classic' && old.players === 2 && old.music === 0.4 && !('opponent' in old), 'saved settings that chose rings fall back to the kal-toh, the rest kept');
  saved.set('kaltoh.settings.v2', JSON.stringify({ way: 'zen' }));
  const zen = loadSettings();
  ok(zen.way === 'zen' && OPTIONS.filter((o) => !UNSHAPING.has(o.key) && (!o.when || o.when(zen))).every((o) => o.key === 'way'),
    'zen is played alone: of the ways that shape a game, only the game itself is shown');
  delete globalThis.localStorage;
}

// --- A new game: the nest ---------------------------------------------------------------------------
for (const seed of [3, 7]) {
  const g = Z.createGame({ seed });
  const live = R.startingNest({ seed }).nest.liveRods;
  ok(g.rods.length === live.length && g.rods.every((r, i) => G.dist(r.a, live[i].a) < 1e-12 && G.dist(r.b, live[i].b) < 1e-12),
    `seed ${seed}: it begins as the seed's nest (${g.rods.length} t'an)`);
  ok(g.rods.some((r) => r.kind === 'core') && new Set(g.rods.map((r) => r.id)).size === g.rods.length, `seed ${seed}: about a centre mass, every t'an its own`);
  ok(g.stage === 0 && !g.form && g.placed === 0 && !g.complete && g.length === R.ROD_LENGTH, `seed ${seed}: no form yet, its t'an the nest's own length`);
}
{
  const a = Z.createGame({ seed: 5 });
  const b = Z.createGame({ seed: 5 });
  ok(JSON.stringify(a.rods) === JSON.stringify(b.rods), 'a seed reproduces its nest');
}

// --- Placing: across any two pieces -----------------------------------------------------------------
{
  const g = Z.createGame({ seed: 11 });
  const rods = g.rods;
  // Any two pieces at all, near or far: it rests across both, against the side of each.
  const rng = G.mulberry32(9);
  let longest = 0;
  for (let i = 0; i < 200; i++) {
    const a = rods[Math.floor(rng() * rods.length)];
    const b = rods[Math.floor(rng() * rods.length)];
    if (a.id === b.id) continue;
    const hitA = { rod: a.id, s: 0.05 + 0.9 * rng() };
    const hitB = { rod: b.id, s: 0.05 + 0.9 * rng() };
    const pa = G.lerp(a.a, a.b, hitA.s);
    const pb = G.lerp(b.a, b.b, hitB.s);
    if (G.dist(pa, pb) < 0.05) continue;
    const pose = Z.placement(g, hitA, hitB, eye);
    ok(pose.ok, `t'an ${a.id} and ${b.id}: a placement across any two pieces is accepted`);
    ok(segDist(pose, a) <= T * 1.1 && segDist(pose, b) <= T * 1.1, 'it rests against both');
    ok(Math.abs(G.dist(pose.a, pose.b) - pose.length) < 1e-9 && pose.length >= g.length - 1e-12 && pose.length >= pose.span + 2 * T - 1e-9,
      'at its own length, or long enough to rest across both');
    longest = Math.max(longest, pose.span / g.length);
  }
  ok(longest > 1.2, `no reach: pieces further apart than a t'an's length are joined too (${longest.toFixed(2)} lengths)`);
  ok(Z.placement(g, { rod: rods[3].id, s: 0.2 }, { rod: rods[3].id, s: 0.8 }, eye).reason === 'same', 'but both ends on one piece are not across two');
  ok(Z.placement(g, { rod: rods[3].id, s: 0.2 }, null, eye).reason === 'none', 'nor is one end on nothing');
  // Two pieces that touch, at their crossing: across them both, a t'an long.
  const [r1, r2] = [rods[0], rods[1]];
  const c = G.closestSegSeg(r1.a, r1.b, r2.a, r2.b);
  const close = Z.placement(g, { rod: r1.id, s: Math.min(0.97, c.s + 0.3) }, { rod: r2.id, s: Math.max(0.03, c.t - 0.3) }, eye);
  ok(close.ok && Math.abs(close.length - g.length) < 1e-9, 'pieces close together take a t\'an of its own length');
}

// --- Ten placed, it takes a form ---------------------------------------------------------------------
// Where a t'an would rest across two pieces chosen at random; and placed there.
function anyPose(g, rng) {
  for (;;) {
    const a = g.rods[Math.floor(rng() * g.rods.length)];
    const b = g.rods[Math.floor(rng() * g.rods.length)];
    if (a.id === b.id) continue;
    const pose = Z.placement(g, { rod: a.id, s: 0.1 + 0.8 * rng() }, { rod: b.id, s: 0.1 + 0.8 * rng() }, eye);
    if (pose.ok) return pose;
  }
}
const placeOne = (g, rng) => Z.place(g, anyPose(g, rng));

// The t'an of a form: each along its own rod of it, turned as the game says, at many forms' size.
function onForm(g, label) {
  const form = buildForm(g.form);
  const corners = form.verts.map((p) => G.scale(G.qRotate(g.turn, p), g.radius));
  const used = new Set();
  for (const rod of g.rods) {
    const [u, v] = form.edges[rod.edge];
    const fits = (G.dist(rod.a, corners[u]) < 1e-9 && G.dist(rod.b, corners[v]) < 1e-9) || (G.dist(rod.a, corners[v]) < 1e-9 && G.dist(rod.b, corners[u]) < 1e-9);
    ok(fits && !used.has(rod.edge), `${label}: t'an ${rod.id} lies along its own rod of the ${form.s}`);
    used.add(rod.edge);
  }
  ok(used.size === form.edges.length && g.rods.length === form.edges.length, `${label}: every rod of the ${form.s} has its t'an (${form.edges.length})`);
  near(g.length, g.radius / form.rho, 1e-12, `${label}: its t'an the form's own length`);
  ok(corners.every((p) => Math.abs(G.length(p) - Z.RADIUS) < 1e-9), `${label}: at many forms' size and place`);
}

{
  const g = Z.createGame({ seed: 7 });
  const rng = G.mulberry32(21);
  const nest = g.rods.length;
  for (let i = 1; i < 10; i++) {
    const r = placeOne(g, rng);
    ok(!r.transform && g.stage === 0 && g.placed === i && g.rods.length === nest + i, `placed ${i}: it rests, no form yet`);
  }
  const tenth = anyPose(g, rng);
  const before = new Map(g.rods.map((r) => [r.id, { a: [...r.a], b: [...r.b] }]));
  before.set(g.next, { a: tenth.a, b: tenth.b });
  const r = Z.place(g, tenth);
  const t = r.transform;
  ok(t && g.stage === 1 && g.form === Z.FORMS[0] && t.form === Z.FORMS[0], `ten placed, it takes its first form (${t?.form})`);
  ok(g.placed === 0 && g.total === 10, 'and the count begins again toward the next');
  onForm(g, 'the first form');
  ok(t.moves.length + t.faded.length === nest + 10 && t.moves.every((m) => before.has(m.rod)) && t.faded.every((f) => before.has(f.rod)),
    `every t'an glides to a rod of it (${t.moves.length}) or fades away (${t.faded.length})`);
  ok(t.moves.every((m) => G.dist(m.from.a, before.get(m.rod).a) < 1e-12 && G.dist(m.to.a, Z.rodOf(g, m.rod).a) < 1e-12), 'each from where it lay to where it now lies');
  ok(t.added.length === 0 && t.faded.length > 0, 'the nest has more t\'an than the form has rods: some fade away');
  // Each end goes to the nearer end of its rod.
  ok(t.moves.every((m) => G.dist(m.from.a, m.to.a) ** 2 + G.dist(m.from.b, m.to.b) ** 2 <= G.dist(m.from.a, m.to.b) ** 2 + G.dist(m.from.b, m.to.a) ** 2 + 1e-12),
    'each end to the nearer end of its rod');
  ok(Z.placement(g, { rod: g.rods[0].id, s: 0.5 }, { rod: g.rods[5].id, s: 0.5 }, eye).ok, 'on the form, t\'an rest across any two of its pieces too');
}

// --- Five forms, each richer than the last; then fully formed -------------------------------------
for (const seed of [1, 7, 42]) {
  const g = Z.createGame({ seed });
  const rng = G.mulberry32(seed * 31);
  const counts = [];
  let faded = 0;
  let added = 0;
  let guard = 0;
  while (!g.complete && guard++ < 100) {
    const r = placeOne(g, rng);
    if (!r.transform) continue;
    counts.push(g.rods.length);
    faded += r.transform.faded.length;
    added += r.transform.added.length;
    onForm(g, `seed ${seed}, form ${g.stage}`);
    if (r.transform.added.length) ok(r.transform.added.every((n) => n.rod >= g.next - r.transform.added.length), `seed ${seed}: the form needing more, new t'an appear`);
  }
  ok(g.complete && g.stage === 5 && g.total === 50 && g.form === Z.FORMS[4], `seed ${seed}: five forms taken in fifty t'an, it is fully formed`);
  ok(counts.every((n, i) => i === 0 || n > counts[i - 1]), `seed ${seed}: each form richer than the last (${counts.join(', ')})`);
  ok(faded > 0 && added > 0, `seed ${seed}: t'an faded away (${faded}) and new ones appeared (${added})`);
  ok(Z.placement(g, { rod: g.rods[0].id, s: 0.5 }, { rod: g.rods[1].id, s: 0.5 }, eye).reason === 'complete' && Z.place(g, { ok: true, a: [0, 0, 0], b: [1, 0, 0], pieces: [0, 1] }) === null,
    `seed ${seed}: fully formed, nothing more is placed`);
  const p = Z.progress(g);
  ok(p.complete && p.stage === 5 && p.forms === 5, `seed ${seed}: its progress says so`);
}
{
  // How far it has come, in words under what just happened (texts.js); the Vulcan only what can be
  // carved: letters, and the stroke, double stroke and half-stop.
  const g = Z.createGame({ seed: 2 });
  const rng = G.mulberry32(8);
  const said = [zenStatusText(Z.progress(g)).s];
  for (let i = 0; i < 13; i++) placeOne(g, rng);
  said.push(zenStatusText(Z.progress(g)).s);
  while (!g.complete) placeOne(g, rng);
  said.push(zenStatusText(Z.progress(g)).s);
  ok(JSON.stringify(said) === JSON.stringify(["No form yet: 0 of 10 t'an toward the first", "Form 1 of 5: 3 of 10 t'an toward the next", 'All 5 forms taken: fully formed']),
    `its progress in words (${said.join(' / ')})`);
  ok([0, 13, 50].every((n) => /^[a-z '-]+$/.test(zenStatusText({ stage: Math.floor(n / 10), forms: 5, placed: n % 10, per: 10, complete: n === 50 }).v)), 'carved in Vulcan, as it can be cut');
}
{
  // The same placements, the same forms the same way up.
  const run = () => {
    const g = Z.createGame({ seed: 9 });
    const rng = G.mulberry32(4);
    while (g.stage < 2) placeOne(g, rng);
    return JSON.stringify(g.rods) + JSON.stringify(g.turn);
  };
  ok(run() === run(), 'a seed and the same placements reproduce its forms');
}

// --- Matching t'an to rods: as little travel as any matching ------------------------------------------
{
  const rng = G.mulberry32(77);
  const point = () => [rng() - 0.5, rng() - 0.5, rng() - 0.5];
  const cost = (rod, [ea, eb]) => Math.min(G.dist(rod.a, ea) ** 2 + G.dist(rod.b, eb) ** 2, G.dist(rod.a, eb) ** 2 + G.dist(rod.b, ea) ** 2);
  const permutations = (list, k) => (k === 0 ? [[]] : list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)], k - 1).map((p) => [x, ...p])));
  for (let trial = 0; trial < 60; trial++) {
    const n = 2 + Math.floor(rng() * 4);
    const m = 2 + Math.floor(rng() * 4);
    const rods = Array.from({ length: n }, () => ({ a: point(), b: point() }));
    const edges = Array.from({ length: m }, () => [point(), point()]);
    const { edgeOf, total } = Z.match(rods, edges);
    const matched = [...edgeOf].filter((e) => e >= 0);
    ok(matched.length === Math.min(n, m) && new Set(matched).size === matched.length, `trial ${trial}: each matched once`);
    let best = Infinity;
    if (n <= m) for (const p of permutations([...Array(m).keys()], n)) best = Math.min(best, p.reduce((s, e, i) => s + cost(rods[i], edges[e]), 0));
    else for (const p of permutations([...Array(n).keys()], m)) best = Math.min(best, p.reduce((s, i, e) => s + cost(rods[i], edges[e]), 0));
    near(total, best, 1e-9, `trial ${trial}: the least travel there is`);
  }
}

console.log(`zen: ${checks} checks passed`);
