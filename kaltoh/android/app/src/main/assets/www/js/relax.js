// When a ring forms, the spin draws its t'an to their latitude. Whatever touches them is held
// magnetically, so it slides and turns to stay in touch; contacts may slide along a t'an, but
// nothing passes through anything and every t'an keeps its length (position-based relaxation).
// The pull comes on in small steps, each allowed to settle; where a contact still cannot hold,
// the most stretched one lets go first.
import * as G from './geom.js';
import { CORE } from './nest.js';

const pairKey = (p, q) => (p < q ? p * 65536 + q : q * 65536 + p);

// targets: Map rod id -> { a, b }, the rods being drawn (moved kinematically from where they are).
// fixed: rod ids that never move (the centre mass, rings already formed).
export function relax(nest, { targets, fixed, steps = 16, inner = 6, tear = 0.9 }) {
  const T = nest.T;
  const starts = new Map([...targets.keys()].map((id) => [id, { a: [...nest.rods[id].a], b: [...nest.rods[id].b] }]));
  const weight = (id) => (id === CORE || fixed.has(id) || targets.has(id) || !nest.rods[id].alive ? 0 : 1);
  const torn = [];
  const coreReach = nest.coreRadius + T / 2;

  // Move the point at fraction s of a rod along n, split between its ends.
  const nudge = (rod, s, n, lambda) => {
    rod.a = G.madd(rod.a, n, (1 - s) * lambda);
    rod.b = G.madd(rod.b, n, s * lambda);
  };
  const stretchOf = (bond) => {
    const r1 = nest.rods[bond.r1];
    if (bond.r2 === CORE) return Math.sqrt(G.closestPointSeg([0, 0, 0], r1.a, r1.b).d2) - coreReach;
    const r2 = nest.rods[bond.r2];
    return Math.sqrt(G.closestSegSeg(r1.a, r1.b, r2.a, r2.b).d2) - T;
  };

  let pairs = [];
  const gatherPairs = (margin) => {
    const live = nest.rods.filter((r) => r.alive);
    const mids = live.map((r) => G.lerp(r.a, r.b, 0.5));
    const bonded = new Set();
    for (const b of nest.bonds) if (b.alive && b.r2 !== CORE) bonded.add(pairKey(b.r1, b.r2));
    pairs = [];
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        if (!weight(live[i].id) && !weight(live[j].id)) continue;
        if (bonded.has(pairKey(live[i].id, live[j].id))) continue;
        if (G.dist(mids[i], mids[j]) > nest.L + T + margin) continue;
        pairs.push([live[i], live[j]]);
      }
    }
  };

  const project = () => {
    // Contacts: keep each bonded pair exactly touching, letting the contact slide.
    for (const bond of nest.bonds) {
      if (!bond.alive) continue;
      const w1 = weight(bond.r1);
      const w2 = weight(bond.r2);
      const r1 = nest.rods[bond.r1];
      if (bond.r2 === CORE) {
        const c = G.closestPointSeg([0, 0, 0], r1.a, r1.b);
        const d = Math.sqrt(c.d2);
        bond.s1 = c.t;
        if (!w1 || d < 1e-9) continue;
        nudge(r1, c.t, G.scale(c.c, 1 / d), -(d - coreReach) / ((1 - c.t) ** 2 + c.t ** 2));
        continue;
      }
      const r2 = nest.rods[bond.r2];
      const c = G.closestSegSeg(r1.a, r1.b, r2.a, r2.b);
      const d = Math.sqrt(c.d2);
      bond.s1 = c.s;
      bond.s2 = c.t;
      const W = w1 * ((1 - c.s) ** 2 + c.s ** 2) + w2 * ((1 - c.t) ** 2 + c.t ** 2);
      if (!W) continue;
      let n = d > 1e-9 ? G.scale(G.sub(c.c1, c.c2), 1 / d) : G.normalize(G.cross(G.sub(r1.b, r1.a), G.sub(r2.b, r2.a)));
      if (G.length(n) < 0.5) n = G.perpendicular(G.normalize(G.sub(r1.b, r1.a)));
      const lambda = (d - T) / W;
      if (w1) nudge(r1, c.s, n, -lambda * w1);
      if (w2) nudge(r2, c.t, n, lambda * w2);
    }
    // Nothing passes through anything.
    for (const [p, q] of pairs) {
      const wp = weight(p.id);
      const wq = weight(q.id);
      const c = G.closestSegSeg(p.a, p.b, q.a, q.b);
      const d = Math.sqrt(c.d2);
      if (d >= T) continue;
      let n = d > 1e-9 ? G.scale(G.sub(c.c1, c.c2), 1 / d) : G.normalize(G.cross(G.sub(p.b, p.a), G.sub(q.b, q.a)));
      if (G.length(n) < 0.5) n = G.perpendicular(G.normalize(G.sub(p.b, p.a)));
      const W = wp * ((1 - c.s) ** 2 + c.s ** 2) + wq * ((1 - c.t) ** 2 + c.t ** 2);
      if (!W) continue;
      const lambda = (T - d) / W;
      if (wp) nudge(p, c.s, n, lambda * wp);
      if (wq) nudge(q, c.t, n, -lambda * wq);
    }
    // Clear of the centre mass, and every t'an its own length.
    for (const r of nest.rods) {
      if (!r.alive || !weight(r.id)) continue;
      const c = G.closestPointSeg([0, 0, 0], r.a, r.b);
      const d = Math.sqrt(c.d2);
      if (d < coreReach && d > 1e-9) nudge(r, c.t, G.scale(c.c, 1 / d), (coreReach - d) / ((1 - c.t) ** 2 + c.t ** 2));
      const mid = G.lerp(r.a, r.b, 0.5);
      const half = G.scale(G.normalize(G.sub(r.b, r.a)), nest.L / 2);
      r.a = G.sub(mid, half);
      r.b = G.add(mid, half);
    }
  };

  // How far the drawn rods travel in one step, so neighbours that may be pushed are considered.
  let travel = 0;
  for (const [id, to] of targets) travel = Math.max(travel, G.dist(starts.get(id).a, to.a), G.dist(starts.get(id).b, to.b));

  for (let step = 1; step <= steps; step++) {
    const u = step / steps;
    const e = u * u * (3 - 2 * u);
    for (const [id, to] of targets) {
      const from = starts.get(id);
      nest.rods[id].a = G.lerp(from.a, to.a, e);
      nest.rods[id].b = G.lerp(from.b, to.b, e);
    }
    gatherPairs((travel * 2) / steps + T);
    for (let tries = 0; tries < 4; tries++) {
      for (let i = 0; i < inner; i++) project();
      // A contact that still cannot hold lets go; the most stretched first.
      let worst = null;
      for (const bond of nest.bonds) {
        if (!bond.alive || (!weight(bond.r1) && !weight(bond.r2))) continue;
        const s = stretchOf(bond);
        if (s > tear * T && (!worst || s > worst.s)) worst = { bond, s };
      }
      if (!worst) break;
      worst.bond.alive = false;
      torn.push(worst.bond.id);
    }
  }
  gatherPairs(T);
  for (let i = 0; i < inner * 2; i++) project();

  // Contacts that no longer touch have let go.
  for (const bond of nest.bonds) {
    if (!bond.alive || (!weight(bond.r1) && !weight(bond.r2))) continue;
    if (Math.abs(stretchOf(bond)) > 0.35 * T) {
      bond.alive = false;
      torn.push(bond.id);
    }
  }
  return { torn };
}
