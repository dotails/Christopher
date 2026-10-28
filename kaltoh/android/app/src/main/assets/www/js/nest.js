// The kal-toh as a physical thing: t'an (rods of one length) held together by magnetic
// bonds where they touch, all gathered around a centre mass. Pure data and geometry, so the
// rules and their tests run without rendering.
//
// A new nest grows the way a real one would be made: each t'an is dropped toward the centre
// mass along a random line and sticks where it first makes contact. Nothing interpenetrates;
// every t'an touches another, and every one hangs, through its bonds, from the centre mass.
import * as G from './geom.js';

export const CORE = -1; // the centre mass, at the nest's origin

export class Nest {
  constructor({ length, thickness, coreRadius }) {
    this.L = length;
    this.T = thickness;
    this.coreRadius = coreRadius;
    this.rods = [];
    this.bonds = [];
  }

  get liveRods() {
    return this.rods.filter((r) => r.alive);
  }

  get liveBonds() {
    return this.bonds.filter((b) => b.alive);
  }

  addRod(a, b, extra = {}) {
    const rod = { id: this.rods.length, a: [...a], b: [...b], alive: true, ring: -1, by: -1, kind: 'nest', ...extra };
    this.rods.push(rod);
    return rod;
  }

  // A bond where rod r1 (at fraction s1 along it) touches rod r2 (at s2), or the centre mass.
  addBond(r1, r2, s1, s2) {
    const bond = { id: this.bonds.length, r1, r2, s1, s2, alive: true };
    this.bonds.push(bond);
    return bond;
  }

  point(rodId, s) {
    if (rodId === CORE) return [0, 0, 0];
    const r = this.rods[rodId];
    return G.lerp(r.a, r.b, s);
  }

  bondsOf(rodId) {
    return this.bonds.filter((b) => b.alive && (b.r1 === rodId || b.r2 === rodId));
  }

  // The other end of a bond, and where it sits on each side.
  static far(bond, rodId) {
    return bond.r1 === rodId
      ? { other: bond.r2, here: bond.s1, there: bond.s2 }
      : { other: bond.r1, here: bond.s2, there: bond.s1 };
  }

  breakBond(bond) {
    bond.alive = false;
  }

  removeRod(rodId) {
    this.rods[rodId].alive = false;
    for (const b of this.bonds) if (b.alive && (b.r1 === rodId || b.r2 === rodId)) b.alive = false;
  }

  // Rods that hang, through bonds, from the centre mass (the core cluster the field holds).
  supported() {
    const held = new Set();
    const queue = [];
    for (const r of this.rods) {
      if (r.alive && r.anchored) {
        held.add(r.id);
        queue.push(r.id);
      }
    }
    for (const b of this.bonds) {
      if (!b.alive) continue;
      if (b.r2 === CORE && !held.has(b.r1)) {
        held.add(b.r1);
        queue.push(b.r1);
      }
    }
    const adjacency = this.adjacency();
    for (let i = 0; i < queue.length; i++) {
      for (const { other } of adjacency.get(queue[i]) ?? []) {
        if (other !== CORE && !held.has(other)) {
          held.add(other);
          queue.push(other);
        }
      }
    }
    return held;
  }

  adjacency() {
    const map = new Map();
    for (const b of this.bonds) {
      if (!b.alive) continue;
      if (!map.has(b.r1)) map.set(b.r1, []);
      map.get(b.r1).push({ bond: b, ...Nest.far(b, b.r1) });
      if (b.r2 !== CORE) {
        if (!map.has(b.r2)) map.set(b.r2, []);
        map.get(b.r2).push({ bond: b, ...Nest.far(b, b.r2) });
      }
    }
    return map;
  }

  // Distance from a segment to the nearest live rod (or the centre mass), skipping `ignore`.
  clearance(a, b, ignore = new Set()) {
    let best = Infinity;
    for (const r of this.rods) {
      if (!r.alive || ignore.has(r.id)) continue;
      const d = Math.sqrt(G.closestSegSeg(a, b, r.a, r.b).d2) - this.T;
      if (d < best) best = d;
    }
    if (!ignore.has(CORE)) {
      const d = Math.sqrt(G.closestPointSeg([0, 0, 0], a, b).d2) - this.coreRadius - this.T / 2;
      if (d < best) best = d;
    }
    return best;
  }

  // Every live rod (or the centre mass) that a segment touches, within a little slack.
  contacts(a, b, ignore = new Set(), slack = 0.06) {
    const out = [];
    const reach = this.T * (1 + slack);
    for (const r of this.rods) {
      if (!r.alive || ignore.has(r.id)) continue;
      const c = G.closestSegSeg(a, b, r.a, r.b);
      if (Math.sqrt(c.d2) <= reach) out.push({ rod: r.id, s: c.s, t: c.t, distance: Math.sqrt(c.d2) });
    }
    if (!ignore.has(CORE)) {
      const c = G.closestPointSeg([0, 0, 0], a, b);
      if (Math.sqrt(c.d2) <= this.coreRadius + this.T / 2 + this.T * slack) {
        out.push({ rod: CORE, s: c.t, t: 0, distance: Math.sqrt(c.d2) });
      }
    }
    return out;
  }
}

// Drop one rod toward the centre mass along `approach` (unit, pointing outward from the centre),
// oriented along `direction`, offset sideways by `offset`. Sphere tracing: the clearance to the
// nest only ever shrinks by as much as the rod moves, so stepping by the clearance can never
// skip a contact. Returns the resting endpoints, or null if the rod passed by.
export function dropRod(nest, approach, direction, offset, from = 2.4) {
  const half = G.scale(direction, nest.L / 2);
  let centre = G.add(G.scale(approach, from), offset);
  let travelled = 0;
  for (let step = 0; step < 400; step++) {
    const a = G.sub(centre, half);
    const b = G.add(centre, half);
    const gap = nest.clearance(a, b);
    if (gap <= 1e-4) return { a, b };
    const move = Math.max(gap * 0.999, 1e-4);
    centre = G.madd(centre, approach, -move);
    travelled += move;
    if (travelled > from * 2) return null;
  }
  return null;
}

// Having struck one rod, a falling rod rolls around it toward the centre until it rests on a
// second. Turning about the two rods' common normal keeps them exactly touching as it swings.
export function settleOnto(nest, a, b, first, maxAngle = Math.PI * 0.55) {
  const other = nest.rods[first.rod];
  const c = G.closestSegSeg(a, b, other.a, other.b);
  let normal = G.sub(c.c1, c.c2);
  if (G.length(normal) < 1e-6) return null;
  normal = G.normalize(normal);
  const pivot = c.c1;
  const centre = G.lerp(a, b, 0.5);
  // Turn the way that brings the rod's middle nearer the centre mass.
  const probe = G.add(G.rotate(G.sub(centre, pivot), normal, 0.05), pivot);
  const sign = G.length(probe) < G.length(centre) ? 1 : -1;
  const ignore = new Set([first.rod]);
  const step = (Math.PI / 180) * 1.5;
  let pa = a;
  let pb = b;
  for (let angle = step; angle <= maxAngle; angle += step) {
    const na = G.add(G.rotate(G.sub(a, pivot), normal, sign * angle), pivot);
    const nb = G.add(G.rotate(G.sub(b, pivot), normal, sign * angle), pivot);
    const gap = Math.min(nest.clearance(na, nb, ignore), Math.sqrt(G.closestSegSeg(na, nb, other.a, other.b).d2) - nest.T + 1e-3);
    if (gap <= 0) return { a: pa, b: pb };
    pa = na;
    pb = nb;
  }
  return null;
}

function stick(nest, rest, extra) {
  const rod = nest.addRod(rest.a, rest.b, extra);
  for (const c of nest.contacts(rest.a, rest.b, new Set([rod.id]))) nest.addBond(rod.id, c.rod, c.s, c.t);
  return rod;
}

// Grow a nest: first the centre mass, a tight cluster of rods the field holds as one, then
// `count` more dropped around it. Rods lean outward (`radial` 0..1), so the nest splinters into
// a star; `spread` is how far off-centre each rod's line of fall may pass.
export function growNest(rng, options) {
  const { count, length, thickness, coreRadius, core = 10, radial = 0.45, spread = 0.18, lowest = -1 } = options;
  const nest = options.nest ?? new Nest({ length, thickness, coreRadius });
  const drop = (spreadNow, lean, extra) => {
    let approach;
    do approach = G.randomUnit(rng);
    while (approach[1] < lowest);
    const direction = G.normalize(G.lerp(G.randomUnit(rng), approach, lean));
    const side = G.perpendicular(approach);
    const offset = G.rotate(G.scale(side, spreadNow * Math.sqrt(rng())), approach, rng() * Math.PI * 2);
    let rest = dropRod(nest, approach, direction, offset);
    if (!rest) return null;
    const first = nest.contacts(rest.a, rest.b).find((c) => c.rod !== CORE);
    if (first) rest = settleOnto(nest, rest.a, rest.b, first) ?? rest;
    // A t'an that comes to rest against only one other would hang by a single touch: it slides
    // off and is dropped again. (Rods of the centre mass may rest on the mass alone.)
    if (!extra && nest.contacts(rest.a, rest.b).length < 2) return null;
    return stick(nest, rest, extra);
  };
  // The centre mass: rods dropped almost through the very middle, crossing every which way.
  for (let i = 0, tries = 0; i < core && tries < core * 40; tries++) if (drop(0.05, 0, { anchored: true, kind: 'core' })) i++;
  for (let i = 0, tries = 0; i < count && tries < count * 30; tries++) if (drop(spread, radial)) i++;
  return nest;
}
