// Sound, synthesized rather than recorded. Every contact sounds as its materials would: a t'an is
// thin, light metal - struck, a sharp click and the high partials of a free bar (1 : 2.756 : 5.404 :
// 8.933) ringing out briefly; drawn along, a thin rough whine. The stone is rock: struck, a low
// knock, the crack of the meeting and its grit; drawn along, a grinding. Each pairing - metal on
// metal, rock on metal, rock on rock - has its hit and its slide. Harmony answers in just
// intonation; discord beats.
// Beneath it, two recordings looping (LOOPS): the room, and music. Each has a level of its own,
// from silent to full (the sliders carved under the base). On the phone the Android shell plays
// them, so other apps' sound plays on with them (a page's media would pause them); the sound of the
// t'an is the page's own, which takes nothing from them either. Every sound of the t'an and the
// stone is felt as well (vibration on): each has a signature of its own (`feel`), as strong as the
// sound, felt even with the sound effects silenced; the music's notes the shell itself makes felt.
import { native } from './native.js';

const BAR = [1, 2.756, 5.404, 8.933];
const BAR_GAIN = [1, 0.45, 0.22, 0.1];
// Just-intonation pentatonic: the simplest ratios, as a Vulcan instrument maker might choose.
const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2];
// The recordings, by the setting each plays at. The room ('music'): ten minutes of the mess hall's
// ambience, faded in and out, so its loop is seamless (made some 6 dB louder than it was given, its
// peaks held under a limiter). The music ('theme'): Voyager's theme on piano, its quiet passages
// brought up to stand beside the room (gently compressed, its peaks limited), a moment's silence
// at either end parting one playing from the next. On the phone the shell raises both further.
const LOOPS = { music: 'assets/music.mp3', theme: 'assets/theme.mp3' };
const LOOP_FULL = 1; // a recording's gain at full: as loud as the player can play it
const SFX_FULL = 0.6;
const VOICE_DUCK = 0.35; // the recordings' level while the guide speaks at full

export class Sound {
  constructor() {
    this.ctx = null;
    this.sfx = 0.8;
    this.levels = { music: 0.6, theme: 0.5 }; // the recordings', by setting
    // Each recording's player, by setting, once there is a gesture to start it: the shell's, or an
    // element of the page's own, through a gain.
    this.loops = {};
    this.hidden = false;
    this.ducked = false; // the recordings lowered beneath the guide's voice
    this.voices = new Map(); // the guide's lines, decoded, by file
    this.speaking = null; // the line being spoken: { source, gain }
    this.voiceLevel = 1;
    this.onFeel = null; // (kind, strength): a sound's signature, to be felt (main.js)
  }

  // A sound felt: its signature (see MainActivity.feel), 0 to 1.
  feel(kind, strength = 1) {
    this.onFeel?.(kind, Math.max(0, Math.min(1, strength)));
  }

  // The levels of the room, the sound effects, the guide's voice and the music, each from 0
  // (silent) to 1 (full). A line being spoken follows its slider at once.
  setVolumes({ music, sfx, voice = this.voiceLevel, theme }) {
    this.levels = { music, theme };
    this.sfx = sfx;
    this.voiceLevel = voice;
    if (this.master) this.master.gain.value = SFX_FULL * sfx;
    if (this.speaking) this.speaking.gain.gain.setTargetAtTime(voice, this.ctx.currentTime, 0.05);
    this.applyMusic();
  }

  get muted() {
    return this.sfx <= 0.001;
  }

  // The sound, ready to play: at once in the app (its page may play without a touch), so the guide
  // can greet the player; in a browser it waits, silent, for the first touch.
  open() {
    if (this.ctx) return;
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

  // A touch: the sound wakes if it was waiting for one, and the recordings begin.
  wake() {
    this.open();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended' && !this.hidden) this.ctx.resume();
    this.startMusic();
  }

  // Whether a line spoken now would be heard.
  get canSpeak() {
    return Boolean(this.ctx) && this.ctx.state === 'running' && !this.hidden && this.voiceLevel > 0.001;
  }

  // The recordings begin with the first touch (a page may not play sound before one), fading in.
  startMusic() {
    for (const [key, url] of Object.entries(LOOPS)) {
      if (this.loops[key]) continue;
      if (native.plays(key)) {
        this.loops[key] = { shell: true };
        continue;
      }
      if (!this.ctx) continue;
      const el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      const loop = { el, gain: null, missing: false };
      el.addEventListener('error', () => {
        loop.missing = true;
      });
      try {
        // Through the audio graph, so its level eases rather than jumps.
        const source = this.ctx.createMediaElementSource(el);
        loop.gain = this.ctx.createGain();
        loop.gain.gain.value = 0;
        source.connect(loop.gain).connect(this.ctx.destination);
      } catch {
        loop.gain = null;
      }
      this.loops[key] = loop;
    }
    this.applyMusic();
  }

  // Play each recording at its level (lowered while the guide speaks), or pause it when silenced
  // or out of sight.
  applyMusic() {
    // Beneath the voice they dip, the less the quieter the voice.
    const duck = this.ducked ? 1 - (1 - VOICE_DUCK) * this.voiceLevel : 1;
    for (const [key, loop] of Object.entries(this.loops)) {
      const level = (this.levels[key] ?? 0) * LOOP_FULL * duck;
      const play = level > 0.001 && !this.hidden;
      if (loop.shell) {
        native.play(key, play ? level : 0);
        continue;
      }
      const { el } = loop;
      if (loop.missing) continue;
      if (loop.gain) loop.gain.gain.setTargetAtTime(play ? level : 0, this.ctx.currentTime, 0.4);
      else el.volume = Math.min(1, level);
      if (play && el.paused) el.play().catch(() => {});
      else if (!play && !el.paused) el.pause();
    }
  }

  // One of the guide's lines, spoken over everything with the recordings lowered beneath it.
  // Resolves when it ends (or at once, if it cannot be played); a line already being spoken is cut
  // short.
  async speak(url) {
    if (!this.ctx || this.hidden) return;
    let buffer = this.voices.get(url);
    if (!buffer) {
      try {
        const data = await fetch(url).then((r) => r.arrayBuffer());
        buffer = await this.ctx.decodeAudioData(data);
        this.voices.set(url, buffer);
      } catch {
        return;
      }
    }
    this.hush();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = this.voiceLevel;
    source.connect(gain).connect(this.ctx.destination);
    const line = { source, gain };
    this.speaking = line;
    this.ducked = true;
    this.applyMusic();
    await new Promise((done) => {
      source.onended = done;
      source.start();
    });
    if (this.speaking === line) {
      this.speaking = null;
      this.ducked = false;
      this.applyMusic();
    }
  }

  // Stop the guide mid-line.
  hush() {
    if (!this.speaking) return;
    const was = this.speaking;
    this.speaking = null;
    try {
      was.source.stop();
    } catch {
      // already ended
    }
    this.ducked = false;
    this.applyMusic();
  }

  suspend() {
    this.hush();
    this.hidden = true;
    for (const loop of Object.values(this.loops)) loop.el?.pause();
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

  // --- Contacts ------------------------------------------------------------------------------

  // A burst of filtered noise: the raw stuff of clicks, knocks and grit.
  burst(gain, decay, { type = 'bandpass', freq = 2000, q = 0.8, delay = 0, room = 0.15, attack = 0.001 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(filter).connect(env).connect(this.master);
    if (room > 0) {
      const send = ctx.createGain();
      send.gain.value = room;
      env.connect(send).connect(this.room);
    }
    src.start(t, Math.random() * 0.9);
    src.stop(t + attack + decay + 0.05);
  }

  // A crowd of contacts in one instant sounds as a few.
  crowded() {
    const now = this.ctx?.currentTime ?? 0;
    this.recent = (this.recent ?? []).filter((t) => now - t < 0.05);
    if (this.recent.length >= 6) return true;
    this.recent.push(now);
    return false;
  }

  // Thin light metal struck, a t'an: a bright click, then its own partials ringing briefly, each
  // t'an a little different. Against metal it rings on and the other answers, a little lower;
  // against rock it is damped at once, and the stone gives a short gritty knock.
  metal(strength, against = 'metal') {
    if (strength >= 0.02) this.feel('tap', strength);
    if (!this.ready || strength < 0.02 || this.crowded()) return;
    const s = Math.min(1, strength);
    const f0 = 2300 + Math.random() * 1500;
    const ring = against === 'metal' ? 0.3 : 0.1;
    this.burst(0.09 * s, 0.004, { type: 'highpass', freq: 5200, q: 0.7, room: 0.05 });
    BAR.forEach((ratio, i) => {
      if (f0 * ratio > 15000) return;
      this.tone(f0 * ratio, 0.05 * s * BAR_GAIN[i], ring / (1 + i * 1.3), { attack: 0.0015, room: 0.18, detune: (Math.random() - 0.5) * 30 });
    });
    if (against === 'metal') {
      const g0 = f0 * (0.8 + Math.random() * 0.15);
      [1, 2.756].forEach((ratio, i) => this.tone(g0 * ratio, (0.025 * s) / (1 + i), ring * 0.8, { attack: 0.002, delay: 0.002, room: 0.18 }));
    } else {
      this.burst(0.08 * s, 0.035, { type: 'lowpass', freq: 1600, q: 0.5, room: 0.1 });
    }
  }

  // Rock on rock, the stone set down on the floor: a low knock, the crack of the meeting, and grit
  // scattering after it.
  rock(strength) {
    if (strength >= 0.02) this.feel('knock', strength);
    if (!this.ready || strength < 0.02) return;
    const s = Math.min(1, strength);
    this.tone(55 + Math.random() * 15, 0.3 * s, 0.22, { attack: 0.003, room: 0.25 });
    this.tone(130 + Math.random() * 30, 0.12 * s, 0.12, { type: 'triangle', attack: 0.002, room: 0.2 });
    this.burst(0.22 * s, 0.07, { type: 'lowpass', freq: 1400, q: 0.6, room: 0.2 });
    this.burst(0.08 * s, 0.02, { type: 'bandpass', freq: 3200, q: 1.2, room: 0.05 });
    for (let i = 0; i < 4; i++) this.burst(0.03 * s, 0.008, { type: 'bandpass', freq: 1500 + Math.random() * 2500, q: 2, delay: 0.02 + Math.random() * 0.1, room: 0.05 });
  }

  // Contacts drawn along, as grains overlapping while the sliding lasts (called again and again):
  // 'metal', metal on metal - a thin bright whine, rough; 'rockMetal', rock on metal - grit, with
  // a faint ring; 'rock', rock on rock - a low grinding. Speed 0..1.
  slide(kind, speed) {
    if (speed < 0.05) return;
    const now = this.ctx?.currentTime ?? performance.now() / 1000;
    this.slides ??= {};
    if (now - (this.slides[kind] ?? 0) < 0.07) return;
    this.slides[kind] = now;
    // Felt grain by grain: metal along metal a fine texture, the stone's grit and grinding coarser.
    this.feel(kind === 'metal' ? 'slide' : 'grind', speed);
    if (!this.ready) return;
    const s = Math.min(1, speed);
    if (kind === 'metal') {
      this.burst(0.03 * s, 0.09, { type: 'bandpass', freq: 3000 + Math.random() * 3000, q: 12, attack: 0.02, room: 0.15 });
      this.burst(0.015 * s, 0.07, { type: 'bandpass', freq: 7000 + Math.random() * 3000, q: 8, attack: 0.02, room: 0.1 });
    } else if (kind === 'rockMetal') {
      this.burst(0.05 * s, 0.1, { type: 'bandpass', freq: 1200 + Math.random() * 1600, q: 0.9, attack: 0.02, room: 0.1 });
      for (let i = 0; i < 3; i++) this.burst(0.03 * s, 0.006, { type: 'highpass', freq: 3000, q: 0.7, delay: Math.random() * 0.08, room: 0.02 });
      this.tone(2500 + Math.random() * 1500, 0.008 * s, 0.08, { attack: 0.01, room: 0.1 });
    } else {
      this.burst(0.08 * s, 0.12, { type: 'lowpass', freq: 500 + 400 * s, q: 0.7, attack: 0.03, room: 0.15 });
      for (let i = 0; i < 3; i++) this.burst(0.025 * s, 0.01, { type: 'bandpass', freq: 800 + Math.random() * 1500, q: 1.5, delay: Math.random() * 0.1, room: 0.05 });
    }
  }

  // Taken up from the tray: the lightest touch of metal.
  lift() {
    this.feel('lift');
    this.metal(0.18, 'metal');
  }

  hover() {
    this.feel('tick', 0.6);
    this.tone(3400, 0.018, 0.05, { room: 0 });
  }

  // A t'an set in place meets two others: metal on metal, twice.
  place() {
    this.feel('place');
    this.metal(0.8, 'metal');
    if (this.ready) setTimeout(() => this.metal(0.6, 'metal'), 18);
  }

  // Inner t'an sliding home: metal drawn along metal, then the touch as each comes to rest,
  // gathered so a crowd of them stays soft.
  settle(count) {
    const now = this.ctx?.currentTime ?? 0;
    if (now - (this.lastSettle ?? 0) < 0.09) return;
    this.lastSettle = now;
    this.slide('metal', Math.min(0.5, 0.15 + count * 0.05));
    this.metal(Math.min(0.35, 0.1 + count * 0.04), 'metal');
  }

  // A t'an knocked against another (or `against` the stone).
  clink(strength, against = 'metal') {
    this.metal(0.2 + 0.8 * strength, against);
  }

  // Rises with the structure's harmony: progress is audible, and felt.
  harmony(level) {
    this.feel('harmony', 0.5 + 0.5 * level);
    const root = 196 * Math.pow(2, level * 1.1);
    [0, 2, 3, 5].forEach((step, i) => {
      this.tone(root * SCALE[step], 0.07, 2.4, { delay: i * 0.055, attack: 0.02, room: 0.7 });
      this.tone(root * SCALE[step] * 2, 0.018, 1.2, { delay: i * 0.055, attack: 0.01, type: 'triangle', room: 0.6 });
    });
  }

  hoop() {
    this.feel('hoop');
    [0, 2, 4, 5, 7].forEach((step, i) => this.strike(660 * SCALE[step], 0.06, 1.6, 0.25 + i * 0.07, 0.6));
  }

  discord() {
    this.feel('discord');
    this.tone(98, 0.16, 0.9, { type: 'sawtooth', attack: 0.01, room: 0.2 });
    this.tone(103.5, 0.14, 0.9, { type: 'sawtooth', attack: 0.01, room: 0.2 });
    this.hiss(0.08, 0.35, { from: 900, to: 200, q: 0.6 });
  }

  // A t'an thrown: the air it cuts, as hard as it was flicked (0 to 1); merely let fall, only a
  // tick felt.
  toss(strength) {
    if (strength < 0.15) {
      this.feel('tick', 0.5);
      return;
    }
    this.feel('toss', strength);
    this.hiss(0.1 * strength, 0.35, { from: 1800, to: 500, q: 1.2 });
  }

  fling() {
    this.feel('fling');
    this.hiss(0.16, 0.55, { from: 2400, to: 260, q: 1.4 });
    this.tone(150, 0.1, 0.5, { type: 'triangle', attack: 0.01, room: 0.2 });
  }

  wobbleWarning() {
    this.feel('wobble');
    this.tone(130.8, 0.05, 1.2, { attack: 0.2, room: 0.4 });
    this.tone(132.6, 0.05, 1.2, { attack: 0.2, room: 0.4 });
  }

  complete() {
    this.feel('complete');
    const root = 261.6;
    [0, 1, 2, 3, 4, 5, 6, 7].forEach((step, i) => this.strike(root * 2 * SCALE[step], 0.07, 2.2, i * 0.11, 0.7));
    [0, 3, 5].forEach((step) => this.tone(root * SCALE[step] / 2, 0.06, 4.5, { attack: 0.6, delay: 0.3, room: 0.8 }));
  }

  // Shaken, the t'an rattle against one another.
  rattle(strength) {
    if (Math.random() < strength * 0.5) this.metal(strength * 0.45, 'metal');
  }

  // The stone drawn along the t'an (or they along it): rock on metal.
  scrape(strength) {
    this.slide('rockMetal', strength);
  }

  // The stone set down on the floor: rock on rock.
  thud(strength) {
    this.rock(strength);
  }

  // Everything falls away: a rush of air, and t'an knocking against one another as they go (their
  // landing is heard as they land).
  dissolve() {
    this.feel('dissolve');
    this.hiss(0.1, 1.2, { from: 4000, to: 400, q: 0.5 });
    for (let i = 0; i < 7; i++) setTimeout(() => this.metal(0.3 + Math.random() * 0.4, 'metal'), 150 + Math.random() * 800);
  }
}
