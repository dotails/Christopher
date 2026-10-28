// The hologram: where the player's eye is, in millimetres from the middle of the screen (x to the
// right, y up, z out toward the player). The screen is a pane of glass with the kal-toh standing
// behind it (scene.js); drawn from where the eye really is, the kal-toh keeps its place as the
// head, or the phone, moves - and leaning in widens the view through the glass, as through a
// window, while drawing back narrows it.
//
// Only the front camera is needed: the head's place relative to the screen is all that matters.
// On the phone, the Android shell follows the head (HeadTracker.java, with ML Kit): it finds the
// face and its eyes, whose spacing - about 63 mm in most people - gives the head's distance, with
// the camera's focal length; the point between them is where the view is seen from, placed by the
// direction it is seen in and where the camera sits beside the screen. In a browser, or if the
// player chooses, the page finds each iris itself instead (tracker.js, eyes-worker.js): an iris is
// 11.7 mm across in nearly everyone. A one-euro filter steadies each axis without lagging fast
// moves, and the eye is carried ahead along its motion by the camera's delay, so the view does not
// trail the head.
//
// Where the player first settles is the centre for the tuning's gains, the distance the kal-toh
// is framed for, and (unless the tuning says the middle of the screen) straight ahead. It does
// not drift afterwards; recentring sets it afresh.
import { FOV } from './scene.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const RAD = Math.PI / 180;
const LOST = 600; // ms without a sighting before the view eases back to rest
const NATIVE_LAG = 70; // ms: the rough Android trackers' sightings are about this old when they arrive
const FACE_WIDTH = 150; // mm: the box round a face, when its eyes are not found
// What finds the face, as the tuning pages say it.
const ENGINES = {
  mlkit: "the phone's face finder (ML Kit)",
  camera: "the camera's own face detection",
  android: "Android's face detector",
};

// Casiez's one-euro filter: little smoothing when the input moves fast (so it does not lag),
// more when it is nearly still (so it does not shimmer). Times in seconds.
class OneEuro {
  constructor() {
    this.x = null;
    this.dx = 0;
    this.t = 0;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x, t, minCutoff, beta, dCutoff = 1.2) {
    if (this.x === null) {
      this.x = x;
      this.t = t;
      return x;
    }
    const dt = clamp(t - this.t, 1 / 240, 0.25);
    this.t = t;
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.alpha(dCutoff, dt) * (dx - this.dx);
    const cutoff = minCutoff + beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
}

export class Head {
  // device: { screen: { width, height } mm, camera: { fovLong, fovShort } degrees, { x, y } mm }.
  // tuning: the live settings.holo.
  constructor(device, tuning) {
    this.device = device;
    this.tuning = tuning;
    this.status = 'off'; // off | starting | on | denied | unavailable
    this.source = null; // 'native' (the Android shell follows the head) or 'camera' (the page, the eyes)
    this.engine = null; // what finds the face (ENGINES), or what the page's eye finder runs on
    this.recentre();
    // Where the eye is now, as the view uses it.
    this.view = { x: 0, y: 0, z: null };
    this.frames = []; // sighting times, for the rate
    this.latency = 0;
  }

  get active() {
    return this.status === 'on';
  }

  setStatus(status, source = this.source) {
    this.status = status;
    this.source = source;
    if (status !== 'on') this.recentre();
  }

  // Forget the centre: the next sightings set it afresh.
  recentre() {
    this.calibration = [];
    this.rest = null; // { x, y, z } mm
    this.filters = { x: new OneEuro(), y: new OneEuro(), z: new OneEuro() };
    this.last = null; // { t: ms, x, y, z, vx, vy, vz } filtered, at the time of the frame
    this.seenAt = -Infinity;
    this.nativeSize = null;
  }

  // The distance the layout is drawn for: the screen subtends the scene's field of view from it.
  get designDistance() {
    return this.device.screen.height / (2 * Math.tan((FOV / 2) * RAD));
  }

  // The eye's distance at rest, for which the kal-toh is framed as laid out.
  get restDistance() {
    return this.rest?.z ?? this.designDistance;
  }

  fovLong() {
    return this.tuning.fov === 'auto' ? this.device.camera.fovLong : this.tuning.fov;
  }

  cameraAt() {
    const { camera } = this.device;
    return { x: camera.x, y: this.tuning.camera === 'auto' ? camera.y : this.tuning.camera };
  }

  // Irises seen by the camera in a frame of width x height pixels (not mirrored: the player's
  // left eye is the one further right). Each iris: { x, y, d } - centre and diameter in pixels.
  eyes({ eyes, width, height, capture }) {
    if (!eyes) return;
    const [a, b] = eyes;
    const left = a.x > b.x ? a : b;
    const right = left === a ? b : a;
    const eye = this.tuning.eye === 'left' ? left : this.tuning.eye === 'right' ? right
      : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const f = Math.max(width, height) / 2 / Math.tan((this.fovLong() / 2) * RAD);
    const z = (f * this.tuning.iris) / ((a.d + b.d) / 2);
    const cam = this.cameraAt();
    // Seen from the camera, rightward in its frame is the player's left.
    const x = cam.x - ((eye.x - width / 2) / f) * z;
    const y = cam.y - ((eye.y - height / 2) / f) * z;
    this.observe(x, y, z, capture);
  }

  // A face found by the Android shell (ML Kit), in an upright picture of width x height pixels, not
  // mirrored: the player's own left and right eyes (NaN where not found), the box round the face
  // (its middle and width), how far the head is turned aside (degrees), and the picture's age (ms).
  face(leftX, leftY, rightX, rightY, boxX, boxY, boxWidth, width, height, yaw, age) {
    const f = Math.max(width, height) / 2 / Math.tan((this.fovLong() / 2) * RAD);
    // Turned aside, the eyes (and the face) look narrower than they are.
    const turned = Math.cos(clamp(Math.abs(yaw) || 0, 0, 60) * RAD);
    let at;
    let z;
    if (Number.isFinite(leftX) && Number.isFinite(rightX)) {
      z = (f * this.tuning.ipd * turned) / Math.max(1, Math.hypot(rightX - leftX, rightY - leftY));
      at = this.tuning.eye === 'left' ? { x: leftX, y: leftY } : this.tuning.eye === 'right' ? { x: rightX, y: rightY }
        : { x: (leftX + rightX) / 2, y: (leftY + rightY) / 2 };
    } else {
      z = (f * FACE_WIDTH * turned) / Math.max(1, boxWidth);
      at = { x: boxX, y: boxY };
    }
    const cam = this.cameraAt();
    // Seen from the camera, rightward in its picture is the player's left.
    const x = cam.x - ((at.x - width / 2) / f) * z;
    const y = cam.y - ((at.y - height / 2) / f) * z;
    this.observe(x, y, z, performance.now() - age);
  }

  // A rougher sighting from the Android shell: the face's centre from -1 to 1 across its view, as
  // the player sees themselves in a mirror (y downward), and its size.
  sample(x, y, size) {
    if (!(size > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.nativeSize ??= size;
    const z = (this.designDistance * this.nativeSize) / size;
    const cam = this.cameraAt();
    const fovAcross = this.device.camera.fovShort;
    const fovDown = this.fovLong();
    this.observe(cam.x + z * Math.tan(x * (fovAcross / 2) * RAD), cam.y - z * Math.tan(y * (fovDown / 2) * RAD), z, performance.now() - NATIVE_LAG);
  }

  observe(x, y, z, capture) {
    const now = performance.now();
    if (!(z > 40 && z < 3000)) return;
    this.seenAt = now;
    this.latency += (now - capture - this.latency) * 0.2;
    this.frames.push(now);
    while (this.frames.length && this.frames[0] < now - 2000) this.frames.shift();
    if (!this.rest) {
      // The centre is where the eye rests over the first few sightings.
      this.calibration.push({ x, y, z });
      if (this.calibration.length < 5) return;
      const median = (key) => this.calibration.map((s) => s[key]).sort((p, q) => p - q)[2];
      this.rest = { x: median('x'), y: median('y'), z: median('z') };
    }
    const { steady, quick } = this.tuning;
    const t = capture / 1000;
    const f = this.filters;
    this.last = {
      t: capture,
      x: f.x.filter(x, t, steady, quick),
      y: f.y.filter(y, t, steady, quick),
      // Distance is the noisiest: steadied twice as much.
      z: f.z.filter(z, t, steady / 2, quick),
      vx: f.x.dx,
      vy: f.y.dx,
      vz: f.z.dx,
    };
  }

  update(dt, now = performance.now()) {
    const tracking = this.active && this.last && now - this.seenAt < LOST;
    if (!tracking) {
      // Lost or off: ease back to the eye at rest, straight in front of the screen.
      const k = 1 - Math.exp(-dt / 0.4);
      const z = this.view.z ?? this.restDistance;
      this.view.x += (0 - this.view.x) * k;
      this.view.y += (0 - this.view.y) * k;
      this.view.z = z + (this.restDistance - z) * k;
      return;
    }
    const { shift, lean, ahead } = this.tuning;
    // Carried forward by the time the sighting has taken to reach the screen.
    const lead = clamp(ahead === 'auto' ? now - this.last.t + 8 : ahead, 0, 160) / 1000;
    const p = this.last;
    const r = this.rest;
    const x = p.x + p.vx * lead;
    const y = p.y + p.vy * lead;
    const z = p.z + p.vz * lead;
    // Seen from where the eye truly is, or with where it first rested taken as straight ahead.
    const ox = this.tuning.origin === 'screen' ? r.x : 0;
    const oy = this.tuning.origin === 'screen' ? r.y : 0;
    this.view.x = ox + (x - r.x) * shift;
    this.view.y = oy + (y - r.y) * shift;
    this.view.z = clamp(r.z + (z - r.z) * lean, 60, 2000);
  }

  // Whether the eyes have been seen lately (while on).
  get seeing() {
    return this.active && this.last !== null && performance.now() - this.seenAt < 1500;
  }

  // What the tuning page shows of the tracking now, in plain words: what it is doing, then what it
  // knows of the phone. `tracker` is the page's camera watcher, for what it is busy with.
  readout(tracker) {
    const cam = this.cameraAt();
    const screen = this.device.screen;
    const engine = this.source === 'native' ? ENGINES[this.engine] ?? "the phone's face finder" : this.engine ? `eye finder on the ${this.engine.toUpperCase()}` : '';
    const device = `Screen ${screen.width.toFixed(0)} \u00d7 ${screen.height.toFixed(0)} mm \u00b7 camera sees ${this.fovLong().toFixed(0)}\u00b0, ${cam.y.toFixed(0)} mm above the middle${engine ? ` \u00b7 ${engine}` : ''}`;
    const line = (s) => [{ v: s, s }, { v: device, s: device }];
    const doing = tracker?.state && tracker.state !== 'off' ? tracker.state : '';
    if (this.status === 'off') return line(`Hologram off${doing ? `: ${doing}` : ''}`);
    if (this.status === 'starting') return line(`Hologram starting${doing ? `: ${doing}` : ''}`);
    if (this.status !== 'on') return line(`Hologram off: ${doing || (this.status === 'denied' ? 'the camera was refused' : 'no camera to watch')}`);
    const rate = (this.frames.length / 2).toFixed(0);
    const whose = this.source === 'native' ? 'head' : 'eyes';
    if (!this.seeing) {
      const pictures = this.source !== 'native' && tracker?.counts ? `, ${tracker.counts.answered} pictures read` : '';
      return line(`Hologram on: looking for your ${this.source === 'native' ? 'face' : 'eyes'}${pictures}`);
    }
    const p = this.last;
    const side = (v, plus, minus) => `${Math.abs(v / 10).toFixed(0)} cm ${v < 0 ? minus : plus}`;
    return line(`Following your ${whose}: ${(p.z / 10).toFixed(0)} cm away, ${side(p.x, 'right', 'left')}, ${side(p.y, 'up', 'down')} \u00b7 ${rate} a second \u00b7 ${this.latency.toFixed(0)} ms behind`);
  }
}
