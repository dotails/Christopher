// The hologram view. In the Android app the front camera follows the player's face (never
// shown), and the gyroscope feels the phone turn; together they give where the eye is relative
// to the screen, which stays a fixed window onto the kal-toh so it seems to stand inside the phone.
//
// Face sightings arrive as the player sees themselves in a mirror: x and y from -1 to 1 across
// the camera's view (y downward) and a face size that grows as they lean in. The camera is slow
// (a frame or more behind), so the two are blended as a complementary filter: the gyroscope's
// quick changes are taken at once and handed over, as they fade, to the camera's slower truth.
//
// Where the player first settles becomes the centre, once; it does not drift afterwards, so
// leaning in or away keeps its effect for as long as you hold it.

// Half the front camera's field of view, in radians: how far the eye has swung when the face
// reaches the edge of the camera's view.
const SPAN = 0.62;
// How long the gyroscope's word stands before the camera's takes over (about the camera's lag).
const HANDOVER = 0.18;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Casiez's one-euro filter: little smoothing when the input moves fast (so it does not lag),
// more when it is nearly still (so it does not shimmer).
class OneEuro {
  constructor(minCutoff, beta, dCutoff = 1.5) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null;
    this.dx = 0;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x, dt) {
    if (this.x === null) {
      this.x = x;
      return x;
    }
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.dx = 0;
  }
}

export class Head {
  constructor() {
    this.status = 'off'; // off | starting | on | denied | unavailable
    this.time = 0;
    this.seenAt = -Infinity;
    this.lastSample = -Infinity;
    this.neutral = null;
    this.calibration = [];
    this.filters = { x: new OneEuro(1.4, 0.9), y: new OneEuro(1.4, 0.9), size: new OneEuro(0.9, 0.5) };
    this.camera = { x: 0, y: 0, distance: 1 }; // where the camera last put the eye
    this.gyro = { x: 0, y: 0 }; // the phone's turning, summed
    this.gyroSlow = { x: 0, y: 0 }; // ... as the camera would see it, a moment late
    // Where the eye is: angles off the screen's axis (radians; x right, y up), and distance
    // relative to where the player first held the phone.
    this.view = { x: 0, y: 0, distance: 1 };
  }

  get active() {
    return this.status === 'on';
  }

  setStatus(status) {
    this.status = status;
    if (status !== 'on') this.recentre();
  }

  // Forget the centre: the next sightings set it afresh.
  recentre() {
    this.neutral = null;
    this.calibration = [];
    for (const f of Object.values(this.filters)) f.reset();
    this.camera = { x: 0, y: 0, distance: 1 };
  }

  // A face sighting from the camera.
  sample(x, y, size) {
    if (!(size > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const dt = Math.min(0.2, Math.max(0.008, this.time - this.lastSample));
    this.lastSample = this.time;
    this.seenAt = this.time;
    if (!this.neutral) {
      // The centre is where the face rests over the first few sightings.
      this.calibration.push({ x, y, size });
      if (this.calibration.length < 5) return;
      const median = (key) => this.calibration.map((s) => s[key]).sort((a, b) => a - b)[2];
      this.neutral = { x: median('x'), y: median('y'), size: median('size') };
    }
    const fx = this.filters.x.filter(x, dt);
    const fy = this.filters.y.filter(y, dt);
    const fs = this.filters.size.filter(size, dt);
    this.camera.x = clamp(fx - this.neutral.x, -0.9, 0.9) * SPAN;
    this.camera.y = -clamp(fy - this.neutral.y, -0.9, 0.9) * SPAN;
    // Apparent size falls as the face draws back: distance is the inverse ratio.
    this.camera.distance = clamp(this.neutral.size / fs, 0.4, 2.4);
  }

  // The phone turned by (rx, ry) radians about its own x (across) and y (along) axes since the
  // last report. Tipping its top toward you puts your eye above the screen's axis; turning its
  // right edge away puts your eye to the left.
  turn(rx, ry) {
    this.gyro.x -= ry;
    this.gyro.y += rx;
  }

  update(dt) {
    this.time += dt;
    const k = 1 - Math.exp(-dt / HANDOVER);
    this.gyroSlow.x += (this.gyro.x - this.gyroSlow.x) * k;
    this.gyroSlow.y += (this.gyro.y - this.gyroSlow.y) * k;
    const tracking = this.active && this.neutral && this.time - this.seenAt < 1.5;
    let target = { x: 0, y: 0, distance: 1 };
    if (tracking) {
      target = {
        x: this.camera.x + (this.gyro.x - this.gyroSlow.x),
        y: this.camera.y + (this.gyro.y - this.gyroSlow.y),
        distance: this.camera.distance,
      };
    }
    // Tracking, follow at once; lost for long, glide back to the plain view.
    const glide = tracking ? 1 : 1 - Math.exp(-dt / 0.5);
    this.view.x += (clamp(target.x, -0.75, 0.75) - this.view.x) * glide;
    this.view.y += (clamp(target.y, -0.75, 0.75) - this.view.y) * glide;
    this.view.distance += (target.distance - this.view.distance) * glide;
  }
}
