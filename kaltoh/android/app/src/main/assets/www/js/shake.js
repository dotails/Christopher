// Shaking the phone for three seconds begins anew. Samples are linear acceleration magnitudes
// (m/s^2, gravity removed) from the Android sensor bridge, or from DeviceMotion in a browser.
const STRONG = 11; // a deliberate shake, well above walking or turning the phone
const GAP = 0.5; // seconds without a strong sample that end a shake
export const SHAKE_SECONDS = 3;

export class ShakeDetector {
  constructor({ onProgress, onComplete }) {
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.time = 0;
    this.start = -1;
    this.last = -Infinity;
    this.cooldown = 0;
    this.progress = 0;
  }

  sample(magnitude) {
    if (this.cooldown > 0 || magnitude < STRONG) return;
    if (this.start < 0) this.start = this.time;
    this.last = this.time;
  }

  update(dt) {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.start >= 0 && this.time - this.last > GAP) this.start = -1;
    const target = this.start >= 0 ? (this.time - this.start) / SHAKE_SECONDS : 0;
    // Progress drains gently when the shaking stops, so a pause is visible.
    this.progress = target > this.progress ? target : Math.max(0, this.progress - dt * 0.8);
    this.onProgress(Math.min(1, this.progress));
    if (this.progress >= 1) {
      this.start = -1;
      this.progress = 0;
      this.cooldown = 2;
      this.onComplete();
    }
  }

  // Browsers: DeviceMotion. (The Android app feeds samples natively instead.)
  listenToDeviceMotion() {
    let gx = 0;
    let gy = 0;
    let gz = 0;
    window.addEventListener('devicemotion', (e) => {
      const a = e.acceleration;
      if (a && a.x !== null) {
        this.sample(Math.hypot(a.x, a.y, a.z));
        return;
      }
      const g = e.accelerationIncludingGravity;
      if (!g || g.x === null) return;
      // Separate gravity with a low-pass filter; what remains is the shake.
      gx = gx * 0.85 + g.x * 0.15;
      gy = gy * 0.85 + g.y * 0.15;
      gz = gz * 0.85 + g.z * 0.15;
      this.sample(Math.hypot(g.x - gx, g.y - gy, g.z - gz));
    });
  }
}
