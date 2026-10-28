// The tray at the foot of the screen where the next t'an lies, and the hand that carries it.
// The resting t'an lies close to the eye, so it is large enough for two fingers; lifted, it
// travels out to the structure's depth and is seen at the structure's scale.
import * as THREE from '../vendor/three.module.min.js';
import { ROD_LENGTH } from './structure.js';

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class Tray {
  constructor(stage) {
    this.stage = stage;
    this.y = 0; // CSS px of the resting rod
    this.visible = false;
    this.arrive = 0; // 0..1 slide-in of the next t'an
    this.restA = new THREE.Vector3();
    this.restB = new THREE.Vector3();
    this.restUp = new THREE.Vector3();
    this.time = 0;
  }

  layout(insetBottom) {
    this.y = this.stage.size.height - insetBottom - 122;
  }

  // Screen rectangle that counts as touching the tray (widened by `margin` px).
  contains(x, y, margin = 0) {
    const w = this.stage.size.width;
    return this.visible && this.arrive > 0.6 &&
      Math.abs(x - w / 2) < w * 0.4 + margin && y > this.y - 64 - margin && y < this.y + 54 + margin;
  }

  // Slide the next t'an in.
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
    // Depth at which one rod spans just over half the screen's width.
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const depth = ROD_LENGTH / (1.06 * t * camera.aspect);
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const anchor = camera.position.clone().addScaledVector(forward, depth);
    const slide = (1 - ease(this.arrive)) * size.width * 0.9;
    const half = size.width * 0.265;
    this.stage.fromScreen(size.width / 2 - half + slide, this.y, anchor, this.restA);
    this.stage.fromScreen(size.width / 2 + half + slide, this.y, anchor, this.restB);
    // Lying on its edge to the eye, turning slowly so its faces catch the light in turn.
    this.restUp.copy(camera.position).sub(anchor).normalize();
    const roll = 1.2 + Math.sin(this.time * 0.6) * 0.18;
    const axis = new THREE.Vector3().subVectors(this.restB, this.restA).normalize();
    this.restUp.applyAxisAngle(axis, roll);
  }

  draw(pool, hand) {
    if (!this.visible || hand.holding) return;
    pool.push(this.restA, this.restB, this.restUp, 0, 0);
  }
}

// The t'an between the player's fingers, from lift to release.
export class Hand {
  constructor(stage, tray, structure) {
    this.stage = stage;
    this.tray = tray;
    this.structure = structure;
    this.holding = false;
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.goalA = new THREE.Vector3();
    this.goalB = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.glow = 0;
    this.flight = null; // { fromA, fromB, toA, toB, t, duration, done }
  }

  lift() {
    this.holding = true;
    this.a.copy(this.tray.restA);
    this.b.copy(this.tray.restB);
    this.glow = 0;
  }

  // Follow the fingers (CSS px), or bridge the touched tips when both are found.
  follow(f1, f2, tipA, tipB) {
    const centre = this.structure.centreWorld(new THREE.Vector3());
    if (tipA !== null && tipB !== null && tipA !== tipB) {
      this.structure.tipWorld(tipA, this.goalA);
      this.structure.tipWorld(tipB, this.goalB);
      this.glow = 1;
      return;
    }
    const pa = this.stage.fromScreen(f1.x, f1.y, centre);
    const pb = this.stage.fromScreen(f2.x, f2.y, centre);
    if (tipA !== null) pa.copy(this.structure.tipWorld(tipA, this.goalA));
    if (tipB !== null) pb.copy(this.structure.tipWorld(tipB, this.goalB));
    const dir = pb.clone().sub(pa);
    if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
    dir.normalize();
    // Rigid: anchored at a touched tip if there is one, otherwise centred between the fingers.
    if (tipA !== null) {
      this.goalA.copy(pa);
      this.goalB.copy(pa).addScaledVector(dir, ROD_LENGTH);
    } else if (tipB !== null) {
      this.goalB.copy(pb);
      this.goalA.copy(pb).addScaledVector(dir, -ROD_LENGTH);
    } else {
      const mid = pa.add(pb).multiplyScalar(0.5);
      this.goalA.copy(mid).addScaledVector(dir, -ROD_LENGTH / 2);
      this.goalB.copy(mid).addScaledVector(dir, ROD_LENGTH / 2);
    }
    this.glow = tipA !== null || tipB !== null ? 0.45 : 0;
  }

  // Animate to a pose, then call done.
  fly(toA, toB, duration, done) {
    this.flight = { fromA: this.a.clone(), fromB: this.b.clone(), toA: toA.clone(), toB: toB.clone(), t: 0, duration, done };
  }

  returnToTray() {
    this.fly(this.tray.restA, this.tray.restB, 0.28, () => {
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
    if (!this.holding) return;
    this.up.copy(this.stage.camera.position).sub(this.a).normalize();
    pool.push(this.a, this.b, this.up, this.glow * 0.5, 0);
    if (this.glow > 0) halos.push(this.a, this.b, this.glow * 0.4, 0.075, 0);
  }
}
