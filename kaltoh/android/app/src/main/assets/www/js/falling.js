// T'an that have fallen from the structure: each is two particles held a rod's length apart,
// so it tumbles, clatters over the basin and the table, then dissolves back to the tray.
import * as THREE from '../vendor/three.module.min.js';
import { ROD_DEPTH } from './rods.js';

const STEP = 1 / 120;
const GRAVITY = 7.5;
const REST = 2.4; // seconds lying still before dissolving
const FADE = 0.6;

const tmp = new THREE.Vector3();
const mid = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const qInverse = new THREE.Quaternion();
const previous = new THREE.Vector3();

// Verlet step of one particle under gravity with a touch of air drag.
function integrate(x, p) {
  previous.copy(x);
  x.x += (x.x - p.x) * 0.999;
  x.y += (x.y - p.y) * 0.999 - GRAVITY * STEP * STEP;
  x.z += (x.z - p.z) * 0.999;
  p.copy(previous);
}

export class Falling {
  constructor(stage, base, audio) {
    this.stage = stage;
    this.base = base;
    this.audio = audio;
    this.rods = [];
    this.acc = 0;
    this.wa = new THREE.Vector3();
    this.wb = new THREE.Vector3();
  }

  get busy() {
    return this.rods.length > 0;
  }

  // a, b and velocity are in world space.
  spawn(aWorld, bWorld, velocity, options = {}) {
    const root = this.stage.gameRoot;
    root.updateMatrixWorld();
    const a = root.worldToLocal(aWorld.clone());
    const b = root.worldToLocal(bWorld.clone());
    const v = (velocity ? velocity.clone() : new THREE.Vector3()).applyQuaternion(qInverse.copy(root.quaternion).invert());
    // A little twist so it tumbles rather than drops flat.
    const axis = tmp.subVectors(b, a).normalize();
    const twist = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .cross(axis).normalize().multiplyScalar(0.35 + Math.random() * 0.5);
    const va = v.clone().add(twist);
    const vb = v.clone().sub(twist);
    this.rods.push({
      a, b,
      length: a.distanceTo(b),
      pa: a.clone().addScaledVector(va, -STEP),
      pb: b.clone().addScaledVector(vb, -STEP),
      age: 0,
      still: 0,
      amber: options.amber ? 1 : 0,
      life: options.scatter ? REST * 0.6 : REST,
      lastClink: -1,
    });
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
      r.amber = Math.max(0, r.amber - dt * 1.5);
      if (r.still > r.life + FADE || r.age > 9) this.rods.splice(i, 1);
    }
  }

  step(r) {
    integrate(r.a, r.pa);
    integrate(r.b, r.pb);
    // Rigid: keep the rod's length.
    for (let i = 0; i < 2; i++) {
      tmp.subVectors(r.b, r.a);
      const d = tmp.length() || 1e-6;
      tmp.multiplyScalar(((d - r.length) / d) * 0.5);
      r.a.add(tmp);
      r.b.sub(tmp);
    }
    let impact = 0;
    impact = Math.max(impact, this.collide(r.a, r.pa));
    impact = Math.max(impact, this.collide(r.b, r.pb));
    // The middle of the rod rests on the rim too.
    mid.addVectors(r.a, r.b).multiplyScalar(0.5);
    const floor = this.groundAt(mid) + ROD_DEPTH * 0.5;
    if (mid.y < floor) {
      const lift = floor - mid.y;
      r.a.y += lift;
      r.b.y += lift;
      r.pa.y += lift * 0.7;
      r.pb.y += lift * 0.7;
    }
    const speed = Math.max(r.a.distanceTo(r.pa), r.b.distanceTo(r.pb)) / STEP;
    r.still = speed < 0.05 ? r.still + STEP : Math.max(0, r.still - STEP * 0.5);
    if (impact > 0.5 && r.age - r.lastClink > 0.07) {
      r.lastClink = r.age;
      this.audio?.clink(Math.min(1, impact / 3));
    }
  }

  groundAt(p) {
    const r = Math.hypot(p.x, p.z);
    return r < this.base.meta.radius ? this.base.surface(r) : 0;
  }

  // Keep a particle above the surface; returns the impact speed.
  collide(x, p) {
    const floor = this.groundAt(x) + ROD_DEPTH * 0.5;
    if (x.y >= floor) return 0;
    const vy = (x.y - p.y) / STEP;
    x.y = floor;
    p.y = x.y + vy * STEP * 0.32;
    p.x += (x.x - p.x) * 0.3;
    p.z += (x.z - p.z) * 0.3;
    return -vy;
  }

  draw(pool, halos) {
    const root = this.stage.gameRoot;
    for (const r of this.rods) {
      const fade = Math.max(0, Math.min(1, (r.still - r.life) / FADE));
      const width = 1 - fade * fade;
      if (width <= 0.01) continue;
      this.wa.copy(r.a).applyMatrix4(root.matrixWorld);
      this.wb.copy(r.b).applyMatrix4(root.matrixWorld);
      const blue = fade > 0 ? Math.sin(fade * Math.PI) * 0.7 : 0;
      pool.push(this.wa, this.wb, up, blue, r.amber * 0.8, width);
      if (blue > 0.02 || r.amber > 0.02) halos.push(this.wa, this.wb, Math.max(blue, r.amber) * 0.45, 0.07, r.amber > blue ? 1 : 0);
    }
  }
}
