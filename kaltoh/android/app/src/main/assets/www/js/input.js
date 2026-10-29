// Touch. One finger on the t'an's area turns the assembly on its base; on the stone it turns the
// base, in any direction, about the sphere's centre, as a turntable. Two fingers there turn it as
// the eye sees it instead: twisted about the line of sight, tumbled as they move together, and
// drawn nearer or further as they spread or close. Open space (below the stone, say, where a
// finger reaching for the tray might land) turns nothing; two fingers there only draw nearer.
// With the base turned over, the carving within its framing circle is for touching (its glyphs,
// its values, its sliders): drags there turn nothing, and the stone is turned by its rim.
// One finger on the tray takes up the t'an and slides it across the glass; a second finger,
// anywhere, takes hold of it too. Carried so, the t'an lies between the fingers at its own
// length, and where its ends are is where it lands: the fingers can spread wide of them, out of
// the way. Letting go places it; let go of with one finger only, it goes back to the tray. A tap
// (on the carving, say) is reported as a tap.
import * as THREE from '../vendor/three.module.min.js';

const GRAB_MARGIN = 16; // a finger that only just misses the tray's t'an still takes it up
const TURN_RATE = 1.2; // half-turns per screen width
const TAP_SLOP = 10;
const TAP_TIME = 600; // a touch held still no longer than this is a tap
const ZOOM = [0.45, 1.3];

const axis = new THREE.Vector3();
const right = new THREE.Vector3();
const upward = new THREE.Vector3();
const toward = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const clampZoom = (z) => Math.min(ZOOM[1], Math.max(ZOOM[0], z));

export class Input {
  constructor(canvas, ctx) {
    // ctx: { stage, tray, motion, pickRod(x, y), rodEnds(f1, f2), touchesAssembly(x, y), touchesBase(x, y),
    //        touchesCarving(x, y), sliderAt(x, y), onSlide(slider, x, y), canLift(), canSpin(), onLift(x, y),
    //        onCarry(x, y), onAim(targets, endA, endB), onRelease(targets, cancelled), onTap(x, y, where),
    //        onGrab(what) }
    this.ctx = ctx;
    this.pointers = new Map();
    this.mode = 'idle';
    this.ids = [];
    this.targets = [null, null];
    this.ignored = new Set();
    this.slider = null; // the carved slider a finger is drawing along
    this.two = null; // two fingers turning: { what, angle, mx, my, d0, zoom0 }
    const opts = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this.down(e), opts);
    canvas.addEventListener('pointermove', (e) => this.move(e), opts);
    canvas.addEventListener('pointerup', (e) => this.up(e, false), opts);
    canvas.addEventListener('pointercancel', (e) => this.up(e, true), opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = this.ctx.stage.view;
      v.zoom = clampZoom(v.zoom * Math.exp(e.deltaY * 0.001));
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
    const { tray, motion, stage } = this.ctx;

    if ((this.mode === 'idle' || this.mode === 'void') && tray.contains(p.x, p.y, GRAB_MARGIN) && this.ctx.canLift()) {
      // A finger already resting on open space (a thumb at the edge, say) is let be.
      if (this.mode === 'void') this.ignored.add(this.ids[0]);
      this.mode = 'grab';
      this.ids = [p.id];
      this.ctx.onLift(p.x, p.y);
    } else if (this.mode === 'idle') {
      this.ids = [p.id];
      if (this.ctx.touchesCarving(p.x, p.y)) {
        // The carving is for touching: its sliders follow the finger, and nothing turns.
        this.mode = 'carve';
        this.slider = this.ctx.sliderAt(p.x, p.y);
        if (this.slider) this.ctx.onSlide(this.slider, p.x, p.y);
        this.ctx.onGrab?.('carving');
      } else if (this.ctx.canSpin() && this.ctx.touchesAssembly(p.x, p.y)) {
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
    } else if ((this.mode === 'turn' || this.mode === 'spin') && !tray.contains(p.x, p.y)) {
      // Two fingers on what turns: it turns as the eye sees it.
      const first = this.pointers.get(this.ids[0]);
      this.ids = [first.id, p.id];
      this.two = {
        what: this.mode === 'turn' ? 'base' : 'assembly',
        angle: Math.atan2(p.y - first.y, p.x - first.x),
        mx: (p.x + first.x) / 2,
        my: (p.y + first.y) / 2,
        d0: Math.hypot(p.x - first.x, p.y - first.y) || 1,
        zoom0: stage.view.zoom,
      };
      this.mode = 'twist';
    } else if ((this.mode === 'void' || this.mode === 'carve') && !tray.contains(p.x, p.y)) {
      const first = this.pointers.get(this.ids[0]);
      this.slider = null;
      this.mode = 'pinch';
      this.ids = [first.id, p.id];
      this.pinch = { d0: Math.hypot(p.x - first.x, p.y - first.y) || 1, zoom0: stage.view.zoom };
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
    } else if (this.mode === 'carve' && p.id === this.ids[0]) {
      if (this.slider) this.ctx.onSlide(this.slider, p.x, p.y);
    } else if (this.mode === 'grab' && p.id === this.ids[0]) {
      this.ctx.onCarry(p.x, p.y);
    } else if (this.mode === 'twist' && this.ids.includes(p.id)) {
      this.twistBy(dt);
    } else if (this.mode === 'pinch') {
      const [a, b] = this.ids.map((id) => this.pointers.get(id));
      if (a && b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        stage.view.zoom = clampZoom(this.pinch.zoom0 * (this.pinch.d0 / d));
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
    } else if (this.mode === 'carve' && p.id === this.ids[0]) {
      const slid = this.slider;
      this.slider = null;
      this.mode = 'idle';
      if (tap && !slid) this.ctx.onTap?.(p.x, p.y, 'carving', now);
    } else if (this.mode === 'void' && p.id === this.ids[0]) {
      this.mode = 'idle';
      if (tap) this.ctx.onTap?.(p.x, p.y, 'void', now);
    } else if (this.mode === 'grab' && p.id === this.ids[0]) {
      // Let go of with one finger: back to the tray.
      this.mode = 'idle';
      this.ctx.onRelease([null, null], true);
      if (tap) this.ctx.onTap?.(p.x, p.y, 'tray', now);
    } else if (this.mode === 'twist' && this.ids.includes(p.id)) {
      // Turned by two fingers, it stops where they leave it; the other is ignored until it lifts.
      for (const id of this.ids) if (id !== p.id && this.pointers.has(id)) this.ignored.add(id);
      motion.release(this.two.what, true);
      this.two = null;
      this.mode = 'idle';
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

  // Two fingers turn what they hold as the eye sees it: twisting them turns it about the line of
  // sight, the same way round; moving them together tumbles it about the screen's own axes (not
  // the vertical, as one finger does); spreading or closing them draws the view nearer or further.
  twistBy(dt) {
    const [a, b] = this.ids.map((id) => this.pointers.get(id));
    if (!a || !b) return;
    const { motion, stage } = this.ctx;
    const two = this.two;
    const turn = (what, ax, angle) => (what === 'base' ? motion.turnBase(ax, angle, dt) : motion.turnAssembly(ax, angle, dt));
    right.set(1, 0, 0).applyQuaternion(stage.camera.quaternion);
    upward.set(0, 1, 0).applyQuaternion(stage.camera.quaternion);
    toward.set(0, 0, 1).applyQuaternion(stage.camera.quaternion);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    let twist = angle - two.angle;
    if (twist > Math.PI) twist -= 2 * Math.PI;
    if (twist < -Math.PI) twist += 2 * Math.PI;
    two.angle = angle;
    // Screen y runs down: a turn clockwise on the screen is clockwise as seen.
    if (Math.abs(twist) > 1e-5) turn(two.what, toward, -twist);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = mx - two.mx;
    const dy = my - two.my;
    two.mx = mx;
    two.my = my;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) {
      axis.copy(upward).multiplyScalar(dx).addScaledVector(right, dy).normalize();
      turn(two.what, axis, (len / stage.size.width) * Math.PI * TURN_RATE);
    }
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    stage.view.zoom = clampZoom(two.zoom0 * (two.d0 / d));
  }

  // Carried by two fingers, the t'an lies between them at its own length: where its ends are is
  // where it lands.
  aim() {
    const [a, b] = this.ids.map((id) => this.pointers.get(id));
    if (!a || !b) return;
    const [ea, eb] = this.ctx.rodEnds(a, b);
    const ta = this.ctx.pickRod(ea.x, ea.y);
    const tb = this.ctx.pickRod(eb.x, eb.y);
    this.targets = [ta, tb];
    this.ctx.onAim(this.targets, ea, eb);
  }

  get busy() {
    return this.mode !== 'idle';
  }
}
