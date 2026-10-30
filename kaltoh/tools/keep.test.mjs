// Checks keeping the game between sessions (keep.js): packed as plain data and back, a game's state
// is exactly as it was (its Maps, Sets and typed arrays among it; its random numbers left out); and
// taken up again (each way's resumeGame), a game goes on exactly as it would have - the same
// verdicts, the same state after - in the original game, many forms and zen, zen even past taking a
// new form, whose turns are drawn at random.
// Run: node kaltoh/tools/keep.test.mjs
import assert from 'node:assert/strict';

// keep.js keeps it in the page's storage (and asks the shell, which a browser has not).
const stored = new Map();
globalThis.window = {};
globalThis.localStorage = { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, String(v)), removeItem: (k) => stored.delete(k) };
const W = '../android/app/src/main/assets/www/js/';
const { pack, unpack, keepGame, keptGame } = await import(`${W}keep.js`);
const K = await import(`${W}classic-rules.js`);
const F = await import(`${W}forms-rules.js`);
const Z = await import(`${W}zen-rules.js`);

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
  console.log(`ok - ${msg}`);
};
const rngOf = (seed) => K.mulberry32(seed);

// --- Plain data, and back ----------------------------------------------------------------------
{
  const value = {
    present: new Map([[3, { seq: 1, by: 0, tree: false }], [7, { seq: 0, by: -1, tree: true }]]),
    done: new Set([2, 5]),
    order: new Float32Array([0.25, 0.5]),
    at: [1 / 3, -2e-9, 4294967295],
    rng: () => 0.5,
    name: 'tetra',
  };
  const back = unpack(pack(value));
  ok(back.present instanceof Map && back.present.get(3).seq === 1 && back.present.get(7).tree === true && back.present.size === 2, 'a Map comes back a Map, its entries as they were');
  ok(back.done instanceof Set && back.done.has(5) && back.order instanceof Float32Array && back.order[1] === 0.5, 'a Set a Set, a typed array the same kind of array');
  ok(back.at[0] === 1 / 3 && back.at[1] === -2e-9 && back.at[2] === 4294967295 && !('rng' in back) && back.name === 'tetra',
    'numbers exactly as they were, and functions left out');
  keepGame({ way: 'zen', game: { state: { seed: 7 } } });
  ok(keptGame()?.game.state.seed === 7 && stored.has('kaltoh.game.v1'), 'kept, it is read back');
  keepGame(null);
  ok(keptGame() === null && !stored.has('kaltoh.game.v1'), 'and forgotten, nothing is (a new game on its way)');
}

// The same moves played on a game and on the same game kept and taken up again: the same verdicts,
// and the same state after.
function goesOn(name, original, resume, moves, play) {
  const kept = resume(unpack(pack(original)));
  let same = true;
  for (const move of moves) {
    const a = play(original, move);
    const b = play(kept, move);
    if (pack(a) !== pack(b)) same = false;
  }
  const state = pack(original) === pack(kept);
  ok(same && state, `${name}: taken up again, it goes on exactly as it would have (${moves.length} moves: the same verdicts, the same state)`);
}

// --- The original game ------------------------------------------------------------------------------
{
  const lattice = K.buildLattice();
  const rng = rngOf(11);
  // Moves: true joins, mostly, and now and then two tips that are not neighbours (discord).
  const moveOf = (g) => {
    if (rng() < 0.3) {
      const u = Math.floor(rng() * 30);
      return { u, v: (u + 1 + Math.floor(rng() * 29)) % 30, ease: rng() < 0.3 };
    }
    const missing = K.missingEdges(g);
    const [u, v] = lattice.edges[missing[Math.floor(rng() * missing.length)]];
    return { u, v, ease: rng() < 0.3 };
  };
  const play = (g, m) => {
    if (m.ease) K.ease(g);
    return K.play(g, m.u, m.v);
  };
  const g = K.createGame({ seed: 4242, players: 3 });
  for (let i = 0; i < 12; i++) play(g, moveOf(g));
  const later = [];
  const probe = K.resumeGame(unpack(pack(g)));
  for (let i = 0; i < 30; i++) {
    const m = moveOf(probe);
    later.push(m);
    play(probe, m);
  }
  ok(g.history.length === 12 && g.history.some((h) => h.kind === 'harmony') && g.history.some((h) => h.kind === 'discord'), 'the original game: harmony and discord among its moves before it is kept');
  goesOn('the original game', g, (s) => K.resumeGame(s), later, play);
}

// --- Many forms ----------------------------------------------------------------------------------
{
  const rng = rngOf(12);
  const moveOf = (g) => {
    if (rng() < 0.25) {
      const a = Math.floor(rng() * 2 * g.V);
      return { a, b: Math.floor(rng() * 2 * g.V), ease: rng() < 0.3 };
    }
    const missing = F.missingEdges(g);
    if (!missing.length) return { a: 0, b: 0, ease: false };
    const [a, b] = F.tipsOf(g, g.phase, missing[Math.floor(rng() * missing.length)]);
    return { a, b, ease: rng() < 0.3 };
  };
  const play = (g, m) => {
    if (m.ease) F.ease(g);
    return F.play(g, m.a, m.b);
  };
  const g = F.createGame({ seed: 4243, players: 2 });
  for (let i = 0; i < 10; i++) play(g, moveOf(g));
  const later = [];
  const probe = F.resumeGame(unpack(pack(g)));
  for (let i = 0; i < 40; i++) {
    const m = moveOf(probe);
    later.push(m);
    play(probe, m);
  }
  ok(probe.presentOut.size > 0 || probe.phase !== 'inner' || probe.presentIn.size > g.presentIn.size, `many forms: built on as it goes (${probe.presentIn.size} inner, ${probe.presentOut.size} outer)`);
  goesOn('many forms', g, (s) => F.resumeGame(s), later, play);
}

// --- Zen -----------------------------------------------------------------------------------------
{
  const eye = [0, 0.4, 3];
  // Laid across two pieces chosen at random (where on each, too).
  const moveOf = (g, rng) => {
    for (;;) {
      const a = g.rods[Math.floor(rng() * g.rods.length)];
      const b = g.rods[Math.floor(rng() * g.rods.length)];
      if (a.id === b.id) continue;
      const pose = Z.placement(g, { rod: a.id, s: 0.1 + 0.8 * rng() }, { rod: b.id, s: 0.1 + 0.8 * rng() }, eye);
      if (pose.ok) return pose;
    }
  };
  const rng = rngOf(13);
  const g = Z.createGame({ seed: 4244 });
  for (let i = 0; i < 17; i++) Z.place(g, moveOf(g, rng));
  ok(g.stage === 1 && g.draws > 0, `zen: a form taken before it is kept, its turns drawn at random (${g.draws} drawn)`);
  const probe = Z.resumeGame(unpack(pack(g)));
  ok(probe.draws === g.draws, 'taken up again, its random numbers are drawn on from where they were');
  const later = [];
  for (let i = 0; i < 25; i++) {
    const pose = moveOf(probe, rng);
    later.push(pose);
    Z.place(probe, pose);
  }
  goesOn('zen, past taking two more forms', g, (s) => Z.resumeGame(s), later, (state, pose) => Z.place(state, pose));
}

console.log(`keep: ${checks} checks passed`);
