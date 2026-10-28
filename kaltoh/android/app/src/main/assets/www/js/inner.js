// The inner shell and the struts between the shells: 90 t'an that begin tangled through the
// jumble and settle into place as the outer junctions around them find their order.
// The finished kal-toh is two concentric icosidodecahedra joined junction to junction.
import * as THREE from '../vendor/three.module.min.js';
import * as K from './logic.js';
import { SPHERE_RADIUS as R } from './stage.js';

// Radius of the inner shell as a fraction of the outer: 1/phi, the one ratio at which an
// inner rod and a strut between the shells are exactly the same length.
export const INNER_RATIO = 1 / K.PHI;

const lattice = K.buildLattice();
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const point = new THREE.Vector3();
const dir = new THREE.Vector3();
const tmp = new THREE.Vector3();
const up = new THREE.Vector3();
const centre = new THREE.Vector3();

// A point in the dome-shaped thicket that rests on the basin (the structure's frame, world units).
function inThicket(rng) {
  for (;;) {
    const x = (rng() * 2 - 1) * 1.02;
    const z = (rng() * 2 - 1) * 1.02;
    const y = -0.72 + rng() * 1.6;
    const ey = (y + 0.12) / 1.0;
    if ((x * x + z * z) / (1.02 * 1.02) + ey * ey <= 1) return new THREE.Vector3(x, y, z);
  }
}

// Rods in a pile settle near the vertical and the horizontals more often than not.
function pileDirection(rng) {
  const d = new THREE.Vector3();
  do {
    if (rng() < 0.5) {
      const k = Math.floor(rng() * 3);
      d.set(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0);
      d.x += (rng() - 0.5) * 0.45;
      d.y += (rng() - 0.5) * 0.45;
      d.z += (rng() - 0.5) * 0.45;
    } else {
      d.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    }
  } while (d.lengthSq() < 1e-4);
  return d.normalize();
}

export class InnerShell {
  constructor(structure) {
    this.structure = structure;
    this.rods = [];
    this.time = 0;
    this.locked = 0; // rods that snapped into place this frame
    this.arrived = 0; // rods that reached the jumble this frame
    this.ground = null; // basin height (world y) at a distance from its axis
  }

  reset(game, startAt) {
    const rng = K.mulberry32((game.seed ^ 0x9e3779b9) >>> 0);
    const s = this.structure;
    this.time = 0;
    this.rods = [];
    const make = (kind, a, b) => {
      const ta = new THREE.Vector3().fromArray(game.target[a]).multiplyScalar(R * INNER_RATIO);
      const tb = kind === 'strut'
        ? new THREE.Vector3().fromArray(game.target[a]).multiplyScalar(R)
        : new THREE.Vector3().fromArray(game.target[b]).multiplyScalar(R * INNER_RATIO);
      const length = ta.distanceTo(tb);
      const home = ta.clone().add(tb).multiplyScalar(0.5);
      // Somewhere in the thicket, drawn partway toward home so it travels a short way to settle.
      let centreAt = null;
      let direction = null;
      for (let attempt = 0; attempt < 16; attempt++) {
        const c = home.clone().lerp(inThicket(rng), 0.88);
        const d = pileDirection(rng);
        if (!centreAt || this.clearOfBase(c, d, length)) {
          centreAt = c;
          direction = d;
          if (this.clearOfBase(c, d, length)) break;
        }
      }
      // It rides with the nearest junction of the skeleton as the skeleton moves.
      let host = 0;
      let nearest = Infinity;
      for (let v = 0; v < K.VERTEX_COUNT; v++) {
        const d2 = s.pos[v].distanceToSquared(centreAt);
        if (d2 < nearest) {
          nearest = d2;
          host = v;
        }
      }
      const rod = {
        kind, a, b, ta, tb, length, host,
        offset: centreAt.clone().sub(s.pos[host]),
        dir: direction,
        threshold: 0.3 + rng() * 0.5,
        settle: 0,
        locked: false,
        appear: 0,
        appearAt: startAt + rng() * 0.9,
        glow: 0,
        ca: new THREE.Vector3(),
        cb: new THREE.Vector3(),
        wa: new THREE.Vector3(),
        wb: new THREE.Vector3(),
      };
      // Settle without flipping end for end: pair each end with the nearer target end.
      this.chaosPose(rod);
      if (rod.ca.distanceTo(tb) + rod.cb.distanceTo(ta) < rod.ca.distanceTo(ta) + rod.cb.distanceTo(tb)) {
        [rod.ta, rod.tb] = [rod.tb, rod.ta];
      }
      return rod;
    };
    for (const [a, b] of lattice.edges) this.rods.push(make('inner', a, b));
    for (let v = 0; v < K.VERTEX_COUNT; v++) this.rods.push(make('strut', v, v));
  }

  clearOfBase(c, d, length) {
    if (!this.ground) return true;
    const y0 = this.structure.centreY;
    for (const f of [-0.5, 0.5]) {
      tmp.copy(c).addScaledVector(d, f * length);
      if (tmp.y + y0 < this.ground(Math.hypot(tmp.x, tmp.z)) + 0.02) return false;
    }
    return true;
  }

  // Where a rod lies in the chaos: beside its host junction, moving as the junction moves.
  chaosPose(rod) {
    point.copy(this.structure.pos[rod.host]).add(rod.offset);
    rod.ca.copy(point).addScaledVector(rod.dir, -rod.length / 2);
    rod.cb.copy(point).addScaledVector(rod.dir, rod.length / 2);
  }

  get grown() {
    return this.rods.every((r) => r.appear >= 1);
  }

  update(dt) {
    const s = this.structure;
    this.time += dt;
    this.locked = 0;
    this.arrived = 0;
    const k = 1 - Math.exp(-dt / 0.3);
    for (const rod of this.rods) {
      if (rod.appear < 1) {
        rod.appear = clamp01((this.time - rod.appearAt) / 0.38);
        if (rod.appear >= 1) this.arrived += 1;
      }
      const order = rod.kind === 'strut' ? s.order[rod.a] : Math.min(s.order[rod.a], s.order[rod.b]);
      const target = smooth(clamp01((order - rod.threshold + 0.12) / 0.24));
      rod.settle += (target - rod.settle) * k;
      if (!rod.locked && rod.settle > 0.9) {
        rod.locked = true;
        rod.glow = 0.6;
        this.locked += 1;
      } else if (rod.locked && rod.settle < 0.5) {
        rod.locked = false;
      }
      rod.glow *= Math.exp(-dt / 0.7);
      this.pose(rod);
    }
  }

  // Rigid pose between chaos and place, in the structure's frame.
  pose(rod) {
    this.chaosPose(rod);
    const e = smooth(rod.settle);
    const fly = 1 - Math.pow(1 - rod.appear, 3);
    tmp.addVectors(rod.ca, rod.cb).multiplyScalar(0.5);
    // Arriving from outside the jumble, drawn in magnetically.
    if (fly < 1) {
      up.copy(tmp).normalize().multiplyScalar(1.6 * (1 - fly));
      up.y += 0.6 * (1 - fly);
      rod.ca.add(up);
      rod.cb.add(up);
    }
    rod.wa.lerpVectors(rod.ca, rod.ta, e);
    rod.wb.lerpVectors(rod.cb, rod.tb, e);
    // Keep it rigid: its own length, centred where the blend puts it.
    point.addVectors(rod.wa, rod.wb).multiplyScalar(0.5);
    dir.subVectors(rod.wb, rod.wa).normalize();
    rod.wa.copy(point).addScaledVector(dir, -rod.length / 2);
    rod.wb.copy(point).addScaledVector(dir, rod.length / 2);
    // Rest on the basin rather than pass through it.
    if (this.ground && e < 1) {
      const y0 = this.structure.centreY;
      let push = 0;
      for (const p of [rod.wa, rod.wb]) {
        const floor = this.ground(Math.hypot(p.x, p.z)) + 0.012 - y0;
        push = Math.max(push, floor - p.y);
      }
      if (push > 0) {
        rod.wa.y += push * (1 - e);
        rod.wb.y += push * (1 - e);
      }
    }
  }

  draw(pool, halos, complete) {
    const s = this.structure;
    const m = s.root.matrixWorld;
    s.centreWorld(centre);
    for (const rod of this.rods) {
      if (rod.appear <= 0) continue;
      const a = point.copy(rod.wa).applyMatrix4(m);
      const b = tmp.copy(rod.wb).applyMatrix4(m);
      up.addVectors(a, b).multiplyScalar(0.5).sub(centre);
      let blue = Math.max(rod.glow, 0.3 * (1 - rod.appear));
      if (complete) blue = Math.max(blue, 0.06 + 0.04 * Math.sin(this.time * 1.7 + rod.a * 0.61 + rod.b * 0.29));
      pool.push(a, b, up, blue, 0);
      if (blue > 0.03) halos.push(a, b, blue * 0.4, 0.065, 0);
    }
  }

  // On a restart every inner t'an falls with the rest.
  dissolve(drop) {
    const m = this.structure.root.matrixWorld;
    for (const rod of this.rods) {
      if (rod.appear <= 0) continue;
      const a = rod.wa.clone().applyMatrix4(m);
      const b = rod.wb.clone().applyMatrix4(m);
      const out = rod.wa.clone().add(rod.wb).normalize().multiplyScalar(0.5 + Math.random() * 1.1);
      out.y += 0.3 + Math.random() * 0.8;
      drop(a, b, out, { scatter: true });
    }
    this.rods = [];
  }
}
