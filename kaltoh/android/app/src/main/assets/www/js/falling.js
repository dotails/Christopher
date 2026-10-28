// T'an that have fallen from the kal-toh. Each is two particles held a t'an's length apart, so it
// tumbles; it strikes and slides over the stone (which may itself be turning), glances off the
// t'an still standing, and drops past the base's edge into the dark, or lies still and dissolves.
import * as THREE from '../vendor/three.module.min.js';
import * as G from './geom.js';
import { ROD_DEPTH } from './rodmesh.js';

const STEP = 1 / 120;
const GRAVITY = 6.5;
const REST = 2.2; // seconds lying still before dissolving
const FADE = 0.7;
const CLEAR = ROD_DEPTH * 0.55;
const T = 0.03; // a t'an's thickness on the stone (the rules' 0.02, drawn at scene.SCALE)

const tmp = new THREE.Vector3();
const local = new THREE.Vector3();
const surfaceV = new THREE.Vector3();
const previous = new THREE.Vector3();
const mid = new THREE.Vector3();

export class Falling {
  constructor(motion, base, sound) {
    this.motion = motion;
    this.base = base;
    this.sound = sound;
    this.rods = [];
    this.acc = 0;
    this.obstacles = []; // world segments of standing t'an: [{ a, b }] as arrays
    this.up = new THREE.Vector3();
  }

  get busy() {
    return this.rods.length > 0;
  }

  // a, b, velocity in world space. Options: spin (rad/s about a random axis), amber glow.
  spawn(a, b, velocity, { amber = 0, blue = 0, spin = 1.2 } = {}) {
    const axis = tmp.subVectors(b, a).normalize();
    const twist = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .cross(axis).normalize().multiplyScalar(spin * 0.21 * (0.4 + Math.random() * 0.6));
    const va = velocity.clone().add(twist);
    const vb = velocity.clone().sub(twist);
    this.rods.push({
      a: a.clone(),
      b: b.clone(),
      length: a.distanceTo(b),
      pa: a.clone().addScaledVector(va, -STEP),
      pb: b.clone().addScaledVector(vb, -STEP),
      age: 0,
      still: 0,
      amber,
      blue,
      lastClink: -1,
      gone: 0,
      up: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
    });
  }

  clear() {
    this.rods.length = 0;
  }

  update(dt) {
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= STEP) {
      for (const r of this.rods) this.step(r);
      this.acc -= STEP;
    }
    for (let i = this.rods.length - 1; i >= 0; i--) {
      const r = this.rods[i];
      r.age += dt;
      r.amber = Math.max(0, r.amber - dt * 1.2);
      r.blue = Math.max(0, r.blue - dt * 0.8);
      // Below the base, it has fallen into the dark.
      if (r.a.y < -0.6 && r.b.y < -0.6) r.gone += dt;
      if (r.still > REST + FADE || r.gone > FADE || r.age > 12) this.rods.splice(i, 1);
    }
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
    let impact = Math.max(this.collide(r.a, r.pa), this.collide(r.b, r.pb));
    mid.addVectors(r.a, r.b).multiplyScalar(0.5);
    const lift = this.depth(mid);
    if (lift) {
      r.a.addScaledVector(lift.n, lift.d);
      r.b.addScaledVector(lift.n, lift.d);
      r.pa.addScaledVector(lift.n, lift.d * 0.7);
      r.pb.addScaledVector(lift.n, lift.d * 0.7);
    }
    impact = Math.max(impact, this.glance(r));
    const speed = Math.max(r.a.distanceTo(r.pa), r.b.distanceTo(r.pb)) / STEP;
    r.still = speed < 0.06 ? r.still + STEP : Math.max(0, r.still - STEP * 0.5);
    if (impact > 0.4 && r.age - r.lastClink > 0.07) {
      r.lastClink = r.age;
      this.sound?.clink(Math.min(1, impact / 3));
    }
  }

  // How far a world point is inside the stone, and the way out (world).
  depth(p) {
    const m = this.motion;
    m.baseLocal(p, local);
    const rr = Math.hypot(local.x, local.z);
    if (rr >= this.base.radius || local.y < -CLEAR) return null;
    const top = this.base.surface(rr) + CLEAR;
    if (local.y >= top) return null;
    const slope = this.base.slope(rr);
    const n = new THREE.Vector3(rr > 1e-6 ? (-slope * local.x) / rr : 0, 1, rr > 1e-6 ? (-slope * local.z) / rr : 0).normalize();
    let d = (top - local.y) * n.y;
    if (local.y + CLEAR < d) {
      d = local.y + CLEAR;
      n.set(0, -1, 0);
    }
    return { d, n: n.applyQuaternion(m.baseQ) };
  }

  // Keep a particle out of the stone; it bounces a little and slides with the stone's motion.
  collide(x, p) {
    const hit = this.depth(x);
    if (!hit) return 0;
    const v = previous.subVectors(x, p).divideScalar(STEP);
    this.motion.baseVelocity(x, surfaceV);
    v.sub(surfaceV);
    const vn = v.dot(hit.n);
    x.addScaledVector(hit.n, hit.d);
    if (vn < 0) v.addScaledVector(hit.n, -vn * 1.3);
    // Friction along the surface.
    const vnAfter = v.dot(hit.n);
    v.addScaledVector(hit.n, -vnAfter).multiplyScalar(0.82).addScaledVector(hit.n, vnAfter);
    v.add(surfaceV);
    p.copy(x).addScaledVector(v, -STEP);
    return Math.max(0, -vn);
  }

  // Glance off the t'an still standing: a falling one never passes through them.
  glance(r) {
    let impact = 0;
    const a = [r.a.x, r.a.y, r.a.z];
    const b = [r.b.x, r.b.y, r.b.z];
    for (const o of this.obstacles) {
      const c = G.closestSegSeg(a, b, o.a, o.b);
      if (c.d2 >= T * T) continue;
      const d = Math.sqrt(c.d2);
      const n = d > 1e-6 ? G.scale(G.sub(c.c1, c.c2), 1 / d) : G.perpendicular(G.normalize(G.sub(b, a)));
      const push = T - d;
      const wa = 1 - c.s;
      const wb = c.s;
      const k = push / (wa * wa + wb * wb);
      r.a.x += n[0] * wa * k;
      r.a.y += n[1] * wa * k;
      r.a.z += n[2] * wa * k;
      r.b.x += n[0] * wb * k;
      r.b.y += n[1] * wb * k;
      r.b.z += n[2] * wb * k;
      impact = Math.max(impact, push / STEP);
    }
    return impact;
  }

  draw(pool, halos, up) {
    for (const r of this.rods) {
      const fade = Math.max(Math.max(0, Math.min(1, (r.still - REST) / FADE)), Math.min(1, r.gone / FADE));
      if (fade >= 0.999) continue;
      pool.push(r.a, r.b, r.up, r.blue * 0.8, r.amber * 0.8, 1, fade);
      const glow = Math.max(r.blue, r.amber);
      if (glow > 0.02) halos.push(r.a, r.b, glow * 0.35 * (1 - fade), 0.06, r.amber > r.blue ? 1 : 0);
    }
  }
}

function integrate(x, p) {
  previous.copy(x);
  x.x += (x.x - p.x) * 0.998;
  x.y += (x.y - p.y) * 0.998 - GRAVITY * STEP * STEP;
  x.z += (x.z - p.z) * 0.998;
  p.copy(previous);
}
