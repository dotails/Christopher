// Nothing is written on the screen. Everything the kal-toh says is carved into the underside of
// its stone base, in a medallion: its name, the players, what last happened, how to play, and
// the glyphs that act - the ways to play, testing the spin, the hologram, beginning anew. Turn
// the base over to read it: whichever way it is tipped, the carving is found with its top up.
//
// It is carved in Vulcan. A touch anywhere on it but a glyph or a value translates all of it:
// the carving smooths away to bare stone, and the other script is cut in its place, as deep.
//
// The medallion's frame is cut into the stone for good. Its words and glyphs are a second layer
// whose depth the shader can scale (relief, darkened grooves and glow alike), so they can be
// smoothed away and recut.
import * as THREE from '../vendor/three.module.min.js';
import { PIVOT } from './scene.js';
import { OPTIONS, TUNING, TUNE_PAGES, tuningText } from './settings.js';
import { TEXT, vulcanOnly, scoreText, formText, rulesText } from './texts.js';

const SIZE = 1024;
const C = SIZE / 2;
const NORMAL_SIZE = 512;
export const MEDALLION_RADIUS = 0.8; // in the base's own units, inside its foot
const STANDARD_FONT = "'Roboto', 'Helvetica Neue', system-ui, sans-serif";
const PAGE_HEIGHT = 540; // texture pixels of rows on a page of the ways
const ARROW_Y = 506; // where the page arrows are cut, either side
const ROW_MAX = 680; // the widest a row may be cut, clear of the arrows
const RELIEF = 1.4; // the normal maps' strength at full depth
const SMOOTH = 0.32; // seconds for the carving to smooth away ...
const RECUT = 0.42; // ... and to be cut again
// How squarely the underside must face the eye to count as seen (and so be set upright).
const SEEN = 0.08;
const UNSEEN = 0.02;
const READOUT = { x: 120, y: 222, w: 784, h: 66 }; // where the tuning pages' live figures are cut

const canvasOf = (size) => {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
};
// Half the medallion's width at a given height on the canvas.
const chord = (y) => Math.sqrt(Math.max(0, (C - 34) ** 2 - (y - C) ** 2));
const eyeUp = new THREE.Vector3();
const qBase = new THREE.Quaternion();
const qTurn = new THREE.Quaternion();
const qLay = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const Y = new THREE.Vector3(0, 1, 0);

// The carving's layer, blended into MeshStandardMaterial: its colour over the stone, its relief
// added to the frame's, and its glow - all scaled by carveDepth.
function carveShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = `uniform sampler2D carveColor;\nuniform sampler2D carveRelief;\nuniform float carveDepth;\n${shader.fragmentShader}`
    .replace('#include <map_fragment>', `#include <map_fragment>
      vec4 carveTint = texture2D( carveColor, vMapUv );
      diffuseColor.rgb = mix( diffuseColor.rgb, carveTint.rgb, carveTint.a * carveDepth );`)
    .replace('#include <normal_fragment_maps>', `
      vec4 carveCut = texture2D( carveRelief, vNormalMapUv );
      vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
      mapN.xy *= normalScale;
      mapN.xy += ( carveCut.xy * 2.0 - 1.0 ) * normalScale * carveDepth;
      normal = normalize( tbn * mapN );`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += emissive * pow( carveCut.b, 2.2 ) * carveDepth;`);
}

export class Engraving {
  constructor(stage, { settings, stone, baseMesh, onAction, onOption, onTune }) {
    this.stage = stage;
    this.settings = settings;
    this.baseMesh = baseMesh;
    this.onAction = onAction;
    this.onOption = onOption;
    this.onTune = onTune;

    // The frame, cut for good: stone colour, relief and glow.
    this.stone = this.makeBackground(stone);
    const frameMask = canvasOf(SIZE);
    const frameGlow = canvasOf(SIZE);
    frameGlow.getContext('2d').fillRect(0, 0, SIZE, SIZE);
    this.layer = { color: this.stone, mask: frameMask, glow: frameGlow };
    this.ring(C - 12, 7, 0.2);
    this.ring(C - 30, 2.5, 0.25);
    const frameRelief = canvasOf(NORMAL_SIZE);
    buildRelief(frameMask, null, frameRelief, true);

    // The words and glyphs: a layer of their own.
    this.carve = { color: canvasOf(SIZE), mask: canvasOf(SIZE), glow: canvasOf(SIZE) };
    this.relief = canvasOf(NORMAL_SIZE);

    const texture = (canvas, srgb) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      return t;
    };
    const map = texture(this.stone, true);
    const normalMap = texture(frameRelief, false);
    const emissiveMap = texture(frameGlow, true);
    this.carveColor = texture(this.carve.color, true);
    this.carveRelief = texture(this.relief, false);
    this.depth = { value: 1 }; // the shader's, eased from `cutting`
    this.cutting = 1; // how deep the words are cut, 0 (smoothed away) to 1
    const material = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(RELIEF, RELIEF),
      emissiveMap,
      // The carving holds a faint light, as a Vulcan inlay would, so it reads in the stone's shadow.
      emissive: new THREE.Color(0x9fd2ff),
      emissiveIntensity: 0.5,
      roughness: 0.86,
      metalness: 0,
    });
    material.onBeforeCompile = (shader) => carveShader(shader, {
      carveColor: { value: this.carveColor },
      carveRelief: { value: this.carveRelief },
      carveDepth: this.depth,
    });
    material.customProgramCacheKey = () => 'kaltoh-carving';
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(MEDALLION_RADIUS, 96), material);
    // Facing down, just proud of the foot.
    this.mesh.quaternion.copy(qLay);
    this.mesh.position.y = -PIVOT.y - 0.0025;
    this.mesh.receiveShadow = true;
    stage.baseRoot.add(this.mesh);

    this.page = 'main';
    this.wayPage = 0;
    this.tunePage = 0;
    this.standard = settings.language === 'standard'; // which script is cut now
    this.state = { game: null, event: TEXT.begin, hologram: false, testAllowed: true, readout: null };
    this.regions = [];
    this.dirty = true;
    this.change = null; // what is to be cut once the carving has smoothed away
    this.phase = 'still'; // still | smoothing | cutting
    this.seen = false; // the underside faces the eye
    this.raycaster = new THREE.Raycaster();
  }

  set(state) {
    Object.assign(this.state, state);
    this.dirty = true;
  }

  setEvent(text) {
    if (!text) return;
    this.state.event = text;
    this.dirty = true;
  }

  // How squarely the underside faces the eye (1: straight on), and where its centre is.
  facing(camera, center = new THREE.Vector3()) {
    this.mesh.getWorldPosition(center);
    const normal = new THREE.Vector3(0, -1, 0).applyQuaternion(this.stage.baseRoot.quaternion);
    return { facing: normal.dot(camera.position.clone().sub(center).normalize()), center };
  }

  // Smooth the carving away, make a change, and cut it again.
  recut(change) {
    this.change = change;
    if (this.phase !== 'smoothing') this.phase = 'smoothing';
  }

  translate() {
    this.recut(() => {
      this.standard = !this.standard;
    });
  }

  // Each frame: set the carving upright when the underside comes into view, carry on any
  // recutting, and cut what has changed.
  update(camera, dt) {
    const { facing } = this.facing(camera);
    if (facing < UNSEEN) this.seen = false;
    else if (!this.seen && facing > SEEN) {
      this.seen = true;
      this.setUpright(camera);
    }
    if (this.phase === 'smoothing') {
      this.cutting = Math.max(0, this.cutting - dt / SMOOTH);
      if (this.cutting === 0) {
        this.change?.();
        this.change = null;
        this.dirty = true;
        this.phase = 'cutting';
      }
    } else if (this.phase === 'cutting') {
      this.cutting = Math.min(1, this.cutting + dt / RECUT);
      if (this.cutting === 1) this.phase = 'still';
    }
    // Eased, so the cutting starts and ends gently.
    const k = this.cutting;
    this.depth.value = k * k * (3 - 2 * k);
    if (this.phase !== 'smoothing') this.render();
  }

  // Turn the carving about its centre so that, seen from here, its top is up.
  setUpright(camera) {
    qBase.copy(this.stage.baseRoot.quaternion).invert();
    eyeUp.set(0, 1, 0).applyQuaternion(camera.quaternion).applyQuaternion(qBase);
    // Within the medallion's plane (the base's xz-plane), the carving's top lies along +z turned
    // by the angle about y.
    if (eyeUp.x * eyeUp.x + eyeUp.z * eyeUp.z < 1e-8) return;
    qTurn.setFromAxisAngle(Y, Math.atan2(eyeUp.x, eyeUp.z));
    this.mesh.quaternion.copy(qTurn).multiply(qLay);
  }

  // --- Drawing -------------------------------------------------------------------------------

  makeBackground(stone) {
    const bg = canvasOf(SIZE);
    const g = bg.getContext('2d');
    if (stone) {
      // The basin's own stone, a little smoothed where the medallion was dressed flat.
      g.filter = 'blur(1.5px)';
      g.drawImage(stone, 0, 0, SIZE, SIZE);
      g.filter = 'none';
    } else {
      g.fillStyle = '#c99a8e';
      g.fillRect(0, 0, SIZE, SIZE);
    }
    g.fillStyle = 'rgba(214, 160, 148, 0.42)';
    g.fillRect(0, 0, SIZE, SIZE);
    const shade = g.createRadialGradient(C, C, C * 0.2, C, C, C);
    shade.addColorStop(0, 'rgba(255, 236, 228, 0.12)');
    shade.addColorStop(1, 'rgba(60, 28, 22, 0.32)');
    g.fillStyle = shade;
    g.fillRect(0, 0, SIZE, SIZE);
    return bg;
  }

  render() {
    if (!this.dirty) return;
    this.dirty = false;
    const { color, mask, glow } = this.carve;
    color.getContext('2d').clearRect(0, 0, SIZE, SIZE);
    mask.getContext('2d').clearRect(0, 0, SIZE, SIZE);
    const gl = glow.getContext('2d');
    gl.fillStyle = '#000';
    gl.fillRect(0, 0, SIZE, SIZE);
    this.layer = this.carve;
    this.regions = [];
    if (this.page === 'ways') this.drawWays();
    else if (this.page === 'rules') this.drawRules();
    else if (this.page === 'tune') this.drawTune();
    else this.drawMain();
    buildRelief(mask, glow, this.relief, false);
    this.carveColor.needsUpdate = true;
    this.carveRelief.needsUpdate = true;
  }

  // Cut into a layer: the stone (a bright lower lip and a dark groove), the depth mask (for the
  // relief), and the glow.
  cut(draw, lit) {
    const { color, mask, glow } = this.layer;
    const g = color.getContext('2d');
    g.save();
    g.translate(1.6, 1.6);
    draw(g, 'rgba(255, 240, 230, 0.42)');
    g.restore();
    draw(g, 'rgba(46, 20, 16, 0.84)');
    draw(mask.getContext('2d'), '#fff');
    if (lit > 0) draw(glow.getContext('2d'), `rgba(255, 255, 255, ${lit})`);
  }

  ring(r, width, lit) {
    this.cut((g, color) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.arc(C, C, r, 0, Math.PI * 2);
      g.stroke();
    }, lit);
  }

  // A line of text, centred at (x, y), fitted into `max` pixels. `numerals` keeps it in Standard
  // letters whatever the script (the Vulcan fonts have no digits).
  line(id, text, x, y, { size = 32, script = false, max = 760, lit = 0.32, kind = 'line', key, numerals = false } = {}) {
    const standard = this.standard || numerals;
    const str = standard ? text.s : vulcanOnly(text.v);
    if (!str) return null;
    const family = standard ? STANDARD_FONT : script ? "'VulcanScript'" : "'ModernVulcan'";
    let px = standard ? size * (script ? 0.55 : 0.82) : size;
    const g = this.layer.color.getContext('2d');
    g.font = `400 ${px}px ${family}`;
    let w = g.measureText(str).width;
    if (w > max) {
      px *= max / w;
      w = max;
    }
    const font = `400 ${px}px ${family}`;
    const x0 = x - w / 2;
    this.cut((c, color) => {
      c.font = font;
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillStyle = color;
      c.fillText(str, x0, y);
    }, lit);
    const h = Math.max(px * 1.5, 44);
    const region = { kind, id, key, x: x0 - 14, y: y - h / 2, w: w + 28, h };
    this.regions.push(region);
    return region;
  }

  // A glyph that acts when touched, with its name carved beneath.
  glyph(name, x, y, label, { lit = 0.4, on = false } = {}) {
    const shape = GLYPHS[name];
    this.cut((g, color) => {
      g.save();
      g.translate(x, y);
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      shape(g);
      g.restore();
    }, on ? 0.95 : lit);
    this.regions.push({ kind: 'button', id: name, x: x - 52, y: y - 52, w: 104, h: 96 });
    if (label) this.line(`g:${name}`, label, x, y + 62, { size: 22, max: 132, lit: 0.26 });
  }

  glyphRow(items, y) {
    const gap = items.length > 4 ? 124 : 150;
    items.forEach((item, i) => {
      const x = C + (i - (items.length - 1) / 2) * gap;
      this.glyph(item.name, x, y, item.label, item);
    });
  }

  // Page marks: one dot for each page, the current one larger.
  dots(count, current, y) {
    for (let i = 0; i < count; i++) {
      const x = C + (i - (count - 1) / 2) * 26;
      const on = i === current;
      this.cut((g, color) => {
        g.fillStyle = color;
        g.beginPath();
        g.arc(x, y, on ? 6 : 4, 0, Math.PI * 2);
        g.fill();
      }, on ? 0.9 : 0.25);
    }
  }

  drawMain() {
    const { game, event } = this.state;
    this.line('title', TEXT.title, C, 168, { size: 96, script: true, max: 640, lit: 0.55 });
    // The players: a mark each (a diamond for a Vulcan), filled for whose turn it is, and a score.
    const seats = this.state.seats ?? game?.players.map((p, i) => ({ vulcan: p.vulcan, now: i === game.current && !game.over, score: scoreText(game, p) })) ?? [];
    seats.forEach((seat, i) => {
      const x = C + (i - (seats.length - 1) / 2) * 150;
      this.cut((g, color) => {
        g.fillStyle = color;
        g.strokeStyle = color;
        g.lineWidth = 3;
        g.beginPath();
        if (seat.vulcan) {
          g.moveTo(x, 244);
          g.lineTo(x + 11, 255);
          g.lineTo(x, 266);
          g.lineTo(x - 11, 255);
          g.closePath();
        } else {
          g.arc(x, 255, 10, 0, Math.PI * 2);
        }
        if (seat.now) g.fill();
        else g.stroke();
      }, seat.now ? 0.95 : 0.3);
      this.line(`seat${i}`, seat.score, x, 290, { size: 24, max: 140, lit: seat.now ? 0.6 : 0.28 });
    });
    this.line('event', event, C, 346, { size: 40, max: 2 * chord(346) - 90, lit: 0.6 });
    const lines = this.state.lines ?? [TEXT.lift, TEXT.touch, TEXT.ring, TEXT.hold, formText(this.settings.form), TEXT.turn, TEXT.shake, TEXT.translate];
    lines.forEach((text, i) => {
      const y = 412 + i * 50;
      this.line(`l${i}`, text, C, y, { size: 31, max: 2 * chord(y) - 80 });
    });
    const glyphs = [{ name: 'ways', label: TEXT.ways }];
    if (this.state.testAllowed) glyphs.push({ name: 'test', label: TEXT.test });
    glyphs.push({ name: 'lens', label: this.state.hologram ? TEXT.lensOn : TEXT.lensOff, on: this.state.hologram });
    glyphs.push({ name: 'anew', label: TEXT.anew, on: this.state.pending });
    this.glyphRow(glyphs, 846);
  }

  visibleOptions() {
    return OPTIONS.filter((o) => !o.when || o.when(this.settings));
  }

  // The ways, page by page: a row is its name and its value, and for some a line beneath on what
  // the value means. As many rows to a page as fit.
  wayPages() {
    const pages = [[]];
    let used = 0;
    for (const o of this.visibleOptions()) {
      const h = o.choices.some((c) => c[3]) ? 112 : 84;
      if (used + h > PAGE_HEIGHT && pages[pages.length - 1].length) {
        pages.push([]);
        used = 0;
      }
      pages[pages.length - 1].push(o);
      used += h;
    }
    return pages;
  }

  // Large chevrons at the rim, either side: touch one to turn to the page before or after.
  // Only where there is such a page.
  arrows(page, pages) {
    const y = ARROW_Y;
    for (const [side, id] of [[-1, 'prev'], [1, 'more']]) {
      if (side < 0 ? page <= 0 : page >= pages - 1) continue;
      const x = C + side * (chord(y) - 78);
      this.cut((g, color) => {
        g.strokeStyle = color;
        g.lineWidth = 10;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(x - side * 20, y - 58);
        g.lineTo(x + side * 20, y);
        g.lineTo(x - side * 20, y + 58);
        g.stroke();
      }, 0.8);
      this.regions.push({ kind: 'button', id, x: x - 64, y: y - 160, w: 128, h: 320 });
    }
  }

  drawWays() {
    const pages = this.wayPages();
    this.wayPage = Math.min(this.wayPage, pages.length - 1);
    this.line('waysTitle', TEXT.waysTitle, C, 164, { size: 44, lit: 0.5 });
    this.dots(pages.length, this.wayPage, 210);
    let y = 262;
    for (const o of pages[this.wayPage]) {
      const max = Math.min(ROW_MAX, 2 * chord(y + 16) - 90);
      const choice = o.choices.find(([value]) => value === this.settings[o.key]) ?? o.choices[0];
      // The name of the way, its value beneath (touch to change), and what that means.
      this.line(`row:${o.key}`, { v: o.v, s: o.s }, C, y, { size: 25, max, lit: 0.22 });
      this.line(`row:${o.key}`, { v: choice[1], s: choice[2] }, C, y + 34, { size: 31, max, lit: 0.62, kind: 'value', key: o.key });
      if (choice[3]) this.line(`hint:${o.key}`, choice[3], C, y + 67, { size: 26, max, lit: 0.36 });
      y += o.choices.some((c) => c[3]) ? 112 : 84;
    }
    this.arrows(this.wayPage, pages.length);
    // Ways that shape the game wait for it to begin anew.
    if (this.state.pending) this.line('pending', TEXT.pending, C, 784, { size: 28, max: 2 * chord(784) - 80, lit: 0.7 });
    this.glyphRow([
      { name: 'tune', label: TEXT.tune },
      { name: 'rules', label: TEXT.rules },
      { name: 'anew', label: TEXT.anew, on: this.state.pending },
      { name: 'back', label: TEXT.back },
    ], 846);
  }

  drawRules() {
    this.line('rulesTitle', TEXT.rulesTitle, C, 170, { size: 44, lit: 0.5 });
    rulesText(this.settings).forEach((text, i) => {
      const y = 246 + i * 52;
      this.line(`r${i}`, text, C, y, { size: 29, max: 2 * chord(y) - 80 });
    });
    this.glyphRow([{ name: 'ways', label: TEXT.ways }, { name: 'back', label: TEXT.back }], 846);
  }

  // The hologram's tuning, on three pages (what you see, how it follows you, your phone): what the
  // camera sees of the eye now, then each value between a step down (touch its left) and a step up
  // (touch its right). The first page begins with the hologram itself, on or off.
  drawTune() {
    const pages = TUNE_PAGES.length;
    this.tunePage = Math.min(this.tunePage, pages - 1);
    this.line('tuneTitle', TEXT.tuneTitle, C, 122, { size: 44, lit: 0.5 });
    this.dots(pages, this.tunePage, 160);
    this.line('tunePage', TUNE_PAGES[this.tunePage], C, 196, { size: 30, lit: 0.45 });
    this.drawReadout();
    const rowAt = (i) => 326 + i * 84;
    let row = 0;
    if (this.tunePage === 0) {
      const y = rowAt(row++);
      const max = Math.min(ROW_MAX, 2 * chord(y + 16) - 90);
      this.line('tune:hologram', TEXT.hologramRow, C, y, { size: 25, max, lit: 0.22 });
      this.line('tune:hologram', this.settings.hologram ? TEXT.hologramRowOn : TEXT.hologramRowOff, C, y + 34, { size: 31, max, lit: 0.62, kind: 'value', key: 'hologram' });
    }
    for (const t of TUNING.filter((x) => x.page === this.tunePage)) {
      const y = rowAt(row++);
      const max = Math.min(ROW_MAX, 2 * chord(y + 16) - 90);
      this.line(`tune:${t.key}`, { v: t.v, s: t.s }, C, y, { size: 25, max, lit: 0.22 });
      const text = tuningText(t, this.settings.holo[t.key]);
      const value = this.line(`tune:${t.key}`, { v: text, s: text }, C, y + 34, { size: 31, max: 400, lit: 0.62, kind: 'value', key: t.key, numerals: true });
      // Chevrons either side: the left half of the row steps down, the right half up.
      for (const side of [-1, 1]) {
        const x = C + side * 240;
        this.cut((g, color) => {
          g.strokeStyle = color;
          g.lineWidth = 4;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(x - side * 8, y + 22);
          g.lineTo(x + side * 6, y + 34);
          g.lineTo(x - side * 8, y + 46);
          g.stroke();
        }, 0.45);
      }
      this.regions.pop(); // the value's own region gives way to the two halves
      const top = value.y;
      this.regions.push({ kind: 'step', id: `step:${t.key}`, key: t.key, by: -1, x: C - 280, y: top, w: 280, h: value.h });
      this.regions.push({ kind: 'step', id: `step:${t.key}+`, key: t.key, by: 1, x: C, y: top, w: 280, h: value.h });
    }
    this.arrows(this.tunePage, pages);
    this.glyphRow([{ name: 'centre', label: TEXT.centre }, { name: 'reset', label: TEXT.reset }, { name: 'back', label: TEXT.back }], 846);
  }

  drawReadout() {
    const lines = this.state.readout ?? [{ v: 'not tracking', s: 'Not tracking' }];
    lines.slice(0, 2).forEach((text, i) => {
      this.line(`readout${i}`, text, C, READOUT.y + 16 + i * 32, { size: 24, max: READOUT.w, lit: 0.4, numerals: true });
    });
  }

  // New live figures on the tuning page: recut just their strip of the carving.
  setReadout(lines) {
    this.state.readout = lines;
    if (this.page !== 'tune' || this.phase !== 'still' || this.dirty) return;
    const { x, y, w, h } = READOUT;
    const { color, mask, glow } = this.carve;
    color.getContext('2d').clearRect(x, y, w, h);
    mask.getContext('2d').clearRect(x, y, w, h);
    const gl = glow.getContext('2d');
    gl.fillStyle = '#000';
    gl.fillRect(x, y, w, h);
    const keep = this.regions;
    this.regions = [];
    this.layer = this.carve;
    const g = [color, mask, glow].map((c) => c.getContext('2d'));
    for (const c of g) {
      c.save();
      c.beginPath();
      c.rect(x, y, w, h);
      c.clip();
    }
    this.drawReadout();
    for (const c of g) c.restore();
    this.regions = keep;
    buildRelief(mask, glow, this.relief, false, { x: x - 4, y: y - 4, w: w + 8, h: h + 8 });
    this.carveColor.needsUpdate = true;
    this.carveRelief.needsUpdate = true;
  }

  // Where a carved region shows on screen (for tests): its centre in CSS pixels.
  screenOf(id, kind) {
    const r = this.regions.find((x) => x.id === id && (!kind || x.kind === kind));
    if (!r) return null;
    const u = (r.x + r.w / 2) / SIZE;
    const v = 1 - (r.y + r.h / 2) / SIZE;
    const local = new THREE.Vector3((2 * u - 1) * MEDALLION_RADIUS, (2 * v - 1) * MEDALLION_RADIUS, 0);
    this.mesh.updateMatrixWorld();
    return this.stage.toScreen(this.mesh.localToWorld(local));
  }

  // --- Touch ---------------------------------------------------------------------------------

  // A tap at CSS pixel (x, y). Returns true if it fell on the underside (and was used).
  tap(x, y) {
    const { stage } = this;
    const ndc = new THREE.Vector2((x / stage.size.width) * 2 - 1, -(y / stage.size.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, stage.camera);
    const hit = this.raycaster.intersectObjects([this.baseMesh, this.mesh], false)[0];
    if (!hit || !this.seen) return false;
    if (hit.object !== this.mesh) {
      // The stone around the medallion: its underside translates too, its sides and basin do not.
      const local = stage.baseRoot.worldToLocal(hit.point.clone());
      if (local.y > -PIVOT.y + 0.06) return false;
      this.translate();
      this.onAction?.('translate');
      return true;
    }
    const px = hit.uv.x * SIZE;
    const py = (1 - hit.uv.y) * SIZE;
    // The most specific region under the finger.
    const region = this.regions.filter((r) => r.kind !== 'line' && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (!region) {
      this.translate();
      this.onAction?.('translate');
    } else if (region.kind === 'value') {
      const option = OPTIONS.find((o) => o.key === region.key);
      const i = option.choices.findIndex(([value]) => value === this.settings[option.key]);
      const next = option.choices[(i + 1) % option.choices.length][0];
      this.settings[option.key] = next;
      this.dirty = true;
      this.onOption?.(option.key, next);
    } else if (region.kind === 'step') {
      const t = TUNING.find((x) => x.key === region.key);
      const i = t.steps.indexOf(this.settings.holo[t.key]);
      const next = t.steps[Math.max(0, Math.min(t.steps.length - 1, i + region.by))];
      if (next !== this.settings.holo[t.key]) {
        this.settings.holo[t.key] = next;
        this.dirty = true;
        this.onTune?.(t.key, next);
      }
    } else if (region.kind === 'button') {
      this.press(region.id);
    }
    return true;
  }

  press(name) {
    const turn = (page) => this.recut(page);
    if (name === 'ways') {
      turn(() => {
        this.page = 'ways';
        this.wayPage = 0;
      });
    } else if (name === 'rules') {
      turn(() => {
        this.page = 'rules';
      });
    } else if (name === 'tune') {
      turn(() => {
        this.page = 'tune';
        this.tunePage = 0;
      });
    } else if (name === 'back') {
      const to = this.page === 'rules' || this.page === 'tune' ? 'ways' : 'main';
      turn(() => {
        this.page = to;
      });
      this.onAction?.('page', to);
      return;
    } else if (name === 'more' || name === 'prev') {
      const by = name === 'more' ? 1 : -1;
      turn(() => {
        if (this.page === 'tune') this.tunePage = Math.max(0, this.tunePage + by);
        else this.wayPage = Math.max(0, this.wayPage + by);
      });
    } else {
      this.onAction?.(name);
      this.dirty = true;
      return;
    }
    this.onAction?.('page');
  }

  // Straight to a page, without recutting (a new game returns to the first).
  show(page) {
    this.page = page;
    this.dirty = true;
  }
}

// The relief (and, for the words, the glow) from a depth mask: the carving is cut into the
// stone, so light catches the lower lip of each stroke and shades the upper. The frame's relief is
// a full normal map; the words' keeps only the slope (red, green) and carries the glow in blue.
// `rect`, in mask pixels, limits the work to a strip.
function buildRelief(mask, glow, out, full, rect = null) {
  const n = NORMAL_SIZE;
  const f = SIZE / n;
  const x0 = rect ? Math.max(0, Math.floor(rect.x / f)) : 0;
  const y0 = rect ? Math.max(0, Math.floor(rect.y / f)) : 0;
  const x1 = rect ? Math.min(n, Math.ceil((rect.x + rect.w) / f)) : n;
  const y1 = rect ? Math.min(n, Math.ceil((rect.y + rect.h) / f)) : n;
  const w = x1 - x0;
  const h = y1 - y0;
  const scratch = buildRelief.scratch ??= canvasOf(n).getContext('2d', { willReadFrequently: true });
  scratch.clearRect(0, 0, n, n);
  scratch.drawImage(mask, 0, 0, n, n);
  const src = scratch.getImageData(x0, y0, w, h).data;
  let light = null;
  if (glow) {
    scratch.clearRect(0, 0, n, n);
    scratch.drawImage(glow, 0, 0, n, n);
    light = scratch.getImageData(x0, y0, w, h).data;
  }
  const depth = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) depth[i] = src[i * 4 + 3] / 255;
  // Soften the walls a little.
  const soft = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      soft[i] = x > 0 && x < w - 1 && y > 0 && y < h - 1
        ? (depth[i] * 4 + depth[i - 1] + depth[i + 1] + depth[i - w] + depth[i + w]) / 8
        : depth[i];
    }
  }
  const g = out.getContext('2d');
  const img = g.createImageData(w, h);
  const k = 2.6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = x > 0 && x < w - 1 ? soft[i + 1] - soft[i - 1] : 0;
      const dy = y > 0 && y < h - 1 ? soft[i + w] - soft[i - w] : 0;
      // Height is minus depth; v runs up the texture while canvas rows run down.
      let nx = dx * k;
      let ny = -dy * k;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      img.data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i * 4 + 2] = full ? Math.round((0.5 / len + 0.5) * 255) : light ? light[i * 4] : 0;
      img.data[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, x0, y0);
}

// The glyphs, drawn about their centre.
const GLYPHS = {
  ways(g) {
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 10, 0, Math.PI * 2);
    g.stroke();
  },
  test(g) {
    g.beginPath();
    g.arc(0, 0, 29, Math.PI * 0.35, Math.PI * 2.05);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 15, Math.PI * 1.35, Math.PI * 3.05);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 4.5, 0, Math.PI * 2);
    g.fill();
  },
  lens(g) {
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 11, 0, Math.PI * 2);
    g.fill();
  },
  anew(g) {
    g.beginPath();
    g.arc(0, 0, 30, Math.PI * 0.62, Math.PI * 2.38);
    g.stroke();
    g.beginPath();
    g.moveTo(-17, 22);
    g.lineTo(-11, 31);
    g.lineTo(-21, 35);
    g.stroke();
  },
  rules(g) {
    for (const [y, w] of [[-16, 26], [0, 20], [16, 24]]) {
      g.beginPath();
      g.moveTo(-w, y);
      g.lineTo(w, y);
      g.stroke();
    }
  },
  back(g) {
    g.beginPath();
    g.arc(4, 0, 22, Math.PI * 0.5, Math.PI * 1.5, true);
    g.stroke();
    g.beginPath();
    g.moveTo(-6, -32);
    g.lineTo(6, -22);
    g.lineTo(-6, -12);
    g.stroke();
  },
  // The lens, with the lines of sight that tune it.
  tune(g) {
    g.beginPath();
    g.arc(0, 0, 13, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      g.beginPath();
      g.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
      g.lineTo(Math.cos(a) * 31, Math.sin(a) * 31);
      g.stroke();
    }
  },
  centre(g) {
    g.beginPath();
    g.arc(0, 0, 22, 0, Math.PI * 2);
    g.stroke();
    for (const [x, y] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      g.beginPath();
      g.moveTo(x * 12, y * 12);
      g.lineTo(x * 32, y * 32);
      g.stroke();
    }
  },
  reset(g) {
    g.beginPath();
    g.arc(0, 0, 28, Math.PI * 0.2, Math.PI * 1.8);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 4.5, 0, Math.PI * 2);
    g.fill();
  },
};
