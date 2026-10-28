// How the base and the assembly of t'an move.
//
// The base turns about the pivot - the centre of the sphere to be - in any direction, and keeps
// turning a little when let go. The assembly floats in the field there: it has its own momentum,
// so it lags behind the base and catches up rather than moving with it rigidly, and a finger on
// the t'an spins it on its own. The two never pass through each other. When the assembly turns
// (spun by hand, or by the spin test) the base gives way just enough and then returns; when the
// base is turned into the t'an it scrapes and bumps them aside, and the field lets them fall
// back into place.
import * as THREE from '../vendor/three.module.min.js';
import { PIVOT, SCALE } from './scene.js';

const STEP = 1 / 120;
const FOLLOW = 0.75; // seconds for the assembly's turning to catch up with the base's
const BASE_GLIDE = 0.55; // seconds for a released base to slow
const FALL = 3.2; // how hard the field draws the assembly home (units/s^2)
const HOME = 0.05; // within this the pull eases off like a spring
const DRAG = 3.2;
const CLEAR = 0.022; // how far a t'an's centre line stays above the stone: half its thickness and a hair
const BASE_RETURN = 0.9; // seconds for a base that gave way to come back

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const qInv = new THREE.Quaternion();
const qStep = new THREE.Quaternion();

function integrate(q, w, h) {
  const angle = w.length() * h;
  if (angle < 1e-9) return;
  qStep.setFromAxisAngle(v3.copy(w).normalize(), angle);
  q.premultiply(qStep).normalize();
}

export class Motion {
  constructor(base) {
    this.base = base; // { surface(r), slope(r), radius }
    this.baseQ = new THREE.Quaternion();
    this.baseW = new THREE.Vector3();
    this.baseOffset = new THREE.Vector3();
    this.pos = new THREE.Vector3(); // the assembly's displacement from the pivot
    this.vel = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.w = new THREE.Vector3();
    this.driving = null; // 'base' | 'assembly' while a finger turns one
    this.spin = null; // { axis (assembly-local), rate, time, duration } during a spin test
    this.points = []; // assembly-local points kept clear of the base
    this.acc = 0;
    this.scrape = 0; // how hard the base met the t'an lately (for sound)
    this.dragW = new THREE.Vector3();
  }

  // Assembly-local points (THREE.Vector3) that must stay clear of the stone.
  setPoints(points) {
    this.points = points;
  }

  // A finger turns the base (world axis, angle in radians over dt seconds).
  turnBase(axis, angle, dt) {
    this.driving = 'base';
    qStep.setFromAxisAngle(axis, angle);
    this.baseQ.premultiply(qStep).normalize();
    this.dragW.copy(axis).multiplyScalar(angle / Math.max(dt, 1 / 240));
    this.baseW.lerp(this.dragW, 0.5);
  }

  turnAssembly(axis, angle, dt) {
    this.driving = 'assembly';
    qStep.setFromAxisAngle(axis, angle);
    this.q.premultiply(qStep).normalize();
    this.dragW.copy(axis).multiplyScalar(angle / Math.max(dt, 1 / 240));
    this.w.lerp(this.dragW, 0.5);
  }

  hold(what) {
    this.driving = what;
    if (what === 'base') this.baseW.set(0, 0, 0);
    if (what === 'assembly') this.w.set(0, 0, 0);
  }

  release() {
    this.driving = null;
  }

  // The spin test: the assembly turns about the hidden axis (assembly-local) and slows again.
  startSpin(axis, rate = 7, duration = 3.2) {
    this.spin = { axis: axis.clone().normalize(), rate, time: 0, duration };
  }

  get spinning() {
    return this.spin !== null;
  }

  // World transform of an assembly-local point.
  toWorld(p, out) {
    return out.copy(p).multiplyScalar(SCALE).applyQuaternion(this.q).add(this.pos).add(PIVOT);
  }

  toLocal(world, out) {
    return out.copy(world).sub(PIVOT).sub(this.pos).applyQuaternion(qInv.copy(this.q).invert()).divideScalar(SCALE);
  }

  update(dt) {
    this.acc = Math.min(this.acc + dt, 0.1);
    this.scrape *= Math.exp(-dt / 0.15);
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
  }

  step(h) {
    // The base: turned by hand, or gliding to rest.
    if (this.driving !== 'base') {
      this.baseW.multiplyScalar(Math.exp(-h / BASE_GLIDE));
      integrate(this.baseQ, this.baseW, h);
    }
    // The assembly's turning: the spin test, a hand, or following the base.
    let leading = this.driving === 'assembly';
    if (this.spin) {
      const s = this.spin;
      s.time += h;
      const up = Math.min(1, s.time / 0.7);
      const down = Math.min(1, Math.max(0, (s.duration - s.time) / 1.1));
      const rate = s.rate * up * up * (3 - 2 * up) * down * down * (3 - 2 * down);
      const axis = v1.copy(s.axis).applyQuaternion(this.q);
      this.w.copy(axis).multiplyScalar(rate);
      if (s.time >= s.duration) this.spin = null;
      leading = true;
    } else if (this.driving !== 'assembly') {
      this.w.lerp(this.baseW, 1 - Math.exp(-h / FOLLOW));
      // Turning much faster than the base, it is spinning on its own momentum.
      leading = this.w.distanceTo(this.baseW) > 0.6;
    }
    if (this.driving !== 'assembly') integrate(this.q, this.w, h);

    // The field draws the assembly home: like a fall, easing into a spring near the pivot.
    const d = this.pos.length();
    if (d > 1e-6) this.vel.addScaledVector(this.pos, (-FALL * Math.min(1, d / HOME) * h) / d);
    this.vel.multiplyScalar(Math.exp(-DRAG * h));
    this.pos.addScaledVector(this.vel, h);
    // A base that gave way comes back.
    this.baseOffset.multiplyScalar(Math.exp(-h / BASE_RETURN));

    this.collide(h, leading);
  }

  // Keep every point clear of the stone. Whichever is being turned has its way: a turning
  // assembly pushes the base aside; a turning (or resting) base bumps the assembly.
  collide(h, assemblyLeads) {
    const { base } = this;
    let deepest = 0;
    const normal = new THREE.Vector3();
    const at = new THREE.Vector3();
    qInv.copy(this.baseQ).invert();
    const origin = v2.copy(PIVOT).add(this.baseOffset);
    for (const p of this.points) {
      // Into the base's own frame: foot at y = 0, axis along y.
      const w = this.toWorld(p, v1);
      const local = w.sub(origin).applyQuaternion(qInv);
      local.y += PIVOT.y;
      const r = Math.hypot(local.x, local.z);
      if (r >= base.radius || local.y < -CLEAR) continue;
      const top = base.surface(r) + CLEAR;
      if (local.y >= top) continue;
      // Out through the top, along the surface's normal - or out through the foot.
      const slope = base.slope(r);
      let nx = r > 1e-6 ? (-slope * local.x) / r : 0;
      let ny = 1;
      let nz = r > 1e-6 ? (-slope * local.z) / r : 0;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      let depth = (top - local.y) * ny;
      if (local.y + CLEAR < depth) {
        depth = local.y + CLEAR;
        nx = 0;
        ny = -1;
        nz = 0;
      }
      if (depth > deepest) {
        deepest = depth;
        normal.set(nx, ny, nz).applyQuaternion(this.baseQ);
        this.toWorld(p, at);
      }
    }
    if (deepest <= 0) return;
    if (assemblyLeads) {
      this.baseOffset.addScaledVector(normal, -deepest);
      return;
    }
    // Bumped: lifted clear, carried along by the stone where it struck, and set turning a
    // little by the blow. Resting on it, it merely stops falling.
    this.pos.addScaledVector(normal, deepest);
    const r = v1.copy(at).sub(PIVOT).sub(this.baseOffset);
    const surfaceV = v2.copy(this.baseW).cross(r);
    const push = Math.min(3, Math.max(0, surfaceV.dot(normal) - this.vel.dot(normal)));
    this.vel.addScaledVector(normal, push);
    const blow = Math.max(0, surfaceV.dot(normal));
    if (blow > 0.02) {
      const arm = v3.copy(at).sub(PIVOT).sub(this.pos);
      this.w.addScaledVector(arm.cross(normal), Math.min(blow, 2) * 0.5);
    }
    this.scrape = Math.max(this.scrape, Math.min(1, blow * 2));
  }

  // Apply to the scene graph.
  apply(stage) {
    stage.baseRoot.position.copy(PIVOT).add(this.baseOffset);
    stage.baseRoot.quaternion.copy(this.baseQ);
    stage.assemblyRoot.position.copy(PIVOT).add(this.pos);
    stage.assemblyRoot.quaternion.copy(this.q);
    stage.baseRoot.updateMatrixWorld();
    stage.assemblyRoot.updateMatrixWorld();
  }

  // The base's frame for other bodies (falling t'an): world point to base-local and back.
  baseLocal(world, out) {
    out.copy(world).sub(PIVOT).sub(this.baseOffset).applyQuaternion(qInv.copy(this.baseQ).invert());
    out.y += PIVOT.y;
    return out;
  }

  baseWorld(local, out) {
    out.copy(local);
    out.y -= PIVOT.y;
    return out.applyQuaternion(this.baseQ).add(PIVOT).add(this.baseOffset);
  }

  // Velocity of the stone at a world point.
  baseVelocity(world, out) {
    return out.copy(this.baseW).cross(v1.copy(world).sub(PIVOT).sub(this.baseOffset));
  }
}
