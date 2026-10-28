// Kal-toh: brings the stage, the structure and the players together.
import * as THREE from '../vendor/three.module.min.js';
import * as K from './logic.js';
import { createStage, loadBase, loadEnvironment } from './stage.js';
import { RodPool, Halos } from './rods.js';
import { Structure } from './structure.js';
import { Falling } from './falling.js';
import { Tray, Hand } from './tray.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Hud, TEXT, completeText, playersText, turnText } from './hud.js';
import { ShakeDetector } from './shake.js';
import { native } from './native.js';

const canvas = document.getElementById('view');
const stage = createStage(canvas);
const pool = new RodPool(stage.scene, 360);
const halos = new Halos(stage.scene, 360);
const sound = new Sound();
const hud = new Hud();
const structure = new Structure(stage);
const tray = new Tray(stage);
const hand = new Hand(stage, tray, structure);

const insets = { top: 0, bottom: 0 };
const quality = { maxDpr: 2, time: 0, frames: 0 };
let falling = null;
let game = null;
let phase = 'loading'; // loading | intro | play | resolving | complete | dissolving
let players = readPlayers();
let aimKey = '';
let shakeHinting = false;

// --- Timers on game time (they pause with the game) ------------------------------------------

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

// --- Setup -----------------------------------------------------------------------------------

function readPlayers() {
  try {
    return Math.min(4, Math.max(1, Number(localStorage.getItem('kaltoh.players')) || 1));
  } catch {
    return 1;
  }
}

function savePlayers() {
  try {
    localStorage.setItem('kaltoh.players', String(players));
  } catch {
    // Private mode: the choice simply isn't remembered.
  }
}

function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
  stage.layout(window.innerWidth, window.innerHeight, dpr);
  tray.layout(insets.bottom);
  const root = document.documentElement.style;
  root.setProperty('--inset-top', `${insets.top}px`);
  root.setProperty('--inset-bottom', `${insets.bottom}px`);
}

function cycleLines() {
  const lines = [TEXT.lift, TEXT.touch, TEXT.truth, TEXT.angles, TEXT.axis, TEXT.goal, TEXT.turn, TEXT.shake];
  if (game && game.turns === 0) lines.splice(6, 0, TEXT.minds);
  return lines;
}

// ?seed=N replays a particular game (used by the automated checks).
const seedParam = new URLSearchParams(location.search).get('seed');
let nextSeed = seedParam === null ? undefined : Number(seedParam) >>> 0;

function newGame() {
  game = K.createGame({ players, seed: nextSeed });
  nextSeed = undefined;
  structure.reset(game);
  hud.setPlayers(game.players, game.current);
  hud.setCycle(cycleLines());
  hud.say(TEXT.begin, 3.4);
  phase = 'intro';
  tray.hide();
}

// --- Holding and placing ---------------------------------------------------------------------

function clearAim() {
  structure.highlightEdges = new Set();
  structure.highlightTips = [];
  hud.hint(null);
  aimKey = '';
}

const input = new Input(canvas, {
  stage,
  tray,
  hand,
  structure,
  canLift: () => phase === 'play' && !hand.holding && !hand.flight,
  onLift() {
    sound.wake();
    hand.lift();
    sound.lift();
    native.haptic('lift');
    hud.hint(TEXT.aimNone);
  },
  onAim([ta, tb], f1, f2) {
    const tipA = ta ? ta.tip : null;
    const tipB = tb ? tb.tip : null;
    hand.follow(f1, f2, tipA, tipB);
    structure.highlightEdges = new Set([ta?.rod, tb?.rod].filter((e) => e !== undefined && e >= 0));
    structure.highlightTips = [tipA, tipB].filter((t) => t !== null);
    let hint = TEXT.aimNone;
    if (tipA !== null && tipB !== null) {
      if (tipA === tipB) hint = TEXT.aimSame;
      else hint = K.isJoined(game, tipA, tipB) ? TEXT.aimJoined : TEXT.aimReady;
    } else if (tipA !== null || tipB !== null) {
      hint = TEXT.aimOne;
    }
    hud.hint(hint);
    const key = `${tipA}:${tipB}`;
    if (key !== aimKey) {
      aimKey = key;
      if (tipA !== null || tipB !== null) {
        sound.hover();
        native.haptic('tick');
      }
    }
  },
  onRelease([ta, tb]) {
    clearAim();
    const u = ta ? ta.tip : null;
    const v = tb ? tb.tip : null;
    let refusal = null;
    if (u === null || v === null) refusal = TEXT.returned;
    else if (u === v) refusal = TEXT.aimSame;
    else if (K.isJoined(game, u, v)) refusal = TEXT.aimJoined;
    if (refusal || phase !== 'play') {
      hand.returnToTray();
      hud.say(refusal ?? TEXT.returned, 2.2);
      return;
    }
    place(u, v);
  },
  onTap(x, y, where) {
    sound.wake();
    if (where === 'tray' && phase === 'play') hud.say(TEXT.twoFingers, 2.2);
  },
});

function place(u, v) {
  phase = 'resolving';
  const [a, b] = structure.rodEnds(structure.pos[u], structure.pos[v], 1);
  hand.fly(a, b, 0.15, () => {
    hand.holding = false;
    sound.place();
    native.haptic('place');
    resolve(K.play(game, u, v));
  });
}

// World velocity away from the structure's centre through the middle of two tips.
function outward(u, v, speed) {
  const mid = structure.tipWorld(u).add(structure.tipWorld(v)).multiplyScalar(0.5);
  const dir = mid.sub(structure.centreWorld()).normalize();
  return dir.multiplyScalar(speed).add(new THREE.Vector3(0, speed * 0.8, 0));
}

// The way the spin throws a t'an: along the imbalance it would have caused.
function flingVelocity(edge) {
  const q = structure.root.getWorldQuaternion(new THREE.Quaternion());
  const dir = new THREE.Vector3().fromArray(K.imbalance(game, edge)).normalize().applyQuaternion(q);
  return dir.multiplyScalar(2.4).add(new THREE.Vector3(0, 1.5, 0));
}

function resolve(r) {
  let settle = 0.9;
  if (r.kind === 'harmony') {
    structure.join(r.edge);
    structure.pulse([r.edge], { strength: 0.8 });
    sound.harmony(K.harmony(game));
    native.haptic('harmony');
    if (r.complete) {
      celebrate();
      return;
    }
    if (r.hoops.length) {
      after(0.35, () => {
        structure.pulse(r.hoops.flatMap((h) => h.edges), { strength: 1.1, step: 0.03 });
        sound.hoop();
      });
      hud.say(TEXT.hoop, 2.4);
    } else {
      hud.say(TEXT.harmony, 1.9);
    }
    if (K.wobble(game).amount > 0.72) {
      after(0.9, () => sound.wobbleWarning());
      hud.then(TEXT.wobble, 2.6);
    }
  } else if (r.kind === 'discord') {
    sound.discord();
    native.haptic('discord');
    structure.strain(r.u, r.v, { life: 0.5, stiffness: 0.3, amber: 1, velocity: () => outward(r.u, r.v, 0.5) });
    r.fallen.forEach((e, i) => after(0.3 + i * 0.12, () => {
      const [a, b] = K.buildLattice().edges[e];
      structure.release(e, outward(a, b, 0.7), { amber: true });
      sound.clink(0.6);
    }));
    hud.say(r.fallen.length ? TEXT.shaken : TEXT.discord, 2.4);
    settle = 1.1;
  } else if (r.kind === 'flung') {
    sound.fling();
    native.haptic('fling');
    structure.kick(1.3);
    structure.strain(r.u, r.v, { life: 0.34, stiffness: 1, blue: 0.8, velocity: () => flingVelocity(r.edge) });
    hud.say(TEXT.flung, 2.6);
    settle = 1;
  }
  after(settle, () => {
    if (phase !== 'resolving') return;
    phase = 'play';
    tray.refill();
    hud.setPlayers(game.players, game.current);
    if (game.turns === 1) hud.setCycle(cycleLines());
    if (game.players > 1) hud.then(turnText(game.current), 2.4);
  });
}

function celebrate() {
  phase = 'complete';
  tray.hide();
  after(0.5, () => {
    structure.pulse([...structure.views.keys()].slice(0, 1), { strength: 0.75, step: 0.05 });
    sound.complete();
    native.haptic('complete');
  });
  const done = completeText(game);
  hud.say(done, 7);
  hud.setCycle([done, TEXT.shake]);
  hud.setPlayers(game.players, game.winner);
}

function restart() {
  if (phase === 'loading' || phase === 'dissolving') return;
  phase = 'dissolving';
  hand.holding = false;
  hand.flight = null;
  tray.hide();
  clearAim();
  timers.length = 0;
  structure.dissolve();
  sound.dissolve();
  native.haptic('restart');
  after(1.6, newGame);
}

// --- Players ---------------------------------------------------------------------------------

document.getElementById('minds').addEventListener('click', () => {
  sound.wake();
  if (!game || game.turns > 0 || phase === 'complete' || phase === 'dissolving') {
    hud.say(TEXT.locked, 2.6);
    return;
  }
  players = (players % 4) + 1;
  savePlayers();
  K.setPlayers(game, players);
  hud.setPlayers(players, game.current);
  hud.say(playersText(players), 2.2);
  native.haptic('tick');
});

// --- Shaking ---------------------------------------------------------------------------------

const shake = new ShakeDetector({
  onProgress(p) {
    structure.tremble = p;
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
    restart();
  },
});
if (!native.present) shake.listenToDeviceMotion();

// The Android shell calls these.
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

// --- Frame loop ------------------------------------------------------------------------------

// Lower the resolution if the device cannot keep up; the game must stay fluid.
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
let timeScale = 1; // automated checks speed the game up
let failures = 0;
function frame(now) {
  // Ask for the next frame first: one bad frame must never stop the game.
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
  stage.update(dt);
  structure.update(dt);
  falling.update(dt);
  tray.update(dt);
  if (input.mode === 'hold') input.aim();
  hand.update(dt);
  if (structure.inner.locked) sound.settle(structure.inner.locked);
  if (structure.inner.arrived) sound.clink(0.25);
  shake.update(dt);
  hud.update(dt);
  if (phase === 'intro' && structure.grown) {
    phase = 'play';
    tray.refill();
  }

  pool.begin();
  halos.begin();
  structure.draw(pool, halos);
  falling.draw(pool, halos);
  tray.draw(pool, hand);
  hand.draw(pool, halos);
  pool.end();
  halos.end();
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
  falling = new Falling(stage, base, sound);
  structure.ground = base.surface;
  structure.onDrop = (a, b, velocity, options) => falling.spawn(a, b, velocity, options);
  newGame();
  hud.show();
  document.getElementById('veil').classList.add('gone');
  requestAnimationFrame(frame);
}

start().catch((err) => {
  console.error(err);
  document.getElementById('standard').textContent = `Could not start: ${err.message}`;
  document.getElementById('hud').classList.add('ready');
  document.getElementById('veil').classList.add('gone');
});

// For automated tests and curious developers.
window.__kaltoh = {
  K,
  stage,
  structure,
  hand,
  tray,
  input,
  falling: () => falling,
  get game() {
    return game;
  },
  get phase() {
    return phase;
  },
  tipScreen: (v) => stage.toScreen(structure.tipWorld(v)),
  restart,
  place,
  set timeScale(s) {
    timeScale = s;
  },
};
