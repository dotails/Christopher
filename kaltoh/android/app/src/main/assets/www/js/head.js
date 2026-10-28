// The hologram view. In the Android app the front camera follows the player's face (never
// shown); here those sightings become an eye position for the stage, which keeps the screen a
// fixed window onto the structure so it seems to stand inside the phone.
//
// Samples arrive as the player sees themselves in a mirror: x and y from -1 to 1 across the
// camera's view (y downward) and a face size that grows as they lean in.

// Half the front camera's field of view, in radians: how far the eye has swung when the face
// reaches the edge of the camera's view.
const SPAN = 0.62;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export class Head {
  constructor() {
    this.status = 'off'; // off | starting | on | denied | unavailable
    this.face = null;
    this.seenAt = -Infinity;
    this.time = 0;
    this.neutral = null;
    // Where the eye is: angles off the screen's axis (radians; x right, y up) and distance,
    // relative to where the player usually holds the phone.
    this.view = { x: 0, y: 0, distance: 1 };
  }

  get active() {
    return this.status === 'on';
  }

  sample(x, y, size) {
    if (!(size > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.face = { x, y, size };
    this.seenAt = this.time;
  }

  setStatus(status) {
    this.status = status;
    if (status !== 'on') {
      this.face = null;
      this.neutral = null;
    }
  }

  update(dt) {
    this.time += dt;
    let x = 0;
    let y = 0;
    let distance = 1;
    if (this.active && this.face && this.time - this.seenAt < 0.8) {
      const f = this.face;
      // The first sighting is the resting position; it then drifts slowly toward wherever the
      // player settles, so a phone held a little off-centre still feels centred.
      if (!this.neutral) this.neutral = { ...f };
      const n = this.neutral;
      const k = 1 - Math.exp(-dt / 12);
      n.x += (f.x - n.x) * k;
      n.y += (f.y - n.y) * k;
      n.size += (f.size - n.size) * k;
      x = clamp(f.x - n.x, -0.8, 0.8) * SPAN;
      y = -clamp(f.y - n.y, -0.8, 0.8) * SPAN;
      distance = clamp(n.size / f.size, 0.6, 1.6);
    }
    // Lost or switched off: glide back to the plain view.
    const k = 1 - Math.exp(-dt / (this.active ? 0.09 : 0.4));
    this.view.x += (x - this.view.x) * k;
    this.view.y += (y - this.view.y) * k;
    this.view.distance += (distance - this.view.distance) * k;
  }
}
