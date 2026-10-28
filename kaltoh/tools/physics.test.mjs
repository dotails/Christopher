// Checks the physical model: geometry, how a nest grows, and how loads travel through bonds.
// Run: node kaltoh/tools/physics.test.mjs [--report]
import assert from 'node:assert/strict';
import * as G from '../android/app/src/main/assets/www/js/geom.js';
import { Nest, CORE, growNest } from '../android/app/src/main/assets/www/js/nest.js';
import { analyze, assess, settle } from '../android/app/src/main/assets/www/js/statics.js';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (${a} vs ${b})`);

const L = 0.42;
const T = 0.02;
const CAPS = { force: 1, moment: 0.12 };

// --- Geometry ---------------------------------------------------------------------------------
{
  const c = G.closestSegSeg([-1, 0, 0], [1, 0, 0], [0, -1, 0.5], [0, 1, 0.5]);
  near(Math.sqrt(c.d2), 0.5, 1e-9, 'crossing segments are apart by their offset');
  near(c.s, 0.5, 1e-9, 'closest point at the middle of the first');
  const p = G.closestSegSeg([0, 0, 0], [1, 0, 0], [2, 1, 0], [3, 1, 0]);
  near(Math.sqrt(p.d2), Math.SQRT2, 1e-9, 'disjoint segments meet end to end');
  const q = G.qAxisAngle([0, 1, 0], Math.PI / 2);
  const v = G.qRotate(q, [1, 0, 0]);
  near(v[2], -1, 1e-9, 'quarter turn about y takes x to -z');
  const back = G.qRotate(G.qConj(q), v);
  near(back[0], 1, 1e-9, 'conjugate undoes the turn');
}

// --- Loads through bonds -----------------------------------------------------------------------
const spinAbout = (axis, spin) => ({ axis: G.normalize(axis), spin, drift: [0, 0, 0] });
{
  // One rod held at its tip by the centre mass, lying radially out from a vertical axis:
  // the spin pulls straight along it, so the bond feels tension and no twist.
  const n = new Nest({ length: L, thickness: T, coreRadius: 0.05 });
  const r = n.addRod([0.06, 0, 0], [0.06 + L, 0, 0]);
  n.addBond(r.id, CORE, 0, 0);
  const a = analyze(n, spinAbout([0, 1, 0], 1), CAPS);
  const centre = 0.06 + L / 2;
  near(a.util.get(0), centre, 1e-6, 'radial rod: tension equals its pull');
  near(a.reaction[0], centre, 1e-6, 'the centre mass holds it');
}
{
  // The same rod standing tangentially: now the bond must also resist bending.
  const n = new Nest({ length: L, thickness: T, coreRadius: 0.05 });
  const r = n.addRod([0.3, 0, -L / 2], [0.3, 0, L / 2]);
  n.addBond(r.id, CORE, 0, 0);
  const a = analyze(n, spinAbout([0, 1, 0], 1), CAPS);
  const force = 0.3;
  const moment = 0.3 * (L / 2);
  near(a.util.get(0), Math.hypot(force / CAPS.force, moment / CAPS.moment), 1e-6, 'tangential rod bends its bond');
}
{
  // Two equal rods opposite each other: their pulls cancel at the centre mass.
  const n = new Nest({ length: L, thickness: T, coreRadius: 0.05 });
  const r1 = n.addRod([0.06, 0, 0], [0.06 + L, 0, 0]);
  const r2 = n.addRod([-0.06, 0, 0], [-0.06 - L, 0, 0]);
  n.addBond(r1.id, CORE, 0, 0);
  n.addBond(r2.id, CORE, 0, 0);
  const a = analyze(n, spinAbout([0, 1, 0], 1), CAPS);
  near(G.length(a.reaction), 0, 1e-6, 'balanced pair leaves no net pull');
}
{
  // A chain hanging from one bond carries more than a single rod; a loop shares it.
  const chain = new Nest({ length: L, thickness: T, coreRadius: 0.05 });
  const c1 = chain.addRod([0.3, 0, 0], [0.3, 0, L]);
  const c2 = chain.addRod([0.3, 0, L], [0.3 + L, 0, L]);
  chain.addBond(c1.id, CORE, 0, 0);
  chain.addBond(c1.id, c2.id, 1, 0);
  const one = analyze(chain, spinAbout([0, 1, 0], 1), CAPS);
  const root = one.util.get(0);
  const loop = new Nest({ length: L, thickness: T, coreRadius: 0.05 });
  const l1 = loop.addRod([0.3, 0, 0], [0.3, 0, L]);
  const l2 = loop.addRod([0.3, 0, L], [0.3 + L, 0, L]);
  const l3 = loop.addRod([0.3 + L, 0, L], [0.3 + L, 0, 0]);
  const l4 = loop.addRod([0.3 + L, 0, 0], [0.3, 0, 0]);
  loop.addBond(l1.id, CORE, 0, 0);
  loop.addBond(l1.id, l2.id, 1, 0);
  loop.addBond(l2.id, l3.id, 1, 0);
  loop.addBond(l3.id, l4.id, 1, 0);
  loop.addBond(l4.id, l1.id, 1, 0);
  const two = analyze(loop, spinAbout([0, 1, 0], 1), CAPS);
  ok(two.util.get(1) < one.util.get(1), 'a closed loop eases the bond a chain leans on');
  ok(root > 0.3, 'a chain loads its root');
  const s = settle(chain, spinAbout([0, 1, 0], 6), CAPS);
  ok(s.broken.length > 0 && s.fallen.length > 0, 'a hard spin tears an unsupported chain away');
}

// --- Growing a nest ------------------------------------------------------------------------------
function inspect(nest) {
  const live = nest.liveRods;
  let worst = Infinity;
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const d = Math.sqrt(G.closestSegSeg(live[i].a, live[i].b, live[j].a, live[j].b).d2);
      worst = Math.min(worst, d);
    }
  }
  const bonded = new Set();
  for (const b of nest.liveBonds) {
    bonded.add(b.r1);
    if (b.r2 !== CORE) bonded.add(b.r2);
  }
  const reach = Math.max(...live.flatMap((r) => [G.length(r.a), G.length(r.b)]));
  return { rods: live.length, bonds: nest.liveBonds.length, closest: worst, lonely: live.filter((r) => !bonded.has(r.id)).length, reach };
}

for (let seed = 1; seed <= 6; seed++) {
  const rng = G.mulberry32(seed);
  const t0 = performance.now();
  const nest = growNest(rng, { count: 70, length: L, thickness: T, coreRadius: 0.05 });
  const grown = performance.now() - t0;
  const info = inspect(nest);
  ok(info.rods === 80, "grows the centre mass and the rods asked for");
  ok(info.closest >= T * 0.97, `rods touch but never pass through each other (closest ${info.closest.toFixed(4)})`);
  ok(info.lonely === 0, 'every rod is stuck to something');
  ok(nest.supported().size === 80, "every rod hangs from the centre mass");
  const forces = { axis: G.normalize([0.3, 1, 0.2]), spin: 1, drift: [0, 0, 0] };
  const t1 = performance.now();
  const s = settle(nest, forces, CAPS);
  const settled = performance.now() - t1;
  const after = inspect(nest);
  ok(nest.supported().size === after.rods, 'after the test, everything left is held');
  const a = assess(nest, forces, CAPS);
  ok(!a.worst || a.worst.util <= 1 + 1e-9, 'and every bond bears its load');
  // Under a harder spin: re-weighing never finds a worse way to carry the load than least strain.
  const hard = { ...forces, spin: 2.2 };
  const plain = analyze(nest, hard, CAPS);
  const best = assess(nest, hard, CAPS);
  ok(best.worst.util <= plain.worst.util + 1e-9, `re-weighing spares the worst bond (${plain.worst.util.toFixed(2)} -> ${best.worst.util.toFixed(2)})`);
  if (process.argv.includes('--report')) {
    console.log(`seed ${seed}: grew ${info.rods} rods/${info.bonds} bonds in ${grown.toFixed(0)}ms, reach ${info.reach.toFixed(2)}; ` +
      `spin test broke ${s.broken.length}, fell ${s.fallen.length} in ${settled.toFixed(0)}ms -> ${after.rods} rods, worst ${a.worst?.util.toFixed(2)}; ` +
      `at spin 2.2 least strain ${plain.worst.util.toFixed(2)}, re-weighed ${best.worst.util.toFixed(2)}`);
  }
}

console.log(`physics: ${checks} checks passed`);
