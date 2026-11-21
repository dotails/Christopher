import * as THREE from 'three';
import { mat, glow, basic, Tex } from './materials.js';

export const PARADISE_ORIGIN = new THREE.Vector3(-600, 0, 0);
const KEY = 'paradise';

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x, z) {
  return Math.sin(x * 0.045) * Math.cos(z * 0.05) * 0.6 + Math.sin(x * 0.11 + z * 0.07) * 0.3 + Math.cos(z * 0.13 - x * 0.04) * 0.25;
}
export function paradiseHeight(x, z) {
  let h = 0;
  if (z < -40) { const d = -40 - z; h -= Math.min(30, d * d * 0.06 + d * 0.2); }
  const r = Math.max(Math.abs(x) - 45, z - 45, 0);
  if (r > 0) h += r * 0.45 + noise(x, z) * Math.min(1, r / 12) * 8;
  if (z < -60) h += noise(x * 1.3, z) * 2;
  return h;
}

// The ending: a sunlit meadow outside the movie. Freedom.
export class Paradise {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.position.copy(PARADISE_ORIGIN);
    this.group.visible = false;
    game.scene.add(this.group);
    this.t = 0;
    this.env = { bg: '#9fd4ff', fog: ['#cfe8ff', 90, 420], hemi: ['#d6efff', '#7fbf5a', 1.35], sun: ['#fff1d0', 2.9] };
    this._build();
  }

  _build() {
    const g = this.group, O = PARADISE_ORIGIN;
    // sky dome
    const skyGeo = new THREE.SphereGeometry(380, 32, 20);
    const cols = [];
    const top = new THREE.Color('#3f9cff'), mid = new THREE.Color('#9fd4ff'), hor = new THREE.Color('#fff0d0');
    const p = skyGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 380;
      const c = y > 0.25 ? mid.clone().lerp(top, Math.min(1, (y - 0.25) / 0.6)) : hor.clone().lerp(mid, Math.max(0, (y + 0.1) / 0.35));
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1; g.add(sky);
    // sun
    const sun = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 16), new THREE.MeshBasicMaterial({ color: '#fffbe8', fog: false }));
    sun.position.set(-60, 120, -300); g.add(sun);
    const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(34, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
    sunGlow.position.copy(sun.position); g.add(sunGlow);

    // terrain
    const tg = new THREE.PlaneGeometry(520, 520, 130, 130);
    tg.rotateX(-Math.PI / 2);
    const tp = tg.attributes.position, tc = [];
    const gA = new THREE.Color('#7ccf5a'), gB = new THREE.Color('#58b047'), sand = new THREE.Color('#e8d79a'), rock = new THREE.Color('#9a9a8a');
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), z = tp.getZ(i);
      const h = paradiseHeight(x, z);
      tp.setY(i, h);
      let c = gA.clone().lerp(gB, 0.5 + noise(x * 2, z * 2) * 0.5);
      if (h < -22) c = sand.clone();
      else if (z < -42 && h < -4) c.lerp(rock, 0.35);
      if (h > 14) c.lerp(new THREE.Color('#ffffff'), Math.min(1, (h - 14) / 10));
      tc.push(c.r, c.g, c.b);
    }
    tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
    tg.computeVertexNormals();
    const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    terrain.receiveShadow = true; g.add(terrain);
    // physics: a flat meadow with gentle fences
    const w = this.game.world;
    w.addBox(KEY, O.x - 46, -2, O.z - 40, O.x + 46, 0, O.z + 46);
    w.addBox(KEY, O.x - 47, -2, O.z - 41, O.x - 45, 30, O.z + 46);
    w.addBox(KEY, O.x + 45, -2, O.z - 41, O.x + 47, 30, O.z + 46);
    w.addBox(KEY, O.x - 47, -2, O.z + 45, O.x + 47, 30, O.z + 47);
    w.addBox(KEY, O.x - 47, -2, O.z - 41.5, O.x + 47, 1.2, O.z - 39.6);
    // the fence at the overlook
    const fenceM = mat('#c79a5b', { map: Tex.planks('#c79a5b') });
    for (let i = -22; i <= 22; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), fenceM);
      post.position.set(i * 2, 0.7, -40.2); g.add(post);
    }
    for (const y of [0.55, 1.1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(88, 0.14, 0.14), fenceM); rail.position.set(0, y, -40.2); g.add(rail); }

    // lake + waterfall in the valley
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(300, 200), new THREE.MeshStandardMaterial({ color: '#3fb4e8', roughness: 0.08, metalness: 0.3, emissive: '#0a3a5a', transparent: true, opacity: 0.92 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(0, -24, -160); g.add(lake);
    this.lake = lake;
    const wfTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#bfe9ff'; x.fillRect(0, 0, 64, 256); for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; x.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 4, 20 + Math.random() * 60); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    this.wfTex = wfTex;
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(160, 60, 20), mat('#8a9a7a', { rough: 0.95 }));
    cliff.position.set(10, 0, -250); g.add(cliff);
    const cliffTop = new THREE.Mesh(new THREE.BoxGeometry(162, 3, 22), mat('#6cc04a'));
    cliffTop.position.set(10, 31, -250); g.add(cliffTop);
    for (const x of [-20, 30]) {
      const wf = new THREE.Mesh(new THREE.PlaneGeometry(10, 56), new THREE.MeshBasicMaterial({ map: wfTex, transparent: true, opacity: 0.9 }));
      wf.position.set(x, 4, -239.5); g.add(wf);
      const mist = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 10), glow('#ffffff', 0.25)); mist.position.set(x, -24, -238); mist.scale.y = 0.4; g.add(mist);
    }
    // rainbow over the valley
    const rb = new THREE.Group();
    ['#ff4f4f', '#ff9f3d', '#ffe14d', '#5fd35f', '#4fa8ff', '#8b5cf6'].forEach((c, i) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(90 - i * 2.4, 1.2, 6, 80, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.32, fog: false, depthWrite: false }));
      rb.add(arc);
    });
    rb.position.set(10, -20, -200); g.add(rb);
    // mountains
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI * 0.9 + (i / 13) * Math.PI * 1.8 + Math.PI;
      const d = 300 + hash(i, 3) * 40, h = 70 + hash(i, 7) * 70;
      const m = new THREE.Mesh(new THREE.ConeGeometry(50 + hash(i, 1) * 30, h, 7), mat('#7a8fb0', { flat: true, rough: 1 }));
      m.position.set(Math.sin(a) * d, h / 2 - 20, Math.cos(a) * d); g.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry((50 + hash(i, 1) * 30) * 0.32, h * 0.32, 7), mat('#ffffff', { flat: true }));
      cap.position.set(m.position.x, h - 20 - h * 0.16, m.position.z); g.add(cap);
    }
    // floating islands
    this.islands = [];
    for (let i = 0; i < 5; i++) {
      const isl = new THREE.Group();
      const rock2 = new THREE.Mesh(new THREE.ConeGeometry(6 + i, 12 + i * 2, 7), mat('#9a8a6a', { flat: true }));
      rock2.rotation.x = Math.PI; rock2.position.y = -(6 + i); isl.add(rock2);
      const top2 = new THREE.Mesh(new THREE.CylinderGeometry(6 + i, 6 + i, 1.5, 7), mat('#6cc04a', { flat: true })); isl.add(top2);
      const tree = this._tree(1.2); tree.position.y = 0.7; isl.add(tree);
      isl.position.set(-120 + i * 60, 30 + hash(i, 9) * 30, -120 - hash(i, 4) * 80);
      isl.userData.base = isl.position.y; isl.userData.ph = i;
      g.add(isl); this.islands.push(isl);
    }
    // trees around the meadow
    for (let i = 0; i < 46; i++) {
      const a = hash(i, 11) * Math.PI * 2;
      const d = 30 + hash(i, 13) * 40;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z < -30) continue;
      const t = this._tree(0.8 + hash(i, 17) * 0.7);
      t.position.set(x, paradiseHeight(x, z), z); g.add(t);
      if (Math.abs(x) < 44 && z > -39 && z < 44) w.addCyl(KEY, O.x + x, O.z + z, 0.5, 0, 4);
    }
    // flowers + grass (instanced)
    const flowerGeo = new THREE.IcosahedronGeometry(0.16, 0);
    const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 700);
    const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.6, 4), new THREE.MeshStandardMaterial({ color: '#4fa83a', roughness: 0.9 }), 900);
    const d = new THREE.Object3D(), fc = ['#ff6fa8', '#ffd23f', '#ffffff', '#c9b8ff', '#ff8a3d'];
    for (let i = 0; i < 700; i++) {
      const x = (hash(i, 1.3) - 0.5) * 88, z = (hash(i, 2.7) - 0.5) * 80 + 2;
      d.position.set(x, 0.22, z); d.scale.setScalar(0.8 + hash(i, 5) * 0.8); d.updateMatrix();
      flowers.setMatrixAt(i, d.matrix); flowers.setColorAt(i, new THREE.Color(fc[i % fc.length]));
    }
    for (let i = 0; i < 900; i++) {
      const x = (hash(i, 8.1) - 0.5) * 90, z = (hash(i, 9.3) - 0.5) * 82 + 2;
      d.position.set(x, 0.3, z); d.rotation.set((hash(i, 2) - 0.5) * 0.4, 0, (hash(i, 3) - 0.5) * 0.4); d.scale.setScalar(0.7 + hash(i, 4)); d.updateMatrix();
      grass.setMatrixAt(i, d.matrix);
    }
    d.rotation.set(0, 0, 0);
    g.add(flowers, grass);
    // clouds
    this.clouds = [];
    const cloudM = mat('#ffffff', { rough: 1, emissive: '#e8f4ff', ei: 0.35 });
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(5 + hash(i, k) * 5, 12, 8), cloudM); s.position.set(k * 6 - 12, hash(k, i) * 3, hash(i + k, 2) * 4); c.add(s); }
      c.position.set((hash(i, 21) - 0.5) * 500, 60 + hash(i, 22) * 50, -100 - hash(i, 23) * 220);
      g.add(c); this.clouds.push(c);
    }
    // butterflies
    this.butterflies = [];
    const wingGeo = new THREE.PlaneGeometry(0.35, 0.25); wingGeo.translate(0.17, 0, 0);
    for (let i = 0; i < 10; i++) {
      const b = new THREE.Group();
      const wm = new THREE.MeshBasicMaterial({ color: fc[i % fc.length], side: THREE.DoubleSide });
      const l = new THREE.Mesh(wingGeo, wm), r = new THREE.Mesh(wingGeo, wm); r.rotation.y = Math.PI;
      b.add(l, r); b.userData = { l, r, ph: i * 1.7, cx: (hash(i, 31) - 0.5) * 40, cz: (hash(i, 32) - 0.5) * 40 };
      g.add(b); this.butterflies.push(b);
    }
    // birds
    this.birds = [];
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0.3, 0, 0, 0, 0.3, 0, 0, -0.3, 0, 0, 0.3, 1, 0.3, 0, 0, 0, -0.3], 3));
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(birdGeo, new THREE.MeshBasicMaterial({ color: '#2b2b3a', side: THREE.DoubleSide }));
      b.userData = { ph: i * 0.7, r: 40 + i * 6, h: 35 + i * 3 }; b.scale.setScalar(1.4);
      g.add(b); this.birds.push(b);
    }

    // the freestanding door you walked out of
    const door = new THREE.Group();
    const frameM = mat('#fff6e3', { rough: 0.5 });
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.6, 0.8), frameM); fl.position.set(-2.3, 3.8, 0); door.add(fl);
    const fr = fl.clone(); fr.position.x = 2.3; door.add(fr);
    const ft = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.6, 0.8), frameM); ft.position.set(0, 7.6, 0); door.add(ft);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(4, 7.2, 0.25), mat('#6b3a1e', { map: Tex.planks('#7a4526') }));
    leaf.geometry.translate(2, 0, 0); leaf.position.set(-2, 3.6, 0); leaf.rotation.y = -1.9; door.add(leaf);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(4, 7.2), new THREE.MeshBasicMaterial({ color: '#fffaf0' }));
    inner.position.set(0, 3.6, -0.05); inner.rotation.y = Math.PI; door.add(inner);
    this.doorGlow = inner;
    door.position.set(0, 0, 14); g.add(door);
    w.addBox(KEY, O.x - 2.6, 0, O.z + 13.6, O.x - 2.0, 7.6, O.z + 14.4);
    w.addBox(KEY, O.x + 2.0, 0, O.z + 13.6, O.x + 2.6, 7.6, O.z + 14.4);
    // a bench at the overlook
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.8), fenceM); seat.position.y = 0.7; bench.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.15), fenceM); back.position.set(0, 1.2, 0.4); bench.add(back);
    bench.position.set(6, 0, -36); bench.rotation.y = Math.PI; g.add(bench);

    this.spawn = PARADISE_ORIGIN.clone().add(new THREE.Vector3(0, 0, 13.6));
    this.overlook = PARADISE_ORIGIN.clone().add(new THREE.Vector3(0, 0, -36));
  }

  _tree(s = 1) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.5 * s, 4 * s, 8), mat('#8a5a3a'));
    trunk.position.y = 2 * s; trunk.castShadow = true; t.add(trunk);
    const leafCols = ['#5fc048', '#4cab3c', '#7ad35a'];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry((2.2 - i * 0.4) * s, 0), mat(leafCols[i], { flat: true, rough: 0.8 }));
      c.position.set((i - 1) * 0.6 * s, (4 + i * 1.3) * s, (i % 2) * 0.5 * s); c.castShadow = true; t.add(c);
    }
    return t;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.t += dt;
    const t = this.t;
    this.wfTex.offset.y = -t * 0.6;
    this.islands.forEach((i) => { i.position.y = i.userData.base + Math.sin(t * 0.4 + i.userData.ph) * 2; i.rotation.y = t * 0.03; });
    this.clouds.forEach((c, i) => { c.position.x += dt * (1 + i * 0.1); if (c.position.x > 280) c.position.x = -280; });
    this.butterflies.forEach((b) => {
      const u = b.userData, k = t * 0.6 + u.ph;
      b.position.set(u.cx + Math.sin(k) * 6, 1.2 + Math.sin(k * 2.3) * 0.6, u.cz + Math.cos(k * 0.8) * 6);
      b.rotation.y = -k;
      const f = Math.sin(t * 18 + u.ph) * 1.1;
      u.l.rotation.y = f; u.r.rotation.y = Math.PI - f;
    });
    this.birds.forEach((b) => {
      const u = b.userData, k = t * 0.15 + u.ph;
      b.position.set(Math.cos(k) * u.r, u.h + Math.sin(t + u.ph) * 2, -80 + Math.sin(k) * u.r * 0.5);
      b.rotation.y = -k; b.scale.y = 1.4 * (0.6 + Math.abs(Math.sin(t * 6 + u.ph)));
    });
  }
}

export const PARADISE_KEY = KEY;
