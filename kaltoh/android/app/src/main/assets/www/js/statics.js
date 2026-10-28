// Will it hold? Every t'an carries the load of the hidden forces - the centrifugal pull of the
// structure's secret spin and any steady drift - and passes it through its bonds toward the
// centre mass. Each bond can bear only so much force, and so much twisting before it lets go.
//
// For each rod: forces and moments balance. Bonds are the unknowns (a force and a moment each).
// Where several load paths exist the solution that strains the bonds least is taken (the
// minimum-norm solution, found by conjugate gradients), so loops share their load, while a
// long chain hanging from one bond must carry everything beyond it.
import * as G from './geom.js';
import { CORE } from './nest.js';

// Load on a rod: its share of the spin's outward pull plus the drift, applied at its middle.
export function rodLoad(rod, forces) {
  const c = G.lerp(rod.a, rod.b, 0.5);
  const out = G.sub(c, G.scale(forces.axis, G.dot(c, forces.axis)));
  return G.add(G.scale(out, forces.spin), forces.drift ?? [0, 0, 0]);
}

// The spin's pull grows along a rod's length, so it also twists the rod toward lying
// perpendicular to the axis: m w^2 L^2 / 12 (u x Pu), with P removing the axial part.
export function rodTwist(rod, forces, length) {
  const u = G.normalize(G.sub(rod.b, rod.a));
  const pu = G.sub(u, G.scale(forces.axis, G.dot(u, forces.axis)));
  return G.scale(G.cross(u, pu), (forces.spin * length * length) / 12);
}

export function analyze(nest, forces, caps, warm = null, scale = null) {
  const supported = nest.supported();
  // Rods of the centre mass are held by the field itself; the rest must hang from them.
  const rods = [...supported].filter((id) => !nest.rods[id].anchored).sort((a, b) => a - b);
  const index = new Map(rods.map((id, i) => [id, i]));
  const fixed = (id) => id === CORE || nest.rods[id].anchored;
  // Bonds between free rods, or from a free rod to the centre mass (written with the free rod first).
  const bonds = [];
  for (const b of nest.bonds) {
    if (!b.alive) continue;
    const f1 = index.has(b.r1);
    const f2 = b.r2 !== CORE && index.has(b.r2);
    if (f1 && (f2 || fixed(b.r2))) bonds.push({ id: b.id, r1: b.r1, r2: f2 ? b.r2 : CORE, s1: b.s1, s2: b.s2, src: b });
    else if (f2 && fixed(b.r1)) bonds.push({ id: b.id, r1: b.r2, r2: CORE, s1: b.s2, s2: b.s1, src: b });
  }
  const n = rods.length;
  const m = bonds.length;
  const result = { util: new Map(), reaction: [0, 0, 0], supported, worst: null, solution: new Map() };
  if (!n) return result;

  const Fc = caps.force;
  const Mc = caps.moment;
  const Lm = nest.L;
  const centre = rods.map((id) => G.lerp(nest.rods[id].a, nest.rods[id].b, 0.5));
  // Each end of a bond: the bond, the rod it holds (as a row offset), the sign, the lever arm.
  const ends = [];
  bonds.forEach((b, k) => {
    ends.push({ k, i: index.get(b.r1), sign: 1, at: nest.point(b.r1, b.s1) });
    if (b.r2 !== CORE) ends.push({ k, i: index.get(b.r2), sign: -1, at: nest.point(b.r2, b.s2) });
  });
  const E = ends.length;
  const eBond = new Int32Array(E);
  const eRow = new Int32Array(E);
  const eSign = new Float64Array(E);
  const eF = new Float64Array(E); // this bond's force capacity
  const eM = new Float64Array(E); // and its moment capacity, over the rod length
  const arm = new Float64Array(E * 3);
  ends.forEach((e, j) => {
    // A bond's capacity, and (when re-weighing) how much it is spared: a smaller scale steers
    // load away from it.
    const strength = (bonds[e.k].src.strength ?? 1) * (scale?.get(bonds[e.k].id) ?? 1);
    eBond[j] = e.k * 6;
    eRow[j] = e.i * 6;
    eSign[j] = e.sign;
    eF[j] = Fc * strength;
    eM[j] = (Mc * strength) / Lm;
    const c = centre[e.i];
    arm[j * 3] = e.at[0] - c[0];
    arm[j * 3 + 1] = e.at[1] - c[1];
    arm[j * 3 + 2] = e.at[2] - c[2];
  });

  // A x: the net force and (scaled) moment each rod receives from its bonds.
  const applyA = (x, out) => {
    out.fill(0);
    for (let j = 0; j < E; j++) {
      const k = eBond[j];
      const o = eRow[j];
      const sg = eSign[j];
      const ax = arm[j * 3];
      const ay = arm[j * 3 + 1];
      const az = arm[j * 3 + 2];
      const F = eF[j];
      const fL = F / Lm;
      const mL = eM[j];
      const fx = x[k];
      const fy = x[k + 1];
      const fz = x[k + 2];
      out[o] += sg * F * fx;
      out[o + 1] += sg * F * fy;
      out[o + 2] += sg * F * fz;
      out[o + 3] += sg * (mL * x[k + 3] + fL * (ay * fz - az * fy));
      out[o + 4] += sg * (mL * x[k + 4] + fL * (az * fx - ax * fz));
      out[o + 5] += sg * (mL * x[k + 5] + fL * (ax * fy - ay * fx));
    }
  };
  // A^T y: what each bond would feel from the rods' residual loads.
  const applyAT = (y, out) => {
    out.fill(0);
    for (let j = 0; j < E; j++) {
      const k = eBond[j];
      const o = eRow[j];
      const sg = eSign[j];
      const ax = arm[j * 3];
      const ay = arm[j * 3 + 1];
      const az = arm[j * 3 + 2];
      const F = eF[j];
      const fL = F / Lm;
      const mL = eM[j];
      const mx = y[o + 3];
      const my = y[o + 4];
      const mz = y[o + 5];
      // (arm x)^T ym = ym x arm
      out[k] += sg * (F * y[o] + fL * (my * az - mz * ay));
      out[k + 1] += sg * (F * y[o + 1] + fL * (mz * ax - mx * az));
      out[k + 2] += sg * (F * y[o + 2] + fL * (mx * ay - my * ax));
      out[k + 3] += sg * mL * mx;
      out[k + 4] += sg * mL * my;
      out[k + 5] += sg * mL * mz;
    }
  };

  // Right-hand side: minus each rod's load and twist.
  const rhs = new Float64Array(n * 6);
  rods.forEach((id, i) => {
    const F = rodLoad(nest.rods[id], forces);
    const M = rodTwist(nest.rods[id], forces, Lm);
    for (let c = 0; c < 3; c++) {
      rhs[i * 6 + c] = -F[c];
      rhs[i * 6 + 3 + c] = -M[c] / Lm;
    }
  });

  // Jacobi preconditioner: the diagonal of A A^T.
  const diag = new Float64Array(n * 6);
  for (let j = 0; j < E; j++) {
    const o = eRow[j];
    const a = [arm[j * 3], arm[j * 3 + 1], arm[j * 3 + 2]];
    const r2 = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
    const F = eF[j];
    for (let c = 0; c < 3; c++) {
      diag[o + c] += F * F;
      diag[o + 3 + c] += eM[j] * eM[j] + (F * F * (r2 - a[c] * a[c])) / (Lm * Lm);
    }
  }
  for (let i = 0; i < diag.length; i++) if (diag[i] < 1e-12) diag[i] = 1;

  // Preconditioned conjugate gradients on (A A^T) y = rhs, from the last answer if there is one.
  const y = new Float64Array(n * 6);
  if (warm) {
    rods.forEach((id, i) => {
      const w = warm.get(id);
      if (w) for (let c = 0; c < 6; c++) y[i * 6 + c] = w[c];
    });
  }
  const tmpX = new Float64Array(m * 6);
  const Ap = new Float64Array(n * 6);
  const r = Float64Array.from(rhs);
  if (warm) {
    applyAT(y, tmpX);
    applyA(tmpX, Ap);
    for (let i = 0; i < r.length; i++) r[i] -= Ap[i];
  }
  const z = r.map((v, i) => v / diag[i]);
  const p = Float64Array.from(z);
  let rz = 0;
  for (let i = 0; i < r.length; i++) rz += r[i] * z[i];
  let norm0 = 0;
  for (let i = 0; i < rhs.length; i++) norm0 += rhs[i] * rhs[i];
  norm0 = Math.sqrt(norm0) || 1;
  let iterations = 0;
  for (let it = 0; it < 600; it++) {
    let rr = 0;
    for (let i = 0; i < r.length; i++) rr += r[i] * r[i];
    if (Math.sqrt(rr) < 1e-7 * norm0) break;
    iterations += 1;
    applyAT(p, tmpX);
    applyA(tmpX, Ap);
    let pAp = 0;
    for (let i = 0; i < p.length; i++) pAp += p[i] * Ap[i];
    if (Math.abs(pAp) < 1e-18) break;
    const alpha = rz / pAp;
    for (let i = 0; i < y.length; i++) {
      y[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
    }
    let rzNew = 0;
    for (let i = 0; i < r.length; i++) {
      z[i] = r[i] / diag[i];
      rzNew += r[i] * z[i];
    }
    const beta = rzNew / rz;
    rz = rzNew;
    for (let i = 0; i < p.length; i++) p[i] = z[i] + beta * p[i];
  }
  result.iterations = iterations;
  rods.forEach((id, i) => result.solution.set(id, y.slice(i * 6, i * 6 + 6)));

  const x = new Float64Array(m * 6);
  applyAT(y, x);
  let worst = null;
  bonds.forEach((b, k) => {
    let s = 0;
    for (let c = 0; c < 6; c++) s += x[k * 6 + c] * x[k * 6 + c];
    const u = Math.sqrt(s) * (scale?.get(b.id) ?? 1);
    result.util.set(b.id, u);
    if (!worst || u > worst.util) worst = { bond: b.src, util: u };
    // What the structure pulls on the centre mass with: nonzero means it is out of balance.
    if (b.r2 === CORE) {
      const F = Fc * (b.src.strength ?? 1) * (scale?.get(b.id) ?? 1);
      for (let c = 0; c < 3; c++) result.reaction[c] -= F * x[k * 6 + c];
    }
  });
  result.worst = worst;
  return result;
}

// Does the structure stand? It does if there is any way to carry every load with no bond past
// its strength - so if the least-strain answer overloads a bond, look further: re-weigh the
// bonds again and again to spare the most loaded ones (iteratively reweighted least squares,
// tending to the distribution whose worst bond is least loaded). Only if even that overloads a
// bond is the structure really failing, and that bond is the one that goes.
export function assess(nest, forces, caps, warm = null, prior = null) {
  let analysis = analyze(nest, forces, caps, warm);
  if (!analysis.worst || analysis.worst.util <= 1) return analysis;
  // Start from the last re-weighing when there is one: one broken bond changes little.
  const scale = new Map();
  if (prior?.scale) for (const id of analysis.util.keys()) if (prior.scale.has(id)) scale.set(id, prior.scale.get(id));
  let best = analysis;
  if (scale.size) {
    analysis = analyze(nest, forces, caps, warm, scale);
    analysis.scale = new Map(scale);
    if (analysis.worst.util < best.worst.util) best = analysis;
    if (best.worst.util <= 1) return best;
  }
  for (let round = 0; round < 7; round++) {
    const p = 4 + round * 1.5;
    for (const [id, u] of analysis.util) {
      const c = (scale.get(id) ?? 1) * Math.max(u, 1e-3) ** (-(p - 2) / 4);
      scale.set(id, Math.min(30, Math.max(0.02, c)));
    }
    // Keep the scales centred so the solve stays well conditioned.
    let mean = 0;
    for (const c of scale.values()) mean += Math.log(c);
    mean = Math.exp(mean / Math.max(1, scale.size));
    for (const [id, c] of scale) scale.set(id, c / mean);
    analysis = analyze(nest, forces, caps, analysis.solution, scale);
    analysis.scale = new Map(scale);
    if (analysis.worst && analysis.worst.util < best.worst.util) best = analysis;
    if (best.worst.util <= 1) break;
  }
  return best;
}

// Let the forces act: while the structure cannot stand, its most overloaded bond gives way.
// The shock of a break leaves what remains a little short of its limit. Rods no longer hanging
// from the centre mass fall.
export function settle(nest, forces, caps, { shock = 0.95, maxBreaks = Infinity } = {}) {
  const broken = [];
  let analysis = assess(nest, forces, caps);
  let limit = 1;
  while (analysis.worst && analysis.worst.util > limit) {
    if (broken.length >= maxBreaks) {
      // Past this the collapse is only followed roughly: whatever the overloaded bonds hold goes.
      for (const [id, u] of analysis.util) if (u > limit) nest.breakBond(nest.bonds[id]);
      analysis = { ...analysis, supported: nest.supported() };
      break;
    }
    nest.breakBond(analysis.worst.bond);
    broken.push(analysis.worst.bond.id);
    limit = shock;
    analysis = assess(nest, forces, caps, analysis.solution, analysis);
  }
  const fallen = [];
  for (const r of nest.rods) {
    if (r.alive && !analysis.supported.has(r.id)) {
      nest.removeRod(r.id);
      fallen.push(r.id);
    }
  }
  return { broken, fallen, analysis };
}
