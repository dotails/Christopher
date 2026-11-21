import * as THREE from 'three';
import { mat, glow, Tex, basic } from './materials.js';
import { makeScript } from './props.js';

const ARENA_R = 10.4;

// THE REEL MONSTER — a jelly beast made of old film. Make it charge into the
// arena wall, then stomp the glowing spot on its head while it's dizzy.
export class Boss {
  constructor(game, room) {
    this.game = game; this.room = room;
    this.center = new THREE.Vector3(0, 0, room.cz);
    this.hp = 3; this.maxHp = 3;
    this.state = 'hidden'; this.t = 0; this.phase = 1;
    this.pos = new THREE.Vector3(16, -9, room.cz - 8);
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.dir = new THREE.Vector3();
    this.rings = []; this.balls = [];
    this.attackIdx = 0;
    this.squash = 1; this.flash = 0;
    this.active = false;
    this._build();
    this.collider = game.world.addCyl(room.key, this.pos.x, this.pos.z, 2.6, 0, 5.6, { enabled: false });
  }

  _build() {
    const g = this.group = new THREE.Group();
    this.body = new THREE.Group(); g.add(this.body);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: '#5b2a8a', roughness: 0.28, metalness: 0.05, emissive: '#000000' });
    const blob = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 26), this.bodyMat);
    blob.scale.set(2.6, 2.9, 2.6); blob.position.y = 2.9; blob.castShadow = true; this.body.add(blob);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), mat('#a77be0', { rough: 0.4 }));
    belly.scale.set(1.8, 1.9, 1.2); belly.position.set(0, 2.2, 1.65); this.body.add(belly);
    // film-reel eyes
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.3, 24), mat('#e8e2d0', { rough: 0.4 }));
      disc.rotation.x = Math.PI / 2; eye.add(disc);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        const h = new THREE.Mesh(new THREE.CircleGeometry(0.14, 10), basic('#2b1640'));
        h.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.16); eye.add(h);
      }
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat('#ff2a2a', { emissive: '#ff0000', ei: 2 }));
      pupil.position.z = 0.2; eye.add(pupil);
      eye.position.set(s * 1.0, 4.0, 2.05); eye.rotation.y = s * 0.25;
      this.body.add(eye); this.eyes.push(eye);
    }
    this.pupilMat = this.eyes[0].children[this.eyes[0].children.length - 1].material;
    // mouth + teeth
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), basic('#1b0a20'));
    mouth.scale.set(1.3, 0.7, 0.6); mouth.position.set(0, 3.0, 2.15); mouth.rotation.x = -0.3; this.body.add(mouth);
    const toothM = mat('#fff6e3');
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), toothM);
      t.position.set(-1.0 + i * 0.4, 2.95, 2.55); t.rotation.x = Math.PI; this.body.add(t);
    }
    // the script held in its teeth
    this.script = makeScript(); this.script.scale.setScalar(0.9);
    this.script.position.set(0.4, 2.55, 2.75); this.script.rotation.set(-0.3, 0.2, 0.25);
    this.body.add(this.script);
    // horns, arms, feet
    const hornM = mat('#ffd23f', { rough: 0.4 });
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 10), hornM);
      h.position.set(s * 1.3, 5.6, 0.2); h.rotation.z = -s * 0.5; this.body.add(h);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.3, 6, 12), this.bodyMat);
      arm.position.set(s * 2.7, 2.6, 0.4); arm.rotation.z = s * 0.7; arm.castShadow = true; this.body.add(arm);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.6, 14), mat('#3a1a5a'));
      foot.position.set(s * 1.2, 0.3, 0.3); this.body.add(foot);
    }
    this.arms = this.body.children.filter((c) => c.geometry && c.geometry.type === 'CapsuleGeometry');
    // film-strip tentacles on its back
    this.strips = [];
    const filmM = new THREE.MeshStandardMaterial({ map: Tex.film(), side: THREE.DoubleSide, roughness: 0.6 });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3.2, 1, 6), filmM);
      s.geometry.translate(0, -1.6, 0);
      s.position.set(-1.6 + i * 0.8, 4.6, -2.1); s.rotation.x = 0.5;
      this.body.add(s); this.strips.push(s);
    }
    // weak spot + dizzy stars
    this.weak = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.2, 24), mat('#ffd23f', { emissive: '#ffb000', ei: 2.5 }));
    this.weak.position.y = 5.75; this.weak.visible = false; this.body.add(this.weak);
    this.weakGlow = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.2, 3, 20, 1, true), glow('#ffd23f', 0.35));
    this.weakGlow.position.y = 7.3; this.weakGlow.rotation.x = Math.PI; this.weakGlow.visible = false; this.body.add(this.weakGlow);
    this.stars = new THREE.Group(); this.stars.visible = false; g.add(this.stars);
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), mat('#ffd23f', { emissive: '#ffd23f', ei: 2 }));
      const a = i / 5 * Math.PI * 2; s.position.set(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2);
      this.stars.add(s);
    }
    this.group.visible = false;
    this.game.scene.add(g);

    this.ringGeo = new THREE.CylinderGeometry(1, 1, 0.7, 64, 1, true);
    this.ballGeo = new THREE.SphereGeometry(0.7, 14, 10);
  }

  // ---------------- cinematic entrance ----------------
  appear() {
    this.group.visible = true;
    this.state = 'rise'; this.t = 0;
    this.pos.set(16, -9, this.room.cz - 8);
    this.game.audio.sfx('rumble');
  }

  startFight() {
    this.active = true;
    this.state = 'idle'; this.t = 0;
    this.collider.enabled = true;
  }

  // ---------------- update ----------------
  fixed(dt) {
    if (this.state === 'hidden' || this.state === 'gone') return;
    const game = this.game, pl = game.player;
    this.t += dt;
    const toP = new THREE.Vector3(pl.pos.x - this.pos.x, 0, pl.pos.z - this.pos.z);
    const distP = toP.length();
    const prevX = this.pos.x, prevZ = this.pos.z;
    let targetSquash = 1;

    switch (this.state) {
      case 'rise': {
        const k = Math.min(1, this.t / 2.2);
        this.pos.y = -9 + k * 9 - Math.sin(this.t * 30) * 0.1 * (1 - k);
        this.facing = Math.atan2(-this.pos.x, -(this.pos.z - this.room.cz));
        if (Math.random() < 0.4) game.fx.burst(new THREE.Vector3(this.pos.x + (Math.random() - 0.5) * 5, -0.5, this.pos.z + (Math.random() - 0.5) * 5), ['#ff7a1a', '#ffd23f'], 2, 6);
        if (k >= 1 && this.t > 3.6) { this.state = 'leap'; this.t = 0; this.from = this.pos.clone(); game.audio.sfx('roar'); }
        break;
      }
      case 'leap': {
        const k = Math.min(1, this.t / 1.2);
        this.pos.x = THREE.MathUtils.lerp(this.from.x, this.center.x, k);
        this.pos.z = THREE.MathUtils.lerp(this.from.z, this.center.z - 2, k);
        this.pos.y = Math.sin(k * Math.PI) * 9;
        targetSquash = 1.15;
        if (k >= 1) { this.pos.y = 0; this._land(false); this.state = 'intro-idle'; this.t = 0; }
        break;
      }
      case 'intro-idle':
        this.facing = this._lerpAngle(this.facing, Math.atan2(toP.x, toP.z), dt * 4);
        break;
      case 'idle': {
        this.facing = this._lerpAngle(this.facing, Math.atan2(toP.x, toP.z), dt * 5);
        if (distP > 4) { const sp = 2.2 + this.phase * 0.6; this.pos.x += toP.x / distP * sp * dt; this.pos.z += toP.z / distP * sp * dt; }
        const wait = [0, 1.6, 1.2, 0.9][this.phase];
        if (this.t > wait) this._nextAttack();
        break;
      }
      case 'windup':
        this.facing = this._lerpAngle(this.facing, Math.atan2(toP.x, toP.z), dt * 8);
        targetSquash = 0.85 + Math.sin(this.t * 40) * 0.04;
        if (this.t > 0.85 - this.phase * 0.08) {
          this.state = 'charge'; this.t = 0;
          this.dir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
          game.audio.sfx('whoosh');
        }
        break;
      case 'charge': {
        const sp = 15 + this.phase * 3;
        this.pos.addScaledVector(this.dir, sp * dt);
        targetSquash = 1.1;
        if (Math.random() < 0.5) game.fx.puff(this.pos.clone(), 1, '#c8a0ff');
        const fromC = new THREE.Vector3(this.pos.x - this.center.x, 0, this.pos.z - this.center.z);
        if (fromC.length() > ARENA_R - 1.6) {
          fromC.setLength(ARENA_R - 1.6);
          this.pos.x = this.center.x + fromC.x; this.pos.z = this.center.z + fromC.z;
          this.state = 'stunned'; this.t = 0;
          game.audio.sfx('slam'); game.shake(0.6);
          game.fx.burst(this.pos.clone().setY(3), ['#ffd23f', '#ffffff', '#c8a0ff'], 24, 10);
          this.stars.visible = true; this.weak.visible = true; this.weakGlow.visible = true;
          if (!this.hintedStun) { this.hintedStun = true; game.say(['He\'s DIZZY! Jump on his head — the glowing spot!']); }
        }
        if (this.t > 2.2) { this.state = 'idle'; this.t = 0; }
        break;
      }
      case 'slam-up': {
        const k = Math.min(1, this.t / 0.55);
        this.pos.y = Math.sin(k * Math.PI / 2) * 5;
        targetSquash = 1.2;
        if (k >= 1) { this.state = 'slam-down'; this.t = 0; }
        break;
      }
      case 'slam-down': {
        this.pos.y = Math.max(0, 5 - this.t * this.t * 60);
        if (this.pos.y <= 0) {
          this._land(true);
          this.ringsLeft = this.phase >= 2 ? 1 : 0; this.ringTimer = 0.55;
          this.state = 'recover'; this.t = 0;
        }
        break;
      }
      case 'recover':
        targetSquash = 0.8 + Math.min(0.2, this.t * 0.4);
        if (this.ringsLeft > 0) {
          this.ringTimer -= dt;
          if (this.ringTimer <= 0) { this.ringsLeft--; this.ringTimer = 0.55; this._spawnRing(); game.audio.sfx('slam'); }
        }
        if (this.t > 1.0) { this.state = 'idle'; this.t = 0; }
        break;
      case 'barrage': {
        this.facing = this._lerpAngle(this.facing, Math.atan2(toP.x, toP.z), dt * 6);
        targetSquash = 0.95 + Math.sin(this.t * 14) * 0.05;
        const shots = this.phase >= 3 ? 5 : 3;
        if (this.shots < shots && this.t > 0.35 + this.shots * 0.45) { this.shots++; this._fire(); }
        if (this.t > 0.6 + shots * 0.45 + 0.6) { this.state = 'idle'; this.t = 0; }
        break;
      }
      case 'stunned': {
        targetSquash = 0.32;
        this.stars.rotation.y += dt * 4;
        const dur = [0, 4.2, 3.6, 3.1][this.phase];
        if (this.t > dur) this._unstun();
        break;
      }
      case 'hurt':
        targetSquash = 0.32 + Math.sin(this.t * 30) * 0.05;
        this.flash = Math.max(0, 1 - this.t * 1.3);
        if (this.t > 1.2) {
          if (this.hp <= 0) { this.state = 'dying'; this.t = 0; game.audio.sfx('roar'); }
          else { this._unstun(); this.phase = Math.min(3, this.phase + 1); }
        }
        break;
      case 'dying': {
        targetSquash = 1 + Math.sin(this.t * 25) * 0.15;
        this.flash = (Math.sin(this.t * 30) > 0) ? 1 : 0;
        if (Math.random() < 0.3) game.fx.burst(this.pos.clone().setY(3 + Math.random() * 2), ['#ffffff', '#ffd23f', '#a77be0'], 5, 8);
        if (this.t > 2.2) {
          this.state = 'gone'; this.group.visible = false; this.collider.enabled = false;
          game.audio.sfx('explode'); game.shake(0.9);
          game.fx.confetti(this.pos.clone().setY(3), 140);
          game.fx.burst(this.pos.clone().setY(3), ['#16121c', '#e8dcc0', '#a77be0'], 60, 14);
          game.fx.ring(this.pos.clone().setY(0.3), '#ffd23f', 18, 0.9);
          this.clearHazards();
          game.onBossDefeated(this.pos.clone());
        }
        break;
      }
      default: break;
    }

    // keep inside the arena while fighting
    if (this.active && this.state !== 'charge') {
      const fx = this.pos.x - this.center.x, fz = this.pos.z - this.center.z;
      const l = Math.hypot(fx, fz);
      if (l > ARENA_R - 1.6) { this.pos.x = this.center.x + fx / l * (ARENA_R - 1.6); this.pos.z = this.center.z + fz / l * (ARENA_R - 1.6); }
    }

    this.squash += (targetSquash - this.squash) * Math.min(1, dt * 12);

    // collider follows the body
    const c = this.collider;
    c.delta.set(this.pos.x - prevX, 0, this.pos.z - prevZ);
    c.x = this.pos.x; c.z = this.pos.z;
    c.r = 2.6 * (1 + (1 - this.squash) * 0.6) * 0.92;
    c.y0 = this.pos.y; c.y1 = this.pos.y + Math.max(1.7, 5.6 * this.squash);

    // player interactions
    if (this.active && pl.physicsEnabled) {
      const onTop = pl.grounded && pl.ground === c;
      if (onTop) {
        if (this.state === 'stunned') this._hit();
        else if (this.state !== 'hurt' && this.state !== 'dying') { pl.bounce(12); pl.knock(toP.x || 1, toP.z || 1, 10, 10); }
      } else if (this.state === 'charge' && distP < 3.3 && pl.pos.y < this.pos.y + 5) {
        pl.knock(toP.x - this.dir.z * 0.5, toP.z + this.dir.x * 0.5, 17, 10);
      }
    }

    this._updateRings(dt);
    this._updateBalls(dt);
  }

  _nextAttack() {
    const seq = this.phase === 1 ? ['charge', 'slam', 'charge'] : this.phase === 2 ? ['charge', 'barrage', 'slam', 'charge'] : ['barrage', 'charge', 'slam', 'barrage', 'charge'];
    const a = seq[this.attackIdx % seq.length];
    this.attackIdx++;
    this.t = 0;
    if (a === 'charge') { this.state = 'windup'; this.game.audio.sfx('charge'); }
    else if (a === 'slam') { this.state = 'slam-up'; }
    else { this.state = 'barrage'; this.shots = 0; }
  }

  _land(withRing) {
    const game = this.game;
    game.audio.sfx('slam'); game.shake(0.5);
    game.fx.burst(this.pos.clone().setY(0.4), ['#c8a0ff', '#ffffff'], 26, 9, { up: 0.4 });
    if (withRing) this._spawnRing();
  }

  _spawnRing() {
    const m = new THREE.Mesh(this.ringGeo, mat('#ff8a3d', { emissive: '#ff6a00', ei: 2, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    m.position.set(this.pos.x, 0.35, this.pos.z);
    const h = new THREE.Mesh(this.ringGeo, glow('#ffd23f', 0.35)); h.scale.set(1.04, 1.8, 1.04); m.add(h);
    this.game.scene.add(m);
    this.rings.push({ m, r: 2.6, x: this.pos.x, z: this.pos.z });
  }

  _updateRings(dt) {
    const pl = this.game.player;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.r += (10 + this.phase * 1.5) * dt;
      ring.m.scale.set(ring.r, 1, ring.r);
      if (ring.r > 22) { this.game.scene.remove(ring.m); this.rings.splice(i, 1); continue; }
      const d = Math.hypot(pl.pos.x - ring.x, pl.pos.z - ring.z);
      if (Math.abs(d - ring.r) < 0.75 && pl.pos.y < 0.75 && pl.pos.y > -1) {
        pl.knock(pl.pos.x - ring.x, pl.pos.z - ring.z, 12, 10);
      }
    }
  }

  _fire() {
    const pl = this.game.player;
    const target = new THREE.Vector3(pl.pos.x + pl.vel.x * 0.6, 0, pl.pos.z + pl.vel.z * 0.6);
    const off = target.clone().sub(this.center); if (off.length() > 11.5) off.setLength(11.5); target.copy(this.center).add(off);
    const m = new THREE.Mesh(this.ballGeo, mat('#ff7a1a', { emissive: '#ff5000', ei: 2.5 }));
    const h = new THREE.Mesh(this.ballGeo, glow('#ffd23f', 0.4)); h.scale.setScalar(1.6); m.add(h);
    const start = this.pos.clone().setY(this.pos.y + 4.5);
    m.position.copy(start);
    const warn = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.8, 28), new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    warn.rotation.x = -Math.PI / 2; warn.position.set(target.x, 0.05, target.z);
    this.game.scene.add(m, warn);
    this.balls.push({ m, warn, start, target, t: 0, dur: 1.15 });
    this.game.audio.sfx('fireball');
  }

  _updateBalls(dt) {
    const game = this.game, pl = game.player;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.m.position.lerpVectors(b.start, b.target, k);
      b.m.position.y = THREE.MathUtils.lerp(b.start.y, 0.4, k) + Math.sin(k * Math.PI) * 6;
      b.warn.material.opacity = 0.4 + Math.sin(b.t * 20) * 0.3;
      b.warn.scale.setScalar(1.2 - k * 0.3);
      if (k >= 1) {
        game.audio.sfx('explode');
        game.fx.burst(b.target.clone().setY(0.5), ['#ff7a1a', '#ffd23f', '#ff3b30'], 18, 8);
        game.fx.ring(b.target.clone().setY(0.2), '#ff7a1a', 3, 0.35);
        const d = Math.hypot(pl.pos.x - b.target.x, pl.pos.z - b.target.z);
        if (d < 2.2 && pl.pos.y < 2.5) pl.knock(pl.pos.x - b.target.x || 0.1, pl.pos.z - b.target.z || 0.1, 11, 11);
        game.scene.remove(b.m, b.warn);
        this.balls.splice(i, 1);
      }
    }
  }

  _hit() {
    const game = this.game, pl = game.player;
    this.hp--;
    pl.bounce(17);
    pl.invuln = 0.8;
    this.state = 'hurt'; this.t = 0;
    this.stars.visible = false; this.weak.visible = false; this.weakGlow.visible = false;
    game.audio.sfx('bosshit'); game.audio.sfx('roar');
    game.shake(0.6);
    game.fx.burst(this.pos.clone().setY(3), ['#ffd23f', '#ffffff', '#ff4f9a'], 30, 11);
    game.fx.ring(this.pos.clone().setY(2.5), '#ffd23f', 6, 0.4);
    game.onBossHit(this.hp);
  }

  _unstun() {
    this.state = 'idle'; this.t = 0;
    this.stars.visible = false; this.weak.visible = false; this.weakGlow.visible = false;
  }

  clearHazards() {
    this.rings.forEach((r) => this.game.scene.remove(r.m)); this.rings = [];
    this.balls.forEach((b) => this.game.scene.remove(b.m, b.warn)); this.balls = [];
  }

  _lerpAngle(a, b, t) {
    let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return a + d * Math.min(1, t);
  }

  frame(dt) {
    if (!this.group.visible) return;
    const g = this.group;
    g.position.copy(this.pos);
    g.rotation.y = this.facing;
    const s = this.squash;
    const wide = 1 + (1 - s) * 0.6;
    this.body.scale.set(wide, s, wide);
    const time = performance.now() / 1000;
    this.strips.forEach((st, i) => { st.rotation.x = 0.5 + Math.sin(time * 4 + i) * 0.35; st.rotation.z = Math.sin(time * 3 + i * 2) * 0.2; });
    this.arms.forEach((a, i) => { a.rotation.x = Math.sin(time * 5 + i * 3) * (this.state === 'charge' ? 1.2 : 0.3); });
    this.eyes.forEach((e, i) => { e.children[0].rotation.y = 0; e.rotation.z = this.state === 'stunned' ? time * 6 * (i ? 1 : -1) : 0; });
    this.pupilMat.emissiveIntensity = this.state === 'windup' ? 4 + Math.sin(time * 40) * 2 : 2;
    this.bodyMat.emissive.setRGB(this.flash, this.flash, this.flash);
    if (this.weak.visible) this.weak.material.emissiveIntensity = 2 + Math.sin(time * 12) * 1.2;
    this.stars.position.y = 5.6 * s + 0.6;
  }
}
