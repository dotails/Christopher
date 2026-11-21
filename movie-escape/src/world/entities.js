import * as THREE from 'three';
import { PhysicsWorld } from './physics.js';
import { mat, glow, boxGeo, Tex } from './materials.js';

const _v = new THREE.Vector3();

// ---------------------------------------------------------------- base
export class Entity {
  constructor() { this.alive = true; }
  fixed(dt, game) {}
  frame(dt, game) {}
}

// ---------------------------------------------------------------- movers
export class Mover extends Entity {
  // Moves a box collider + mesh between two centres.
  constructor(collider, mesh, from, to, period = 4, phase = 0, offZ = 0) {
    super();
    this.c = collider; this.mesh = mesh; this.offZ = offZ;
    this.from = from.clone(); this.to = to.clone();
    this.period = period; this.t = phase * period;
    this.cur = new THREE.Vector3();
  }
  fixed(dt) {
    this.t += dt;
    const k = 0.5 - 0.5 * Math.cos((this.t / this.period) * Math.PI * 2);
    this.cur.lerpVectors(this.from, this.to, k);
    PhysicsWorld.moveBox(this.c, this.cur.x, this.cur.y, this.cur.z + this.offZ);
    this.mesh.position.copy(this.cur);
  }
}

export class Spinner extends Entity {
  // A rotating cylinder platform (turntable). Children of `mesh` rotate with it.
  constructor(collider, mesh, angVel) {
    super();
    this.c = collider; this.mesh = mesh; this.w = angVel; this.a = 0;
  }
  fixed(dt) {
    const da = this.w * dt;
    this.a += da;
    this.c.dAngle = da;
    this.mesh.rotation.y = this.a;
  }
}

export class Sweeper extends Entity {
  // A rotating bar that knocks the player (the signature party-game obstacle).
  constructor(game, parent, { x, z, y0, y1, length, thick = 0.7, w = 1.5, double = true, color = '#ff3b5c', laser = false, phase = 0 }) {
    super();
    Object.assign(this, { x, z, y0, y1, length, thick, w, double });
    this.a = phase;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    const len = double ? length * 2 : length;
    let bar;
    if (laser) {
      bar = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.28, thick * 0.28, len, 10), mat('#ff2a4a', { emissive: '#ff0030', ei: 3 }));
      bar.rotation.z = Math.PI / 2;
      const halo = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.6, thick * 0.6, len, 10, 1, true), glow('#ff3050', 0.35));
      halo.rotation.z = Math.PI / 2; bar.add(halo);
      halo.rotation.z = 0;
    } else {
      bar = new THREE.Mesh(new THREE.CylinderGeometry(thick / 2, thick / 2, len, 14), mat(color, { map: Tex.stripes(color, '#ffffff'), rough: 0.4 }));
      bar.rotation.z = Math.PI / 2;
      bar.castShadow = true;
    }
    bar.position.set(double ? 0 : length / 2, (y0 + y1) / 2, 0);
    this.group.add(bar);
    // hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, y1 + 0.3, 16), mat('#2b1640', { rough: 0.4, metal: 0.3 }));
    hub.position.y = (y1 + 0.3) / 2; hub.castShadow = true;
    this.group.add(hub);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), mat(laser ? '#ff2a4a' : '#ffd23f', { emissive: laser ? '#ff0030' : '#000', ei: 1.5 }));
    cap.position.y = y1 + 0.3; this.group.add(cap);
    parent.add(this.group);
    this.hubCollider = null;
    this.laser = laser;
  }
  fixed(dt, game) {
    this.a += this.w * dt;
    this.group.rotation.y = this.a;
    const pl = game.player;
    if (pl.invuln > 0 || !pl.physicsEnabled) return;
    const p = pl.pos;
    if (p.y >= this.y1 || p.y + pl.height <= this.y0) return;
    const ux = Math.cos(this.a), uz = -Math.sin(this.a);
    const nx = Math.sin(this.a), nz = Math.cos(this.a);
    const dx = p.x - this.x, dz = p.z - this.z;
    const along = dx * ux + dz * uz, side = dx * nx + dz * nz;
    const minA = this.double ? -this.length : 0;
    if (along < minA - pl.radius || along > this.length + pl.radius) return;
    if (Math.abs(side) > this.thick / 2 + pl.radius) return;
    if (Math.abs(along) < 1.0) return; // the hub is solid instead
    let dir = -Math.sign(this.w * along) || Math.sign(side) || 1;
    if (this.laser) game.audio.sfx('laser');
    pl.knock(nx * dir, nz * dir, 12 + Math.abs(this.w) * 2, 8);
  }
}

// ---------------------------------------------------------------- triggers
const beaconGeo = new THREE.CylinderGeometry(0.5, 0.9, 1, 16, 1, true);
export function makeBeacon(color, h = 14) {
  const m = new THREE.Mesh(beaconGeo, glow(color, 0.16));
  m.scale.set(1, h, 1); m.position.y = h / 2;
  m.renderOrder = 5;
  return m;
}

export class Pickup extends Entity {
  constructor(game, parent, mesh, pos, onCollect, { radius = 1.4, bob = true, beacon = '#ffd23f', spin = 2 } = {}) {
    super();
    this.game = game;
    this.holder = new THREE.Group();
    this.holder.position.copy(pos);
    this.mesh = mesh; this.holder.add(mesh);
    parent.add(this.holder);
    this.onCollect = onCollect;
    this.radius = radius; this.bobAmt = bob ? 0.25 : 0; this.spin = spin;
    this.t = Math.random() * 6;
    this.collected = false;
    this.world = new THREE.Vector3();
    if (beacon) { this.beacon = makeBeacon(beacon); this.beacon.position.y -= 1; this.holder.add(this.beacon); }
  }
  getPos() { return this.holder.getWorldPosition(this.world); }
  isDone() { return this.collected; }
  setCollected(silent = true) {
    this.collected = true; this.holder.visible = false;
    if (!silent && this.onCollect) this.onCollect(this);
  }
  frame(dt, game) {
    if (this.collected) return;
    this.t += dt;
    this.mesh.rotation.y += this.spin * dt;
    this.mesh.position.y = Math.sin(this.t * 3) * this.bobAmt;
    if (this.beacon) this.beacon.material.opacity = 0.12 + Math.sin(this.t * 4) * 0.04;
    const p = this.getPos();
    const pl = game.player;
    if (!pl.physicsEnabled) return;
    const cy = THREE.MathUtils.clamp(p.y, pl.pos.y + 0.3, pl.pos.y + pl.height);
    _v.set(pl.pos.x, cy, pl.pos.z);
    if (_v.distanceTo(p) < this.radius) {
      this.collected = true;
      this.holder.visible = false;
      game.fx.burst(p, ['#ffd23f', '#ffffff', '#ff4f9a'], 18, 7);
      game.fx.ring(p, '#ffd23f', 3, 0.4);
      if (this.onCollect) this.onCollect(this);
    }
  }
}

export class Plate extends Entity {
  constructor(game, room, x, z, y, onPress, { color = '#ff4f9a', r = 1.3 } = {}) {
    super();
    this.game = game;
    this.group = new THREE.Group(); this.group.position.set(x, y, z);
    room.group.add(this.group);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.25, r + 0.4, 0.18, 24), mat('#2b1640', { rough: 0.5 }));
    base.position.y = 0.09; base.receiveShadow = true;
    this.top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 24), mat(color, { emissive: color, ei: 0.35, rough: 0.3 }));
    this.top.position.y = 0.2;
    this.group.add(base, this.top);
    this.beacon = makeBeacon(color, 10); this.group.add(this.beacon);
    const wx = x, wz = room.cz + z;
    this.collider = game.world.addBox(room.key, wx - r, room.y + y - 1, wz - r, wx + r, room.y + y + 0.25, wz + r);
    this.pressed = false; this.onPress = onPress; this.color = color;
    this.pos = new THREE.Vector3(wx, y + 0.5, wz);
    this.t = 0;
  }
  getPos() { return this.pos; }
  isDone() { return this.pressed; }
  setPressed() {
    this.pressed = true;
    this.top.material = mat('#4cd964', { emissive: '#4cd964', ei: 0.9, rough: 0.3 });
    this.top.position.y = 0.12;
    this.beacon.visible = false;
  }
  frame(dt, game) {
    this.t += dt;
    if (this.pressed) return;
    this.top.material.emissiveIntensity = 0.3 + Math.sin(this.t * 5) * 0.2;
    const pl = game.player;
    if (pl.grounded && pl.ground === this.collider) {
      this.setPressed();
      game.fx.ring(this.pos.clone().setY(this.pos.y - 0.3), '#4cd964', 4, 0.5);
      game.fx.burst(this.pos, ['#4cd964', '#ffffff'], 14, 6);
      this.onPress && this.onPress(this);
    }
  }
}

export class JumpPad extends Entity {
  constructor(game, room, x, z, y = 0, power = 22, color = '#27d3c3') {
    super();
    this.group = new THREE.Group(); this.group.position.set(x, y, z);
    room.group.add(this.group);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.3, 24), mat('#2b1640'));
    base.position.y = 0.15;
    this.top = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.25, 24), mat(color, { emissive: color, ei: 0.6, map: Tex.dots(color, '#ffffff') }));
    this.top.position.y = 0.38;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 4), glow(color, 0.5));
    arrow.position.y = 1.5; this.arrow = arrow;
    this.group.add(base, this.top, arrow);
    const wz = room.cz + z;
    this.collider = game.world.addBox(room.key, x - 1.4, room.y + y - 0.5, wz - 1.4, x + 1.4, room.y + y + 0.45, wz + 1.4, {
      onLand: (pl) => { pl.bounce(power); game.audio.sfx('bounce'); this.squish = 1; game.fx.ring(new THREE.Vector3(x, y + 0.5, wz), color, 3, 0.4); },
    });
    this.squish = 0; this.t = 0;
  }
  frame(dt) {
    this.t += dt;
    this.squish = Math.max(0, this.squish - dt * 4);
    this.top.scale.y = 1 - this.squish * 0.6 + Math.sin(this.t * 6) * 0.05;
    this.arrow.position.y = 1.4 + Math.sin(this.t * 4) * 0.25;
    this.arrow.rotation.y += dt * 2;
  }
}

export class Zone extends Entity {
  // Fires once when the player stands inside (optionally while carrying something)
  constructor(game, pos, radius, onEnter, { needCarry = null, height = 4, marker = null } = {}) {
    super();
    this.pos = pos.clone(); this.radius = radius; this.onEnter = onEnter; this.needCarry = needCarry; this.height = height;
    this.done = false; this.enabled = true; this.marker = marker;
  }
  getPos() { return this.pos; }
  isDone() { return this.done; }
  frame(dt, game) {
    if (this.done || !this.enabled) return;
    const pl = game.player;
    if (this.needCarry && pl.carry !== this.needCarry.mesh) return;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    if (dx * dx + dz * dz < this.radius * this.radius && pl.pos.y > this.pos.y - 1 && pl.pos.y < this.pos.y + this.height) {
      this.done = true;
      this.onEnter && this.onEnter(this);
    }
  }
}

export class Carryable extends Entity {
  constructor(game, parent, mesh, pos, onPick) {
    super();
    this.game = game; this.parent = parent;
    this.mesh = mesh; this.home = pos.clone();
    mesh.position.copy(pos); parent.add(mesh);
    this.beacon = makeBeacon('#ffd23f'); this.beacon.position.y -= 1; mesh.add(this.beacon);
    this.state = 'home'; this.onPick = onPick; this.t = 0;
    this.world = new THREE.Vector3();
  }
  getPos() { return this.mesh.getWorldPosition(this.world); }
  isDone() { return this.state !== 'home'; }
  reset() {
    if (this.state !== 'carried') return;
    this.state = 'home';
    this.game.player.carry = null;
    this.game.scene.remove(this.mesh);
    this.parent.add(this.mesh); this.mesh.position.copy(this.home); this.mesh.rotation.set(0, 0, 0);
    this.beacon.visible = true;
  }
  deliver() {
    this.state = 'delivered';
    this.game.player.carry = null;
    this.mesh.visible = false;
  }
  frame(dt, game) {
    this.t += dt;
    if (this.state === 'home') {
      this.mesh.rotation.y += dt * 1.5;
      const p = this.getPos(), pl = game.player;
      if (pl.carry || !pl.physicsEnabled) return;
      if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < 1.5 && Math.abs(pl.pos.y + 1 - p.y) < 2) {
        this.state = 'carried';
        this.parent.remove(this.mesh); game.scene.add(this.mesh);
        pl.carry = this.mesh; this.beacon.visible = false;
        game.audio.sfx('collect');
        this.onPick && this.onPick(this);
      }
    }
  }
}

// ---------------------------------------------------------------- hazards
export class BoulderLane extends Entity {
  constructor(game, room, { x, z0, z1, y = 0, r = 1.4, speed = 9, interval = 2.4 }) {
    super();
    Object.assign(this, { x, z0: room.cz + z0, z1: room.cz + z1, y: room.y + y, r, speed, interval });
    this.group = room.group; this.game = game;
    this.list = []; this.timer = 0.5;
    this.geo = new THREE.IcosahedronGeometry(r, 1);
    this.mat = mat('#8a7a66', { map: Tex.stone('#9b8a72'), flat: true, rough: 0.9 });
    this.dir = Math.sign(this.z1 - this.z0);
    this.room = room;
  }
  fixed(dt, game) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval;
      const m = new THREE.Mesh(this.geo, this.mat); m.castShadow = true;
      m.position.set(this.x, this.y + this.r, this.z0);
      game.scene.add(m);
      this.list.push({ m, vy: 0, falling: false });
    }
    const pl = game.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.m.position.z += this.dir * this.speed * dt;
      b.m.rotation.x += this.dir * this.speed / this.r * dt;
      const past = this.dir > 0 ? b.m.position.z > this.z1 : b.m.position.z < this.z1;
      if (past) { b.vy -= 30 * dt; b.m.position.y += b.vy * dt; }
      if (b.m.position.y < this.y - 12) { game.scene.remove(b.m); this.list.splice(i, 1); continue; }
      // hit test: sphere vs vertical segment
      const cy = THREE.MathUtils.clamp(b.m.position.y, pl.pos.y + 0.4, pl.pos.y + pl.height - 0.4);
      const dx = pl.pos.x - b.m.position.x, dz = pl.pos.z - b.m.position.z, dy = cy - b.m.position.y;
      if (dx * dx + dy * dy + dz * dz < (this.r + pl.radius) ** 2) {
        pl.knock(dx * 0.6, this.dir * 1, 15, 9);
      }
    }
  }
  clear(game) { this.list.forEach((b) => game.scene.remove(b.m)); this.list = []; }
}

export class FlameJet extends Entity {
  constructor(game, room, x, z, { period = 3.6, phase = 0, y = 0 } = {}) {
    super();
    this.x = x; this.z = room.cz + z; this.y = y; this.period = period; this.t = phase * period;
    this.group = new THREE.Group(); this.group.position.set(x, y, z); room.group.add(this.group);
    const grate = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.12, 16), mat('#2a2222', { metal: 0.6, rough: 0.4, emissive: '#ff3300', ei: 0 }));
    grate.position.y = 0.06; this.grate = grate;
    this.fire = new THREE.Mesh(new THREE.ConeGeometry(1, 5, 14, 1, true), glow('#ff7a1a', 0.75));
    this.fire.position.y = 2.5; this.fire.rotation.x = Math.PI;
    this.core = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4, 10, 1, true), glow('#ffe066', 0.9));
    this.core.position.y = 2; this.core.rotation.x = Math.PI;
    this.group.add(grate, this.fire, this.core);
    this.active = true;
  }
  fixed(dt, game) {
    if (!this.active) { this.fire.visible = this.core.visible = false; return; }
    this.t += dt;
    const k = (this.t % this.period) / this.period;
    const warn = k > 0.45 && k < 0.65, on = k >= 0.65 && k < 0.92;
    this.grate.material.emissiveIntensity = warn ? 1.5 + Math.sin(this.t * 40) : (on ? 2 : 0);
    this.fire.visible = this.core.visible = on;
    if (on) {
      const s = 0.8 + Math.sin(this.t * 50) * 0.15;
      this.fire.scale.set(s, 1, s); this.core.scale.set(s, 1 + Math.sin(this.t * 37) * 0.1, s);
      if (!this.wasOn) game.audio.sfx('fireball');
      const pl = game.player;
      const dx = pl.pos.x - this.x, dz = pl.pos.z - this.z;
      if (dx * dx + dz * dz < 1.6 * 1.6 && pl.pos.y < this.y + 5) pl.knock(dx || 0.1, dz || 0.1, 9, 14);
    }
    this.wasOn = on;
  }
}

// ---------------------------------------------------------------- doors
export class Door extends Entity {
  // style: 'slide' (rises into the ceiling), 'vault' (rolls aside), 'prop' (falls flat)
  constructor(game, room, mesh, collider, style = 'slide') {
    super();
    this.mesh = mesh; this.collider = collider; this.style = style;
    this.open = false; this.k = 0; this.speed = 0.5;
    this.base = mesh.position.clone(); this.baseRot = mesh.rotation.clone();
  }
  doOpen(instant = false) {
    if (this.open) return;
    this.open = true;
    if (this.collider && this.style !== 'prop') this.collider.enabled = false;
    if (instant) { this.k = 1; this.apply(); }
  }
  apply() {
    const e = this.k < 1 ? 1 - Math.pow(1 - this.k, 3) : 1;
    if (this.style === 'slide') this.mesh.position.y = this.base.y + e * 10;
    else if (this.style === 'vault') { this.mesh.position.x = this.base.x + e * 8.5; this.mesh.rotation.z = this.baseRot.z - e * 3.5; }
    else if (this.style === 'prop') { const b = this.k < 1 ? Math.pow(this.k, 2.2) : 1; this.mesh.rotation.x = this.baseRot.x + b * Math.PI / 2; }
  }
  frame(dt) {
    if (!this.open || this.k >= 1) return;
    this.k = Math.min(1, this.k + dt * this.speed);
    this.apply();
  }
}
