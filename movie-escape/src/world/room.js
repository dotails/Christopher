import * as THREE from 'three';
import { mat, glow, boxGeo, Tex } from './materials.js';
import { makeSpotlight } from './props.js';
import { Door, Pickup, Plate, Mover, Spinner, Sweeper, JumpPad, Zone } from './entities.js';

export const ROOM_SPACING = 60;
export const HALF_W = 20;
export const HALF_D = 22;

// A room is one movie set: geometry, colliders, entities, and its task list.
export class Room {
  constructor(game, index, def) {
    this.game = game;
    this.index = index;
    this.key = index;
    this.cz = -ROOM_SPACING * index;
    this.y = 0;
    this.gravity = 34;
    this.killY = -6;
    this.killSplash = false;
    Object.assign(this, def);
    this.group = new THREE.Group();
    this.group.position.z = this.cz;
    game.scene.add(this.group);
    this.entities = [];
    this.tasks = [];
    this.blockers = [];
    this.spawn = new THREE.Vector3(0, 0, this.cz + 16);
    this.spawnBack = new THREE.Vector3(0, 0, this.cz - 17);
    this.exitDoor = null;
    this.visited = false;
    this.completed = false;
  }

  // ---------- tasks ----------
  addTask(id, text, total = 1) {
    const t = { id, text, total, count: 0, done: false, targets: [], room: this };
    this.tasks.push(t);
    return t;
  }
  task(id) { return this.tasks.find((t) => t.id === id); }
  progress(id, n = 1) {
    const t = this.task(id);
    if (!t || t.done) return;
    t.count = Math.min(t.total, t.count + n);
    if (t.count >= t.total) t.done = true;
    this.game.onTaskProgress(this, t);
  }
  allDone() { return this.tasks.length > 0 && this.tasks.every((t) => t.done); }

  add(e) { this.entities.push(e); return e; }

  // ---------- geometry helpers (local coordinates; y0 = bottom) ----------
  box(x, y0, z, w, h, d, m, o = {}) {
    const geo = boxGeo(w, h, d, o.tile ?? 2, o.round ?? 0);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y0 + h / 2, z);
    mesh.castShadow = o.cast ?? (h < 10 && w * d < 120);
    mesh.receiveShadow = o.receive ?? true;
    (o.parent || this.group).add(mesh);
    let collider = null;
    if (o.collide !== false) {
      collider = this.game.world.addBox(this.key, x - w / 2, this.y + y0, this.cz + z - d / 2, x + w / 2, this.y + y0 + h, this.cz + z + d / 2, o.colOpts || {});
    }
    if (o.blocker) this.blockers.push(mesh);
    return { mesh, collider };
  }

  // invisible collider only
  solid(x0, y0, z0, x1, y1, z1, opts = {}) {
    return this.game.world.addBox(this.key, Math.min(x0, x1), y0, this.cz + Math.min(z0, z1), Math.max(x0, x1), y1, this.cz + Math.max(z0, z1), opts);
  }

  cyl(x, y0, z, r, h, m, o = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(o.rTop ?? r, r, h, o.seg ?? 24), m);
    mesh.position.set(x, y0 + h / 2, z);
    mesh.castShadow = o.cast ?? true; mesh.receiveShadow = true;
    (o.parent || this.group).add(mesh);
    let collider = null;
    if (o.collide !== false) collider = this.game.world.addCyl(this.key, x, this.cz + z, r, this.y + y0, this.y + y0 + h, o.colOpts || {});
    return { mesh, collider };
  }

  deco(mesh, x = 0, y = 0, z = 0) { mesh.position.set(x, y, z); this.group.add(mesh); return mesh; }

  label(text, w, h, bg, fg, x, y, z, ry = 0, emissive = true) {
    const tex = Tex.sign(text, bg, fg, 512, Math.round(512 * h / w));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: emissive ? '#ffffff' : '#000000', emissiveMap: emissive ? tex : null, emissiveIntensity: emissive ? 0.55 : 0, roughness: 0.6 }));
    m.position.set(x, y, z); m.rotation.y = ry;
    this.group.add(m);
    return m;
  }

  // ---------- gameplay helpers ----------
  pickupFor(task, mesh, x, y, z, parent = null, opts = {}) {
    const p = this.add(new Pickup(this.game, parent || this.group, mesh, new THREE.Vector3(x, y, z), () => {
      this.game.audio.sfx('collect');
      this.progress(task.id);
    }, opts));
    p.taskId = task.id;
    task.targets.push(p);
    return p;
  }

  plateFor(task, x, z, y = 0, color = '#ff4f9a') {
    const pl = this.add(new Plate(this.game, this, x, z, y, () => {
      this.game.audio.sfx('plate');
      this.progress(task.id);
    }, { color }));
    task.targets.push(pl);
    return pl;
  }

  zoneFor(task, x, y, z, radius, opts = {}) {
    const zn = this.add(new Zone(this.game, new THREE.Vector3(x, this.y + y, this.cz + z), radius, () => {
      if (opts.sfx) this.game.audio.sfx(opts.sfx);
      this.progress(task.id);
    }, opts));
    task.targets.push(zn);
    return zn;
  }

  // moving box platform: [dx,dy,dz] is the travel vector
  mover(x, y0, z, w, h, d, m, travel, period = 4, phase = 0, o = {}) {
    const { mesh, collider } = this.box(x, y0, z, w, h, d, m, { round: o.round ?? 0.18, ...o });
    const from = mesh.position.clone();
    const to = from.clone().add(new THREE.Vector3(...travel));
    const mv = this.add(new Mover(collider, mesh, from, to, period, phase, this.cz));
    mv.fixed(0);
    return mv;
  }

  spinner(x, y0, z, r, h, m, w) {
    const { mesh, collider } = this.cyl(x, y0, z, r, h, m, { seg: 32 });
    return this.add(new Spinner(collider, mesh, w));
  }

  sweeper(o) {
    const s = this.add(new Sweeper(this.game, this.group, o));
    s.z = this.cz + o.z;
    this.game.world.addCyl(this.key, o.x, this.cz + o.z, 0.8, this.y + (o.base ?? 0), this.y + o.y1 + 0.3);
    return s;
  }

  pad(x, z, y = 0, power = 22, color = '#27d3c3') {
    const p = this.add(new JumpPad(this.game, this, x, z, y, power, color));
    return p;
  }

  // ---------- perimeter walls with door gaps ----------
  walls({ m, h = 14, entrance = true, exit = true, low = 0, westGap = null, exitH = 9, trim = null }) {
    const H = low || h;
    const opts = { blocker: !low, cast: false, tile: 3 };
    const W = HALF_W, D = HALF_D;
    // east / west
    this.box(W + 0.5, -1, 0, 1, H + 1, D * 2 + 2, m, opts);
    if (westGap) {
      const [g0, g1, gh] = westGap;
      this.box(-W - 0.5, -1, (D + 1 + g1) / 2, 1, H + 1, D + 1 - g1, m, opts);
      this.box(-W - 0.5, -1, (-D - 1 + g0) / 2, 1, H + 1, D + 1 + g0, m, opts);
      this.box(-W - 0.5, gh, (g0 + g1) / 2, 1, H - gh, g1 - g0, m, opts);
    } else this.box(-W - 0.5, -1, 0, 1, H + 1, D * 2 + 2, m, opts);
    // south (entrance) and north (exit)
    const zs = [[D + 0.5, entrance], [-D - 0.5, exit]];
    for (const [z, gap] of zs) {
      if (gap) {
        this.box(-12.5, -1, z, 17, H + 1, 1, m, opts);
        this.box(12.5, -1, z, 17, H + 1, 1, m, opts);
        if (H > exitH) this.box(0, exitH, z, 8, H - exitH, 1, m, opts);
      } else this.box(0, -1, z, W * 2 + 2, H + 1, 1, m, opts);
    }
    if (low) {
      // invisible tall boundary so nobody wanders off the set
      const T = 40;
      this.solid(W, -1, -D - 1, W + 1, T, D + 1);
      this.solid(-W - 1, -1, -D - 1, -W, T, D + 1);
      for (const [z0, z1, gap] of [[D, D + 1, entrance], [-D - 1, -D, exit]]) {
        if (gap) {
          this.solid(-W - 1, H, z0, -4, T, z1);
          this.solid(4, H, z0, W + 1, T, z1);
          this.solid(-4, exitH, z0, 4, T, z1);
        } else this.solid(-W - 1, H, z0, W + 1, T, z1);
      }
    }
    if (trim) {
      // a decorative skirting band along the walls
      const tm = trim;
      this.box(0, 0, -D + 0.15, W * 2, 1.2, 0.3, tm, { collide: false, cast: false });
      this.box(W - 0.15, 0, 0, 0.3, 1.2, D * 2, tm, { collide: false, cast: false });
      this.box(-W + 0.15, 0, westGap ? 14.5 : 0, 0.3, 1.2, westGap ? 15 : D * 2, tm, { collide: false, cast: false });
      if (westGap) this.box(-W + 0.15, 0, -14.5, 0.3, 1.2, 15, tm, { collide: false, cast: false });
    }
  }

  // studio lighting rig floating above the set
  rig(color = '#fff3c4', count = 4) {
    const trussM = mat('#3a3a44', { metal: 0.7, rough: 0.35 });
    for (let i = 0; i < 2; i++) {
      const z = i === 0 ? 10 : -10;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(44, 0.5, 0.5), trussM);
      beam.position.set(0, 18, z); this.group.add(beam);
      const beam2 = beam.clone(); beam2.position.y = 18.9; this.group.add(beam2);
      for (let k = 0; k < count; k++) {
        const s = makeSpotlight(color);
        s.position.set(-15 + k * (30 / (count - 1)), 17.2, z);
        s.rotation.z = (k - (count - 1) / 2) * 0.12;
        s.rotation.x = i === 0 ? 0.18 : -0.18;
        this.group.add(s);
      }
    }
  }

  // exit door in the north wall gap (x -4..4, y 0..9)
  makeExitDoor(style, m) {
    let mesh, collider;
    if (style === 'vault') {
      mesh = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.9, 40), m);
      disc.rotation.x = Math.PI / 2; disc.castShadow = true; mesh.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.22, 8, 40), mat('#ffd23f', { metal: 0.9, rough: 0.2 }));
      ring.position.z = 0.5; mesh.add(ring);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.6, 20), mat('#ffd23f', { metal: 0.9, rough: 0.2 }));
      hub.rotation.x = Math.PI / 2; hub.position.z = 0.6; mesh.add(hub);
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 4.4, 8), mat('#d8d8e0', { metal: 0.9, rough: 0.2 }));
        sp.rotation.z = i * Math.PI / 3; sp.position.z = 0.75; mesh.add(sp);
      }
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8), mat('#9aa0ad', { metal: 0.8 }));
        b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * 4.1, Math.sin(a) * 4.1, 0.5); mesh.add(b);
      }
      mesh.position.set(0, 4.6, -21.2);
      this.group.add(mesh);
      collider = this.solid(-4.6, 0, -21.7, 4.6, 9.2, -20.7);
    } else if (style === 'prop') {
      mesh = new THREE.Group();
      mesh.position.set(0, 0, -21.4);
      const panel = new THREE.Mesh(boxGeo(7, 8.6, 0.4, 2), m);
      panel.position.y = 4.3; panel.castShadow = true; mesh.add(panel);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 8.4), mat('#c8a46a', { map: Tex.planks('#c8a46a') }));
      back.position.set(0, 4.3, -0.21); back.rotation.y = Math.PI; mesh.add(back);
      // "PROP" stencil on the back
      const st = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.4), new THREE.MeshBasicMaterial({ map: Tex.sign('PROP · DO NOT USE', '#c8a46a', '#7a1010', 512, 144), transparent: true }));
      st.position.set(0, 4.5, -0.23); st.rotation.y = Math.PI; mesh.add(st);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), mat('#ffd23f', { metal: 0.9, rough: 0.2 }));
      knob.position.set(2.6, 4, 0.3); mesh.add(knob);
      this.group.add(mesh);
      collider = null;
    } else {
      mesh = new THREE.Mesh(boxGeo(8, 9, 0.8, 2), m);
      mesh.position.set(0, 4.5, -22.5 + 0.4);
      mesh.castShadow = true;
      this.group.add(mesh);
      collider = this.solid(-4, 0, -22.6, 4, 9, -21.6);
    }
    // EXIT sign
    const sign = this.label('EXIT', 3, 0.9, '#1a0d0d', '#ff3b3b', 0, 10, -21.45);
    this.exitSign = sign;
    this.exitDoor = this.add(new Door(this.game, this, mesh, collider, style));
    return this.exitDoor;
  }

  setExitSignOpen(open) {
    if (!this.exitSign) return;
    this.exitSign.material.map = Tex.sign('EXIT', open ? '#0d1a0f' : '#1a0d0d', open ? '#4cd964' : '#ff3b3b', 512, 154);
    this.exitSign.material.emissiveMap = this.exitSign.material.map;
    this.exitSign.material.needsUpdate = true;
  }
}

// The short backstage corridor between room i and room i+1.
export function buildCorridor(game, i) {
  const cz = -ROOM_SPACING * i;
  const key = i;
  const g = new THREE.Group();
  game.scene.add(g);
  const floorM = mat('#3b3346', { map: Tex.planks('#5a4a3a'), rough: 0.8 });
  const wallM = mat('#2a2234', { map: Tex.brick('#3a2c44', '#231a2b'), rough: 0.9 });
  const z0 = cz - 22, z1 = cz - 38, zc = (z0 + z1) / 2, len = 16;
  const add = (geo, m, x, y, z, collide = true, blocker = false) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.receiveShadow = true; g.add(mesh);
    if (blocker) game.blockers.push(mesh);
    return mesh;
  };
  add(boxGeo(8, 1, len, 2), floorM, 0, -0.5, zc);
  game.world.addBox(key, -4, -1, z1, 4, 0, z0);
  add(boxGeo(1, 10, len - 2, 3), wallM, 4.5, 4.5, zc, true, true);
  add(boxGeo(1, 10, len - 2, 3), wallM, -4.5, 4.5, zc, true, true);
  game.world.addBox(key, 4, -1, z1, 5, 30, z0);
  game.world.addBox(key, -5, -1, z1, -4, 30, z0);
  add(boxGeo(10, 1, len - 2, 3), wallM, 0, 9.5, zc, false, true);
  // backstage dressing: cables, a lamp strip, and a "next scene" sign
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, len - 3), mat('#fff3c4', { emissive: '#fff3c4', ei: 2 }));
  strip.position.set(0, 8.9, zc); g.add(strip);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshStandardMaterial({ map: Tex.sign(`SCENE ${i + 2} ▶`, '#1b1026', '#ffd23f', 512, 128), emissive: '#ffffff', emissiveIntensity: 0.4 }));
  sign.material.emissiveMap = sign.material.map;
  sign.position.set(3.95, 5.5, zc); sign.rotation.y = -Math.PI / 2; g.add(sign);
  const sign2 = sign.clone(); sign2.material = sign.material.clone();
  sign2.material.map = Tex.sign(`◀ SCENE ${i + 1}`, '#1b1026', '#27d3c3', 512, 128); sign2.material.emissiveMap = sign2.material.map;
  sign2.position.set(-3.95, 5.5, zc); sign2.rotation.y = Math.PI / 2; g.add(sign2);
  for (let k = 0; k < 3; k++) {
    const crate = new THREE.Mesh(boxGeo(1.2, 1.2, 1.2, 1.2, 0.08), mat('#b08850', { map: Tex.planks('#b08850') }));
    crate.position.set(k % 2 ? 3.2 : -3.2, 0.6, zc - 5 + k * 5); crate.rotation.y = k; crate.castShadow = true; g.add(crate);
    game.world.addBox(key, crate.position.x - 0.7, 0, crate.position.z - 0.7, crate.position.x + 0.7, 1.2, crate.position.z + 0.7);
  }
  return g;
}
