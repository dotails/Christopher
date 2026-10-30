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
// own momentum, or spun) the base gives way just enough and comes back; when the base is turned
// into the t'an they are bumped aside and drawn back into place.
//
// Let go level - its foot within twenty degrees of facing straight down - the stone comes down to rest on
// the floor, and the t'an with it: first it falls straight down until its lowest edge meets the
// floor, then it tips over on that edge until its foot lies flush, each with a knock. Held, it never
// comes down, only rises as it must: tipped further, toward the eye or away, it is lifted back to turn
// freely about the pivot; tipped a little while it rests, it rocks up onto its edge, never into the
// floor. Resting there, a t'an turned into it is lifted clear: the stone does not give way into the
// floor. The floor is the table's top as it is (table.js): its plates, and the groove down its
// middle, which the stone's foot spans; and neither the stone nor any t'an on it ever passes into
// it, however fast it is spun: turned down toward it, or knocked down by the stone tumbling end
// over end, the t'an lift the stone clear - above the pivot, if they must - and it comes back down
// as they let it.
import * as THREE from '../vendor/three.module.min.js';
import { PIVOT, SCALE } from './scene.js';
import { onTop, topHeight } from './table.js';

const STEP = 1 / 120;
const BASE_GLIDE = 0.6; // seconds for a released base to slow ...
const BASE_GRIP = 1.6; // ... and the steady drag (rad/s^2) that brings it to a clean stop
const HOLD = 24; // how firmly the assembly keeps its place on the base (1/s^2, critically damped)
const COAST = 0.9; // seconds for a flung assembly to slow to rest on the base
const HOME = 30; // how firmly it is drawn back to the pivot after a bump (1/s^2, critically damped)
const CLEAR = 0.022; // how far a t'an's centre line stays from the stone: half its thickness and a hair
const SAMPLE = 0.02; // a t'an is tested against the stone this often along its length (world units)
const BASE_RETURN = 0.6; // seconds for a base that gave way to come back
const LEVEL = Math.cos((20 * Math.PI) / 180); // within twenty degrees of upright, the stone rests on the floor
const FALL = 9; // how fast it falls to the floor (world units/s^2)
const LIFT = 45; // how firmly it is lifted back (1/s^2, critically damped)
const TIP = 7; // how fast, resting on its edge, it tips over to lie flush (rad/s^2)
const RAISED = 0.12; // seconds for a stone lifted above the pivot by its t'an to come back down
const Y = new THREE.Vector3(0, 1, 0);
const upNow = new THREE.Vector3();

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const qInv = new THREE.Quaternion();
const qStep = new THREE.Quaternion();
const qErr = new THREE.Quaternion();
const qTarget = new THREE.Quaternion();
const endA = new THREE.Vector3();
const endB = new THREE.Vector3();
const sample = new THREE.Vector3();
const sampleNormal = new THREE.Vector3();
const hung = new THREE.Vector3(); // the kal-toh's centre, in the stone's frame
const contactNormal = new THREE.Vector3();
const contactAt = new THREE.Vector3();

// How near the segment a-b comes to the y axis (seen from above).
function axisDistance(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-12 ? Math.max(0, Math.min(1, -(a.x * dx + a.z * dz) / len2)) : 0;
  return Math.hypot(a.x + dx * t, a.z + dz * t);
}

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

// Points round the stone's foot and its lip, about the pivot: its lowest point, however it is
// turned, is among them (close enough together that the groove's walls fall between none).
function hullOf(base) {
  const hull = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    for (const y of [0, base.top]) hull.push(new THREE.Vector3(Math.cos(a) * base.radius, y - PIVOT.y, Math.sin(a) * base.radius));
  }
  return hull;
}

export class Motion {
  constructor(base) {
    this.base = base; // { surface(r), slope(r), radius }
    this.baseQ = new THREE.Quaternion();
    this.baseW = new THREE.Vector3();
    this.baseOffset = new THREE.Vector3();
    this.pos = new THREE.Vector3(); // the assembly's displacement from the pivot
    this.vel = new THREE.Vector3();
    this.speed = 0; // how fast it has gone, lately
    this.q = new THREE.Quaternion();
    this.w = new THREE.Vector3();
    this.anchor = new THREE.Quaternion(); // its place on the base: orientation relative to the stone
    this.mode = 'held'; // held | drag | coast | spin
    this.baseDragged = false;
    this.spin = null; // { axis (assembly-local), rate, time, duration } while it is spun
    this.rods = []; // assembly-local ends [a, b] of the t'an, kept clear of the stone
    this.acc = 0;
    this.scrape = 0; // how hard the stone met the t'an lately (for sound)
    this.dragW = new THREE.Vector3();
    this.resting = null; // the stone's normal where the assembly lay against it last step
    this.restingNormal = new THREE.Vector3();
    this.asleep = false;
    this.stillFor = 0;
    // How far the stone (and the t'an on it) has come down toward the floor, and how fast.
    this.drop = 0;
    this.dropV = 0;
    this.dropTarget = 0;
    // And how far the t'an on it hold it up above the pivot, where they reach the floor (and how
    // far they must).
    this.raise = 0;
    this.raiseNeed = 0;
    this.tipW = 0; // how fast, on its edge, it is tipping over to lie flush
    this.landed = 0; // how hard it last came to rest on the floor (for its sound), until taken
    this.centre = PIVOT.clone(); // the pivot, as far down as the stone has come
    this.hull = hullOf(base);
    // It begins as it rests, level on the floor.
    this.drop = this.dropTarget = this.room();
    this.centre.setY(PIVOT.y - this.drop);
  }

  // The t'an (assembly-local ends, THREE.Vector3 pairs) that must stay clear of the stone.
  setRods(rods) {
    this.rods = rods;
  }

  // Another base to stand on (main.js, the same `base` given its new shape): its foot and lip found
  // afresh, and all woken, to settle on it as it is.
  reshape() {
    this.hull = hullOf(this.base);
    this.asleep = false;
    this.stillFor = 0;
  }

  // A finger turns the base (world axis, angle in radians over dt seconds).
  turnBase(axis, angle, dt) {
    this.asleep = false;
    this.baseDragged = true;
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

  // Spun: the assembly turns about an axis (assembly-local) and comes to rest.
  startSpin(axis, rate = 7, duration = 3.2) {
    this.asleep = false;
    this.spin = { axis: axis.clone().normalize(), rate, time: 0, duration };
    this.mode = 'spin';
  }

  get spinning() {
    return this.mode === 'spin';
  }

  get turning() {
    return this.mode !== 'held';
  }

  // A new kal-toh takes its place square on the base, at rest.
  resetPlace() {
    this.q.copy(this.baseQ);
    this.anchor.identity();
    this.w.copy(this.baseW);
    this.pos.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.mode = 'held';
    this.spin = null;
    this.wake();
  }

  // How the stone is turned, and the kal-toh's place on it: kept between sessions (keep.js).
  keep() {
    return { base: this.baseQ.toArray(), anchor: this.anchor.toArray() };
  }

  // Taken up again as it was kept: the stone turned as it was, the kal-toh in its place on it, and
  // still - resting on the floor if it lay level, lifted to turn freely if not.
  resume({ base, anchor } = {}) {
    const turn = (q) => Array.isArray(q) && q.length === 4 && q.every(Number.isFinite) && Math.hypot(...q) > 0.5;
    if (turn(base)) this.baseQ.fromArray(base).normalize();
    if (turn(anchor)) this.anchor.fromArray(anchor).normalize();
    this.q.copy(this.baseQ).multiply(this.anchor);
    this.w.set(0, 0, 0);
    this.baseW.set(0, 0, 0);
    this.pos.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.mode = 'held';
    this.spin = null;
    if (upNow.set(0, 1, 0).applyQuaternion(this.baseQ).y < LEVEL) {
      this.drop = this.dropTarget = this.dropV = 0;
      this.centre.setY(PIVOT.y);
    }
    this.wake();
  }

  // Its place on the base becomes wherever it is now.
  keepPlace() {
    this.anchor.copy(this.baseQ).invert().multiply(this.q);
  }

  // World transform of an assembly-local point.
  toWorld(p, out) {
    return out.copy(p).multiplyScalar(SCALE).applyQuaternion(this.q).add(this.pos).add(this.centre);
  }

  toLocal(world, out) {
    return out.copy(world).sub(this.centre).sub(this.pos).applyQuaternion(qInv.copy(this.q).invert()).divideScalar(SCALE);
  }

  // How far the stone, turned as it is (and given way as it has), and the t'an on it could come
  // down from the pivot's height before any of them met the floor beneath; less than none, how far
  // they must rise above it. (The stone only ever comes down straight above the table's middle.)
  room() {
    let room = Infinity;
    for (const p of this.hull) {
      v1.copy(p).applyQuaternion(this.baseQ).add(this.baseOffset);
      if (onTop(v1.x, v1.z)) room = Math.min(room, PIVOT.y + v1.y - topHeight(v1.x, v1.z));
    }
    for (const ends of this.rods) {
      for (const p of ends) {
        v1.copy(p).multiplyScalar(SCALE).applyQuaternion(this.q).add(this.pos);
        if (onTop(v1.x, v1.z)) room = Math.min(room, PIVOT.y + v1.y - topHeight(v1.x, v1.z) - CLEAR);
      }
    }
    return Number.isFinite(room) ? room : 0;
  }

  // Held up above the pivot by the t'an on it as far as they must (`room`, less than none): at once
  // as far as that, back down as they let it. Returns the room left to come down, so raised.
  raised(room, h) {
    this.raiseNeed = Math.max(0, -room);
    this.raise = this.raise <= this.raiseNeed ? this.raiseNeed : this.raiseNeed + (this.raise - this.raiseNeed) * Math.exp(-h / RAISED);
    return room + this.raise;
  }

  // Let go level, the stone comes down to the floor, then tips flush; held or tipped, it only rises.
  ground(h) {
    const up = upNow.set(0, 1, 0).applyQuaternion(this.baseQ);
    const level = up.y >= LEVEL;
    let room = this.raised(this.room(), h);
    this.flushing = false;
    if (this.baseDragged || !level) {
      // Held, it never comes down: it only rises as it must (tipped past twenty degrees, lifted back to
      // turn freely; tipped a little, rocked up onto its edge).
      this.dropTarget = level ? Math.min(this.drop, room) : 0;
      this.tipW = 0;
      if (this.drop > this.dropTarget) {
        this.dropV += (LIFT * (this.dropTarget - this.drop) - 2 * Math.sqrt(LIFT) * this.dropV) * h;
        this.drop += this.dropV * h;
      } else {
        this.dropV = 0;
      }
    } else if (this.drop < room - 1e-6) {
      // Let go, it falls straight down, until its lowest edge meets the floor.
      this.dropTarget = room;
      this.dropV = Math.max(0, this.dropV) + FALL * h;
      this.drop += this.dropV * h;
      if (this.drop >= room) {
        if (this.dropV > 0.5) this.landed = Math.max(this.landed, this.dropV);
        this.drop = room;
        this.dropV = 0;
      }
    } else {
      // On its edge, it tips over onto its foot, faster as it goes, the edge kept on the floor; flush,
      // it knocks down flat. What turning it had about anything but the vertical, the floor takes.
      this.dropV = 0;
      this.baseW.set(0, this.baseW.y, 0);
      const axis = v2.crossVectors(up, Y);
      const s = axis.length();
      const angle = Math.atan2(s, up.y);
      if (s > 1e-12 && angle > 1e-9) {
        this.tipW = (this.tipW ?? 0) + TIP * h;
        const turn = Math.min(angle, this.tipW * h);
        qStep.setFromAxisAngle(axis.multiplyScalar(1 / s), turn);
        this.baseQ.premultiply(qStep).normalize();
        this.flushing = turn < angle;
        if (!this.flushing) {
          // Flush: down flat, the last of it all at once.
          this.baseQ.premultiply(qStep.setFromUnitVectors(v3.set(0, 1, 0).applyQuaternion(this.baseQ), Y)).normalize();
          const knock = this.tipW * this.base.radius;
          if (knock > 0.3) this.landed = Math.max(this.landed, knock);
          this.tipW = 0;
        }
        room = this.room() + this.raise;
      }
      this.drop = room;
      this.dropTarget = room;
    }
    if (this.drop > room) {
      this.drop = room;
      this.dropV = Math.min(0, this.dropV);
    }
    if (this.drop < 0) {
      this.drop = 0;
      this.dropV = Math.max(0, this.dropV);
    }
    if (Math.abs(this.drop - this.dropTarget) < 1e-5 && Math.abs(this.dropV) < 1e-3) {
      this.drop = this.dropTarget;
      this.dropV = 0;
    }
    this.centre.copy(PIVOT).setY(PIVOT.y - this.drop + this.raise);
  }

  // Whatever moved this step, none of it stands in the floor: what the t'an, or a stone given way,
  // would push into it is lifted out at once.
  clearFloor() {
    const room = this.room() + this.raise;
    if (this.drop <= room) return;
    if (room < 0) {
      this.raise -= room;
      this.raiseNeed = this.raise;
    }
    this.drop = Math.max(0, room);
    this.dropV = Math.min(0, this.dropV);
    this.centre.setY(PIVOT.y - this.drop + this.raise);
  }

  // Resting on the floor (not held up above it).
  get onFloor() {
    return this.drop > 0.01 && this.drop >= this.room() + this.raise - 1e-4;
  }

  // Still coming down to the floor, or going up from it.
  get grounding() {
    return this.flushing || Math.abs(this.drop - this.dropTarget) > 1e-5 || Math.abs(this.dropV) > 1e-3 ||
      this.raise - this.raiseNeed > 1e-5;
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
      if (this.baseDragged || this.baseW.lengthSq() > 0 || this.mode !== 'held' || this.grounding) this.asleep = false;
      else if (this.collide(h, true) > 0.003) this.asleep = false;
      else return;
    }
    // The base: turned by hand, or gliding to rest.
    if (!this.baseDragged) {
      // A heavy stone glides, then stops: smooth drag, plus a little steady grip so it comes to
      // rest in a moment rather than creeping on forever.
      const speed = this.baseW.length();
      const slower = Math.max(0, speed * Math.exp(-h / BASE_GLIDE) - BASE_GRIP * h);
      if (slower <= 0) this.baseW.set(0, 0, 0);
      else this.baseW.multiplyScalar(slower / speed);
      integrate(this.baseQ, this.baseW, h);
    }
    this.ground(h);

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
    this.clearFloor();

    // Settled - in its place on a base at rest, hardly moving - it goes still entirely.
    // (How fast it goes over a moment, not in each step: resting on the stone, it is drawn toward its
    // place and stopped by the stone every other step, going nowhere.)
    this.speed += (this.vel.length() - this.speed) * (1 - Math.exp(-h / 0.1));
    const settled = this.mode === 'held' && !this.baseDragged && this.baseW.lengthSq() === 0 && !this.grounding &&
      this.baseOffset.lengthSq() === 0 && this.speed < 0.004 && this.w.length() < 0.004 &&
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

  // Keep every t'an clear of the stone, along its whole length - over the basin's lip as much as
  // at its ends. A turning assembly pushes the base aside; otherwise the stone has its way and the
  // assembly is bumped (or simply rests on it).
  collide(h, onlyLook = false) {
    const { base } = this;
    let deepest = 0;
    const normal = contactNormal;
    const at = contactAt;
    qInv.copy(this.baseQ).invert();
    const origin = v2.copy(this.centre).add(this.baseOffset);
    const high = base.top + CLEAR;
    // A kal-toh about the pivot, over the basin, is only ever lifted out of the stone: pushed down
    // through its foot, the t'an on the far side of it would be pushed back up the next step, and
    // down again, for ever. Only one beneath the stone is pushed out through its foot.
    const beneath = hung.copy(this.centre).add(this.pos).sub(origin).applyQuaternion(qInv).y + PIVOT.y < 0;
    for (const [pa, pb] of this.rods) {
      // Into the base's own frame: foot at y = 0, axis along y.
      const a = this.toWorld(pa, endA).sub(origin).applyQuaternion(qInv);
      const b = this.toWorld(pb, endB).sub(origin).applyQuaternion(qInv);
      a.y += PIVOT.y;
      b.y += PIVOT.y;
      // Wholly above the stone, wholly below its foot, or never within its reach: untouched.
      if ((a.y >= high && b.y >= high) || (a.y < -CLEAR && b.y < -CLEAR)) continue;
      if (axisDistance(a, b) >= base.radius) continue;
      // Only the stretch of it lower than the stone's highest point needs looking at.
      let s0 = 0;
      let s1 = 1;
      if (a.y >= high) s0 = (high - a.y) / (b.y - a.y);
      else if (b.y >= high) s1 = (high - a.y) / (b.y - a.y);
      const steps = Math.max(1, Math.ceil((a.distanceTo(b) * (s1 - s0)) / SAMPLE));
      for (let i = 0; i <= steps; i++) {
        const t = s0 + ((s1 - s0) * i) / steps;
        sample.lerpVectors(a, b, t);
        const depth = this.depthAt(sample, sampleNormal, beneath);
        if (depth > deepest) {
          deepest = depth;
          normal.copy(sampleNormal);
          at.copy(sample);
        }
      }
    }
    if (deepest > 0) {
      normal.applyQuaternion(this.baseQ);
      at.y -= PIVOT.y;
      at.applyQuaternion(this.baseQ).add(origin);
    }
    if (deepest <= 0 || onlyLook) return deepest;
    // A turning assembly pushes the base aside - unless the base rests on the floor: then the t'an
    // are lifted clear instead, the stone going nowhere.
    if (this.mode !== 'held' && !this.baseDragged && !this.onFloor) {
      this.baseOffset.addScaledVector(normal, -deepest);
      return deepest;
    }
    // Bumped: lifted clear and carried along by the stone where it struck, with a little turn
    // from the blow (its place on the base then draws it back). Resting on it, it merely stops:
    // stone grips steel, so it does not slide about on the slope either.
    this.pos.addScaledVector(normal, deepest);
    this.resting = this.restingNormal.copy(normal);
    const surfaceV = v1.copy(this.baseW).cross(v2.copy(at).sub(this.centre).sub(this.baseOffset));
    const push = Math.min(3, Math.max(0, surfaceV.dot(normal) - this.vel.dot(normal)));
    this.vel.addScaledVector(normal, push);
    const along = v3.copy(this.vel).addScaledVector(normal, -this.vel.dot(normal));
    this.vel.addScaledVector(along, -0.9);
    const blow = Math.max(0, surfaceV.dot(normal));
    if (blow > 0.02) {
      const arm = v3.copy(at).sub(this.centre).sub(this.pos);
      this.w.addScaledVector(arm.cross(normal), Math.min(blow, 2) * 0.35);
    }
    this.scrape = Math.max(this.scrape, Math.min(1, blow * 2));
    return deepest;
  }

  // How far a point in the base's frame (foot at y = 0) lies inside the stone, and the way out
  // (into `out`): up through its upper surface, or (`down`) down through its foot, if nearer.
  depthAt(p, out, down = true) {
    const { base } = this;
    const r = Math.hypot(p.x, p.z);
    if (r >= base.radius || p.y < -CLEAR) return 0;
    const top = base.surface(r) + CLEAR;
    if (p.y >= top) return 0;
    const slope = base.slope(r);
    out.set(r > 1e-6 ? (-slope * p.x) / r : 0, 1, r > 1e-6 ? (-slope * p.z) / r : 0).normalize();
    let depth = (top - p.y) * out.y;
    if (down && p.y + CLEAR < depth) {
      depth = p.y + CLEAR;
      out.set(0, -1, 0);
    }
    return depth;
  }

  // Apply to the scene graph.
  apply(stage) {
    stage.baseRoot.position.copy(this.centre).add(this.baseOffset);
    stage.baseRoot.quaternion.copy(this.baseQ);
    stage.assemblyRoot.position.copy(this.centre).add(this.pos);
    stage.assemblyRoot.quaternion.copy(this.q);
    stage.baseRoot.updateMatrixWorld();
    stage.assemblyRoot.updateMatrixWorld();
  }

  // The base's frame for other bodies (falling t'an): world point to base-local and back.
  baseLocal(world, out) {
    out.copy(world).sub(this.centre).sub(this.baseOffset).applyQuaternion(qInv.copy(this.baseQ).invert());
    out.y += PIVOT.y;
    return out;
  }

  baseWorld(local, out) {
    out.copy(local);
    out.y -= PIVOT.y;
    return out.applyQuaternion(this.baseQ).add(this.centre).add(this.baseOffset);
  }

  // Velocity of the stone at a world point.
  baseVelocity(world, out) {
    // (Coming down or going up, it moves straight down or up as well.)
    return out.copy(this.baseW).cross(v1.copy(world).sub(this.centre).sub(this.baseOffset)).add(v2.set(0, -this.dropV, 0));
  }
}
