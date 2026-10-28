// A Vulcan opponent. It sees what a player sees: until a ring has formed or the spin has been
// tested, the axis is unknown to it too, and it can only guess. It weighs moves by trying them
// on a copy of the game - what would ring, what would fall - and, at higher levels, by what each
// move would leave for the next player.
import * as G from './geom.js';
import { Nest, CORE } from './nest.js';
import * as R from './rules.js';

const SPOTS = [0.08, 0.3, 0.5, 0.7, 0.92];

// Ways to bridge two pieces, touching each at one of a few points along it, from outside.
export function candidateMoves(game, { rng = Math.random, limit = Infinity } = {}) {
  const { nest } = game;
  const L = nest.L;
  const live = nest.liveRods;
  const spans = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      // Quick reject: their nearest points must be within reach.
      if (G.closestSegSeg(live[i].a, live[i].b, live[j].a, live[j].b).d2 > L * L) continue;
      for (const s1 of SPOTS) {
        const pa = G.lerp(live[i].a, live[i].b, s1);
        for (const s2 of SPOTS) {
          const span = G.dist(pa, G.lerp(live[j].a, live[j].b, s2));
          if (span <= L - 2 * nest.T && span >= L * 0.3) spans.push([live[i].id, s1, live[j].id, s2]);
        }
      }
    }
  }
  // A fair sample when there are more than we can weigh.
  if (spans.length > limit) {
    for (let i = spans.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [spans[i], spans[j]] = [spans[j], spans[i]];
    }
  }
  const out = [];
  for (const [ra, sa, rb, sb] of spans) {
    if (out.length >= limit) break;
    const pa = nest.point(ra, sa);
    const pb = nest.point(rb, sb);
    const mid = G.lerp(pa, pb, 0.5);
    const toward = G.madd(mid, G.normalize(mid), 3);
    const pose = R.placement(game, { rod: ra, s: sa }, { rod: rb, s: sb }, toward);
    if (pose.ok) out.push(pose);
  }
  return out;
}

// Would this move close a loop that rings, if the axis were `axis`? Tried on the nest itself and
// taken back at once, which is far cheaper than copying the game.
export function ringFor(game, pose, axis = game.forces.axis) {
  const { nest } = game;
  const rods = nest.rods.length;
  const bonds = nest.bonds.length;
  const rod = nest.addRod(pose.a, pose.b, { kind: 'placed' });
  for (const c of pose.contacts) nest.addBond(rod.id, c.rod, c.s, c.t);
  const view = axis === game.forces.axis ? game : { ...game, forces: { ...game.forces, axis } };
  const mine = nest.bondsOf(rod.id);
  const first = mine.find((b) => Nest.far(b, rod.id).other === pose.pieces[0]);
  const last = mine.find((b) => Nest.far(b, rod.id).other === pose.pieces[1]);
  const loop = first && last ? R.girdlingLoop(view, rod.id, first, last) : null;
  const target = loop ? R.ringTarget(view, loop) : null;
  nest.rods.length = rods;
  nest.bonds.length = bonds;
  return target;
}

export const LEVELS = {
  novice: { sample: 160, weigh: 5, foresight: false, noise: 2.5 },
  adept: { sample: 420, weigh: 8, foresight: false, noise: 0.8 },
  master: { sample: 900, weigh: 10, foresight: true, noise: 0.2 },
};

// How much a finished move is worth to the one who made it.
function worth(game, before, after, result) {
  let v = -result.lost;
  if (result.ring && !result.ring.broken) {
    v += result.ring.k;
    // Rings the form still needs are worth more than rings it already has.
    const was = R.formProgress(before);
    const now = R.formProgress(after);
    for (const key of ['north', 'south', 'girdle', 'caps']) if (now.need[key] && !was.need[key]) v += 3;
    if (result.again) v += 1;
  }
  if (result.complete) v += 15;
  return v;
}

// Leaning toward the sphere: a t'an lying around the axis near the field's surface is a step
// toward a ring there.
function promise(game, pose, axis) {
  const mid = G.lerp(pose.a, pose.b, 0.5);
  const r = G.length(mid);
  const u = G.normalize(G.sub(pose.b, pose.a));
  const around = G.normalize(G.cross(axis, mid));
  const along = Math.abs(G.dot(u, around));
  const near = Math.exp(-(((r - R.FIELD_RADIUS) / 0.18) ** 2));
  return 0.6 * along * near;
}

// Choose a move. Returns { pose } to place a t'an, or { test: true } to test the spin.
export function chooseMove(game, { level = 'adept', rng = Math.random, revealed = false } = {}) {
  const cfg = LEVELS[level] ?? LEVELS.adept;
  const moves = candidateMoves(game, { rng, limit: cfg.sample });
  if (!moves.length) return game.settings.test !== 'off' ? { test: true } : null;
  // What the axis is believed to be: known once revealed, otherwise a handful of guesses.
  const axes = revealed ? [game.forces.axis] : Array.from({ length: 4 }, () => G.randomUnit(rng));
  const scored = moves.map((pose) => {
    let ring = 0;
    for (const axis of axes) {
      const t = ringFor(game, pose, axis);
      if (t) ring += t.k / axes.length;
    }
    const lean = axes.reduce((s, axis) => s + promise(game, pose, axis), 0) / axes.length;
    return { pose, guess: ring + lean + rng() * 0.05 };
  });
  scored.sort((p, q) => q.guess - p.guess);
  // Weigh the most promising for real, on copies of the game - and a few others, in case the
  // promising ones are all dangerous.
  const shortlist = scored.slice(0, cfg.weigh);
  for (let i = 0; i < 3 && scored.length > cfg.weigh; i++) shortlist.push(scored[cfg.weigh + Math.floor(rng() * (scored.length - cfg.weigh))]);
  let best = null;
  for (const c of shortlist) {
    const copy = R.cloneGame(game);
    const result = R.play(copy, c.pose, { quick: true });
    let v = worth(game, game, copy, result) + (result.ring ? 0 : c.guess * 0.5);
    if (cfg.foresight && !result.again && !copy.over && revealed) {
      // What would this leave the next player? The best ring they could close.
      const replies = candidateMoves(copy, { rng, limit: 220 });
      let theirs = 0;
      for (const pose of replies) {
        const t = ringFor(copy, pose);
        if (t && t.k > theirs) theirs = t.k;
      }
      v -= theirs * 0.8;
    }
    v += (rng() - 0.5) * cfg.noise;
    if (!best || v > best.v) best = { pose: c.pose, v };
  }
  // With nothing worth doing and the axis still hidden, look before leaping.
  if (!revealed && game.settings.test !== 'off' && best.v < 0.5 && rng() < 0.35) return { test: true };
  return { pose: best.pose, value: best.v };
}
