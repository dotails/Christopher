// Kal-toh: brings the rules, the stage, the hands and the Vulcan together. Nothing is drawn on
// the screen but the kal-toh, its stone and the t'an in the tray: everything it says is carved
// into the underside of the base (engrave.js).
import * as THREE from '../vendor/three.module.min.js';
import * as G from './geom.js';
import * as R from './rules.js';
import * as AI from './ai.js';
import { createScene, loadBase, loadEnvironment } from './scene.js';
import { RodPool, Halos, Ghosts } from './rodmesh.js';
import { Engraving } from './engrave.js';
import { Motion } from './motion.js';
import { Falling } from './falling.js';
import { Tray, Hand, ROD_LENGTH as RINGS_ROD } from './tray.js';
import { ClassicGame } from './classic.js';
import { FormsGame } from './forms.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { TEXT, ringText, fellText, playerText, completeText, winnerText, supplyText } from './texts.js';
import { loadSettings, saveSettings, gameOptions, shapeOf, DEFAULT_TUNING } from './settings.js';
import { ShakeDetector } from './shake.js';
import { native } from './native.js';
import { Head } from './head.js';
import { Tracker } from './tracker.js';

const canvas = document.getElementById('view');
const stage = createScene(canvas);
// The kal-toh, the t'an fallen from it (kept until a new game), the one in the tray and in hand.
const pool = new RodPool(stage.scene, 640);
const trayPool = new RodPool(stage.scene, 2, { onTop: true });
const halos = new Halos(stage.scene, 320);
const ghosts = new Ghosts(stage.scene, 16);
const sound = new Sound();
const settings = loadSettings();
const tray = new Tray(stage);
const hand = new Hand(stage, tray);
const head = new Head(deviceGeometry(), settings.holo);
const tracker = new Tracker({
  onEyes: (sighting) => head.eyes(sighting),
  onStatus: (status) => trackerStatus(status),
});
let motion = null;
let falling = null;
let baseModel = null;
let engraving = null;
// The game being played: the original kal-toh (classic.js), many forms built from the inside out
// (forms.js), or rings round the hidden spin (the rest of this file). A change of game in the ways
// to play waits for the next one.
let classic = null;
let forms = null;
let way = 'classic';
// The game on the stone when it is a form to bring about (the original kal-toh, or many forms).
const shaped = () => (way === 'classic' ? classic : way === 'forms' ? forms : null);
let begunWith = ''; // the ways the game was begun with (settings.js shapeOf)

const insets = { top: 0, bottom: 0 };
const quality = { maxDpr: 2, time: 0, frames: 0 };
let game = null;
let phase = 'loading'; // loading | intro | play | resolving | vulcan | testing | complete | over | dissolving
let aimKey = '';
let time = 0;
let shaking = 0; // how far a shake to begin anew has gone (0..1)
let thinking = false; // the Vulcan is considering

// What is drawn of each t'an: its assembly-local ends (which lead or lag the rules' positions
// while it slides), its face orientation, and its glow.
const display = new Map();
const collisionRods = [];
let shownCount = 0; // t'an drawn last frame: when it changes, the assembly's shape has changed
let strainOf = new Map();
let testGlow = null; // per-rod strain shown while the spin test turns
let plays = []; // the game of rings' plays, for the carving: { player, mark: join | ring | fall | test }
let aim = null; // { pieces, pose, ring } while a t'an is held
let completeGlow = 0;

const haptic = (kind) => {
  if (settings.haptics) native.haptic(kind);
};
sound.muted = !settings.sound;
// What the kal-toh says goes into its stone.
const say = (text) => engraving?.setEvent(text);

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

// The screen's true size and where the front camera sits beside it, in millimetres (from the
// Android shell; in a browser, a fair guess), for the hologram's window.
function deviceGeometry() {
  const info = native.device();
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const mmX = info?.xdpi > 0 ? (25.4 / info.xdpi) * dpr : 25.4 / (coarse ? 160 : 96);
  const mmY = info?.ydpi > 0 ? (25.4 / info.ydpi) * dpr : mmX;
  const screen = { width: w * mmX, height: h * mmY };
  // A camera in a hole in the screen is where the hole is; otherwise just above the screen.
  const at = info?.cutout
    ? { x: (info.cutout.x / dpr - w / 2) * mmX, y: (h / 2 - info.cutout.y / dpr) * mmY }
    : { x: 0, y: screen.height / 2 + 6 };
  return { screen, camera: { ...at, fovLong: info?.fovLong || 70, fovShort: info?.fovShort || 55 } };
}

function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
  const w = window.innerWidth;
  const h = window.innerHeight;
  head.device = deviceGeometry();
  Object.assign(stage.screen, head.device.screen);
  stage.layout(w, h, dpr);
  stage.view.focus.y = 0.42;
  // The t'an to place lies at the foot of the screen, below the base as the view first frames it
  // (not as it may be drawn nearer, or turned over to be read), and never off the screen.
  const { zoom } = stage.view;
  const reading = stage.view.read.k;
  stage.view.zoom = 1;
  stage.view.read.k = 0;
  stage.update();
  const foot = stage.toScreen(new THREE.Vector3(0, 0, 0.9));
  stage.view.zoom = zoom;
  stage.view.read.k = reading;
  stage.update();
  tray.layout(Math.min(h - insets.bottom - 64, Math.max(foot.y + 110, h - insets.bottom - 88)));
}

// --- The display of the kal-toh ----------------------------------------------------------

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const vUp = new THREE.Vector3();

function hashUp(id, dir) {
  const h = Math.sin(id * 12.9898) * 43758.5453;
  const t = (h - Math.floor(h)) * Math.PI * 2;
  const side = G.perpendicular(dir);
  const other = G.cross(dir, side);
  return G.add(G.scale(side, Math.cos(t)), G.scale(other, Math.sin(t)));
}

function entryFor(rod) {
  let e = display.get(rod.id);
  if (!e) {
    e = { id: rod.id, a: new THREE.Vector3(...rod.a), b: new THREE.Vector3(...rod.b), up: new THREE.Vector3(), anim: null, flash: 0, wa: new THREE.Vector3(), wb: new THREE.Vector3() };
    display.set(rod.id, e);
  }
  return e;
}

function orient(e, rod) {
  const dir = G.normalize(G.sub(rod.b, rod.a));
  const up = rod.ring >= 0 ? game.forces.axis : hashUp(rod.id, dir);
  e.up.set(up[0], up[1], up[2]);
}

// Make the drawing agree with the rules (snapping, unless a slide is under way).
function syncDisplay() {
  const alive = new Set();
  for (const rod of game.nest.liveRods) {
    alive.add(rod.id);
    const e = entryFor(rod);
    if (!e.anim) {
      e.a.set(...rod.a);
      e.b.set(...rod.b);
    }
    orient(e, rod);
  }
  for (const id of [...display.keys()]) if (!alive.has(id)) display.delete(id);
  motion.wake();
}

function refreshStrain() {
  strainOf = settings.strain && game ? R.strain(game).perRod : new Map();
}

function localToWorld(p, out) {
  return out.copy(p).applyMatrix4(stage.assemblyRoot.matrixWorld);
}

function arrToWorld(p, out) {
  return out.set(p[0], p[1], p[2]).applyMatrix4(stage.assemblyRoot.matrixWorld);
}

function animate(dt) {
  collisionRods.length = 0;
  let reshaped = display.size !== shownCount;
  shownCount = display.size;
  for (const e of display.values()) {
    e.flash = Math.max(0, e.flash - dt * 0.7);
    if (e.anim) {
      reshaped = true;
      const an = e.anim;
      an.t += dt;
      const k = Math.min(1, Math.max(0, (an.t - an.delay) / an.duration));
      const s = an.ease === 'drop' ? 1 - (1 - k) ** 3 : k * k * (3 - 2 * k);
      e.a.lerpVectors(an.fromA, an.toA, s);
      e.b.lerpVectors(an.fromB, an.toB, s);
      if (k >= 1) {
        e.anim = null;
        an.done?.();
      }
      if (an.ease === 'drop' && k < 1) continue; // still flying in: not yet part of the body
    }
    collisionRods.push([e.a, e.b]);
  }
  motion.setRods(collisionRods);
  // A changed shape may no longer rest where it did (or may rest on the stone now).
  if (reshaped) motion.wake();
}

function drawAssembly() {
  const q = stage.assemblyRoot.quaternion;
  const obstacles = [];
  const loopRods = new Set(aim?.ring?.places.map((p) => p.rod) ?? []);
  for (const e of display.values()) {
    const rod = game?.nest.rods[e.id];
    localToWorld(e.a, e.wa);
    localToWorld(e.b, e.wb);
    vUp.copy(e.up).applyQuaternion(q);
    // The blue of order is soft: a glow, never a glare. Nothing here moves a t'an.
    let blue = e.flash * 0.6;
    let amber = 0;
    if (rod?.ring >= 0) blue = Math.max(blue, 0.3);
    if (completeGlow > 0) blue = Math.max(blue, completeGlow * 0.42);
    if (aim && (aim.pieces.includes(e.id))) blue = Math.max(blue, 0.6);
    if (loopRods.has(e.id)) blue = Math.max(blue, 0.32);
    // The Vulcan considering: its thought is a slow light in the centre mass.
    if (thinking && rod?.kind === 'core') blue = Math.max(blue, 0.18 + 0.14 * Math.sin(time * 2.4));
    // A gathering shake lights everything, the nearer to beginning anew the brighter.
    if (shaking > 0.08) blue = Math.max(blue, shaking * 0.7);
    const strain = testGlow ? (testGlow.get(e.id) ?? 0) : (strainOf.get(e.id) ?? 0);
    const show = testGlow ? 0.35 : 0.72;
    if (strain > show) amber = Math.min(1, (strain - show) / (1 - show)) * 0.75;
    pool.push(e.wa, e.wb, vUp, blue, amber);
    if (blue > 0.05 || amber > 0.05) halos.push(e.wa, e.wb, Math.max(blue * 0.26, amber * 0.26), 0.06, amber > blue ? 1 : 0);
    obstacles.push({ a: [e.wa.x, e.wa.y, e.wa.z], b: [e.wb.x, e.wb.y, e.wb.z] });
  }
  if (falling) falling.obstacles = obstacles;
  // The ring a held t'an would make.
  if (aim?.ring) {
    const axis = v3.set(...game.forces.axis).applyQuaternion(q);
    for (const p of aim.ring.places) ghosts.push(arrToWorld(p.a, v1).clone(), arrToWorld(p.b, v2).clone(), axis, 0.6 + 0.4 * Math.sin(time * 5));
  }
}

// Picking: the t'an under a finger, and where along it.
const rayTmp = new THREE.Ray();
function pickRod(x, y, reach = 30) {
  if (shaped()) return shaped().pick(x, y, reach);
  if (!game) return null;
  let best = null;
  let front = Infinity;
  const candidates = [];
  for (const e of display.values()) {
    if (e.anim || !game.nest.rods[e.id]?.alive) continue;
    const sa = stage.toScreen(e.wa);
    const sb = stage.toScreen(e.wb);
    const d = segmentDistance(x, y, sa, sb);
    if (d > reach) continue;
    const depth = Math.min(sa.depth, sb.depth);
    front = Math.min(front, depth);
    candidates.push({ e, d, depth });
  }
  for (const c of candidates) {
    const score = c.d + (c.depth - front) * 22;
    if (!best || score < best.score) best = { ...c, score };
  }
  if (!best) return null;
  stage.rayAt(x, y, rayTmp);
  const o = [rayTmp.origin.x, rayTmp.origin.y, rayTmp.origin.z];
  const u = [rayTmp.direction.x, rayTmp.direction.y, rayTmp.direction.z];
  const hit = G.closestRaySeg(o, u, [best.e.wa.x, best.e.wa.y, best.e.wa.z], [best.e.wb.x, best.e.wb.y, best.e.wb.z]);
  const s = Math.min(0.97, Math.max(0.03, hit.t));
  return { rod: best.e.id, s, world: new THREE.Vector3(...hit.onSeg) };
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
  const rods = shaped() ? shaped().worldRods() : [...display.values()].filter((e) => !e.anim).map((e) => [e.wa, e.wb]);
  for (const [a, b] of rods) {
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

function humanTurn() {
  return game && !game.over && !game.players[game.current].vulcan;
}

function newGame() {
  way = settings.way;
  begunWith = shapeOf(settings);
  engraving.set({ pending: false });
  display.clear();
  falling.clear();
  timers.length = 0;
  completeGlow = 0;
  testGlow = null;
  aim = null;
  if (shaped()) {
    game = null;
    refreshStrain();
    phase = 'shaped';
    shaped().newGame(nextSeed);
    nextSeed = undefined;
    return;
  }
  game = R.createGame({ ...gameOptions(settings), seed: nextSeed });
  nextSeed = undefined;
  plays = [];
  tray.length = RINGS_ROD;
  motion.resetPlace();
  refreshStrain();
  // The nest gathers: the centre mass first, then each t'an flies in along its line and sticks.
  const rods = [...game.nest.liveRods].sort((p, q) => (p.kind === 'core' ? 0 : 1) - (q.kind === 'core' ? 0 : 1) || p.id - q.id);
  const span = 2.4;
  rods.forEach((rod, i) => {
    const e = entryFor(rod);
    orient(e, rod);
    const mid = G.lerp(rod.a, rod.b, 0.5);
    const out = G.normalize(G.length(mid) > 1e-3 ? mid : G.randomUnit(Math.random));
    const from = G.scale(out, 2.6);
    e.anim = {
      fromA: new THREE.Vector3(...G.add(rod.a, from)), fromB: new THREE.Vector3(...G.add(rod.b, from)),
      toA: new THREE.Vector3(...rod.a), toB: new THREE.Vector3(...rod.b),
      t: 0, delay: (i / rods.length) * span, duration: 0.5, ease: 'drop',
      done: () => {
        if (i % 3 === 0) sound.clink(0.25);
      },
    };
    e.a.copy(e.anim.fromA);
    e.b.copy(e.anim.fromB);
  });
  phase = 'intro';
  tray.hide();
  engraving.set({ game, plays, seats: null, lines: null, testAllowed: game.settings.test !== 'off' });
  say(TEXT.begin);
  after(span + 0.7, () => {
    syncDisplay();
    beginTurn();
  });
}

function beginTurn() {
  if (game.over) {
    finishGame();
    return;
  }
  engraving.set({ game });
  if (game.players[game.current].vulcan) {
    vulcanTurn();
    return;
  }
  phase = 'play';
  tray.refill();
  const humans = game.players.filter((p) => !p.vulcan).length;
  if (humans > 1) say(playerText(game.current));
}

function finishGame() {
  phase = 'over';
  tray.hide();
  engraving.set({ game });
  say(game.complete ? completeText(game) : game.supply <= 0 ? { v: `no tan remain ${winnerText(game).v}`, s: `No t'an remain. ${winnerText(game).s}` } : winnerText(game));
}

// --- Holding and placing ---------------------------------------------------------------------

function eyeLocal() {
  const p = motion.toLocal(stage.camera.position, new THREE.Vector3());
  return [p.x, p.y, p.z];
}

function foresight() {
  return settings.foresight === 'always' || (settings.foresight === 'known' && game.revealed);
}

const input = new Input(canvas, {
  stage,
  tray,
  get motion() {
    return motion;
  },
  pickRod,
  touchesAssembly,
  touchesBase,
  canLift: () => (shaped() ? shaped().canLift() : phase === 'play' && humanTurn() && !hand.holding && !hand.flight),
  canSpin: () => (shaped()
    ? shaped().hasRods && !['intro', 'dissolving'].includes(shaped().phase)
    : display.size > 0 && phase !== 'intro' && phase !== 'dissolving'),
  onLift(x, y) {
    sound.wake();
    hand.lift(x, y);
    sound.lift();
    haptic('lift');
  },
  onCarry(x, y) {
    hand.carry(x, y);
  },
  // While carried: blue where it would rest, amber where it cannot; the ring it would make, in
  // ghostly light, if foresight allows.
  onAim([ta, tb], f1, f2) {
    if (shaped()) {
      shaped().aim([ta, tb], f1, f2);
      return;
    }
    let pose = null;
    let ring = null;
    let refused = false;
    if (ta && tb) {
      const p = R.placement(game, ta, tb, eyeLocal());
      if (p.ok) {
        pose = p;
        if (foresight()) ring = AI.ringFor(game, p);
      } else {
        refused = true;
      }
    }
    aim = { pieces: [ta?.rod, tb?.rod].filter((x) => x !== undefined), pose, ring, refused };
    hand.follow(f1, f2, {
      pose: pose ? { a: arrToWorld(pose.a, new THREE.Vector3()), b: arrToWorld(pose.b, new THREE.Vector3()) } : null,
      touchA: ta?.world ?? null,
      touchB: tb?.world ?? null,
      anchor: stage.assemblyRoot.position,
      refused,
    });
    const key = `${ta?.rod}:${tb?.rod}:${Boolean(pose)}:${ring?.k ?? 0}`;
    if (key !== aimKey) {
      aimKey = key;
      if (ta || tb) {
        sound.hover();
        haptic('tick');
      }
    }
  },
  // Let go: placed where it was shown, unless the touch was cancelled (the system took it).
  onRelease(targets, cancelled) {
    if (shaped()) {
      shaped().release(cancelled);
      return;
    }
    const chosen = cancelled ? null : aim?.pose;
    aim = null;
    aimKey = '';
    if (!chosen || phase !== 'play') {
      hand.returnToTray();
      return;
    }
    phase = 'resolving';
    tray.hide();
    hand.fly(hand.a, hand.b, arrToWorld(chosen.a, new THREE.Vector3()), arrToWorld(chosen.b, new THREE.Vector3()), 0.14, () => {
      hand.holding = false;
      commit(chosen);
    });
  },
  onTap(x, y, where, at) {
    sound.wake();
    // A tap on the carving reads or acts on it; two quick taps on the t'an test the spin.
    if (engraving?.tap(x, y)) return;
    const now = at ?? performance.now();
    if (where === 'assembly' && now - lastTap < 500) {
      lastTap = 0;
      requestSpinTest();
      return;
    }
    lastTap = where === 'assembly' ? now : 0;
  },
  onGrab() {
    sound.wake();
  },
});

let lastTap = 0;

// The way the hidden spin throws a t'an free: out from the axis, plus how the assembly was turning.
function flingVelocity(e, strength = 1) {
  const mid = v1.addVectors(e.a, e.b).multiplyScalar(0.5);
  const axis = v2.set(...game.forces.axis);
  const out = v3.copy(mid).addScaledVector(axis, -mid.dot(axis));
  if (out.lengthSq() < 1e-6) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  out.normalize().applyQuaternion(stage.assemblyRoot.quaternion).multiplyScalar((0.5 + game.forces.spin * 0.7) * strength);
  const world = localToWorld(mid, new THREE.Vector3());
  const turning = motion.w.clone().cross(world.sub(stage.assemblyRoot.position));
  return out.add(turning).add(new THREE.Vector3(0, 0.25, 0));
}

function release(id, options = {}) {
  const e = display.get(id);
  if (!e) return;
  localToWorld(e.a, e.wa);
  localToWorld(e.b, e.wb);
  falling.spawn(e.wa.clone(), e.wb.clone(), options.velocity ?? flingVelocity(e, options.strength), options);
  display.delete(id);
}

function commit(pose) {
  sound.place();
  haptic('place');
  const result = R.play(game, pose);
  const last = game.history[game.history.length - 1];
  plays.push({ player: last.player, mark: last.ring ? 'ring' : last.lost > 0 ? 'fall' : 'join' });
  const placed = game.nest.rods[result.rod];
  const e = entryFor(placed);
  orient(e, placed);
  e.flash = 0.5;
  let t = 0.15;
  if (result.ring) {
    const ringSet = new Set(result.ring.rods);
    for (const m of result.moved) {
      const me = display.get(m.rod) ?? entryFor(game.nest.rods[m.rod]);
      me.anim = {
        fromA: me.a.clone(), fromB: me.b.clone(),
        toA: new THREE.Vector3(...m.to.a), toB: new THREE.Vector3(...m.to.b),
        t: 0, delay: 0.12, duration: ringSet.has(m.rod) ? 0.95 : 0.8,
      };
      if (ringSet.has(m.rod)) me.flash = 1;
    }
    for (const id of result.ring.rods) {
      const rod = game.nest.rods[id];
      if (rod.alive) orient(display.get(id) ?? entryFor(rod), rod);
    }
    after(0.15, () => {
      if (!result.ring.broken) {
        const p = R.formProgress(game);
        sound.harmony(Math.min(1, p.rings / Math.max(1, p.form.rings)));
        haptic('harmony');
      }
    });
    after(0.55, () => sound.hoop());
    for (const id of result.knocked) after(0.5, () => release(id, { amber: 0.8, strength: 1.4 }));
    // The chaos the ring shakes loose drifts away, lit by the same blue.
    (result.shaken ?? []).forEach((id, i) => after(0.9 + i * 0.06, () => release(id, { blue: 0.6, strength: 0.6 })));
    say(result.ring.broken ? TEXT.ringLost : ringText(result.ring.k));
    t = 1.2;
  }
  const falls = result.fallen.filter((id) => !result.knocked.includes(id));
  if (falls.length) {
    after(t, () => {
      sound.discord();
      haptic('discord');
      falls.forEach((id, i) => after(i * 0.05, () => release(id, { amber: 1 })));
    });
    if (!result.ring) say(fellText(result.lost));
  } else if (!result.ring) {
    say(TEXT.holds);
  }
  if (result.lifeLost) say(TEXT.lifeLost);
  else if (result.quickened) say(TEXT.quickens);
  const settle = t + (falls.length ? 0.6 + falls.length * 0.05 : 0.25);
  after(settle, () => {
    syncDisplay();
    refreshStrain();
    engraving.set({ game, plays });
    if (result.complete) {
      celebrate(result);
      return;
    }
    if (Number.isFinite(game.supply) && game.supply > 0 && game.supply <= 5) say(supplyText(game.supply));
    beginTurn();
  });
}

function celebrate(result) {
  phase = 'complete';
  tray.hide();
  (result.shed ?? []).forEach((id, i) => after(0.2 + i * 0.03, () => release(id, { blue: 0.8, strength: 0.5 })));
  after(0.9, () => {
    completeGlow = 1;
    sound.complete();
    haptic('complete');
  });
  game.over = true;
  engraving.set({ game });
  say(completeText(game));
}

// --- The spin test --------------------------------------------------------------------------

// A player asks to watch it spin: allowed on their own turn, with nothing in hand.
function requestSpinTest() {
  if (shaped()) {
    if (!shaped().spinTest()) say(TEXT.testNotNow);
    return;
  }
  if (game.settings.test === 'off') {
    say(TEXT.testOff);
    return;
  }
  if (phase !== 'play' || !humanTurn() || hand.holding) {
    say(TEXT.testNotNow);
    return;
  }
  spinTest('player');
}

function spinTest(who) {
  if (game.settings.test === 'off') {
    say(TEXT.testOff);
    return;
  }
  const tester = game.current;
  const res = R.spinTest(game);
  if (!res.allowed) return;
  plays.push({ player: tester, mark: 'test' });
  phase = 'testing';
  // The t'an stays in the tray while it spins (when the test spends the turn and the Vulcan plays
  // next, it goes as the Vulcan begins).
  const perRod = new Map();
  for (const b of game.nest.bonds) {
    if (!b.alive) continue;
    const u = res.analysis.util.get(b.id) ?? 0;
    for (const id of [b.r1, b.r2]) if (id >= 0) perRod.set(id, Math.max(perRod.get(id) ?? 0, u));
  }
  testGlow = perRod;
  const duration = 3.4;
  motion.startSpin(new THREE.Vector3(...game.forces.axis), 4 + game.forces.spin * 3, duration);
  sound.spin(duration);
  haptic('lift');
  say(who === 'vulcan' ? TEXT.vulcanTests : TEXT.testing);
  after(duration + 0.3, () => {
    testGlow = null;
    engraving.set({ game });
    beginTurn();
  });
}

// --- The Vulcan ---------------------------------------------------------------------------

let worker = null;
let requestId = 0;
function think() {
  const level = game.settings.opponent;
  const seed = (game.seed + game.turns * 7919) >>> 0;
  const data = R.serializeGame(game);
  return new Promise((resolve) => {
    const fallback = () => {
      const local = AI.chooseMove(R.restoreGame(JSON.parse(JSON.stringify(data))), { level, rng: G.mulberry32(seed), revealed: game.revealed });
      resolve(local ? { test: Boolean(local.test), pose: local.pose ?? null } : null);
    };
    try {
      worker ??= new Worker('js/ai-worker.js', { type: 'module' });
    } catch {
      fallback();
      return;
    }
    const id = ++requestId;
    const w = worker;
    let settled = false;
    const finish = (choice, failed) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (failed) fallback();
      else resolve(choice);
    };
    const onMessage = (e) => {
      if (e.data.id !== id) return;
      if (e.data.error) console.error(e.data.error);
      finish(e.data.choice, Boolean(e.data.error));
    };
    // A worker that cannot load (or never answers) must not stall the game: think here instead.
    const onError = (e) => {
      console.error('Vulcan worker failed', e.message ?? e);
      worker = null;
      finish(null, true);
    };
    const timer = setTimeout(() => finish(null, true), 30000);
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, game: data, level, seed });
  });
}

async function vulcanTurn() {
  phase = 'vulcan';
  tray.hide();
  say(TEXT.vulcanThinks);
  thinking = true;
  const started = performance.now();
  const forGame = game;
  const choice = await think();
  const wait = Math.max(0, 1.3 - (performance.now() - started) / 1000);
  after(wait, () => {
    if (game !== forGame || phase !== 'vulcan') return;
    thinking = false;
    if (!choice) {
      game.over = true;
      finishGame();
    } else if (choice.test) {
      spinTest('vulcan');
    } else {
      // The Vulcan's t'an descends from above and comes to rest.
      const toA = arrToWorld(choice.pose.a, new THREE.Vector3());
      const toB = arrToWorld(choice.pose.b, new THREE.Vector3());
      const lift = new THREE.Vector3(0.4, 1.8, 0.6);
      hand.holding = false;
      hand.glow = 0.4;
      hand.scale = hand.scaleGoal = 1;
      hand.a.copy(toA).add(lift);
      hand.b.copy(toB).add(lift);
      phase = 'resolving';
      hand.fly(hand.a, hand.b, toA, toB, 0.75, () => {
        hand.glow = 0;
        commit(choice.pose);
      });
    }
  });
}

// --- Beginning anew --------------------------------------------------------------------------

// Whether the game in play is falling away, a new one on its way.
function dissolving() {
  return shaped() ? shaped().phase === 'dissolving' : phase === 'dissolving';
}

function restart() {
  if (phase === 'loading' || dissolving()) return;
  if (shaped()) {
    hand.holding = false;
    hand.flight = null;
    tray.hide();
    timers.length = 0;
    shaped().dissolve();
    sound.dissolve();
    haptic('restart');
    after(1.6, newGame);
    return;
  }
  phase = 'dissolving';
  hand.holding = false;
  hand.flight = null;
  aim = null;
  thinking = false;
  tray.hide();
  timers.length = 0;
  completeGlow = 0;
  for (const id of [...display.keys()]) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(1.4);
    release(id, { velocity: v, blue: 0.7, spin: 2 });
  }
  sound.dissolve();
  haptic('restart');
  after(1.6, newGame);
}

// --- Settings, hologram ---------------------------------------------------------------------

// The hologram watches the camera from the page itself (tracker.js); if the page cannot, the
// Android shell can follow the face instead, more roughly.
function showHeadStatus(status, announce, source) {
  head.setStatus(status, source);
  engraving?.set({ hologram: status === 'on' || status === 'starting' });
  if (status === 'denied' || status === 'unavailable') {
    following = null;
    settings.hologram = false;
    saveSettings(settings);
  }
  if (!announce) return;
  // Switched on, it first looks for the eyes; the carving says so again once they are found.
  const text = { on: TEXT.hologramLooking, off: TEXT.hologramOff, denied: TEXT.hologramDenied, unavailable: TEXT.hologramUnavailable }[status];
  if (text) say(text);
}

// What follows the player now: 'native' (the shell, the head), 'camera' (the page, the eyes) or
// null. Word from the other is stale and ignored.
let following = null;

function trackerStatus(status) {
  if (following !== 'camera') return;
  if (status === 'unavailable' && native.hologram && settings.hologram) {
    following = 'native';
    showHeadStatus('starting', false, 'native');
    native.setHologram(true);
    return;
  }
  head.engine = status === 'on' ? tracker.engine : null;
  showHeadStatus(status, status !== 'starting', 'camera');
}

// On the phone the shell follows the head; in a browser, or if the player chooses the eyes, the
// page watches the camera itself.
function watch() {
  if (native.hologram && settings.holo.follow !== 'eyes') {
    tracker.stop();
    following = 'native';
    showHeadStatus('starting', false, 'native');
    native.setHologram(true);
    return;
  }
  if (following === 'native') native.setHologram(false);
  following = 'camera';
  showHeadStatus('starting', false, 'camera');
  tracker.start(settings.holo.engine);
}

function setHologram(on, announce = true) {
  settings.hologram = on;
  saveSettings(settings);
  if (on) {
    watch();
  } else {
    following = null;
    tracker.stop();
    native.setHologram(false);
    showHeadStatus('off', announce, null);
  }
}

// Out of sight, the camera is let go; back in sight, it is watched again.
// (The shell lets its own camera go, and takes it up again, by itself.)
function hide() {
  sound.suspend();
  if (following === 'camera') tracker.stop();
}

function reveal() {
  sound.resume();
  if (settings.hologram && following === 'camera') watch();
}

// The carving's glyphs and ways.
function onEngravedAction(name, to) {
  sound.wake();
  haptic('tick');
  if (name === 'translate' || name === 'page') {
    sound.hover();
    // Back from the ways with changes that wait for a new game: say so.
    if (to === 'main' && engraving.state.pending) say(TEXT.pending);
  } else if (name === 'test') {
    requestSpinTest();
  } else if (name === 'lens') {
    setHologram(!(head.active || head.status === 'starting'));
  } else if (name === 'centre') {
    head.recentre();
  } else if (name === 'reset') {
    const engine = settings.holo.engine;
    Object.assign(settings.holo, DEFAULT_TUNING);
    saveSettings(settings);
    head.recentre();
    if (engine !== settings.holo.engine) onEngravedTune('engine', settings.holo.engine);
  } else if (name === 'anew') {
    engraving.show('main');
    say(TEXT.applied);
    restart();
  }
}

function onEngravedTune(key) {
  saveSettings(settings);
  sound.wake();
  haptic('tick');
  // Following something else, or the eyes found another way: start afresh.
  if ((key === 'follow' || key === 'engine') && settings.hologram) {
    tracker.stop();
    native.setHologram(false);
    watch();
  }
}

function onEngravedOption(key, value) {
  saveSettings(settings);
  engraving.set({ pending: shapeOf(settings) !== begunWith });
  sound.wake();
  haptic('tick');
  if (key === 'sound') sound.muted = !value;
  if (key === 'hologram') setHologram(value, false);
  if (key === 'strain') refreshStrain();
  if (key === 'language' && engraving.standard !== (value === 'standard')) engraving.translate();
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
  // A sighting from the shell means it is following, whether or not word of that came first.
  face(...sighting) {
    if (following !== 'native') return;
    if (head.status !== 'on') showHeadStatus('on', true, 'native');
    head.face(...sighting);
  },
  head(x, y, size) {
    if (following !== 'native') return;
    if (head.status !== 'on') showHeadStatus('on', true, 'native');
    head.sample(x, y, size);
  },
  headEngine: (engine) => {
    head.engine = engine;
  },
  headStatus: (status) => {
    if (following === 'native') showHeadStatus(status, status !== 'off', 'native');
  },
  insets(top, bottom) {
    insets.top = top;
    insets.bottom = bottom;
    layout();
  },
  pause: hide,
  resume: reveal,
};

window.addEventListener('resize', layout);
window.addEventListener('pointerdown', () => sound.wake(), { capture: true });
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') restart();
  if (e.key === 't' || e.key === 'T') requestSpinTest();
});
document.addEventListener('visibilitychange', () => (document.hidden ? hide() : reveal()));
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

// The hologram: the eye where the camera finds it, the kal-toh framed for where it first rested.
let readoutAge = 0;
function holograph(dt) {
  head.update(dt);
  Object.assign(stage.eye, head.view);
  const optics = stage.optics;
  const rest = head.rest?.z ?? head.designDistance;
  optics.rest = (optics.rest ?? rest) + (rest - (optics.rest ?? rest)) * (1 - Math.exp(-dt / 0.4));
  optics.depth = settings.holo.depth;
  optics.size = settings.holo.size;
  // The tuning page shows what the camera sees, twice a second, while it can be read.
  readoutAge += dt;
  if (readoutAge > 0.5 && engraving.page === 'tune' && engraving.seen) {
    readoutAge = 0;
    engraving.setReadout(head.readout(tracker));
  }
  // The carving says when the eyes are found, and when they are lost for a while.
  const seeing = head.seeing;
  if (head.active && seeing !== lastSeeing) {
    lostFor = seeing ? 0 : lostFor + dt;
    if (seeing || lostFor > 3) {
      lastSeeing = seeing;
      say(seeing ? TEXT.hologramOn : TEXT.hologramLooking);
    }
  } else if (!head.active) {
    lastSeeing = null;
    lostFor = 0;
  }
}
let lastSeeing = null;
let lostFor = 0;

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

// With others at the board, the light behind the kal-toh takes the colour of whoever's turn it is
// (index.html), and so does the rim light from behind: red, then green, blue and gold. Alone, red.
// A finished game keeps its winner's.
const SEAT_LIGHT = [
  { rim: new THREE.Color(0xff5a4a), ground: new THREE.Color(0x2a0a08) },
  { rim: new THREE.Color(0x46ff86), ground: new THREE.Color(0x082a12) },
  { rim: new THREE.Color(0x4f8dff), ground: new THREE.Color(0x08142c) },
  { rim: new THREE.Color(0xffc74a), ground: new THREE.Color(0x2a2008) },
];
const tints = [...document.querySelectorAll('.tint')];
let shownSeat = 0;

function seatNow() {
  if (shaped()) {
    const g = shaped().game;
    if (!g || g.players < 2) return 0;
    return g.complete ? Math.max(0, g.winner) : g.current;
  }
  if (!game || game.players.length < 2) return 0;
  return game.over && game.winner >= 0 ? game.winner : game.current;
}

function colourSeat(dt) {
  const seat = seatNow() % SEAT_LIGHT.length;
  if (seat !== shownSeat) {
    shownSeat = seat;
    tints.forEach((el, i) => el.classList.toggle('on', i + 1 === seat));
  }
  const k = 1 - Math.exp(-dt / 0.45);
  stage.rim.color.lerp(SEAT_LIGHT[seat].rim, k);
  stage.ambient.groundColor.lerp(SEAT_LIGHT[seat].ground, k);
}

function step(dt) {
  time += dt;
  tickTimers(dt);
  holograph(dt);
  colourSeat(dt);
  readingView(dt);
  stage.update();
  if (shaped()) shaped().update(dt);
  else animate(dt);
  motion.update(dt);
  motion.apply(stage);
  if (motion.scrape > 0.25) sound.scrape(motion.scrape);
  falling.update(dt);
  tray.update(dt);
  if (input.mode === 'hold') input.aim();
  hand.update(dt);
  shake.update(dt);
  engraving.update(stage.camera, dt);

  pool.begin();
  trayPool.begin();
  halos.begin();
  ghosts.begin();
  if (shaped()) falling.obstacles = shaped().draw(pool, halos, shaking);
  else drawAssembly();
  falling.draw(pool, halos);
  tray.draw(trayPool, hand);
  hand.draw(pool, halos, trayPool);
  pool.end();
  trayPool.end();
  halos.end();
  ghosts.end();
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
  const [base] = await Promise.all([loadBase(stage), loadEnvironment(stage)]);
  baseModel = base;
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
  engraving = new Engraving(stage, {
    settings,
    stone: base.mesh.material.map?.image,
    baseMesh: base.mesh,
    onAction: onEngravedAction,
    onOption: onEngravedOption,
    onTune: onEngravedTune,
  });
  newGame();
  if (settings.hologram) setHologram(true, false);
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
  R,
  AI,
  stage,
  hand,
  tray,
  input,
  display,
  get motion() {
    return motion;
  },
  get falling() {
    return falling;
  },
  get game() {
    return game;
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
  get way() {
    return way;
  },
  // The seed of the next game begun (for tests).
  set seed(v) {
    nextSeed = v >>> 0;
  },
  restart,
  commit,
  spinTest,
  pickRod,
  rodScreen(id, s = 0.5) {
    const e = display.get(id);
    if (!e) return null;
    return stage.toScreen(new THREE.Vector3().lerpVectors(e.wa, e.wb, s));
  },
  set timeScale(s) {
    timeScale = s;
  },
  get engraving() {
    return engraving;
  },
  settings,
  head,
  tracker,
  setHologram,
  requestSpinTest,
  touchesAssembly,
  touchesBase,
  baseSurface: (r) => baseModel?.surface(r) ?? 0,
  get aim() {
    return aim;
  },
  shake,
};
