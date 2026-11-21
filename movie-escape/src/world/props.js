import * as THREE from 'three';
import { mat, glow, Tex, basic } from './materials.js';

const GOLD = () => mat('#ffc93c', { metal: 0.8, rough: 0.25, emissive: '#7a4a00', ei: 0.5 });

export function makeReel() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.16, 28), GOLD());
  disc.rotation.x = Math.PI / 2; g.add(disc);
  const hole = new THREE.CylinderGeometry(0.13, 0.13, 0.2, 12);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const h = new THREE.Mesh(hole, basic('#3a2410'));
    h.rotation.x = Math.PI / 2; h.position.set(Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0);
    g.add(h);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 10), mat('#fff6e3'));
  hub.rotation.x = Math.PI / 2; g.add(hub);
  // a short tail of film
  const film = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.9), mat('#ffffff', { map: Tex.film(), side: THREE.DoubleSide }));
  film.position.set(0.55, -0.45, 0); film.rotation.z = 0.5; g.add(film);
  return g;
}

export function makeKey() {
  const g = new THREE.Group();
  const m = GOLD();
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.11, 10, 24), m); bow.position.y = 0.5; g.add(bow);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), m); shaft.position.y = -0.3; g.add(shaft);
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.14), m); t1.position.set(0.18, -0.72, 0); g.add(t1);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.14), m); t2.position.set(0.14, -0.5, 0); g.add(t2);
  g.scale.setScalar(1.3);
  return g;
}

export function makeBomb() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14), mat('#26222e', { rough: 0.3, metal: 0.3 }));
  g.add(b);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 24), mat('#ffd23f')); band.rotation.x = Math.PI / 2; g.add(band);
  const timer = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.1), mat('#111', { emissive: '#ff2030', ei: 2 }));
  timer.position.set(0, 0.05, 0.5); g.add(timer);
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6), mat('#c9b48a')); fuse.position.y = 0.6; fuse.rotation.z = 0.3; g.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow('#ffcc33', 0.9)); spark.position.set(-0.08, 0.78, 0); g.add(spark);
  g.userData.blink = timer;
  return g;
}

export function makeBriefcase() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.28), mat('#c0c4cc', { metal: 0.85, rough: 0.2 }));
  g.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 12, Math.PI), mat('#222'));
  handle.position.y = 0.36; g.add(handle);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.06, 0.3), mat('#ffd23f', { emissive: '#7a5a00' })); g.add(strip);
  return g;
}

export function makeIdol() {
  const g = new THREE.Group();
  const m = GOLD();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.25, 10), m); base.position.y = -0.45; g.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.6, 10), m); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), m); head.position.y = 0.48; g.add(head);
  const eyes = [-0.1, 0.1].map((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mat('#ff3060', { emissive: '#ff0040', ei: 3 })); e.position.set(x, 0.52, 0.25); return e; });
  g.add(...eyes);
  return g;
}

export function makeCell() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 6, 14), mat('#5ff5ff', { emissive: '#18d8ff', ei: 2.2, rough: 0.1 }));
  g.add(core);
  const capM = mat('#d7dce6', { metal: 0.8, rough: 0.3 });
  const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 14), capM); c1.position.y = 0.42; g.add(c1);
  const c2 = c1.clone(); c2.position.y = -0.42; g.add(c2);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), glow('#3ee8ff', 0.18)); g.add(halo);
  return g;
}

export function makeDetonator() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.55), mat('#3b2f2a', { rough: 0.6 })); g.add(box);
  const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), mat('#999', { metal: 0.8 })); plunger.position.y = 0.5; g.add(plunger);
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.08), mat('#ff3b30', { emissive: '#ff2010', ei: 1.5 })); t.position.y = 0.8; g.add(t);
  const stripes = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.57), mat('#ffd23f', { map: Tex.hazard() })); stripes.position.y = -0.12; g.add(stripes);
  return g;
}

export function makeClapper(glowy = true) {
  const g = new THREE.Group();
  const m = GOLD();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.1), m); g.add(board);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.2, 0.1), mat('#ffffff', { map: Tex.stripes('#1a1a1a', '#ffffff') }));
  arm.position.set(0, 0.52, 0); arm.rotation.z = 0.22; g.add(arm);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), mat('#ffffff', { emissive: '#ffffff', ei: 1.5 })); star.position.z = 0.08; g.add(star);
  if (glowy) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), glow('#ffd23f', 0.15)); g.add(h); }
  g.scale.setScalar(1.15);
  return g;
}

export function makeScript() {
  // the glowing fresh script held by the monster
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 128; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#fffdf6'; x.fillRect(0, 0, 128, 160);
  x.fillStyle = '#d2122e'; x.font = 'bold 18px sans-serif'; x.fillText('FINAL CUT', 14, 26);
  x.fillStyle = '#333'; for (let i = 0; i < 9; i++) x.fillRect(14, 40 + i * 12, 60 + (i * 37) % 40, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.15), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.6 }));
  g.add(p);
  const h = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glow('#fff3b0', 0.2)); g.add(h);
  return g;
}

export function makeSpotlight(color = '#fff3c4') {
  // a hanging studio light with a fake volumetric beam
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.2, 12), mat('#1e1e24', { metal: 0.6, rough: 0.4 }));
  g.add(housing);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16), mat(color, { emissive: color, ei: 3 }));
  lens.rotation.x = Math.PI / 2; lens.position.y = -0.61; g.add(lens);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 4.5, 16, 20, 1, true), glow(color, 0.022));
  beam.position.y = -8.6; g.add(beam);
  return g;
}
