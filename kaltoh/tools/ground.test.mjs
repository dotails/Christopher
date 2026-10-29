// Checks how the stone comes to rest on the floor (motion.js): level, it rests there; tipped a
// little while held it rocks up onto its edge, never into the floor, and let go it turns to lie
// flush; tipped past ten degrees it lifts to turn freely about the pivot; brought near level again it
// falls back, finishing the turn that lays it flush, with a knock.
// Run: node kaltoh/tools/ground.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../android/app/src/main/assets/www/vendor/three.module.min.js';
import { Motion } from '../android/app/src/main/assets/www/js/motion.js';
import { PIVOT, FLOOR } from '../android/app/src/main/assets/www/js/scene.js';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
  console.log(`ok - ${msg}`);
};

// The stone's shape as the game has it (assets/base.json's profile, as scene.js reads it).
const meta = JSON.parse(readFileSync(new URL('../android/app/src/main/assets/www/assets/base.json', import.meta.url)));
const { profile, profileStep: step } = meta;
const base = {
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

const motion = new Motion(base);
const run = (seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) motion.update(1 / 60);
};
// The stone's lowest point in the world, as it is turned and as far down as it has come.
const lowest = () => {
  let y = Infinity;
  for (const p of motion.hull) y = Math.min(y, p.clone().applyQuaternion(motion.baseQ).y + motion.centre.y);
  return y;
};
const tip = (degrees) => motion.baseQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (degrees * Math.PI) / 180);

ok(Math.abs(lowest() - FLOOR) < 1e-6 && motion.drop > 0.5, `level at first, the stone rests on the floor (${motion.drop.toFixed(2)} down)`);
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
ok(motion.drop < 0.01 && Math.abs(motion.centre.y - PIVOT.y) < 0.01, 'tipped past ten degrees, it lifts to turn freely about the pivot');
tip(-25);
motion.wake();
run(1);
ok(motion.drop < 0.01, 'toward the eye or away');
tip(7);
motion.wake();
let knock = 0;
for (let t = 0; t < 1.5; t += 1 / 60) {
  motion.update(1 / 60);
  knock = Math.max(knock, motion.landed);
}
ok(Math.abs(lowest() - FLOOR) < 1e-6 && knock > 1 && tilt() < 0.05,
  `brought within ten degrees of level, it falls back to the floor, turned flush, with a knock (${knock.toFixed(1)} a second)`);
// Its frame for other bodies comes down with it.
const foot = motion.baseWorld(new THREE.Vector3(0, 0, 0), new THREE.Vector3());
ok(Math.abs(foot.y - FLOOR) < 1e-6, 'and its foot is on the floor for what lies about it too');

console.log(`ground: ${checks} checks passed`);
