// The tray at the foot of the screen where the next t'an lies, and the hand that carries it.
// The resting t'an lies close to the eye, so it is large enough for two fingers; lifted, it
// travels out to the kal-toh and is seen at its scale.
import * as THREE from '../vendor/three.module.min.js';
import { ROD_LENGTH as RULE_LENGTH } from './rules.js';
import { SCALE } from './scene.js';

// The rings game's t'an; the original kal-toh's are shorter (the game sets `length`).
export const ROD_LENGTH = RULE_LENGTH * SCALE;

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class Tray {
  constructor(stage) {
    this.stage = stage;
    this.y = 0; // CSS px of the resting t'an
    this.visible = false;
    this.arrive = 0; // 0..1 slide-in of the next t'an
    this.restA = new THREE.Vector3();
    this.restB = new THREE.Vector3();
    this.restUp = new THREE.Vector3();
    this.time = 0;
    this.length = ROD_LENGTH; // of the t'an it holds, in world units
  }

  layout(y) {
    this.y = y;
  }

  // Screen rectangle that counts as touching the tray (widened by `margin` px).
  contains(x, y, margin = 0) {
    const w = this.stage.size.width;
    return this.visible && this.arrive > 0.6 &&
      Math.abs(x - w / 2) < w * 0.4 + margin && y > this.y - 56 - margin && y < this.y + 50 + margin;
  }

  refill() {
    this.visible = true;
    this.arrive = 0;
  }

  hide() {
    this.visible = false;
  }

  update(dt) {
    this.time += dt;
    if (this.visible) this.arrive = Math.min(1, this.arrive + dt / 0.45);
    const { camera, size } = this.stage;
    // Depth at which one t'an spans about half the screen's width.
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const depth = this.length / (1.0 * t * camera.aspect);
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const anchor = camera.position.clone().addScaledVector(forward, depth);
    const slide = (1 - ease(this.arrive)) * size.width * 0.9;
    const half = size.width * 0.25;
    this.stage.fromScreen(size.width / 2 - half + slide, this.y, anchor, this.restA);
    this.stage.fromScreen(size.width / 2 + half + slide, this.y, anchor, this.restB);
    // Lying on its edge to the eye, turning slowly so its faces catch the light in turn.
    this.restUp.copy(camera.position).sub(anchor).normalize();
    // Tipped up toward the ceiling lights, so its face catches them.
    const roll = -0.6 + Math.sin(this.time * 0.6) * 0.18;
    const axis = new THREE.Vector3().subVectors(this.restB, this.restA).normalize();
    this.restUp.applyAxisAngle(axis, roll);
  }

  draw(pool, hand) {
    if (!this.visible || hand.holding || hand.flight) return;
    pool.push(this.restA, this.restB, this.restUp, 0, 0);
  }
}

// The t'an between the player's fingers, from lift to release.
export class Hand {
  constructor(stage, tray) {
    this.stage = stage;
    this.tray = tray;
    this.holding = false;
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.goalA = new THREE.Vector3();
    this.goalB = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.glow = 0;
    this.amber = 0; // it cannot rest where it is held
    this.flight = null;
  }

  lift() {
    this.holding = true;
    this.a.copy(this.tray.restA);
    this.b.copy(this.tray.restB);
    this.glow = 0;
    this.amber = 0;
  }

  // Follow the fingers: rest exactly where it would be placed when the placement is good,
  // otherwise hang between the touched points (or the fingers) at the kal-toh's depth.
  follow(f1, f2, { pose, touchA, touchB, anchor, refused = false }) {
    this.amber = refused ? 0.7 : 0;
    if (pose) {
      this.goalA.copy(pose.a);
      this.goalB.copy(pose.b);
      this.glow = 1;
      return;
    }
    const pa = touchA ? touchA.clone() : this.stage.fromScreen(f1.x, f1.y, anchor);
    const pb = touchB ? touchB.clone() : this.stage.fromScreen(f2.x, f2.y, anchor);
    const dir = pb.clone().sub(pa);
    if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
    dir.normalize();
    const middle = pa.add(pb).multiplyScalar(0.5);
    this.goalA.copy(middle).addScaledVector(dir, -this.tray.length / 2);
    this.goalB.copy(middle).addScaledVector(dir, this.tray.length / 2);
    this.glow = !refused && (touchA || touchB) ? 0.35 : 0;
  }

  fly(fromA, fromB, toA, toB, duration, done) {
    this.flight = { fromA: fromA.clone(), fromB: fromB.clone(), toA: toA.clone(), toB: toB.clone(), t: 0, duration, done };
  }

  returnToTray() {
    this.glow = 0;
    this.amber = 0;
    this.fly(this.a, this.b, this.tray.restA, this.tray.restB, 0.28, () => {
      this.holding = false;
    });
  }

  update(dt) {
    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      const k = ease(f.t / f.duration);
      this.a.lerpVectors(f.fromA, f.toA, k);
      this.b.lerpVectors(f.fromB, f.toB, k);
      if (f.t >= f.duration) {
        this.flight = null;
        f.done?.();
      }
      return;
    }
    if (!this.holding) return;
    const k = 1 - Math.exp(-dt / 0.045);
    this.a.lerp(this.goalA, k);
    this.b.lerp(this.goalB, k);
  }

  draw(pool, halos) {
    if (!this.holding && !this.flight) return;
    this.up.copy(this.stage.camera.position).sub(this.a).normalize();
    pool.push(this.a, this.b, this.up, this.glow * 0.7, this.amber * 0.6);
    if (this.glow > 0) halos.push(this.a, this.b, this.glow * 0.42, 0.07, 0);
    else if (this.amber > 0) halos.push(this.a, this.b, this.amber * 0.3, 0.06, 1);
  }
}
