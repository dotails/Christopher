import * as THREE from 'three';
import { mat, basic } from './materials.js';

const TAU = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
function angleLerp(a, b, t) {
  let d = ((b - a) % TAU + TAU * 1.5) % TAU - TAU * 0.5;
  return a + d * Math.min(1, t);
}

let blobTex = null;
function getBlobTex() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

// Builds a jellybean character. Returns handles for animation.
export function makeBean(color = '#ff4f9a', { bandana = true, scale = 1 } = {}) {
  const group = new THREE.Group();
  const squash = new THREE.Group(); group.add(squash);
  const pivot = new THREE.Group(); pivot.position.y = 0.95; squash.add(pivot);

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.0 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.72, 8, 18), bodyMat);
  body.castShadow = true; pivot.add(body);

  // face plate
  const face = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat('#ffe2c6', { rough: 0.5 }));
  face.scale.set(0.4, 0.3, 0.2); face.position.set(0, 0.34, 0.43);
  pivot.add(face);
  const eyeGeo = new THREE.SphereGeometry(0.075, 12, 10);
  const eyeMat = basic('#1b1026');
  const eyes = new THREE.Group(); eyes.position.set(0, 0.37, 0.6); pivot.add(eyes);
  const hiGeo = new THREE.SphereGeometry(0.025, 8, 6);
  [-0.13, 0.13].forEach((x) => {
    const e = new THREE.Mesh(eyeGeo, eyeMat); e.scale.set(0.85, 1.25, 0.6); e.position.x = x; eyes.add(e);
    const h = new THREE.Mesh(hiGeo, basic('#ffffff')); h.position.set(x + 0.025, 0.04, 0.04); eyes.add(h);
  });
  // little smile
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 12, Math.PI), eyeMat);
  smile.position.set(0, 0.24, 0.62); smile.rotation.z = Math.PI; pivot.add(smile);

  let tails = null;
  if (bandana) {
    const bmat = mat('#e0213b', { rough: 0.6 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.555, 0.07, 8, 28), bmat);
    band.rotation.x = Math.PI / 2; band.position.y = 0.6; band.scale.set(1, 1, 1.4);
    pivot.add(band);
    tails = new THREE.Group(); tails.position.set(0, 0.6, -0.55); pivot.add(tails);
    [-0.6, 0.5].forEach((a, i) => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.45), bmat);
      t.geometry.translate(0, 0, -0.22);
      t.rotation.set(-0.3, a * 0.5, 0); t.userData.base = a; t.position.x = i ? 0.05 : -0.05;
      tails.add(t);
    });
  }

  const limbMat = bodyMat;
  const armGeo = new THREE.CapsuleGeometry(0.13, 0.32, 4, 10); armGeo.translate(0, -0.2, 0);
  const legGeo = new THREE.CapsuleGeometry(0.16, 0.2, 4, 10); legGeo.translate(0, -0.18, 0);
  const armL = new THREE.Mesh(armGeo, limbMat); armL.position.set(0.56, 0.05, 0); armL.castShadow = true;
  const armR = new THREE.Mesh(armGeo, limbMat); armR.position.set(-0.56, 0.05, 0); armR.castShadow = true;
  const legL = new THREE.Mesh(legGeo, limbMat); legL.position.set(0.24, -0.62, 0); legL.castShadow = true;
  const legR = new THREE.Mesh(legGeo, limbMat); legR.position.set(-0.24, -0.62, 0); legR.castShadow = true;
  pivot.add(armL, armR, legL, legR);

  group.scale.setScalar(scale);
  return { group, squash, pivot, body, bodyMat, eyes, armL, armR, legL, legR, tails, face };
}

export class Player {
  constructor(game) {
    this.game = game;
    this.bean = makeBean(game.settings.color);
    this.group = this.bean.group;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = 0.5;
    this.height = 1.85;
    this.facing = Math.PI;
    this.targetFacing = Math.PI;
    this.state = 'normal'; // normal | dive | slide | stun
    this.stateT = 0;
    this.grounded = false; this.wasGrounded = false;
    this.ground = null;
    this.coyote = 0; this.jumpBuf = 0;
    this.prevY = 0;
    this.invuln = 0;
    this.canDive = true;
    this.controlEnabled = true;
    this.physicsEnabled = true;
    this.pose = 'auto'; // auto | sit | fly
    this.carry = null;
    this.airTime = 0;
    this.lastLandSpeed = 0;
    // anim state
    this.walkPhase = 0; this.sq = 0; this.sqV = 0; this.blinkT = 2; this.spin = 0; this.time = 0;
    this.stepT = 0;

    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshBasicMaterial({ map: getBlobTex(), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 2;
    game.scene.add(this.group, this.blob);
  }

  setColor(c) {
    this.bean.bodyMat.color.set(c);
  }

  spawn(p, facing = Math.PI) {
    this.pos.copy(p); this.vel.set(0, 0, 0);
    this.prevY = p.y;
    this.facing = this.targetFacing = facing;
    this.state = 'normal'; this.stateT = 0; this.invuln = 0.5;
    this.ground = null; this.grounded = false;
    this.spin = 0;
    this.sync();
  }

  knock(dx, dz, power = 13, up = 8) {
    if (this.invuln > 0 || !this.physicsEnabled) return false;
    const l = Math.hypot(dx, dz) || 1;
    this.vel.x = dx / l * power; this.vel.z = dz / l * power; this.vel.y = up;
    this.state = 'stun'; this.stateT = 0.85; this.invuln = 1.1;
    this.grounded = false; this.ground = null;
    this.game.audio.sfx('hit');
    this.game.shake(0.35);
    this.game.fx.burst(this.pos.clone().setY(this.pos.y + 1.2), '#ffffff', 10, 5);
    return true;
  }

  bounce(v) {
    this.vel.y = v; this.grounded = false; this.ground = null; this.coyote = 0;
    this.state = 'normal'; this.canDive = true;
    this.sq = 0.35; this.sqV = 0;
  }

  // One physics substep.
  step(dt, ctx) {
    if (!this.physicsEnabled) return;
    const v = this.vel, p = this.pos;
    this.invuln = Math.max(0, this.invuln - dt);
    this.coyote -= dt; this.jumpBuf -= dt; this.stateT -= dt;

    // ride moving / rotating ground
    const g = this.ground;
    if (g) {
      if (g.delta) { p.x += g.delta.x; p.y += g.delta.y; p.z += g.delta.z; }
      if (g.dAngle) {
        const dx = p.x - g.x, dz = p.z - g.z;
        const c = Math.cos(g.dAngle), s = Math.sin(g.dAngle);
        p.x = g.x + dx * c + dz * s; p.z = g.z - dx * s + dz * c;
        this.facing += g.dAngle; this.targetFacing += g.dAngle;
      }
    }

    const md = ctx.moveDir; // world-space desired direction (len 0..1)
    const control = this.controlEnabled;
    const maxSpeed = 8.6;

    if (this.state === 'normal') {
      const tx = control ? md.x * maxSpeed : 0, tz = control ? md.z * maxSpeed : 0;
      const accel = this.grounded ? (md.lengthSq() > 0.01 ? 60 : 42) : 22;
      const dvx = tx - v.x, dvz = tz - v.z;
      const dl = Math.hypot(dvx, dvz), maxd = accel * dt;
      if (dl > maxd) { v.x += dvx / dl * maxd; v.z += dvz / dl * maxd; } else { v.x = tx; v.z = tz; }
      if (control && md.lengthSq() > 0.01) this.targetFacing = Math.atan2(md.x, md.z);

      if (control && ctx.jump) this.jumpBuf = 0.14;
      if (this.jumpBuf > 0 && this.coyote > 0) {
        v.y = ctx.jumpV; this.jumpBuf = 0; this.coyote = 0; this.grounded = false; this.ground = null;
        this.sq = -0.28; this.sqV = 0;
        this.game.audio.sfx('jump', { pitch: 0.95 + Math.random() * 0.1 });
        this.game.fx.puff(p, 5);
        this.game.stats.jumps++;
      }
      if (control && ctx.dive && this.canDive) {
        this.state = 'dive'; this.stateT = 2;
        const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
        const sp = Math.max(13, Math.hypot(v.x, v.z) + 3);
        v.x = fx * sp; v.z = fz * sp;
        v.y = this.grounded ? 6.5 : Math.max(v.y + 2, 4);
        this.grounded = false; this.ground = null; this.canDive = false; this.coyote = 0;
        this.game.audio.sfx('dive');
      }
    } else if (this.state === 'dive') {
      if (control) { v.x += md.x * 6 * dt; v.z += md.z * 6 * dt; }
    } else if (this.state === 'slide' || this.state === 'stun') {
      const f = this.grounded ? (this.state === 'slide' ? 14 : 10) : 0.6;
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) { const ns = Math.max(0, sp - f * dt); v.x *= ns / sp; v.z *= ns / sp; }
      if (this.stateT <= 0 && this.grounded) { this.state = 'normal'; }
      if (this.state === 'stun' && this.stateT < -2.5) this.state = 'normal';
    }

    // gravity (short hop if jump released early)
    let grav = ctx.gravity;
    if (this.state === 'normal' && v.y > 0 && !ctx.jumpHeld) grav *= 1.9;
    v.y -= grav * dt;
    if (v.y < -42) v.y = -42;

    this.prevY = p.y;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;

    this.wallHit = false;
    const res = ctx.world.resolve(this);
    const landedNow = res.grounded && !this.wasGrounded;
    this.grounded = res.grounded; this.ground = res.ground;

    if (this.grounded) {
      this.coyote = 0.11;
      this.canDive = true;
      if (landedNow) {
        const impact = Math.min(1, this.airTime / 0.9);
        if (this.airTime > 0.12) {
          this.sq = 0.22 + impact * 0.2; this.sqV = 0;
          this.game.audio.sfx('land', { v: 0.4 + impact });
          if (impact > 0.35) this.game.fx.puff(p, 6 + Math.floor(impact * 6));
        }
        if (this.state === 'dive') { this.state = 'slide'; this.stateT = 0.42; this.game.fx.puff(p, 8); }
        const gr = this.ground;
        if (gr && gr.onLand) gr.onLand(this);
      }
      this.airTime = 0;
    } else {
      this.airTime += dt;
    }
    this.wasGrounded = this.grounded;
  }

  sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;
  }

  // Visual animation, once per frame.
  animate(dt) {
    const b = this.bean;
    this.time += dt;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.state === 'normal' || this.pose !== 'auto') this.facing = angleLerp(this.facing, this.targetFacing, dt * 14);
    this.sync();

    // squash & stretch spring
    this.sqV += (-this.sq * 260 - this.sqV * 16) * dt;
    this.sq += this.sqV * dt;
    const sy = 1 - this.sq, sxz = 1 + this.sq * 0.6;
    b.squash.scale.set(sxz, sy, sxz);

    const k = Math.min(1, speed / 8.6);
    let leanX = 0, rollZ = 0, armSwing = 0, legSwing = 0, armRaise = 0.25, pivotY = 0.95, legTuck = 0;

    if (this.pose === 'sit') {
      b.legL.rotation.x = b.legR.rotation.x = -1.45;
      b.armL.rotation.set(-0.6, 0, 0.3); b.armR.rotation.set(-0.9, 0, -0.3);
      b.pivot.rotation.set(-0.12, 0, 0); b.pivot.position.y = 0.95;
      this._blink(dt); this._tails(dt, 0.2);
      this._placeBlob();
      return;
    }
    if (this.pose === 'fly') {
      this.spin += dt * 6;
      b.pivot.rotation.set(Math.sin(this.time * 7) * 0.5, this.spin, Math.cos(this.time * 5) * 0.6);
      b.armL.rotation.set(0, 0, 2.6); b.armR.rotation.set(0, 0, -2.6);
      b.legL.rotation.x = 0.6; b.legR.rotation.x = -0.6;
      this._tails(dt, 1);
      this.blob.visible = false;
      return;
    }

    if (this.state === 'dive' || this.state === 'slide') {
      leanX = 1.45; pivotY = 0.6; armRaise = 2.9; legSwing = 0;
    } else if (this.state === 'stun') {
      this.spin += dt * 14;
      b.pivot.rotation.set(Math.sin(this.spin) * 0.9, 0, Math.cos(this.spin * 0.7) * 0.9);
      b.armL.rotation.set(0, 0, 1.6 + Math.sin(this.time * 20) * 0.5); b.armR.rotation.set(0, 0, -1.6 - Math.sin(this.time * 20) * 0.5);
      this._tails(dt, 1); this._placeBlob(); this._carry();
      return;
    } else if (!this.grounded) {
      armRaise = this.vel.y > 0 ? 2.5 : 1.9;
      legTuck = this.vel.y > 0 ? 0.5 : -0.2;
      leanX = k * 0.25;
    } else {
      this.walkPhase += dt * (4 + speed * 1.45);
      armSwing = Math.sin(this.walkPhase) * 0.9 * k;
      legSwing = Math.sin(this.walkPhase) * 0.85 * k;
      leanX = k * 0.2;
      pivotY = 0.95 + Math.abs(Math.cos(this.walkPhase)) * 0.08 * k;
      rollZ = Math.sin(this.walkPhase) * 0.06 * k;
      if (k > 0.3) {
        this.stepT -= dt * (speed / 2.2);
        if (this.stepT <= 0) { this.stepT = 1; this.game.audio.sfx('step'); }
      }
      // idle breathe
      if (k < 0.05) { pivotY += Math.sin(this.time * 2.5) * 0.02; armRaise = 0.2 + Math.sin(this.time * 2.5) * 0.05; }
    }
    b.pivot.rotation.x = lerp(b.pivot.rotation.x, leanX, Math.min(1, dt * 12));
    b.pivot.rotation.y = 0;
    b.pivot.rotation.z = lerp(b.pivot.rotation.z, rollZ, Math.min(1, dt * 10));
    b.pivot.position.y = lerp(b.pivot.position.y, pivotY, Math.min(1, dt * 12));
    b.armL.rotation.set(armSwing, 0, armRaise);
    b.armR.rotation.set(-armSwing, 0, -armRaise);
    b.legL.rotation.x = -legSwing - legTuck;
    b.legR.rotation.x = legSwing - legTuck;
    if (this.carry) { b.armL.rotation.set(0, 0, 2.7); b.armR.rotation.set(0, 0, -2.7); }

    this._blink(dt);
    this._tails(dt, 0.3 + k * 0.7 + (this.grounded ? 0 : 0.6));
    this._placeBlob();
    this._carry();
  }

  _carry() {
    if (!this.carry) return;
    const c = this.carry;
    c.position.set(this.pos.x, this.pos.y + 2.35 * (1 - this.sq * 0.5), this.pos.z);
    c.rotation.y = this.facing;
  }

  _blink(dt) {
    this.blinkT -= dt;
    const e = this.bean.eyes;
    if (this.blinkT < 0) { e.scale.y = 0.1; if (this.blinkT < -0.1) { this.blinkT = 2 + Math.random() * 3; } }
    else e.scale.y = 1;
  }

  _tails(dt, amt) {
    const t = this.bean.tails; if (!t) return;
    t.children.forEach((c, i) => {
      c.rotation.x = -0.3 - amt * 0.6 + Math.sin(this.time * 14 + i * 2) * 0.25 * amt;
      c.rotation.y = c.userData.base * 0.5 + Math.sin(this.time * 9 + i) * 0.2 * amt;
    });
  }

  _placeBlob() {
    const gy = this.game.world.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.3);
    if (gy === -Infinity || this.pos.y - gy > 30) { this.blob.visible = false; return; }
    this.blob.visible = true;
    const h = this.pos.y - gy;
    this.blob.position.set(this.pos.x, gy + 0.03, this.pos.z);
    const s = Math.max(0.35, 1 - h * 0.06);
    this.blob.scale.setScalar(s);
    this.blob.material.opacity = Math.max(0.25, 1 - h * 0.05);
  }
}
