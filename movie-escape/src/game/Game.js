import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { AudioEngine } from '../core/audio.js';
import { Input } from '../core/input.js';
import { UI } from '../core/ui.js';
import { PhysicsWorld } from '../world/physics.js';
import { Player } from '../world/player.js';
import { FX } from '../world/fx.js';
import { buildCorridor } from '../world/room.js';
import { buildHeist, buildRooftop, buildTemple, buildSpace, buildLair } from '../world/rooms.js';
import { Theater } from '../world/theater.js';
import { Paradise, PARADISE_KEY } from '../world/paradise.js';
import { Boss } from '../world/boss.js';
import { Pickup, Zone, Entity } from '../world/entities.js';
import { makeClapper, makeScript } from '../world/props.js';
import { glow, mat } from '../world/materials.js';

const SAVE_KEY = 'reel-escape-save-v1';
const SETTINGS_KEY = 'reel-escape-settings-v1';
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const ROOM_INTRO = [
  null,
  ['Scene Two: THE ROOFTOP CHASE.', 'Mind the gaps. Stunt doubles are expensive.'],
  ['Scene Three: THE JUNGLE TEMPLE.', 'The logs spin. Nobody knows why. Art department\'s call.'],
  ['Scene Four: SPACE STATION. Low gravity, low budget.', 'Jump. You\'ll float. It\'s science.'],
  ['The FINAL scene: the Villain\'s Lair!', 'Finish this and you\'re out. Probably. Don\'t touch the lava.'],
];
const ROOM_DONE = [
  ['CUT! Print it! The vault is open — on to Scene Two!'],
  ['The chopper got away! Perfect. That\'s a wrap on the rooftop!'],
  ['The temple approves. I think. Next scene!'],
  ['Command deck secured. Ground control says: go to Scene Five.'],
];
const CLAPPER_LINES = {
  4: ['One clapperboard down! Now head back the way you came.'],
  3: ['A zero-G catch! Beautiful.'],
  2: ['The turntable gives it up. Keep going!'],
  1: ['Got the chopper\'s clapperboard!'],
};

function loadSettings() {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const def = { music: 0.6, sfx: 0.85, sens: 1, quality: isTouch ? 'medium' : 'high', autocam: isTouch, invert: false, color: '#ff4f9a' };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return def; }
}

export class Game {
  constructor() {
    this.settings = loadSettings();
    this.canvas = document.getElementById('game');
    this.phase = 'boot';
    this.paused = false; this.modal = false;
    this.timers = []; this.tracks = [];
    this.skipping = false;
    this.time = 0; this.playTime = 0;
    this.stats = { takes: 1, jumps: 0, falls: 0 };
    this.story = { stage: 'main', progressRoom: 0, clappers: { 1: false, 2: false, 3: false, 4: false }, returnRoom: 4 };
    this.blockers = [];
    this.curRoom = -1;
    this.checkpoint = { pos: V(0, 0, 15), facing: Math.PI };
    this.cam = { yaw: 0, pitch: 0.34, dist: 9.5, target: V(), look: V(), shake: 0, mode: 'menu', curDist: 9.5 };
    this.idleHint = 0;
    this.endingT = 0;
  }

  // =========================================================== boot
  async boot() {
    this.ui = null;
    this._initRenderer();
    this.audio = new AudioEngine();
    this.audio.setVolumes(this.settings.music, this.settings.sfx);
    this.input = new Input(this.canvas);
    this.ui = new UI(this);
    this.applySettings(false);
    const step = async (p, tip) => { this.ui.loading(p, tip); await frame(); };

    await step(0.05, 'Rewinding the film...');
    try {
      await Promise.race([
        Promise.all([document.fonts.load('40px "Titan One"'), document.fonts.load('20px "Special Elite"'), document.fonts.load('800 16px Nunito')]),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch (e) { /* fonts are optional */ }

    this.world = new PhysicsWorld();
    this.fx = new FX(this.scene);
    await step(0.12, 'Sweeping the popcorn...');
    this.theater = new Theater(this);
    const builders = [
      [buildHeist, 'Painting the bank vault...'],
      [buildRooftop, 'Wiring the city lights...'],
      [buildTemple, 'Planting the jungle...'],
      [buildSpace, 'Launching the space station...'],
      [buildLair, 'Heating up the lava...'],
    ];
    this.rooms = [];
    for (let i = 0; i < builders.length; i++) {
      await step(0.2 + i * 0.13, builders[i][1]);
      this.rooms.push(builders[i][0](this));
    }
    this.corridors = [];
    for (let i = 0; i < 4; i++) this.corridors.push(buildCorridor(this, i));
    await step(0.86, 'Painting the sky...');
    this.paradise = new Paradise(this);
    this.boss = new Boss(this, this.rooms[4]);
    this.player = new Player(this);
    this._buildGuide();
    await step(0.94, 'Warming up the projector...');
    this._compileAll();
    await step(1, 'Lights... camera...');

    window.addEventListener('resize', () => this._resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.phase === 'play') this.pause(true); });
    this.input.onPointerLockLost = () => {
      if (this.phase === 'play' && !this.modal && !this.paused) { this.pause(true); this._ignorePause = performance.now() + 350; }
    };

    this._enterMenu();
    this.ui.hideLoading();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this._loop());

    const auto = sessionStorage.getItem('reel-autostart');
    if (auto) { sessionStorage.removeItem('reel-autostart'); setTimeout(() => (auto === 'new' ? this.newGame() : this.continueGame()), 300); }
  }

  _initRenderer() {
    const q = this.settings.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#120a1c');
    this.scene.fog = new THREE.Fog('#120a1c', 40, 130);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1000);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03;
    const sm = q === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    this.scene.add(this.sun, this.sun.target);
    this.envCur = { bg: new THREE.Color('#120a1c'), fog: new THREE.Color('#120a1c'), near: 40, far: 130, sky: new THREE.Color('#fff'), ground: new THREE.Color('#444'), hi: 1, sunC: new THREE.Color('#fff'), si: 2 };
    this.envTarget = null;
    if (q === 'high') {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.55, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this._resize();
  }

  _resize() {
    const q = this.settings.quality;
    const dpr = window.devicePixelRatio || 1;
    const pr = q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this._maxPR = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    // wider FOV on narrow / portrait-ish screens so the action stays in view
    this.camera.fov = this.camera.aspect < 1.2 ? 75 : 62;
    this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(window.innerWidth, window.innerHeight); }
  }

  _compileAll() {
    const vis = [];
    this.scene.traverse((o) => { if (!o.visible) { vis.push(o); o.visible = true; } });
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* not fatal */ }
    vis.forEach((o) => { o.visible = false; });
  }

  // =========================================================== settings / save
  applySettings(persist = true) {
    const s = this.settings;
    this.audio.setVolumes(s.music, s.sfx);
    this.input.sens = s.sens; this.input.invert = s.invert;
    if (this.player) this.player.setColor(s.color);
    if (this._appliedQuality && this._appliedQuality !== s.quality) {
      // quality changes need a fresh renderer; restart quietly preserving progress
      this.saveSettings();
      if (this.phase === 'play') this.save();
      sessionStorage.setItem('reel-autostart', this.phase === 'play' ? 'continue' : '');
      if (this.phase !== 'play') sessionStorage.removeItem('reel-autostart');
      location.reload();
      return;
    }
    this._appliedQuality = s.quality;
    if (persist) this.saveSettings();
  }
  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ } }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ story: this.story, stats: this.stats, playTime: this.playTime }));
    } catch (e) { /* ignore */ }
  }
  loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } }

  // =========================================================== menu
  _enterMenu() {
    this.phase = 'menu';
    this.cam.mode = 'menu';
    this.theater.mode = 'loop';
    this.theater.seatPlayer(this.player);
    this._setVisibility('theater');
    this._setEnv(this._theaterEnv(), true);
    this.ui.showMenu(!!this.loadSave());
    this.ui.hud(false);
    this.audio.playMusic('menu');
  }

  _theaterEnv() { return { bg: '#07030a', fog: ['#07030a', 30, 90], hemi: ['#7a5a90', '#1a0a10', 0.55], sun: ['#ffffff', 1.6] }; }

  newGame() {
    if (this.phase !== 'menu') return;
    if (this.started) { sessionStorage.setItem('reel-autostart', 'new'); location.reload(); return; }
    this.started = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    this.audio.unlock();
    this.ui.hideMenu();
    this.playIntro();
  }

  continueGame() {
    if (this.phase !== 'menu') return;
    const data = this.loadSave();
    if (!data) return this.newGame();
    if (this.started) { sessionStorage.setItem('reel-autostart', 'continue'); location.reload(); return; }
    this.started = true;
    this.audio.unlock();
    this.ui.hideMenu();
    this._restore(data);
  }

  quitToMenu() {
    if (this.phase === 'play' || this.phase === 'cine') this.save();
    location.reload();
  }

  // =========================================================== pause
  pause(on) {
    if (on && this.phase !== 'play') return;
    this.paused = on;
    this.ui.pauseMenu(on);
    if (on) { this.input.releasePointer(); this.input.clear(); }
  }
  setModal(on) { this.modal = on; if (on) { this.input.releasePointer(); this.input.clear(); } }

  // =========================================================== main loop
  _loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.input.update(dt);
    if (this.input.consumePause() && !(this._ignorePause && performance.now() < this._ignorePause)) {
      if (this.modal) { document.getElementById('paper-big').classList.remove('show'); this.setModal(false); }
      else if (this.phase === 'play') this.pause(!this.paused);
    }
    if (!this.paused && !this.modal) this._update(dt);
    else this.input.consumeLook();
    this._adaptResolution(now);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  // Dynamic resolution: if the device can't hold ~45fps, render fewer pixels.
  _adaptResolution(now) {
    if (this.phase !== 'play') { this._fpsT0 = now; this._fpsN = 0; return; }
    this._fpsN = (this._fpsN || 0) + 1;
    if (!this._fpsT0) this._fpsT0 = now;
    const span = now - this._fpsT0;
    if (span < 2500) return;
    const fps = this._fpsN * 1000 / span;
    this._fpsT0 = now; this._fpsN = 0;
    const cur = this.renderer.getPixelRatio();
    let next = cur;
    if (fps < 42 && cur > 0.6) next = Math.max(0.6, cur - 0.15);
    else if (fps > 57 && cur < this._maxPR) next = Math.min(this._maxPR, cur + 0.1);
    if (Math.abs(next - cur) > 0.01) {
      this.renderer.setPixelRatio(next);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      if (this.composer) { this.composer.setPixelRatio(next); this.composer.setSize(window.innerWidth, window.innerHeight); }
    }
  }

  wait(s) {
    if (this.skipping) return Promise.resolve();
    return new Promise((r) => this.timers.push({ t: s, r }));
  }
  track(dur, fn) {
    if (this.skipping) { fn(1, 0); return Promise.resolve(); }
    return new Promise((r) => this.tracks.push({ t: 0, dur, fn, r }));
  }
  shot(fromPos, fromLook, toPos, toLook, dur, e = ease) {
    this.cam.mode = 'cine';
    const p = new THREE.Vector3(), l = new THREE.Vector3();
    return this.track(dur, (k) => {
      const kk = e(k);
      p.lerpVectors(fromPos, toPos, kk); l.lerpVectors(fromLook, toLook, kk);
      this.camera.position.copy(p); this.cam.look.copy(l); this.camera.lookAt(l);
    });
  }
  say(lines, opt) { if (this.skipping) return Promise.resolve(); this.idleHint = 0; return this.ui.say(lines, opt); }

  skipCinematic() {
    if (this.phase !== 'cine' || this.skipping) return;
    this.skipping = true;
    this.ui.clearDialog();
    const tr = this.tracks; this.tracks = [];
    tr.forEach((t) => { t.fn(1, 0); t.r(); });
    const tm = this.timers; this.timers = [];
    tm.forEach((t) => t.r());
  }

  _update(dt) {
    this.time += dt;
    // timers + tracks
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.r(); } }
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const t = this.tracks[i]; t.t += dt; const k = Math.min(1, t.t / t.dur);
      t.fn(k, dt);
      if (k >= 1) { this.tracks.splice(i, 1); t.r(); }
    }

    if (this.phase === 'menu') {
      this.theater.update(dt);
      this.player.animate(dt);
      const t = this.time;
      const T = (x, y, z) => this.theater.toWorld(x, y, z);
      this.camera.position.copy(T(Math.sin(t * 0.09) * 6, 3.2 + Math.sin(t * 0.13) * 0.5, -12.5));
      this.camera.lookAt(T(Math.sin(t * 0.09) * 2, 2.2, 3));
      this._sunTheater();
      this._envStep(dt);
      this.fx.update(dt);
      return;
    }

    if (this.phase === 'play') { this.playTime += dt; this.idleHint += dt; }

    // ---- simulation
    const pl = this.player;
    const look = this.input.consumeLook();
    if (this.cam.mode === 'follow') { this.cam.yaw -= look.x; this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + look.y, -0.12, 1.2); }
    const jump = this.input.consumeJump(), dive = this.input.consumeDive();
    const moveDir = new THREE.Vector3();
    if (pl.controlEnabled && this.phase === 'play') {
      const fx = -Math.sin(this.cam.yaw), fz = -Math.cos(this.cam.yaw);
      const rx = Math.cos(this.cam.yaw), rz = -Math.sin(this.cam.yaw);
      moveDir.set(fx * this.input.moveY + rx * this.input.moveX, 0, fz * this.input.moveY + rz * this.input.moveX);
    }
    const ri = this._roomIndexAt(pl.pos);
    const room = this.ending ? null : this.rooms[ri];
    const activeRooms = this.ending ? [] : this.rooms.filter((r) => Math.abs(r.index - ri) <= 1);
    const gravity = room ? room.gravity : 34;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    const ctx = { world: this.world, gravity, moveDir, jump: false, dive: false, jumpHeld: this.input.jumpHeld, jumpV: 12.8 };
    for (let i = 0; i < steps; i++) {
      for (const r of activeRooms) for (const e of r.entities) e.fixed(h, this);
      if (ri >= 3 && !this.ending) this.boss.fixed(h);
      ctx.jump = jump && i === 0; ctx.dive = dive && i === 0;
      pl.step(h, ctx);
    }
    for (const r of activeRooms) for (const e of r.entities) e.frame(dt, this);
    this.boss.frame(dt);
    pl.animate(dt);
    this.fx.update(dt);
    if (this.theater.group.visible) this.theater.update(dt);
    this.paradise.update(dt);

    if (!this.ending && this.phase !== 'boot') {
      if (ri !== this.curRoom && (this.phase === 'play' || this.forceRoomTrack)) this._onRoomChange(ri);
      if (this.phase === 'play' && pl.physicsEnabled && room && pl.pos.y < room.killY && !this.dying) this._kill(room);
    }
    if (this.phase === 'play') {
      this._updateGuide(dt, ri);
      if (this.idleHint > 75 && !this.ending) { this.idleHint = 0; this.say(['Lost? Follow the golden arrow at your feet.', 'Or tap your script and squint really hard.']); }
      if (this.ending) this._endingTick(dt);
    } else this.guide.visible = false;

    this._updateCamera(dt);
    if (this.theater.group.visible && this.phase === 'cine' && this.theaterLight) this._sunTheater(); else this._sunFollow();
    this._envStep(dt);
  }

  _roomIndexAt(p) { return THREE.MathUtils.clamp(Math.round(-p.z / 60), 0, 4); }

  // =========================================================== camera
  _updateCamera(dt) {
    const c = this.cam, pl = this.player;
    if (c.mode === 'follow') {
      if (this.settings.autocam && performance.now() - this.input.lastLookTime > 1400) {
        const sp = Math.hypot(pl.vel.x, pl.vel.z);
        if (sp > 3 && pl.state === 'normal' && Math.abs(this.input.moveY) > 0.3) {
          const want = Math.atan2(-pl.vel.x, -pl.vel.z);
          let d = ((want - c.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
          if (Math.abs(d) < 2.4) c.yaw += d * Math.min(1, dt * 0.9 * (sp / 8.6));
        }
      }
      const tgt = V(pl.pos.x, pl.pos.y + 1.6, pl.pos.z);
      c.target.x += (tgt.x - c.target.x) * Math.min(1, dt * 14);
      c.target.z += (tgt.z - c.target.z) * Math.min(1, dt * 14);
      c.target.y += (tgt.y - c.target.y) * Math.min(1, dt * 7);
      const dir = V(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
      // keep the camera out of the scenery
      let dist = c.dist;
      if (!this._ray) this._ray = new THREE.Raycaster();
      const ri = this._roomIndexAt(pl.pos);
      const blockers = this.ending ? [] : [...this.rooms[ri].blockers, ...this.blockers];
      if (blockers.length) {
        this._ray.set(c.target, dir); this._ray.far = c.dist + 0.5;
        const hit = this._ray.intersectObjects(blockers, false)[0];
        if (hit) dist = Math.max(1.6, hit.distance - 0.6);
      }
      c.curDist += (dist - c.curDist) * Math.min(1, dt * (dist < c.curDist ? 20 : 4));
      this.camera.position.copy(c.target).addScaledVector(dir, c.curDist);
      this.camera.lookAt(c.target);
    }
    if (c.shake > 0) {
      c.shake = Math.max(0, c.shake - dt * 1.8);
      const s = c.shake * c.shake * 0.6;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
  }
  shake(a) { this.cam.shake = Math.min(1.2, Math.max(this.cam.shake, a)); if (navigator.vibrate && a > 0.3) { try { navigator.vibrate(Math.round(a * 60)); } catch (e) { /* ignore */ } } }

  _followCam(yaw = null) {
    const c = this.cam;
    c.mode = 'follow';
    if (yaw !== null) c.yaw = yaw;
    c.pitch = 0.34;
    c.target.set(this.player.pos.x, this.player.pos.y + 1.6, this.player.pos.z);
    c.curDist = c.dist;
  }

  // =========================================================== environment
  _setEnv(env, instant = false) {
    this.envTarget = {
      bg: new THREE.Color(env.bg), fog: new THREE.Color(env.fog[0]), near: env.fog[1], far: env.fog[2],
      sky: new THREE.Color(env.hemi[0]), ground: new THREE.Color(env.hemi[1]), hi: env.hemi[2],
      sunC: new THREE.Color(env.sun[0]), si: env.sun[1],
    };
    if (instant) this._envStep(10);
  }
  _envStep(dt) {
    const t = this.envTarget; if (!t) return;
    const c = this.envCur, k = Math.min(1, dt * 2.2);
    c.bg.lerp(t.bg, k); c.fog.lerp(t.fog, k); c.near += (t.near - c.near) * k; c.far += (t.far - c.far) * k;
    c.sky.lerp(t.sky, k); c.ground.lerp(t.ground, k); c.hi += (t.hi - c.hi) * k; c.sunC.lerp(t.sunC, k); c.si += (t.si - c.si) * k;
    this.scene.background.copy(c.bg);
    this.scene.fog.color.copy(c.fog); this.scene.fog.near = c.near; this.scene.fog.far = c.far;
    this.hemi.color.copy(c.sky); this.hemi.groundColor.copy(c.ground); this.hemi.intensity = c.hi;
    if (!(this.theater.group.visible)) { this.sun.color.copy(c.sunC); this.sun.intensity = c.si; }
  }
  _sunFollow() {
    const p = this.player.pos;
    const sx = Math.round(p.x), sz = Math.round(p.z);
    this.sun.position.set(sx + 14, p.y + 30, sz + 10);
    this.sun.target.position.set(sx, p.y, sz);
  }
  _sunTheater() {
    const th = this.theater;
    this.sun.position.copy(th.toWorld(0, 7, -14));
    this.sun.target.position.copy(th.toWorld(0, 1, 6));
    this.sun.color.copy(th.screenColor);
    this.sun.intensity = 1.4 + Math.random() * 0.25;
  }

  _setVisibility(mode, ri = 0) {
    this.theater.group.visible = mode === 'theater';
    this.paradise.group.visible = mode === 'paradise';
    this.rooms.forEach((r, i) => {
      r.group.visible = mode === 'rooms' && Math.abs(i - ri) <= 1;
      if (r.backdrop) r.backdrop.visible = mode === 'rooms' && i === ri;
    });
    this.corridors.forEach((c, i) => { c.visible = mode === 'rooms' && (i === ri || i === ri - 1); });
    this.boss.group.visible = mode === 'rooms' && ri >= 3 && this.boss.state !== 'hidden' && this.boss.state !== 'gone';
    if (mode === 'rooms') this.world.setActive([ri - 1, ri, ri + 1]);
    else if (mode === 'paradise') this.world.setActive([PARADISE_KEY]);
    else this.world.setActive([]);
  }

  // =========================================================== rooms
  _onRoomChange(ri) {
    const prev = this.curRoom;
    this.curRoom = ri;
    const room = this.rooms[ri];
    this._setVisibility('rooms', ri);
    this._setEnv(room.env);
    const st = this.story.stage;
    if (st === 'main') this.audio.playMusic(room.music);
    else if (st === 'boss') this.audio.playMusic(ri === 4 ? 'boss' : room.music);
    else if (st === 'return') this.audio.playMusic('final');
    this.ui.setScene(ri + 1, room.name, this.stats.takes);

    if (st === 'main' && !room.visited && ri === this.story.progressRoom) {
      room.visited = true;
      this.checkpoint = { pos: room.spawn.clone(), facing: Math.PI };
      if (ri > 0) {
        this.ui.slate(room.name, ri + 1, this.stats.takes);
        setTimeout(() => this.say(ROOM_INTRO[ri]), 1800);
      }
      this.save();
    } else if (st === 'return') {
      if (ri < prev) {
        this.checkpoint = { pos: room.spawnBack.clone(), facing: 0 };
        this.story.returnRoom = ri;
        this.save();
        this.ui.slate(`${room.name} (RETAKE)`, ri + 1, this.stats.takes);
      }
    } else if (st === 'main' && ri < prev) {
      // walking back through finished scenes
      this.checkpoint = { pos: room.spawnBack.clone(), facing: 0 };
    } else if (st === 'main' && ri > prev && room.visited) {
      this.checkpoint = { pos: room.spawn.clone(), facing: Math.PI };
    }
    this._refreshPaper();
  }

  _refreshPaper() {
    const st = this.story.stage;
    if (st === 'return' || st === 'done') {
      const tasks = [4, 3, 2, 1].map((i) => ({ id: `clap${i}`, text: `Scene ${i + 1}: ${this.rooms[i].clapperSpot.hint}`, count: this.story.clappers[i] ? 1 : 0, total: 1, done: this.story.clappers[i] }));
      tasks.push({ id: 'great', text: 'Scene 1: Bring them all to the Great Door', count: st === 'done' ? 1 : 0, total: 1, done: st === 'done' });
      this.ui.renderPaper({ mode: 'fresh', title: 'THE REAL SCRIPT', groups: [{ title: 'RETAKES — ALL THE WAY BACK', current: true, tasks }] });
      return;
    }
    const cur = Math.min(this.story.progressRoom, 4);
    const groups = this.rooms.map((r, i) => ({
      title: `SCENE ${i + 1}: ${r.name}`, current: i === cur, done: r.completed,
      tasks: r.tasks.map((t) => ({ id: `${i}${t.id}`, text: t.text, count: t.count, total: t.total, done: t.done })),
    }));
    this.ui.renderPaper({ mode: 'old', title: 'SHOOTING SCRIPT', groups });
  }

  onTaskProgress(room, task) {
    this.idleHint = 0;
    this._refreshPaper();
    this.ui.pulsePaper();
    if (task.done) {
      this.audio.sfx('task');
      this.ui.toast('TASK COMPLETE!', 'gold');
      this.fx.confetti(this.player.pos.clone().setY(this.player.pos.y + 1), 30);
    } else {
      this.ui.toast(`${task.count} / ${task.total}`, 'teal');
    }
    if (this.story.stage === 'main' && room.allDone() && !room.completed) this._onRoomComplete(room);
  }

  _onRoomComplete(room) {
    room.completed = true;
    this.story.progressRoom = room.index + 1;
    this._refreshPaper();
    if (room.index < 4) {
      setTimeout(() => {
        room.exitDoor.doOpen();
        room.setExitSignOpen(true);
        this.audio.sfx('door'); this.audio.sfx('fanfare');
        this.shake(0.3);
        this.ui.toast('SCENE WRAPPED!', 'huge pink');
        this.fx.confetti(V(0, 4, room.cz - 20), 80);
        this.say(ROOM_DONE[room.index]);
      }, 900);
      this.save();
    } else {
      this.playTwist();
    }
  }

  _kill(room) {
    this.dying = true;
    const pl = this.player;
    this.stats.falls++;
    if (room.killSplash) {
      this.audio.sfx('splash');
      this.fx.burst(V(pl.pos.x, room.killY + 0.2, pl.pos.z), [room.killSplash, '#ffffff'], 24, 9);
      this.fx.ring(V(pl.pos.x, room.killY + 0.1, pl.pos.z), room.killSplash, 3, 0.5);
    } else this.audio.sfx('fall');
    pl.physicsEnabled = false;
    pl.group.visible = false; pl.blob.visible = false;
    setTimeout(() => this.respawn(false), room.killSplash ? 650 : 450);
  }

  respawn(manual) {
    const pl = this.player;
    this.dying = false;
    if (pl.carry) {
      const room = this.rooms[1];
      if (room.carry && room.carry.state === 'carried') { room.carry.reset(); this.say(['The briefcase went back to the tower. Continuity!']); }
    }
    this.stats.takes++;
    this.ui.setScene(this.curRoom + 1, this.rooms[Math.max(0, this.curRoom)].name, this.stats.takes);
    this.ui.toast(`TAKE ${this.stats.takes}!`, 'pink');
    pl.group.visible = true;
    pl.physicsEnabled = true;
    pl.spawn(this.checkpoint.pos, this.checkpoint.facing);
    this.cam.yaw = this.checkpoint.facing + Math.PI;
    this.audio.sfx('respawn');
    this.fx.puff(pl.pos, 10, '#ffffff');
    this.fx.ring(pl.pos.clone().setY(pl.pos.y + 0.1), '#ffffff', 2.5, 0.4);
    if (manual) this.audio.sfx('clap');
  }

  // =========================================================== guide arrow
  _buildGuide() {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.55); shape.lineTo(0.38, 0); shape.lineTo(0.14, 0); shape.lineTo(0.14, -0.35); shape.lineTo(-0.14, -0.35); shape.lineTo(-0.14, 0); shape.lineTo(-0.38, 0); shape.closePath();
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    arrow.rotation.x = -Math.PI / 2; arrow.position.z = -1.55;
    const holder = new THREE.Group(); holder.add(arrow);
    g.add(holder);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.12, 40), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; g.add(ring);
    g.renderOrder = 3;
    this.scene.add(g);
    this.guide = g; this.guideHolder = holder;
  }

  _guideTarget(ri) {
    const st = this.story.stage, pl = this.player;
    const room = this.rooms[ri];
    const nearest = (cands) => {
      let best = null, bd = Infinity;
      for (const c of cands) { const p = c.getPos(); const d = p.distanceToSquared(pl.pos); if (d < bd) { bd = d; best = p; } }
      return best;
    };
    const exitPos = (r) => V(0, 0, r.cz - 20);
    const entrancePos = (r) => V(0, 0, r.cz + 20);
    if (st === 'main') {
      const pr = this.story.progressRoom;
      if (ri < pr) return exitPos(room);
      if (ri > pr) return entrancePos(room);
      if (room.index === 1 && pl.carry) return this.rooms[1].tasks[2].targets[0].getPos();
      const cands = [];
      for (const t of room.tasks) if (!t.done) for (const tg of t.targets) if (!tg.isDone()) cands.push(tg);
      return cands.length ? nearest(cands) : exitPos(room);
    }
    if (st === 'boss') {
      if (this.scriptPickup && !this.scriptPickup.collected) return this.scriptPickup.getPos();
      if (this.boss.state === 'stunned') return this.boss.pos;
      return null;
    }
    if (st === 'return') {
      const c = this.clapperPickups && this.clapperPickups[ri];
      if (c && !c.collected) return c.getPos();
      const missing = [1, 2, 3, 4].filter((i) => !this.story.clappers[i]);
      if (missing.length === 0) return ri === 0 ? this.greatZone.pos : entrancePos(room);
      const far = Math.max(...missing);
      if (far > ri) return exitPos(room);
      return entrancePos(room);
    }
    return null;
  }

  _updateGuide(dt, ri) {
    const g = this.guide, pl = this.player;
    const tgt = this.ending ? null : this._guideTarget(ri);
    if (!tgt || !pl.physicsEnabled || !pl.group.visible) { g.visible = false; return; }
    const dx = tgt.x - pl.pos.x, dz = tgt.z - pl.pos.z;
    if (dx * dx + dz * dz < 4) { g.visible = false; return; }
    g.visible = true;
    const gy = this.world.groundHeight(pl.pos.x, pl.pos.z, pl.pos.y + 0.3);
    g.position.set(pl.pos.x, (gy > -1e5 && pl.pos.y - gy < 3 ? gy : pl.pos.y) + 0.08, pl.pos.z);
    const want = Math.atan2(-dx, -dz);
    let d = ((want - this.guideHolder.rotation.y) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    this.guideHolder.rotation.y += d * Math.min(1, dt * 10);
    const s = 1 + Math.sin(this.time * 6) * 0.06;
    this.guide.scale.set(s, 1, s);
  }

  // =========================================================== INTRO
  async playIntro() {
    this.phase = 'cine';
    this.skipping = false;
    const th = this.theater, pl = this.player;
    const T = (x, y, z) => th.toWorld(x, y, z);
    this.ui.hud(false); this.ui.letterbox(true); this.ui.skipButton(true);
    th.mode = 'intro'; th.movieT = 0; th.windK = 0;
    th.seatPlayer(pl);
    this.theaterLight = true;
    this._setVisibility('theater');
    this._setEnv(this._theaterEnv(), true);
    this.audio.playMusic('trailer');
    const seat = th.playerSeat;

    this.ui.caption('Friday night. The last showing of REEL HERO.');
    await this.shot(T(11, 2.5, -11), T(0, 2, 3), T(7, 3.5, -12.5), T(0, 2.2, 2), 4.2);
    this.ui.caption('');
    await this.shot(T(seat.x + 1.6, seat.y + 1.9, seat.z + 3.2), T(0, 6.2, -15), T(seat.x + 0.9, seat.y + 1.6, seat.z + 2.3), T(0, 6.5, -15), 5.3);
    this.ui.caption('"The hero always finds a way out..."');
    await this.shot(T(seat.x + 0.9, seat.y + 1.6, seat.z + 2.3), T(0, 6.5, -15), T(seat.x + 0.4, seat.y + 1.4, seat.z + 1.4), T(0, 6.6, -15), 3.0);
    this.ui.caption('');
    // the movie glitches — and pulls you in
    this.audio.playMusic(null);
    this.audio.sfx('glitch'); this.audio.sfx('vortex');
    th.movieT = Math.max(th.movieT, 12.5);
    this.shake(0.4);
    const start = pl.pos.clone();
    const screen = T(0, 6.6, -15.4);
    await this.track(1.0, (k) => { th.windK = k; th.vortex.material.opacity = k; });
    this.ui.caption('WHOA—');
    pl.pose = 'fly';
    th.removePopcorn();
    const ctrl = start.clone().add(V(0, 4, -3));
    const tmp = V(), tmp2 = V();
    let popT = 0;
    await this.track(2.6, (k, dt) => {
      const kk = k * k;
      tmp.lerpVectors(start, ctrl, kk); tmp2.lerpVectors(ctrl, screen, kk);
      pl.pos.lerpVectors(tmp, tmp2, kk);
      pl.group.position.copy(pl.pos);
      pl.group.scale.setScalar(1 - kk * 0.6);
      popT += dt;
      if (popT > 0.05) {
        popT = 0;
        const p = T((Math.random() - 0.5) * 16, 1 + Math.random() * 3, -2 + Math.random() * 10);
        this.fx.spawn(p, screen.clone().sub(p).multiplyScalar(0.8 + Math.random() * 0.5), '#fff1b8', 1.6, 1.2, 0, 1, 10);
      }
      this.camera.position.copy(T(seat.x + 5 - k * 3, seat.y + 3 + k * 2.5, seat.z - 2 - k * 7));
      this.camera.lookAt(pl.pos);
      this.shake(0.25);
    });
    this.audio.sfx('flash');
    await this.ui.fade(1, { white: true, ms: this.skipping ? 0 : 280 });
    this.ui.caption('');
    pl.group.scale.setScalar(1);
    th.windK = 0; th.vortex.material.opacity = 0;
    this.theaterLight = false;

    // ---- you land on the set of THE HEIST
    const room = this.rooms[0];
    this._setVisibility('rooms', 0);
    this.curRoom = 0;
    this._setEnv(room.env, true);
    this.audio.playMusic(room.music);
    pl.pose = 'auto';
    pl.physicsEnabled = true;
    pl.controlEnabled = false;
    pl.spawn(V(0, 18, room.cz + 12), Math.PI);
    pl.state = 'stun'; pl.stateT = 2; pl.invuln = 0;
    room.visited = true;
    this.checkpoint = { pos: room.spawn.clone(), facing: Math.PI };
    this.camera.position.set(5, 3, room.cz + 20.5);
    this.cam.look.set(0, 5, room.cz + 12);
    this.camera.lookAt(this.cam.look);
    this.cam.mode = 'cine';
    this.forceRoomTrack = false;
    await this.ui.fade(0, { white: true, ms: this.skipping ? 0 : 700 });
    if (this.skipping) { pl.pos.y = 0; pl.vel.set(0, 0, 0); }
    await this.track(2.2, () => { this.camera.lookAt(V(pl.pos.x, Math.max(1.5, pl.pos.y + 1), pl.pos.z)); });
    if (!this.skipping) { this.shake(0.7); this.audio.sfx('slam'); this.fx.puff(pl.pos, 14); }
    pl.state = 'normal';
    await this.shot(this.camera.position.clone(), V(pl.pos.x, 1.5, pl.pos.z), V(0, 3.8, room.cz + 21), V(pl.pos.x, 1.6, pl.pos.z), 0.8);
    this._finishCine();
    this.ui.slate(room.name, 1, this.stats.takes);
    this._refreshPaper();
    this.ui.setScene(1, room.name, this.stats.takes);
    this._followCam(0);
    this.save();
    await this.wait(1.6);
    this.say(['CUT! CUT! CUT!', 'Who are YOU? A moviegoer... on MY set?!', 'Fine. You want out? Then finish the scene. Every task on your script.', 'Yes, the script is old. We\'ve been filming this one for a... while. Tap it to squint.']);
  }

  _finishCine() {
    this.skipping = false;
    this.phase = 'play';
    this.ui.letterbox(false); this.ui.skipButton(false);
    this.ui.hud(true); this.ui.touch(true);
    this.input.enabled = true;
    this.player.controlEnabled = true;
    this.player.physicsEnabled = true;
    this.player.pose = 'auto';
    this.player.group.visible = true;
    this.idleHint = 0;
  }

  _startCine() {
    this.phase = 'cine';
    this.skipping = false;
    this.ui.clearDialog();
    this.input.enabled = false; this.input.clear();
    this.player.controlEnabled = false;
    this.ui.letterbox(true); this.ui.skipButton(true); this.ui.touch(false);
  }

  // =========================================================== TWIST + BOSS
  async playTwist() {
    const room = this.rooms[4], pl = this.player, boss = this.boss;
    await this.wait(0.8);
    this._startCine();
    const cz = room.cz;
    this.audio.sfx('fanfare');
    this.ui.toast('THAT\'S A WRAP!', 'huge gold');
    this.fx.confetti(pl.pos.clone().setY(pl.pos.y + 2), 60);
    const camFrom = this.camera.position.clone();
    const sayP = this.say(['THAT\'S A WRAP! Brilliant! The exit is right there—'], { cine: true });
    room.setExitSignOpen(true);
    await this.shot(camFrom, pl.pos.clone().setY(pl.pos.y + 1.5), V(3, 4.5, cz - 7), V(0, 4.5, cz - 21.5), 2.0);
    await sayP;
    room.exitDoor.speed = 0.9;
    room.exitDoor.doOpen();
    this.audio.sfx('prop');
    await this.wait(1.3);
    this.shake(0.5);
    this.fx.burst(V(0, 0.5, cz - 18), ['#c8a46a', '#ffffff'], 30, 7);
    await this.wait(0.6);
    await this.say(['...', 'That\'s a PROP door. Who builds a prop EXIT?!'], { cine: true });
    await this.shot(this.camera.position.clone(), V(0, 4.5, cz - 21.5), V(pl.pos.x + 4, pl.pos.y + 3.5, pl.pos.z + 6), pl.pos.clone().setY(pl.pos.y + 1.5), 1.2);
    // the old script finally gives up
    if (!this.skipping) { const cp = this.ui.crumblePaper(); await this.say(['Wait — your script!'], { cine: true }); await cp; }
    else this.ui.paperVisible(false);
    this.ui.paperVisible(false);
    await this.say(['It\'s falling apart! That thing was older than the popcorn machine!', 'Don\'t panic. There IS a fresh copy of the script. One small problem...'], { cine: true });
    // the monster rises
    this.audio.playMusic(null);
    room.jets.forEach((j) => { j.active = false; });
    boss.appear();
    this.shake(0.8);
    await this.shot(this.camera.position.clone(), pl.pos.clone().setY(2), V(2, 3, cz + 2), V(16, 3, cz - 8), 1.6);
    await this.track(2.4, () => { this.camera.lookAt(V(boss.pos.x, boss.pos.y + 3.5, boss.pos.z)); this.shake(0.2); });
    await this.say(['...HE has it.'], { cine: true });
    await this.track(1.6, () => { this.camera.lookAt(V(boss.pos.x, boss.pos.y + 3, boss.pos.z)); });
    if (this.skipping || boss.state !== 'intro-idle') { boss.pos.set(0, 0, cz - 2); boss.state = 'intro-idle'; }
    this.audio.sfx('roar');
    this.ui.toast('THE REEL MONSTER', 'huge pink');
    await this.shot(this.camera.position.clone(), V(boss.pos.x, 3.5, boss.pos.z), V(boss.pos.x, 4, boss.pos.z + 9), V(boss.pos.x, 3.5, boss.pos.z), 1.4);
    await this.say(['Make him charge into the edge of the arena...', '...then jump on his head while he\'s dizzy!'], { cine: true });
    room.exitDoor.doOpen(true); room.exitDoor.k = 1; room.exitDoor.apply();
    this.ui.paperVisible(false);
    if (pl.pos.distanceTo(V(0, 0, cz)) > 11.5 || pl.pos.y < -0.2) pl.spawn(V(0, 0, cz + 9), Math.PI);
    this.story.stage = 'boss';
    this.checkpoint = { pos: V(0, 0, cz + 9), facing: Math.PI };
    this.save();
    this._startBossFight();
  }

  _startBossFight() {
    this._finishCine();
    this.ui.paperVisible(false);
    this.boss.startFight();
    this.ui.bossBar(true, this.boss.hp);
    this.audio.playMusic('boss');
    this._followCam(this.cam.yaw);
  }

  onBossHit(hp) {
    this.ui.bossBar(true, hp);
    this.ui.toast(hp > 0 ? 'DIRECT HIT!' : 'K.O.!', 'huge gold');
    if (hp === 2) this.say(['He\'s mad now. He\'s throwing things!']);
    if (hp === 1) this.say(['One more! Faster than before — watch the shockwaves!']);
  }

  onBossDefeated(pos) {
    this.ui.bossBar(false);
    this.audio.playMusic(null);
    this.audio.sfx('fanfare');
    this.ui.toast('MONSTER DEFEATED!', 'huge gold');
    const room = this.rooms[4];
    const p = V(0, 1.6, 0);
    this.scriptPickup = room.add(new Pickup(this, room.group, makeScript(), p, () => this.onScriptCollected(), { beacon: '#ffffff', spin: 1.2 }));
    setTimeout(() => this.say(['You did it! Quick — grab the fresh script!']), 1200);
  }

  async onScriptCollected() {
    this.audio.sfx('bigcollect');
    this.story.stage = 'return';
    this.story.returnRoom = 4;
    this._spawnClappers();
    this._refreshPaper();
    this.ui.freshPaperIn();
    this.audio.playMusic('final');
    this.checkpoint = { pos: V(0, 0, this.rooms[4].cz + 9), facing: 0 };
    this.save();
    await this.say(['The FINAL CUT. Let\'s see...', '"Every scene needs a RETAKE." Oh, you have GOT to be kidding me.', 'Find a golden clapperboard in every scene — all the way back to the start.', 'Then bring them to the Great Door. Yes. THAT door.']);
  }

  _spawnClappers() {
    this.clapperPickups = {};
    for (const i of [1, 2, 3, 4]) {
      const room = this.rooms[i], spot = room.clapperSpot;
      if (this.story.clappers[i]) continue;
      let pk;
      const onCollect = () => this._onClapper(i);
      if (spot.orbit) {
        const o = spot.orbit;
        pk = room.add(new Pickup(this, room.group, makeClapper(), V(o.x + o.r, o.y, o.z), onCollect, { beacon: false }));
        const holder = pk.holder;
        room.add(new (class extends Entity { frame(dt) { this.t = (this.t || 0) + dt; holder.position.set(o.x + Math.cos(this.t * o.w) * o.r, o.y + Math.sin(this.t * 1.3) * 0.6, o.z + Math.sin(this.t * o.w) * o.r); } })());
      } else {
        if (spot.pad) room.pad(0, 0, 0, 22, '#ffd23f');
        pk = room.add(new Pickup(this, spot.parent || room.group, makeClapper(), V(spot.x, spot.y, spot.z), onCollect, { beacon: '#ffd23f' }));
      }
      pk.mesh.scale.setScalar(1.15);
      this.clapperPickups[i] = pk;
    }
    // the Great Door trigger
    const r0 = this.rooms[0];
    this.greatZone = r0.add(new Zone(this, V(-16.5, 0, r0.cz), 3.2, () => this.playFinale(), { height: 4 }));
    this.greatZone.enabled = [1, 2, 3, 4].every((i) => this.story.clappers[i]);
    r0.greatDoor.slots.forEach((s, k) => { s.material = s.material.clone(); s.material.emissiveIntensity = this.story.clappers[k + 1] ? 1.2 : 0.15; });
    this.world.setActive(this.world.activeKeys || []);
  }

  _onClapper(i) {
    this.story.clappers[i] = true;
    this.audio.sfx('bigcollect');
    this.ui.toast('GOLDEN CLAPPERBOARD!', 'huge gold');
    this.fx.confetti(this.player.pos.clone().setY(this.player.pos.y + 1.5), 50);
    const slot = this.rooms[0].greatDoor.slots[i - 1];
    slot.material.emissiveIntensity = 1.2;
    this._refreshPaper(); this.ui.pulsePaper();
    const all = [1, 2, 3, 4].every((k) => this.story.clappers[k]);
    if (all) { this.greatZone.enabled = true; this.say(['That\'s all four! Now — the Great Door. Scene One. Go, go, go!']); }
    else this.say(CLAPPER_LINES[i]);
    this.idleHint = 0;
    this.save();
  }

  // =========================================================== FINALE
  async playFinale() {
    this._startCine();
    const room = this.rooms[0], gd = room.greatDoor, pl = this.player;
    const doorLook = V(-20, 6, room.cz);
    await this.shot(this.camera.position.clone(), pl.pos.clone().setY(1.5), V(-8, 4, room.cz + 9), doorLook, 1.6);
    // the clapperboards fly into the door
    const flying = [];
    for (let k = 0; k < 4; k++) {
      const m = makeClapper(false); m.scale.setScalar(0.8);
      m.position.copy(pl.pos).setY(pl.pos.y + 2); this.scene.add(m);
      flying.push(m);
    }
    await this.track(1.8, (k) => {
      flying.forEach((m, i) => {
        const kk = THREE.MathUtils.clamp(k * 1.6 - i * 0.2, 0, 1);
        const slot = gd.slots[i].getWorldPosition(V());
        const from = pl.pos.clone().setY(pl.pos.y + 2);
        m.position.lerpVectors(from, slot, ease(kk)); m.position.y += Math.sin(kk * Math.PI) * 3;
        m.rotation.y = kk * 8;
      });
    });
    flying.forEach((m) => this.scene.remove(m));
    gd.slots.forEach((s) => { s.material.emissiveIntensity = 3; });
    this.audio.sfx('bell');
    await this.wait(0.6);
    this.audio.sfx('chains'); this.audio.sfx('explode');
    this.fx.burst(V(-19.6, 6, room.cz), ['#9aa0ad', '#ffd23f', '#ffffff'], 50, 10);
    gd.chains.visible = false;
    this.shake(0.6);
    await this.wait(0.6);
    gd.beyond.visible = true;
    gd.collider.enabled = false;
    this.audio.sfx('door');
    this.audio.playMusic('paradise');
    const sayP = this.say(['The Great Door. It was here the whole time.', 'Go on. Roll credits.'], { cine: true });
    await this.track(2.8, (k) => { const e = ease(k); gd.left.rotation.y = 1.85 * e; gd.right.rotation.y = -1.85 * e; this.renderer.toneMappingExposure = 0.95 + e * 0.6; });
    await sayP;
    // walk into the light
    const from = pl.pos.clone(), to = V(-27, 0, room.cz);
    pl.physicsEnabled = false;
    pl.targetFacing = -Math.PI / 2;
    await this.shot(this.camera.position.clone(), doorLook, V(-6, 3, room.cz + 3), V(-24, 2, room.cz), 0.8);
    await this.track(2.6, (k, dt) => {
      pl.pos.lerpVectors(from, to, k); pl.pos.y = 0;
      pl.vel.set(-6, 0, 0); pl.grounded = true;
      this.renderer.toneMappingExposure = 1.55 + k * 2;
    });
    this.audio.sfx('flash');
    await this.ui.fade(1, { white: true, ms: this.skipping ? 0 : 900 });
    this.renderer.toneMappingExposure = 0.95;
    gd.left.rotation.y = 1.85; gd.right.rotation.y = -1.85;
    this.story.stage = 'done';
    this.save();
    await this.goParadise();
  }

  async goParadise() {
    const pl = this.player, par = this.paradise;
    this.skipping = false; // the reveal always plays (it can be skipped on its own)
    this.ending = true;
    this.theater.removePopcorn();
    pl.group.scale.setScalar(1);
    this._setVisibility('paradise');
    this._setEnv(par.env, true);
    this.audio.playMusic('paradise');
    pl.physicsEnabled = true; pl.controlEnabled = false; pl.pose = 'auto';
    pl.vel.set(0, 0, 0);
    pl.spawn(par.spawn, Math.PI);
    this.ui.paperVisible(false);
    this.ui.setScene(0, 'THE OUTSIDE', this.stats.takes);
    const P = (x, y, z) => par.group.position.clone().add(V(x, y, z));
    this.camera.position.copy(P(2.5, 1.6, 4)); this.camera.lookAt(P(0, 2.2, 12));
    this.cam.mode = 'cine';
    this.phase = 'cine';
    this.ui.letterbox(true); this.ui.skipButton(true);
    pl.physicsEnabled = false;
    const walkFrom = pl.pos.clone(), walkTo = P(0, 0, 6);
    const fadeP = this.ui.fade(0, { white: true, ms: this.skipping ? 0 : 2200 });
    await this.track(3.2, (k) => {
      pl.pos.lerpVectors(walkFrom, walkTo, k); pl.vel.set(0, 0, k < 1 ? -3 : 0); pl.grounded = true;
      this.camera.position.copy(P(2.5, 1.6, 4)); this.camera.lookAt(pl.pos.x, 2.0, pl.pos.z);
    });
    await fadeP;
    pl.pos.copy(walkTo); pl.vel.set(0, 0, 0); pl.physicsEnabled = true;
    await this.shot(P(2.5, 1.6, 4), P(0, 2, 6), P(-9, 14, 18), P(0, -6, -90), 6.5);
    await this.say(['...Huh.', 'I never wrote this part.', 'No script. No tasks. No more takes.', 'It\'s all yours. Go on — look around.'], { cine: true });
    this._finishCine();
    this.ui.paperVisible(false);
    document.getElementById('scene-tag').style.display = 'none';
    this.ui.bossBar(false);
    this.endingT = 0; this.creditsShown = false;
    this._followCam(-0.5);
  }

  _endingTick(dt) {
    this.endingT += dt;
    if (this.creditsShown) return;
    const d = this.player.pos.distanceTo(this.paradise.overlook);
    if (d < 7 || this.endingT > 45) {
      this.creditsShown = true;
      this.audio.sfx('fanfare');
      this.fx.confetti(this.player.pos.clone().setY(this.player.pos.y + 2), 100);
      const mins = Math.floor(this.playTime / 60), secs = Math.floor(this.playTime % 60);
      setTimeout(() => {
        this.input.releasePointer();
        this.ui.credits([[`${mins}:${String(secs).padStart(2, '0')}`, 'RUN TIME'], [this.stats.takes, 'TAKES'], [this.stats.jumps, 'JUMPS']]);
        this.paused = true;
      }, 1200);
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    }
  }

  keepExploring() { this.paused = false; }

  // =========================================================== CONTINUE
  _restore(data) {
    Object.assign(this.story, data.story || {});
    Object.assign(this.stats, data.stats || {});
    this.playTime = data.playTime || 0;
    const st = this.story.stage;
    const pr = st === 'main' ? this.story.progressRoom : 5;
    for (let i = 0; i < Math.min(pr, 5); i++) {
      const r = this.rooms[i];
      r.completed = true; r.visited = true;
      r.tasks.forEach((t) => { t.count = t.total; t.done = true; t.targets.forEach((tg) => {
        if (tg.setCollected) tg.setCollected(true);
        else if (tg.setPressed) tg.setPressed();
        else if (tg.deliver) tg.deliver();
        else tg.done = true;
      }); });
      if (i < 4) { r.exitDoor.doOpen(true); r.setExitSignOpen(true); }
    }
    if (this.rooms[1].completed) { this.rooms[1].carry.state = 'delivered'; this.rooms[1].carry.mesh.visible = false; this.rooms[1].heliFast = true; }
    if (st !== 'main') {
      const r4 = this.rooms[4];
      r4.exitDoor.doOpen(true); r4.exitDoor.k = 1; r4.exitDoor.apply(); r4.setExitSignOpen(true);
      r4.jets.forEach((j) => { j.active = false; });
    }
    this.ui.hud(true);
    let spawn, facing = Math.PI, ri;
    if (st === 'main') {
      ri = Math.min(this.story.progressRoom, 4);
      spawn = this.rooms[ri].spawn.clone();
      this.rooms[ri].visited = false;
    } else if (st === 'boss') {
      ri = 4; spawn = V(0, 0, this.rooms[4].cz + 9);
    } else if (st === 'return') {
      this.boss.state = 'gone';
      ri = this.story.returnRoom ?? 4;
      spawn = ri === 4 ? V(0, 0, this.rooms[4].cz + 9) : this.rooms[ri].spawnBack.clone();
      facing = 0;
      this._spawnClappers();
    } else {
      this.started = true;
      this.phase = 'cine';
      this.player.pose = 'auto';
      this.goParadise();
      return;
    }
    const pl = this.player;
    this.theater.removePopcorn();
    pl.pose = 'auto'; pl.physicsEnabled = true; pl.group.visible = true;
    pl.spawn(spawn, facing);
    this.checkpoint = { pos: spawn.clone(), facing };
    this.curRoom = -1;
    this._setVisibility('rooms', ri);
    this._setEnv(this.rooms[ri].env, true);
    this.phase = 'play';
    this._finishCine();
    this._followCam(facing + Math.PI);
    if (st === 'main') this.curRoom = -1;
    this._onRoomChange(ri);
    this._refreshPaper();
    if (st === 'boss') {
      this.ui.paperVisible(false);
      this.boss.group.visible = true;
      this.boss.pos.set(0, 0, this.rooms[4].cz - 2);
      this.boss.state = 'intro-idle';
      this._startBossFight();
      this.say(['Take two! The monster still has your script.', 'Make him charge into the edge, then jump on his head!']);
    } else if (st === 'return') {
      this.ui.paperVisible(true);
      this.say(['Welcome back. Still need those clapperboards — all the way back to the Great Door.']);
    } else {
      this.say(['And... ACTION! Picking up where we left off.']);
    }
  }
}
