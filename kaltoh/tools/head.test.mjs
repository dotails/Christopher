// Checks the hologram's head following (head.js) with a simulated face: held still under a
// camera's shimmer, the view must hardly move; swayed and leaned, it must follow closely. Sightings
// come 30 times a second, 70 ms old, as from the Android shell; the view is drawn 60 times a second.
// Run: node kaltoh/tools/head.test.mjs
import assert from 'node:assert/strict';

let clock = 0;
globalThis.performance = { now: () => clock };
const { Head } = await import('../android/app/src/main/assets/www/js/head.js');
const { DEFAULT_TUNING } = await import('../android/app/src/main/assets/www/js/settings.js');

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
  console.log(`ok - ${msg}`);
};

const device = { screen: { width: 70, height: 150 }, camera: { fovLong: 75, fovShort: 60, x: 0, y: 75 } };
const f = 320 / Math.tan((37.5 * Math.PI) / 180); // the camera's focal length in pixels (640 tall)

// A face at (sway mm across, distance mm away), its eyes shimmering by `noise` pixels and its turn
// by `yaw` degrees about 10: what the view does, frame by frame.
function watch({ noise, yaw, steady = DEFAULT_TUNING.steady, path }) {
  clock = 0;
  const head = new Head(device, { ...DEFAULT_TUNING, steady });
  head.status = 'on';
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const frames = [];
  let next = 0;
  for (let ms = 0; ms < 20000; ms += 1000 / 60) {
    clock = ms;
    const { x, z } = path(ms);
    if (ms >= next) {
      next += 33;
      const apart = (f * 63) / z;
      const centre = 240 - (x / z) * f;
      const n = () => rnd() * noise;
      head.face(centre + apart / 2 + n(), 300 + n(), centre - apart / 2 + n(), 300 + n(), centre, 320, apart * 2.7, 480, 640, 10 + rnd() * yaw, 70);
    }
    head.update(1 / 60, ms);
    frames.push({ ms, x: head.view.x, z: head.view.z, truth: { x, z }, rest: head.rest });
  }
  return frames;
}

// How far the view moves from one frame to the next, on average, between two times.
const shake = (frames, from, to, key) => {
  const part = frames.filter((v) => v.ms > from && v.ms < to);
  let sum = 0;
  for (let i = 1; i < part.length; i++) sum += Math.abs(part[i][key] - part[i - 1][key]);
  return sum / (part.length - 1);
};
// How far the view trails the head, on average, between two times (relative to where it rests).
const trail = (frames, from, to, key) => {
  const part = frames.filter((v) => v.ms > from && v.ms < to);
  return part.reduce((s, v) => s + Math.abs(v[key] - v.rest[key] - (v.truth[key] - 400 * (key === 'z'))), 0) / part.length;
};

const still = () => ({ x: 0, z: 400 });
for (const [noise, yaw, xs, zs] of [[2, 2, 0.01, 0.15], [5, 6, 0.05, 0.8]]) {
  const frames = watch({ noise, yaw, path: still });
  const sx = shake(frames, 6000, 20000, 'x');
  const sz = shake(frames, 6000, 20000, 'z');
  ok(sx < xs, `a still head, its eyes shimmering ${noise} px: the view barely moves across (${sx.toFixed(3)} mm a frame)`);
  ok(sz < zs, `nor nearer or further (${sz.toFixed(3)} mm a frame)`);
}
// The calmer the setting, no more shaking than at the default.
{
  const calm = watch({ noise: 5, yaw: 6, steady: 0.1, path: still });
  const usual = watch({ noise: 5, yaw: 6, path: still });
  ok(shake(calm, 6000, 20000, 'z') <= shake(usual, 6000, 20000, 'z') + 0.02, 'calmer settings are no less calm');
}

// Swaying 4 cm from side to side, and leaning 8 cm in and back: the view follows closely.
const sway = (ms) => ({ x: ms > 12000 ? Math.sin(((ms - 12000) / 1000) * 1.2) * 40 : 0, z: 400 });
const lean = (ms) => ({ x: 0, z: ms > 12000 && ms < 16000 ? 400 - 80 * Math.sin(((ms - 12000) / 4000) * Math.PI) : 400 });
{
  const frames = watch({ noise: 2, yaw: 2, path: sway });
  const t = trail(frames, 13000, 20000, 'x');
  ok(t < 10, `swaying 4 cm, the view follows across within ${t.toFixed(1)} mm`);
}
{
  const frames = watch({ noise: 2, yaw: 2, path: lean });
  const t = trail(frames, 12000, 16000, 'z');
  ok(t < 14, `leaning 8 cm in and back, the view follows within ${t.toFixed(1)} mm`);
}

console.log(`head: ${checks} checks passed`);
