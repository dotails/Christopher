// Kal-toh rules. Pure logic over the physical nest (nest.js) and its statics (statics.js).
//
// The structure turns on a hidden spin: an axis through the centre mass, an intensity, and in
// some games a steady drift. Every move is tested against those forces at once.
//
// A move bridges two pieces with a new t'an. The touch points must lie within one rod's length,
// and the new t'an rests touching both without passing through anything. Then:
//   - If it closes a loop that winds around the hidden axis, that loop is a hoop in the spin:
//     its t'an slide tip to tip into a perfect ring at the latitude where a ring of that many
//     t'an fits the field's sphere. A ring holds itself, and steadies whatever hangs from it.
//   - The structure is tested under the hidden forces. Bonds that cannot bear their load give
//     way, and anything no longer held by the centre mass or a ring falls.
// Ring by ring a sphere forms. When its rings reach from pole to pole, linked to one another,
// the remaining chaos falls away and the kal-toh is complete.
import * as G from './geom.js';
import { Nest, CORE, growNest } from './nest.js';
import { analyze, settle } from './statics.js';
import { relax } from './relax.js';

export const ROD_LENGTH = 0.42;
export const ROD_THICKNESS = 0.02;
export const FIELD_RADIUS = 0.7; // radius of the sphere the rings settle onto
export const CORE_RADIUS = 0.05;
export const CAPS = { force: 1, moment: 0.12 };
const RING_STRENGTH = 2; // the joints of a ring hold twice as firmly as a chance crossing
export const TUNING = { ringReach: 0.22 };

export const DEFAULTS = {
  mode: 'harmony', // harmony | collapse | meditation
  players: 1,
  opponent: 'adept', // none | novice | adept | master: a Vulcan takes the second seat
  spin: 'random', // random | calm | moderate | strong
  drift: false,
  density: 'medium', // light | medium | dense
  form: 'globe', // lantern | globe | sphere
  axis: 'hidden', // hidden | shown
  strain: true,
  test: 'turn', // turn | free | off
  chains: false, // a ring earns another turn (as boxes do in dots and boxes)
  lives: 3,
  supply: 40,
};

const SPIN = { calm: 0.6, moderate: 0.85, strong: 1.1 };
const DENSITY = { light: 45, medium: 60, dense: 80 };

// A ring of k t'an meeting tip to tip has this radius. A ring may also be drawn tighter, each t'an
// crossing its neighbours short of their tips, down to TIGHTEST of that.
export function ringRadius(k) {
  return ROD_LENGTH / (2 * Math.sin(Math.PI / k));
}
const TIGHTEST = 0.55;
export let MAX_RING = 10;
export function setMaxRing(k) { MAX_RING = k; }

// ---------------------------------------------------------------------------------------------
// A new game.

function hiddenAxis(rng) {
  const elevation = (15 + rng() * 60) * (Math.PI / 180);
  const azimuth = rng() * Math.PI * 2;
  return [Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)];
}

// The starting nest is whatever survives the hidden forces: grow, test, and grow again until
// enough holds. So nothing floats, and no chain hangs out further than its bonds can bear.
export function buildNest(rng, target, forces, margin = 1.2) {
  const nest = growNest(rng, { count: Math.round(target * 1.2), length: ROD_LENGTH, thickness: ROD_THICKNESS, coreRadius: CORE_RADIUS });
  // Tested harder than the game will test it, so the opening position is not already on the edge.
  const harder = { ...forces, spin: forces.spin * margin, drift: G.scale(forces.drift, margin) };
  for (let round = 0; ; round++) {
    settle(nest, harder, CAPS);
    const free = nest.liveRods.filter((r) => !r.anchored).length;
    if (free >= target || round >= 6) break;
    growNest(rng, { nest, count: Math.ceil((target - free) * 1.3), core: 0, length: ROD_LENGTH, thickness: ROD_THICKNESS, coreRadius: CORE_RADIUS });
  }
  return nest;
}

// A deep copy, for trying moves without making them.
export function cloneGame(game) {
  const nest = new Nest({ length: game.nest.L, thickness: game.nest.T, coreRadius: game.nest.coreRadius });
  nest.rods = game.nest.rods.map((r) => ({ ...r, a: [...r.a], b: [...r.b] }));
  nest.bonds = game.nest.bonds.map((b) => ({ ...b }));
  return {
    ...game,
    settings: { ...game.settings },
    nest,
    rings: game.rings.map((r) => ({ ...r, rods: [...r.rods] })),
    players: game.players.map((p) => ({ ...p })),
    history: [...game.history],
  };
}

// A plain copy that can cross to a worker (no functions), and back.
export function serializeGame(game) {
  const { rng, nest, ...rest } = game;
  return { ...rest, nest: { L: nest.L, T: nest.T, coreRadius: nest.coreRadius, rods: nest.rods, bonds: nest.bonds } };
}

export function restoreGame(data, rng = Math.random) {
  const nest = new Nest({ length: data.nest.L, thickness: data.nest.T, coreRadius: data.nest.coreRadius });
  nest.rods = data.nest.rods;
  nest.bonds = data.nest.bonds;
  return { ...data, nest, rng };
}

export function createGame(options = {}) {
  const settings = { ...DEFAULTS, ...options };
  if (settings.mode === 'meditation') {
    settings.players = 1;
    settings.opponent = 'none';
  }
  // With a Vulcan opponent there are two seats: the player, then the Vulcan.
  if (settings.opponent !== 'none') settings.players = 2;
  const seed = options.seed ?? (Math.random() * 2 ** 32) >>> 0;
  const rng = G.mulberry32(seed);
  const level = settings.spin === 'random' ? ['calm', 'moderate', 'strong'][Math.floor(rng() * 3)] : settings.spin;
  const axis = hiddenAxis(rng);
  const drift = settings.drift ? G.scale(G.randomUnit(rng), 0.18 + rng() * 0.12) : [0, 0, 0];
  const forces = { axis, spin: SPIN[level], drift, level };
  const nest = buildNest(rng, DENSITY[settings.density] ?? DENSITY.medium, forces);
  return {
    seed,
    rng,
    settings,
    forces,
    nest,
    rings: [],
    players: Array.from({ length: settings.players }, (_, i) => ({
      score: 0, lives: settings.lives, placed: 0, fallen: 0, out: false,
      vulcan: settings.opponent !== 'none' && i === 1,
    })),
    baseSpin: forces.spin,
    current: 0,
    turns: 0,
    moves: 0,
    supply: settings.mode === 'meditation' ? Infinity : settings.supply,
    complete: false,
    revealed: settings.axis === 'shown', // the axis is public once a ring has formed or the spin was tested
    over: false,
    winner: -1,
    history: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Placing a t'an.

// Where a new rod would rest to bridge the touch points on two pieces. `toward` is a point on
// the player's side (the eye), so the rod lies on the near side of what it touches.
export function placement(game, hitA, hitB, toward) {
  const { nest } = game;
  const L = nest.L;
  const T = nest.T;
  if (hitA.rod === hitB.rod) return { ok: false, reason: 'same' };
  const ra = nest.rods[hitA.rod];
  const rb = nest.rods[hitB.rod];
  if (!ra?.alive || !rb?.alive) return { ok: false, reason: 'gone' };
  const pa = nest.point(hitA.rod, hitA.s);
  const pb = nest.point(hitB.rod, hitB.s);
  const span = G.dist(pa, pb);
  if (span > L - 2 * T) return { ok: false, reason: 'far', span };
  if (span < L * 0.3) return { ok: false, reason: 'near', span };

  // Rest against each piece's side: offset each touch point by one thickness, away from the
  // piece and toward the player, perpendicular to both rods. Refine twice as the rod turns.
  const side = (rod, p, dir) => {
    const u = G.normalize(G.sub(rod.b, rod.a));
    let n = G.cross(u, dir);
    if (G.length(n) < 1e-6) n = G.perpendicular(u);
    n = G.normalize(n);
    if (G.dot(n, G.sub(toward, p)) < 0) n = G.scale(n, -1);
    return G.madd(p, n, T);
  };
  let qa = pa;
  let qb = pb;
  for (let i = 0; i < 3; i++) {
    const dir = G.normalize(G.sub(qb, qa));
    qa = side(ra, pa, dir);
    qb = side(rb, pb, dir);
  }
  const dir = G.normalize(G.sub(qb, qa));
  const mid = G.lerp(qa, qb, 0.5);
  const a = G.madd(mid, dir, -L / 2);
  const b = G.madd(mid, dir, L / 2);

  // It may touch other t'an, but never pass through one.
  const ignore = new Set([hitA.rod, hitB.rod]);
  if (nest.clearance(a, b, ignore) < -T * 0.05) return { ok: false, reason: 'blocked', span };
  for (const id of [hitA.rod, hitB.rod]) {
    const r = nest.rods[id];
    if (Math.sqrt(G.closestSegSeg(a, b, r.a, r.b).d2) < T * 0.9) return { ok: false, reason: 'blocked', span };
  }
  const contacts = nest.contacts(a, b, new Set(), 0.08).filter((c) => c.rod !== CORE);
  return { ok: true, a, b, span, contacts, pieces: [hitA.rod, hitB.rod] };
}

// ---------------------------------------------------------------------------------------------
// Loops around the hidden axis.

function axisFrame(axis) {
  const [e1, e2] = G.frameAround(axis);
  return { axis, e1, e2 };
}

const project = (f, p) => [G.dot(p, f.e1), G.dot(p, f.e2)];

// How a straight step from p to q (projected around the axis) crosses the cut along the
// negative e1 half-plane: +1 one way round, -1 the other, 0 if it does not.
function crossing(f, p, q) {
  const [px, py] = project(f, p);
  const [qx, qy] = project(f, q);
  if ((py >= 0) === (qy >= 0)) return 0;
  const t = py / (py - qy);
  const x = px + (qx - px) * t;
  if (x >= 0) return 0;
  return py >= 0 ? 1 : -1;
}

const bondPoint = (nest, b) => (b.r2 === CORE ? nest.point(b.r1, b.s1) : G.lerp(nest.point(b.r1, b.s1), nest.point(b.r2, b.s2), 0.5));

// The shortest loop through the new rod that winds once around the axis, using only free rods
// (not the centre mass, not existing rings). Breadth-first over (rod, times around the cut).
export function girdlingLoop(game, rodId, firstBond, lastBond) {
  const { nest } = game;
  const f = axisFrame(game.forces.axis);
  const free = (id) => id !== CORE && nest.rods[id].alive && !nest.rods[id].anchored && nest.rods[id].ring < 0;
  const start = Nest.far(firstBond, rodId).other;
  const end = Nest.far(lastBond, rodId).other;
  if (!free(start) || !free(end) || start === end) return null;
  const adjacency = nest.adjacency();
  const startPoint = bondPoint(nest, firstBond);
  const endPoint = bondPoint(nest, lastBond);
  // Closing: along the end rod to the new rod, then along the new rod back to the start.
  const closing = (from) => crossing(f, from, endPoint) + crossing(f, endPoint, startPoint);

  const key = (rod, sheet) => `${rod}:${sheet}`;
  const queue = [{ rod: start, point: startPoint, sheet: 0, depth: 1, prev: null, bond: firstBond }];
  const seen = new Set([key(start, 0)]);
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i];
    if (s.rod === end) {
      const total = s.sheet + closing(s.point);
      if (Math.abs(total) === 1) {
        const loop = [rodId];
        const bonds = [lastBond];
        for (let n = s; n; n = n.prev) {
          loop.push(n.rod);
          bonds.push(n.bond);
        }
        // loop: new rod, then the path from the end rod back to the start rod - the reverse of
        // the way `total` was counted, so in the loop's own order it winds the other way.
        if (new Set(loop).size === loop.length) return { rods: loop, bonds, turn: -total };
      }
    }
    if (s.depth >= MAX_RING - 1) continue;
    for (const { bond, other } of adjacency.get(s.rod) ?? []) {
      if (other === rodId || bond === s.bond || !free(other)) continue;
      const p = bondPoint(nest, bond);
      const sheet = s.sheet + crossing(f, s.point, p);
      if (Math.abs(sheet) > 2) continue;
      const k = key(other, sheet);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ rod: other, point: p, sheet, depth: s.depth + 1, prev: s, bond });
    }
  }
  return null;
}

// Where each rod of a loop goes to become a ring: a regular polygon square to the axis and
// centred on it, where the loop already is - at the loop's mean height, and as wide as the loop
// (no wider than its t'an can reach tip to tip, no tighter than TIGHTEST of that). Each t'an
// falls slightly along its length so that where neighbours cross they pass one thickness apart.
// Returns null if the loop cannot become a ring: too far to travel, or blocked by the centre
// mass or another ring.
export function ringTarget(game, loop) {
  const { nest, forces } = game;
  const k = loop.rods.length;
  if (k < 3 || k > MAX_RING) return null;
  const L = nest.L;
  const T = nest.T;
  const f = axisFrame(forces.axis);
  // The loop's corners: where consecutive rods meet.
  const corners = loop.bonds.map((b) => bondPoint(nest, b));
  const height = corners.reduce((sum, p) => sum + G.dot(p, f.axis), 0) / k;
  const spread = corners.reduce((sum, p) => sum + Math.hypot(G.dot(p, f.e1), G.dot(p, f.e2)), 0) / k;
  const full = ringRadius(k);
  const radius = G.clamp(spread, full * TIGHTEST, full);
  // Turn the polygon to sit as near as it can to where the loop already is.
  const dirSign = loop.turn > 0 ? 1 : -1;
  let sx = 0;
  let sy = 0;
  corners.forEach((p, j) => {
    const base = Math.atan2(G.dot(p, f.e2), G.dot(p, f.e1)) - (dirSign * 2 * Math.PI * j) / k;
    sx += Math.cos(base);
    sy += Math.sin(base);
  });
  const phase = Math.atan2(sy, sx);
  const vertex = (j) => {
    const t = phase + (dirSign * 2 * Math.PI * j) / k;
    return G.add(G.scale(f.axis, height), G.add(G.scale(f.e1, radius * Math.cos(t)), G.scale(f.e2, radius * Math.sin(t))));
  };
  const side = 2 * radius * Math.sin(Math.PI / k);
  const drop = (T * L) / side;
  // loop.bonds[j] joins loop.rods[j] and loop.rods[j + 1]: corner j lies between them.
  const places = loop.rods.map((id, j) => {
    const c0 = vertex((j - 1 + k) % k);
    const c1 = vertex(j);
    const mid = G.lerp(c0, c1, 0.5);
    const along = G.normalize(G.sub(G.scale(G.normalize(G.sub(c1, c0)), L), G.scale(f.axis, drop)));
    return { rod: id, a: G.madd(mid, along, -L / 2), b: G.madd(mid, along, L / 2) };
  });
  // How far its t'an must travel. A loop too far from a ring's shape cannot find it.
  let shift = 0;
  for (const p of places) {
    const rod = nest.rods[p.rod];
    shift += Math.min(G.dist(rod.a, p.a) + G.dist(rod.b, p.b), G.dist(rod.a, p.b) + G.dist(rod.b, p.a)) / 2;
  }
  shift /= k;
  if (shift > TUNING.ringReach) return null;
  // Nothing can push aside the centre mass, or a ring.
  const members = new Set(loop.rods);
  for (const r of nest.rods) {
    if (!r.alive || members.has(r.id) || !(r.anchored || r.ring >= 0)) continue;
    for (const p of places) if (Math.sqrt(G.closestSegSeg(p.a, p.b, r.a, r.b).d2) < T * 0.9) return null;
  }
  for (const p of places) if (Math.sqrt(G.closestPointSeg([0, 0, 0], p.a, p.b).d2) < nest.coreRadius + T) return null;
  return { k, radius, height, places, shift, tight: radius < full - 1e-6 };
}

// Form a ring: its t'an are drawn home and meet tip to tip; whatever touches them slides and
// turns to stay in touch, or lets go; anything still caught inside another t'an is knocked away.
function formRing(game, loop, target, player) {
  const { nest } = game;
  const T = nest.T;
  const ringRods = target.places.map((p) => p.rod);
  const ringSet = new Set(ringRods);
  const before = new Map(nest.liveRods.map((r) => [r.id, { a: [...r.a], b: [...r.b] }]));

  // The loop's own contacts give way to tip-to-tip joints.
  for (const b of nest.bonds) if (b.alive && ringSet.has(b.r1) && b.r2 !== CORE && ringSet.has(b.r2)) b.alive = false;
  // Each t'an goes to its side of the polygon, ends paired with the nearer corners.
  const targets = new Map();
  for (const place of target.places) {
    const rod = nest.rods[place.rod];
    const straight = G.dist(rod.a, place.a) + G.dist(rod.b, place.b);
    const flipped = G.dist(rod.a, place.b) + G.dist(rod.b, place.a);
    targets.set(rod.id, flipped < straight ? { a: place.b, b: place.a } : { a: place.a, b: place.b });
  }
  const fixed = new Set(nest.liveRods.filter((r) => r.anchored || r.ring >= 0).map((r) => r.id));
  const { torn } = relax(nest, { targets, fixed });

  const ring = { id: game.rings.length, k: target.k, height: target.height, radius: target.radius, rods: ringRods, by: player };
  game.rings.push(ring);
  for (const id of ringRods) nest.rods[id].ring = ring.id;
  for (let j = 0; j < target.places.length; j++) {
    const r1 = nest.rods[target.places[j].rod];
    const r2 = nest.rods[target.places[(j + 1) % target.places.length].rod];
    const c = G.closestSegSeg(r1.a, r1.b, r2.a, r2.b);
    const bond = nest.addBond(r1.id, r2.id, c.s, c.t);
    bond.strength = RING_STRENGTH;
  }

  // Anything still caught inside another t'an is knocked away.
  const knocked = [];
  const live = nest.liveRods;
  for (const r of live) {
    if (r.anchored || r.ring >= 0) continue;
    for (const o of live) {
      if (o.id === r.id || !o.alive) continue;
      if (Math.sqrt(G.closestSegSeg(r.a, r.b, o.a, o.b).d2) < T * 0.85) {
        knocked.push(r.id);
        for (const b of nest.bonds) if (b.alive && (b.r1 === r.id || b.r2 === r.id)) b.alive = false;
        r.alive = false;
        break;
      }
    }
  }
  for (const id of knocked) nest.rods[id].alive = true; // they fall in settle(), with the rest

  // Whatever a moved t'an now rests against, it clings to.
  const moved = [];
  const bonded = new Set(nest.liveBonds.map((b) => `${Math.min(b.r1, b.r2)}:${Math.max(b.r1, b.r2)}`));
  for (const [id, from] of before) {
    const rod = nest.rods[id];
    if (!rod.alive || knocked.includes(id)) continue;
    if (G.dist(rod.a, from.a) + G.dist(rod.b, from.b) < 1e-4) continue;
    moved.push({ rod: id, from, to: { a: [...rod.a], b: [...rod.b] } });
    for (const c of nest.contacts(rod.a, rod.b, new Set([id, ...knocked]), 0.06)) {
      const key = `${Math.min(id, c.rod)}:${Math.max(id, c.rod)}`;
      if (bonded.has(key)) continue;
      bonded.add(key);
      nest.addBond(id, c.rod, c.s, c.t);
    }
  }
  return { ring, moved, knocked, torn };
}

// ---------------------------------------------------------------------------------------------
// Completion: rings from pole to pole, every one held.

export const FORMS = {
  // rings: how many in all; north/south: how many above and below the centre mass;
  // girdle: one about the middle; caps: one crowning each pole.
  lantern: { rings: 2, north: 1, south: 1 },
  globe: { rings: 4, north: 1, south: 1, girdle: true },
  sphere: { rings: 6, north: 2, south: 2, girdle: true, caps: true },
};
const BAND = 0.15; // rings within this of the middle girdle it; beyond it they are north or south
const CAP = 0.4; // rings beyond this crown a pole

export function formProgress(game) {
  const form = FORMS[game.settings.form] ?? FORMS.globe;
  const rings = game.rings.filter((r) => !r.broken);
  const north = rings.filter((r) => r.height > BAND);
  const south = rings.filter((r) => r.height < -BAND);
  const need = {
    rings: rings.length >= form.rings,
    north: north.length >= form.north,
    south: south.length >= form.south,
    girdle: !form.girdle || rings.some((r) => Math.abs(r.height) <= BAND),
    caps: !form.caps || (north.some((r) => r.height >= CAP) && south.some((r) => r.height <= -CAP)),
  };
  return { ...need, rings: rings.length, need, done: Object.values(need).every(Boolean), form };
}

// The finished kal-toh keeps its rings, its centre mass, and only what holds them: the rest of
// the chaos falls away, outermost first, as long as what remains still bears its load.
function shed(game) {
  const { nest } = game;
  const shedRods = [];
  const candidates = nest.liveRods.filter((r) => r.ring < 0 && r.kind !== 'core');
  candidates.sort((p, q) => G.length(G.lerp(q.a, q.b, 0.5)) - G.length(G.lerp(p.a, p.b, 0.5)));
  const ringRods = nest.liveRods.filter((r) => r.ring >= 0).map((r) => r.id);
  for (const rod of candidates) {
    const bonds = nest.bondsOf(rod.id);
    rod.alive = false;
    for (const b of bonds) b.alive = false;
    const held = nest.supported();
    const sound = ringRods.every((id) => held.has(id)) && (analyze(nest, game.forces, CAPS).worst?.util ?? 0) <= 1;
    if (sound && nest.liveRods.every((r) => held.has(r.id))) {
      shedRods.push(rod.id);
      continue;
    }
    rod.alive = true;
    for (const b of bonds) b.alive = true;
  }
  return shedRods;
}

// ---------------------------------------------------------------------------------------------
// A turn.

function nextPlayer(game) {
  const n = game.players.length;
  for (let i = 1; i <= n; i++) {
    const p = (game.current + i) % n;
    if (!game.players[p].out) {
      game.current = p;
      return;
    }
  }
}

function finish(game, winner) {
  game.over = true;
  game.winner = winner;
}

// Play a placement found by placement(). Mutates the game and reports everything that moved.
// `quick` caps how long a collapse is followed (for weighing moves without making them).
export function play(game, pose, { quick = false } = {}) {
  const { nest, settings } = game;
  const player = game.current;
  const me = game.players[player];
  const before = new Map(nest.liveRods.map((r) => [r.id, { a: [...r.a], b: [...r.b] }]));
  const rod = nest.addRod(pose.a, pose.b, { kind: 'placed', by: player, born: game.moves });
  for (const c of pose.contacts) nest.addBond(rod.id, c.rod, c.s, c.t);
  me.placed += 1;
  game.moves += 1;
  if (Number.isFinite(game.supply)) game.supply -= 1;

  const result = { player, rod: rod.id, ring: null, moved: [], knocked: [], torn: [], fallen: [], broken: [], points: 0, again: false, complete: false };

  // Does it close a loop around the hidden axis?
  const bonds = nest.bondsOf(rod.id);
  const first = bonds.find((b) => Nest.far(b, rod.id).other === pose.pieces[0]);
  const last = bonds.find((b) => Nest.far(b, rod.id).other === pose.pieces[1]);
  const loop = first && last ? girdlingLoop(game, rod.id, first, last) : null;
  const target = loop ? ringTarget(game, loop) : null;
  if (target) {
    game.revealed = true;
    const formed = formRing(game, loop, target, player);
    result.ring = formed.ring;
    result.moved = formed.moved;
    result.knocked = formed.knocked;
    result.torn = formed.torn;
  }

  // The hidden forces act.
  const s = settle(nest, game.forces, CAPS, quick ? { maxBreaks: 4 } : {});
  result.broken = s.broken;
  result.fallen = s.fallen.filter((id) => !result.knocked.includes(id));
  result.lost = s.fallen.length;
  me.fallen += result.lost;
  // A ring that lost a t'an is only t'an again.
  for (const ring of game.rings) {
    if (ring.broken || ring.rods.every((id) => nest.rods[id].alive)) continue;
    ring.broken = true;
    for (const id of ring.rods) nest.rods[id].ring = -1;
  }
  if (result.ring?.broken) result.ringLost = true;

  // Scoring by mode.
  if (settings.mode === 'harmony') {
    if (result.ring && !result.ring.broken) result.points += result.ring.k;
    result.points -= result.lost;
    me.score += result.points;
  } else if (settings.mode === 'collapse' && result.lost >= 2) {
    me.lives -= 1;
    result.lifeLost = true;
    if (me.lives <= 0) me.out = true;
  }

  // Is the kal-toh complete?
  const progress = formProgress(game);
  result.progress = progress;
  if (progress.done) {
    result.shed = shed(game);
    result.complete = true;
    game.complete = true;
    if (settings.mode === 'harmony') {
      me.score += 10;
      result.points += 10;
    }
    const best = settings.mode === 'harmony'
      ? game.players.reduce((w, p, i) => (p.score > game.players[w].score ? i : w), 0)
      : player;
    finish(game, best);
  }

  // Out of t'an, or only one player left standing.
  if (!game.over && settings.mode === 'collapse') {
    const standing = game.players.map((p, i) => (p.out ? -1 : i)).filter((i) => i >= 0);
    if (game.players.length > 1 && standing.length === 1) finish(game, standing[0]);
    else if (standing.length === 0) finish(game, -1);
  }
  if (!game.over && game.supply <= 0) {
    const best = game.players.reduce((w, p, i) => (p.score > game.players[w].score ? i : w), 0);
    finish(game, settings.mode === 'harmony' ? best : -1);
  }

  // A ring earns another turn, if the rules allow it.
  result.again = Boolean(result.ring) && settings.chains && settings.mode !== 'meditation' && !game.over;
  if (!game.over && !result.again) {
    const before = game.current;
    nextPlayer(game);
    // In collapse the spin quickens with every round, until something must give.
    if (settings.mode === 'collapse' && game.current <= before) {
      game.round = (game.round ?? 0) + 1;
      game.forces.spin = game.baseSpin * (1 + 0.06 * game.round);
      result.quickened = true;
    }
  }
  game.turns += 1;
  result.before = before;
  game.history.push({ player, rod: rod.id, ring: result.ring && !result.ring.broken ? result.ring.k : 0, lost: result.lost });
  return result;
}

// Spending a turn to watch it spin: costs the turn unless the rules say otherwise.
export function spinTest(game) {
  const cost = game.settings.test;
  if (cost === 'off') return { allowed: false };
  const analysis = analyze(game.nest, game.forces, CAPS);
  game.revealed = true;
  if (cost === 'turn' && !game.over) {
    game.turns += 1;
    nextPlayer(game);
  }
  return { allowed: true, analysis };
}

// Strain on each rod (0 calm .. 1 at its limit), for trembling cues.
export function strain(game) {
  const analysis = analyze(game.nest, game.forces, CAPS);
  const perRod = new Map();
  for (const b of game.nest.bonds) {
    if (!b.alive) continue;
    const u = analysis.util.get(b.id) ?? 0;
    for (const id of [b.r1, b.r2]) if (id !== CORE) perRod.set(id, Math.max(perRod.get(id) ?? 0, u));
  }
  return { perRod, imbalance: analysis.reaction };
}
