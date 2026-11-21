// Fully procedural audio: every sound effect and every music track is synthesised
// with the Web Audio API, so the game ships with zero audio files.

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harm: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  penta: [0, 3, 5, 7, 10, 12, 15],
};

// Step patterns are 16 sixteenth-notes per bar.
const TRACKS = {
  menu: { bpm: 92, root: 50, scale: 'major', prog: [0, 5, 3, 4], kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x..x..x.x..x....', arp: 'x.x.x.x.x.x.x.x.', arpOct: 1, pad: 0.05, lead: 0.5, swing: 0.12, wave: 'triangle' },
  trailer: { bpm: 100, root: 45, scale: 'minor', prog: [0, 5, 2, 6], kick: 'x.....x...x.....', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.....x...x.....', arp: 'x...x...x...x...', arpOct: 1, pad: 0.08, lead: 0, wave: 'sawtooth', boom: true },
  heist: { bpm: 114, root: 45, scale: 'dorian', prog: [0, 3, 0, 4], kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.xxx.x.x.xxx.x.', bass: 'x..x.x..x..x.x..', arp: '..x...x...x.x...', arpOct: 1, pad: 0.04, lead: 0.55, swing: 0.15, wave: 'square' },
  rooftop: { bpm: 128, root: 43, scale: 'minor', prog: [0, 5, 6, 4], kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.xxx.xxx.xxx.xx', arp: 'xxxxxxxxxxxxxxxx', arpOct: 1, pad: 0.06, lead: 0.4, wave: 'sawtooth' },
  temple: { bpm: 104, root: 45, scale: 'penta', prog: [0, 2, 3, 1], kick: 'x.....x.x.......', snare: '....x..x....x...', hat: 'x..x..x.x..x..x.', bass: 'x.....x...x.....', arp: 'x.xx.x.xx.x.x.xx', arpOct: 1, pad: 0.03, lead: 0.6, wave: 'triangle', tom: true },
  space: { bpm: 96, root: 48, scale: 'lydian', prog: [0, 1, 5, 4], kick: 'x.......x.......', snare: '........x.......', hat: '....x.......x...', bass: 'x.......x...x...', arp: 'x.xxx.xxx.xxx.xx', arpOct: 2, pad: 0.07, lead: 0.3, wave: 'sine' },
  lair: { bpm: 138, root: 40, scale: 'phrygian', prog: [0, 1, 0, 6], kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'xxxxxxxxxxxxxxxx', arp: 'x..x..x.x..x..x.', arpOct: 1, pad: 0.05, lead: 0.45, wave: 'sawtooth' },
  boss: { bpm: 152, root: 40, scale: 'harm', prog: [0, 5, 3, 4], kick: 'x.x.x.x.x.x.x.x.', snare: '....x..x....x.xx', hat: 'xxxxxxxxxxxxxxxx', bass: 'x.xxx.xxx.xxx.xx', arp: 'xxxxxxxxxxxxxxxx', arpOct: 1, pad: 0.05, lead: 0.6, wave: 'square' },
  final: { bpm: 124, root: 48, scale: 'major', prog: [0, 4, 5, 3], kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x..x..x.x..x..x.', arp: 'x.xxx.xxx.xxx.xx', arpOct: 1, pad: 0.06, lead: 0.6, wave: 'square' },
  paradise: { bpm: 80, root: 52, scale: 'major', prog: [0, 3, 5, 4], kick: '................', snare: '................', hat: '................', bass: 'x.......x.......', arp: 'x...x.x...x.x...', arpOct: 2, pad: 0.09, lead: 0.35, wave: 'sine', bells: true },
};

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.6;
    this.sfxVol = 0.8;
    this.track = null;
    this.trackName = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicVol * 0.55; this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);
    // simple feedback delay for a sense of space
    this.delay = c.createDelay(1); this.delay.delayTime.value = 0.28;
    const fb = c.createGain(); fb.gain.value = 0.28;
    const wet = c.createGain(); wet.gain.value = 0.22;
    this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(wet); wet.connect(this.musicBus);
    // noise buffer
    const len = c.sampleRate * 1.5;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.timer = setInterval(() => this._schedule(), 25);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(music * 0.55, this.ctx.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
  }

  // ---------------- primitives ----------------
  _env(g, t, a, peak, dur, rel = 0.05) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur) + rel);
  }

  tone({ type = 'sine', f = 440, f2 = null, dur = 0.2, vol = 0.3, a = 0.005, at = 0, bus = null, lp = null, detune = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = (at || c.currentTime);
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur);
    const g = c.createGain(); this._env(g, t, a, vol, dur);
    let node = o;
    if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
    node.connect(g); g.connect(bus || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.1);
  }

  noise({ dur = 0.2, vol = 0.3, type = 'bandpass', f = 1000, f2 = null, q = 1, at = 0, a = 0.003, bus = null }) {
    if (!this.ctx) return;
    const c = this.ctx, t = (at || c.currentTime);
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); this._env(g, t, a, vol, dur);
    s.connect(fl); fl.connect(g); g.connect(bus || this.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.1);
  }

  // ---------------- sound effects ----------------
  sfx(name, opt = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const p = opt.pitch || 1;
    switch (name) {
      case 'jump': this.tone({ type: 'square', f: 260 * p, f2: 620 * p, dur: 0.14, vol: 0.12, lp: 2400 }); break;
      case 'land': this.noise({ dur: 0.09, vol: 0.18 * (opt.v || 1), type: 'lowpass', f: 500 }); this.tone({ f: 120, f2: 60, dur: 0.08, vol: 0.18 * (opt.v || 1) }); break;
      case 'dive': this.noise({ dur: 0.25, vol: 0.2, type: 'bandpass', f: 600, f2: 2400, q: 2 }); this.tone({ type: 'triangle', f: 500, f2: 200, dur: 0.2, vol: 0.12 }); break;
      case 'step': this.noise({ dur: 0.04, vol: 0.05, type: 'lowpass', f: 900 }); break;
      case 'collect': [0, 4, 7, 12].forEach((n, i) => this.tone({ type: 'square', f: mtof(76 + n), dur: 0.09, vol: 0.09, at: t + i * 0.055, lp: 4000 })); break;
      case 'bigcollect': [0, 4, 7, 12, 16, 19].forEach((n, i) => this.tone({ type: 'triangle', f: mtof(72 + n), dur: 0.18, vol: 0.18, at: t + i * 0.07 })); break;
      case 'plate': this.tone({ type: 'square', f: 330, f2: 660, dur: 0.12, vol: 0.12, lp: 3000 }); this.tone({ type: 'sine', f: 990, dur: 0.25, vol: 0.12, at: t + 0.1 }); break;
      case 'task': [0, 7, 12, 16, 19, 24].forEach((n, i) => this.tone({ type: 'square', f: mtof(67 + n), dur: 0.14, vol: 0.1, at: t + i * 0.08, lp: 3500 })); break;
      case 'door': this.noise({ dur: 1.8, vol: 0.35, type: 'lowpass', f: 300, f2: 120, a: 0.2 }); this.tone({ type: 'sawtooth', f: 55, f2: 40, dur: 1.6, vol: 0.12, lp: 300 }); break;
      case 'bounce': this.tone({ type: 'sine', f: 180, f2: 720, dur: 0.3, vol: 0.25 }); this.tone({ type: 'triangle', f: 360, f2: 1100, dur: 0.25, vol: 0.08 }); break;
      case 'hit': this.noise({ dur: 0.2, vol: 0.35, type: 'lowpass', f: 1500, f2: 200 }); this.tone({ type: 'square', f: 220, f2: 80, dur: 0.25, vol: 0.12, lp: 1500 }); this.tone({ type: 'sine', f: 1200, f2: 1800, dur: 0.1, vol: 0.06, at: t + 0.05 }); break;
      case 'fall': this.tone({ type: 'triangle', f: 700, f2: 120, dur: 0.8, vol: 0.15 }); break;
      case 'splash': this.noise({ dur: 0.6, vol: 0.35, type: 'lowpass', f: 2000, f2: 300 }); this.tone({ f: 200, f2: 50, dur: 0.4, vol: 0.2 }); break;
      case 'respawn': [12, 7, 0].forEach((n, i) => this.tone({ type: 'triangle', f: mtof(72 + n), dur: 0.1, vol: 0.1, at: t + i * 0.06 })); this.tone({ type: 'sine', f: 400, f2: 1200, dur: 0.3, vol: 0.1, at: t + 0.2 }); break;
      case 'clap': this.noise({ dur: 0.06, vol: 0.6, type: 'highpass', f: 1200 }); this.noise({ dur: 0.15, vol: 0.25, type: 'bandpass', f: 2500, q: 3, at: t + 0.01 }); break;
      case 'click': this.tone({ type: 'square', f: 880, f2: 1320, dur: 0.05, vol: 0.08, lp: 3000 }); break;
      case 'whoosh': this.noise({ dur: 0.9, vol: 0.3, type: 'bandpass', f: 300, f2: 3000, q: 1.5, a: 0.3 }); break;
      case 'vortex': this.noise({ dur: 3, vol: 0.4, type: 'bandpass', f: 200, f2: 4000, q: 4, a: 1.2 }); this.tone({ type: 'sawtooth', f: 80, f2: 900, dur: 3, vol: 0.08, lp: 1500, a: 1 }); break;
      case 'flash': this.noise({ dur: 1.4, vol: 0.4, type: 'highpass', f: 800, a: 0.01 }); this.tone({ f: 60, f2: 30, dur: 1, vol: 0.4 }); break;
      case 'glitch': for (let i = 0; i < 6; i++) this.tone({ type: 'square', f: 100 + Math.random() * 1500, dur: 0.05, vol: 0.08, at: t + i * 0.06 }); break;
      case 'crumble': for (let i = 0; i < 14; i++) this.noise({ dur: 0.08, vol: 0.18, type: 'bandpass', f: 1500 + Math.random() * 3000, q: 2, at: t + i * 0.07 + Math.random() * 0.03 }); break;
      case 'rumble': this.noise({ dur: 2.5, vol: 0.5, type: 'lowpass', f: 150, a: 0.5 }); this.tone({ f: 38, dur: 2.4, vol: 0.3, a: 0.4 }); break;
      case 'roar': this.noise({ dur: 1.4, vol: 0.4, type: 'bandpass', f: 400, f2: 180, q: 1.2, a: 0.1 }); this.tone({ type: 'sawtooth', f: 110, f2: 55, dur: 1.3, vol: 0.22, lp: 900, a: 0.08 }); this.tone({ type: 'sawtooth', f: 116, f2: 50, dur: 1.3, vol: 0.18, lp: 700, a: 0.08 }); break;
      case 'slam': this.tone({ f: 90, f2: 30, dur: 0.6, vol: 0.55 }); this.noise({ dur: 0.5, vol: 0.4, type: 'lowpass', f: 600, f2: 100 }); break;
      case 'bosshit': this.tone({ type: 'square', f: 660, f2: 220, dur: 0.3, vol: 0.18, lp: 3000 }); this.noise({ dur: 0.3, vol: 0.4, type: 'bandpass', f: 1200, q: 1 }); this.tone({ f: 80, f2: 40, dur: 0.4, vol: 0.4 }); break;
      case 'charge': this.tone({ type: 'sawtooth', f: 70, f2: 220, dur: 0.8, vol: 0.12, lp: 900 }); break;
      case 'fireball': this.noise({ dur: 0.5, vol: 0.25, type: 'bandpass', f: 800, f2: 300, q: 1 }); break;
      case 'explode': this.noise({ dur: 1.2, vol: 0.6, type: 'lowpass', f: 1800, f2: 80 }); this.tone({ f: 70, f2: 25, dur: 1, vol: 0.5 }); break;
      case 'fanfare': {
        const seq = [[60, 0], [64, 0.12], [67, 0.24], [72, 0.36], [67, 0.6], [72, 0.72], [76, 0.84]];
        seq.forEach(([n, d]) => { this.tone({ type: 'square', f: mtof(n), dur: 0.22, vol: 0.12, at: t + d, lp: 3500 }); this.tone({ type: 'triangle', f: mtof(n - 12), dur: 0.22, vol: 0.12, at: t + d }); });
        this.tone({ type: 'sawtooth', f: mtof(72), dur: 1.2, vol: 0.1, at: t + 1.0, lp: 2500 });
        this.tone({ type: 'sawtooth', f: mtof(76), dur: 1.2, vol: 0.08, at: t + 1.0, lp: 2500 });
        this.tone({ type: 'sawtooth', f: mtof(79), dur: 1.2, vol: 0.08, at: t + 1.0, lp: 2500 });
        break;
      }
      case 'paper': this.noise({ dur: 0.25, vol: 0.18, type: 'highpass', f: 2500, a: 0.02 }); break;
      case 'stamp': this.tone({ f: 120, f2: 60, dur: 0.15, vol: 0.4 }); this.noise({ dur: 0.12, vol: 0.35, type: 'lowpass', f: 800 }); break;
      case 'chains': for (let i = 0; i < 8; i++) this.tone({ type: 'triangle', f: 1800 + Math.random() * 1600, dur: 0.12, vol: 0.06, at: t + i * 0.09 }); break;
      case 'bell': [0, 7, 12].forEach((n, i) => this.tone({ type: 'sine', f: mtof(84 + n), dur: 1.4, vol: 0.12, at: t + i * 0.18 })); break;
      case 'laser': this.tone({ type: 'sawtooth', f: 1400, f2: 300, dur: 0.18, vol: 0.08, lp: 3000 }); break;
      case 'gong': this.tone({ f: 98, dur: 3, vol: 0.4, a: 0.01 }); this.tone({ f: 147, dur: 2.5, vol: 0.2 }); this.tone({ f: 233, dur: 2, vol: 0.12 }); this.noise({ dur: 0.4, vol: 0.2, type: 'bandpass', f: 600, q: 0.8 }); break;
      case 'tick': this.tone({ type: 'square', f: 1600, dur: 0.03, vol: 0.05 }); break;
      case 'prop': this.tone({ type: 'sine', f: 300, f2: 120, dur: 0.6, vol: 0.2 }); this.noise({ dur: 0.4, vol: 0.4, type: 'lowpass', f: 900, at: t + 0.55 }); this.tone({ f: 70, f2: 35, dur: 0.4, vol: 0.5, at: t + 0.55 }); break;
      default: break;
    }
  }

  // ---------------- music ----------------
  playMusic(name) {
    if (!this.ctx || name === this.trackName) return;
    this.trackName = name;
    const c = this.ctx;
    // fade out the previous track bus
    if (this.trackBus) {
      const old = this.trackBus;
      old.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
      setTimeout(() => { try { old.disconnect(); } catch (e) { /* noop */ } }, 2500);
    }
    if (!name || !TRACKS[name]) { this.track = null; this.trackBus = null; return; }
    this.track = TRACKS[name];
    this.trackBus = c.createGain();
    this.trackBus.gain.setValueAtTime(0.0001, c.currentTime);
    this.trackBus.gain.setTargetAtTime(1, c.currentTime + 0.1, 0.5);
    this.trackBus.connect(this.musicBus);
    this.trackBus.connect(this.delay);
    this.step = 0;
    this.nextTime = c.currentTime + 0.15;
    this.rand = mulberry(name.length * 977 + name.charCodeAt(0));
    this.melody = this._makeMelody();
  }

  _makeMelody() {
    // a 4-bar motif of scale degrees (or rests) that repeats with variation
    const r = this.rand, notes = [];
    let deg = 4;
    for (let i = 0; i < 64; i++) {
      if (i % 2 === 1 && r() < 0.6) { notes.push(null); continue; }
      if (r() < 0.25) { notes.push(null); continue; }
      deg += Math.floor(r() * 5) - 2;
      deg = Math.max(0, Math.min(9, deg));
      notes.push(deg);
    }
    return notes;
  }

  _note(degree, octave = 0) {
    const tr = this.track, sc = SCALES[tr.scale];
    const n = sc.length;
    const oct = Math.floor(degree / n);
    const idx = ((degree % n) + n) % n;
    return tr.root + sc[idx] + 12 * (oct + octave);
  }

  _schedule() {
    if (!this.ctx || !this.track) return;
    const c = this.ctx;
    while (this.nextTime < c.currentTime + 0.18) {
      this._playStep(this.step, this.nextTime);
      const tr = this.track;
      let dur = 60 / tr.bpm / 4;
      if (tr.swing) dur *= (this.step % 2 === 0) ? 1 + tr.swing : 1 - tr.swing;
      this.nextTime += dur;
      this.step++;
    }
  }

  _playStep(step, t) {
    const tr = this.track, bus = this.trackBus;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chordDeg = tr.prog[bar % tr.prog.length];
    const sixteenth = 60 / tr.bpm / 4;

    if (tr.kick[s] === 'x') { this.tone({ f: 150, f2: 40, dur: 0.18, vol: 0.55, at: t, bus }); }
    if (tr.snare[s] === 'x') { this.noise({ dur: 0.14, vol: 0.22, type: 'bandpass', f: 1800, q: 0.8, at: t, bus }); this.tone({ type: 'triangle', f: 200, f2: 120, dur: 0.08, vol: 0.12, at: t, bus }); }
    if (tr.hat[s] === 'x') { this.noise({ dur: 0.035, vol: s % 4 === 2 ? 0.07 : 0.04, type: 'highpass', f: 7000, at: t, bus }); }
    if (tr.tom && (s === 13 || s === 14 || s === 15) && bar % 2 === 1) this.tone({ f: 180 - (s - 13) * 30, f2: 70, dur: 0.2, vol: 0.3, at: t, bus });
    if (tr.boom && s === 0 && bar % 2 === 0) { this.tone({ type: 'sawtooth', f: mtof(this._note(chordDeg, -1)), dur: 1.6, vol: 0.18, at: t, bus, lp: 500, a: 0.02 }); this.noise({ dur: 1.2, vol: 0.2, type: 'lowpass', f: 300, at: t, bus }); }

    if (tr.bass[s] === 'x') {
      const n = this._note(chordDeg, -1) + (s % 8 === 6 ? 12 : 0);
      this.tone({ type: 'sawtooth', f: mtof(n), dur: sixteenth * 1.6, vol: 0.16, at: t, bus, lp: 600 });
      this.tone({ type: 'sine', f: mtof(n - 12), dur: sixteenth * 1.8, vol: 0.18, at: t, bus });
    }
    if (tr.arp[s] === 'x') {
      const chord = [0, 2, 4, 7];
      const d = chordDeg + chord[(step) % chord.length];
      this.tone({ type: tr.wave, f: mtof(this._note(d, tr.arpOct)), dur: sixteenth * 0.9, vol: tr.wave === 'sine' ? 0.07 : 0.035, at: t, bus, lp: 3200 });
    }
    if (tr.pad && s === 0) {
      [0, 2, 4].forEach((k, i) => {
        const f = mtof(this._note(chordDeg + k, 0));
        this.tone({ type: 'sawtooth', f, dur: sixteenth * 15, vol: tr.pad, at: t, bus, lp: 900, a: 0.25, detune: i * 6 - 6 });
        this.tone({ type: 'triangle', f: f * 1.003, dur: sixteenth * 15, vol: tr.pad * 0.8, at: t, bus, a: 0.3 });
      });
    }
    if (tr.lead && bar % 8 >= 4) {
      const m = this.melody[(step) % 64];
      if (m !== null && m !== undefined) {
        const n = this._note(chordDeg + m, 1);
        this.tone({ type: tr.bells ? 'sine' : 'square', f: mtof(n), dur: sixteenth * (tr.bells ? 4 : 1.8), vol: (tr.bells ? 0.1 : 0.05) * tr.lead * 1.6, at: t, bus, lp: 2800 });
      }
    }
    if (tr.bells && s === 0 && bar % 2 === 0) this.tone({ type: 'sine', f: mtof(this._note(chordDeg + 7, 2)), dur: 2.5, vol: 0.06, at: t + sixteenth * 2, bus });
  }
}
