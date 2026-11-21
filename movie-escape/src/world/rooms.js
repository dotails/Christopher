import * as THREE from 'three';
import { Room } from './room.js';
import { mat, glow, Tex, boxGeo, basic } from './materials.js';
import { makeReel, makeKey, makeBomb, makeBriefcase, makeIdol, makeCell, makeDetonator } from './props.js';
import { BoulderLane, FlameJet, Carryable, Zone, Entity } from './entities.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Little animated decorations that just need a per-frame callback.
class Anim extends Entity {
  constructor(fn) { super(); this.fn = fn; this.t = 0; }
  frame(dt, game) { this.t += dt; this.fn(this.t, dt, game); }
}

// =====================================================================
// SCENE 1 — THE HEIST
// =====================================================================
export function buildHeist(game) {
  const r = new Room(game, 0, {
    name: 'THE HEIST', music: 'heist',
    env: { bg: '#1c1426', fog: ['#1c1426', 45, 130], hemi: ['#ffe9c9', '#4a2a50', 0.85], sun: ['#fff1d6', 1.6] },
    killY: -6,
  });
  r.spawn.set(0, 0, r.cz + 15);
  const floorM = mat('#ffffff', { map: Tex.checker('#e2d6b8', '#1f8a84'), rough: 0.4 });
  r.box(0, -1, 0, 40, 1, 44, floorM, { tile: 4, cast: false });
  const wallM = mat('#ffffff', { map: Tex.tiles('#8c3555', '#5e1f37'), rough: 0.75 });
  const goldM = mat('#ffc93c', { metal: 0.85, rough: 0.25, emissive: '#3a2400', ei: 0.4 });
  r.walls({ m: wallM, entrance: false, exit: true, westGap: [-6, 6, 12], trim: goldM });
  r.rig('#fff3c4');
  r.label('FIRST NATIONAL BANK OF CINEMA', 16, 1.6, '#2b1640', '#ffd23f', 0, 12.4, -21.45);

  // marble columns
  const colM = mat('#efe6cf', { rough: 0.45 });
  for (const [x, z] of [[-17.8, -19.8], [17.8, -19.8], [-17.8, 19.8], [17.8, 19.8]]) {
    r.cyl(x, 0, z, 1.1, 14, colM, { seg: 20 });
    r.cyl(x, 0, z, 1.5, 0.8, goldM, { collide: false });
  }

  // tasks
  const tReels = r.addTask('reels', 'Collect 5 golden film reels', 5);
  const tAlarm = r.addTask('alarms', 'Press the 3 alarm switches', 3);
  const tKey = r.addTask('key', 'Grab the vault key', 1);

  // --- crate staircase (reel on top)
  const crateM = mat('#c79a5b', { map: Tex.planks('#c79a5b'), rough: 0.8 });
  r.box(-10, 0, 12, 2.5, 1.5, 2.5, crateM, { round: 0.12 });
  r.box(-13.5, 0, 12, 2.5, 3, 2.5, crateM, { round: 0.12 });
  r.box(-17, 0, 12, 2.5, 4.5, 2.5, crateM, { round: 0.12 });
  r.pickupFor(tReels, makeReel(), -17, 5.7, 12);
  r.pickupFor(tReels, makeReel(), 9, 1.3, 10);

  // --- teller counter
  r.box(16, 0, 3, 6, 1.3, 6, mat('#5e2a3c', { map: Tex.planks('#7a3a50') }), { round: 0.15 });
  r.box(16, 1.3, 3, 6.2, 0.12, 6.2, goldM, { collide: false });
  r.pickupFor(tReels, makeReel(), 16, 2.5, 3);

  // --- laser sweepers
  r.sweeper({ x: 11, z: -11, y0: 0.25, y1: 0.9, length: 6.5, w: 1.25, laser: true, thick: 0.8 });
  r.sweeper({ x: -8, z: -2, y0: 0.25, y1: 0.9, length: 5.5, w: -1.05, laser: true, thick: 0.8, phase: 1 });
  r.pickupFor(tReels, makeReel(), 12, 1.3, -8);

  // --- alarm switches
  r.plateFor(tAlarm, 14, 15, 0, '#ff3b5c');
  r.plateFor(tAlarm, -12, -2, 0, '#ff3b5c');
  r.plateFor(tAlarm, 15, -15, 0, '#ff3b5c');

  // --- vault-key tower: static → moving → static
  const platM = mat('#ffffff', { map: Tex.stripes('#27d3c3', '#e9fffb'), rough: 0.35 });
  r.box(0, 0, -5, 3, 1.5, 3, platM, { round: 0.2 });
  r.mover(-4, 2.7, -9.5, 3, 0.5, 3, mat('#ffffff', { map: Tex.stripes('#ff4f9a', '#ffe1ef') }), [8, 0, 0], 4.5);
  r.box(0, 0, -14, 3, 5, 3, platM, { round: 0.2 });
  const key = r.pickupFor(tKey, makeKey(), 0, 6.3, -14);
  key.spin = 1.2;

  // --- jump pad to the high shelf
  r.pad(-6, -11, 0, 20);
  r.box(-8, 4.5, -16.5, 3.6, 0.5, 3.2, mat('#ffffff', { map: Tex.stripes('#ffd23f', '#fff6d6') }), { round: 0.2 });
  r.pickupFor(tReels, makeReel(), -8, 6.2, -16.5);

  // --- dressing: money pallets, gold bars, cameras, ropes
  const cashM = mat('#5fbf6a', { map: Tex.stripes('#5fbf6a', '#3f9a4b'), rough: 0.7 });
  r.box(-17, 0, -9, 3, 1.2, 3, cashM, { round: 0.1 });
  r.box(-17, 1.2, -9, 2.2, 0.8, 2.2, cashM, { round: 0.1 });
  r.box(-17.5, 0, -16, 3, 1, 4, cashM, { round: 0.1 });
  const barGeo = boxGeo(0.8, 0.35, 0.4, 1, 0.06);
  for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) {
    const b = new THREE.Mesh(barGeo, goldM);
    b.position.set(-17 + (j - i / 2) * 0.85, 2.0 + (3 - i) * 0.36, -9);
    b.castShadow = true; r.group.add(b);
  }
  for (const [x, z, ry] of [[19.3, 18, -2.4], [-19.3, -18, 0.8], [19.3, -18, -0.8]]) {
    const cam = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 1.2), mat('#e8e8ee'));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), mat('#ff2030', { emissive: '#ff0020', ei: 3 }));
    lens.position.z = 0.61; body.add(lens); cam.add(body);
    cam.position.set(x, 11, z); cam.rotation.set(0.5, ry, 0); r.group.add(cam);
    r.add(new Anim((t) => { cam.rotation.y = ry + Math.sin(t * 0.7) * 0.5; }));
  }

  // --- THE GREAT DOOR (west wall) — sealed until the very end
  const gd = { slots: [], open: false, k: 0 };
  const woodM = mat('#6b3a1e', { map: Tex.planks('#7a4526'), rough: 0.7 });
  const mkLeaf = (side) => {
    const pivot = new THREE.Group(); pivot.position.set(-20.5, 0, side * 6);
    const leaf = new THREE.Mesh(boxGeo(0.8, 12, 6, 2), woodM); leaf.position.set(0, 6, -side * 3); leaf.castShadow = true;
    pivot.add(leaf);
    for (const y of [1.5, 6, 10.5]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 6), goldM); band.position.set(0, y, -side * 3); pivot.add(band);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 8, 16), goldM); ring.position.set(0.5, 5.5, -side * 0.8); ring.rotation.y = Math.PI / 2; pivot.add(ring);
    r.group.add(pivot);
    return pivot;
  };
  gd.left = mkLeaf(1); gd.right = mkLeaf(-1);
  const frameM = goldM;
  r.box(-19.9, 0, 6.4, 0.6, 12.6, 0.8, frameM, { collide: false });
  r.box(-19.9, 0, -6.4, 0.6, 12.6, 0.8, frameM, { collide: false });
  r.box(-19.9, 12, 0, 0.6, 0.8, 13.6, frameM, { collide: false });
  gd.collider = r.solid(-21, 0, -6, -19.95, 12, 6);
  // chains + padlock
  gd.chains = new THREE.Group();
  const chainM = mat('#9aa0ad', { metal: 0.9, rough: 0.3 });
  for (const s of [1, -1]) {
    for (let i = 0; i < 16; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 10), chainM);
      const k = i / 15 - 0.5;
      link.position.set(-19.75, 6 + k * 10, k * 10 * s);
      link.rotation.set(i % 2 ? Math.PI / 2 : 0, Math.PI / 2, s * 0.78);
      gd.chains.add(link);
    }
  }
  const lock = new THREE.Group();
  const lb = new THREE.Mesh(boxGeo(0.6, 1.6, 1.4, 1, 0.15), goldM); lock.add(lb);
  const sh = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.12, 8, 16, Math.PI), chainM); sh.position.y = 0.8; sh.rotation.y = Math.PI / 2; lock.add(sh);
  const q = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: Tex.sign('?', '#ffc93c', '#2b1640', 128, 128) }));
  q.position.x = 0.31; q.rotation.y = Math.PI / 2; lock.add(q);
  lock.position.set(-19.55, 6, 0);
  gd.chains.add(lock);
  r.group.add(gd.chains);
  // four slots for the golden clapperboards
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.4), mat('#1b1026', { emissive: '#ffd23f', ei: 0.05 }));
    s.position.set(-19.85, 9.4, -3.3 + i * 2.2);
    r.group.add(s); gd.slots.push(s);
  }
  r.label('THE GREAT DOOR', 7, 1.1, '#2b1640', '#ffd23f', -19.4, 13.3, 0, Math.PI / 2);
  // velvet ropes in front of it
  const ropeM = mat('#c0182d', { rough: 0.5 });
  for (const z of [-7, -2.5, 2.5, 7]) r.cyl(-16.5, 0, z, 0.15, 1.3, goldM, { collide: false, seg: 10 });
  for (const [a, b] of [[-7, -2.5], [2.5, 7]]) {
    const rope = new THREE.Mesh(new THREE.TorusGeometry((b - a) / 2, 0.07, 6, 16, Math.PI), ropeM);
    rope.position.set(-16.5, 1.25, (a + b) / 2); rope.rotation.set(0, Math.PI / 2, Math.PI);
    r.group.add(rope);
  }
  // the light beyond
  gd.beyond = new THREE.Group();
  const lf = new THREE.Mesh(boxGeo(14, 1, 12, 2), mat('#ffffff', { emissive: '#fff6d8', ei: 1.4 }));
  lf.position.set(-28, -0.5, 0); gd.beyond.add(lf);
  const lw = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), basic('#ffffff'));
  lw.position.set(-33, 6, 0); lw.rotation.y = Math.PI / 2; gd.beyond.add(lw);
  for (let i = 0; i < 6; i++) {
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(2 + i, 14), glow('#fff3c4', 0.08));
    ray.position.set(-18 + i * 0.5, 6, (i - 2.5) * 1.6); ray.rotation.set(0, Math.PI / 2 + (i - 2.5) * 0.25, 0.3);
    gd.beyond.add(ray);
  }
  gd.beyond.visible = false;
  r.group.add(gd.beyond);
  game.world.addBox(r.key, -34, -1, r.cz - 6, -21, 0, r.cz + 6);
  r.greatDoor = gd;

  r.makeExitDoor('vault', mat('#9aa0ad', { map: Tex.metal('#a8aeb9'), metal: 0.75, rough: 0.3 }));
  r.clapperSpot = null; // the Great Door itself is the final task
  return r;
}

// =====================================================================
// SCENE 2 — ROOFTOP CHASE
// =====================================================================
export function buildRooftop(game) {
  const r = new Room(game, 1, {
    name: 'ROOFTOP CHASE', music: 'rooftop',
    env: { bg: '#0b1030', fog: ['#141a4a', 40, 150], hemi: ['#8a9bff', '#2a1450', 1.0], sun: ['#b8c8ff', 1.7] },
    killY: -9,
  });
  const roofM = mat('#ffffff', { map: Tex.tiles('#6c6f86', '#4a4c60'), rough: 0.8 });
  const bldM = mat('#ffffff', { map: Tex.windows(0.35), emissive: '#ffffff', emissiveMap: Tex.windows(0.35), ei: 0.6, rough: 0.8 });
  const brickM = mat('#ffffff', { map: Tex.brick('#8a3b3b', '#4a2020'), rough: 0.9 });
  // buildings (roofs) — the alleys between them are bottomless
  const roofs = [[-20, 10, 20, 22], [-20, -6, -4, 6], [4, -6, 20, 6], [-20, -22, 20, -12]];
  for (const [x0, z0, x1, z1] of roofs) {
    const w = x1 - x0, d = z1 - z0;
    r.box((x0 + x1) / 2, -0.6, (z0 + z1) / 2, w, 0.6, d, roofM, { tile: 3, cast: false });
    r.box((x0 + x1) / 2, -40, (z0 + z1) / 2, w - 0.4, 39.4, d - 0.4, bldM, { collide: false, tile: 6, cast: false });
    // parapet trims
    r.box((x0 + x1) / 2, -0.6, z0 + 0.15, w, 0.9, 0.3, brickM, { collide: false, cast: false });
    r.box((x0 + x1) / 2, -0.6, z1 - 0.15, w, 0.9, 0.3, brickM, { collide: false, cast: false });
  }
  r.solid(-20, -40, 10, 20, -0.6, 22); r.solid(-20, -40, -6, -4, -0.6, 6); r.solid(4, -40, -6, 20, -0.6, 6); r.solid(-20, -40, -22, 20, -0.6, -12);
  r.walls({ m: brickM, low: 1.3, entrance: true, exit: true });
  // stairwell huts around the entrance and exit
  for (const z of [21, -21]) {
    r.box(-6, 0, z, 4, 11, 2.2, brickM, { tile: 3, blocker: true });
    r.box(6, 0, z, 4, 11, 2.2, brickM, { tile: 3, blocker: true });
    r.box(0, 9, z, 8, 2, 2.2, brickM, { tile: 3 });
  }
  // plank bridge + window-washer ferries
  const plankM = mat('#b08850', { map: Tex.planks('#b08850'), rough: 0.8 });
  r.box(-12.75, -0.3, 8, 2.5, 0.3, 4.4, plankM, { round: 0.06 });
  const liftM = mat('#ffffff', { map: Tex.hazard(), rough: 0.5 });
  r.mover(-12, -0.5, -7.5, 3, 0.5, 3, liftM, [0, 0, -3], 3.6, 0);
  r.mover(12, -0.5, -7.5, 3, 0.5, 3, liftM, [0, 0, -3], 3.6, 0.5);

  const tBombs = r.addTask('bombs', 'Defuse 4 ticking bombs', 4);
  const tCase = r.addTask('case', 'Steal the briefcase from the tower', 1);
  const tDeliver = r.addTask('deliver', 'Deliver it to the getaway chopper', 1);

  const bombs = [];
  bombs.push(r.pickupFor(tBombs, makeBomb(), -12, 1.2, 0));
  bombs.push(r.pickupFor(tBombs, makeBomb(), -12.7, 1.2, 8));
  bombs.push(r.pickupFor(tBombs, makeBomb(), 16, 1.2, -18));
  // billboard ledge reached with a bounce pad
  r.pad(8, 15, 0, 20, '#ff4f9a');
  r.box(14, 5.5, 18.5, 5, 0.5, 2.6, mat('#2b2f45', { metal: 0.5, rough: 0.4 }), { round: 0.1 });
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), new THREE.MeshStandardMaterial({ map: Tex.sign('REEL HERO 2', '#ff4f9a', '#fff6e3', 512, 228), emissive: '#ffffff', emissiveIntensity: 0.7 }));
  bb.material.emissiveMap = bb.material.map;
  bb.position.set(14, 8.2, 19.8); bb.rotation.y = Math.PI; r.group.add(bb);
  bombs.push(r.pickupFor(tBombs, makeBomb(), 14, 7.2, 18.5));
  r.add(new Anim((t) => { bombs.forEach((b) => { if (b.mesh.userData.blink) b.mesh.userData.blink.material.emissiveIntensity = (Math.sin(t * 10) > 0) ? 3 : 0.3; }); }));

  // the tower + window-washer lift
  r.box(16, 0, -1, 6, 10, 6, bldM, { tile: 4, blocker: false });
  r.box(16, 10, -1, 6.4, 0.4, 6.4, roofM, { round: 0.1 });
  r.mover(10.7, -0.5, -1, 2.6, 0.5, 2.6, mat('#ffd23f', { map: Tex.hazard() }), [0, 10.1, 0], 8, 0);
  const cables = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 14, 4), mat('#222'));
  cables.position.set(10.7, 7, -2.2); r.group.add(cables);
  const crane = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 0.3), mat('#ffd23f'));
  crane.position.set(11.5, 14, -1); r.group.add(crane);
  r.box(13.2, 10.4, -1, 0.3, 3.8, 0.3, mat('#ffd23f'), { collide: false });

  const caseItem = r.add(new Carryable(game, r.group, makeBriefcase(), V(16, 11.2, -1), () => {
    r.progress('case');
    game.say(["Got the briefcase! Now get it to the chopper.", "Don't drop it. Seriously. It's the only one."]);
  }));
  tCase.targets.push(caseItem);
  r.carry = caseItem;

  // helipad + chopper
  const padM = new THREE.MeshStandardMaterial({ map: Tex.sign('H', '#2b2f45', '#ffd23f', 256, 256), roughness: 0.6 });
  const hp = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.12, 32), [mat('#ffd23f'), padM, mat('#2b2f45')]);
  hp.position.set(-12, 0.06, -17); r.group.add(hp);
  const heli = new THREE.Group();
  const hM = mat('#e0213b', { rough: 0.3, metal: 0.2 });
  const cab = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), hM); cab.scale.set(1, 0.85, 1.25); cab.position.y = 1.9; heli.add(cab);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), mat('#9be7ff', { rough: 0.05, metal: 0.3, emissive: '#1a4a6a' }));
  glass.position.set(0, 2.1, 0.8); glass.rotation.x = 0.9; heli.add(glass);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.45, 4, 10), hM); tail.rotation.x = Math.PI / 2; tail.position.set(0, 2.2, -3.4); heli.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.8), hM); fin.position.set(0, 2.7, -5.2); heli.add(fin);
  const skidM = mat('#333');
  for (const x of [-1.1, 1.1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 3.6), skidM); sk.position.set(x, 0.3, 0); heli.add(sk); }
  const rotor = new THREE.Group(); rotor.position.y = 3.5; heli.add(rotor);
  for (let i = 0; i < 2; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(8, 0.06, 0.35), skidM); bl.rotation.y = i * Math.PI / 2; rotor.add(bl); }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8), skidM); mast.position.y = 3.2; heli.add(mast);
  heli.position.set(-12, 0, -16.5); heli.rotation.y = 0.3;
  r.group.add(heli);
  r.heli = heli; r.heliRotor = rotor;
  r.solid(-13.6, 0, -18.3, -10.4, 3.2, -14.8);
  r.box(-8.6, 0, -15.2, 1.6, 1.6, 1.6, mat('#c79a5b', { map: Tex.planks('#c79a5b') }), { round: 0.1 });
  r.add(new Anim((t, dt) => { rotor.rotation.y += dt * (r.heliFast ? 30 : 4); }));
  const dz = r.zoneFor(tDeliver, -12, 0, -16.5, 3.6, { needCarry: caseItem, height: 4 });
  dz.onEnter = () => {
    caseItem.deliver();
    game.audio.sfx('bigcollect');
    r.heliFast = true;
    r.progress('deliver');
  };

  // rooftop dressing: AC units, water tower, antennas
  const acM = mat('#c9ccd6', { map: Tex.metal('#c9ccd6'), metal: 0.5, rough: 0.4 });
  for (const [x, z] of [[-17, 14], [-8, 19], [17, -15], [-17, -2]]) r.box(x, 0, z, 2, 1.4, 2, acM, { round: 0.1 });
  const tower = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3, 16), mat('#8a5a3a', { map: Tex.planks('#8a5a3a') }));
  tank.position.y = 5.2; tower.add(tank);
  const roofc = new THREE.Mesh(new THREE.ConeGeometry(2, 1.2, 16), mat('#5a3a2a')); roofc.position.y = 7.3; tower.add(roofc);
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.8, 6), skidM); l.position.set(x, 1.9, z); tower.add(l); }
  tower.position.set(-16, 0, 17.5); r.group.add(tower);
  r.solid(-17.8, 0, 15.7, -14.2, 6.7, 19.3);

  // the city skyline backdrop
  const sky = new THREE.Group();
  const rand = (() => { let s = 7; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    const dist = 55 + rand() * 40;
    const w = 6 + rand() * 10, h = 10 + rand() * 45;
    const b = new THREE.Mesh(boxGeo(w, h + 40, w, 6), bldM);
    b.position.set(Math.cos(a) * dist, h / 2 - 25, Math.sin(a) * dist);
    sky.add(b);
    if (rand() < 0.25) {
      const n = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.2, 0.3), mat('#ff4f9a', { emissive: ['#ff4f9a', '#27d3c3', '#ffd23f'][i % 3], ei: 2 }));
      n.position.set(b.position.x, h - 4, b.position.z); n.lookAt(0, h - 4, 0); sky.add(n);
    }
  }
  const street = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat('#ff9a3d', { emissive: '#ff6a1a', ei: 0.4, rough: 1 }));
  street.rotation.x = -Math.PI / 2; street.position.y = -38; sky.add(street);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), basic('#fff6d8'));
  moon.position.set(-60, 55, -70); sky.add(moon);
  const moonGlow = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 16), glow('#b8c8ff', 0.15)); moonGlow.position.copy(moon.position); sky.add(moonGlow);
  r.group.add(sky);
  r.backdrop = sky;

  r.makeExitDoor('slide', mat('#9aa0ad', { map: Tex.metal('#7d8494'), metal: 0.7, rough: 0.35 }));
  r.clapperSpot = { x: -12, y: 4.9, z: -16.5, hint: 'Snatch the golden clapperboard off the chopper' };
  return r;
}

// =====================================================================
// SCENE 3 — JUNGLE TEMPLE
// =====================================================================
export function buildTemple(game) {
  const r = new Room(game, 2, {
    name: 'JUNGLE TEMPLE', music: 'temple',
    env: { bg: '#16301c', fog: ['#28482c', 35, 120], hemi: ['#d8ffb0', '#3a2a10', 0.9], sun: ['#ffe2a8', 1.9] },
    killY: -0.7, killSplash: '#3fd16b',
  });
  const stoneM = mat('#ffffff', { map: Tex.stone('#b8a888'), rough: 0.85 });
  const darkStone = mat('#ffffff', { map: Tex.stone('#8c7c62'), rough: 0.9 });
  r.box(0, -1, 15, 40, 1, 14, stoneM, { tile: 4, cast: false });
  r.box(0, -1, -15, 40, 1, 14, stoneM, { tile: 4, cast: false });
  // goo pit
  const goo = new THREE.Mesh(new THREE.PlaneGeometry(40, 16, 1, 1), mat('#ffffff', { map: Tex.goo(), emissive: '#1a7a3a', ei: 0.6, rough: 0.2 }));
  goo.rotation.x = -Math.PI / 2; goo.position.set(0, -0.75, 0);
  goo.material.map.repeat.set(4, 1.6);
  r.group.add(goo);
  r.add(new Anim((t) => { goo.material.map.offset.set(t * 0.03, Math.sin(t * 0.5) * 0.05); }));
  r.walls({ m: darkStone, entrance: true, exit: true, trim: mat('#5a8a3a', { rough: 0.8 }) });
  r.rig('#ffe9b0', 3);

  const tTiles = r.addTask('tiles', 'Step on the 4 ancient tiles', 4);
  const tIdols = r.addTask('idols', 'Collect 3 golden idols', 3);
  const tGong = r.addTask('gong', 'Ring the temple gong', 1);

  // north floor: two spinning logs
  const logM = '#8a5a3a';
  r.sweeper({ x: -8, z: 15, y0: 0.2, y1: 1.0, length: 5, w: 1.3, color: logM });
  r.sweeper({ x: 8, z: 15, y0: 0.2, y1: 1.0, length: 5, w: -1.3, color: logM, phase: 1.2 });
  r.plateFor(tTiles, -11, 18, 0, '#ffd23f');
  r.plateFor(tTiles, 11, 18, 0, '#ffd23f');

  // left route: stepping pillars
  const pillarM = mat('#ffffff', { map: Tex.stone('#a89878'), rough: 0.85 });
  const pz = [5.5, 2, -1.5, -5];
  pz.forEach((z, i) => r.cyl(-14, -6, z, 1.2, 6 + (i % 2 ? 0.6 : 0), pillarM, { seg: 14 }));
  r.pickupFor(tIdols, makeIdol(), -14, 1.4, -1.5);

  // centre: big turntable with a log sweeper riding on it
  const tt = r.spinner(0, -6, 0, 6, 6, mat('#ffffff', { map: Tex.stripes('#c9a95a', '#a88a3a'), rough: 0.6 }), 0.55);
  r.sweeper({ x: 0, z: 0, y0: 0.25, y1: 1.05, length: 5.8, w: 1.5, color: '#c0392b' });
  const idolTT = r.pickupFor(tIdols, makeIdol(), 3.6, 4.35, 0, tt.mesh);
  r.turntable = tt;

  // right route: log bridge with a sweeper
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 16.4, 14), mat('#7a4a2a', { map: Tex.planks('#8a5a3a') }));
  bridge.rotation.x = Math.PI / 2; bridge.position.set(13.5, -0.85, 0); bridge.castShadow = true; r.group.add(bridge);
  r.solid(12.4, -1, -8.2, 14.6, 0.05, 8.2);
  r.sweeper({ x: 13.5, z: 0, y0: 0.25, y1: 0.95, length: 3.6, w: 1.6, color: logM, base: 0 });

  // south: stepped pyramid with the gong on top
  r.box(-11, 0, -15, 10, 1.5, 8, stoneM, { tile: 3, round: 0.1 });
  r.box(-11, 1.5, -15, 7, 1.5, 5.6, stoneM, { tile: 3, round: 0.1 });
  r.box(-11, 3, -15, 4, 1.5, 3.2, stoneM, { tile: 3, round: 0.1 });
  const gong = new THREE.Group();
  const goldM = mat('#ffc93c', { metal: 0.85, rough: 0.3, emissive: '#3a2400' });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.15, 28), goldM); disc.rotation.x = Math.PI / 2; disc.position.y = 2.2; gong.add(disc);
  const postM = mat('#5a2a1a');
  for (const x of [-1.6, 1.6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.6, 0.25), postM); p.position.set(x, 1.8, 0); gong.add(p); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 0.3), postM); bar.position.y = 3.6; gong.add(bar);
  gong.position.set(-11, 4.5, -15.9); r.group.add(gong);
  r.gong = disc;
  r.zoneFor(tGong, -11, 4.5, -15, 2.2, { sfx: 'gong' }).onEnter = () => {
    game.audio.sfx('gong'); game.shake(0.3);
    r.add(new Anim((t) => { disc.rotation.z = Math.sin(t * 20) * 0.2 * Math.max(0, 1 - t); }));
    r.progress('gong');
  };

  // boulder lane (south-east)
  r.add(new BoulderLane(game, r, { x: 13, z0: -21.5, z1: -8, r: 1.4, speed: 8, interval: 2.3 }));
  r.pickupFor(tIdols, makeIdol(), 13, 1.4, -19.6);
  r.plateFor(tTiles, 13, -14, 0, '#ffd23f');
  r.plateFor(tTiles, -18, -9.8, 0, '#ffd23f');
  const hole = new THREE.Mesh(new THREE.CircleGeometry(2, 20), basic('#0a0a06'));
  hole.position.set(13, 2, -21.9); r.group.add(hole);

  // dressing: idol heads, torches, vines, palms
  const headM = mat('#ffffff', { map: Tex.stone('#9a8a6a'), rough: 0.9 });
  for (const x of [-19, 19]) {
    const head = new THREE.Group();
    const h = new THREE.Mesh(boxGeo(2.2, 4, 3, 2, 0.3), headM); h.position.y = 2; head.add(h);
    const eyeM = mat('#1a0a00', { emissive: '#ff8800', ei: 1.4 });
    for (const z of [-0.6, 0.6]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.6), eyeM); e.position.set(-Math.sign(x) * 1.1, 2.8, z); head.add(e); }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.8), headM); nose.position.set(-Math.sign(x) * 1.2, 2, 0); head.add(nose);
    head.position.set(x, 5, 2); r.group.add(head);
  }
  const torchM = mat('#5a3a1a');
  for (const [x, z] of [[-19.5, 12], [19.5, 12], [-19.5, -12], [19.5, -12], [-5, -21.5], [5, -21.5]]) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 8), torchM); t.rotation.x = Math.PI; t.position.set(x, 4, z); r.group.add(t);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), glow('#ffa030', 0.9)); f.position.set(x, 4.8, z); r.group.add(f);
    r.add(new Anim((tt) => { f.scale.setScalar(1 + Math.sin(tt * 13 + x) * 0.2); }));
  }
  const vineM = mat('#3a8a3a', { side: THREE.DoubleSide, rough: 0.8 });
  for (let i = 0; i < 14; i++) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 4 + (i % 4)), vineM);
    const side = i % 2 ? 1 : -1;
    v.position.set(side * 19.4, 12 - (2 + (i % 4)) / 2, -18 + i * 2.6); v.rotation.y = Math.PI / 2; r.group.add(v);
  }
  const palm = (x, z) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 7, 8), mat('#8a6a4a')); trunk.position.y = 3.5; trunk.rotation.z = 0.08; g.add(trunk);
    const leafM = mat('#4cb84c', { side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4), leafM); l.geometry.translate(0, 2, 0); l.position.y = 7; l.rotation.set(1.1, i / 7 * Math.PI * 2, 0, 'YXZ'); g.add(l); }
    g.position.set(x, 0, z); r.group.add(g);
    r.cyl(x, 0, z, 0.45, 7, mat('#8a6a4a'), { collide: true, cast: false }).mesh.visible = false;
  };
  palm(-17.5, 20); palm(17.5, 20); palm(-17, -20); palm(18, -20.5);

  r.makeExitDoor('slide', mat('#ffffff', { map: Tex.stone('#9a8a6a'), rough: 0.9 }));
  // archway around the exit
  r.box(-5, 0, -21.3, 1.2, 10, 1.2, headM, { collide: false });
  r.box(5, 0, -21.3, 1.2, 10, 1.2, headM, { collide: false });
  r.box(0, 9.4, -21.3, 11.6, 1.4, 1.4, headM, { collide: false });
  r.clapperSpot = { x: -3.6, y: 4.35, z: 0, parent: tt.mesh, hint: 'Grab the golden clapperboard riding the turntable' };
  return r;
}

// =====================================================================
// SCENE 4 — SPACE STATION (low gravity)
// =====================================================================
export function buildSpace(game) {
  const r = new Room(game, 3, {
    name: 'SPACE STATION', music: 'space',
    env: { bg: '#05030f', fog: ['#0a0820', 60, 220], hemi: ['#a8b8ff', '#401860', 0.85], sun: ['#ffffff', 1.7] },
    killY: -14, gravity: 17,
  });
  const floorM = mat('#ffffff', { map: Tex.metal('#cfd6e6'), metal: 0.4, rough: 0.35 });
  const wallM = mat('#ffffff', { map: Tex.grid('#2a2f4a', '#4a7aff'), rough: 0.5, emissive: '#101840', ei: 0.6 });
  r.box(0, -1, 16, 40, 1, 12, floorM, { tile: 4, cast: false });
  r.box(0, -1, -17, 40, 1, 10, floorM, { tile: 4, cast: false });
  // glowing edge strips on the void
  const edgeM = mat('#3ee8ff', { emissive: '#3ee8ff', ei: 2 });
  r.box(0, -0.1, 10.05, 40, 0.15, 0.15, edgeM, { collide: false, cast: false });
  r.box(0, -0.1, -12.05, 40, 0.15, 0.15, edgeM, { collide: false, cast: false });
  r.walls({ m: wallM, entrance: true, exit: true, trim: edgeM });

  const platM = mat('#ffffff', { map: Tex.grid('#e8ecf8', '#8b5cf6'), rough: 0.3, metal: 0.2 });
  const plat = (x, top, z, w, d) => {
    const b = r.box(x, top - 0.6, z, w, 0.6, d, platM, { round: 0.2 });
    const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.1, d * 0.9), mat('#8b5cf6', { emissive: '#8b5cf6', ei: 2.5 }));
    glowStrip.position.set(x, top - 0.65, z); r.group.add(glowStrip);
    return b;
  };

  const tCells = r.addTask('cells', 'Collect 5 power cells', 5);
  const tCons = r.addTask('consoles', 'Reboot 3 reactor consoles', 3);
  const tDeck = r.addTask('deck', 'Reach the command deck', 1);

  plat(-10, 1.5, 6, 4, 4);
  r.plateFor(tCons, -10, 6, 1.5, '#3ee8ff');
  plat(-15, 4, -1, 3, 3);
  r.pickupFor(tCells, makeCell(), -15, 5.3, -1, null, { beacon: '#3ee8ff' });
  const f3 = r.mover(-10, 2.4, -6, 4, 0.6, 4, platM, [6, 0, 0], 5);
  r.pickupFor(tCells, makeCell(), 0, 1.6, 0, f3.mesh, { beacon: '#3ee8ff' });
  const sp = r.spinner(0, 0.4, 1, 3.2, 0.6, mat('#ffffff', { map: Tex.stripes('#8b5cf6', '#c9b8ff'), rough: 0.3 }), -0.6);
  r.sweeper({ x: 0, z: 1, y0: 1.3, y1: 1.9, length: 3.1, w: 1.4, color: '#ff4f9a', base: 1 });
  plat(8, 3, 6, 3, 3);
  r.plateFor(tCons, 8, 6, 3, '#3ee8ff');
  plat(13, 6.5, -2, 3, 3);
  r.pickupFor(tCells, makeCell(), 13, 7.8, -2, null, { beacon: '#3ee8ff' });
  const f7 = r.mover(6, 0.4, -7, 3, 0.6, 3, platM, [0, 5, 0], 6, 0.25);
  r.pickupFor(tCells, makeCell(), 0, 1.6, 0, f7.mesh, { beacon: '#3ee8ff' });
  plat(0, 0.5, -9, 4, 3);
  r.pickupFor(tCells, makeCell(), 16, 1.3, 18, null, { beacon: '#3ee8ff' });
  r.plateFor(tCons, 14, -17, 0, '#3ee8ff');

  // command deck (high) + bounce pad
  r.pad(-7, -16, 0, 17.5, '#8b5cf6');
  const deck = r.box(0, 7.9, -18, 7, 0.6, 4, platM, { round: 0.2 });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(7, 0.1, 0.1), edgeM); rail.position.set(0, 9.4, -16); r.group.add(rail);
  const consoleM = mat('#1b1026', { emissive: '#3ee8ff', ei: 0.3 });
  const cons = new THREE.Mesh(boxGeo(2.4, 1.2, 0.8, 1, 0.1), consoleM); cons.position.set(0, 9.1, -19.4); r.group.add(cons);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: Tex.sign('LAUNCH', '#05202a', '#3ee8ff', 256, 128) }));
  screen.position.set(0, 10.3, -19.5); r.group.add(screen);
  r.zoneFor(tDeck, 0, 8.4, -18, 3.2, { sfx: 'bell' });

  // space backdrop: starfield + planet + rings
  const starGeo = new THREE.BufferGeometry();
  const N = 1400, arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = 150 + Math.random() * 60;
    const s = Math.sqrt(1 - u * u);
    arr[i * 3] = Math.cos(th) * s * rr; arr[i * 3 + 1] = u * rr; arr[i * 3 + 2] = Math.sin(th) * s * rr;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, fog: false }));
  r.group.add(stars);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(30, 40, 30), new THREE.MeshStandardMaterial({ map: Tex.stripes('#ff8a3d', '#ffb36b'), emissive: '#5a2010', roughness: 0.8, fog: false }));
  planet.position.set(70, -40, -90); r.group.add(planet);
  const ring = new THREE.Mesh(new THREE.RingGeometry(38, 52, 64), new THREE.MeshBasicMaterial({ color: '#ffd9a8', transparent: true, opacity: 0.45, side: THREE.DoubleSide, fog: false }));
  ring.position.copy(planet.position); ring.rotation.set(1.2, 0.3, 0); r.group.add(ring);
  r.add(new Anim((t) => { planet.rotation.y = t * 0.02; stars.rotation.y = t * 0.005; }));
  // portholes and pipes
  for (let i = 0; i < 4; i++) {
    for (const x of [-19.45, 19.45]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), mat('#0b0a20', { emissive: '#1a1a5a', ei: 1 }));
      p.position.set(x, 7, -15 + i * 10); p.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; r.group.add(p);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 8, 24), mat('#cfd6e6', { metal: 0.7, rough: 0.3 }));
      rim.position.copy(p.position); rim.rotation.copy(p.rotation); r.group.add(rim);
    }
  }
  r.makeExitDoor('slide', mat('#ffffff', { map: Tex.grid('#cfd6e6', '#3ee8ff'), metal: 0.5, rough: 0.3, emissive: '#102040' }));
  r.clapperSpot = { orbit: { x: 0, y: 5.5, z: 1, r: 5, w: 0.5 }, hint: 'Catch the golden clapperboard drifting in zero-G' };
  return r;
}

// =====================================================================
// SCENE 5 — VILLAIN'S VOLCANO LAIR
// =====================================================================
export function buildLair(game) {
  const r = new Room(game, 4, {
    name: "VILLAIN'S LAIR", music: 'lair',
    env: { bg: '#1a0605', fog: ['#3a0c06', 30, 110], hemi: ['#ffb08a', '#3a0800', 1.05], sun: ['#ffc080', 2.1] },
    killY: -0.6, killSplash: '#ff7a1a',
  });
  const rockM = mat('#ffffff', { map: Tex.stone('#5a3a34'), rough: 0.9 });
  const darkRock = mat('#ffffff', { map: Tex.stone('#3a2422'), rough: 0.95 });
  const metalM = mat('#ffffff', { map: Tex.metal('#4a4a55'), metal: 0.7, rough: 0.35 });
  r.box(0, -1, 18, 40, 1, 8, metalM, { tile: 4, cast: false });
  r.box(0, -1, -18.5, 40, 1, 7, metalM, { tile: 4, cast: false });
  // arena
  const arenaTex = Tex.checker('#3a2a34', '#2a1a24');
  const arena = r.cyl(0, -6, 0, 12, 6, mat('#ffffff', { map: arenaTex, rough: 0.6 }), { seg: 48 });
  arenaTex.repeat.set(6, 6);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(12, 0.25, 8, 64), mat('#ffd23f', { emissive: '#ff8a00', ei: 1.2 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; r.group.add(rim);
  const skull = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshStandardMaterial({ map: Tex.sign('☠', '#2a1a24', '#ff3b3b', 256, 256), roughness: 0.6 }));
  skull.rotation.x = -Math.PI / 2; skull.position.y = 0.02; r.group.add(skull);
  r.box(0, -1, 13, 5, 1, 3.6, metalM, { cast: false });
  r.box(0, -1, -13.2, 5, 1, 4.4, metalM, { cast: false });
  // lava
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(42, 46), mat('#ffffff', { map: Tex.lava(), emissive: '#ff4a00', emissiveMap: Tex.lava(), ei: 1.3, rough: 0.6 }));
  lava.rotation.x = -Math.PI / 2; lava.position.y = -0.7; lava.material.map.repeat.set(3, 3);
  r.group.add(lava);
  r.add(new Anim((t) => { lava.material.map.offset.set(t * 0.02, t * 0.013); lava.position.y = -0.7 + Math.sin(t * 0.8) * 0.06; }));
  r.walls({ m: darkRock, entrance: true, exit: false, trim: mat('#ff6a1a', { emissive: '#ff4a00', ei: 1 }) });

  const tDet = r.addTask('detonators', 'Steal 3 detonators', 3);
  const tPumps = r.addTask('pumps', 'Shut down 3 lava pumps', 3);
  const tCtrl = r.addTask('control', 'Seize the control room', 1);

  // east stepping rocks
  for (const [x, z] of [[16, 11], [17, 7.5], [15.5, 4], [17, 0.5]]) r.cyl(x, -6, z, 1.3, 6.3, rockM, { seg: 9 });
  r.pickupFor(tDet, makeDetonator(), 17, 1.5, 0.5, null, { beacon: '#ff3b30' });
  // west lava raft
  const raft = r.mover(-17, -0.3, 9, 3, 0.5, 3, mat('#ffffff', { map: Tex.hazard() }), [0, 0, -11], 6.5);
  r.pickupFor(tDet, makeDetonator(), 0, 1.3, 0, raft.mesh, { beacon: '#ff3b30' });
  // south-west pillars
  r.cyl(-14.5, -6, -7, 1.4, 7.2, rockM, { seg: 9 });
  r.cyl(-16.5, -6, -11, 1.4, 8.6, rockM, { seg: 9 });
  r.cyl(-13.5, -6, -14, 1.6, 10, rockM, { seg: 9 });
  r.pickupFor(tDet, makeDetonator(), -13.5, 5.2, -14, null, { beacon: '#ff3b30' });

  // lava pumps (plates) + flame jets on the arena
  r.plateFor(tPumps, 7, 4, 0, '#ff8a3d');
  r.plateFor(tPumps, -7, 4, 0, '#ff8a3d');
  r.plateFor(tPumps, 0, -8, 0, '#ff8a3d');
  r.jets = [];
  for (const [x, z, ph] of [[0, 1, 0], [4.5, -3.5, 0.33], [-4.5, -3.5, 0.66], [0, 7, 0.5]]) r.jets.push(r.add(new FlameJet(game, r, x, z, { phase: ph })));

  // control room
  const ctrlM = mat('#ffffff', { map: Tex.metal('#5a5a66'), metal: 0.6, rough: 0.4 });
  r.cyl(5, 0, -17.5, 1.3, 1.6, rockM, { seg: 9 });
  const pist = r.mover(8, 1.2, -19.5, 2.4, 0.6, 2.4, mat('#ffffff', { map: Tex.hazard() }), [0, 2.4, 0], 4);
  r.box(15.5, 0, -18.75, 7, 6, 5.5, ctrlM, { tile: 3, round: 0.15 });
  const btnBase = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.8, 16), mat('#333'));
  btnBase.position.set(15.5, 6.4, -20); r.group.add(btnBase);
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ff2020', { emissive: '#ff0000', ei: 1.5 }));
  btn.position.set(15.5, 6.8, -20); r.group.add(btn);
  const mon = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.4), new THREE.MeshBasicMaterial({ map: Tex.sign('EVIL PLAN v2', '#0a1a0a', '#4cd964', 512, 246) }));
  mon.position.set(15.5, 9.4, -21.4); r.group.add(mon);
  r.zoneFor(tCtrl, 15.5, 6, -18.75, 2.8, { sfx: 'bell' });

  // dressing: throne, lava falls, chains, monitors
  const throne = new THREE.Group();
  const tm = mat('#2a1a2a', { rough: 0.4, metal: 0.3 });
  const seat = new THREE.Mesh(boxGeo(3, 1.2, 2.4, 1, 0.2), tm); seat.position.y = 0.6; throne.add(seat);
  const back = new THREE.Mesh(boxGeo(3, 5, 0.6, 1, 0.2), tm); back.position.set(0, 3, -1); throne.add(back);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), mat('#ffd23f', { metal: 0.8 }));
  for (const x of [-1.1, 0, 1.1]) { const c = crown.clone(); c.position.set(x, 6, -1); throne.add(c); }
  throne.position.set(-14, 0, 18.5); throne.rotation.y = 0.6; r.group.add(throne);
  r.solid(-15.8, 0, 16.8, -12.2, 1.2, 20.2);
  for (const x of [-12, 12]) {
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(3, 14), mat('#ffffff', { map: Tex.lava(), emissive: '#ff5a00', emissiveMap: Tex.lava(), ei: 1.5 }));
    fall.position.set(x, 7, -21.45); r.group.add(fall);
    r.add(new Anim((t) => { fall.material.map.offset.y = -t * 0.4; }));
  }
  r.lava = lava;

  // the exit — or is it?
  r.makeExitDoor('prop', mat('#ffffff', { map: Tex.metal('#8a3030'), metal: 0.5, rough: 0.4 }));
  r.arenaCenter = new THREE.Vector3(0, 0, r.cz);
  r.clapperSpot = { x: 0, y: 8.2, z: 0, pad: true, hint: 'Bounce up to the clapperboard above the arena' };
  return r;
}
