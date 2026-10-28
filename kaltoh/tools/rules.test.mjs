// Checks the rules: placing a t'an, loops becoming rings, the hidden forces, turns and scoring,
// and - over many random games - that the structure never breaks its own physics.
// Run: node kaltoh/tools/rules.test.mjs [--report]
import assert from 'node:assert/strict';
import * as G from '../android/app/src/main/assets/www/js/geom.js';
import { Nest, CORE } from '../android/app/src/main/assets/www/js/nest.js';
import { assess } from '../android/app/src/main/assets/www/js/statics.js';
import * as R from '../android/app/src/main/assets/www/js/rules.js';
import * as AI from '../android/app/src/main/assets/www/js/ai.js';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (${a} vs ${b})`);
const report = process.argv.includes('--report');
const L = R.ROD_LENGTH;
const T = R.ROD_THICKNESS;
const segDist = (p, q) => Math.sqrt(G.closestSegSeg(p.a, p.b, q.a, q.b).d2);

// Physical invariants of any position: t'an keep their length, touch but never pass through one
// another, every one hangs from the centre mass, and the structure bears the hidden forces.
function physical(game, label) {
  const { nest } = game;
  const live = nest.liveRods;
  const bonded = new Set(nest.liveBonds.filter((b) => b.r2 !== CORE).map((b) => `${Math.min(b.r1, b.r2)}:${Math.max(b.r1, b.r2)}`));
  let closest = Infinity;
  for (const r of live) near(G.dist(r.a, r.b), L, 1e-6, `${label}: t'an ${r.id} keeps its length`);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const d = segDist(live[i], live[j]);
      if (!bonded.has(`${Math.min(live[i].id, live[j].id)}:${Math.max(live[i].id, live[j].id)}`)) closest = Math.min(closest, d);
    }
  }
  ok(closest >= T * 0.84, `${label}: nothing passes through anything (closest ${closest.toFixed(4)})`);
  const held = nest.supported();
  ok(live.every((r) => held.has(r.id)), `${label}: every t'an hangs from the centre mass`);
  const a = assess(nest, game.forces, R.CAPS);
  ok(!a.worst || a.worst.util <= 1 + 1e-6, `${label}: the structure bears its load (${a.worst?.util.toFixed(3)})`);
  for (const ring of game.rings.filter((r) => !r.broken)) {
    ok(ring.rods.every((id) => nest.rods[id].alive && nest.rods[id].ring === ring.id), `${label}: ring ${ring.id} is whole`);
  }
}

// --- A fresh game ------------------------------------------------------------------------------
for (const density of ['light', 'medium', 'dense']) {
  const game = R.createGame({ seed: 11, density });
  physical(game, `new ${density} game`);
  const free = game.nest.liveRods.filter((r) => !r.anchored).length;
  ok(free >= 30, `a ${density} nest has plenty of t'an (${free})`);
  ok(game.nest.liveRods.some((r) => r.kind === 'core'), 'it has a centre mass');
  ok(Math.abs(G.length(game.forces.axis) - 1) < 1e-9, 'the hidden axis is a direction');
  ok(!game.revealed, 'the axis starts hidden');
}
{
  const a = R.createGame({ seed: 5 });
  const b = R.createGame({ seed: 5 });
  ok(a.nest.liveRods.length === b.nest.liveRods.length && G.dist(a.nest.rods[20].a, b.nest.rods[20].a) < 1e-12, 'a seed reproduces its game');
  const c = R.cloneGame(a);
  c.nest.rods[20].a[0] += 1;
  c.players[0].score = 99;
  ok(a.nest.rods[20].a[0] !== c.nest.rods[20].a[0] && a.players[0].score === 0, 'a copy is independent of the original');
}

// --- A made-to-order position: an open loop around a known axis ----------------------------------
// Six t'an around the vertical axis, each crossing the next near its tip, one missing; each rests
// on a pillar held by the field. Closing the gap should make a ring.
function openLoop({ k = 6, radius = 0.36, height = 0.3, jitter = 0.03, centre = [0, 0, 0], skip = [0] } = {}) {
  const game = R.createGame({ seed: 3, density: 'light', chains: true, opponent: 'none' });
  const nest = new Nest({ length: L, thickness: T, coreRadius: R.CORE_RADIUS });
  game.nest = nest;
  game.forces = { axis: [0, 1, 0], spin: 0.6, drift: [0, 0, 0], level: 'calm' };
  game.rings = [];
  nest.addRod([-L / 2, -0.12, 0], [L / 2, -0.12, 0], { anchored: true, kind: 'core' });
  const rng = G.mulberry32(7);
  const angles = Array.from({ length: k }, (_, j) => (2 * Math.PI * j) / k + (rng() - 0.5) * jitter);
  const vertex = (j) => {
    const t = angles[(j + k) % k];
    return G.add(centre, [radius * Math.cos(t), height, radius * Math.sin(t)]);
  };
  const ids = [];
  for (let j = 0; j < k; j++) {
    const c0 = vertex(j - 1);
    const c1 = vertex(j);
    const side = G.dist(c0, c1);
    const drop = (T * L) / side;
    const mid = G.lerp(c0, c1, 0.5);
    const along = G.normalize(G.sub(G.scale(G.normalize(G.sub(c1, c0)), L), [0, drop, 0]));
    ids.push(skip.includes(j) ? -1 : nest.addRod(G.madd(mid, along, -L / 2), G.madd(mid, along, L / 2)).id);
  }
  // Bond the neighbours where they cross, and stand each on a pillar.
  for (let j = 0; j < k; j++) {
    const p = ids[j];
    const q = ids[(j + 1) % k];
    if (p < 0 || q < 0) continue;
    const c = G.closestSegSeg(nest.rods[p].a, nest.rods[p].b, nest.rods[q].a, nest.rods[q].b);
    nest.addBond(p, q, c.s, c.t);
  }
  for (const id of ids) {
    if (id < 0) continue;
    const m = G.lerp(nest.rods[id].a, nest.rods[id].b, 0.5);
    const top = G.sub(m, [0, T, 0]);
    const pillar = nest.addRod(G.sub(top, [0, L, 0]), top, { anchored: true, kind: 'core' });
    nest.addBond(id, pillar.id, 0.5, 1);
  }
  return { game, ids };
}

{
  const { game, ids } = openLoop();
  const { nest } = game;
  // Sanity of the setup: neighbours touch, nothing passes through anything.
  for (let j = 1; j < ids.length - 1; j++) near(segDist(nest.rods[ids[j]], nest.rods[ids[j + 1]]), T, T * 0.08, 'set-up: neighbours touch');
  physical(game, 'open loop');

  // Placing: the reasons a placement is refused.
  const eye = [0, 0.3, 3];
  ok(R.placement(game, { rod: ids[1], s: 0.1 }, { rod: ids[1], s: 0.9 }, eye).reason === 'same', 'a t\'an cannot join a piece to itself');
  ok(R.placement(game, { rod: ids[1], s: 0.05 }, { rod: ids[4], s: 0.5 }, eye).reason === 'far', 'nor reach further than its own length');
  ok(R.placement(game, { rod: ids[1], s: 0.95 }, { rod: ids[2], s: 0.05 }, eye).reason === 'near', 'nor bridge two touch points almost on top of each other');

  // Closing the gap: from the end of the last t'an to the start of the first.
  const last = nest.rods[ids[5]];
  const first = nest.rods[ids[1]];
  // Touch each at the corner of the gap: where it would have crossed the missing t'an.
  const side = 2 * 0.36 * Math.sin(Math.PI / 6);
  const sFirst = (L - side) / (2 * L);
  const sLast = 1 - sFirst;
  const pose = R.placement(game, { rod: last.id, s: sLast }, { rod: first.id, s: sFirst }, G.scale(G.normalize(G.lerp(last.b, first.a, 0.5)), 3));
  ok(pose.ok, `the closing t'an fits (${pose.reason ?? 'ok'})`);
  near(segDist({ a: pose.a, b: pose.b }, last), T, T * 0.1, 'it rests against the one piece');
  near(segDist({ a: pose.a, b: pose.b }, first), T, T * 0.1, 'and the other');
  near(G.dist(pose.a, pose.b), L, 1e-9, 'and is a full t\'an long');

  const before = R.cloneGame(game);
  const result = R.play(game, pose);
  ok(result.ring, 'closing a loop around the axis makes a ring');
  ok(result.ring.k === 6, `of all six t'an (${result.ring.k})`);
  ok(game.revealed, 'a ring reveals the axis');
  const ringRods = result.ring.rods.map((id) => nest.rods[id]);
  // A regular polygon square to the axis, centred on it.
  const mids = ringRods.map((r) => G.lerp(r.a, r.b, 0.5));
  const centre = G.scale(mids.reduce((s, m) => G.add(s, m), [0, 0, 0]), 1 / mids.length);
  near(Math.hypot(centre[0], centre[2]), 0, 1e-6, 'the ring is centred on the axis');
  for (const r of ringRods) near(Math.abs(G.normalize(G.sub(r.b, r.a))[1]), 0, (T * 1.2) / (0.4), 'each side lies (nearly) square to the axis');
  const apothems = mids.map((m) => Math.hypot(m[0], m[2]));
  ok(Math.max(...apothems) - Math.min(...apothems) < 1e-6, 'all sides equally far from the axis');
  near(result.ring.height, 0.3, 0.04, 'it forms where the loop was');
  near(result.ring.radius, 0.36, 0.04, 'as wide as the loop was');
  // Each t'an moved only a little: it went to its own side, not across the ring.
  for (const m of result.moved.filter((x) => result.ring.rods.includes(x.rod))) {
    ok(G.dist(m.from.a, m.to.a) + G.dist(m.from.b, m.to.b) < 0.25, `t'an ${m.rod} slid to its own side`);
  }
  // Neighbours in the ring touch, held firm.
  for (let j = 0; j < ringRods.length; j++) {
    const joints = nest.liveBonds.filter((b) => b.strength === 2 && result.ring.rods.includes(b.r1) && result.ring.rods.includes(b.r2));
    ok(joints.length === 6, 'six firm joints close the ring');
    break;
  }
  for (const b of nest.liveBonds.filter((x) => x.strength === 2)) {
    near(segDist(nest.rods[b.r1], nest.rods[b.r2]), T, T * 0.1, 'ring joints touch');
  }
  physical(game, 'after the ring');

  // Scoring and turns (one player, harmony): a ring scores its t'an, and earns another turn.
  ok(result.points === 6 - result.lost, `a ring of six scores six (less what fell): ${result.points}`);
  ok(result.again, 'a ring earns another turn');
  ok(game.current === 0 && before.current === 0, 'so the same player goes again');

  // Whatever the axis, a loop around a different one is not a ring.
  const tilted = R.cloneGame(before);
  tilted.forces = { ...tilted.forces, axis: [1, 0, 0] };
  const res2 = R.play(tilted, pose);
  ok(!res2.ring, 'a loop that does not wind around the axis stays a loop');
}

{
  // A loop off to one side of the axis does not wind around it.
  const { game, ids } = openLoop({ k: 5, radius: 0.3, centre: [0.55, 0, 0], height: 0.1 });
  const last = game.nest.rods[ids[4]];
  const first = game.nest.rods[ids[1]];
  const pose = R.placement(game, { rod: last.id, s: 0.85 }, { rod: first.id, s: 0.15 }, [0.55, 3, 0]);
  if (pose.ok) {
    const result = R.play(game, pose);
    ok(!result.ring, 'a loop beside the axis is no ring');
  } else {
    ok(true, `(off-axis loop could not be closed: ${pose.reason})`);
  }
}

{
  // A loop of the right shape but far from where a ring could be: too far to travel.
  const { game, ids } = openLoop({ k: 6, jitter: 0.5 });
  const last = game.nest.rods[ids[5]];
  const first = game.nest.rods[ids[1]];
  const pose = R.placement(game, { rod: last.id, s: 0.85 }, { rod: first.id, s: 0.15 }, [0, 3, 0]);
  if (pose.ok) {
    const result = R.play(game, pose);
    ok(!result.ring || result.ring.k === 6, 'a ragged loop either rings whole or not at all');
  }
}

// --- Forms ------------------------------------------------------------------------------------------
{
  const game = R.createGame({ seed: 2, form: 'globe' });
  const ring = (height) => ({ k: 6, height, radius: 0.4, rods: [], broken: false });
  game.rings = [ring(0.3), ring(-0.3), ring(0.05)];
  let p = R.formProgress(game);
  ok(p.north && p.south && p.girdle && !p.need.rings && !p.done, 'three rings: north, south and girdle, but a globe needs four');
  game.rings.push(ring(0.5));
  ok(R.formProgress(game).done, 'four rings make the globe');
  game.rings[2].broken = true;
  ok(!R.formProgress(game).done, 'a broken ring no longer counts');
  game.settings.form = 'lantern';
  ok(R.formProgress(game).done, 'a lantern needs only a ring above and below');
  game.settings.form = 'sphere';
  ok(!R.formProgress(game).done, 'a sphere needs more');
}

// --- The spin test ---------------------------------------------------------------------------------
{
  const game = R.createGame({ seed: 4, players: 2, opponent: 'none' });
  const t = R.spinTest(game);
  ok(t.allowed && game.revealed, 'testing the spin reveals the axis');
  ok(game.current === 1, 'and costs the turn');
  const free = R.createGame({ seed: 4, players: 2, test: 'free', opponent: 'none' });
  R.spinTest(free);
  ok(free.current === 0, 'unless testing is free');
  const off = R.createGame({ seed: 4, players: 2, test: 'off', opponent: 'none' });
  ok(!R.spinTest(off).allowed, 'or not allowed at all');
}

// --- Collapse: the spin quickens every round --------------------------------------------------------
{
  const game = R.createGame({ seed: 8, mode: 'collapse', players: 2, opponent: 'none' });
  const spin0 = game.forces.spin;
  const rng = G.mulberry32(5);
  for (let i = 0; i < 4 && !game.over; i++) {
    const moves = AI.candidateMoves(game, { rng, limit: 30 }).filter((pose) => !AI.ringFor(game, pose));
    R.play(game, moves[0]);
  }
  ok(game.round >= 1 && game.forces.spin > spin0, `in collapse the spin quickens each round (${spin0.toFixed(2)} -> ${game.forces.spin.toFixed(2)})`);
}

// --- The Vulcan, and the copy it thinks on ----------------------------------------------------------
{
  const game = R.createGame({ seed: 12 });
  ok(game.players[1].vulcan && !game.players[0].vulcan, 'against a Vulcan, the player moves first and the Vulcan second');
  const copy = R.restoreGame(JSON.parse(JSON.stringify(R.serializeGame(game))));
  ok(copy.nest.liveRods.length === game.nest.liveRods.length && copy.forces.axis[0] === game.forces.axis[0], 'a game survives the trip to a worker and back');
  const rng = G.mulberry32(3);
  const choice = AI.chooseMove(copy, { level: 'novice', rng, revealed: false });
  ok(choice && (choice.test || choice.pose?.ok), 'the Vulcan chooses a move it may make');
  if (choice.pose) {
    const again = R.placement(game, { rod: choice.pose.pieces[0], s: 0.5 }, { rod: choice.pose.pieces[1], s: 0.5 }, [0, 0, 3]);
    ok(typeof again.ok === 'boolean', 'and its pieces exist in the real game');
    const result = R.play(game, choice.pose);
    ok(result.rod >= 0, 'its move can be played on the real game');
    physical(game, 'after the Vulcan\'s move');
  }
}

// --- Many random games: the physics always holds -----------------------------------------------------
{
  let moves = 0;
  let rings = 0;
  let lost = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const game = R.createGame({ seed, players: 2, opponent: 'none', density: seed % 2 ? 'light' : 'medium' });
    const rng = G.mulberry32(seed * 101);
    for (let turn = 0; turn < 10 && !game.over; turn++) {
      const options = AI.candidateMoves(game, { rng, limit: 60 });
      if (!options.length) break;
      // Prefer rings sometimes, so rings are exercised too.
      const ringing = options.filter((pose) => AI.ringFor(game, pose));
      const pose = ringing.length && rng() < 0.6 ? ringing[0] : options[Math.floor(rng() * options.length)];
      const result = R.play(game, pose);
      moves += 1;
      if (result.ring && !result.ring.broken) rings += 1;
      lost += result.lost;
      physical(game, `game ${seed} move ${turn}`);
    }
  }
  ok(rings > 0, `random games make rings (${rings})`);
  if (report) console.log(`random games: ${moves} moves, ${rings} rings, ${lost} t'an lost`);
}

console.log(`rules: ${checks} checks passed`);
