// T'an that have fallen from the kal-toh. Each is two particles held a t'an's length apart, so it
// tumbles; it strikes and slides over the stone (which may itself be turning), glances off the
// t'an still standing and off the fallen ones, and comes to rest on the floor beneath the stone or
// in its basin. Fallen t'an stay where they lie until a new game begins; then they fade away.
import * as THREE from '../vendor/three.module.min.js';
import * as G from './geom.js';
import { FLOOR } from './scene.js';
import { TOP } from './table.js';
import { ROD_WIDTH } from './rodmesh.js';

const STEP = 1 / 120;
const GRAVITY = 6.5;
// How far a fallen t'an's centre line keeps from the stone, and from the floor: half its width
// (however it lies) and a hair, so no edge of it ever passes into the stone or its basin's lip.
const CLEAR = ROD_WIDTH / 2 + 0.002;
const LIE = ROD_WIDTH / 2;
const SAMPLE = 0.02; // tested against the stone this often along its length
const T = 0.03; // a t'an's thickness against another (the rules' 0.02, drawn at scene.SCALE)
const SETTLE = 0.6; // seconds lying still before a t'an sleeps
const NEAR_STONE = 1.5; // a sleeping t'an this close to the pivot wakes when the stone moves
const LEAVE = 0.8; // seconds to fade away when a new game begins

const tmp = new THREE.Vector3();
const local = new THREE.Vector3();
const endA = new THREE.Vector3();
const endB = new THREE.Vector3();
const point = new THREE.Vector3();
const out = new THREE.Vector3();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const dv = new THREE.Vector3();
const where = new THREE.Vector3();
const surfaceV = new THREE.Vector3();
const previous = new THREE.Vector3();
const mid = new THREE.Vector3();
const flat = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Whether a point lies over the table's top (a square with rounded corners about the stone's axis).
function onTable(p) {
  const inner = TOP.half - TOP.corner;
  return Math.hypot(Math.max(0, Math.abs(p.x) - inner), Math.max(0, Math.abs(p.z) - inner)) < TOP.corner;
}

export class Falling {
  constructor(motion, base, sound) {
    this.motion = motion;
    this.base = base;
    this.sound = sound;
    this.rods = [];
    this.acc = 0;
    this.obstacles = []; // world segments of standing t'an: [{ a, b }] as arrays
    // How fast fallen t'an slide this frame against rock (the stone, the floor) and against metal
    // (one another), for their sound; main.js takes them each frame.
    this.sliding = { rock: 0, metal: 0 };
  }

  get busy() {
    return this.rods.some((r) => !r.asleep && !r.leaving);
  }

  // a, b, velocity in world space. Options: the other end's velocity, if it goes otherwise
  // (velocityB), spin (rad/s about a random axis), amber glow, and its broad face's direction (up).
  spawn(a, b, velocity, { amber = 0, blue = 0, spin = 1.2, velocityB = velocity, up = null } = {}) {
    const axis = tmp.subVectors(b, a).normalize();
    const twist = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .cross(axis).normalize().multiplyScalar(spin * 0.21 * (0.4 + Math.random() * 0.6));
    const va = velocity.clone().add(twist);
    const vb = velocityB.clone().sub(twist);
    this.rods.push({
      a: a.clone(),
      b: b.clone(),
      mid: new THREE.Vector3(),
      length: a.distanceTo(b),
      pa: a.clone().addScaledVector(va, -STEP),
      pb: b.clone().addScaledVector(vb, -STEP),
      age: 0,
      still: 0,
      asleep: false,
      onFloor: false,
      leaving: 0,
      amber,
      blue,
      lastClink: -1,
      up: up ? up.clone().normalize() : new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
    });
  }

  // A new game: what lay fallen fades away.
  clear() {
    for (const r of this.rods) r.leaving = Math.max(r.leaving, 1e-6);
  }

  update(dt) {
    // While the stone or the t'an on it move, whatever lies on or near the stone must move too
    // (and coming down to the floor, what lies there beside it).
    const stoneStill = this.motion.asleep;
    const centre = this.motion.centre;
    for (const r of this.rods) {
      if (r.asleep && !stoneStill && (!r.onFloor || this.motion.grounding) && r.mid.distanceTo(centre) < NEAR_STONE) this.wake(r);
    }
    this.prepareObstacles();
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= STEP) {
      for (const r of this.rods) if (!r.asleep && !r.leaving) this.step(r);
      this.touch();
      // Pressed against one another, none may be pressed into the stone.
      for (const r of this.rods) if (!r.asleep && !r.leaving) this.stone(r);
      this.acc -= STEP;
    }
    for (let i = this.rods.length - 1; i >= 0; i--) {
      const r = this.rods[i];
      r.age += dt;
      r.amber = Math.max(0, r.amber - dt * 1.2);
      r.blue = Math.max(0, r.blue - dt * 0.8);
      if (r.leaving) {
        r.leaving += dt;
        if (r.leaving > LEAVE) this.rods.splice(i, 1);
        continue;
      }
      // Fallen from the table, out of sight.
      if (r.mid.y < FLOOR - 8) {
        this.rods.splice(i, 1);
        continue;
      }
      if (!r.asleep && r.still > SETTLE && (r.onFloor || stoneStill || r.mid.distanceTo(centre) >= NEAR_STONE)) this.sleep(r);
    }
  }

  sleep(r) {
    r.asleep = true;
    r.pa.copy(r.a);
    r.pb.copy(r.b);
  }

  wake(r) {
    r.asleep = false;
    r.still = 0;
  }

  step(r) {
    integrate(r.a, r.pa);
    integrate(r.b, r.pb);
    for (let i = 0; i < 2; i++) {
      tmp.subVectors(r.b, r.a);
      const d = tmp.length() || 1e-6;
      tmp.multiplyScalar(((d - r.length) / d) * 0.5);
      r.a.add(tmp);
      r.b.sub(tmp);
    }
    r.onStone = false;
    const rock = Math.max(this.stone(r), this.floor(r));
    const metal = this.glance(r);
    const impact = Math.max(rock, metal);
    r.mid.addVectors(r.a, r.b).multiplyScalar(0.5);
    const speed = Math.max(r.a.distanceTo(r.pa), r.b.distanceTo(r.pb)) / STEP;
    // Lying against the stone or the floor and still moving: sliding, rock on metal.
    if ((r.onFloor || r.onStone) && speed > 0.08) this.sliding.rock = Math.max(this.sliding.rock, speed);
    r.still = speed < 0.05 ? r.still + STEP : Math.max(0, r.still - STEP * 0.5);
    if (r.onFloor) {
      // Lying on the floor it comes to rest on its broad face.
      flat.copy(UP).addScaledVector(tmp.subVectors(r.b, r.a).normalize(), -tmp.dot(UP));
      if (flat.lengthSq() > 1e-6) r.up.lerp(flat.normalize(), 0.02).normalize();
    }
    if (impact > 0.4 && r.age - r.lastClink > 0.07) {
      r.lastClink = r.age;
      this.sound?.clink(Math.min(1, impact / 3), rock >= metal ? 'rock' : 'metal');
    }
  }

  // The floor - the table's top - lifted out of it, with a little bounce and a good deal of
  // friction. Off its edge there is nothing: an end out there falls on, and so the t'an tips over
  // the edge and away.
  floor(r) {
    let impact = 0;
    r.onFloor = false;
    for (const [x, p] of [[r.a, r.pa], [r.b, r.pb]]) {
      const depth = FLOOR + LIE - x.y;
      if (depth <= 0 || depth > 0.2 || !onTable(x)) continue;
      r.onFloor = true;
      const vy = (x.y - p.y) / STEP;
      x.y += depth;
      const vx = (x.x - p.x) * 0.97;
      const vz = (x.z - p.z) * 0.97;
      p.set(x.x - vx, x.y - Math.max(0, -vy) * 0.25 * STEP, x.z - vz);
      impact = Math.max(impact, -vy);
    }
    return impact;
  }

  // Keep a fallen t'an out of the stone along its whole length: pushed out where it lies deepest
  // (turning about its ends as it would), it bounces a little and slides with the stone's motion.
  stone(r) {
    let impact = 0;
    for (let pass = 0; pass < 3; pass++) {
      const hit = this.deepest(r);
      if (!hit) break;
      r.onStone = true;
      const { s, depth } = hit;
      const n = out;
      // The ends' velocities, and the t'an's at the point of contact relative to the stone there.
      va.subVectors(r.a, r.pa).divideScalar(STEP);
      vb.subVectors(r.b, r.pb).divideScalar(STEP);
      where.lerpVectors(r.a, r.b, s);
      this.motion.baseVelocity(where, surfaceV);
      dv.copy(va).multiplyScalar(1 - s).addScaledVector(vb, s).sub(surfaceV);
      const vn = dv.dot(n);
      move(r, [n.x, n.y, n.z], s, depth);
      if (vn < 0) {
        // Into the stone: out again with a little bounce, and friction along it.
        const along = dv.addScaledVector(n, -vn).multiplyScalar(-0.18);
        along.addScaledVector(n, -vn * 1.3);
        const k = 1 / ((1 - s) * (1 - s) + s * s);
        va.addScaledVector(along, (1 - s) * k);
        vb.addScaledVector(along, s * k);
        impact = Math.max(impact, -vn);
      }
      r.pa.copy(r.a).addScaledVector(va, -STEP);
      r.pb.copy(r.b).addScaledVector(vb, -STEP);
    }
    return impact;
  }

  // Where along it a t'an lies deepest in the stone: { s, depth }, the way out in `out` (world).
  deepest(r) {
    const m = this.motion;
    const base = this.base;
    const a = m.baseLocal(r.a, endA);
    const b = m.baseLocal(r.b, endB);
    const high = base.top + CLEAR;
    if ((a.y >= high && b.y >= high) || (a.y < -CLEAR && b.y < -CLEAR)) return null;
    const steps = Math.max(1, Math.ceil(r.length / SAMPLE));
    let best = null;
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      point.lerpVectors(a, b, s);
      const rr = Math.hypot(point.x, point.z);
      if (rr >= base.radius || point.y < -CLEAR) continue;
      const top = base.surface(rr) + CLEAR;
      if (point.y >= top) continue;
      const slope = base.slope(rr);
      local.set(rr > 1e-6 ? (-slope * point.x) / rr : 0, 1, rr > 1e-6 ? (-slope * point.z) / rr : 0).normalize();
      let depth = (top - point.y) * local.y;
      if (m.drop > 0.01) {
        // The stone down on the floor: what lies beneath its foot is squeezed out sideways.
        const side = base.radius - rr + CLEAR;
        if (point.y < 0.08 && side < depth && rr > 1e-6) {
          depth = side;
          local.set(point.x / rr, 0, point.z / rr);
        }
      } else if (point.y + CLEAR < depth) {
        depth = point.y + CLEAR;
        local.set(0, -1, 0);
      }
      if (!best || depth > best.depth) {
        best = { s, depth };
        out.copy(local);
      }
    }
    if (best) out.applyQuaternion(m.baseQ);
    return best;
  }

  // The standing t'an's midpoints and reach, once a frame, so distant ones are skipped quickly.
  prepareObstacles() {
    for (const o of this.obstacles) {
      if (o.mid) continue;
      o.mid = G.lerp(o.a, o.b, 0.5);
      o.reach = G.dist(o.a, o.b) / 2;
    }
  }

  // Glance off the t'an still standing: a falling one never passes through them.
  glance(r) {
    let impact = 0;
    mid.addVectors(r.a, r.b).multiplyScalar(0.5);
    const reach = r.length / 2 + T;
    for (const o of this.obstacles) {
      const dx = o.mid[0] - mid.x;
      const dy = o.mid[1] - mid.y;
      const dz = o.mid[2] - mid.z;
      const far = reach + o.reach;
      if (dx * dx + dy * dy + dz * dz > far * far) continue;
      impact = Math.max(impact, push(r, null, o.a, o.b));
    }
    return impact;
  }

  // Fallen t'an lie against one another rather than through: each moving one is kept clear of
  // the rest, and one that lay asleep is woken by a real knock.
  touch() {
    const rods = this.rods;
    for (let i = 0; i < rods.length; i++) {
      const r = rods[i];
      if (r.asleep || r.leaving) continue;
      for (let j = 0; j < rods.length; j++) {
        const o = rods[j];
        if (j === i || o.leaving || (!o.asleep && j < i)) continue;
        const far = (r.length + o.length) / 2 + T;
        if (r.mid.distanceToSquared(o.mid) > far * far) continue;
        const a = [o.a.x, o.a.y, o.a.z];
        const b = [o.b.x, o.b.y, o.b.z];
        const knock = push(r, o.asleep ? null : o, a, b);
        if (o.asleep && knock > 0.6) this.wake(o);
        if (knock > 0) {
          // Metal on metal: struck, or drawn along.
          const speed = Math.max(r.a.distanceTo(r.pa), r.b.distanceTo(r.pb)) / STEP;
          if (speed > 0.08) this.sliding.metal = Math.max(this.sliding.metal, speed);
          if (knock > 0.8 && r.age - r.lastClink > 0.07) {
            r.lastClink = r.age;
            this.sound?.clink(Math.min(1, knock / 4), 'metal');
          }
        }
      }
    }
  }

  draw(pool, halos) {
    for (const r of this.rods) {
      const fade = r.leaving ? Math.min(1, r.leaving / LEAVE) : 0;
      if (fade >= 0.999) continue;
      pool.push(r.a, r.b, r.up, r.blue * 0.8, r.amber * 0.8, 1, fade);
      const glow = Math.max(r.blue, r.amber);
      if (glow > 0.02) halos.push(r.a, r.b, glow * 0.35 * (1 - fade), 0.06, r.amber > r.blue ? 1 : 0);
    }
  }
}

// Push rod r clear of segment (a, b) - and, if `other` is a moving fallen t'an, share the push
// with it. Returns how hard they met.
function push(r, other, a, b) {
  const ra = [r.a.x, r.a.y, r.a.z];
  const rb = [r.b.x, r.b.y, r.b.z];
  const c = G.closestSegSeg(ra, rb, a, b);
  if (c.d2 >= T * T) return 0;
  const d = Math.sqrt(c.d2);
  const n = d > 1e-6 ? G.scale(G.sub(c.c1, c.c2), 1 / d) : G.perpendicular(G.normalize(G.sub(rb, ra)));
  const depth = T - d;
  const share = other ? 0.5 : 1;
  move(r, n, c.s, depth * share);
  if (other) move(other, n, c.t, -depth * share);
  return depth / STEP;
}

// Move a rod by `amount` along n at the point s of the way along it (0 at a, 1 at b).
function move(r, n, s, amount) {
  const wa = 1 - s;
  const wb = s;
  const k = amount / (wa * wa + wb * wb);
  r.a.x += n[0] * wa * k;
  r.a.y += n[1] * wa * k;
  r.a.z += n[2] * wa * k;
  r.b.x += n[0] * wb * k;
  r.b.y += n[1] * wb * k;
  r.b.z += n[2] * wb * k;
}

function integrate(x, p) {
  previous.copy(x);
  x.x += (x.x - p.x) * 0.998;
  x.y += (x.y - p.y) * 0.998 - GRAVITY * STEP * STEP;
  x.z += (x.z - p.z) * 0.998;
  p.copy(previous);
}
