// Kal-toh: brings the rules, the stage, the hands and the Vulcan together.
import * as THREE from '../vendor/three.module.min.js';
import * as G from './geom.js';
import * as R from './rules.js';
import * as AI from './ai.js';
import { createScene, loadBase, loadEnvironment } from './scene.js';
import { RodPool, Halos, Ghosts } from './rodmesh.js';
import { Motion } from './motion.js';
import { Falling } from './falling.js';
import { Tray, Hand } from './tray.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import {
  Hud, Panel, TEXT, ringText, fellText, ringPreviewText, playerText, completeText, winnerText, supplyText,
} from './hud.js';
import { loadSettings, saveSettings, gameOptions } from './settings.js';
import { ShakeDetector } from './shake.js';
import { native } from './native.js';
import { Head } from './head.js';

const canvas = document.getElementById('view');
const stage = createScene(canvas);
const pool = new RodPool(stage.scene, 320);
const halos = new Halos(stage.scene, 320);
const ghosts = new Ghosts(stage.scene, 16);
const sound = new Sound();
const settings = loadSettings();
const hud = new Hud({ language: settings.language });
const tray = new Tray(stage);
const hand = new Hand(stage, tray);
const head = new Head();
let motion = null;
let falling = null;
let baseModel = null;

const insets = { top: 0, bottom: 0 };
const quality = { maxDpr: 2, time: 0, frames: 0 };
let game = null;
let phase = 'loading'; // loading | intro | play | resolving | vulcan | testing | complete | over | dissolving
let aimKey = '';
let shakeHinting = false;
let thinking = null;
let time = 0;

// What is drawn of each t'an: its assembly-local ends (which lead or lag the rules' positions
// while it slides), its face orientation, and its glow.
const display = new Map();
const collisionPoints = [];
let strainOf = new Map();
let testGlow = null; // per-rod strain shown while the spin test turns
let aim = null; // { pieces, pose, ring } while a t'an is held
let completeGlow = 0;

const haptic = (kind) => {
  if (settings.haptics) native.haptic(kind);
};
sound.muted = !settings.sound;

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

function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
  const w = window.innerWidth;
  const h = window.innerHeight;
  stage.layout(w, h, dpr);
  stage.view.focus.y = 0.4;
  stage.update();
  // The inscription sits just under the base; the tray below it.
  const foot = stage.toScreen(new THREE.Vector3(0, 0, 0.9));
  const root = document.documentElement.style;
  root.setProperty('--inset-top', `${insets.top}px`);
  root.setProperty('--inset-bottom', `${insets.bottom}px`);
  root.setProperty('--under-base', `${Math.round(foot.y + 10)}px`);
  tray.layout(Math.max(foot.y + 128, h - insets.bottom - 84));
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
  collisionPoints.length = 0;
  for (const e of display.values()) {
    e.flash = Math.max(0, e.flash - dt * 0.7);
    if (e.anim) {
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
    collisionPoints.push(e.a.clone(), e.b.clone(), v1.addVectors(e.a, e.b).multiplyScalar(0.5).clone());
  }
  motion.setPoints(collisionPoints);
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
    // The blue of order is soft: a glow, never a glare.
    let blue = e.flash * 0.6;
    let amber = 0;
    if (rod?.ring >= 0) blue = Math.max(blue, 0.3);
    if (completeGlow > 0) blue = Math.max(blue, completeGlow * (0.32 + 0.16 * Math.sin(time * 2.2 + e.id * 0.7)));
    if (aim && (aim.pieces.includes(e.id))) blue = Math.max(blue, 0.6);
    if (loopRods.has(e.id)) blue = Math.max(blue, 0.32);
    const strain = testGlow ? (testGlow.get(e.id) ?? 0) : (strainOf.get(e.id) ?? 0);
    const show = testGlow ? 0.35 : 0.72;
    if (strain > show) {
      const k = Math.min(1, (strain - show) / (1 - show));
      amber = k * 0.75;
      // A strained t'an trembles.
      if (!testGlow) {
        const j = 0.0035 * k;
        v2.set(Math.sin(time * 47 + e.id), Math.sin(time * 53 + e.id * 2.1), Math.sin(time * 41 + e.id * 3.7)).multiplyScalar(j);
        e.wa.add(v2);
        e.wb.add(v2);
      }
    }
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

// --- A game -------------------------------------------------------------------------------

const seedParam = new URLSearchParams(location.search).get('seed');
let nextSeed = seedParam === null ? undefined : Number(seedParam) >>> 0;

function cycleLines() {
  const lines = [TEXT.lift, TEXT.touch, TEXT.ring, TEXT.hold, TEXT.form, TEXT.turnBase];
  if (game.settings.test !== 'off') lines.push(TEXT.test);
  lines.push(TEXT.wipe, TEXT.gear, TEXT.shake);
  if (native.hologram && !head.active) lines.push(TEXT.lens);
  return lines;
}

function humanTurn() {
  return game && !game.over && !game.players[game.current].vulcan;
}

function newGame() {
  game = R.createGame({ ...gameOptions(settings), seed: nextSeed });
  nextSeed = undefined;
  display.clear();
  timers.length = 0;
  completeGlow = 0;
  testGlow = null;
  aim = null;
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
  hud.setPlayers(game);
  hud.setCycle(cycleLines());
  hud.say(TEXT.begin, 3.4);
  document.getElementById('spiral').classList.toggle('available', game.settings.test !== 'off');
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
  hud.setPlayers(game);
  if (game.players[game.current].vulcan) {
    vulcanTurn();
    return;
  }
  phase = 'play';
  tray.refill();
  const humans = game.players.filter((p) => !p.vulcan).length;
  if (humans > 1) hud.then(playerText(game.current), 2.4);
  else if (game.players.length > 1) hud.then(TEXT.yourTurn, 1.8);
}

function finishGame() {
  phase = 'over';
  tray.hide();
  hud.setPlayers(game);
  const text = game.complete ? completeText(game) : game.supply <= 0 ? { v: `no tan remain ${winnerText(game).v}`, s: `No t'an remain. ${winnerText(game).s}` } : winnerText(game);
  hud.say(text, 9);
  hud.setCycle([text, TEXT.shake]);
}

// --- Holding and placing ---------------------------------------------------------------------

function eyeLocal() {
  const p = motion.toLocal(stage.camera.position, new THREE.Vector3());
  return [p.x, p.y, p.z];
}

function foresight() {
  return settings.foresight === 'always' || (settings.foresight === 'known' && game.revealed);
}

const REASONS = { same: TEXT.aimSame, far: TEXT.aimFar, near: TEXT.aimNear, blocked: TEXT.aimBlocked, gone: TEXT.aimNone };

const input = new Input(canvas, {
  stage,
  tray,
  get motion() {
    return motion;
  },
  pickRod,
  canLift: () => phase === 'play' && humanTurn() && !hand.holding && !hand.flight,
  canSpin: () => display.size > 0 && phase !== 'intro' && phase !== 'dissolving',
  onLift() {
    sound.wake();
    hand.lift();
    sound.lift();
    haptic('lift');
    hud.hint(TEXT.aimNone);
  },
  onAim([ta, tb], f1, f2) {
    let pose = null;
    let hint = TEXT.aimNone;
    let ring = null;
    if (ta && tb) {
      const p = R.placement(game, ta, tb, eyeLocal());
      if (p.ok) {
        pose = p;
        hint = TEXT.aimReady;
        if (foresight()) {
          ring = AI.ringFor(game, p);
          if (ring) hint = ringPreviewText(ring.k);
        }
      } else {
        hint = REASONS[p.reason] ?? TEXT.aimNone;
      }
    } else if (ta || tb) {
      hint = TEXT.aimOne;
    }
    aim = { pieces: [ta?.rod, tb?.rod].filter((x) => x !== undefined), pose, ring };
    hand.follow(f1, f2, {
      pose: pose ? { a: arrToWorld(pose.a, new THREE.Vector3()), b: arrToWorld(pose.b, new THREE.Vector3()) } : null,
      touchA: ta?.world ?? null,
      touchB: tb?.world ?? null,
      anchor: stage.assemblyRoot.position,
    });
    hud.hint(hint);
    const key = `${ta?.rod}:${tb?.rod}:${Boolean(pose)}:${ring?.k ?? 0}`;
    if (key !== aimKey) {
      aimKey = key;
      if (ta || tb) {
        sound.hover();
        haptic('tick');
      }
    }
  },
  onRelease() {
    const chosen = aim?.pose;
    aim = null;
    aimKey = '';
    hud.hint(null);
    if (!chosen || phase !== 'play') {
      hand.returnToTray();
      hud.say(TEXT.returned, 1.8);
      return;
    }
    phase = 'resolving';
    tray.hide();
    hand.fly(hand.a, hand.b, arrToWorld(chosen.a, new THREE.Vector3()), arrToWorld(chosen.b, new THREE.Vector3()), 0.14, () => {
      hand.holding = false;
      commit(chosen);
    });
  },
  onTap(x, y, where) {
    sound.wake();
    if (where === 'tray' && phase === 'play') hud.say({ v: 'two fingers lift a tan', s: "Two fingers lift a t'an" }, 2.2);
  },
  onGrab() {
    sound.wake();
  },
});

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
    hud.say(result.ring.broken ? TEXT.ringLost : ringText(result.ring.k), 2.8);
    t = 1.2;
  }
  const falls = result.fallen.filter((id) => !result.knocked.includes(id));
  if (falls.length) {
    after(t, () => {
      sound.discord();
      haptic('discord');
      falls.forEach((id, i) => after(i * 0.05, () => release(id, { amber: 1 })));
    });
    hud.then(fellText(result.lost), 2.6);
  } else if (!result.ring) {
    hud.say(TEXT.holds, 1.6);
  }
  if (result.lifeLost) hud.then(TEXT.lifeLost, 2.4);
  if (result.quickened) hud.then(TEXT.quickens, 2.4);
  const settle = t + (falls.length ? 0.6 + falls.length * 0.05 : 0.25);
  after(settle, () => {
    syncDisplay();
    refreshStrain();
    hud.setPlayers(game);
    if (result.complete) {
      celebrate(result);
      return;
    }
    if (Number.isFinite(game.supply) && game.supply > 0 && game.supply <= 5) hud.then(supplyText(game.supply), 2);
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
    motion.startSpin(new THREE.Vector3(...game.forces.axis), 1.4, 10);
  });
  const text = completeText(game);
  hud.say(text, 9);
  hud.setCycle([text, TEXT.shake]);
  game.over = true;
}

// --- The spin test --------------------------------------------------------------------------

function spinTest(who) {
  if (game.settings.test === 'off') {
    hud.say(TEXT.testOff, 2.4);
    return;
  }
  const res = R.spinTest(game);
  if (!res.allowed) return;
  phase = 'testing';
  tray.hide();
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
  hud.say(who === 'vulcan' ? TEXT.vulcanTests : TEXT.testing, duration);
  after(duration + 0.3, () => {
    testGlow = null;
    hud.setPlayers(game);
    hud.setCycle(cycleLines());
    beginTurn();
  });
}

document.getElementById('spiral').addEventListener('click', () => {
  sound.wake();
  if (phase !== 'play' || !humanTurn() || hand.holding) {
    hud.say(TEXT.testNotNow, 1.6);
    return;
  }
  spinTest('player');
});

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
  hud.say(TEXT.vulcanThinks, 30);
  const started = performance.now();
  const forGame = game;
  const choice = await think();
  const wait = Math.max(0, 1.3 - (performance.now() - started) / 1000);
  after(wait, () => {
    if (game !== forGame || phase !== 'vulcan') return;
    hud.say(null);
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

function restart() {
  if (phase === 'loading' || phase === 'dissolving') return;
  phase = 'dissolving';
  hand.holding = false;
  hand.flight = null;
  aim = null;
  tray.hide();
  hud.hint(null);
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

const lens = document.getElementById('lens');
function showHeadStatus(status, announce) {
  head.setStatus(status);
  lens.classList.toggle('on', status === 'on');
  lens.classList.toggle('starting', status === 'starting');
  if (status === 'denied' || status === 'unavailable') {
    settings.hologram = false;
    saveSettings(settings);
  }
  if (!announce) return;
  const say = { on: TEXT.hologramOn, off: TEXT.hologramOff, denied: TEXT.hologramDenied, unavailable: TEXT.hologramUnavailable }[status];
  if (say) hud.say(say, status === 'on' || status === 'off' ? 2.4 : 4);
  if (game) hud.setCycle(cycleLines());
}

function setHologram(on, announce = true) {
  settings.hologram = on;
  saveSettings(settings);
  showHeadStatus(on ? 'starting' : 'off', announce && !on);
  native.setHologram(on);
}

if (native.hologram) {
  lens.classList.add('available');
  lens.addEventListener('click', () => {
    sound.wake();
    haptic('tick');
    setHologram(!(head.active || head.status === 'starting'));
  });
}

const panel = new Panel({
  settings,
  nativeHologram: native.hologram,
  onChange(key, value) {
    saveSettings(settings);
    sound.wake();
    haptic('tick');
    if (key === 'sound') sound.muted = !value;
    if (key === 'language') {
      hud.setLanguage(value);
      panel.zone.set(value === 'standard' ? 's' : 'v');
    }
    if (key === 'hologram') setHologram(value, false);
    if (key === 'strain') refreshStrain();
  },
  onApply() {
    panel.hide();
    hud.say(TEXT.applied, 2);
    restart();
  },
  onClose() {
    panel.hide();
  },
});

document.getElementById('gear').addEventListener('click', () => {
  sound.wake();
  haptic('tick');
  if (panel.open) panel.hide();
  else panel.show('ways');
});

// --- Shaking ------------------------------------------------------------------------------

const shake = new ShakeDetector({
  onProgress(p) {
    hud.charge(p > 0.08);
    if (p > 0.1 && phase !== 'dissolving' && !hand.holding) {
      hud.hint(TEXT.keepShaking);
      shakeHinting = true;
      sound.rattle(p);
    } else if (shakeHinting && p <= 0.1) {
      hud.hint(null);
      shakeHinting = false;
    }
  },
  onComplete: () => {
    shakeHinting = false;
    hud.hint(null);
    restart();
  },
});
if (!native.present) shake.listenToDeviceMotion();

window.kaltoh = {
  shake: (magnitude) => shake.sample(magnitude),
  head: (x, y, size) => head.sample(x, y, size),
  headStatus: (status) => showHeadStatus(status, status !== 'off'),
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
  if (e.key === 't' || e.key === 'T') document.getElementById('spiral').click();
});
document.addEventListener('visibilitychange', () => (document.hidden ? sound.suspend() : sound.resume()));
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  setTimeout(() => location.reload(), 300);
});

// --- Frame loop ---------------------------------------------------------------------------

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
  time += dt;
  tickTimers(dt);
  head.update(dt);
  Object.assign(stage.eye, head.view);
  stage.update();
  animate(dt);
  motion.update(dt);
  motion.apply(stage);
  if (motion.scrape > 0.25) sound.scrape(motion.scrape);
  falling.update(dt);
  tray.update(dt);
  if (input.mode === 'hold') input.aim();
  hand.update(dt);
  shake.update(dt);
  hud.update(dt);

  pool.begin();
  halos.begin();
  ghosts.begin();
  drawAssembly();
  falling.draw(pool, halos);
  tray.draw(pool, hand);
  hand.draw(pool, halos);
  pool.end();
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
  newGame();
  hud.show();
  if (native.hologram && settings.hologram) setHologram(true, false);
  document.getElementById('veil').classList.add('gone');
  requestAnimationFrame(frame);
}

start().catch((err) => {
  console.error(err);
  const line = document.querySelector('#inscription .s');
  if (line) line.textContent = `Could not start: ${err.message}`;
  document.getElementById('inscription').classList.add('show-s');
  document.getElementById('hud').classList.add('ready');
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
    return phase;
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
  panel,
  settings,
  baseSurface: (r) => baseModel?.surface(r) ?? 0,
  get aim() {
    return aim;
  },
  shake,
};
