// Checks the nest zen begins from (rules.js): grown about its centre mass and tested against a
// hidden spin, every t'an keeps its length, touches but never passes through another, hangs from
// the centre mass, and the whole bears its load; and a seed reproduces it.
// Run: node kaltoh/tools/rules.test.mjs
import assert from 'node:assert/strict';
import * as G from '../android/app/src/main/assets/www/js/geom.js';
import { CORE } from '../android/app/src/main/assets/www/js/nest.js';
import { assess } from '../android/app/src/main/assets/www/js/statics.js';
import * as R from '../android/app/src/main/assets/www/js/rules.js';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (${a} vs ${b})`);
const L = R.ROD_LENGTH;
const T = R.ROD_THICKNESS;
const segDist = (p, q) => Math.sqrt(G.closestSegSeg(p.a, p.b, q.a, q.b).d2);

// Physical invariants: t'an keep their length, touch but never pass through one another, every one
// hangs from the centre mass, and the structure bears the forces it was tested against.
function physical(nest, forces, label) {
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
  const a = assess(nest, forces, R.CAPS);
  ok(!a.worst || a.worst.util <= 1 + 1e-6, `${label}: the structure bears its load (${a.worst?.util.toFixed(3)})`);
}

for (const density of ['light', 'medium', 'dense']) {
  for (const seed of [11, 12]) {
    const { nest, forces } = R.startingNest({ seed, density });
    physical(nest, forces, `a ${density} nest (seed ${seed})`);
    const free = nest.liveRods.filter((r) => !r.anchored).length;
    ok(free >= 30, `a ${density} nest has plenty of t'an (${free})`);
    ok(nest.liveRods.some((r) => r.kind === 'core'), 'it has a centre mass');
    ok(Math.abs(G.length(forces.axis) - 1) < 1e-9, 'the hidden axis is a direction');
  }
}
{
  const a = R.startingNest({ seed: 5 }).nest;
  const b = R.startingNest({ seed: 5 }).nest;
  ok(a.liveRods.length === b.liveRods.length && G.dist(a.rods[20].a, b.rods[20].a) < 1e-12, 'a seed reproduces its nest');
  const c = R.startingNest({ seed: 6 }).nest;
  ok(G.dist(a.rods[20].a, c.rods[20].a) > 1e-6, 'and another seed grows another');
}

console.log(`rules: ${checks} checks passed`);
