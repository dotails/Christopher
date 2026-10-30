// Zen (zen-rules.js), played on the stone: a calm way to play, alone. A splintering nest gathers
// about its centre mass, t'an by t'an; a t'an laid across any two pieces rests there; and every
// ten, the whole assembly takes a form of many forms. Each t'an glides to a rod of it, in a wave
// outward from the junction nearest the eye; those the form has no rod for fade away into light,
// and new ones settle into the rods none reached. Five forms on, each richer than the last, it is
// fully formed and glows.
//
// Like the other ways' kal-toh, it is all in the assembly's own units (the rules', drawn at
// scene.SCALE): it rests in the motion model, keeps its place on the base, is kept clear of the
// stone, and is still unless touched.
import * as THREE from '../vendor/three.module.min.js';
import * as G from './geom.js';
import * as Z from './zen-rules.js';
import { buildForm } from './forms-rules.js';
import { SPHERE } from './forms.js';
import { SCALE } from './scene.js';
import { mitreAtJunctions } from './rodmesh.js';
import { ZEN, zenStatusText, zenBecomesText, zenWholeText } from './texts.js';

const GATHER = 2.4; // seconds over which the nest gathers, t'an by t'an
const GLIDE = 1.5; // seconds a t'an takes to glide to its rod of a new form
const WAVE = 0.11; // each junction's t'an set off this long after the one before, outward from the first
const FADE = 1.2; // seconds a t'an the form has no rod for takes to fade away
const BULGE = 0.05; // how far out a gliding t'an swings on its way (assembly units)
const DRIFT = 0.08; // how far out a fading one drifts as it goes

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);

// A glow pulse rises fast and fades slowly (as in forms.js).
function envelope(t) {
  if (t < 0) return 0;
  if (t < 0.08) return t / 0.08;
  return Math.exp(-(t - 0.08) / 0.7);
}

// A t'an of the nest, or one placed, lies with its broad face turned at random about its length,
// the same each time it is drawn. A t'an of a form turns its face out from the centre, as many
// forms' do.
function hashUp(id, dir) {
  const h = Math.sin(id * 12.9898) * 43758.5453;
  const t = (h - Math.floor(h)) * Math.PI * 2;
  const side = G.perpendicular(dir);
  const other = G.cross(dir, side);
  return G.add(G.scale(side, Math.cos(t)), G.scale(other, Math.sin(t)));
}

function segmentDistance(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const la = new THREE.Vector3();
const lb = new THREE.Vector3();
const lm = new THREE.Vector3();
const lu = new THREE.Vector3();
const centre = new THREE.Vector3();
const ray = new THREE.Ray();

export class ZenGame {
  // ctx: { stage, motion, falling, tray, hand, sound, haptic, say, engraving, settings, after, base }
  constructor(ctx) {
    this.ctx = ctx;
    this.game = null;
    this.phase = 'loading'; // intro | play | resolving | transforming | complete | dissolving
    // Each t'an as drawn, by its id in the rules: { id, a, b (assembly-local ends now), up, form,
    // anim, fade, flash, pulses }.
    this.views = new Map();
    this.time = 0;
    this.glow = 0; // fully formed, it glows
    this.aimed = null; // where a carried t'an would rest (zen-rules.js placement)
    this.aimKey = '';
    this.highlight = new Set(); // the pieces a carried t'an lies across
    this.rods = []; // assembly-local ends of the t'an, for the motion model
    this.drawn = []; // this frame's t'an (see draw)
    this.slots = [];
    this.shown = 0;
  }

  get hasRods() {
    return this.game !== null && this.views.size > 0 && this.phase !== 'dissolving';
  }

  newGame(seed) {
    const { motion, tray, say, sound } = this.ctx;
    this.game = Z.createGame({ seed, radius: SPHERE });
    this.views.clear();
    this.time = 0;
    this.glow = 0;
    this.aimed = null;
    this.aimKey = '';
    this.highlight = new Set();
    motion.resetPlace();
    // The nest gathers: the centre mass first, then each t'an flies in along its line and sticks.
    const rods = [...this.game.rods].sort((p, q) => (p.kind === 'core' ? 0 : 1) - (q.kind === 'core' ? 0 : 1) || p.id - q.id);
    rods.forEach((rod, i) => {
      const v = this.addView(rod);
      const mid = G.lerp(rod.a, rod.b, 0.5);
      const out = G.scale(G.normalize(G.length(mid) > 1e-3 ? mid : G.randomUnit(Math.random)), 2.6);
      v.anim = {
        kind: 'gather', fromA: new THREE.Vector3(...G.add(rod.a, out)), fromB: new THREE.Vector3(...G.add(rod.b, out)),
        toA: new THREE.Vector3(...rod.a), toB: new THREE.Vector3(...rod.b), t: 0, delay: (i / rods.length) * GATHER, duration: 0.5,
        done: () => {
          if (i % 3 === 0) sound.clink(0.25);
        },
      };
      v.a.copy(v.anim.fromA);
      v.b.copy(v.anim.fromB);
    });
    this.phase = 'intro';
    tray.hide();
    tray.length = this.game.length * SCALE;
    say(ZEN.begin);
    this.carve();
  }

  // A view of a t'an of the rules, where it lies.
  addView(rod) {
    const v = {
      id: rod.id, a: new THREE.Vector3(...rod.a), b: new THREE.Vector3(...rod.b),
      up: new THREE.Vector3(...hashUp(rod.id, G.normalize(G.sub(rod.b, rod.a)))),
      form: rod.kind === 'form', anim: null, fade: null, flash: 0, extra: 0, blend: 1, pulses: [],
    };
    this.views.set(rod.id, v);
    return v;
  }

  // What the carving shows: beneath the name, the shape it has taken (the nest at first); no seats
  // or scores, but where they would be, how far it has come (engrave.js zenProgress: the forms
  // taken, the t'an placed toward the next), and the same in words under what just happened. No
  // how-to-play lines: the rules are a glyph away.
  carve() {
    const g = this.game;
    const p = Z.progress(g);
    const form = Z.formOf(g);
    this.ctx.engraving.set({
      shape: form ? { v: form.v, s: form.s } : ZEN.nest,
      status: zenStatusText(p),
      seats: [], plays: [], lines: [],
      zen: { forms: p.forms, taken: p.stage, placed: p.placed, per: p.per, complete: p.complete },
    });
  }

  update(dt) {
    const { motion, tray } = this.ctx;
    this.time += dt;
    let moving = this.views.size !== this.shown;
    this.shown = this.views.size;
    for (const [id, v] of this.views) {
      v.flash = Math.max(0, v.flash - dt * 0.7);
      v.extra = 0;
      const an = v.anim;
      if (an) {
        moving = true;
        an.t += dt;
        const k = clamp01((an.t - an.delay) / an.duration);
        if (an.kind === 'gather') {
          const s = 1 - (1 - k) ** 3;
          v.a.lerpVectors(an.fromA, an.toA, s);
          v.b.lerpVectors(an.fromB, an.toB, s);
        } else {
          const s = smoother(k);
          v.a.lerpVectors(an.fromA, an.toA, s);
          v.b.lerpVectors(an.fromB, an.toB, s);
          if (an.kind === 'glide') {
            // It swings out a little on its way, and turns its face out from the centre.
            lm.addVectors(v.a, v.b).normalize().multiplyScalar(BULGE * Math.sin(Math.PI * s));
            v.a.add(lm);
            v.b.add(lm);
            v.blend = s;
            v.extra = 0.3 * Math.sin(Math.PI * s);
          } else {
            v.extra = k > 0 ? 0.25 + 0.4 * (1 - s) : 0;
          }
        }
        if (k >= 1) {
          v.anim = null;
          v.blend = 1;
          an.done?.(v);
        }
      }
      if (v.fade) {
        moving = true;
        v.fade.t += dt;
        if (v.fade.t >= v.fade.delay + v.fade.duration) this.views.delete(id);
      }
    }
    this.glow = this.phase === 'complete' ? Math.min(1, this.glow + dt / 1.6) : Math.max(0, this.glow - dt);
    motion.setRods(this.collisionRods(this.rods));
    // Gathering, gliding or fading, the shape changes: let the motion model look again.
    if (moving) motion.wake();
    if (this.phase === 'intro' && !moving) {
      this.phase = 'play';
      tray.refill();
    }
  }

  // Every t'an as assembly-local ends, for the motion model to keep clear of the stone: not those
  // still flying in, nor those fading away.
  collisionRods(out) {
    out.length = 0;
    for (const v of this.views.values()) {
      if (v.fade || (v.anim && v.anim.kind !== 'glide')) continue;
      out.push([v.a, v.b]);
    }
    return out;
  }

  // Where a t'an's broad face turns (assembly-local): a t'an of a form out from the centre, turning
  // from where it faced as it glides there.
  upOf(v, out) {
    if (!v.form) return out.copy(v.up);
    out.addVectors(v.a, v.b).normalize();
    if (v.blend < 1) out.lerp(v.up, 1 - v.blend).normalize();
    return out;
  }

  glowOf(v) {
    let blue = 0;
    for (let i = v.pulses.length - 1; i >= 0; i--) {
      const p = v.pulses[i];
      const t = this.time - p.at;
      if (t > 3) {
        v.pulses.splice(i, 1);
        continue;
      }
      blue = Math.max(blue, envelope(t) * p.strength);
    }
    return blue;
  }

  toWorld(p, out) {
    return out.set(p[0], p[1], p[2]).applyMatrix4(this.ctx.stage.assemblyRoot.matrixWorld);
  }

  // Every t'an this frame. A form's t'an meeting at a junction are mitred, so they meet the last
  // millimetre to the last; one fading away shrinks into its own light.
  draw(pool, halos, shaking = 0) {
    const obstacles = [];
    if (!this.game) return obstacles;
    const root = this.ctx.stage.assemblyRoot;
    centre.setFromMatrixPosition(root.matrixWorld);
    const drawn = this.drawn;
    drawn.length = 0;
    for (const v of this.views.values()) {
      const an = v.anim;
      if (an?.kind === 'appear' && an.t < an.delay) continue;
      la.copy(v.a);
      lb.copy(v.b);
      let blue = Math.max(this.glowOf(v), v.flash * 0.6, v.extra);
      let dark = 0;
      if (this.highlight.has(v.id)) blue = Math.max(blue, 0.6);
      if (this.glow > 0) blue = Math.max(blue, this.glow * 0.42);
      if (shaking > 0.08) blue = Math.max(blue, shaking * 0.7);
      if (v.fade) {
        const k = clamp01((v.fade.t - v.fade.delay) / v.fade.duration);
        const s = smoother(k);
        lm.addVectors(la, lb).multiplyScalar(0.5);
        la.lerp(lm, s);
        lb.lerp(lm, s);
        v1.copy(lm).normalize().multiplyScalar(DRIFT * k);
        la.add(v1);
        lb.add(v1);
        blue = Math.max(blue, 0.8 * Math.sin(Math.PI * k));
        dark = smoother(Math.min(1, k * 1.3));
      }
      const r = (this.slots[drawn.length] ??= { a: new THREE.Vector3(), b: new THREE.Vector3(), up: new THREE.Vector3(), trims: new Float32Array(8) });
      r.a.copy(la).applyMatrix4(root.matrixWorld);
      r.b.copy(lb).applyMatrix4(root.matrixWorld);
      r.up.copy(this.upOf(v, lu)).applyQuaternion(root.quaternion);
      r.blue = blue;
      r.dark = dark;
      r.whole = v.form && !an && !v.fade;
      drawn.push(r);
      if (!an && !v.fade) obstacles.push({ a: [r.a.x, r.a.y, r.a.z], b: [r.b.x, r.b.y, r.b.z] });
    }
    mitreAtJunctions(drawn.filter((r) => r.whole));
    for (const r of drawn) {
      pool.push(r.a, r.b, r.up, r.blue, 0, 1, r.dark, r.whole ? r.trims : null);
      if (r.blue > 0.05) halos.push(r.a, r.b, r.blue * 0.28, 0.065, 0);
    }
    return obstacles;
  }

  // World ends of every t'an at rest (for the area a finger may turn).
  worldRods() {
    const out = [];
    if (this.phase === 'dissolving') return out;
    const m = this.ctx.stage.assemblyRoot.matrixWorld;
    for (const v of this.views.values()) {
      if (v.fade || (v.anim && v.anim.kind !== 'glide')) continue;
      out.push([v.a.clone().applyMatrix4(m), v.b.clone().applyMatrix4(m), v.id]);
    }
    return out;
  }

  canLift() {
    const { hand } = this.ctx;
    return this.phase === 'play' && !hand.holding && !hand.flight;
  }

  // The t'an under a finger, and where along it: of those near it on screen, the nearest (among
  // close ones, the nearer the eye wins).
  pick(x, y, reach = 30) {
    const { stage } = this.ctx;
    const m = stage.assemblyRoot.matrixWorld;
    const candidates = [];
    let front = Infinity;
    for (const v of this.views.values()) {
      if (v.anim || v.fade) continue;
      const wa = v.a.clone().applyMatrix4(m);
      const wb = v.b.clone().applyMatrix4(m);
      const sa = stage.toScreen(wa);
      const sb = stage.toScreen(wb);
      const d = segmentDistance(x, y, sa, sb);
      if (d > reach) continue;
      const depth = Math.min(sa.depth, sb.depth);
      front = Math.min(front, depth);
      candidates.push({ v, d, depth, wa, wb });
    }
    let best = null;
    for (const c of candidates) {
      const score = c.d + (c.depth - front) * 22;
      if (!best || score < best.score) best = { ...c, score };
    }
    if (!best) return null;
    stage.rayAt(x, y, ray);
    const hit = G.closestRaySeg(ray.origin.toArray(), ray.direction.toArray(), best.wa.toArray(), best.wb.toArray());
    return { rod: best.v.id, s: Math.min(0.97, Math.max(0.03, hit.t)), world: new THREE.Vector3(...hit.onSeg) };
  }

  // Carried with its ends on two pieces: blue and where it will rest across them; amber on one only.
  aim([ta, tb], f1, f2) {
    const { hand, sound, haptic, stage, say, motion } = this.ctx;
    let pose = null;
    let refused = false;
    if (ta && tb) {
      const eye = motion.toLocal(stage.camera.position, v1);
      const p = Z.placement(this.game, ta, tb, [eye.x, eye.y, eye.z]);
      if (p.ok) pose = p;
      else refused = true;
    }
    this.aimed = pose;
    this.highlight = new Set([ta?.rod, tb?.rod].filter((id) => id !== undefined));
    const world = pose ? { a: this.toWorld(pose.a, new THREE.Vector3()), b: this.toWorld(pose.b, new THREE.Vector3()) } : null;
    hand.follow(f1, f2, { pose: world, touchA: ta?.world ?? null, touchB: tb?.world ?? null, anchor: stage.assemblyRoot.position, refused });
    const key = `${ta?.rod}:${tb?.rod}:${Boolean(pose)}`;
    if (key !== this.aimKey) {
      this.aimKey = key;
      if (ta || tb) {
        sound.hover();
        haptic('tick');
      }
      if (refused) say(ZEN.aimSame);
    }
  }

  // Let go: placed where it was shown; its ends not on two pieces, back to the tray.
  release(cancelled = false) {
    const { hand, tray } = this.ctx;
    const chosen = cancelled ? null : this.aimed;
    this.aimed = null;
    this.aimKey = '';
    this.highlight = new Set();
    if (!chosen || this.phase !== 'play') {
      hand.returnToTray();
      return;
    }
    this.phase = 'resolving';
    tray.hide();
    hand.fly(hand.a, hand.b, this.toWorld(chosen.a, new THREE.Vector3()), this.toWorld(chosen.b, new THREE.Vector3()), 0.15, () => {
      hand.holding = false;
      this.commit(chosen);
    });
  }

  // A t'an comes to rest where placement() found it would (also for tests: as if laid there by
  // hand). The tenth since the last form brings the next.
  commit(pose) {
    const { sound, haptic, say, after, tray } = this.ctx;
    const result = Z.place(this.game, pose);
    if (!result) return null;
    sound.place();
    haptic('place');
    // (Where it was laid: the tenth goes on from there to its rod of the next form.)
    const v = this.addView({ id: result.rod, a: pose.a, b: pose.b, kind: 'placed' });
    v.flash = 0.6;
    // It rests across them: a touch of light where it lies.
    for (const id of pose.pieces) {
      const piece = this.views.get(id);
      if (piece) piece.flash = Math.max(piece.flash, 0.35);
    }
    if (result.transform) {
      this.phase = 'transforming';
      tray.hide();
      say(ZEN.gathers);
      after(0.45, () => this.transform(result.transform));
      return result;
    }
    this.phase = 'resolving';
    tray.hide();
    say(result.placed === this.game.per - 1 ? ZEN.oneMore : ZEN.rests);
    this.carve();
    after(0.35, () => {
      if (this.phase !== 'resolving') return;
      this.phase = 'play';
      tray.refill();
    });
    return result;
  }

  // The whole assembly takes its next form (as zen-rules.js transform reports it).
  transform(t) {
    const { stage, motion, after } = this.ctx;
    const game = this.game;
    const form = buildForm(t.form);
    // The form crystallises in a wave, outward from the junction nearest the eye.
    const eye = motion.toLocal(stage.camera.position, v1).toArray();
    const corners = form.verts.map((p) => G.scale(G.qRotate(t.turn, p), game.radius));
    let first = 0;
    corners.forEach((p, i) => {
      if (G.dist(p, eye) < G.dist(corners[first], eye)) first = i;
    });
    const hops = new Array(corners.length).fill(-1);
    hops[first] = 0;
    const queue = [first];
    for (let i = 0; i < queue.length; i++) {
      for (const w of form.neighbours[queue[i]]) {
        if (hops[w] >= 0) continue;
        hops[w] = hops[queue[i]] + 1;
        queue.push(w);
      }
    }
    const hop = (e) => Math.min(hops[form.edges[e][0]], hops[form.edges[e][1]]);
    // A shimmer over everything as it gathers itself.
    for (const v of this.views.values()) v.pulses.push({ at: this.time + Math.random() * 0.35, strength: 0.45 });
    // What the form has no rod for fades away into light.
    for (const { rod } of t.faded) {
      const v = this.views.get(rod);
      if (v) v.fade = { t: 0, delay: 0.15 + Math.random() * 0.7, duration: FADE };
    }
    // The rest glide to their rods, turning their faces out from the centre.
    let end = 0;
    for (const move of t.moves) {
      const v = this.views.get(move.rod);
      if (!v) continue;
      const delay = 0.35 + hop(move.edge) * WAVE + Math.random() * 0.08;
      const toA = new THREE.Vector3(...move.to.a);
      const toB = new THREE.Vector3(...move.to.b);
      this.upOf(v, v.up);
      if (v.up.dot(v2.addVectors(toA, toB)) < 0) v.up.negate(); // a face turned either way is the same face
      v.form = true;
      v.blend = 0;
      v.anim = { kind: 'glide', fromA: v.a.clone(), fromB: v.b.clone(), toA, toB, t: 0, delay, duration: GLIDE, done: (view) => this.settled(view) };
      end = Math.max(end, delay + GLIDE);
    }
    // New t'an settle into the rods none reached, from a little beyond them.
    for (const added of t.added) {
      const v = this.addView({ id: added.rod, a: added.to.a, b: added.to.b, kind: 'form' });
      const from = v1.addVectors(v.a, v.b).multiplyScalar(0.5 * 1.6).clone();
      const delay = 0.9 + hop(added.edge) * WAVE;
      v.anim = { kind: 'appear', fromA: from, fromB: from.clone(), toA: v.a.clone(), toB: v.b.clone(), t: 0, delay, duration: GLIDE, done: (view) => this.settled(view) };
      v.a.copy(from);
      v.b.copy(from);
      end = Math.max(end, delay + GLIDE);
    }
    this.transformSound(t.stage / game.forms.length);
    after(end + 0.1, () => this.arrive(t, form, hop));
  }

  // A t'an come home to its rod: a touch of metal, a moment's light.
  settled(view) {
    view.flash = Math.max(view.flash, 0.5);
    this.ctx.sound.settle?.(1);
  }

  // The sound of it taking form, in the synthesizer's own voices: a breath of air rising as the
  // t'an let go, and a slow chord swelling beneath it, higher with each form.
  transformSound(level) {
    const { sound } = this.ctx;
    sound.hiss(0.06, 2.6, { from: 280, to: 2600, q: 0.7 });
    const root = 130.8 * 2 ** (level * 0.6);
    [1, 5 / 4, 3 / 2, 2].forEach((r, i) => sound.tone(root * r, 0.035, 3.4, { attack: 1.2 + i * 0.15, delay: 0.1 + i * 0.12, room: 0.85 }));
  }

  // Every t'an home: a wave of light runs across the new form and it rings; or, the last form
  // taken, it is fully formed.
  arrive(t, form, hop) {
    const { sound, haptic, say, tray } = this.ctx;
    if (this.phase !== 'transforming') return;
    for (const v of this.views.values()) {
      const e = Z.rodOf(this.game, v.id)?.edge ?? 0;
      v.pulses.push({ at: this.time + hop(e) * 0.04, strength: 1 });
    }
    if (t.complete) {
      this.phase = 'complete';
      tray.hide();
      sound.complete();
      haptic('complete');
      say(zenWholeText(form));
      this.carve();
      return;
    }
    sound.hoop();
    sound.harmony(t.stage / this.game.forms.length);
    haptic('harmony');
    say(zenBecomesText(form));
    this.phase = 'play';
    tray.length = this.game.length * SCALE;
    tray.refill();
    this.carve();
  }

  // Begin anew: nothing falls; everything fades away into light.
  dissolve() {
    this.phase = 'dissolving';
    this.aimed = null;
    this.highlight = new Set();
    for (const v of this.views.values()) {
      if (v.anim?.kind === 'appear' && v.anim.t < v.anim.delay) {
        this.views.delete(v.id);
        continue;
      }
      v.anim = null;
      v.blend = 1;
      v.fade = { t: 0, delay: Math.random() * 0.35, duration: 1 };
    }
    this.ctx.engraving.set({ zen: null, shape: null, status: null });
  }
}
