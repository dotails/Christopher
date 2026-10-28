// How the base and the assembly of t'an move.
//
// The base turns about the pivot - the centre of the sphere to be - in any direction, and glides
// to rest when let go. The assembly keeps its place on the base: left alone it does not move
// relative to the stone at all. It has its own inertia, though: when the base starts to turn
// the t'an lag behind and catch up, and when it stops they carry on a little and settle back,
// critically damped, so they never bob or hover. A finger on the assembly turns it on the base
// instead; flung, it coasts to rest and stays where it stops.
//
// The two never pass through each other. While the assembly is being turned (by hand, by its
// own momentum, or by the spin test) the base gives way just enough and comes back; when the
// base is turned into the t'an they are bumped aside and drawn back into place.
//
// Turned over and let go to be read, the stone turns about its own axis until the carving on its
// underside stands upright to the eye.
import * as THREE from '../vendor/three.module.min.js';
import { PIVOT, SCALE } from './scene.js';

const STEP = 1 / 120;
const BASE_GLIDE = 0.6; // seconds for a released base to slow ...
const BASE_GRIP = 1.6; // ... and the steady drag (rad/s^2) that brings it to a clean stop
const HOLD = 24; // how firmly the assembly keeps its place on the base (1/s^2, critically damped)
const COAST = 0.9; // seconds for a flung assembly to slow to rest on the base
const HOME = 30; // how firmly it is drawn back to the pivot after a bump (1/s^2, critically damped)
const CLEAR = 0.022; // how far a t'an's centre line stays from the stone: half its thickness and a hair
const BASE_RETURN = 0.6; // seconds for a base that gave way to come back
const RIGHTING = 14; // how firmly a stone being read turns its carving upright (1/s^2, critically damped)

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const qInv = new THREE.Quaternion();
const qStep = new THREE.Quaternion();
const qErr = new THREE.Quaternion();
const qTarget = new THREE.Quaternion();

function integrate(q, w, h) {
  const angle = w.length() * h;
  if (angle < 1e-9) return;
  qStep.setFromAxisAngle(v3.copy(w).normalize(), angle);
  q.premultiply(qStep).normalize();
}

// The rotation taking q to target, as axis times angle.
function rotationTo(q, target, out) {
  qErr.copy(target).multiply(qInv.copy(q).invert());
  if (qErr.w < 0) qErr.set(-qErr.x, -qErr.y, -qErr.z, -qErr.w);
  const s = Math.sqrt(qErr.x * qErr.x + qErr.y * qErr.y + qErr.z * qErr.z);
  if (s < 1e-9) return out.set(0, 0, 0);
  const angle = 2 * Math.atan2(s, qErr.w);
  return out.set(qErr.x, qErr.y, qErr.z).multiplyScalar(angle / s);
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
    this.anchor = new THREE.Quaternion(); // its place on the base: orientation relative to the stone
    this.mode = 'held'; // held | drag | coast | spin
    this.baseDragged = false;
    this.spin = null; // { axis (assembly-local), rate, time, duration } during a spin test
    this.points = []; // assembly-local points kept clear of the stone
    this.acc = 0;
    this.scrape = 0; // how hard the stone met the t'an lately (for sound)
    this.dragW = new THREE.Vector3();
    this.resting = null; // the stone's normal where the assembly lay against it last step
    this.asleep = false;
    this.stillFor = 0;
    this.righting = false;
    this.rightAxis = new THREE.Vector3(); // the stone's own axis (world) ...
    this.rightAngle = 0; // ... and how far it has yet to turn about it to read upright
  }

  // Assembly-local points (THREE.Vector3) that must stay clear of the stone.
  setPoints(points) {
    this.points = points;
  }

  // A finger turns the base (world axis, angle in radians over dt seconds).
  turnBase(axis, angle, dt) {
    this.asleep = false;
    this.baseDragged = true;
    this.righting = false;
    qStep.setFromAxisAngle(axis, angle);
    this.baseQ.premultiply(qStep).normalize();
    this.dragW.copy(axis).multiplyScalar(angle / Math.max(dt, 1 / 240));
    this.baseW.lerp(this.dragW, 0.5);
  }

  // A finger turns the assembly on the base.
  turnAssembly(axis, angle, dt) {
    this.asleep = false;
    this.mode = 'drag';
    this.spin = null;
    qStep.setFromAxisAngle(axis, angle);
    this.q.premultiply(qStep).normalize();
    this.dragW.copy(axis).multiplyScalar(angle / Math.max(dt, 1 / 240));
    this.w.lerp(this.dragW, 0.5);
    this.keepPlace();
  }

  hold(what) {
    this.asleep = false;
    if (what === 'base') {
      this.baseDragged = true;
      this.righting = false;
      this.baseW.set(0, 0, 0);
    } else if (what === 'assembly') {
      this.mode = 'drag';
      this.spin = null;
      this.w.copy(this.baseW);
      this.keepPlace();
    }
  }

  // Let go: what was turning keeps the turn it had (flung), or stops if `still`.
  release(what, still = false) {
    if (what === 'base') {
      this.baseDragged = false;
      if (still) this.baseW.set(0, 0, 0);
    } else if (what === 'assembly' && this.mode === 'drag') {
      if (still) this.w.copy(this.baseW);
      this.mode = 'coast';
    }
  }

  // The spin test: the assembly turns about the hidden axis (assembly-local) and comes to rest.
  startSpin(axis, rate = 7, duration = 3.2) {
    this.asleep = false;
    this.spin = { axis: axis.clone().normalize(), rate, time: 0, duration };
    this.mode = 'spin';
  }

  // Being read: the stone should turn by `angle` about its own axis (world) for its carving to
  // stand upright. Called each frame while it is read and nobody holds it; null otherwise.
  right(axis, angle = 0) {
    if (!axis || this.baseDragged) {
      this.righting = false;
      return;
    }
    if (!this.righting) {
      if (Math.abs(angle) < 2e-3) return;
      this.righting = true;
      this.wake();
    }
    this.rightAxis.copy(axis);
    this.rightAngle = angle;
  }

  get spinning() {
    return this.mode === 'spin';
  }

  get turning() {
    return this.mode !== 'held';
  }

  // Its place on the base becomes wherever it is now.
  keepPlace() {
    this.anchor.copy(this.baseQ).invert().multiply(this.q);
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
    // At rest, nothing moves at all - until a hand, the base, or the stone itself disturbs it.
    if (this.asleep) {
      if (this.baseDragged || this.righting || this.baseW.lengthSq() > 0 || this.mode !== 'held') this.asleep = false;
      else if (this.collide(h, true) > 0.003) this.asleep = false;
      else return;
    }
    // The base: turned by hand, or gliding to rest.
    if (!this.baseDragged) {
      // Righting itself, its turn about its own axis is the righting's alone.
      let along = 0;
      if (this.righting) {
        along = this.baseW.dot(this.rightAxis);
        this.baseW.addScaledVector(this.rightAxis, -along);
      }
      // A heavy stone glides, then stops: smooth drag, plus a little steady grip so it comes to
      // rest in a moment rather than creeping on forever.
      const speed = this.baseW.length();
      const slower = Math.max(0, speed * Math.exp(-h / BASE_GLIDE) - BASE_GRIP * h);
      if (slower <= 0) this.baseW.set(0, 0, 0);
      else this.baseW.multiplyScalar(slower / speed);
      if (this.righting) {
        along += (RIGHTING * this.rightAngle - 2 * Math.sqrt(RIGHTING) * along) * h;
        this.rightAngle -= along * h;
        if (Math.abs(this.rightAngle) < 1e-3 && Math.abs(along) < 0.01) {
          along = 0;
          this.righting = false;
        }
        this.baseW.addScaledVector(this.rightAxis, along);
      }
      integrate(this.baseQ, this.baseW, h);
    }

    // The assembly's turning.
    if (this.mode === 'spin') {
      const s = this.spin;
      s.time += h;
      const up = Math.min(1, s.time / 0.7);
      const down = Math.min(1, Math.max(0, (s.duration - s.time) / 1.1));
      const rate = s.rate * up * up * (3 - 2 * up) * down * down * (3 - 2 * down);
      this.w.copy(v1.copy(s.axis).applyQuaternion(this.q)).multiplyScalar(rate).add(this.baseW);
      integrate(this.q, this.w, h);
      this.keepPlace();
      if (s.time >= s.duration) {
        this.spin = null;
        this.mode = 'held';
      }
    } else if (this.mode === 'coast') {
      // Its own turn on the base slows; where it stops is its new place.
      const rel = v1.copy(this.w).sub(this.baseW).multiplyScalar(Math.exp(-h / COAST));
      this.w.copy(this.baseW).add(rel);
      integrate(this.q, this.w, h);
      this.keepPlace();
      if (rel.length() < 0.04) this.mode = 'held';
    } else if (this.mode === 'held') {
      // Drawn to its place on the base, critically damped: it lags, catches up, never sways.
      qTarget.copy(this.baseQ).multiply(this.anchor);
      const e = rotationTo(this.q, qTarget, v1);
      const rel = v2.copy(this.w).sub(this.baseW);
      this.w.addScaledVector(e, HOLD * h).addScaledVector(rel, -2 * Math.sqrt(HOLD) * h);
      integrate(this.q, this.w, h);
    }

    // Drawn back to the pivot after a bump, critically damped. Resting on the stone, the stone's
    // grip holds it: only the pull straight into the stone remains (and the stone answers it).
    const pull = v1.copy(this.pos).multiplyScalar(-HOME).addScaledVector(this.vel, -2 * Math.sqrt(HOME));
    if (this.resting && this.baseW.lengthSq() < 1e-6) {
      const n = this.resting;
      pull.copy(n).multiplyScalar(Math.min(0, pull.dot(n)));
      this.vel.copy(n).multiplyScalar(Math.min(0, this.vel.dot(n)));
    }
    this.vel.addScaledVector(pull, h);
    this.pos.addScaledVector(this.vel, h);
    this.resting = null;
    if (this.pos.lengthSq() < 1e-10 && this.vel.lengthSq() < 1e-8) {
      this.pos.set(0, 0, 0);
      this.vel.set(0, 0, 0);
    }
    // A base that gave way comes back.
    this.baseOffset.multiplyScalar(Math.exp(-h / BASE_RETURN));
    if (this.baseOffset.lengthSq() < 1e-10) this.baseOffset.set(0, 0, 0);

    this.collide(h);

    // Settled - in its place on a base at rest, hardly moving - it goes still entirely.
    const settled = this.mode === 'held' && !this.baseDragged && !this.righting && this.baseW.lengthSq() === 0 &&
      this.baseOffset.lengthSq() === 0 && this.vel.length() < 0.004 && this.w.length() < 0.004 &&
      rotationTo(this.q, qTarget.copy(this.baseQ).multiply(this.anchor), v1).length() < 0.001;
    this.stillFor = settled ? this.stillFor + h : 0;
    if (this.stillFor > 0.3) {
      this.asleep = true;
      this.q.copy(qTarget);
      this.vel.set(0, 0, 0);
      this.w.set(0, 0, 0);
    }
  }

  // Disturb it (a move was made, t'an came or went): it may need to settle again.
  wake() {
    this.asleep = false;
    this.stillFor = 0;
  }

  // Keep every point clear of the stone. A turning assembly pushes the base aside; otherwise the
  // stone has its way and the assembly is bumped (or simply rests on it).
  collide(h, onlyLook = false) {
    const { base } = this;
    let deepest = 0;
    const normal = new THREE.Vector3();
    const at = new THREE.Vector3();
    qInv.copy(this.baseQ).invert();
    const origin = v2.copy(PIVOT).add(this.baseOffset);
    for (const p of this.points) {
      // Into the base's own frame: foot at y = 0, axis along y.
      const local = this.toWorld(p, v1).sub(origin).applyQuaternion(qInv);
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
    if (deepest <= 0 || onlyLook) return deepest;
    if (this.mode !== 'held' && !this.baseDragged) {
      this.baseOffset.addScaledVector(normal, -deepest);
      return deepest;
    }
    // Bumped: lifted clear and carried along by the stone where it struck, with a little turn
    // from the blow (its place on the base then draws it back). Resting on it, it merely stops:
    // stone grips steel, so it does not slide about on the slope either.
    this.pos.addScaledVector(normal, deepest);
    this.resting = normal;
    const surfaceV = v1.copy(this.baseW).cross(v2.copy(at).sub(PIVOT).sub(this.baseOffset));
    const push = Math.min(3, Math.max(0, surfaceV.dot(normal) - this.vel.dot(normal)));
    this.vel.addScaledVector(normal, push);
    const along = v3.copy(this.vel).addScaledVector(normal, -this.vel.dot(normal));
    this.vel.addScaledVector(along, -0.9);
    const blow = Math.max(0, surfaceV.dot(normal));
    if (blow > 0.02) {
      const arm = v3.copy(at).sub(PIVOT).sub(this.pos);
      this.w.addScaledVector(arm.cross(normal), Math.min(blow, 2) * 0.35);
    }
    this.scrape = Math.max(this.scrape, Math.min(1, blow * 2));
    return deepest;
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
