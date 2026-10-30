// The tray at the foot of the screen where the next t'an lies, and the hand that carries it.
// The resting t'an lies on the glass itself (scene.js), so it keeps its place and size on the
// screen however the view draws near, and it is drawn over everything else; it is large enough
// there for two fingers. Taken up by one finger it dangles from it, swinging on the glass, so it
// is plain a second finger is wanted, drawing in to the size it will be at the kal-toh as the
// finger rises; held by two, it travels out to the kal-toh and is seen at its scale.
import * as THREE from '../vendor/three.module.min.js';
import { ROD_LENGTH as RULE_LENGTH } from './rules.js';
import { SCALE, TUVOK } from './scene.js';

// A t'an of the nest zen begins from; each game sets the length its own t'an take (`length`).
export const ROD_LENGTH = RULE_LENGTH * SCALE;

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const RAISE = 160; // px a finger carries the t'an up from the tray for it to draw in to its own size
const DROOP = 3600; // how hard a t'an hanging from one finger is pulled down the screen (px/s^2)
const SWAY = 1.4; // how fast its swinging dies away (per second)
const SLIP = 0.22; // how long it takes to slip through the finger to hang by its end (s)
const right = new THREE.Vector3();
const side = new THREE.Vector3();

export class Tray {
  constructor(stage) {
    this.stage = stage;
    this.y = 0; // CSS px of the resting t'an
    this.visible = false;
    this.arrive = 0; // 0..1 slide-in of the next t'an
    this.slide = 0; // how far it has still to slide in, in px
    this.restA = new THREE.Vector3();
    this.restB = new THREE.Vector3();
    this.restUp = new THREE.Vector3();
    this.time = 0;
    this.length = ROD_LENGTH; // of the t'an it holds, in world units
    this.widthScale = 1; // the resting t'an's breadth, in proportion to its length on the glass
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

  // A new t'an slides in (one already waiting stays where it is).
  refill() {
    if (this.visible) return;
    this.visible = true;
    this.arrive = 0;
  }

  hide() {
    this.visible = false;
  }

  update(dt) {
    this.time += dt;
    if (this.visible) this.arrive = Math.min(1, this.arrive + dt / 0.45);
    const { camera, size, glass } = this.stage;
    this.slide = (1 - ease(this.arrive)) * size.width * 0.9;
    this.ends(this.slide, 0, this.restA, this.restB);
    this.widthScale = glass.width / this.length;
    // Its broad face to the eye, tipped so that it mirrors Tuvok's face behind the player, rocking
    // slowly so the reflection runs over him from brow to chin and back.
    this.restUp.addVectors(this.restA, this.restB).multiplyScalar(-0.5).add(camera.position).normalize().add(TUVOK);
    const roll = Math.sin(this.time * 0.6) * 0.05;
    const axis = new THREE.Vector3().subVectors(this.restB, this.restA).normalize();
    this.restUp.applyAxisAngle(axis, roll);
  }

  // The resting t'an's ends on the glass (half the screen's width long), moved (dx, dy) px across it.
  ends(dx, dy, outA, outB) {
    const { size } = this.stage;
    const half = size.width * 0.25;
    this.stage.onGlass(size.width / 2 - half + dx, this.y + dy, outA);
    this.stage.onGlass(size.width / 2 + half + dx, this.y + dy, outB);
  }

  // Into a pool of its own, drawn over everything (RodPool's onTop).
  draw(pool, hand) {
    if (!this.visible || hand.holding || hand.flight) return;
    pool.push(this.restA, this.restB, this.restUp, 0, 0, this.widthScale);
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
    this.scale = 1; // its breadth: the tray's, easing to its own once out at the kal-toh
    this.scaleGoal = 1;
    this.carried = null; // taken up by one finger: where it was touched, and where the finger is
  }

  // Taken up from the tray, by a finger at (x, y).
  lift(x, y) {
    const { width } = this.stage.size;
    this.holding = true;
    this.a.copy(this.tray.restA);
    this.b.copy(this.tray.restB);
    this.scale = this.scaleGoal = this.tray.widthScale;
    // Where along it the finger took it (0 at one end, 1 at the other), and how far off its line.
    const left = width / 4 + this.tray.slide;
    const along = x === undefined ? 0.5 : clamp01((x - left) / (width / 2));
    const fx = x ?? width / 2;
    const fy = y ?? this.tray.y;
    // It hangs from the end nearer the finger: `byB` if that is its end b. `above` is how much of it
    // lies past the finger on that side (slipping to nothing), and `low` is its far end, a weight
    // on a thread swinging under the finger, starting where it lay.
    const byB = along > 0.5;
    const above = byB ? 1 - along : along;
    const reach = (width / 2) * (1 - above);
    this.carried = { x: fx, y: fy, y0: fy, byB, above, low: new THREE.Vector2(fx + (byB ? -reach : reach), fy), lowBefore: null };
    this.carried.lowBefore = this.carried.low.clone();
    this.glow = 0;
    this.amber = 0;
  }

  // One finger carries it across the glass, the point it touched staying under the finger.
  carry(x, y) {
    if (!this.carried) return;
    this.carried.x = x;
    this.carried.y = y;
  }

  // How long the t'an looks on screen out at the kal-toh, in px.
  atKaltoh() {
    const { camera, assemblyRoot, toScreen } = this.stage;
    right.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(this.tray.length / 2);
    const p = toScreen(side.copy(assemblyRoot.position).add(right));
    const q = toScreen(side.copy(assemblyRoot.position).sub(right));
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  // Follow the fingers: rest exactly where it would be placed when the placement is good,
  // otherwise hang between the touched points (or the fingers) at the kal-toh's depth.
  follow(f1, f2, { pose, touchA, touchB, anchor, refused = false }) {
    this.carried = null;
    this.scaleGoal = 1;
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
    this.scaleGoal = this.tray.widthScale;
    const onGlass = Boolean(this.carried);
    this.carried = null;
    this.fly(this.a, this.b, this.tray.restA, this.tray.restB, 0.28, () => {
      this.holding = false;
    });
    this.flight.onGlass = onGlass;
  }

  update(dt) {
    this.scale += (this.scaleGoal - this.scale) * (1 - Math.exp(-dt / 0.08));
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
    if (this.carried) {
      // On the glass, hanging from the finger: its far end swings under the finger, pulled down
      // the screen and dragged along as the finger moves, the t'an slipping through the finger to
      // hang by its end. Raised from the tray, it draws in to the size it will be at the kal-toh
      // (and from the tray's breadth to its own).
      const { size, glass } = this.stage;
      const c = this.carried;
      const s = ease(clamp01((c.y0 - c.y) / RAISE));
      const length = size.width / 2 + (this.atKaltoh() - size.width / 2) * s;
      c.above *= Math.exp(-dt / SLIP);
      const step = Math.min(dt, 1 / 30);
      const vx = (c.low.x - c.lowBefore.x) * Math.exp(-SWAY * step);
      const vy = (c.low.y - c.lowBefore.y) * Math.exp(-SWAY * step);
      c.lowBefore.copy(c.low);
      c.low.x += vx;
      c.low.y += vy + DROOP * step * step;
      const hang = Math.hypot(c.low.x - c.x, c.low.y - c.y) || 1;
      const reach = length * (1 - c.above);
      const dx = (c.low.x - c.x) / hang;
      const dy = (c.low.y - c.y) / hang;
      c.low.set(c.x + dx * reach, c.y + dy * reach);
      const top = length * c.above;
      const ends = c.byB ? [this.goalB, this.goalA] : [this.goalA, this.goalB];
      this.stage.onGlass(c.x - dx * top, c.y - dy * top, ends[0]);
      this.stage.onGlass(c.low.x, c.low.y, ends[1]);
      this.scaleGoal = ((length * glass.width) / (size.width * this.tray.length)) * (2 - s);
    }
    const k = 1 - Math.exp(-dt / 0.045);
    this.a.lerp(this.goalA, k);
    this.b.lerp(this.goalB, k);
  }

  // On the glass it is drawn over everything, as in the tray (`top`, RodPool's onTop).
  draw(pool, halos, top = pool) {
    if (!this.holding && !this.flight) return;
    if (this.flight ? this.flight.onGlass : this.carried) {
      top.push(this.a, this.b, this.tray.restUp, 0, 0, this.scale);
      return;
    }
    this.up.copy(this.stage.camera.position).sub(this.a).normalize();
    pool.push(this.a, this.b, this.up, this.glow * 0.7, this.amber * 0.6, this.scale);
    if (this.glow > 0) halos.push(this.a, this.b, this.glow * 0.42, 0.07, 0);
    else if (this.amber > 0) halos.push(this.a, this.b, this.amber * 0.3, 0.06, 1);
  }
}
