// The original kal-toh (classic-rules.js), played on the stone: a jagged jumble of t'an that the
// players bring into harmony, tip to tip, until it becomes the kal-toh - two concentric
// icosidodecahedra joined junction to junction.
//
// The jumble's skeleton is the outer sphere's 29-t'an spanning tree with every joint twisted, so
// its order is hidden in the chaos. A small position-based solver keeps every t'an rigid while
// each junction is drawn between its place in the chaos and its place in the sphere, as far as it
// has found its order. The other 90 t'an - the inner sphere and the struts between the two - lie
// tangled through the jumble and settle into place as the junctions around them find theirs.
//
// It is all in the assembly's own units (scene.js SCALE): it rests in the motion model like any
// kal-toh, keeps its place on the base, is kept clear of the stone, and is still unless touched.
import * as THREE from '../vendor/three.module.min.js';
import * as K from './classic-rules.js';
import { PIVOT, SCALE } from './scene.js';
import { mitreAtJunctions } from './rodmesh.js';
import { CLASSIC, playerText, ofText, classicCompleteText } from './texts.js';

// The finished sphere's radius, in assembly units: 0.66 across the world, so its lowest t'an clear
// the basin with the kal-toh's centre at the pivot.
export const SPHERE = 0.44;
export const ROD = K.EDGE_LENGTH * SPHERE;
// The inner sphere's radius as a fraction of the outer: 1/phi, the one ratio at which an inner
// t'an and a strut between the shells are exactly the same length.
const INNER = 1 / K.PHI;
const CLEAR = 0.03; // how far above the stone the jumble keeps (world units)
const { REACH } = K; // how far apart two tips may be for a t'an to join them (classic-rules.js)
const lattice = K.buildLattice();
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// A glow pulse rises fast and fades slowly.
function envelope(t) {
  if (t < 0) return 0;
  if (t < 0.08) return t / 0.08;
  return Math.exp(-(t - 0.08) / 0.7);
}

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const up = new THREE.Vector3();
const centre = new THREE.Vector3();

// --- The living structure --------------------------------------------------------------------

class Structure {
  constructor(stage, floor) {
    this.stage = stage;
    this.floor = floor; // lowest y the jumble may reach at (x, z), assembly units, square on the base
    this.pos = Array.from({ length: K.VERTEX_COUNT }, () => new THREE.Vector3());
    this.anchor = Array.from({ length: K.VERTEX_COUNT }, () => new THREE.Vector3());
    this.order = new Float32Array(K.VERTEX_COUNT);
    this.views = new Map(); // lattice edge -> { born, appear, appearAt, from, pulses }
    this.temps = []; // t'an held a moment before falling: { u, v, born, life, stiffness, blue, amber, onEnd }
    this.time = 0;
    this.game = null;
    this.highlightEdges = new Set();
    this.highlightTips = [];
    this.lesson = null; // { tips, at }: after a false bond, where the tip truly belongs, glowing a moment
    this.axisGlow = 0;
    this.onDrop = null; // (aWorld, bWorld, velocityWorld, options) when a t'an leaves the structure
    this.hidden = false;
    this.ends = [new THREE.Vector3(), new THREE.Vector3()];
    this.inner = new InnerShell(this);
    this.drawn = []; // this frame's t'an (see draw)
    this.slots = []; // reused for them
  }

  get root() {
    return this.stage.assemblyRoot;
  }

  reset(game) {
    this.game = game;
    this.views.clear();
    this.temps = [];
    this.time = 0;
    this.hidden = false;
    this.lesson = null;
    this.axisGlow = 0;
    this.order.fill(0);
    for (let v = 0; v < K.VERTEX_COUNT; v++) this.pos[v].fromArray(game.chaos[v]).multiplyScalar(SPHERE);
    // The jumble grows outward from its core, t'an by t'an.
    const { parent, depth } = game.tree;
    for (const e of game.tree.edges) {
      const [a, b] = lattice.edges[e];
      const child = parent[b] === a ? b : a;
      this.views.set(e, { born: 0, appear: 0, appearAt: 0.25 + depth[child] * 0.11 + Math.random() * 0.05, from: parent[child], pulses: [] });
    }
    let grownAt = 0;
    for (const view of this.views.values()) grownAt = Math.max(grownAt, view.appearAt + 0.28);
    this.inner.reset(game, grownAt + 0.05);
  }

  get grown() {
    for (const view of this.views.values()) if (view.appear < 1) return false;
    return this.inner.grown;
  }

  // Taken up again as it was kept (ClassicGame.resume): every t'an of the game whole and in place
  // at once, its junctions where they lay (pos) as far as they had found their order, the inner
  // shell's t'an as settled as that order lets them.
  resume(pos) {
    const game = this.game;
    this.views.clear();
    for (const e of game.present.keys()) this.views.set(e, { born: -1, appear: 1, appearAt: 0, from: -1, pulses: [] });
    pos.forEach((p, v) => this.pos[v]?.fromArray(p));
    this.order.set(game.order);
    if (game.complete) this.axisGlow = 1;
    this.inner.resume();
  }

  update(dt) {
    const game = this.game;
    if (!game) return;
    this.time += dt;
    const k = 1 - Math.exp(-dt / 0.6);
    for (let v = 0; v < K.VERTEX_COUNT; v++) {
      this.order[v] += (game.order[v] - this.order[v]) * k;
      const o = smooth(clamp01(this.order[v]));
      const c = game.chaos[v];
      const t = game.target[v];
      this.anchor[v].set(c[0] + (t[0] - c[0]) * o, c[1] + (t[1] - c[1]) * o, c[2] + (t[2] - c[2]) * o).multiplyScalar(SPHERE);
    }
    for (const view of this.views.values()) {
      if (view.appear < 1) view.appear = clamp01((this.time - view.appearAt) / 0.28);
    }
    this.solve();
    this.inner.update(dt);
    for (let i = this.temps.length - 1; i >= 0; i--) {
      const t = this.temps[i];
      if (this.time - t.born >= t.life) {
        this.temps.splice(i, 1);
        t.onEnd?.(t);
      }
    }
    if (game.complete) this.axisGlow = Math.min(1, this.axisGlow + dt / 1.6);
  }

  solve() {
    const pos = this.pos;
    for (let iter = 0; iter < 14; iter++) {
      for (let v = 0; v < K.VERTEX_COUNT; v++) pos[v].lerp(this.anchor[v], 0.06);
      for (const [e, view] of this.views) {
        const [a, b] = lattice.edges[e];
        // A new t'an draws its tips together over a moment rather than snapping them.
        const stiffness = Math.min(1, 0.08 + (this.time - view.born) / 0.7);
        constrain(pos[a], pos[b], ROD, stiffness);
      }
      for (const t of this.temps) constrain(pos[t.u], pos[t.v], ROD, t.stiffness);
    }
  }

  // A wave of light from the given t'an across everything joined to them.
  pulse(sources, { strength = 1, amber = 0, step = 0.075 } = {}) {
    const hops = new Map();
    const tipHop = new Map();
    const queue = [];
    for (const e of sources) {
      hops.set(e, 0);
      for (const v of lattice.edges[e]) {
        if (!tipHop.has(v)) {
          tipHop.set(v, 0);
          queue.push(v);
        }
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const v = queue[i];
      for (const w of lattice.neighbours[v]) {
        const e = K.latticeEdge(v, w);
        if (!this.views.has(e)) continue;
        if (!hops.has(e)) hops.set(e, tipHop.get(v) + 1);
        if (!tipHop.has(w)) {
          tipHop.set(w, tipHop.get(v) + 1);
          queue.push(w);
        }
      }
    }
    for (const [e, view] of this.views) {
      const h = hops.get(e);
      if (h !== undefined) view.pulses.push({ at: this.time + h * step, strength, amber });
    }
  }

  join(e) {
    this.views.set(e, { born: this.time, appear: 1, appearAt: 0, from: -1, pulses: [] });
  }

  // Take a t'an out of the structure and let it fall.
  release(e, velocity, options = {}) {
    if (!this.views.has(e)) return;
    const [a, b] = lattice.edges[e];
    this.drop(this.pos[a], this.pos[b], velocity, options);
    this.views.delete(e);
  }

  drop(pa, pb, velocity, options) {
    const [a, b] = this.rodEnds(pa, pb, 1);
    this.onDrop?.(a.clone(), b.clone(), velocity, options);
  }

  // Hold a t'an between two tips for a moment, then let it go.
  strain(u, v, { life, stiffness, blue = 0, amber = 0, velocity, onEnd }) {
    this.temps.push({
      u, v, born: this.time, life, stiffness, blue, amber,
      onEnd: (t) => {
        this.drop(this.pos[t.u], this.pos[t.v], velocity?.(), { amber });
        onEnd?.();
      },
    });
  }

  // Everything falls away (a new game).
  dissolve() {
    const centreWorld = this.centreWorld(new THREE.Vector3());
    const scatter = (a, b) => {
      const out = v3.addVectors(a, b).multiplyScalar(0.5).sub(centreWorld).normalize().multiplyScalar(0.6 + Math.random() * 1.1);
      out.y += 0.4 + Math.random() * 0.8;
      return out.clone();
    };
    for (const e of [...this.views.keys()]) {
      const [a, b] = lattice.edges[e];
      const [wa, wb] = this.rodEnds(this.pos[a], this.pos[b], 1);
      this.onDrop?.(wa.clone(), wb.clone(), scatter(wa, wb), { blue: 0.7, spin: 2 });
      this.views.delete(e);
    }
    for (const rod of this.inner.rods) {
      if (rod.appear <= 0) continue;
      const wa = this.toWorld(rod.wa, new THREE.Vector3());
      const wb = this.toWorld(rod.wb, new THREE.Vector3());
      this.onDrop?.(wa, wb, scatter(wa, wb), { blue: 0.5, spin: 2 });
    }
    this.inner.rods = [];
    this.temps = [];
    this.hidden = true;
  }

  toWorld(p, out) {
    return out.copy(p).applyMatrix4(this.root.matrixWorld);
  }

  tipWorld(v, out = new THREE.Vector3()) {
    return this.toWorld(this.pos[v], out);
  }

  centreWorld(out = new THREE.Vector3()) {
    return out.setFromMatrixPosition(this.root.matrixWorld);
  }

  // World ends of a rigid t'an centred between two tips (or a fraction `f` of one grown out of
  // pa). Shared vectors: use them before the next call.
  rodEnds(pa, pb, f) {
    const [a, b] = this.ends;
    this.toWorld(pa, a);
    this.toWorld(pb, b);
    const dir = v3.subVectors(b, a);
    dir.multiplyScalar(1 / (dir.length() || 1));
    const length = ROD * SCALE;
    if (f < 1) {
      b.copy(a).addScaledVector(dir, length * f);
    } else {
      a.add(b).multiplyScalar(0.5);
      b.copy(a).addScaledVector(dir, length / 2);
      a.addScaledVector(dir, -length / 2);
    }
    return this.ends;
  }

  glowOf(view) {
    let blue = 0;
    let amber = 0;
    for (let i = view.pulses.length - 1; i >= 0; i--) {
      const p = view.pulses[i];
      const t = this.time - p.at;
      if (t > 3) {
        view.pulses.splice(i, 1);
        continue;
      }
      const g = envelope(t) * p.strength;
      if (p.amber) amber = Math.max(amber, g);
      else blue = Math.max(blue, g);
    }
    return [blue, amber];
  }

  // Every t'an as assembly-local ends, for the motion model to keep clear of the stone.
  collisionRods(out) {
    out.length = 0;
    if (this.hidden) return out;
    for (const [e, view] of this.views) {
      if (view.appear < 1) continue;
      const [a, b] = lattice.edges[e];
      out.push(rigid(this.pos[a], this.pos[b], ROD));
    }
    for (const t of this.temps) out.push(rigid(this.pos[t.u], this.pos[t.v], ROD));
    for (const rod of this.inner.rods) if (rod.appear >= 1) out.push([rod.wa, rod.wb]);
    return out;
  }

  // World ends of every whole t'an (for the area a finger may turn).
  worldRods() {
    const out = [];
    if (this.hidden) return out;
    for (const [e, view] of this.views) {
      if (view.appear < 1) continue;
      const [a, b] = lattice.edges[e];
      const [wa, wb] = this.rodEnds(this.pos[a], this.pos[b], 1);
      out.push([wa.clone(), wb.clone(), e]);
    }
    return out;
  }

  // Every t'an this frame, then drawn: where they meet at a junction, their ends are mitred, so
  // they meet the last millimetre to the last rather than passing through one another.
  draw(pool, halos, { shaking = 0 } = {}) {
    if (!this.game || this.hidden) return [];
    const obstacles = [];
    const drawn = this.drawn;
    drawn.length = 0;
    this.centreWorld(centre);
    const complete = this.game.complete;
    for (const [e, view] of this.views) {
      if (view.appear <= 0) continue;
      const [a, b] = lattice.edges[e];
      let pa = this.pos[a];
      let pb = this.pos[b];
      if (view.appear < 1 && view.from === b) [pa, pb] = [pb, pa];
      const [wa, wb] = this.rodEnds(pa, pb, view.appear);
      let [blue, amber] = this.glowOf(view);
      if (this.highlightEdges.has(e)) blue = Math.max(blue, 0.6);
      if (complete) blue = Math.max(blue, 0.42);
      if (view.appear < 1) blue = Math.max(blue, 0.35 * (1 - view.appear));
      if (shaking > 0.08) blue = Math.max(blue, shaking * 0.7);
      const halo = blue > 0.05 || amber > 0.05 ? [Math.max(blue, amber) * 0.3, 0.07, amber > blue ? 1 : 0] : null;
      this.add(wa, wb, blue, amber, halo, view.appear >= 1, 'outer');
      if (view.appear >= 1) obstacles.push({ a: [wa.x, wa.y, wa.z], b: [wb.x, wb.y, wb.z] });
    }
    for (const t of this.temps) {
      const [wa, wb] = this.rodEnds(this.pos[t.u], this.pos[t.v], 1);
      const flicker = 0.75 + 0.25 * Math.sin(this.time * 40);
      this.add(wa, wb, t.blue * flicker, t.amber * flicker, [Math.max(t.blue, t.amber) * flicker * 0.45, 0.07, t.amber > t.blue ? 1 : 0], true, 'held');
    }
    this.inner.collect(complete, shaking, obstacles);
    // Each t'an's broad face turned out from the centre.
    for (const r of drawn) r.up.addVectors(r.a, r.b).multiplyScalar(0.5).sub(centre);
    // Only whole t'an meet at junctions; one still growing out of its junction is left as it is.
    mitreAtJunctions(drawn.filter((r) => r.whole));
    for (const r of drawn) {
      pool.push(r.a, r.b, r.up, r.blue, r.amber, 1, 0, r.whole ? r.trims : null);
      if (r.halo) halos.push(r.a, r.b, ...r.halo);
    }
    for (const v of this.highlightTips) {
      const w = this.tipWorld(v, v1);
      halos.push(w, w, 0.5, 0.07, 0);
    }
    if (this.lesson) {
      const t = this.time - this.lesson.at;
      if (t > 3.2) {
        this.lesson = null;
      } else {
        const glow = Math.min(1, t / 0.25) * Math.min(1, (3.2 - t) / 0.6) * (0.75 + 0.25 * Math.sin(t * 9));
        for (const v of this.lesson.tips) {
          const w = this.tipWorld(v, v1);
          halos.push(w, w, 0.6 * glow, 0.09, 0);
        }
      }
    }
    if (this.axisGlow > 0.01) {
      // Complete, its hidden axis shows: a thread of light through it.
      const axis = v2.fromArray(this.game.axis).applyQuaternion(this.root.quaternion);
      const radius = SPHERE * SCALE * 1.45;
      halos.push(centre.clone().addScaledVector(axis, -radius), centre.clone().addScaledVector(axis, radius), this.axisGlow * 0.16, 0.022, 0);
    }
    return obstacles;
  }

  // One t'an to draw this frame (world ends, copied: the vectors given may be shared): of the outer
  // shell, the inner, a strut between them, or one held a moment before it falls.
  add(a, b, blue, amber, halo, whole, kind) {
    const i = this.drawn.length;
    const r = (this.slots[i] ??= { a: new THREE.Vector3(), b: new THREE.Vector3(), up: new THREE.Vector3(), trims: new Float32Array(8) });
    r.a.copy(a);
    r.b.copy(b);
    r.blue = blue;
    r.amber = amber;
    r.halo = halo;
    r.whole = whole;
    r.kind = kind;
    this.drawn.push(r);
  }
}

function constrain(pa, pb, L, stiffness) {
  v1.subVectors(pb, pa);
  const d = v1.length();
  if (d < 1e-6) return;
  v1.multiplyScalar(((d - L) / d) * 0.5 * stiffness);
  pa.add(v1);
  pb.sub(v1);
}

// A rigid t'an's ends, centred between two tips (assembly units).
function rigid(pa, pb, length) {
  const mid = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5);
  const dir = new THREE.Vector3().subVectors(pb, pa);
  dir.multiplyScalar(1 / (dir.length() || 1));
  return [mid.clone().addScaledVector(dir, -length / 2), mid.addScaledVector(dir, length / 2)];
}

// --- The inner shell and the struts ------------------------------------------------------------

// A point in the dome-shaped thicket the jumble rests in (assembly units, from its centre).
function inThicket(rng) {
  const k = SPHERE / 0.8; // the first kal-toh's thicket, at this sphere's size
  for (;;) {
    const x = (rng() * 2 - 1) * 1.02;
    const z = (rng() * 2 - 1) * 1.02;
    const y = -0.72 + rng() * 1.6;
    const ey = (y + 0.12) / 1.0;
    if ((x * x + z * z) / (1.02 * 1.02) + ey * ey <= 1) return new THREE.Vector3(x * k, y * k, z * k);
  }
}

// T'an in a pile settle near the vertical and the horizontals more often than not.
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

class InnerShell {
  constructor(structure) {
    this.structure = structure;
    this.rods = [];
    this.time = 0;
    this.locked = 0; // t'an that settled into place this frame
  }

  reset(game, startAt) {
    const rng = K.mulberry32((game.seed ^ 0x9e3779b9) >>> 0);
    const s = this.structure;
    this.time = 0;
    this.rods = [];
    const make = (kind, a, b) => {
      const ta = new THREE.Vector3().fromArray(game.target[a]).multiplyScalar(SPHERE * INNER);
      const tb = kind === 'strut'
        ? new THREE.Vector3().fromArray(game.target[a]).multiplyScalar(SPHERE)
        : new THREE.Vector3().fromArray(game.target[b]).multiplyScalar(SPHERE * INNER);
      const length = ta.distanceTo(tb);
      const home = ta.clone().add(tb).multiplyScalar(0.5);
      // Somewhere in the thicket, drawn partway toward home so it travels a short way to settle.
      let centreAt = null;
      let direction = null;
      for (let attempt = 0; attempt < 24; attempt++) {
        const c = home.clone().lerp(inThicket(rng), 0.88);
        const d = pileDirection(rng);
        if (!centreAt || this.clearOfStone(c, d, length)) {
          centreAt = c;
          direction = d;
          if (this.clearOfStone(c, d, length)) break;
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

  clearOfStone(c, d, length) {
    for (const f of [-0.5, 0, 0.5]) {
      v1.copy(c).addScaledVector(d, f * length);
      if (v1.y < this.structure.floor(v1.x, v1.z)) return false;
    }
    return true;
  }

  // Where a t'an lies in the chaos: beside its host junction, moving as the junction moves.
  chaosPose(rod) {
    v2.copy(this.structure.pos[rod.host]).add(rod.offset);
    rod.ca.copy(v2).addScaledVector(rod.dir, -rod.length / 2);
    rod.cb.copy(v2).addScaledVector(rod.dir, rod.length / 2);
  }

  get grown() {
    return this.rods.every((r) => r.appear >= 1);
  }

  // Every t'an here at once, settled as far as the order lets it (Structure.resume).
  resume() {
    const s = this.structure;
    for (const rod of this.rods) {
      rod.appear = 1;
      const order = rod.kind === 'strut' ? s.order[rod.a] : Math.min(s.order[rod.a], s.order[rod.b]);
      rod.settle = smooth(clamp01((order - rod.threshold + 0.12) / 0.24));
      rod.locked = rod.settle > 0.9;
      rod.glow = 0;
      this.pose(rod);
    }
  }

  update(dt) {
    const s = this.structure;
    this.time += dt;
    this.locked = 0;
    const k = 1 - Math.exp(-dt / 0.3);
    for (const rod of this.rods) {
      if (rod.appear < 1) rod.appear = clamp01((this.time - rod.appearAt) / 0.38);
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

  // Rigid pose between chaos and place.
  pose(rod) {
    this.chaosPose(rod);
    const e = smooth(rod.settle);
    const fly = 1 - Math.pow(1 - rod.appear, 3);
    v3.addVectors(rod.ca, rod.cb).multiplyScalar(0.5);
    // Arriving from outside the jumble, drawn in magnetically.
    if (fly < 1) {
      up.copy(v3).normalize().multiplyScalar(1.6 * SPHERE * (1 - fly));
      up.y += 0.6 * SPHERE * (1 - fly);
      rod.ca.add(up);
      rod.cb.add(up);
    }
    rod.wa.lerpVectors(rod.ca, rod.ta, e);
    rod.wb.lerpVectors(rod.cb, rod.tb, e);
    // Rigid: its own length, centred where the blend puts it.
    v2.addVectors(rod.wa, rod.wb).multiplyScalar(0.5);
    v3.subVectors(rod.wb, rod.wa).normalize();
    rod.wa.copy(v2).addScaledVector(v3, -rod.length / 2);
    rod.wb.copy(v2).addScaledVector(v3, rod.length / 2);
    // Still tangled, it rests on the stone rather than passing into it.
    if (e < 1) {
      let push = 0;
      for (const p of [rod.wa, rod.wb]) push = Math.max(push, this.structure.floor(p.x, p.z) - p.y);
      if (push > 0) {
        rod.wa.y += push * (1 - e);
        rod.wb.y += push * (1 - e);
      }
    }
  }

  // Its t'an, to be drawn with the rest (Structure.draw).
  collect(complete, shaking, obstacles) {
    const s = this.structure;
    for (const rod of this.rods) {
      if (rod.appear <= 0) continue;
      const a = s.toWorld(rod.wa, v1);
      const b = s.toWorld(rod.wb, v2);
      let blue = Math.max(rod.glow, 0.3 * (1 - rod.appear));
      if (complete) blue = Math.max(blue, 0.3);
      if (shaking > 0.08) blue = Math.max(blue, shaking * 0.6);
      s.add(a, b, blue, 0, blue > 0.03 ? [blue * 0.35, 0.06, 0] : null, rod.appear >= 1, rod.kind);
      if (rod.appear >= 1) obstacles.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z] });
    }
  }
}

// --- The game on the stone ----------------------------------------------------------------------

export class ClassicGame {
  // ctx: { stage, motion, falling, tray, hand, sound, say, engraving, settings, after, base }
  constructor(ctx) {
    this.ctx = ctx;
    const { base } = ctx;
    // The lowest the jumble may reach at (x, z), square on the base: just clear of the stone.
    this.floor = (x, z) => (base.surface(Math.hypot(x, z) * SCALE) + CLEAR - PIVOT.y) / SCALE;
    this.structure = new Structure(ctx.stage, this.floor);
    this.structure.onDrop = (a, b, velocity, options) => ctx.falling.spawn(a, b, velocity ?? new THREE.Vector3(), options);
    this.game = null;
    this.phase = 'loading'; // intro | play | resolving | complete | dissolving
    this.rods = [];
    this.aimed = null; // { u, v, pose } while a t'an is carried
    this.aimKey = '';
    this.settled = 0;
    this.plays = []; // for the carving: { player, mark: join | ring | fall }
    this.sinceEase = 0;
    this.easing = false; // the jumble is easing toward its order (no true join was within reach)
  }

  get hasRods() {
    return this.game !== null && !this.structure.hidden;
  }

  newGame(seed) {
    const { settings, motion, tray, say } = this.ctx;
    const floor = (x, z) => this.floor(x * SPHERE, z * SPHERE) / SPHERE;
    this.game = K.createGame({ seed, players: settings.players, floor });
    this.plays = [];
    this.sinceEase = 0;
    this.easing = false;
    motion.resetPlace();
    this.structure.reset(this.game);
    this.phase = 'intro';
    this.aimed = null;
    tray.hide();
    tray.length = ROD * SCALE;
    say(CLASSIC.begin);
    this.carve();
  }

  // The game as it stands, kept between sessions (keep.js): the rules' state (made again from its
  // seed, all but what play has changed), the plays carved under the seats, and where each junction
  // lies.
  keep() {
    return { state: this.game, plays: this.plays, pos: this.structure.pos.map((p) => p.toArray()) };
  }

  // Taken up again where it was kept, at once: no jumble growing, nothing glowing; the t'an in the
  // tray, unless it is whole.
  resume({ state, plays, pos }) {
    const { tray } = this.ctx;
    const floor = (x, z) => this.floor(x * SPHERE, z * SPHERE) / SPHERE;
    this.game = K.resumeGame(state, { floor });
    this.plays = Array.isArray(plays) ? plays : [];
    this.sinceEase = 0;
    this.easing = false;
    this.structure.reset(this.game);
    this.structure.resume(pos);
    this.phase = this.game.complete ? 'complete' : 'play';
    this.aimed = null;
    tray.length = ROD * SCALE;
    if (this.game.complete) tray.hide();
    else tray.refill();
    this.carve();
  }

  // What the carving shows for this game: the shape it builds, the players (each one's score, true
  // joins of those tried) and their plays.
  carve() {
    const game = this.game;
    const seats = Array.from({ length: game.players }, (_, i) => {
      const { joined, discord } = game.stats[i];
      return { now: i === game.current && !game.complete, score: ofText(joined, joined + discord) };
    });
    this.ctx.engraving.set({ shape: CLASSIC.shape, seats, plays: this.plays });
  }

  update(dt) {
    const { motion, sound, tray } = this.ctx;
    const before = this.structure.views.size;
    this.structure.update(dt);
    if (this.structure.inner.locked) sound.settle?.(this.structure.inner.locked);
    motion.setRods(this.structure.collisionRods(this.rods));
    // Growing, settling or giving way, the shape changes: let the motion model look again.
    if (this.phase === 'intro' || this.structure.temps.length || before !== this.structure.views.size || this.settling()) motion.wake();
    if (this.phase === 'intro' && this.structure.grown) {
      this.phase = 'play';
      tray.refill();
    }
    this.easeIfStuck(dt);
  }

  // When no true join lies within a t'an's reach (as the jumble lies, once still), the jumble eases
  // a little toward its order, and again, until one does: a true move always comes within reach.
  easeIfStuck(dt) {
    this.sinceEase += dt;
    if (this.phase !== 'play' || this.sinceEase < 0.6 || this.settling()) return;
    this.sinceEase = 0;
    const [near, far] = REACH;
    const reachable = K.missingEdges(this.game).some((e) => {
      const [u, v] = lattice.edges[e];
      const apart = this.apart(u, v);
      return apart >= near && apart <= far && K.judge(this.game, u, v).kind === 'harmony';
    });
    if (reachable) {
      this.easing = false;
      return;
    }
    K.ease(this.game);
    if (!this.easing) this.ctx.say(CLASSIC.eases);
    this.easing = true;
  }

  // Junctions still travelling toward their order.
  settling() {
    const s = this.structure;
    for (let v = 0; v < K.VERTEX_COUNT; v++) if (Math.abs(s.order[v] - this.game.order[v]) > 0.002) return true;
    return false;
  }

  draw(pool, halos, shaking) {
    return this.structure.draw(pool, halos, { shaking });
  }

  worldRods() {
    return this.structure.worldRods();
  }

  canLift() {
    const { hand } = this.ctx;
    return this.phase === 'play' && !hand.holding && !hand.flight;
  }

  // The tip under a finger: the junction of the jumble's own t'an nearest it on screen (among close
  // ones, the nearer the eye wins), and of the t'an meeting there, the one nearest the finger.
  pick(x, y, reach = 34) {
    const { stage } = this.ctx;
    const s = this.structure;
    const tips = new Set();
    for (const [e, view] of s.views) if (view.appear >= 1) for (const v of lattice.edges[e]) tips.add(v);
    const candidates = [];
    let front = Infinity;
    for (const v of tips) {
      const p = stage.toScreen(s.tipWorld(v, v1));
      const d = Math.hypot(p.x - x, p.y - y);
      if (d > reach) continue;
      candidates.push({ v, d, depth: p.depth, p });
      front = Math.min(front, p.depth);
    }
    let best = null;
    for (const c of candidates) {
      const score = c.d + (c.depth - front) * 22;
      if (!best || score < best.score) best = { ...c, score };
    }
    if (!best) return null;
    let rod;
    let nearest = Infinity;
    for (const w of lattice.neighbours[best.v]) {
      const e = K.latticeEdge(best.v, w);
      if (s.views.get(e)?.appear !== 1) continue;
      const d = segmentDistance(x, y, best.p, stage.toScreen(s.tipWorld(w, v2)));
      if (d < nearest) {
        nearest = d;
        rod = e;
      }
    }
    return { rod, tip: best.v, world: s.tipWorld(best.v) };
  }

  // How far apart two tips are, in t'an lengths.
  apart(u, v) {
    return this.structure.pos[u].distanceTo(this.structure.pos[v]) / ROD;
  }

  // Carried over two t'an: blue and in place when it can join their tips, amber when it cannot.
  aim([ta, tb], f1, f2) {
    const { hand, sound, stage, say } = this.ctx;
    const s = this.structure;
    const u = ta?.tip ?? null;
    const v = tb?.tip ?? null;
    let pose = null;
    let refused = false;
    let why = null;
    if (u !== null && v !== null) {
      const apart = u === v ? 0 : this.apart(u, v);
      if (u === v) why = CLASSIC.aimSame;
      else if (K.isJoined(this.game, u, v)) why = CLASSIC.aimJoined;
      else if (apart > REACH[1]) why = CLASSIC.aimFar;
      else if (apart < REACH[0]) why = CLASSIC.aimNear;
      if (why) {
        refused = true;
      } else {
        const [a, b] = s.rodEnds(s.pos[u], s.pos[v], 1);
        pose = { a: a.clone(), b: b.clone() };
      }
    }
    this.aimed = pose ? { u, v, pose } : null;
    s.highlightEdges = new Set([ta?.rod, tb?.rod].filter((e) => e !== undefined));
    s.highlightTips = [u, v].filter((t) => t !== null);
    hand.follow(f1, f2, { pose, touchA: ta?.world ?? null, touchB: tb?.world ?? null, anchor: stage.assemblyRoot.position, refused });
    const key = `${u}:${v}:${refused}`;
    if (key !== this.aimKey) {
      this.aimKey = key;
      if (u !== null || v !== null) {
        sound.hover();
      }
      if (why) say(why);
    }
  }

  release(cancelled = false) {
    const { hand, tray, sound } = this.ctx;
    const chosen = cancelled ? null : this.aimed;
    this.aimed = null;
    this.aimKey = '';
    this.structure.highlightEdges = new Set();
    this.structure.highlightTips = [];
    if (!chosen || this.phase !== 'play') {
      hand.returnToTray();
      return;
    }
    this.phase = 'resolving';
    tray.hide();
    hand.fly(hand.a, hand.b, chosen.pose.a, chosen.pose.b, 0.15, () => {
      hand.holding = false;
      sound.place();
      this.resolve(K.play(this.game, chosen.u, chosen.v));
    });
  }

  // World velocity away from the centre through the middle of two tips.
  outward(u, v, speed) {
    const s = this.structure;
    const mid = s.tipWorld(u).add(s.tipWorld(v)).multiplyScalar(0.5);
    const dir = mid.sub(s.centreWorld()).normalize();
    return dir.multiplyScalar(speed).add(new THREE.Vector3(0, speed * 0.8, 0));
  }

  // The way the spin throws a t'an: along the imbalance it would have caused.
  flingVelocity(edge) {
    const dir = new THREE.Vector3().fromArray(K.imbalance(this.game, edge)).normalize().applyQuaternion(this.ctx.stage.assemblyRoot.quaternion);
    return dir.multiplyScalar(2.2).add(new THREE.Vector3(0, 1.4, 0));
  }

  resolve(r) {
    const { sound, say, after, motion, tray } = this.ctx;
    const s = this.structure;
    let settle = 0.9;
    this.plays.push({ player: r.player, mark: r.kind === 'harmony' ? (r.hoops.length ? 'ring' : 'join') : 'fall' });
    if (r.kind === 'harmony') {
      s.join(r.edge);
      s.pulse([r.edge], { strength: 0.8 });
      sound.harmony(K.harmony(this.game));
      if (r.complete) {
        this.celebrate();
        return;
      }
      if (r.hoops.length) {
        after(0.35, () => {
          s.pulse(r.hoops.flatMap((h) => h.edges), { strength: 1.1, step: 0.03 });
          sound.hoop();
        });
        say(CLASSIC.hoop);
      } else {
        say(CLASSIC.harmony);
      }
      if (K.wobble(this.game).amount > 0.72) {
        after(0.9, () => {
          sound.wobbleWarning();
          say(CLASSIC.wobble);
        });
      }
    } else if (r.kind === 'discord') {
      sound.discord();
      // Where the first tip truly belongs: its neighbours in the sphere not yet joined to it.
      const tips = lattice.neighbours[r.u].filter((w) => !K.isJoined(this.game, r.u, w));
      s.lesson = { tips, at: s.time + 0.4 };
      s.strain(r.u, r.v, { life: 0.5, stiffness: 0.3, amber: 1, velocity: () => this.outward(r.u, r.v, 0.5) });
      r.fallen.forEach((e, i) => after(0.3 + i * 0.12, () => {
        const [a, b] = lattice.edges[e];
        s.release(e, this.outward(a, b, 0.7), { amber: 0.8 });
        sound.clink(0.6);
      }));
      say(r.fallen.length ? CLASSIC.shaken : CLASSIC.discord);
      settle = 1.1;
    } else if (r.kind === 'flung') {
      sound.fling();
      // The spin jolts it as it throws the t'an off; its place on the base draws it back.
      motion.w.add(new THREE.Vector3().fromArray(K.imbalance(this.game, r.edge)).normalize().applyQuaternion(this.ctx.stage.assemblyRoot.quaternion).multiplyScalar(0.9));
      motion.wake();
      s.strain(r.u, r.v, { life: 0.34, stiffness: 1, blue: 0.8, velocity: () => this.flingVelocity(r.edge) });
      say(CLASSIC.flung);
      settle = 1;
    }
    after(settle, () => {
      if (this.phase !== 'resolving') return;
      this.phase = 'play';
      tray.refill();
      this.carve();
      if (this.game.players > 1) say(playerText(this.game.current));
    });
  }

  celebrate() {
    const { tray, sound, say, after } = this.ctx;
    this.phase = 'complete';
    tray.hide();
    after(0.5, () => {
      this.structure.pulse([...this.structure.views.keys()].slice(0, 1), { strength: 0.75, step: 0.05 });
      sound.complete();
    });
    this.carve();
    say(classicCompleteText(this.game));
  }

  // Begin anew: everything falls away.
  dissolve() {
    this.phase = 'dissolving';
    this.aimed = null;
    this.structure.highlightEdges = new Set();
    this.structure.highlightTips = [];
    this.structure.dissolve();
  }

  // For tests: the junctions of the hidden order that a move could join, as world points.
  tipWorld(v) {
    return this.structure.tipWorld(v);
  }
}

function segmentDistance(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}
