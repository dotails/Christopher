// Checks how the stone comes to rest on the floor (motion.js): level, it rests there; tipped a
// little while held it rocks up onto its edge, never into the floor, and let go it tips over to lie
// flush; tipped past twenty degrees it lifts to turn freely about the pivot; held near level it does not
// come down, and let go it falls straight down to its edge first, then tips flush, knocking each time.
// Resting there, a t'an spun into it is lifted clear rather than pushing it into the floor. The floor
// is the table's top as it is (table.js): the stone's foot rests on its plates, spanning the groove
// down its middle; and a t'an turned down toward the top lifts the stone clear of it. And zen's
// nests, some of them reaching down through the stone, come to rest on it, turned over and back
// and levelled: lifted out of the stone, never shuttled down through it and back up for ever - on
// the obsidian altar as on the stone; and a stone made the altar in play settles flush on the top.
// Run: node kaltoh/tools/ground.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../android/app/src/main/assets/www/vendor/three.module.min.js';
import { Motion } from '../android/app/src/main/assets/www/js/motion.js';
import { PIVOT } from '../android/app/src/main/assets/www/js/scene.js';
import { onTop, topHeight } from '../android/app/src/main/assets/www/js/table.js';
import * as Z from '../android/app/src/main/assets/www/js/zen-rules.js';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
  console.log(`ok - ${msg}`);
};

// A base's shape as the game has it (assets/<file>.json's profile, as scene.js reads it): the
// stone's (base.json), or the obsidian altar's (altar.json).
const shapeOf = (file) => {
  const meta = JSON.parse(readFileSync(new URL(`../android/app/src/main/assets/www/assets/${file}.json`, import.meta.url)));
  const { profile, profileStep: step } = meta;
  return {
    surface: (r) => {
      const f = r / step;
      const i = Math.floor(f);
      return i >= profile.length - 1 ? 0 : profile[i] + (profile[i + 1] - profile[i]) * (f - i);
    },
    slope: (r) => {
      const i = Math.min(profile.length - 2, Math.max(0, Math.floor(r / step)));
      return (profile[i + 1] - profile[i]) / step;
    },
    radius: (profile.length - 1) * step,
    top: Math.max(...profile),
  };
};
const base = shapeOf('base');

const motion = new Motion(base);
const run = (seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) motion.update(1 / 60);
};
// How far the stone, as it is turned and as far down as it has come, stands clear of the top at its
// nearest (none: resting on it; less than none: in it).
const lowest = (m = motion) => {
  let y = Infinity;
  for (const p of m.hull) {
    const w = p.clone().applyQuaternion(m.baseQ).add(m.centre);
    if (onTop(w.x, w.z)) y = Math.min(y, w.y - topHeight(w.x, w.z));
  }
  return y;
};
const FLOOR = 0; // lowest() measures from the top itself
const tip = (degrees) => motion.baseQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (degrees * Math.PI) / 180);

ok(Math.abs(lowest() - FLOOR) < 1e-6 && motion.drop > 0.5, `level at first, the stone rests on the table's top (${motion.drop.toFixed(3)} down)`);
// Where its foot rests: on the plates either side of the groove, the highest of them under it.
let plates = -Infinity;
for (const p of motion.hull) {
  if (p.y > -PIVOT.y + 1e-6) continue;
  if (onTop(p.x, p.z)) plates = Math.max(plates, topHeight(p.x, p.z));
}
ok(plates > topHeight(0, 0) + 0.1, `its foot spans the groove, resting on the plates either side (${(plates - topHeight(0, 0)).toFixed(3)} above the groove's floor)`);
const tilt = () => (Math.acos(Math.min(1, new THREE.Vector3(0, 1, 0).applyQuaternion(motion.baseQ).y)) * 180) / Math.PI;
let deepest = Infinity;
motion.baseDragged = true;
for (const degrees of [2, 4, 6, 8]) {
  tip(degrees);
  motion.wake();
  for (let t = 0; t < 1; t += 1 / 60) {
    motion.update(1 / 60);
    deepest = Math.min(deepest, lowest() - FLOOR);
  }
}
ok(deepest > -1e-6 && Math.abs(lowest() - FLOOR) < 0.01 && tilt() > 7, 'tipped a little while held, it rocks up onto its edge, never into the floor');
motion.baseDragged = false;
run(1);
ok(tilt() < 0.05 && Math.abs(lowest() - FLOOR) < 1e-6, `let go, it turns to lie flush on the floor (${tilt().toFixed(3)} degrees)`);
tip(25);
motion.wake();
run(1.5);
ok(motion.drop < 0.01 && Math.abs(motion.centre.y - PIVOT.y) < 0.01, 'tipped past twenty degrees, it lifts to turn freely about the pivot');
tip(-25);
motion.wake();
run(1);
ok(motion.drop < 0.01, 'toward the eye or away');
// Brought back within twenty degrees of level while held, it stays up; let go, it falls straight
// down to its edge, then tips over on it to lie flush.
motion.baseDragged = true;
tip(17);
run(1);
ok(motion.drop < 0.01, 'held near level, it does not come down');
motion.baseDragged = false;
motion.landed = 0;
const knocks = [];
let tiltAtEdge = null;
for (let t = 0; t < 2; t += 1 / 60) {
  motion.update(1 / 60);
  if (motion.landed) {
    knocks.push(motion.landed);
    if (tiltAtEdge === null) tiltAtEdge = tilt();
    motion.landed = 0;
  }
}
ok(tiltAtEdge !== null && Math.abs(tiltAtEdge - 17) < 0.1, `let go, it falls straight down, unturned, until its edge meets the floor (${tiltAtEdge?.toFixed(2)} degrees)`);
ok(Math.abs(lowest() - FLOOR) < 1e-6 && tilt() < 1e-6 && knocks.length === 2,
  `then tips over on its edge to lie flush, knocking each time (${knocks.map((k) => k.toFixed(1)).join(', ')} a second)`);
// Resting on the floor, a t'an spun into it lifts the t'an clear: the stone does not give way.
motion.setRods([[new THREE.Vector3(-0.12, (base.surface(0) - PIVOT.y) / 1.5 - 0.04, 0), new THREE.Vector3(0.12, (base.surface(0) - PIVOT.y) / 1.5 - 0.04, 0)]]);
motion.startSpin(new THREE.Vector3(0, 1, 0), 2, 1);
let risen = 0;
let gave = 0;
for (let t = 0; t < 0.5; t += 1 / 60) {
  motion.update(1 / 60);
  risen = Math.max(risen, motion.pos.y);
  gave = Math.max(gave, motion.baseOffset.length());
}
ok(risen > 0.02 && gave === 0 && Math.abs(lowest() - FLOOR) < 1e-6, `resting on the floor, the stone lifts a t'an spun into it (${risen.toFixed(3)}) and does not give way`);
motion.setRods([]);
run(2);
// Its frame for other bodies comes down with it.
const foot = motion.baseWorld(new THREE.Vector3(0, 0, 0), new THREE.Vector3());
ok(Math.abs(foot.y - plates) < 1e-6, 'and its foot is on the plates for what lies about it too');
// The t'an on it, turned down past the stone's foot toward the top (over the plates, in front of
// the groove), lift the stone clear of it.
const hang = (plates - 0.05 - motion.centre.y) / 1.5;
const out = 0.62; // in front, over the plates
motion.setRods([[new THREE.Vector3(-0.1, hang, out), new THREE.Vector3(0.1, hang, out)]]);
motion.wake();
run(1);
const rodLow = new THREE.Vector3(0.1, hang, out).multiplyScalar(1.5).applyQuaternion(motion.q).add(motion.pos).add(motion.centre);
ok(rodLow.y - topHeight(rodLow.x, rodLow.z) > 0.02 - 1e-6 && lowest() > 0.04,
  `a t'an hanging below the stone's foot holds it up off the top, never into it (${(rodLow.y - topHeight(rodLow.x, rodLow.z)).toFixed(3)} clear)`);
motion.setRods([]);

// Zen's nests (the first forty), on the stone and on the altar: turned over to be read, turned back,
// levelled.
for (const [name, file] of [['the stone', 'base'], ['the obsidian altar', 'altar']]) {
  const restless = [];
  let slowest = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const nest = Z.createGame({ seed, radius: 0.44 });
    const m = new Motion(shapeOf(file));
    m.setRods(nest.rods.map((r) => [new THREE.Vector3(...r.a), new THREE.Vector3(...r.b)]));
    for (const angle of [Math.PI, -Math.PI]) {
      for (let t = 0; t < 0.6; t += 1 / 60) {
        m.turnBase(new THREE.Vector3(1, 0, 0), angle / 36, 1 / 60);
        m.update(1 / 60);
      }
      m.baseDragged = false;
      for (let t = 0; t < 3; t += 1 / 60) m.update(1 / 60);
    }
    m.baseQ.identity();
    m.baseW.set(0, 0, 0);
    m.resetPlace();
    let t = 0;
    for (; t < 5 && !m.asleep; t += 1 / 60) m.update(1 / 60);
    slowest = Math.max(slowest, t);
    if (!m.asleep) restless.push(seed);
  }
  ok(restless.length === 0, `zen's nests, turned over and back and levelled, come to rest on ${name} (the slowest in ${slowest.toFixed(1)} s)${restless.length ? `: not ${restless}` : ''}`);
}

// The stone made the altar in play (main.js gives the same base the altar's shape): its foot and lip
// found afresh, it settles flush on the top, the nest on it lifted clear of the altar.
{
  const nest = Z.createGame({ seed: 3, radius: 0.44 });
  const m = new Motion(shapeOf('base'));
  m.setRods(nest.rods.map((r) => [new THREE.Vector3(...r.a), new THREE.Vector3(...r.b)]));
  for (let t = 0; t < 5 && !m.asleep; t += 1 / 60) m.update(1 / 60);
  const altar = shapeOf('altar');
  Object.assign(m.base, altar);
  m.reshape();
  let t = 0;
  for (; t < 5 && !m.asleep; t += 1 / 60) m.update(1 / 60);
  const rim = Math.max(...m.hull.map((p) => Math.hypot(p.x, p.z)));
  ok(m.asleep && Math.abs(lowest(m)) < 1e-4 && Math.abs(rim - altar.radius) < 1e-9 && m.collide(1 / 60, true) < 0.003,
    `the stone made the altar in play settles flush on the top in ${t.toFixed(1)} s, the nest on it clear of it (${lowest(m).toExponential(1)} off the top)`);
}

console.log(`ground: ${checks} checks passed`);
