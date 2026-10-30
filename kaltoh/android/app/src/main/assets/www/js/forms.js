// Many forms (forms-rules.js), played on the stone: a new form each game, built from the inside
// out. Its inner shell's spanning tree lies twisted into a jumble, a sample of its loops already in
// their true shape and noise hanging among it; the players close its loops tip to tip, struts
// brace outward from each loop closed whole, and the same form is built again on their tips.
//
// As in the original game (classic.js), a small position-based solver keeps every t'an rigid while
// each tip is drawn toward where it rests as far as its junction has found its order. It is all in
// the assembly's own units (scene.js SCALE): it rests in the motion model like any kal-toh, keeps
// its place on the base, is kept clear of the stone, and is still unless touched.
import * as THREE from '../vendor/three.module.min.js';
import * as F from './forms-rules.js';
import { PIVOT, SCALE } from './scene.js';
import { mitreAtJunctions } from './rodmesh.js';
import { CLASSIC, MANY, TEXT, playerText, ofText, loopText, loopsText, manyCompleteText } from './texts.js';

// The outer shell's radius, in assembly units: the original kal-toh's.
export const SPHERE = 0.44;
const CLEAR = 0.03; // how far above the stone the jumble keeps (world units)
const { REACH } = F; // how far apart two tips may be for a t'an to join them
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
const centre = new THREE.Vector3();

// The key of a rod of the kal-toh: of a shell (`i3`, `o3`: the form's rod 3 within or without),
// a strut (`s5`, from junction 5), or noise (`n2`).
const shellKey = (layer, e) => `${layer === 'outer' ? 'o' : 'i'}${e}`;

// --- The living structure --------------------------------------------------------------------

class Structure {
  constructor(stage, floor) {
    this.stage = stage;
    this.floor = floor; // lowest y the jumble may reach at (x, z), assembly units, square on the base
    this.game = null;
    this.pos = []; // every tip (forms-rules.js numbering), assembly units
    this.rest = []; // where each rests now
    this.places = [];
    this.orderIn = []; // the junctions' order as shown, easing toward the game's
    this.orderOut = [];
    this.views = new Map(); // key -> { a, b, length, born, appear, appearAt, from, pulses }
    this.temps = []; // t'an held a moment before falling: { a, b, length, born, life, stiffness, blue, amber, onEnd }
    this.time = 0;
    this.highlightKeys = new Set();
    this.highlightTips = [];
    this.lesson = null; // { tips, at }: after a false bond, where the tip truly belongs, glowing a moment
    this.axisGlow = 0;
    this.onDrop = null; // (aWorld, bWorld, velocityWorld, options) when a t'an leaves the structure
    this.hidden = false;
    this.ends = [new THREE.Vector3(), new THREE.Vector3()];
    this.drawn = []; // this frame's t'an (see draw)
    this.slots = []; // reused for them
  }

  get root() {
    return this.stage.assemblyRoot;
  }

  reset(game) {
    this.game = game;
    const { V } = game;
    const form = F.formOf(game);
    this.views.clear();
    this.temps = [];
    this.time = 0;
    this.hidden = false;
    this.lesson = null;
    this.axisGlow = 0;
    this.highlightKeys = new Set();
    this.highlightTips = [];
    this.orderIn = [...game.orderIn];
    this.orderOut = [...game.orderOut];
    const count = 2 * V + game.noise.length;
    this.pos = Array.from({ length: count }, () => new THREE.Vector3());
    this.rest = Array.from({ length: count }, () => new THREE.Vector3());
    this.findRest();
    this.pos.forEach((p, t) => p.copy(this.rest[t]));
    // The jumble grows outward from the sample, t'an by t'an; then the sample's struts brace out,
    // and the noise hangs among it.
    const { parent, depth } = game.tree;
    for (const e of game.presentIn.keys()) {
      const [a, b] = form.edges[e];
      const child = parent[b] === a ? b : parent[a] === b ? a : depth[a] > depth[b] ? a : b;
      const from = child === a ? b : a;
      this.views.set(shellKey('inner', e), this.view(a, b, game.rodIn, 0.25 + depth[child] * 0.11 + Math.random() * 0.05, from));
    }
    let grownAt = 0;
    for (const view of this.views.values()) grownAt = Math.max(grownAt, view.appearAt + 0.28);
    for (let v = 0; v < V; v++) if (game.sprouted[v]) this.views.set(`s${v}`, this.view(v, V + v, game.strut, grownAt + Math.random() * 0.3, v));
    game.noise.forEach((n, i) => this.views.set(`n${i}`, this.view(n.host, 2 * V + i, game.rodIn, grownAt + 0.2 + Math.random() * 0.6, n.host)));
  }

  view(a, b, length, appearAt, from) {
    return { a, b, length: length * SPHERE, born: 0, appear: 0, appearAt, from, pulses: [] };
  }

  get grown() {
    for (const view of this.views.values()) if (view.appear < 1) return false;
    return true;
  }

  // Where each tip rests now, from the game and the order shown.
  findRest() {
    const places = F.restingPlaces(this.game, this.orderIn, this.orderOut, this.places);
    places.forEach((p, t) => p && this.rest[t].set(p[0], p[1], p[2]).multiplyScalar(SPHERE));
  }

  update(dt) {
    const game = this.game;
    if (!game) return;
    this.time += dt;
    const k = 1 - Math.exp(-dt / 0.6);
    for (let v = 0; v < game.V; v++) {
      this.orderIn[v] += (game.orderIn[v] - this.orderIn[v]) * k;
      this.orderOut[v] += (game.orderOut[v] - this.orderOut[v]) * k;
    }
    this.findRest();
    for (const view of this.views.values()) {
      if (view.appear < 1) view.appear = clamp01((this.time - view.appearAt) / 0.28);
    }
    this.solve();
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
    const { pos, rest, game } = this;
    for (let iter = 0; iter < 14; iter++) {
      for (let t = 0; t < pos.length; t++) if (F.tipKind(game, t)) pos[t].lerp(rest[t], 0.06);
      for (const view of this.views.values()) {
        // A new t'an draws its tips together over a moment rather than snapping them.
        const stiffness = Math.min(1, 0.08 + (this.time - view.born) / 0.7);
        constrain(pos[view.a], pos[view.b], view.length, stiffness);
      }
      for (const t of this.temps) constrain(pos[t.a], pos[t.b], t.length, t.stiffness);
    }
  }

  // Tips with a whole t'an at them (so a finger can find them).
  shownTips() {
    const out = new Set();
    for (const view of this.views.values()) {
      if (view.appear < 1) continue;
      out.add(view.a);
      out.add(view.b);
    }
    return out;
  }

  // A wave of light from the given t'an across everything joined to them.
  pulse(sources, { strength = 1, amber = 0, step = 0.075 } = {}) {
    const at = new Map(); // tip -> keys of the t'an there
    for (const [key, view] of this.views) {
      for (const t of [view.a, view.b]) {
        if (!at.has(t)) at.set(t, []);
        at.get(t).push(key);
      }
    }
    const hops = new Map();
    const tipHop = new Map();
    const queue = [];
    for (const key of sources) {
      const view = this.views.get(key);
      if (!view) continue;
      hops.set(key, 0);
      for (const t of [view.a, view.b]) {
        if (!tipHop.has(t)) {
          tipHop.set(t, 0);
          queue.push(t);
        }
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const t = queue[i];
      for (const key of at.get(t) ?? []) {
        const view = this.views.get(key);
        if (!hops.has(key)) hops.set(key, tipHop.get(t) + 1);
        const other = view.a === t ? view.b : view.a;
        if (!tipHop.has(other)) {
          tipHop.set(other, tipHop.get(t) + 1);
          queue.push(other);
        }
      }
    }
    for (const [key, view] of this.views) {
      const h = hops.get(key);
      if (h !== undefined) view.pulses.push({ at: this.time + h * step, strength, amber });
    }
  }

  join(key, a, b, length) {
    this.views.set(key, { a, b, length, born: this.time, appear: 1, appearAt: 0, from: -1, pulses: [] });
  }

  // A strut braces out from a junction, growing from it.
  sprout(v) {
    const { V, strut } = this.game;
    this.pos[V + v].copy(this.pos[v]);
    this.views.set(`s${v}`, { a: v, b: V + v, length: strut * SPHERE, born: this.time, appear: 0, appearAt: this.time, from: v, pulses: [{ at: this.time, strength: 0.9, amber: 0 }] });
  }

  // Take a t'an out of the structure and let it fall.
  release(key, velocity, options = {}) {
    const view = this.views.get(key);
    if (!view) return;
    this.drop(this.pos[view.a], this.pos[view.b], view.length, velocity, options);
    this.views.delete(key);
  }

  drop(pa, pb, length, velocity, options) {
    const [a, b] = this.rodEnds(pa, pb, 1, length);
    this.onDrop?.(a.clone(), b.clone(), velocity, options);
  }

  // Hold a t'an between two tips for a moment, then let it go.
  strain(a, b, length, { life, stiffness, blue = 0, amber = 0, velocity, onEnd }) {
    this.temps.push({
      a, b, length, born: this.time, life, stiffness, blue, amber,
      onEnd: (t) => {
        this.drop(this.pos[t.a], this.pos[t.b], t.length, velocity?.(), { amber });
        onEnd?.();
      },
    });
  }

  // Everything falls away (a new game).
  dissolve() {
    const centreWorld = this.centreWorld(new THREE.Vector3());
    for (const [key, view] of [...this.views]) {
      const [wa, wb] = this.rodEnds(this.pos[view.a], this.pos[view.b], 1, view.length);
      const out = v3.addVectors(wa, wb).multiplyScalar(0.5).sub(centreWorld).normalize().multiplyScalar(0.6 + Math.random() * 1.1);
      out.y += 0.4 + Math.random() * 0.8;
      this.onDrop?.(wa.clone(), wb.clone(), out.clone(), { blue: 0.7, spin: 2 });
      this.views.delete(key);
    }
    this.temps = [];
    this.hidden = true;
  }

  toWorld(p, out) {
    return out.copy(p).applyMatrix4(this.root.matrixWorld);
  }

  tipWorld(t, out = new THREE.Vector3()) {
    return this.toWorld(this.pos[t], out);
  }

  centreWorld(out = new THREE.Vector3()) {
    return out.setFromMatrixPosition(this.root.matrixWorld);
  }

  // World ends of a rigid t'an of a given length (assembly units) centred between two tips (or a
  // fraction `f` of one grown out of pa). Shared vectors: use them before the next call.
  rodEnds(pa, pb, f, length) {
    const [a, b] = this.ends;
    this.toWorld(pa, a);
    this.toWorld(pb, b);
    const dir = v3.subVectors(b, a);
    dir.multiplyScalar(1 / (dir.length() || 1));
    const world = length * SCALE;
    if (f < 1) {
      b.copy(a).addScaledVector(dir, world * f);
    } else {
      a.add(b).multiplyScalar(0.5);
      b.copy(a).addScaledVector(dir, world / 2);
      a.addScaledVector(dir, -world / 2);
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
    for (const view of this.views.values()) if (view.appear >= 1) out.push(rigid(this.pos[view.a], this.pos[view.b], view.length));
    for (const t of this.temps) out.push(rigid(this.pos[t.a], this.pos[t.b], t.length));
    return out;
  }

  // World ends of every whole t'an (for the area a finger may turn).
  worldRods() {
    const out = [];
    if (this.hidden) return out;
    for (const [key, view] of this.views) {
      if (view.appear < 1) continue;
      const [wa, wb] = this.rodEnds(this.pos[view.a], this.pos[view.b], 1, view.length);
      out.push([wa.clone(), wb.clone(), key]);
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
    for (const [key, view] of this.views) {
      if (view.appear <= 0) continue;
      let pa = this.pos[view.a];
      let pb = this.pos[view.b];
      if (view.appear < 1 && view.from === view.b) [pa, pb] = [pb, pa];
      const [wa, wb] = this.rodEnds(pa, pb, view.appear, view.length);
      let [blue, amber] = this.glowOf(view);
      if (this.highlightKeys.has(key)) blue = Math.max(blue, 0.6);
      if (complete) blue = Math.max(blue, 0.42);
      if (view.appear < 1) blue = Math.max(blue, 0.35 * (1 - view.appear));
      if (shaking > 0.08) blue = Math.max(blue, shaking * 0.7);
      const halo = blue > 0.05 || amber > 0.05 ? [Math.max(blue, amber) * 0.3, 0.07, amber > blue ? 1 : 0] : null;
      this.add(wa, wb, blue, amber, halo, view.appear >= 1, key[0]);
      if (view.appear >= 1) obstacles.push({ a: [wa.x, wa.y, wa.z], b: [wb.x, wb.y, wb.z] });
    }
    for (const t of this.temps) {
      const [wa, wb] = this.rodEnds(this.pos[t.a], this.pos[t.b], 1, t.length);
      const flicker = 0.75 + 0.25 * Math.sin(this.time * 40);
      this.add(wa, wb, t.blue * flicker, t.amber * flicker, [Math.max(t.blue, t.amber) * flicker * 0.45, 0.07, t.amber > t.blue ? 1 : 0], true, 'held');
    }
    // Each t'an's broad face turned out from the centre.
    for (const r of drawn) r.up.addVectors(r.a, r.b).multiplyScalar(0.5).sub(centre);
    // Only whole t'an meet at junctions; one still growing out of its junction is left as it is.
    mitreAtJunctions(drawn.filter((r) => r.whole));
    for (const r of drawn) {
      pool.push(r.a, r.b, r.up, r.blue, r.amber, 1, 0, r.whole ? r.trims : null);
      if (r.halo) halos.push(r.a, r.b, ...r.halo);
    }
    for (const t of this.highlightTips) {
      const w = this.tipWorld(t, v1);
      halos.push(w, w, 0.5, 0.07, 0);
    }
    if (this.lesson) {
      const t = this.time - this.lesson.at;
      if (t > 3.2) {
        this.lesson = null;
      } else {
        const glow = Math.min(1, t / 0.25) * Math.min(1, (3.2 - t) / 0.6) * (0.75 + 0.25 * Math.sin(t * 9));
        for (const tip of this.lesson.tips) {
          const w = this.tipWorld(tip, v1);
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

  // One t'an to draw this frame (world ends, copied: the vectors given may be shared).
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

function segmentDistance(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}

// --- The game on the stone ----------------------------------------------------------------------

export class FormsGame {
  // ctx: { stage, motion, falling, tray, hand, sound, haptic, say, engraving, settings, after, base }
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
    this.plays = []; // for the carving: { player, mark: join | ring | fall }
    this.sinceEase = 0;
    this.easing = false; // the jumble is easing toward its order (no true join was within reach)
  }

  get hasRods() {
    return this.game !== null && !this.structure.hidden;
  }

  get form() {
    return F.formOf(this.game);
  }

  // The t'an the shell being built takes, its length in assembly units.
  get rod() {
    return F.rodLength(this.game) * SPHERE;
  }

  newGame(seed) {
    const { settings, motion, tray, say } = this.ctx;
    const floor = (x, z) => this.floor(x * SPHERE, z * SPHERE) / SPHERE;
    this.game = F.createGame({ seed, players: settings.players, floor });
    this.plays = [];
    this.sinceEase = 0;
    this.easing = false;
    motion.resetPlace();
    this.structure.reset(this.game);
    this.phase = 'intro';
    this.aimed = null;
    tray.hide();
    tray.length = this.rod * SCALE;
    say(MANY.begin);
    this.carve();
  }

  // What the carving shows for this game: the players (each one's score, true joins of those
  // tried), how to play, and how far each shell has come.
  carve() {
    const game = this.game;
    const seats = Array.from({ length: game.players }, (_, i) => {
      const { joined, discord } = game.stats[i];
      return { now: i === game.current && !game.complete, score: ofText(joined, joined + discord) };
    });
    const lines = [TEXT.lift, CLASSIC.touch, MANY.angles, MANY.corners, MANY.holds, MANY.outer, loopsText(F.progress(game)), TEXT.rim];
    this.ctx.engraving.set({ seats, lines, plays: this.plays });
  }

  update(dt) {
    const { motion, tray } = this.ctx;
    const before = this.structure.views.size;
    this.structure.update(dt);
    motion.setRods(this.structure.collisionRods(this.rods));
    // Growing, settling or giving way, the shape changes: let the motion model look again.
    if (this.phase === 'intro' || this.structure.temps.length || before !== this.structure.views.size || this.settling() || !this.structure.grown) motion.wake();
    if (this.phase === 'intro' && this.structure.grown) {
      this.phase = 'play';
      tray.refill();
    }
    this.easeIfStuck(dt);
  }

  // When no true join lies within a t'an's reach (as the jumble lies, once still), the shell being
  // built eases a little toward its order, and again, until one does: a true move always comes
  // within reach.
  easeIfStuck(dt) {
    this.sinceEase += dt;
    if (this.phase !== 'play' || this.sinceEase < 0.6 || this.settling()) return;
    this.sinceEase = 0;
    const [near, far] = REACH;
    const game = this.game;
    const reachable = F.missingEdges(game).some((e) => {
      const [a, b] = F.tipsOf(game, game.phase, e);
      const apart = this.apart(a, b);
      return apart >= near && apart <= far;
    });
    if (reachable) {
      this.easing = false;
      return;
    }
    F.ease(game);
    if (!this.easing) this.ctx.say(game.phase === 'outer' ? MANY.easesOuter : MANY.eases);
    this.easing = true;
  }

  // Junctions still travelling toward their order.
  settling() {
    const s = this.structure;
    const g = this.game;
    for (let v = 0; v < g.V; v++) {
      if (Math.abs(s.orderIn[v] - g.orderIn[v]) > 0.002 || Math.abs(s.orderOut[v] - g.orderOut[v]) > 0.002) return true;
    }
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

  // The tip under a finger: of the shell being built (and the noise), the one nearest it on
  // screen (among close ones, the nearer the eye wins), and of the t'an meeting there, the one
  // nearest the finger.
  pick(x, y, reach = 34) {
    const { stage } = this.ctx;
    const s = this.structure;
    const shown = s.shownTips();
    const candidates = [];
    let front = Infinity;
    for (const t of F.liveTips(this.game)) {
      if (!shown.has(t)) continue;
      const p = stage.toScreen(s.tipWorld(t, v1));
      const d = Math.hypot(p.x - x, p.y - y);
      if (d > reach) continue;
      candidates.push({ t, d, depth: p.depth, p });
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
    for (const [key, view] of s.views) {
      if (view.appear < 1 || (view.a !== best.t && view.b !== best.t)) continue;
      const other = view.a === best.t ? view.b : view.a;
      const d = segmentDistance(x, y, best.p, stage.toScreen(s.tipWorld(other, v2)));
      if (d < nearest) {
        nearest = d;
        rod = key;
      }
    }
    return { rod, tip: best.t, world: s.tipWorld(best.t) };
  }

  // How far apart two tips are, in lengths of the t'an the shell being built takes.
  apart(a, b) {
    return this.structure.pos[a].distanceTo(this.structure.pos[b]) / this.rod;
  }

  // The rods of the given loops of the form, in a shell.
  loopKeys(layer, faces) {
    const form = this.form;
    const keys = [];
    for (const f of faces) form.faces[f].forEach((v, i, face) => keys.push(shellKey(layer, form.edgeOf(v, face[(i + 1) % face.length]))));
    return keys;
  }

  // A tip's true neighbours in the form not yet joined to it.
  trueNeighbours(t) {
    const g = this.game;
    const off = t >= g.V ? g.V : 0;
    return this.form.neighbours[t - off].map((w) => w + off).filter((w) => !F.isJoined(g, t, w));
  }

  // Carried over two tips: blue and in place when it can join them, amber when it cannot.
  aim([ta, tb], f1, f2) {
    const { hand, sound, haptic, stage, say } = this.ctx;
    const s = this.structure;
    const u = ta?.tip ?? null;
    const v = tb?.tip ?? null;
    let pose = null;
    let refused = false;
    let why = null;
    if (u !== null && v !== null) {
      const verdict = F.judge(this.game, u, v);
      const apart = u === v ? 0 : this.apart(u, v);
      if (verdict.kind === 'invalid') why = { joined: CLASSIC.aimJoined, outer: MANY.aimOuter, inner: MANY.aimInner }[verdict.reason] ?? CLASSIC.aimSame;
      else if (apart > REACH[1]) why = CLASSIC.aimFar;
      else if (apart < REACH[0]) why = CLASSIC.aimNear;
      if (why) {
        refused = true;
      } else {
        const [a, b] = s.rodEnds(s.pos[u], s.pos[v], 1, this.rod);
        pose = { a: a.clone(), b: b.clone() };
      }
    }
    this.aimed = pose ? { u, v, pose } : null;
    s.highlightKeys = new Set([ta?.rod, tb?.rod].filter((key) => key !== undefined));
    s.highlightTips = [u, v].filter((t) => t !== null);
    hand.follow(f1, f2, { pose, touchA: ta?.world ?? null, touchB: tb?.world ?? null, anchor: stage.assemblyRoot.position, refused });
    const key = `${u}:${v}:${refused}`;
    if (key !== this.aimKey) {
      this.aimKey = key;
      if (u !== null || v !== null) {
        sound.hover();
        haptic('tick');
      }
      if (why) say(why);
    }
  }

  release(cancelled = false) {
    const { hand, tray, sound, haptic } = this.ctx;
    const chosen = cancelled ? null : this.aimed;
    this.aimed = null;
    this.aimKey = '';
    this.structure.highlightKeys = new Set();
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
      haptic('place');
      this.resolve(F.play(this.game, chosen.u, chosen.v));
    });
  }

  // World velocity away from the centre through the middle of two tips.
  outward(a, b, speed) {
    const s = this.structure;
    const mid = s.tipWorld(a).add(s.tipWorld(b)).multiplyScalar(0.5);
    const dir = mid.sub(s.centreWorld()).normalize();
    return dir.multiplyScalar(speed).add(new THREE.Vector3(0, speed * 0.8, 0));
  }

  // Noise falls away from its junction.
  dropNoise(i, options) {
    const { V } = this.game;
    const view = this.structure.views.get(`n${i}`);
    if (!view) return;
    this.structure.release(`n${i}`, this.outward(view.a, 2 * V + i, 0.5), options);
  }

  resolve(r) {
    const { sound, haptic, say, after, tray } = this.ctx;
    const s = this.structure;
    const game = this.game;
    let settle = 0.9;
    this.plays.push({ player: r.player, mark: r.kind === 'harmony' ? (r.faces.length ? 'ring' : 'join') : 'fall' });
    if (r.kind === 'harmony') {
      const key = shellKey(r.layer, r.edge);
      s.join(key, r.a, r.b, this.rodOf(r.layer));
      s.pulse([key], { strength: 0.8 });
      sound.harmony(F.harmony(game));
      haptic('harmony');
      if (r.complete) {
        this.celebrate();
        return;
      }
      if (r.faces.length) {
        // A loop closed whole: it glows round, and struts brace out from its junctions.
        after(0.35, () => {
          s.pulse(this.loopKeys(r.layer, r.faces), { strength: 1.1, step: 0.03 });
          sound.hoop();
        });
        say(loopText(r.faces.map((f) => this.form.faces[f].length), r.sprouted.length > 0));
        r.sprouted.forEach((v, i) => after(0.6 + i * 0.07, () => {
          s.sprout(v);
          sound.clink(0.35);
        }));
        settle = Math.max(settle, 0.9 + r.sprouted.length * 0.07);
      } else {
        say(MANY.harmony);
      }
      if (r.noise.length) {
        r.noise.forEach((i, n) => after(0.8 + n * 0.1, () => this.dropNoise(i, { blue: 0.6 })));
        if (!r.faces.length) say(MANY.noiseFalls);
        settle = Math.max(settle, 1 + r.noise.length * 0.1);
      }
      if (r.whole) {
        after(settle, () => say(MANY.whole));
        settle += 0.5;
      }
    } else {
      sound.discord();
      haptic('discord');
      // Where the first tip of the shell truly belongs: its neighbours in the form not yet joined.
      const real = [r.a, r.b].find((t) => F.tipKind(game, t) === r.layer);
      if (real !== undefined && !r.noise.length) s.lesson = { tips: this.trueNeighbours(real), at: s.time + 0.4 };
      s.strain(r.a, r.b, this.rod, { life: 0.5, stiffness: 0.3, amber: 1, velocity: () => this.outward(r.a, r.b, 0.5) });
      r.noise.forEach((i) => after(0.3, () => this.dropNoise(i, { amber: 0.7 })));
      r.fallen.forEach((e, i) => after(0.3 + i * 0.12, () => {
        const view = s.views.get(shellKey(r.layer, e));
        if (view) s.release(shellKey(r.layer, e), this.outward(view.a, view.b, 0.7), { amber: 0.8 });
        sound.clink(0.6);
      }));
      say(r.noise.length ? MANY.noiseTouched : r.fallen.length ? MANY.shaken : MANY.discord);
      settle = 1.1;
    }
    after(settle, () => {
      if (this.phase !== 'resolving') return;
      this.phase = 'play';
      // The outer shell takes longer t'an: the tray brings one.
      tray.length = this.rod * SCALE;
      tray.refill();
      this.carve();
      if (game.players > 1 && !r.whole) say(playerText(game.current));
    });
  }

  rodOf(layer) {
    return (layer === 'outer' ? this.game.rodOut : this.game.rodIn) * SPHERE;
  }

  celebrate() {
    const { tray, sound, haptic, say, after } = this.ctx;
    this.phase = 'complete';
    tray.hide();
    after(0.5, () => {
      this.structure.pulse([...this.structure.views.keys()].slice(0, 1), { strength: 0.75, step: 0.05 });
      sound.complete();
      haptic('complete');
    });
    this.carve();
    say(manyCompleteText(this.game, this.form));
  }

  // Begin anew: everything falls away.
  dissolve() {
    this.phase = 'dissolving';
    this.aimed = null;
    this.structure.highlightKeys = new Set();
    this.structure.highlightTips = [];
    this.structure.dissolve();
  }

  // For tests: a tip as a world point.
  tipWorld(t) {
    return this.structure.tipWorld(t);
  }
}
