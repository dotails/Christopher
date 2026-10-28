// Checks the original kal-toh's rules (classic-rules.js) and tunes the spin-balance limit by
// simulation.
// Run: node kaltoh/tools/classic.test.mjs [--tune]
import assert from 'node:assert/strict';
import * as K from '../android/app/src/main/assets/www/js/classic-rules.js';

const { vec } = K;
const L = K.buildLattice();
let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};

// --- Lattice geometry ------------------------------------------------------------------------
ok(L.verts.length === 30, 'thirty junctions');
ok(L.edges.length === 60, 'sixty t\'an');
ok(L.tris.length === 20 && L.pents.length === 12, 'twenty triangles, twelve pentagons');
ok(L.neighbours.every((n) => n.length === 4), 'every junction joins four t\'an');
for (const [u, v] of L.edges) {
  ok(Math.abs(vec.length(vec.sub(L.verts[u], L.verts[v])) - K.EDGE_LENGTH) < 1e-9, 'equal rods');
}
ok(L.hoops.length === 6 && L.hoops.every((h) => h.edges.length === 10), 'six hoops of ten');
for (const p of L.pents) {
  for (let i = 0; i < 5; i++) ok(K.latticeEdge(p[i], p[(i + 1) % 5]) >= 0, 'pentagon ring is closed in order');
}

// --- A new game ----------------------------------------------------------------------------
const jointAngles = (pos, state) => {
  const out = [];
  for (let v = 0; v < 30; v++) {
    const ns = L.neighbours[v].filter((w) => state.tree.edges.includes(K.latticeEdge(v, w)));
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const a = vec.normalize(vec.sub(pos[ns[i]], pos[v]));
        const b = vec.normalize(vec.sub(pos[ns[j]], pos[v]));
        out.push(Math.acos(Math.max(-1, Math.min(1, vec.dot(a, b)))));
      }
    }
  }
  return out;
};

for (let seed = 1; seed <= 40; seed++) {
  const g = K.createGame({ seed });
  ok(g.tree.edges.length === 29 && new Set(g.tree.edges).size === 29, 'spanning tree of 29');
  ok(g.present.size === 29, 'starts with the tree only');
  for (let v = 1; v < 30; v++) ok(K.shortestPath(g, 0, v), 'tree reaches every junction');
  for (const e of g.tree.edges) {
    const [u, v] = L.edges[e];
    ok(Math.abs(vec.length(vec.sub(g.chaos[u], g.chaos[v])) - K.EDGE_LENGTH) < 1e-9, 'crumpling keeps lengths');
  }
  const before = jointAngles(g.target, g);
  const after = jointAngles(g.chaos, g);
  ok(before.every((a, i) => Math.abs(a - after[i]) < 1e-9), 'crumpling keeps every joint angle');
  ok(g.chaos.every((p) => vec.length(p) < 1.6), 'chaos stays compact');
  ok(vec.length(K.imbalance(g)) < 0.5, 'chaos starts nearly balanced');
  ok(Math.abs(vec.length(g.axis) - 1) < 1e-9, 'axis is a unit vector');
  const eq = K.equatorHoop(g);
  ok(Math.abs(Math.abs(vec.dot(K.hoopNormal(g, eq), g.axis)) - 1) < 1e-6, "one hoop girdles the hidden axis");
}

// On the stone (with a floor it is steered above while it is crumpled), every t'an stays whole
// and every joint true. (In play the motion model keeps it clear of the stone: browser-check.cjs.)
for (let seed = 1; seed <= 20; seed++) {
  const g = K.createGame({ seed, floor: (x, z) => -0.8 + 0.1 * Math.hypot(x, z) });
  for (const e of g.tree.edges) {
    const [u, v] = L.edges[e];
    ok(Math.abs(vec.length(vec.sub(g.chaos[u], g.chaos[v])) - K.EDGE_LENGTH) < 1e-9, 'on the stone, crumpling keeps lengths');
  }
  const before = jointAngles(g.target, g);
  const after = jointAngles(g.chaos, g);
  ok(before.every((a, i) => Math.abs(a - after[i]) < 1e-9), 'on the stone, crumpling keeps every joint angle');
}

// Same seed, same game.
const g1 = K.createGame({ seed: 7 });
const g2 = K.createGame({ seed: 7 });
ok(JSON.stringify(g1.chaos) === JSON.stringify(g2.chaos), 'seeds are reproducible');

// --- Moves ---------------------------------------------------------------------------------
{
  const g = K.createGame({ seed: 11, players: 2, balanceLimit: 99 });
  const [tu, tv] = L.edges[g.tree.edges[0]];
  ok(K.play(g, tu, tv).kind === 'invalid', 'cannot rejoin joined tips');
  ok(K.play(g, 3, 3).kind === 'invalid', 'cannot join a tip to itself');
  ok(g.current === 0, 'invalid moves keep the turn');

  const e = K.missingEdges(g)[0];
  const [u, v] = L.edges[e];
  const r = K.play(g, u, v);
  ok(r.kind === 'harmony' && g.present.has(e), 'true neighbours join');
  ok(r.loop.length >= 3 && r.loop[0] === u && r.loop[r.loop.length - 1] === v, 'a join closes a loop');
  ok(g.current === 1, 'turn passes');
  ok(g.order[u] > 0 && g.order[v] > 0, 'harmony brings order');

  // A pair that is not a lattice edge is discord; it shakes loose the newest bond at its tips.
  let bad = null;
  for (let a = 0; a < 30 && !bad; a++) {
    if (a !== u) continue;
    for (let b = 0; b < 30; b++) if (b !== a && K.latticeEdge(a, b) < 0) { bad = [a, b]; break; }
  }
  const sizeBefore = g.present.size;
  const d = K.play(g, bad[0], bad[1]);
  ok(d.kind === 'discord', 'false neighbours are discord');
  ok(d.fallen.length === 1 && d.fallen[0] === e && g.present.size === sizeBefore - 1, 'discord shakes the newest bond loose');
  ok(g.order[u] < 0.6, 'discord costs order');
  ok(g.current === 0, 'discord still spends the turn');
}

// Completing the sphere, balanced greedily: always possible, and the winner is who placed last.
for (let seed = 100; seed < 140; seed++) {
  const g = K.createGame({ seed, players: 2 });
  let guard = 0;
  while (!g.complete && guard++ < 200) {
    const options = K.missingEdges(g).filter((e) => K.balancedAfter(g, e));
    assert.ok(options.length, `seed ${seed}: a balanced true join always exists`);
    const [u, v] = L.edges[options[Math.floor(g.rng() * options.length)]];
    const r = K.play(g, u, v);
    assert.equal(r.kind, 'harmony');
  }
  ok(g.complete && g.present.size === 60, 'sphere completes');
  ok(g.order.every((o) => o === 1), 'complete sphere is fully ordered');
  ok(vec.length(K.imbalance(g)) < 1e-9, 'complete sphere is perfectly balanced');
  ok(g.winner === (g.turns % 2), 'the player who places the last t\'an wins');
}
console.log(`classic rules: ${checks} checks passed`);

// --- Balance tuning --------------------------------------------------------------------------
// How often does careless play (random true joins) trip the spin, versus careful play?
function simulate(limit, games = 300) {
  let carelessFlings = 0;
  let carelessMoves = 0;
  let carefulStuck = 0;
  for (let s = 0; s < games; s++) {
    const g = K.createGame({ seed: 5000 + s, balanceLimit: limit, crumpleCandidates: 4 });
    const rng = K.mulberry32(s);
    // Careless: any true join, in random order.
    const careless = K.createGame({ seed: 5000 + s, balanceLimit: limit, crumpleCandidates: 4 });
    while (!careless.complete) {
      const miss = K.missingEdges(careless);
      const [u, v] = L.edges[miss[Math.floor(rng() * miss.length)]];
      const r = K.play(careless, u, v);
      carelessMoves += 1;
      if (r.kind === 'flung') carelessFlings += 1;
      if (carelessMoves > 1e6) throw new Error('runaway');
    }
    // Careful: random among balanced true joins; count states with none.
    while (!g.complete) {
      const miss = K.missingEdges(g);
      const safe = miss.filter((e) => K.balancedAfter(g, e));
      if (!safe.length) carefulStuck += 1;
      const pool = safe.length ? safe : miss;
      const [u, v] = L.edges[pool[Math.floor(rng() * pool.length)]];
      K.play(g, u, v);
    }
  }
  return {
    limit,
    carelessFlingRate: (carelessFlings / carelessMoves).toFixed(3),
    carefulStuckPerGame: (carefulStuck / games).toFixed(3),
  };
}
if (process.argv.includes('--tune')) {
  for (const limit of [1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4]) console.log(simulate(limit));
}
