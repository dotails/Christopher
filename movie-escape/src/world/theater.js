import * as THREE from 'three';
import { mat, glow, Tex, boxGeo, basic } from './materials.js';
import { makeBean } from './player.js';

export const THEATER_ORIGIN = new THREE.Vector3(1000, 0, 0);

// The cinema where it all begins. Also used as the animated menu backdrop.
export class Theater {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.position.copy(THEATER_ORIGIN);
    game.scene.add(this.group);
    this.movieT = 0;
    this.mode = 'loop'; // loop | intro
    this.screenColor = new THREE.Color('#ffffff');
    this._build();
  }

  _build() {
    const g = this.group;
    const carpet = Tex.carpet(); carpet.repeat.set(8, 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 34), mat('#ffffff', { map: carpet, rough: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = -1; floor.receiveShadow = true; g.add(floor);
    const wallM = mat('#3a1424', { rough: 0.9 });
    const panelM = mat('#24101c', { rough: 0.9 });
    const walls = [[0, 7, -16, 30, 14, 0], [0, 7, 16, 30, 14, Math.PI], [-15, 7, 0, 32, 14, Math.PI / 2], [15, 7, 0, 32, 14, -Math.PI / 2]];
    for (const [x, y, z, w, h, ry] of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallM); m.position.set(x, y, z); m.rotation.y = ry; g.add(m);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(30, 32), panelM); ceil.rotation.x = Math.PI / 2; ceil.position.y = 13; g.add(ceil);
    // acoustic panels with golden trims on the side walls
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(boxGeo(0.3, 5, 4.6, 2, 0.1), mat('#5a1a30', { rough: 0.8 }));
        p.position.set(s * 14.8, 6, -9 + i * 6); g.add(p);
        const sconce = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffd9a0', { emissive: '#ffb860', ei: 2 }));
        sconce.position.set(s * 14.6, 9.4, -9 + i * 6); sconce.rotation.x = Math.PI; g.add(sconce);
        const halo = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), glow('#ffb860', 0.18));
        halo.position.set(s * 14.55, 9.6, -9 + i * 6); halo.rotation.y = -s * Math.PI / 2; g.add(halo);
      }
    }
    // the screen
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512; this.canvas.height = 216;
    this.ctx = this.canvas.getContext('2d');
    this.screenTex = new THREE.CanvasTexture(this.canvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(20, 8.44), new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false }));
    this.screen.position.set(0, 6.6, -15.8); g.add(this.screen);
    const frame = new THREE.Mesh(boxGeo(21, 9.4, 0.3, 2), basic('#0a0508')); frame.position.set(0, 6.6, -15.95); g.add(frame);
    // curtains
    const ct = Tex.curtain(); ct.repeat.set(3, 1);
    const curtM = mat('#ffffff', { map: ct, rough: 0.8, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 13), curtM); c.position.set(s * 12.4, 6.5, -15.6); g.add(c);
    }
    const val = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.2), curtM); val.position.set(0, 12, -15.55); g.add(val);
    const stage = new THREE.Mesh(boxGeo(26, 1, 3, 2), mat('#2a0e18')); stage.position.set(0, 0.5, -14.2); g.add(stage);

    // seats (instanced)
    const rows = 7, cols = 12;
    const seatM = mat('#b3173a', { rough: 0.6 });
    const cushion = new THREE.InstancedMesh(boxGeo(1.25, 0.35, 1.1, 1, 0.12), seatM, rows * cols);
    const back = new THREE.InstancedMesh(boxGeo(1.25, 1.3, 0.3, 1, 0.12), seatM, rows * cols);
    const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.5, 1.1), mat('#2a1018'), rows * cols);
    const riserM = mat('#4a1424', { rough: 0.9 });
    const d = new THREE.Object3D();
    let n = 0;
    this.seats = [];
    for (let r = 0; r < rows; r++) {
      const z = -5 + r * 2.1, y = r * 0.55;
      const riser = new THREE.Mesh(new THREE.BoxGeometry(28, y + 0.01, 2.1), riserM);
      riser.position.set(0, y / 2, z); if (y > 0) g.add(riser);
      for (let c = 0; c < cols; c++) {
        const x = -8.25 + c * 1.5;
        d.position.set(x, y + 0.45, z); d.rotation.set(0, 0, 0); d.updateMatrix(); cushion.setMatrixAt(n, d.matrix);
        d.position.set(x, y + 0.95, z + 0.55); d.rotation.set(-0.15, 0, 0); d.updateMatrix(); back.setMatrixAt(n, d.matrix);
        d.position.set(x + 0.7, y + 0.6, z); d.rotation.set(0, 0, 0); d.updateMatrix(); arm.setMatrixAt(n, d.matrix);
        this.seats.push({ x, y: y + 0.62, z, r, c });
        n++;
      }
    }
    g.add(cushion, back, arm);

    // audience
    this.audience = [];
    const cols2 = ['#27d3c3', '#ffd23f', '#8b5cf6', '#ff8a3d', '#3d8bff', '#4cd964', '#ffffff', '#ff6b6b', '#c9b8ff'];
    const picks = [[1, 3], [1, 9], [2, 2], [3, 8], [3, 4], [4, 6], [4, 10], [5, 1], [5, 7], [6, 5], [0, 7]];
    picks.forEach(([r, c], i) => {
      const s = this.seats[r * cols + c];
      const b = makeBean(cols2[i % cols2.length], { bandana: false, scale: 0.95 });
      b.group.position.set(s.x, s.y - 0.55, s.z);
      b.group.rotation.y = Math.PI;
      b.legL.rotation.x = b.legR.rotation.x = -1.45;
      b.armL.rotation.z = 0.3; b.armR.rotation.z = -0.3;
      b.phase = Math.random() * 6;
      g.add(b.group);
      this.audience.push(b);
    });
    this.playerSeat = this.seats[2 * cols + 6];

    // popcorn bucket (handed to the player during the intro)
    const bucket = new THREE.Group();
    const bt = Tex.stripes('#e0213b', '#ffffff');
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.55, 14, 1, true), mat('#ffffff', { map: bt, side: THREE.DoubleSide }));
    bucket.add(cup);
    const popM = mat('#fff1b8', { rough: 0.9 });
    for (let i = 0; i < 12; i++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), popM);
      p.position.set((Math.random() - 0.5) * 0.4, 0.28 + Math.random() * 0.12, (Math.random() - 0.5) * 0.4); bucket.add(p);
    }
    this.popcorn = bucket;

    // projector booth + beam
    const booth = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 0.2), basic('#050203')); booth.position.set(0, 10.5, 15.9); g.add(booth);
    const lensGlow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), basic('#ffffff')); lensGlow.position.set(0, 10.5, 15.75); lensGlow.rotation.y = Math.PI; g.add(lensGlow);
    const beamLen = new THREE.Vector3(0, 10.5, 15.7).distanceTo(new THREE.Vector3(0, 6.6, -15.6));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 7.5, beamLen, 24, 1, true), glow('#cfe0ff', 0.045));
    beam.geometry.translate(0, -beamLen / 2, 0);
    beam.geometry.rotateX(-Math.PI / 2);
    beam.position.set(0, 10.5, 15.7);
    g.updateMatrixWorld(true);
    beam.lookAt(new THREE.Vector3(0, 6.6, -15.6).add(THREE_ORIGIN()));
    g.add(beam);
    this.beam = beam;
    // dust motes in the beam
    const N = 220, arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const k = Math.random(); arr[i * 3] = (Math.random() - 0.5) * 7 * k; arr[i * 3 + 1] = 10.5 - k * 3.9 + (Math.random() - 0.5) * 6 * k; arr[i * 3 + 2] = 15.7 - k * 31; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.06, transparent: true, opacity: 0.5, depthWrite: false }));
    g.add(this.dust);

    // the vortex that swallows you (hidden until the glitch)
    this.vortex = new THREE.Mesh(new THREE.CircleGeometry(4.5, 48), new THREE.MeshBasicMaterial({ map: this._vortexTex(), transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    this.vortex.position.set(0, 6.6, -15.6); g.add(this.vortex);
  }

  _vortexTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.translate(128, 128);
    for (let i = 0; i < 12; i++) {
      x.rotate(Math.PI / 6);
      const grd = x.createLinearGradient(0, 0, 128, 0);
      grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.4, i % 2 ? '#ff4f9a' : '#8b5cf6'); grd.addColorStop(1, 'rgba(40,0,60,0)');
      x.fillStyle = grd; x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(50, 30, 90, 10, 128, 40); x.lineTo(128, 70); x.bezierCurveTo(80, 40, 40, 50, 0, 0); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  toWorld(x, y, z) { return new THREE.Vector3(x, y, z).add(THEATER_ORIGIN); }

  seatPlayer(player) {
    const s = this.playerSeat;
    player.physicsEnabled = false;
    player.pose = 'sit';
    player.pos.copy(this.toWorld(s.x, s.y - 0.55, s.z));
    player.facing = player.targetFacing = Math.PI;
    player.sync();
    this.popcorn.position.set(0.05, -0.15, 0.62);
    this.popcorn.rotation.set(0, 0, 0);
    player.bean.pivot.add(this.popcorn);
  }

  removePopcorn() { if (this.popcorn.parent) this.popcorn.parent.remove(this.popcorn); }

  update(dt) {
    this.movieT += dt;
    this._drawMovie(this.movieT);
    this.screenTex.needsUpdate = true;
    const t = performance.now() / 1000;
    this.audience.forEach((b, i) => {
      b.pivot.rotation.x = -0.12 + Math.sin(t * 1.3 + b.phase) * 0.03;
      b.armR.rotation.x = -0.4 - Math.max(0, Math.sin(t * 2 + b.phase)) * 0.8;
      if (this.mode === 'intro' && this.windK > 0) {
        b.pivot.rotation.z = Math.sin(t * 20 + i) * 0.15 * this.windK;
        b.armL.rotation.z = 0.3 + this.windK * 2; b.armR.rotation.z = -0.3 - this.windK * 2;
      }
    });
    this.dust.rotation.z = Math.sin(t * 0.2) * 0.02;
    if (this.vortex.material.opacity > 0) this.vortex.rotation.z -= dt * 6;
  }

  // ---------------- the movie on screen ----------------
  _drawMovie(t) {
    const x = this.ctx, W = 512, H = 216;
    let scene;
    if (this.mode === 'loop') scene = 'action';
    else if (t < 3.6) scene = 'title';
    else if (t < 9.5) scene = 'action';
    else if (t < 12.5) scene = 'point';
    else scene = 'glitch';
    const avg = this.screenColor;

    if (scene === 'title') {
      x.fillStyle = '#05030a'; x.fillRect(0, 0, W, H);
      x.save(); x.translate(W / 2, H / 2);
      for (let i = 0; i < 16; i++) { x.rotate(Math.PI / 8 + t * 0.02); x.fillStyle = `rgba(255,180,60,${0.05 + 0.04 * (i % 2)})`; x.beginPath(); x.moveTo(0, 0); x.lineTo(400, -30); x.lineTo(400, 30); x.fill(); }
      x.restore();
      const s = 1 + t * 0.05;
      x.save(); x.translate(W / 2, H / 2 - 8); x.scale(s, s);
      x.font = 'bold 56px "Titan One", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 8; x.strokeStyle = '#2b1640'; x.strokeText('REEL HERO', 0, 0);
      const grd = x.createLinearGradient(0, -30, 0, 30); grd.addColorStop(0, '#fff3b0'); grd.addColorStop(1, '#ff9a1a');
      x.fillStyle = grd; x.fillText('REEL HERO', 0, 0);
      x.restore();
      x.globalAlpha = Math.min(1, Math.max(0, t - 1.2));
      x.font = '16px "Special Elite", monospace'; x.fillStyle = '#ffe9c0'; x.textAlign = 'center';
      x.fillText('THIS SUMMER... ONE HERO... ONE LAST REEL', W / 2, H - 30);
      x.globalAlpha = 1;
      avg.set('#ffb060');
    } else if (scene === 'action' || scene === 'point') {
      const sky = x.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#ff6a3d'); sky.addColorStop(0.55, '#ffb36b'); sky.addColorStop(1, '#5a2a6a');
      x.fillStyle = sky; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff1c8'; x.beginPath(); x.arc(380, 70, 30, 0, 7); x.fill();
      const scroll = scene === 'point' ? 9.5 * 90 : t * 90;
      // far city
      x.fillStyle = '#7a3a6a';
      for (let i = 0; i < 14; i++) { const bx = ((i * 60 - scroll * 0.3) % 840 + 840) % 840 - 60; const bh = 50 + (i * 37) % 60; x.fillRect(bx, H - bh - 40, 46, bh + 40); }
      // near rooftops
      x.fillStyle = '#2b1640';
      const roofY = (i) => H - 46 - ((i * 23) % 3) * 10;
      for (let i = 0; i < 10; i++) { const bx = ((i * 110 - scroll) % 1100 + 1100) % 1100 - 110; x.fillRect(bx, roofY(i), 92, H); }
      // explosion
      const ek = (t * 0.7) % 1;
      if (scene === 'action' && ek < 0.6) {
        const ex = 120 + ((Math.floor(t * 0.7) * 173) % 260), r = ek * 120;
        const eg = x.createRadialGradient(ex, H - 60, 0, ex, H - 60, r);
        eg.addColorStop(0, 'rgba(255,255,200,.95)'); eg.addColorStop(0.4, 'rgba(255,150,40,.8)'); eg.addColorStop(1, 'rgba(255,60,20,0)');
        x.fillStyle = eg; x.beginPath(); x.arc(ex, H - 60, r, 0, 7); x.fill();
      }
      // helicopter
      const hx = scene === 'point' ? 420 : (t * 50) % 700 - 100;
      x.fillStyle = '#1b1026'; x.beginPath(); x.ellipse(hx, 40, 22, 11, 0, 0, 7); x.fill(); x.fillRect(hx - 50, 37, 30, 4);
      x.fillRect(hx - 34 + Math.sin(t * 60) * 20, 26, 50, 2);
      // the hero
      if (scene === 'action') {
        const run = t * 14;
        const jump = Math.max(0, Math.sin(t * 2.2)) * 40;
        this._hero(x, 170, H - 70 - jump, Math.sin(run) * 0.5, 1, false);
      } else {
        const k = Math.min(1, (t - 9.5) / 0.6);
        this._hero(x, W / 2, H / 2 + 20, 0, 1 + k * 1.4, true, t);
        if (t > 10.3) {
          x.font = 'bold 30px "Titan One", Impact, sans-serif'; x.textAlign = 'center';
          x.lineWidth = 6; x.strokeStyle = '#2b1640'; x.strokeText('HEY... YOU!', W / 2, 36); x.fillStyle = '#ffd23f'; x.fillText('HEY... YOU!', W / 2, 36);
        }
      }
      avg.set(scene === 'point' ? '#ff9a7a' : '#ff9a5a');
      if (ek < 0.25 && scene === 'action') avg.set('#ffe0a0');
    } else {
      // glitch + vortex
      const gt = t - 12.5;
      x.fillStyle = '#12051c'; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 30; i++) { x.fillStyle = ['#ff4f9a', '#27d3c3', '#ffd23f', '#ffffff'][i % 4]; x.globalAlpha = Math.random() * 0.6; x.fillRect(Math.random() * W, Math.random() * H, Math.random() * 200, 2 + Math.random() * 8); }
      x.globalAlpha = 1;
      x.save(); x.translate(W / 2, H / 2);
      for (let i = 0; i < 24; i++) {
        x.rotate(Math.PI / 12 + gt * 0.4);
        x.fillStyle = i % 2 ? '#ff4f9a' : '#8b5cf6';
        x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(60, 30, 300, 10); x.lineTo(300, 40); x.quadraticCurveTo(60, 50, 0, 0); x.fill();
      }
      const cg = x.createRadialGradient(0, 0, 0, 0, 0, 60 + gt * 40); cg.addColorStop(0, '#ffffff'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = cg; x.beginPath(); x.arc(0, 0, 200, 0, 7); x.fill();
      x.restore();
      avg.set(Math.random() > 0.5 ? '#ff4f9a' : '#8b5cf6');
    }
    // film grain + scratches
    x.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 3; i++) x.fillRect(Math.random() * W, 0, 1, H);
  }

  _hero(x, cx, cy, swing, s, facing, t = 0) {
    x.save(); x.translate(cx, cy); x.scale(s, s);
    // legs
    x.fillStyle = '#ff4f9a';
    x.save(); x.rotate(swing); x.fillRect(-9, 18, 8, 18); x.restore();
    x.save(); x.rotate(-swing); x.fillRect(2, 18, 8, 18); x.restore();
    // body
    x.beginPath(); x.ellipse(0, 0, 18, 26, 0, 0, 7); x.fill();
    x.lineWidth = 3; x.strokeStyle = '#2b1640'; x.stroke();
    // face
    x.fillStyle = '#ffe2c6'; x.beginPath(); x.ellipse(facing ? 0 : 6, -8, 11, 8, 0, 0, 7); x.fill();
    x.fillStyle = '#1b1026';
    x.fillRect((facing ? -5 : 2), -12, 3, 5); x.fillRect((facing ? 3 : 9), -12, 3, 5);
    // bandana
    x.fillStyle = '#e0213b'; x.fillRect(-18, -20, 36, 5);
    x.fillRect(-26, -21 + Math.sin(performance.now() / 60) * 2, 10, 3);
    if (facing) {
      // pointing arm
      const k = Math.min(1, Math.max(0, (t - 9.9) * 3));
      x.fillStyle = '#ff4f9a';
      x.save(); x.translate(16, 0); x.rotate(-0.4 - k * 0.6); x.fillRect(0, -4, 22 + k * 6, 8); x.beginPath(); x.arc(24 + k * 6, 0, 6, 0, 7); x.fill(); x.restore();
    }
    x.restore();
  }
}

function THREE_ORIGIN() { return THEATER_ORIGIN.clone(); }
