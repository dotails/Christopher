// Touch. One finger on the t'an's area turns the assembly on its base; on the stone it turns the
// base, in any direction, about the sphere's centre. Open space (below the stone, say, where a
// finger reaching for the tray might land) turns nothing. A pinch draws nearer.
// One finger on the tray takes up the t'an and slides it across the glass; a second finger,
// anywhere, takes hold of it too. Carried so, each finger rests on a piece, and letting go places
// the t'an between them; let go of with one finger only, it goes back to the tray. A tap (on an
// engraving, say) is reported as a tap.
import * as THREE from '../vendor/three.module.min.js';

const GRAB_MARGIN = 16; // a finger that only just misses the tray's t'an still takes it up
const FINGER_LEAD = 10; // the eye sees a touch a little above the fingertip's contact centre
const TURN_RATE = 1.2; // half-turns per screen width
const TAP_SLOP = 10;
const TAP_TIME = 600; // a touch held still no longer than this is a tap

const axis = new THREE.Vector3();
const right = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Input {
  constructor(canvas, ctx) {
    // ctx: { stage, tray, motion, pickRod(x, y), touchesAssembly(x, y), touchesBase(x, y), canLift(), canSpin(),
    //        onLift(x, y), onCarry(x, y), onAim(targets, f1, f2), onRelease(targets, cancelled), onTap(x, y, where),
    //        onGrab(what) }
    this.ctx = ctx;
    this.pointers = new Map();
    this.mode = 'idle';
    this.ids = [];
    this.targets = [null, null];
    this.ignored = new Set();
    const opts = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this.down(e), opts);
    canvas.addEventListener('pointermove', (e) => this.move(e), opts);
    canvas.addEventListener('pointerup', (e) => this.up(e, false), opts);
    canvas.addEventListener('pointercancel', (e) => this.up(e, true), opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = this.ctx.stage.view;
      v.zoom = Math.min(1.3, Math.max(0.45, v.zoom * Math.exp(e.deltaY * 0.001)));
    }, opts);
  }

  down(e) {
    e.preventDefault();
    try {
      e.target.setPointerCapture?.(e.pointerId);
    } catch {
      // Not a live pointer (a synthetic one, say): nothing to capture.
    }
    // Event times, not handler times: a busy frame must not turn a tap into a press.
    const now = e.timeStamp;
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: now, t0: now };
    this.pointers.set(e.pointerId, p);
    const { tray, motion } = this.ctx;

    if ((this.mode === 'idle' || this.mode === 'void') && tray.contains(p.x, p.y, GRAB_MARGIN) && this.ctx.canLift()) {
      // A finger already resting on open space (a thumb at the edge, say) is let be.
      if (this.mode === 'void') this.ignored.add(this.ids[0]);
      this.mode = 'grab';
      this.ids = [p.id];
      this.ctx.onLift(p.x, p.y);
    } else if (this.mode === 'idle') {
      this.ids = [p.id];
      if (this.ctx.canSpin() && this.ctx.touchesAssembly(p.x, p.y)) {
        this.mode = 'spin';
        motion.hold('assembly');
        this.ctx.onGrab?.('assembly');
      } else if (this.ctx.touchesBase(p.x, p.y)) {
        this.mode = 'turn';
        motion.hold('base');
        this.ctx.onGrab?.('base');
      } else {
        this.mode = 'void';
        this.ctx.onGrab?.('void');
      }
    } else if (this.mode === 'grab') {
      // A second finger, wherever it lands, takes hold of the t'an too.
      this.mode = 'hold';
      this.ids = [this.ids[0], p.id];
      this.targets = [null, null];
      this.aim();
    } else if ((this.mode === 'turn' || this.mode === 'spin' || this.mode === 'void') && !tray.contains(p.x, p.y)) {
      const first = this.pointers.get(this.ids[0]);
      if (this.mode !== 'void') motion.release(this.mode === 'turn' ? 'base' : 'assembly', true);
      this.mode = 'pinch';
      this.ids = [first.id, p.id];
      this.pinch = { d0: Math.hypot(p.x - first.x, p.y - first.y) || 1, zoom0: this.ctx.stage.view.zoom };
    } else {
      this.ignored.add(p.id);
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const now = e.timeStamp;
    const dt = Math.max(1, now - p.t) / 1000;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    p.t = now;
    const { motion, stage } = this.ctx;

    if ((this.mode === 'turn' || this.mode === 'spin') && p.id === this.ids[0]) {
      const turn = this.dragTurn(dx, dy);
      if (turn) {
        if (this.mode === 'turn') motion.turnBase(turn.axis, turn.angle, dt);
        else motion.turnAssembly(turn.axis, turn.angle, dt);
      }
    } else if (this.mode === 'grab' && p.id === this.ids[0]) {
      this.ctx.onCarry(p.x, p.y);
    } else if (this.mode === 'pinch') {
      const [a, b] = this.ids.map((id) => this.pointers.get(id));
      if (a && b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        stage.view.zoom = Math.min(1.3, Math.max(0.45, this.pinch.zoom0 * (this.pinch.d0 / d)));
      }
    } else if (this.mode === 'hold' && this.ids.includes(p.id)) {
      this.aim();
    }
  }

  up(e, cancelled) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p || this.ignored.delete(e.pointerId)) return;
    const { motion } = this.ctx;
    const now = e.timeStamp;
    const tap = !cancelled && Math.hypot(p.x - p.x0, p.y - p.y0) < TAP_SLOP && now - p.t0 < TAP_TIME;

    if ((this.mode === 'turn' || this.mode === 'spin') && p.id === this.ids[0]) {
      // A finger lifted while still moving lets what it turned keep turning.
      const still = now - p.t > 90 || tap;
      motion.release(this.mode === 'turn' ? 'base' : 'assembly', still);
      const where = this.mode === 'spin' ? 'assembly' : 'base';
      this.mode = 'idle';
      if (tap) this.ctx.onTap?.(p.x, p.y, where, now);
    } else if (this.mode === 'void' && p.id === this.ids[0]) {
      this.mode = 'idle';
      if (tap) this.ctx.onTap?.(p.x, p.y, 'void', now);
    } else if (this.mode === 'grab' && p.id === this.ids[0]) {
      // Let go of with one finger: back to the tray.
      this.mode = 'idle';
      this.ctx.onRelease([null, null], true);
      if (tap) this.ctx.onTap?.(p.x, p.y, 'tray', now);
    } else if (this.mode === 'pinch' && this.ids.includes(p.id)) {
      for (const id of this.ids) if (id !== p.id && this.pointers.has(id)) this.ignored.add(id);
      this.mode = 'idle';
    } else if (this.mode === 'hold' && this.ids.includes(p.id)) {
      // The first finger to let go decides; the other is ignored until it lifts too.
      for (const id of this.ids) if (id !== p.id && this.pointers.has(id)) this.ignored.add(id);
      this.mode = 'idle';
      this.ctx.onRelease(cancelled ? [null, null] : this.targets, cancelled);
      this.targets = [null, null];
    }
  }

  // A drag as a turn: sideways about the vertical, as a potter's wheel; up and down tipping it
  // toward or away from the eye, all the way over. Together they reach any orientation.
  dragTurn(dx, dy) {
    const { stage } = this.ctx;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return null;
    right.set(1, 0, 0).applyQuaternion(stage.camera.quaternion);
    axis.copy(UP).multiplyScalar(dx).addScaledVector(right, dy).normalize();
    return { axis, angle: (len / stage.size.width) * Math.PI * TURN_RATE };
  }

  aim() {
    const [a, b] = this.ids.map((id) => this.pointers.get(id));
    if (!a || !b) return;
    const ta = this.ctx.pickRod(a.x, a.y - FINGER_LEAD);
    const tb = this.ctx.pickRod(b.x, b.y - FINGER_LEAD);
    this.targets = [ta, tb];
    this.ctx.onAim(this.targets, a, b);
  }

  get busy() {
    return this.mode !== 'idle';
  }
}
