// Touch: one finger turns the base, a pinch on open space draws nearer, and two fingers on
// the tray lift a t'an, carry it, and join the two pieces they rest on when they let go.
import * as K from './logic.js';

const TIP_REACH = 40; // CSS px around a junction that counts as touching it
const ROD_REACH = 30; // CSS px around a rod
const LIFT_SLOP = 26; // a first finger on the tray may drift this far while the second arrives
const FINGER_LEAD = 8; // the eye sees a touch a little above the fingertip's contact centre

export class Input {
  constructor(canvas, ctx) {
    this.ctx = ctx; // { stage, tray, hand, structure, canLift, onLift, onAim, onRelease, onTap }
    this.pointers = new Map();
    this.mode = 'idle';
    this.ids = [];
    this.targets = [null, null];
    this.ignored = new Set();
    this.screenTips = Array.from({ length: K.VERTEX_COUNT }, () => ({ x: 0, y: 0, depth: 0 }));
    const opts = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this.down(e), opts);
    canvas.addEventListener('pointermove', (e) => this.move(e), opts);
    canvas.addEventListener('pointerup', (e) => this.up(e, false), opts);
    canvas.addEventListener('pointercancel', (e) => this.up(e, true), opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(e) {
    e.preventDefault();
    e.target.setPointerCapture?.(e.pointerId);
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), vx: 0, vy: 0 };
    this.pointers.set(e.pointerId, p);
    const { tray, stage } = this.ctx;

    if (this.mode === 'idle') {
      if (tray.contains(p.x, p.y) && this.ctx.canLift()) {
        this.mode = 'wait';
        this.ids = [p.id];
      } else {
        this.mode = 'turn';
        this.ids = [p.id];
        stage.rig.yawVelocity = 0;
        stage.rig.pitchVelocity = 0;
      }
    } else if (this.mode === 'wait') {
      const first = this.pointers.get(this.ids[0]);
      if (tray.contains(p.x, p.y, 36)) {
        this.mode = 'hold';
        this.ids = [first.id, p.id];
        this.targets = [null, null];
        this.ctx.onLift();
        this.aim();
      }
    } else if (this.mode === 'turn' && !tray.contains(p.x, p.y)) {
      const first = this.pointers.get(this.ids[0]);
      this.mode = 'pinch';
      this.ids = [first.id, p.id];
      this.pinch = { d0: Math.hypot(p.x - first.x, p.y - first.y) || 1, zoom0: stage.rig.zoom };
    } else {
      this.ignored.add(p.id);
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const now = performance.now();
    const dt = Math.max(1, now - p.t) / 1000;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.vx = p.vx * 0.6 + (dx / dt) * 0.4;
    p.vy = p.vy * 0.6 + (dy / dt) * 0.4;
    p.x = e.clientX;
    p.y = e.clientY;
    p.t = now;
    const { stage } = this.ctx;

    if (this.mode === 'turn' && p.id === this.ids[0]) {
      stage.turn(dx, dy);
    } else if (this.mode === 'wait' && p.id === this.ids[0]) {
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > LIFT_SLOP) this.mode = 'turn';
    } else if (this.mode === 'pinch') {
      const [a, b] = this.ids.map((id) => this.pointers.get(id));
      if (a && b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        stage.rig.zoom = Math.min(1.35, Math.max(0.62, this.pinch.zoom0 * (this.pinch.d0 / d)));
      }
    } else if (this.mode === 'hold' && this.ids.includes(p.id)) {
      this.aim();
    }
  }

  up(e, cancelled) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p || this.ignored.delete(e.pointerId)) return;

    if (this.mode === 'turn' && p.id === this.ids[0]) {
      const age = performance.now() - p.t;
      if (age < 80) this.ctx.stage.fling(p.vx, p.vy);
      if (Math.hypot(p.x - p.x0, p.y - p.y0) < 8) this.ctx.onTap?.(p.x, p.y);
      this.mode = 'idle';
    } else if (this.mode === 'wait' && p.id === this.ids[0]) {
      this.mode = 'idle';
      this.ctx.onTap?.(p.x, p.y, 'tray');
    } else if (this.mode === 'pinch' && this.ids.includes(p.id)) {
      for (const id of this.ids) if (id !== p.id && this.pointers.has(id)) this.ignored.add(id);
      this.mode = 'idle';
    } else if (this.mode === 'hold' && this.ids.includes(p.id)) {
      // The first finger to let go decides; the other is ignored until it lifts too.
      for (const id of this.ids) if (id !== p.id && this.pointers.has(id)) this.ignored.add(id);
      this.mode = 'idle';
      this.ctx.onRelease(cancelled ? [null, null] : this.targets);
      this.targets = [null, null];
    }
  }

  // What each holding finger rests on; feeds the hand and the highlights.
  aim() {
    const [a, b] = this.ids.map((id) => this.pointers.get(id));
    if (!a || !b) return;
    this.projectTips();
    const ta = this.pick(a.x, a.y - FINGER_LEAD);
    const tb = this.pick(b.x, b.y - FINGER_LEAD);
    this.targets = [ta, tb];
    this.ctx.onAim(this.targets, a, b);
  }

  projectTips() {
    const { structure, stage } = this.ctx;
    for (let v = 0; v < K.VERTEX_COUNT; v++) {
      stage.toScreen(structure.tipWorld(v), this.screenTips[v]);
    }
  }

  // The junction under a finger: nearest tip within reach (front ones favoured), else the
  // nearer end of the nearest rod. Also names the rod that reads as "the piece touched".
  pick(x, y) {
    const { structure } = this.ctx;
    const rods = structure.presentRods();
    const lattice = K.buildLattice();
    let nearest = -1;
    let best = Infinity;
    let frontDepth = Infinity;
    for (const t of this.screenTips) frontDepth = Math.min(frontDepth, t.depth);
    const reachable = new Set();
    for (const e of rods) for (const v of lattice.edges[e]) reachable.add(v);
    for (const v of reachable) {
      const t = this.screenTips[v];
      const d = Math.hypot(t.x - x, t.y - y);
      if (d > TIP_REACH) continue;
      const score = d + (t.depth - frontDepth) * 6;
      if (score < best) {
        best = score;
        nearest = v;
      }
    }
    let rod = -1;
    let rodDist = Infinity;
    for (const e of rods) {
      const [u, v] = lattice.edges[e];
      if (nearest >= 0 && u !== nearest && v !== nearest) continue;
      const d = segmentDistance(x, y, this.screenTips[u], this.screenTips[v]);
      if (d < rodDist) {
        rodDist = d;
        rod = e;
      }
    }
    if (nearest < 0) {
      if (rod < 0 || rodDist > ROD_REACH) return null;
      const [u, v] = lattice.edges[rod];
      const du = Math.hypot(this.screenTips[u].x - x, this.screenTips[u].y - y);
      const dv = Math.hypot(this.screenTips[v].x - x, this.screenTips[v].y - y);
      nearest = du < dv ? u : v;
    }
    return { tip: nearest, rod };
  }

  get busy() {
    return this.mode !== 'idle';
  }
}

function segmentDistance(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}
