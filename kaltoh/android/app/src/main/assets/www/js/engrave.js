// Nothing is written on the screen. Everything the kal-toh says is carved into the underside of
// its stone base, in a medallion: its name, the players, what last happened, how to play, and
// the glyphs that act - the ways to play, testing the spin, the hologram, beginning anew. Turn
// the base over to read it. Every line is carved in Vulcan; touch a line and it reads in
// Standard, touch it again and it is Vulcan once more.
import * as THREE from '../vendor/three.module.min.js';
import { PIVOT } from './scene.js';
import { OPTIONS } from './settings.js';
import { TEXT, vulcanOnly, scoreText, formText, rulesText } from './texts.js';

const SIZE = 1024;
const C = SIZE / 2;
const NORMAL_SIZE = 512;
export const MEDALLION_RADIUS = 0.8; // in the base's own units, inside its foot
const STANDARD_FONT = "'Roboto', 'Helvetica Neue', system-ui, sans-serif";
const ROWS_PER_PAGE = 6;

const canvasOf = (size) => {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
};
// Half the medallion's width at a given height on the canvas.
const chord = (y) => Math.sqrt(Math.max(0, (C - 34) ** 2 - (y - C) ** 2));
const textUp = new THREE.Vector3();
const eyeUp = new THREE.Vector3();
const across = new THREE.Vector3();

export class Engraving {
  constructor(stage, { settings, native, stone, baseMesh, onAction, onOption }) {
    this.stage = stage;
    this.settings = settings;
    this.native = native;
    this.baseMesh = baseMesh;
    this.onAction = onAction;
    this.onOption = onOption;
    this.canvas = canvasOf(SIZE);
    this.mask = canvasOf(SIZE);
    this.glow = canvasOf(SIZE);
    this.normalCanvas = canvasOf(NORMAL_SIZE);
    this.background = this.makeBackground(stone);

    const map = new THREE.CanvasTexture(this.canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const normalMap = new THREE.CanvasTexture(this.normalCanvas);
    normalMap.colorSpace = THREE.NoColorSpace;
    const emissiveMap = new THREE.CanvasTexture(this.glow);
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    this.textures = [map, normalMap, emissiveMap];
    const material = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      emissiveMap,
      // The carving holds a faint light, as a Vulcan inlay would, so it reads in the stone's shadow.
      emissive: new THREE.Color(0x9fd2ff),
      emissiveIntensity: 0.5,
      roughness: 0.86,
      metalness: 0,
    });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(MEDALLION_RADIUS, 96), material);
    // Facing down, just proud of the foot; its top edge toward the base's front.
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.y = -PIVOT.y - 0.0025;
    this.mesh.receiveShadow = true;
    stage.baseRoot.add(this.mesh);

    this.page = 'main';
    this.wayPage = 0;
    this.flipped = new Set(); // lines shown in the other script
    this.state = { game: null, event: TEXT.begin, hologram: false, testAllowed: true };
    this.regions = [];
    this.dirty = true;
    this.raycaster = new THREE.Raycaster();
  }

  // Lines read in Standard if the game is set to Standard, unless touched (and vice versa).
  standard(id) {
    return (this.settings.language === 'standard') !== this.flipped.has(id);
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

  // How far the stone must turn about its own axis for the carving to read upright to the eye:
  // that axis (world, out of the carving) goes into `axis`; the signed angle is returned.
  upright(camera, axis) {
    const q = this.stage.baseRoot.quaternion;
    axis.set(0, -1, 0).applyQuaternion(q);
    textUp.set(0, 0, 1).applyQuaternion(q); // the canvas's top, as the medallion lies in the stone
    eyeUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    eyeUp.addScaledVector(axis, -eyeUp.dot(axis));
    if (eyeUp.lengthSq() < 1e-8) return 0;
    eyeUp.normalize();
    return Math.atan2(across.crossVectors(textUp, eyeUp).dot(axis), textUp.dot(eyeUp));
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
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, SIZE, SIZE);
    g.drawImage(this.background, 0, 0);
    for (const c of [this.mask, this.glow]) {
      const x = c.getContext('2d');
      x.clearRect(0, 0, SIZE, SIZE);
      if (c === this.glow) {
        x.fillStyle = '#000';
        x.fillRect(0, 0, SIZE, SIZE);
      }
    }
    this.regions = [];
    this.ring(C - 12, 7, 0.2);
    this.ring(C - 30, 2.5, 0.25);
    if (this.page === 'ways') this.drawWays();
    else if (this.page === 'rules') this.drawRules();
    else this.drawMain();
    this.buildNormals();
    for (const t of this.textures) t.needsUpdate = true;
  }

  // Cut into all three layers: the stone (a bright lower lip and a dark groove), the depth mask
  // (for the normal map), and the glow.
  cut(draw, lit) {
    const g = this.canvas.getContext('2d');
    g.save();
    g.translate(1.6, 1.6);
    draw(g, 'rgba(255, 240, 230, 0.42)');
    g.restore();
    draw(g, 'rgba(46, 20, 16, 0.84)');
    draw(this.mask.getContext('2d'), '#fff');
    if (lit > 0) draw(this.glow.getContext('2d'), `rgba(255, 255, 255, ${lit})`);
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

  // A line of text, centred at (x, y), fitted into `max` pixels. Touching it translates it.
  line(id, text, x, y, { size = 32, script = false, max = 760, lit = 0.32, kind = 'line', key } = {}) {
    const standard = this.standard(id);
    const str = standard ? text.s : vulcanOnly(text.v);
    if (!str) return;
    const family = standard ? STANDARD_FONT : script ? "'VulcanScript'" : "'ModernVulcan'";
    const weight = standard ? 400 : 400;
    let px = standard ? size * (script ? 0.55 : 0.82) : size;
    const g = this.canvas.getContext('2d');
    g.font = `${weight} ${px}px ${family}`;
    let w = g.measureText(str).width;
    if (w > max) {
      px *= max / w;
      w = max;
    }
    const font = `${weight} ${px}px ${family}`;
    const x0 = x - w / 2;
    this.cut((c, color) => {
      c.font = font;
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillStyle = color;
      c.fillText(str, x0, y);
    }, lit);
    const h = Math.max(px * 1.5, 44);
    this.regions.push({ kind, id, key, x: x0 - 14, y: y - h / 2, w: w + 28, h });
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

  drawMain() {
    const { game, event } = this.state;
    this.line('title', TEXT.title, C, 168, { size: 96, script: true, max: 640, lit: 0.55 });
    if (game) {
      const n = game.players.length;
      game.players.forEach((p, i) => {
        const x = C + (i - (n - 1) / 2) * 150;
        const now = i === game.current && !game.over;
        this.cut((g, color) => {
          g.fillStyle = color;
          g.strokeStyle = color;
          g.lineWidth = 3;
          g.beginPath();
          if (p.vulcan) {
            g.moveTo(x, 244);
            g.lineTo(x + 11, 255);
            g.lineTo(x, 266);
            g.lineTo(x - 11, 255);
            g.closePath();
          } else {
            g.arc(x, 255, 10, 0, Math.PI * 2);
          }
          if (now) g.fill();
          else g.stroke();
        }, now ? 0.95 : 0.3);
        this.line(`seat${i}`, scoreText(game, p), x, 290, { size: 24, max: 140, lit: now ? 0.6 : 0.28 });
      });
    }
    this.line('event', event, C, 346, { size: 40, max: 2 * chord(346) - 90, lit: 0.6 });
    const lines = [TEXT.lift, TEXT.touch, TEXT.ring, TEXT.hold, formText(this.settings.form), TEXT.turn, TEXT.shake, TEXT.translate];
    lines.forEach((text, i) => {
      const y = 412 + i * 50;
      this.line(`l${i}`, text, C, y, { size: 31, max: 2 * chord(y) - 80 });
    });
    const glyphs = [{ name: 'ways', label: TEXT.ways }];
    if (this.state.testAllowed) glyphs.push({ name: 'test', label: TEXT.test });
    if (this.native) glyphs.push({ name: 'lens', label: TEXT.lens, on: this.state.hologram });
    glyphs.push({ name: 'anew', label: TEXT.anew });
    this.glyphRow(glyphs, 846);
  }

  visibleOptions() {
    return OPTIONS.filter((o) => (!o.when || o.when(this.settings)) && (!o.native || this.native));
  }

  drawWays() {
    const options = this.visibleOptions();
    const pages = Math.ceil(options.length / ROWS_PER_PAGE);
    this.wayPage = Math.min(this.wayPage, pages - 1);
    this.line('waysTitle', TEXT.waysTitle, C, 164, { size: 44, lit: 0.5 });
    for (let i = 0; i < pages; i++) {
      const x = C + (i - (pages - 1) / 2) * 26;
      const on = i === this.wayPage;
      this.cut((g, color) => {
        g.fillStyle = color;
        g.beginPath();
        g.arc(x, 210, on ? 6 : 4, 0, Math.PI * 2);
        g.fill();
      }, on ? 0.9 : 0.25);
    }
    options.slice(this.wayPage * ROWS_PER_PAGE, (this.wayPage + 1) * ROWS_PER_PAGE).forEach((o, i) => {
      const y = 268 + i * 86;
      const max = 2 * chord(y + 16) - 90;
      const id = `row:${o.key}`;
      const choice = o.choices.find(([value]) => value === this.settings[o.key]) ?? o.choices[0];
      // The name of the way (touch to translate), and its value beneath (touch to change).
      this.line(id, { v: o.v, s: o.s }, C, y, { size: 25, max, lit: 0.22 });
      this.line(id, { v: choice[1], s: choice[2] }, C, y + 34, { size: 31, max, lit: 0.62, kind: 'value', key: o.key });
    });
    const glyphs = [];
    if (this.wayPage > 0) glyphs.push({ name: 'prev', label: TEXT.back });
    if (this.wayPage < pages - 1) glyphs.push({ name: 'more', label: TEXT.more });
    glyphs.push({ name: 'rules', label: TEXT.rules }, { name: 'anew', label: TEXT.anew }, { name: 'back', label: TEXT.back });
    this.glyphRow(glyphs, 846);
  }

  drawRules() {
    this.line('rulesTitle', TEXT.rulesTitle, C, 170, { size: 44, lit: 0.5 });
    rulesText(this.settings).forEach((text, i) => {
      const y = 246 + i * 52;
      this.line(`r${i}`, text, C, y, { size: 29, max: 2 * chord(y) - 80 });
    });
    this.glyphRow([{ name: 'ways', label: TEXT.ways }, { name: 'back', label: TEXT.back }], 846);
  }

  // A normal map from the depth mask: the carving is cut into the stone, so light catches the
  // lower lip of each stroke and shades the upper.
  buildNormals() {
    const n = NORMAL_SIZE;
    const g = this.normalCanvas.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, n, n);
    g.drawImage(this.mask, 0, 0, n, n);
    const src = g.getImageData(0, 0, n, n);
    const depth = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) depth[i] = src.data[i * 4 + 3] / 255;
    // Soften the walls a little.
    const soft = new Float32Array(n * n);
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        soft[i] = (depth[i] * 4 + depth[i - 1] + depth[i + 1] + depth[i - n] + depth[i + n]) / 8;
      }
    }
    const out = g.createImageData(n, n);
    const k = 2.6;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const dx = x > 0 && x < n - 1 ? soft[i + 1] - soft[i - 1] : 0;
        const dy = y > 0 && y < n - 1 ? soft[i + n] - soft[i - n] : 0;
        // Height is minus depth; v runs up the texture while canvas rows run down.
        let nx = dx * k;
        let ny = -dy * k;
        const len = Math.hypot(nx, ny, 1);
        nx /= len;
        ny /= len;
        out.data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
        out.data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        out.data[i * 4 + 2] = Math.round((0.5 / len + 0.5) * 255);
        out.data[i * 4 + 3] = 255;
      }
    }
    g.putImageData(out, 0, 0);
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

  // A tap at CSS pixel (x, y). Returns true if it fell on the medallion (and was used).
  tap(x, y) {
    const { stage } = this;
    const ndc = new THREE.Vector2((x / stage.size.width) * 2 - 1, -(y / stage.size.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, stage.camera);
    const hits = this.raycaster.intersectObjects([this.baseMesh, this.mesh], false);
    if (!hits.length || hits[0].object !== this.mesh || !hits[0].uv) return false;
    const px = hits[0].uv.x * SIZE;
    const py = (1 - hits[0].uv.y) * SIZE;
    // The most specific region under the finger (a value before the name of its way).
    const region = this.regions.filter((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (!region) return true;
    if (region.kind === 'line') {
      if (this.flipped.has(region.id)) this.flipped.delete(region.id);
      else this.flipped.add(region.id);
      this.dirty = true;
      this.onAction?.('translate');
    } else if (region.kind === 'value') {
      const option = OPTIONS.find((o) => o.key === region.key);
      const i = option.choices.findIndex(([value]) => value === this.settings[option.key]);
      const next = option.choices[(i + 1) % option.choices.length][0];
      this.settings[option.key] = next;
      this.dirty = true;
      this.onOption?.(option.key, next);
    } else if (region.kind === 'button') {
      this.press(region.id);
    }
    return true;
  }

  press(name) {
    if (name === 'ways') {
      this.page = 'ways';
      this.wayPage = 0;
    } else if (name === 'rules') {
      this.page = 'rules';
    } else if (name === 'back') {
      this.page = this.page === 'rules' ? 'ways' : 'main';
    } else if (name === 'more') {
      this.wayPage += 1;
    } else if (name === 'prev') {
      this.wayPage = Math.max(0, this.wayPage - 1);
    } else {
      this.onAction?.(name);
    }
    this.dirty = true;
    if (['ways', 'rules', 'back', 'more', 'prev'].includes(name)) this.onAction?.('page');
  }
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
  more(g) {
    g.beginPath();
    g.moveTo(-9, -22);
    g.lineTo(13, 0);
    g.lineTo(-9, 22);
    g.stroke();
  },
  prev(g) {
    g.beginPath();
    g.moveTo(9, -22);
    g.lineTo(-13, 0);
    g.lineTo(9, 22);
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
};
