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
  const target = first && last ? R.ringFrom(view, rod.id, first, last)?.target ?? null : null;
  nest.rods.length = rods;
  nest.bonds.length = bonds;
  return target;
}

// sample: moves considered; weigh: moves tried out in full; ahead: replies looked at after each
// (to find the rings a move would leave - for itself alone, or for its opponent).
export const LEVELS = {
  novice: { sample: 160, weigh: 5, ahead: 0, noise: 2.5 },
  adept: { sample: 420, weigh: 8, ahead: 90, noise: 0.8 },
  master: { sample: 900, weigh: 10, ahead: 220, noise: 0.2 },
};

// The worth of a ring, to the form: its t'an, and more if it lies where the form wants one.
function ringWorth(target, wants) {
  const { band, cap } = R.TUNING;
  const h = target.height;
  let v = target.k;
  if ((wants.north && h > band) || (wants.south && h < -band) || (wants.girdle && Math.abs(h) <= band) || (wants.caps && Math.abs(h) >= cap)) v += 3;
  return v;
}

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

// Leaning toward a ring: a t'an lying around the axis, at a fair distance from it, is a step
// toward a loop there - and more so at a height where the form still wants a ring.
function promise(game, pose, axis, wants) {
  const mid = G.lerp(pose.a, pose.b, 0.5);
  const h = G.dot(mid, axis);
  const out = G.sub(mid, G.scale(axis, h));
  const r = G.length(out);
  if (r < 1e-6) return 0;
  const u = G.normalize(G.sub(pose.b, pose.a));
  const around = G.normalize(G.cross(axis, out));
  const along = Math.abs(G.dot(u, around));
  const wide = Math.exp(-(((r - 0.38) / 0.2) ** 2));
  let where = 0.4;
  const { band, cap } = R.TUNING;
  if (wants.north && h > band + 0.03) where = 1;
  if (wants.south && h < -band - 0.03) where = 1;
  if (wants.girdle && Math.abs(h) < band - 0.02) where = 1;
  if (wants.caps && Math.abs(h) > cap + 0.03) where = 1;
  return 0.6 * along * wide * where;
}

// Building toward a ring where there is none to close: within a band of heights, how far round
// the axis do the free t'an already reach, connected to one another? The widest angular gap left
// in the best-connected group is what a builder narrows, move by move, until a loop can close.
function arcGap(game, axis, lo, hi) {
  const { nest } = game;
  const [e1, e2] = G.frameAround(axis);
  const angleOf = (p) => Math.atan2(G.dot(p, e2), G.dot(p, e1));
  const members = new Map();
  for (const r of nest.rods) {
    if (!r.alive || r.anchored || r.ring >= 0) continue;
    const mid = G.lerp(r.a, r.b, 0.5);
    const h = G.dot(mid, axis);
    const out = G.length(G.sub(mid, G.scale(axis, h)));
    if (h >= lo && h <= hi && out > 0.08) members.set(r.id, [angleOf(r.a), angleOf(mid), angleOf(r.b)]);
  }
  const parent = new Map([...members.keys()].map((id) => [id, id]));
  const find = (x) => {
    while (parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  for (const b of nest.bonds) {
    if (b.alive && members.has(b.r1) && members.has(b.r2)) parent.set(find(b.r1), find(b.r2));
  }
  const groups = new Map();
  for (const [id, angles] of members) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(...angles);
  }
  let best = Math.PI * 2;
  for (const angles of groups.values()) {
    if (angles.length < 9) continue;
    angles.sort((a, b) => a - b);
    let gap = angles[0] + Math.PI * 2 - angles[angles.length - 1];
    for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
    best = Math.min(best, gap);
  }
  return best;
}

// The bands of height where the form still wants a ring.
function wantedBands(wants) {
  const { band, cap } = R.TUNING;
  const bands = [];
  if (wants.girdle) bands.push([-band + 0.01, band - 0.01]);
  if (wants.north) bands.push([band + 0.02, band + 0.3]);
  if (wants.south) bands.push([-band - 0.3, -band - 0.02]);
  if (wants.caps) bands.push([cap + 0.01, cap + 0.25], [-cap - 0.25, -cap - 0.01]);
  if (!bands.length) bands.push([-0.45, 0.45]);
  return bands;
}

// Choose a move. Returns { pose } to place a t'an, or { test: true } to test the spin.
export function chooseMove(game, { level = 'adept', rng = Math.random, revealed = false } = {}) {
  const cfg = LEVELS[level] ?? LEVELS.adept;
  const moves = candidateMoves(game, { rng, limit: cfg.sample });
  if (!moves.length) return game.settings.test !== 'off' ? { test: true } : null;
  // What the axis is believed to be: known once revealed, otherwise a handful of guesses.
  const axes = revealed ? [game.forces.axis] : Array.from({ length: 4 }, () => G.randomUnit(rng));
  const need = R.formProgress(game).need;
  const wants = { north: !need.north, south: !need.south, girdle: !need.girdle, caps: !need.caps };
  const scored = moves.map((pose) => {
    let ring = 0;
    for (const axis of axes) {
      const t = ringFor(game, pose, axis);
      if (t) ring += t.k / axes.length;
    }
    const lean = axes.reduce((s, axis) => s + promise(game, pose, axis, wants), 0) / axes.length;
    return { pose, guess: ring + lean + rng() * 0.05 };
  });
  scored.sort((p, q) => q.guess - p.guess);
  // Weigh the most promising for real, on copies of the game - and a few others, in case the
  // promising ones are all dangerous.
  const shortlist = scored.slice(0, cfg.weigh);
  for (let i = 0; i < 3 && scored.length > cfg.weigh; i++) shortlist.push(scored[cfg.weigh + Math.floor(rng() * (scored.length - cfg.weigh))]);
  const bands = revealed ? wantedBands(wants) : [];
  const gaps = bands.map(([lo, hi]) => arcGap(game, game.forces.axis, lo, hi));
  let best = null;
  for (const c of shortlist) {
    const copy = R.cloneGame(game);
    const result = R.play(copy, c.pose, { quick: true });
    let v = worth(game, game, copy, result) + (result.ring ? 0 : c.guess * 0.5);
    // A builder (alone, or when it may keep the ring) narrows the gap round the axis.
    if (bands.length && !result.ring && (game.players.length === 1 || game.settings.chains)) {
      let narrowed = 0;
      bands.forEach(([lo, hi], i) => {
        narrowed = Math.max(narrowed, gaps[i] - arcGap(copy, game.forces.axis, lo, hi));
      });
      v += narrowed * 0.9;
    }
    if (cfg.ahead && revealed && !copy.over) {
      // What would this leave the next to move? The best ring it could then close. Alone, that is
      // a loop prepared; against an opponent, a gift.
      const replies = candidateMoves(copy, { rng, limit: cfg.ahead });
      const after = R.formProgress(copy).need;
      const still = { north: !after.north, south: !after.south, girdle: !after.girdle, caps: !after.caps };
      let next = 0;
      for (const pose of replies) {
        const t = ringFor(copy, pose);
        if (t) next = Math.max(next, ringWorth(t, still));
      }
      const mine = game.players.length === 1 || result.again;
      v += mine ? next * 0.5 : -next * 0.8;
    }
    v += (rng() - 0.5) * cfg.noise;
    if (!best || v > best.v) best = { pose: c.pose, v };
  }
  // With nothing worth doing and the axis still hidden, look before leaping.
  if (!revealed && game.settings.test !== 'off' && best.v < 0.5 && rng() < 0.35) return { test: true };
  return { pose: best.pose, value: best.v };
}
