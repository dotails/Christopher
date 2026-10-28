// The living structure: where its junctions are, how its t'an glow, how it wobbles on its
// hidden spin. Positions come from a small position-based solver: every t'an holds its tips
// exactly one rod-length apart while each junction is drawn toward a point between its place
// in the chaos and its place in the sphere, according to how much order it has found.
import * as THREE from '../vendor/three.module.min.js';
import * as K from './logic.js';
import { SPHERE_RADIUS as R } from './stage.js';
import { InnerShell } from './inner.js';

export const ROD_LENGTH = K.EDGE_LENGTH * R;
const lattice = K.buildLattice();
const smooth = (x) => x * x * (3 - 2 * x);

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
const centreWorld = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();

export class Structure {
  constructor(stage) {
    this.stage = stage;
    this.root = stage.structureRoot;
    this.pos = Array.from({ length: K.VERTEX_COUNT }, () => new THREE.Vector3());
    this.anchor = Array.from({ length: K.VERTEX_COUNT }, () => new THREE.Vector3());
    this.order = new Float32Array(K.VERTEX_COUNT);
    this.views = new Map(); // lattice edge -> { born, appear, appearAt, from, pulses }
    this.temps = []; // rods held for a moment before falling: { u, v, born, life, stiffness, blue, amber, onEnd }
    this.time = 0;
    this.game = null;
    this.highlightEdges = new Set();
    this.highlightTips = [];
    this.wobble = { amount: 0, dir: new THREE.Vector3(), kick: 0, phase: 0 };
    this.spin = { angle: 0, speed: 0 };
    this.axisGlow = 0;
    this.tremble = 0;
    this.onDrop = null; // (aWorld, bWorld, velocityWorld, options) when a t'an leaves the structure
    this.hidden = false;
    this.ends = [new THREE.Vector3(), new THREE.Vector3()];
    this.centreY = this.root.position.y;
    this.inner = new InnerShell(this);
  }

  // Basin height (world y) at a distance from its axis, so tangled t'an rest on the stone.
  set ground(fn) {
    this.inner.ground = fn;
  }

  reset(game) {
    this.game = game;
    this.views.clear();
    this.temps = [];
    this.time = 0;
    this.hidden = false;
    this.order.fill(0);
    for (let v = 0; v < K.VERTEX_COUNT; v++) this.pos[v].fromArray(game.chaos[v]).multiplyScalar(R);
    // The jumble grows outward from its core, rod by rod.
    const { parent, depth } = game.tree;
    for (const e of game.tree.edges) {
      const [a, b] = lattice.edges[e];
      const child = parent[b] === a ? b : a;
      this.views.set(e, {
        born: 0,
        appear: 0,
        appearAt: 0.25 + depth[child] * 0.11 + Math.random() * 0.05,
        from: parent[child],
        pulses: [],
      });
    }
    this.wobble.amount = 0;
    this.wobble.kick = 0;
    this.spin.angle = 0;
    this.spin.speed = 0;
    this.axisGlow = 0;
    this.root.quaternion.identity();
    // Once the skeleton has grown, the rest of the jumble gathers around it.
    let grownAt = 0;
    for (const view of this.views.values()) grownAt = Math.max(grownAt, view.appearAt + 0.28);
    this.inner.reset(game, grownAt + 0.05);
  }

  get grown() {
    for (const view of this.views.values()) if (view.appear < 1) return false;
    return this.inner.grown;
  }

  // --- Simulation -----------------------------------------------------------------------------

  update(dt) {
    const game = this.game;
    if (!game) return;
    this.time += dt;
    const k = 1 - Math.exp(-dt / 0.6);
    for (let v = 0; v < K.VERTEX_COUNT; v++) {
      this.order[v] += (game.order[v] - this.order[v]) * k;
      const o = smooth(Math.min(1, Math.max(0, this.order[v])));
      const c = game.chaos[v];
      const t = game.target[v];
      this.anchor[v].set(c[0] + (t[0] - c[0]) * o, c[1] + (t[1] - c[1]) * o, c[2] + (t[2] - c[2]) * o).multiplyScalar(R);
    }
    for (const view of this.views.values()) {
      if (view.appear < 1) view.appear = Math.min(1, Math.max(0, (this.time - view.appearAt) / 0.28));
    }
    this.solve();
    this.inner.update(dt);

    // Temporary rods: strained discord, or a join about to be flung.
    for (let i = this.temps.length - 1; i >= 0; i--) {
      const t = this.temps[i];
      if (this.time - t.born >= t.life) {
        this.temps.splice(i, 1);
        t.onEnd?.(t);
      }
    }

    this.updateWobble(dt);
  }

  solve() {
    const pos = this.pos;
    const L = ROD_LENGTH;
    const pull = 0.06;
    for (let iter = 0; iter < 14; iter++) {
      for (let v = 0; v < K.VERTEX_COUNT; v++) pos[v].lerp(this.anchor[v], pull);
      for (const [e, view] of this.views) {
        const [a, b] = lattice.edges[e];
        // A new t'an draws its tips together over a moment rather than snapping them.
        const stiffness = Math.min(1, 0.08 + (this.time - view.born) / 0.7);
        this.constrain(pos[a], pos[b], L, stiffness);
      }
      for (const t of this.temps) this.constrain(pos[t.u], pos[t.v], L, t.stiffness);
    }
  }

  constrain(pa, pb, L, stiffness) {
    v1.subVectors(pb, pa);
    const d = v1.length();
    if (d < 1e-6) return;
    v1.multiplyScalar(((d - L) / d) * 0.5 * stiffness);
    pa.add(v1);
    pb.sub(v1);
  }

  updateWobble(dt) {
    const game = this.game;
    const w = this.wobble;
    const target = game.complete ? { amount: 0, direction: [0, 0, 0] } : K.wobble(game);
    const k = 1 - Math.exp(-dt / 0.5);
    w.amount += (Math.min(1.4, target.amount) - w.amount) * k;
    if (target.amount > 1e-6) w.dir.lerp(v1.fromArray(target.direction), k).normalize();
    w.kick *= Math.exp(-dt / 0.6);
    w.phase += dt * Math.PI * 2 * (0.32 + 0.25 * w.kick);

    const axis = v2.fromArray(game.axis);
    // A spinning body with its mass off-axis rocks around that axis: tilt toward a direction
    // that circles the axis.
    const tilt = THREE.MathUtils.degToRad(4.2) * (w.amount + w.kick * 1.8);
    v3.copy(w.dir).applyAxisAngle(axis, w.phase);
    const tiltAxis = v1.crossVectors(axis, v3);
    if (tiltAxis.lengthSq() > 1e-8 && tilt > 1e-5) q1.setFromAxisAngle(tiltAxis.normalize(), tilt);
    else q1.identity();

    if (game.complete) this.spin.speed += (0.6 - this.spin.speed) * (1 - Math.exp(-dt / 1.6));
    this.spin.angle += this.spin.speed * dt;
    q2.setFromAxisAngle(axis, this.spin.angle);
    this.root.quaternion.multiplyQuaternions(q1, q2);

    const s = this.tremble * 0.035;
    this.root.position.set((Math.random() - 0.5) * s, this.centreY + (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    if (game.complete) this.axisGlow = Math.min(1, this.axisGlow + dt / 1.6);
    this.stage.gameRoot.updateMatrixWorld(true);
  }

  // --- Events ---------------------------------------------------------------------------------

  // A wave of light from the given edges across everything connected to them.
  pulse(sources, { strength = 1, amber = 0, step = 0.075 } = {}) {
    const hops = this.hopsFrom(sources);
    for (const [e, view] of this.views) {
      const h = hops.get(e);
      if (h === undefined) continue;
      view.pulses.push({ at: this.time + h * step, strength, amber });
    }
    return hops;
  }

  hopsFrom(sources) {
    const hops = new Map();
    const tipHop = new Map();
    const queue = [];
    for (const e of sources) {
      hops.set(e, 0);
      for (const v of lattice.edges[e]) if (!tipHop.has(v)) {
        tipHop.set(v, 0);
        queue.push(v);
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
    return hops;
  }

  join(e) {
    this.views.set(e, { born: this.time, appear: 1, appearAt: 0, from: -1, pulses: [] });
  }

  // Remove a t'an from the structure and let it fall.
  release(e, velocity, options = {}) {
    if (!this.views.has(e)) return;
    const [a, b] = lattice.edges[e];
    this.dropBetween(this.pos[a], this.pos[b], velocity, options);
    this.views.delete(e);
  }

  dropBetween(pa, pb, velocity, options) {
    if (!this.onDrop) return;
    const [a, b] = this.rodEnds(pa, pb, 1);
    this.onDrop(a.clone(), b.clone(), velocity, options);
  }

  // Hold a rod between two tips for a moment, then drop it.
  strain(u, v, { life, stiffness, blue = 0, amber = 0, velocity, onEnd }) {
    this.temps.push({
      u, v, born: this.time, life, stiffness, blue, amber,
      onEnd: (t) => {
        this.dropBetween(this.pos[t.u], this.pos[t.v], velocity?.(), { amber });
        onEnd?.();
      },
    });
  }

  kick(amount) {
    this.wobble.kick = Math.max(this.wobble.kick, amount);
  }

  // Everything falls away (on a restart).
  dissolve() {
    for (const e of [...this.views.keys()]) {
      const [a, b] = lattice.edges[e];
      const mid = v3.addVectors(this.pos[a], this.pos[b]).multiplyScalar(0.5);
      const out = mid.clone().normalize().multiplyScalar(0.6 + Math.random() * 1.2);
      out.y += 0.4 + Math.random() * 0.8;
      this.release(e, out.applyQuaternion(this.root.getWorldQuaternion(q1)), { scatter: true });
    }
    const q = this.root.getWorldQuaternion(new THREE.Quaternion());
    this.inner.dissolve((a, b, velocity, options) => this.onDrop?.(a, b, velocity.applyQuaternion(q), options));
    this.temps = [];
    this.hidden = true;
  }

  // --- Queries for input and drawing -----------------------------------------------------------

  tipWorld(v, out = new THREE.Vector3()) {
    return out.copy(this.pos[v]).applyMatrix4(this.root.matrixWorld);
  }

  centreWorld(out = new THREE.Vector3()) {
    return out.setFromMatrixPosition(this.root.matrixWorld);
  }

  // World endpoints of a rigid rod centred between two tips, or a fraction `f` of one grown
  // out of pa. Returns shared vectors: use them before the next call.
  rodEnds(pa, pb, f) {
    const [a, b] = this.ends;
    a.copy(pa).applyMatrix4(this.root.matrixWorld);
    b.copy(pb).applyMatrix4(this.root.matrixWorld);
    const dir = v3.subVectors(b, a);
    dir.multiplyScalar(1 / (dir.length() || 1));
    // Rods are rigid: drawn at their true length even while their tips are still meeting.
    if (f < 1) {
      b.copy(a).addScaledVector(dir, ROD_LENGTH * f);
    } else {
      a.add(b).multiplyScalar(0.5);
      b.copy(a).addScaledVector(dir, ROD_LENGTH / 2);
      a.addScaledVector(dir, -ROD_LENGTH / 2);
    }
    return this.ends;
  }

  // Each present rod with its tips, for picking.
  presentRods() {
    const out = [];
    for (const [e, view] of this.views) if (view.appear >= 1) out.push(e);
    return out;
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

  draw(pool, halos) {
    if (!this.game || this.hidden) return;
    this.centreWorld(centreWorld);
    const complete = this.game.complete;
    for (const [e, view] of this.views) {
      if (view.appear <= 0) continue;
      const [a, b] = lattice.edges[e];
      let pa = this.pos[a];
      let pb = this.pos[b];
      if (view.appear < 1 && view.from === b) [pa, pb] = [pb, pa];
      const [wa, wb] = this.rodEnds(pa, pb, view.appear);
      let [blue, amber] = this.glowOf(view);
      if (this.highlightEdges.has(e)) blue = Math.max(blue, 0.7);
      if (complete) blue = Math.max(blue, 0.09 + 0.05 * Math.sin(this.time * 1.7 + e * 0.37));
      if (view.appear < 1) blue = Math.max(blue, 0.35 * (1 - view.appear));
      up.addVectors(wa, wb).multiplyScalar(0.5).sub(centreWorld);
      pool.push(wa, wb, up, blue, amber);
      if (blue > 0.02 || amber > 0.02) halos.push(wa, wb, Math.max(blue, amber) * 0.42, 0.075, amber > blue ? 1 : 0);
    }
    for (const t of this.temps) {
      const [wa, wb] = this.rodEnds(this.pos[t.u], this.pos[t.v], 1);
      const flicker = 0.75 + 0.25 * Math.sin(this.time * 40);
      up.addVectors(wa, wb).multiplyScalar(0.5).sub(centreWorld);
      pool.push(wa, wb, up, t.blue * flicker, t.amber * flicker);
      halos.push(wa, wb, Math.max(t.blue, t.amber) * flicker * 0.5, 0.075, t.amber > t.blue ? 1 : 0);
    }
    for (const v of this.highlightTips) {
      const w = this.tipWorld(v, v1);
      halos.push(w, w, 0.55, 0.08, 0);
    }
    this.inner.draw(pool, halos, complete);
    if (this.axisGlow > 0.01) {
      const axis = v2.fromArray(this.game.axis).applyQuaternion(this.root.getWorldQuaternion(q1));
      const a = centreWorld.clone().addScaledVector(axis, -R * 1.45);
      const b = centreWorld.clone().addScaledVector(axis, R * 1.45);
      halos.push(a, b, this.axisGlow * 0.16, 0.022, 0);
    }
  }
}
