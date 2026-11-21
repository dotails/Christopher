import * as THREE from 'three';

// ---------- canvas textures (generated at runtime, no image assets) ----------
const texCache = new Map();

function canvasTex(key, size, draw, { repeat = true, srgb = true } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

const rnd = (() => { let s = 1337; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

export const Tex = {
  checker: (a, b) => canvasTex(`chk${a}${b}`, 128, (g, s) => {
    g.fillStyle = a; g.fillRect(0, 0, s, s);
    g.fillStyle = b; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2);
    g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s);
  }),
  stripes: (a, b) => canvasTex(`str${a}${b}`, 128, (g, s) => {
    g.fillStyle = a; g.fillRect(0, 0, s, s);
    g.fillStyle = b;
    for (let i = -s; i < s * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - s, s); g.lineTo(i - s, s); g.fill(); }
  }),
  tiles: (a, grout) => canvasTex(`til${a}${grout}`, 128, (g, s) => {
    g.fillStyle = grout; g.fillRect(0, 0, s, s);
    g.fillStyle = a;
    const n = 2, w = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) g.fillRect(i * w + 3, j * w + 3, w - 6, w - 6);
    g.fillStyle = 'rgba(255,255,255,.12)';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) g.fillRect(i * w + 3, j * w + 3, w - 6, 6);
  }),
  brick: (a, mortar) => canvasTex(`brk${a}${mortar}`, 256, (g, s) => {
    g.fillStyle = mortar; g.fillRect(0, 0, s, s);
    const rows = 8, h = s / rows, w = s / 4;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * w / 2;
      for (let i = -1; i < 5; i++) {
        const v = 0.85 + rnd() * 0.25;
        g.fillStyle = a; g.globalAlpha = 1; g.fillRect(i * w + off + 3, r * h + 3, w - 6, h - 6);
        g.fillStyle = v > 1 ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.12)'; g.fillRect(i * w + off + 3, r * h + 3, w - 6, h - 6);
      }
    }
  }),
  planks: (a) => canvasTex(`plk${a}`, 256, (g, s) => {
    g.fillStyle = a; g.fillRect(0, 0, s, s);
    const n = 4, h = s / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.12})`; g.fillRect(0, i * h, s, h);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, i * h, s, 3);
      g.strokeStyle = 'rgba(60,30,10,.18)'; g.lineWidth = 2;
      for (let k = 0; k < 5; k++) { g.beginPath(); const y = i * h + 8 + rnd() * (h - 16); g.moveTo(0, y); g.bezierCurveTo(s * .3, y + 6, s * .6, y - 6, s, y); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.3)'; const x = rnd() * s; g.fillRect(x, i * h, 3, h);
    }
  }),
  metal: (a) => canvasTex(`mtl${a}`, 256, (g, s) => {
    g.fillStyle = a; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.strokeRect(7, 7, s - 14, s - 14);
    g.fillStyle = 'rgba(0,0,0,.4)';
    [[16, 16], [s - 16, 16], [16, s - 16], [s - 16, s - 16]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); });
    g.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 40; i++) g.fillRect(rnd() * s, rnd() * s, rnd() * 60, 1);
  }),
  stone: (a) => canvasTex(`stn${a}`, 256, (g, s) => {
    g.fillStyle = a; g.fillRect(0, 0, s, s);
    const n = 3, w = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = `rgba(${rnd() > .5 ? '255,255,255' : '0,0,0'},${0.04 + rnd() * 0.1})`;
      g.fillRect(i * w + 3, j * w + 3, w - 6, w - 6);
    }
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 5;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * w, 0); g.lineTo(i * w, s); g.stroke(); g.beginPath(); g.moveTo(0, i * w); g.lineTo(s, i * w); g.stroke(); }
    g.fillStyle = 'rgba(40,90,30,.35)';
    for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(rnd() * s, rnd() * s, 3 + rnd() * 8, 0, 7); g.fill(); }
  }),
  grid: (a, line) => canvasTex(`grd${a}${line}`, 128, (g, s) => {
    g.fillStyle = a; g.fillRect(0, 0, s, s);
    g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(1.5, 1.5, s - 3, s - 3);
    g.globalAlpha = .4; g.lineWidth = 1; g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  }),
  windows: (lit) => canvasTex(`win${lit}`, 256, (g, s) => {
    g.fillStyle = '#0d0f22'; g.fillRect(0, 0, s, s);
    for (let y = 8; y < s; y += 24) for (let x = 8; x < s; x += 20) {
      if (rnd() < lit) { const c = ['#ffe9a8', '#fff3cf', '#9be7ff', '#ffb3d9'][Math.floor(rnd() * 4)]; g.fillStyle = c; } else g.fillStyle = '#1b1f3a';
      g.fillRect(x, y, 12, 14);
    }
  }),
  lava: () => canvasTex('lava', 256, (g, s) => {
    const grd = g.createLinearGradient(0, 0, s, s); grd.addColorStop(0, '#ff3d00'); grd.addColorStop(1, '#ff9100');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 50; i++) {
      g.fillStyle = rnd() > .5 ? 'rgba(255,230,80,.55)' : 'rgba(120,10,0,.45)';
      g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 6 + rnd() * 26, 4 + rnd() * 14, rnd() * 3, 0, 7); g.fill();
    }
  }),
  goo: () => canvasTex('goo', 256, (g, s) => {
    g.fillStyle = '#3fd16b'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = rnd() > .5 ? 'rgba(200,255,120,.5)' : 'rgba(10,90,40,.35)';
      g.beginPath(); g.arc(rnd() * s, rnd() * s, 3 + rnd() * 16, 0, 7); g.fill();
    }
  }),
  film: () => canvasTex('film', 128, (g, s) => {
    g.fillStyle = '#16121c'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#e8dcc0';
    for (let y = 4; y < s; y += 16) { g.fillRect(6, y, 10, 9); g.fillRect(s - 16, y, 10, 9); }
    g.fillStyle = 'rgba(255,190,90,.35)'; g.fillRect(24, 6, s - 48, s / 2 - 10); g.fillRect(24, s / 2 + 4, s - 48, s / 2 - 10);
  }),
  carpet: () => canvasTex('carpet', 128, (g, s) => {
    g.fillStyle = '#7a1630'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#d6a43a'; g.lineWidth = 3;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(i * 64 + 32, j * 64 + 32, 18, 0, 7); g.stroke(); g.beginPath(); g.moveTo(i * 64 + 32, j * 64 + 8); g.lineTo(i * 64 + 56, j * 64 + 32); g.lineTo(i * 64 + 32, j * 64 + 56); g.lineTo(i * 64 + 8, j * 64 + 32); g.closePath(); g.stroke(); }
  }),
  curtain: () => canvasTex('curtain', 256, (g, s) => {
    const grd = g.createLinearGradient(0, 0, s, 0);
    for (let i = 0; i <= 8; i++) { grd.addColorStop(i / 8, i % 2 ? '#5a0a1c' : '#b3173a'); }
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  }),
  hazard: () => canvasTex('hazard', 128, (g, s) => {
    g.fillStyle = '#ffd23f'; g.fillRect(0, 0, s, s); g.fillStyle = '#222';
    for (let i = -s; i < s * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - s, s); g.lineTo(i - s, s); g.fill(); }
  }),
  dots: (a, b) => canvasTex(`dot${a}${b}`, 128, (g, s) => {
    g.fillStyle = a; g.fillRect(0, 0, s, s); g.fillStyle = b;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(i * 32 + 16 + (j % 2) * 16, j * 32 + 16, 6, 0, 7); g.fill(); }
  }),
  sign: (text, bg, fg, w = 512, h = 128) => {
    const key = `sign${text}${bg}${fg}${w}`;
    if (texCache.has(key)) return texCache.get(key);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg; g.font = `bold ${Math.floor(h * 0.55)}px "Titan One", Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t); return t;
  },
};

// ---------- materials ----------
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: opts.rough ?? 0.55, metalness: opts.metal ?? 0.0,
    map: opts.map || null,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0),
    emissiveIntensity: opts.ei ?? 1,
    emissiveMap: opts.emissiveMap || null,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    flatShading: !!opts.flat,
    depthWrite: opts.depthWrite ?? true,
  });
  matCache.set(key, m);
  return m;
}

export function glow(color, opacity = 0.5) {
  const key = 'glow' + color + opacity;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  matCache.set(key, m);
  return m;
}

export function basic(color) {
  const key = 'basic' + color;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color });
  matCache.set(key, m);
  return m;
}

// Box geometry whose UVs are scaled to world units so tiled textures keep a
// constant density regardless of the box size. Optional rounded corners give
// the soft, toy-like "party game" look.
export function boxGeo(w, h, d, tile = 2, rounded = 0) {
  const seg = rounded > 0 ? 3 : 1;
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const per = (seg + 1) * (seg + 1);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let fi = 0; fi < 6; fi++) {
    const [fw, fh] = dims[fi];
    for (let i = fi * per; i < (fi + 1) * per; i++) uv.setXY(i, uv.getX(i) * fw / tile, uv.getY(i) * fh / tile);
  }
  if (rounded > 0) {
    const r = Math.min(rounded, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      c.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
      n.subVectors(v, c);
      if (n.lengthSq() > 1e-9) {
        n.normalize();
        v.copy(c).addScaledVector(n, r);
        pos.setXYZ(i, v.x, v.y, v.z);
        nor.setXYZ(i, n.x, n.y, n.z);
      }
    }
  }
  return g;
}

export const PALETTE = {
  pink: '#ff4f9a', yellow: '#ffd23f', teal: '#27d3c3', purple: '#8b5cf6', orange: '#ff8a3d',
  blue: '#3d8bff', green: '#4cd964', red: '#ff3b5c', white: '#fff6e3', ink: '#2b1640',
};
