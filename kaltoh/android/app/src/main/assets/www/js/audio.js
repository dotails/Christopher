// Sound, synthesized rather than recorded. A struck t'an rings with the partials of a free
// metal bar (1 : 2.756 : 5.404 : 8.933); harmony answers in just intonation; discord beats.
// Beneath it, music: a recording looping quietly (MUSIC), if there is one. Each has a level of its
// own, from silent to full (the sliders carved under the base).
const BAR = [1, 2.756, 5.404, 8.933];
const BAR_GAIN = [1, 0.45, 0.22, 0.1];
// Just-intonation pentatonic: the simplest ratios, as a Vulcan instrument maker might choose.
const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2];
// The recording, when there is one in the assets (null: none yet, and the music slider rests).
const MUSIC = null;
const MUSIC_FULL = 0.55; // the music's gain at full, beneath the t'an
const SFX_FULL = 0.6;

export class Sound {
  constructor() {
    this.ctx = null;
    this.sfx = 0.8;
    this.musicLevel = 0.6;
    this.music = null; // the recording, once there is a gesture to start it
    this.musicGain = null;
    this.musicMissing = false;
    this.hidden = false;
  }

  // The levels of the music and of the sound effects, each from 0 (silent) to 1 (full).
  setVolumes(music, sfx) {
    this.musicLevel = music;
    this.sfx = sfx;
    if (this.master) this.master.gain.value = SFX_FULL * sfx;
    this.applyMusic();
  }

  get muted() {
    return this.sfx <= 0.001;
  }

  // Audio may only start from a user gesture.
  wake() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = SFX_FULL * this.sfx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 4;
      this.master.connect(limiter).connect(ctx.destination);
      this.room = ctx.createConvolver();
      this.room.buffer = this.impulse(2.4);
      const wet = ctx.createGain();
      wet.gain.value = 0.32;
      this.room.connect(wet).connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended' && !this.hidden) this.ctx.resume();
    this.startMusic();
  }

  // The music begins with the first touch (a page may not play sound before one), fading in.
  startMusic() {
    if (!MUSIC) return;
    if (!this.ctx || this.music || this.musicMissing) {
      this.applyMusic();
      return;
    }
    const el = new Audio(MUSIC);
    el.loop = true;
    el.preload = 'auto';
    el.addEventListener('error', () => {
      this.musicMissing = true;
    });
    try {
      // Through the audio graph, so its level eases rather than jumps.
      const source = this.ctx.createMediaElementSource(el);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      source.connect(this.musicGain).connect(this.ctx.destination);
    } catch {
      this.musicGain = null;
    }
    this.music = el;
    this.applyMusic();
  }

  // Play the music at its level, or pause it when silenced or out of sight.
  applyMusic() {
    const el = this.music;
    if (!el || this.musicMissing) return;
    const level = this.musicLevel * MUSIC_FULL;
    const play = level > 0.001 && !this.hidden;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(play ? level : 0, this.ctx.currentTime, 0.4);
    else el.volume = Math.min(1, level);
    if (play && el.paused) el.play().catch(() => {});
    else if (!play && !el.paused) el.pause();
  }

  suspend() {
    this.hidden = true;
    this.music?.pause();
    this.ctx?.suspend();
  }

  resume() {
    this.hidden = false;
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    this.applyMusic();
  }

  impulse(seconds) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    return buf;
  }

  get ready() {
    return !this.muted && this.ctx && this.ctx.state === 'running';
  }

  // One enveloped oscillator into the dry mix and the room.
  tone(freq, gain, decay, { type = 'sine', delay = 0, attack = 0.002, room = 0.35, detune = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(env);
    env.connect(this.master);
    if (room > 0) {
      const send = ctx.createGain();
      send.gain.value = room;
      env.connect(send).connect(this.room);
    }
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  // A struck bar.
  strike(freq, gain, decay, delay = 0, room = 0.3) {
    BAR.forEach((ratio, i) => {
      const f = freq * ratio;
      if (f > 16000) return;
      this.tone(f, gain * BAR_GAIN[i], decay / (1 + i * 1.6), { delay, room, detune: (Math.random() - 0.5) * 8 });
    });
  }

  hiss(gain, duration, { from = 3000, to = 3000, q = 0.8, delay = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  lift() {
    this.strike(2650, 0.05, 0.35);
  }

  hover() {
    this.tone(3400, 0.018, 0.05, { room: 0 });
  }

  place() {
    this.strike(2250, 0.16, 0.7);
    this.hiss(0.05, 0.03, { from: 6000, to: 6000, q: 2 });
  }

  // Inner t'an sliding home: a faint glassy note, gathered so a crowd of them stays soft.
  settle(count) {
    const now = this.ctx?.currentTime ?? 0;
    if (now - (this.lastSettle ?? 0) < 0.09) return;
    this.lastSettle = now;
    this.strike(2600 + Math.random() * 900, Math.min(0.05, 0.018 + count * 0.006), 0.45, 0, 0.5);
  }

  clink(strength) {
    this.strike(1500 + Math.random() * 1500, 0.04 + 0.1 * strength, 0.18 + 0.25 * strength, 0, 0.15);
  }

  // Rises with the structure's harmony: progress is audible.
  harmony(level) {
    const root = 196 * Math.pow(2, level * 1.1);
    [0, 2, 3, 5].forEach((step, i) => {
      this.tone(root * SCALE[step], 0.07, 2.4, { delay: i * 0.055, attack: 0.02, room: 0.7 });
      this.tone(root * SCALE[step] * 2, 0.018, 1.2, { delay: i * 0.055, attack: 0.01, type: 'triangle', room: 0.6 });
    });
  }

  hoop() {
    [0, 2, 4, 5, 7].forEach((step, i) => this.strike(660 * SCALE[step], 0.06, 1.6, 0.25 + i * 0.07, 0.6));
  }

  discord() {
    this.tone(98, 0.16, 0.9, { type: 'sawtooth', attack: 0.01, room: 0.2 });
    this.tone(103.5, 0.14, 0.9, { type: 'sawtooth', attack: 0.01, room: 0.2 });
    this.hiss(0.08, 0.35, { from: 900, to: 200, q: 0.6 });
  }

  fling() {
    this.hiss(0.16, 0.55, { from: 2400, to: 260, q: 1.4 });
    this.tone(150, 0.1, 0.5, { type: 'triangle', attack: 0.01, room: 0.2 });
  }

  wobbleWarning() {
    this.tone(130.8, 0.05, 1.2, { attack: 0.2, room: 0.4 });
    this.tone(132.6, 0.05, 1.2, { attack: 0.2, room: 0.4 });
  }

  complete() {
    const root = 261.6;
    [0, 1, 2, 3, 4, 5, 6, 7].forEach((step, i) => this.strike(root * 2 * SCALE[step], 0.07, 2.2, i * 0.11, 0.7));
    [0, 3, 5].forEach((step) => this.tone(root * SCALE[step] / 2, 0.06, 4.5, { attack: 0.6, delay: 0.3, room: 0.8 }));
  }

  rattle(strength) {
    if (Math.random() < strength * 0.5) this.clink(strength * 0.6);
  }

  // The spin test: a rising, then falling, breath of air.
  spin(duration) {
    this.hiss(0.07, duration * 0.5, { from: 300, to: 1800, q: 1.2 });
    this.hiss(0.05, duration, { from: 1800, to: 240, q: 1.2, delay: duration * 0.45 });
  }

  // Stone on steel.
  scrape(strength) {
    const now = this.ctx?.currentTime ?? 0;
    if (now - (this.lastScrape ?? 0) < 0.12) return;
    this.lastScrape = now;
    this.hiss(0.03 + 0.06 * strength, 0.12, { from: 1400, to: 700, q: 0.9 });
  }

  dissolve() {
    this.hiss(0.1, 1.2, { from: 4000, to: 400, q: 0.5 });
    for (let i = 0; i < 9; i++) this.strike(1400 + Math.random() * 1800, 0.05, 0.3, 0.2 + Math.random() * 0.9, 0.2);
  }
}
