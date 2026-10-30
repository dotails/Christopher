// Kal-toh: brings the ways to play, the stage and the hands together. Nothing is drawn on the
// screen but the kal-toh, its stone and the t'an in the tray: everything it says is carved into
// the underside of the base (engrave.js).
import * as THREE from '../vendor/three.module.min.js';
import { createScene, loadBase, loadEnvironment, FLOOR, PIVOT } from './scene.js';
import { loadTable, TOP } from './table.js';
import { RodPool, Halos } from './rodmesh.js';
import { Engraving } from './engrave.js';
import { Motion } from './motion.js';
import { Falling } from './falling.js';
import { Tray, Hand, TRAY_REACH } from './tray.js';
import { ClassicGame } from './classic.js';
import { FormsGame } from './forms.js';
import { ZenGame } from './zen.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Guide } from './guide.js';
import { TEXT } from './texts.js';
import { loadSettings, saveSettings, shapeOf } from './settings.js';
import { ShakeDetector } from './shake.js';
import { native } from './native.js';

const canvas = document.getElementById('view');
const stage = createScene(canvas);
// The kal-toh, the t'an fallen from it (kept until a new game), the one in the tray and in hand.
const pool = new RodPool(stage.scene, 640);
const trayPool = new RodPool(stage.scene, 2, { onTop: true, dome: true });
const halos = new Halos(stage.scene, 320);
const sound = new Sound();
const settings = loadSettings();
// The voice that talks a player through the game, until it is turned down to nothing (guide.js).
const guide = new Guide({ sound, settings });
const tray = new Tray(stage);
const hand = new Hand(stage, tray);
let motion = null;
let falling = null;
let baseModel = null;
let table = null; // the table under the stone (table.js)
let engraving = null;
// The game being played: the original kal-toh (classic.js), many forms built from the inside out
// (forms.js), or zen, forms taken one after another (zen.js). A change of game in the ways to play
// waits for the next one.
let classic = null;
let forms = null;
let zen = null;
let way = 'classic';
// The game on the stone.
const shaped = () => (way === 'classic' ? classic : way === 'forms' ? forms : way === 'zen' ? zen : null);
let begunWith = ''; // the ways the game was begun with (settings.js shapeOf)

const insets = { top: 0, bottom: 0 };
const quality = { maxDpr: 2, time: 0, frames: 0 };
let phase = 'loading'; // until the first game begins; then each game keeps its own
let shaking = 0; // how far a shake to begin anew has gone (0..1)

const haptic = (kind) => {
  if (settings.haptics) native.haptic(kind);
};
sound.setVolumes(settings.music, settings.sfx, settings.voice);
// What the kal-toh says goes into its stone, and the guide hears it.
const say = (text) => {
  engraving?.setEvent(text);
  guide.heard(text);
};

// --- Timers on game time ------------------------------------------------------------------

const timers = [];
function after(seconds, fn) {
  timers.push({ at: seconds, fn });
}
function tickTimers(dt) {
  for (let i = timers.length - 1; i >= 0; i--) {
    timers[i].at -= dt;
    if (timers[i].at <= 0) timers.splice(i, 1)[0].fn();
  }
}

// --- Layout ------------------------------------------------------------------------------

let wide = null; // whether the screen was wider than tall, as last laid out
// The top of the kal-toh as it stands finished on the stone at rest, with a little to spare.
const KALTOH_TOP = new THREE.Vector3(0, PIVOT.y + FLOOR + 0.9, 0);
function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
  const w = window.innerWidth;
  const h = window.innerHeight;
  stage.layout(w, h, dpr);
  stage.view.focus.y = 0.42;
  // The t'an to place lies at the foot of the screen, below the base as the view first frames it
  // resting on the floor (not as it may be drawn nearer, or turned over to be read), and never off
  // the screen; where the screen is too short for both (a phone held sideways), the base is set
  // higher, clear of where a finger takes up the t'an. And how near and how far back the view may
  // be drawn on this screen (fitZoom): turned between portrait and landscape, it is framed afresh.
  const { zoom } = stage.view;
  const reading = stage.view.read.k;
  let trayY = 0;
  for (let i = 0; i < 4; i++) {
    stage.fitZoom(TOP);
    stage.view.zoom = stage.view.framed;
    stage.view.read.k = 0;
    stage.update();
    const foot = stage.toScreen(new THREE.Vector3(0, FLOOR, 0.9));
    const crown = stage.toScreen(KALTOH_TOP);
    trayY = Math.min(h - insets.bottom - 64, Math.max(foot.y + 110, h - insets.bottom - 88));
    const short = foot.y - (trayY - TRAY_REACH - 24);
    if (short <= 0) break;
    // Raised as far as the kal-toh's top allows; beyond that, drawn smaller (at most by half).
    const raise = Math.min(short, Math.max(0, crown.y - insets.top - 8));
    const tall = foot.y - crown.y;
    stage.view.focus.y -= raise / h;
    if (raise < short) stage.view.distance *= tall / Math.max(tall - (short - raise), tall / 2);
  }
  stage.view.zoom = wide !== null && wide !== w > h ? stage.view.framed : Math.min(stage.view.zoomRange[1], Math.max(stage.view.zoomRange[0], zoom));
  wide = w > h;
  stage.view.read.k = reading;
  stage.update();
  tray.layout(trayY);
}

// Picking: the t'an under a finger, and where along it.
function pickRod(x, y, reach = 30) {
  return shaped()?.pick(x, y, reach) ?? null;
}

function segmentDistance(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}

// Is a finger on the t'an's area - anywhere within the outline of the assembly on screen, and
// not on the stone where the stone is nearer the eye?
const baseRay = new THREE.Raycaster();
function touchesAssembly(x, y) {
  const points = [];
  for (const [a, b] of shaped()?.worldRods() ?? []) {
    for (const p of [a, b]) {
      const s = stage.toScreen(p);
      points.push([s.x, s.y]);
    }
  }
  if (points.length < 3 || !insideHull(hull(points), x, y, 18)) return false;
  if (!baseModel) return true;
  const hit = stoneAt(x, y);
  return !hit || hit.distance > stage.camera.position.distanceTo(stage.assemblyRoot.position);
}

// Where the stone lies under a point on screen, if it does.
function stoneAt(x, y) {
  baseRay.setFromCamera(new THREE.Vector2((x / stage.size.width) * 2 - 1, -(y / stage.size.height) * 2 + 1), stage.camera);
  return baseRay.intersectObject(baseModel.mesh, false)[0] ?? null;
}

// The ends on screen of a t'an carried between two fingers: along them, centred between them,
// its own length out at the kal-toh. Where its ends are is where it lands.
function rodEnds(f1, f2) {
  const anchor = stage.assemblyRoot.position;
  const a = stage.fromScreen(f1.x, f1.y, anchor, new THREE.Vector3());
  const b = stage.fromScreen(f2.x, f2.y, anchor, new THREE.Vector3());
  const dir = b.clone().sub(a);
  if (dir.lengthSq() < 1e-10) dir.set(1, 0, 0);
  dir.normalize();
  const mid = a.add(b).multiplyScalar(0.5);
  const half = tray.length / 2;
  return [stage.toScreen(mid.clone().addScaledVector(dir, -half)), stage.toScreen(mid.clone().addScaledVector(dir, half))];
}

// Is a finger on the stone, or within a fingertip of its edge? Only there does a drag turn it.
const NEAR_STONE = [[0, 0], [18, 0], [-18, 0], [0, 18], [0, -18], [13, 13], [-13, 13], [13, -13], [-13, -13]];
function touchesBase(x, y) {
  return Boolean(baseModel) && NEAR_STONE.some(([dx, dy]) => stoneAt(x + dx, y + dy));
}

// Convex hull (Andrew's monotone chain), counter-clockwise.
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 0) upper.pop();
    upper.push(p[i]);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Inside the hull, or within `margin` pixels of it.
function insideHull(h, x, y, margin) {
  let inside = true;
  let nearest = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    const side = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (side < 0) inside = false;
    nearest = Math.min(nearest, segmentDistance(x, y, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }));
  }
  return inside || nearest <= margin;
}

// --- A game -------------------------------------------------------------------------------

const seedParam = new URLSearchParams(location.search).get('seed');
let nextSeed = seedParam === null ? undefined : Number(seedParam) >>> 0;

// again: begun anew, rather than the first game since the app opened.
function newGame(again = false) {
  way = settings.way;
  begunWith = shapeOf(settings);
  // What the last game had carved (the shape it built, how far it came) goes with it; each game
  // carves its own.
  engraving.set({ pending: false, shape: null, status: null, zen: null });
  falling.clear();
  timers.length = 0;
  phase = 'shaped';
  shaped().newGame(nextSeed);
  nextSeed = undefined;
  if (again) guide.anew(way);
  else guide.begin(way);
}

// Where the t'an in hand would rest, as the guide is told it: blue, amber, or on nothing yet.
const aimOf = () => (hand.glow >= 1 ? 'blue' : hand.amber > 0 ? 'amber' : null);

// --- Holding and placing ---------------------------------------------------------------------

const input = new Input(canvas, {
  stage,
  tray,
  get motion() {
    return motion;
  },
  pickRod,
  rodEnds,
  touchesAssembly,
  touchesBase,
  // With the base turned over, the carving within its framing circle is for touching.
  touchesCarving: (x, y) => Boolean(engraving?.covers(x, y)),
  sliderAt: (x, y) => engraving?.sliderAt(x, y) ?? null,
  onSlide(slider, x, y) {
    engraving.slide(slider, x, y);
  },
  canLift: () => Boolean(shaped()?.canLift()),
  canSpin: () => Boolean(shaped()?.hasRods) && !['intro', 'dissolving'].includes(shaped().phase),
  onLift(x, y) {
    sound.wake();
    hand.lift(x, y);
    sound.lift();
    haptic('lift');
    guide.lifted();
  },
  onCarry(x, y) {
    hand.carry(x, y);
  },
  // While carried: blue where it would rest, amber where it cannot.
  onAim([ta, tb], f1, f2) {
    // Hanging from one finger until now: the second has just taken hold.
    const taken = Boolean(hand.carried);
    shaped()?.aim([ta, tb], f1, f2);
    if (taken) guide.held();
    guide.aimed(aimOf());
  },
  // Let go: placed where it was shown, unless the touch was cancelled (the system took it).
  onRelease(targets, cancelled) {
    const dangling = Boolean(hand.carried);
    const aim = aimOf();
    shaped()?.release(cancelled);
    guide.released({ placed: Boolean(hand.flight && !hand.flight.home), dangling, aim });
  },
  onTap(x, y) {
    sound.wake();
    // A tap on the carving reads or acts on it.
    engraving?.tap(x, y);
  },
  onGrab(what) {
    sound.wake();
    if (what === 'base') guide.turned();
  },
});

// --- Beginning anew --------------------------------------------------------------------------

// Whether the game in play is falling away, a new one on its way.
function dissolving() {
  return shaped()?.phase === 'dissolving';
}

function restart() {
  if (phase === 'loading' || dissolving()) return;
  hand.holding = false;
  hand.flight = null;
  tray.hide();
  timers.length = 0;
  shaped().dissolve();
  sound.dissolve();
  haptic('restart');
  after(1.6, () => newGame(true));
}

// --- Settings -------------------------------------------------------------------------------

// The carving's glyphs and ways.
function onEngravedAction(name) {
  sound.wake();
  haptic('tick');
  if (name === 'translate' || name === 'page') {
    sound.hover();
    // Translated, the carving reads in that script from now on, next time too.
    if (name === 'translate') {
      saveSettings(settings);
      guide.translated();
    }
  } else if (name === 'anew') {
    engraving.show('main');
    say(TEXT.applied);
    restart();
  }
}

const sliderTenths = {};
function onEngravedOption(key, value) {
  saveSettings(settings);
  const pending = shapeOf(settings) !== begunWith;
  if (pending !== Boolean(engraving.state.pending)) engraving.set({ pending });
  sound.wake();
  if (key === 'music' || key === 'sfx' || key === 'voice') {
    sound.setVolumes(settings.music, settings.sfx, settings.voice);
    if (key === 'voice') guide.levelled(value);
    // Drawn along a slider, a tick at each tenth (and for the sound effects, a sound at its level).
    const tenth = Math.round(value * 10);
    if (tenth !== sliderTenths[key]) {
      haptic('tick');
      if (key === 'sfx') sound.hover();
    }
    sliderTenths[key] = tenth;
    return;
  }
  haptic('tick');
  if (key === 'way') guide.chose(value);
}

// --- Shaking ------------------------------------------------------------------------------

const shake = new ShakeDetector({
  onProgress(p) {
    shaking = dissolving() || hand.holding ? 0 : p;
    if (shaking > 0.1) sound.rattle(p);
  },
  onComplete: () => {
    shaking = 0;
    restart();
  },
});
if (!native.present) shake.listenToDeviceMotion();

window.kaltoh = {
  shake: (magnitude) => shake.sample(magnitude),
  insets(top, bottom) {
    insets.top = top;
    insets.bottom = bottom;
    layout();
  },
  pause: () => sound.suspend(),
  resume: () => sound.resume(),
};

window.addEventListener('resize', layout);
window.addEventListener('pointerdown', () => sound.wake(), { capture: true });
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') restart();
});
document.addEventListener('visibilitychange', () => (document.hidden ? sound.suspend() : sound.resume()));
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  setTimeout(() => location.reload(), 300);
});

// --- Frame loop ---------------------------------------------------------------------------

// Turned over so its underside faces you, the base comes to you to be read.
const readCenter = new THREE.Vector3();
function readingView(dt) {
  const { facing } = engraving.facing(stage.camera, readCenter);
  const want = THREE.MathUtils.smoothstep(facing, 0.5, 0.86);
  const read = stage.view.read;
  read.k += (want - read.k) * (1 - Math.exp(-dt / 0.35));
  read.center.copy(readCenter);
}

function adapt(dt) {
  quality.time += dt;
  quality.frames += 1;
  if (quality.time < 2.5) return;
  const average = quality.time / quality.frames;
  quality.time = 0;
  quality.frames = 0;
  if (average > 0.024 && quality.maxDpr > 1) {
    quality.maxDpr = Math.max(1, quality.maxDpr - 0.25);
    layout();
  }
}

let last = performance.now();
let timeScale = 1;
let failures = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)) * timeScale;
  last = now;
  try {
    step(dt);
  } catch (err) {
    if (failures++ < 5) console.error(err);
  }
}

function step(dt) {
  tickTimers(dt);
  readingView(dt);
  stage.update();
  shaped().update(dt);
  motion.update(dt);
  motion.apply(stage);
  // Stone meeting the floor.
  if (motion.landed) {
    sound.thud(Math.min(1, motion.landed / 3));
    haptic('place');
    motion.landed = 0;
  }
  if (motion.scrape > 0.25) sound.scrape(motion.scrape);
  // Sliding contacts: fallen t'an along rock or one another, and the stone ground round on the floor.
  const slid = falling.sliding;
  if (slid.rock > 0.08) sound.slide('rockMetal', Math.min(1, slid.rock / 1.5));
  if (slid.metal > 0.08) sound.slide('metal', Math.min(1, slid.metal / 1.5));
  slid.rock = 0;
  slid.metal = 0;
  if (motion.drop > 0.3 && !motion.grounding) {
    const rim = motion.baseW.length() * 0.95; // how fast the stone's rim goes round on the floor
    if (rim > 0.1) sound.slide('rock', Math.min(1, rim / 2.5));
  }
  falling.update(dt);
  tray.update(dt);
  if (input.mode === 'hold') input.aim();
  hand.update(dt);
  shake.update(dt);
  engraving.update(stage.camera, dt);
  // Turned with two fingers: the guide need not tell how.
  if (input.mode === 'twist' || input.mode === 'pinch') guide.twisted();
  guide.update(dt, {
    playing: shaped()?.phase === 'play',
    trayWaiting: tray.visible && !hand.holding && !hand.flight,
    flipped: stage.view.read.k > 0.8,
    shaking,
  });

  pool.begin();
  trayPool.begin();
  halos.begin();
  falling.obstacles = shaped().draw(pool, halos, shaking);
  falling.draw(pool, halos);
  tray.draw(trayPool, hand);
  hand.draw(pool, halos, trayPool);
  // The t'an waiting in the tray mirrors Tuvok; taken up, it mirrors the room as the others do.
  trayPool.mesh.material.envMap = hand.carried ? stage.scene.environment : stage.tuvokEnvironment ?? null;
  pool.end();
  trayPool.end();
  halos.end();
  table?.reflect([stage.sky, trayPool.mesh]);
  stage.renderer.render(stage.scene, stage.camera);
  adapt(dt);
}

async function start() {
  if (window.KalTohAndroid?.insets) {
    try {
      Object.assign(insets, JSON.parse(window.KalTohAndroid.insets()));
    } catch {
      // Keep zero insets; the shell pushes them again once laid out.
    }
  }
  layout();
  await Promise.all([
    document.fonts.load('21px ModernVulcan'),
    document.fonts.load('30px VulcanScript'),
  ]).catch(() => {});
  const [base, laid] = await Promise.all([loadBase(stage), loadEnvironment(stage).then(() => loadTable(stage))]);
  baseModel = base;
  table = laid;
  motion = new Motion(base);
  falling = new Falling(motion, base, sound);
  const shapeContext = {
    stage, motion, falling, tray, hand, sound, haptic, say, settings, after, base,
    get engraving() {
      return engraving;
    },
  };
  classic = new ClassicGame(shapeContext);
  forms = new FormsGame(shapeContext);
  zen = new ZenGame(shapeContext);
  engraving = new Engraving(stage, {
    settings,
    stone: base.mesh.material.map?.image,
    baseMesh: base.mesh,
    onAction: onEngravedAction,
    onOption: onEngravedOption,
  });
  // Never guided before, the first game is zen's, where nothing can go wrong.
  if (guide.fresh && guide.on) {
    settings.way = 'zen';
    saveSettings(settings);
  }
  // The sound readied at once, so the guide can greet the player (in a browser, from the first
  // touch).
  sound.open();
  newGame();
  document.getElementById('veil').classList.add('gone');
  requestAnimationFrame(frame);
}

start().catch((err) => {
  console.error(err);
  const note = document.getElementById('note');
  note.textContent = `Could not start: ${err.message}`;
  note.hidden = false;
  document.getElementById('veil').classList.add('gone');
});

// For automated tests and curious developers.
window.__kaltoh = {
  stage,
  hand,
  tray,
  input,
  get motion() {
    return motion;
  },
  get falling() {
    return falling;
  },
  get table() {
    return table;
  },
  // The rules' state of the game being played.
  get game() {
    return shaped()?.game ?? null;
  },
  get phase() {
    return shaped()?.phase ?? phase;
  },
  get classic() {
    return classic;
  },
  get forms() {
    return forms;
  },
  get zen() {
    return zen;
  },
  get way() {
    return way;
  },
  // The seed of the next game begun (for tests).
  set seed(v) {
    nextSeed = v >>> 0;
  },
  restart,
  pickRod,
  set timeScale(s) {
    timeScale = s;
  },
  get engraving() {
    return engraving;
  },
  settings,
  touchesAssembly,
  touchesBase,
  rodEnds,
  sound,
  guide,
  baseSurface: (r) => baseModel?.surface(r) ?? 0,
  shake,
};
