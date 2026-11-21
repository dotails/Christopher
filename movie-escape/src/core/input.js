// Unified input: touch (virtual stick + camera drag + buttons), keyboard/mouse
// (pointer lock), and gamepads. Game code only reads the normalised values.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.moveX = 0; this.moveY = 0;
    this.lookDX = 0; this.lookDY = 0;
    this.jumpHeld = false;
    this._jumpPressed = false;
    this._divePressed = false;
    this._pausePressed = false;
    this.keys = new Set();
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.enabled = false; // gameplay controls
    this.lastLookTime = 0;
    this.sens = 1;
    this.invert = false;
    this.stickId = null; this.stickOrigin = { x: 0, y: 0 }; this.stickVec = { x: 0, y: 0 };
    this.lookId = null; this.lookLast = { x: 0, y: 0 };
    this.mouseDrag = false;
    this.pointerLocked = false;
    this.gpPrev = {};
    this.onPointerLockLost = null;

    this.stickEl = document.getElementById('stick');
    this.knobEl = document.getElementById('knob');

    this._bindKeys();
    this._bindTouch();
    this._bindMouse();
    this._bindButtons();
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      if (e.code === 'Space') { this._jumpPressed = true; this.jumpHeld = true; e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE' || e.code === 'KeyQ') this._divePressed = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this._pausePressed = true;
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.jumpHeld = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.jumpHeld = false; });
  }

  _bindTouch() {
    const c = this.canvas;
    const opt = { passive: false };
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.isTouch = true; document.body.classList.add('touch');
      for (const t of e.changedTouches) {
        const leftSide = t.clientX < window.innerWidth * 0.42;
        if (leftSide && this.stickId === null && this.enabled) {
          this.stickId = t.identifier;
          // floating joystick: re-centre where the thumb lands
          this.stickOrigin = { x: t.clientX, y: t.clientY };
          const r = this.stickEl.getBoundingClientRect();
          this.stickEl.style.left = (t.clientX - r.width / 2) + 'px';
          this.stickEl.style.top = (t.clientY - r.height / 2) + 'px';
          this.stickEl.style.bottom = 'auto';
          this.stickEl.classList.add('active');
          this._setKnob(0, 0);
        } else if (this.lookId === null) {
          this.lookId = t.identifier;
          this.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, opt);
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.stickId) {
          const dx = t.clientX - this.stickOrigin.x, dy = t.clientY - this.stickOrigin.y;
          const max = 55;
          const len = Math.hypot(dx, dy);
          const k = len > max ? max / len : 1;
          this._setKnob(dx * k, dy * k);
          let vx = (dx * k) / max, vy = (dy * k) / max;
          // small dead zone, then full analog range
          const m = Math.hypot(vx, vy);
          if (m < 0.12) { vx = 0; vy = 0; }
          this.stickVec = { x: vx, y: vy };
        } else if (t.identifier === this.lookId) {
          const s = 0.0062 * this.sens;
          this.lookDX += (t.clientX - this.lookLast.x) * s;
          this.lookDY += (t.clientY - this.lookLast.y) * s * (this.invert ? -1 : 1);
          this.lookLast = { x: t.clientX, y: t.clientY };
          this.lastLookTime = performance.now();
        }
      }
    }, opt);
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stickId) { this._releaseStick(); }
        if (t.identifier === this.lookId) this.lookId = null;
      }
    };
    c.addEventListener('touchend', end, opt);
    c.addEventListener('touchcancel', end, opt);
  }

  _releaseStick() {
    this.stickId = null; this.stickVec = { x: 0, y: 0 }; this._setKnob(0, 0);
    this.stickEl.classList.remove('active');
    this.stickEl.style.left = ''; this.stickEl.style.top = ''; this.stickEl.style.bottom = '';
  }

  _setKnob(x, y) { this.knobEl.style.transform = `translate(${x}px, ${y}px)`; }

  _bindMouse() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (this.isTouchEvent) return;
      if (this.enabled && !this.pointerLocked && c.requestPointerLock) {
        try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* ignore */ }
      }
      this.mouseDrag = true;
    });
    window.addEventListener('mouseup', () => { this.mouseDrag = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || this.mouseDrag) {
        const s = 0.0028 * this.sens;
        this.lookDX += e.movementX * s;
        this.lookDY += e.movementY * s * (this.invert ? -1 : 1);
        this.lastLookTime = performance.now();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === c;
      if (was && !this.pointerLocked && this.onPointerLockLost) this.onPointerLockLost();
    });
  }

  releasePointer() { if (document.exitPointerLock && this.pointerLocked) document.exitPointerLock(); }

  _bindButtons() {
    const hold = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      const down = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); onDown(); };
      const up = (e) => { e.preventDefault(); el.classList.remove('down'); onUp && onUp(); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
      el.addEventListener('mouseleave', () => el.classList.remove('down'));
    };
    hold('btn-jump', () => { this._jumpPressed = true; this.jumpHeld = true; }, () => { this.jumpHeld = false; });
    hold('btn-dive', () => { this._divePressed = true; });
  }

  // ---------------- per-frame ----------------
  update(dt) {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp') || k.has('KeyZ')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; }
    if (this.stickId !== null) { x = this.stickVec.x; y = -this.stickVec.y; }

    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const dz = (v) => Math.abs(v) < 0.18 ? 0 : v;
      const gx = dz(gp.axes[0] || 0), gy = dz(gp.axes[1] || 0);
      if (gx || gy) { x = gx; y = -gy; }
      const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
      if (rx || ry) {
        this.lookDX += rx * dt * 3.2 * this.sens;
        this.lookDY += ry * dt * 2.4 * this.sens * (this.invert ? -1 : 1);
        this.lastLookTime = performance.now();
      }
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const prev = this.gpPrev;
      if (b(0) && !prev[0]) { this._jumpPressed = true; }
      this.jumpHeld = this.jumpHeld || b(0);
      if (!b(0) && prev[0] && !this.keys.has('Space')) this.jumpHeld = false;
      if ((b(2) && !prev[2]) || (b(1) && !prev[1])) this._divePressed = true;
      if (b(9) && !prev[9]) this._pausePressed = true;
      for (let i = 0; i < 16; i++) prev[i] = b(i);
      break;
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.moveX = x; this.moveY = y;
  }

  consumeLook() { const r = { x: this.lookDX, y: this.lookDY }; this.lookDX = 0; this.lookDY = 0; return r; }
  consumeJump() { const v = this._jumpPressed; this._jumpPressed = false; return v; }
  consumeDive() { const v = this._divePressed; this._divePressed = false; return v; }
  consumePause() { const v = this._pausePressed; this._pausePressed = false; return v; }
  clear() {
    this._jumpPressed = false; this._divePressed = false; this.lookDX = 0; this.lookDY = 0;
    if (this.stickId !== null) this._releaseStick();
  }
}
