// Nothing is written on the screen. Everything the kal-toh says is carved into the underside of
// its stone base, in a medallion: its name, the players, what last happened, how to play, and
// the glyphs that act - the ways to play, beginning anew. Turn the base over to read it:
// whichever way it is tipped, the carving is found with its top up.
//
// It is carved in Vulcan. The Starfleet delta among the glyphs translates all of it: the carving
// smooths away to bare stone, and the other script is cut in its place, as deep. Within its
// framing circle the carving is for touching - glyphs, values, and sliders drawn along their
// grooves - and the stone is turned by its rim (input.js).
//
// The medallion's frame is cut into the stone for good. Its words and glyphs are a second layer
// whose depth the shader can scale (relief and darkened grooves alike), so they can be smoothed
// away and recut. All of it is engraved alike: dark grooves in the stone, without light of their own.
import * as THREE from '../vendor/three.module.min.js';
import { PIVOT } from './scene.js';
import { OPTIONS } from './settings.js';
import { TEXT, vulcanOnly, scoreText, formText, rulesText, seatText } from './texts.js';

const SIZE = 1024;
const C = SIZE / 2;
const NORMAL_SIZE = 512;
export const MEDALLION_RADIUS = 0.8; // in the base's own units, inside its foot
const STANDARD_FONT = "'Roboto', 'Helvetica Neue', system-ui, sans-serif";
const GLYPHS_Y = 784; // the row of glyphs at the foot of every page, their names beneath, clear of the frame
const PAGE_HEIGHT = 510; // texture pixels of rows on a page of the ways
const ARROW_Y = 466; // where the page arrows are cut, either side
const ROW_MAX = 680; // the widest a row may be cut, clear of the arrows
const RELIEF = 1.4; // the normal maps' strength at full depth
const SMOOTH = 0.32; // seconds for the carving to smooth away ...
const RECUT = 0.42; // ... and to be cut again
// How squarely the underside must face the eye to count as seen (and so be set upright).
const SEEN = 0.08;
const UNSEEN = 0.02;
// Each seat's colour, as the light behind turns on their turn (main.js), painted into the ring about
// their mark.
const SEAT_PAINT = ['#d0261c', '#14a04a', '#2a64e0', '#e0a614'];

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
  constructor(stage, { settings, stone, baseMesh, onAction, onOption }) {
    this.stage = stage;
    this.settings = settings;
    this.baseMesh = baseMesh;
    this.onAction = onAction;
    this.onOption = onOption;

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
    this.standard = settings.language === 'standard'; // which script is cut now
    this.state = { game: null, event: TEXT.begin };
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
    this.facingNow = facing;
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
    this.drawPage();
    buildRelief(mask, glow, this.relief, false);
    this.carveColor.needsUpdate = true;
    this.carveRelief.needsUpdate = true;
  }

  drawPage() {
    if (this.page === 'ways') this.drawWays();
    else if (this.page === 'rules') this.drawRules();
    else this.drawMain();
  }

  // Cut into a layer: the stone (a faint worn lip and a black groove) and the depth mask (for the
  // relief). Frame, words and glyphs alike are engraved black; none of them carries light of its
  // own (`lit`, from when they did, is let be).
  cut(draw, lit) {
    const { color, mask } = this.layer;
    const g = color.getContext('2d');
    g.save();
    g.translate(1.6, 1.6);
    draw(g, 'rgba(255, 240, 230, 0.22)');
    g.restore();
    draw(g, 'rgba(10, 6, 5, 0.9)');
    draw(mask.getContext('2d'), '#fff');
  }

  // Paint laid into a shallow groove: its colour, flush in the stone, without the cut's lip or glow.
  paint(draw) {
    const { color, mask } = this.layer;
    const g = mask.getContext('2d');
    g.save();
    g.globalAlpha = 0.45;
    draw(g);
    g.restore();
    draw(color.getContext('2d'));
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
  // letters whatever the script (the Vulcan fonts have no digits), as does `always` (what must be
  // read by everyone, Vulcan or not).
  line(id, text, x, y, { size = 32, script = false, max = 760, lit = 0.32, kind = 'line', key, numerals = false, always = false } = {}) {
    const standard = this.standard || numerals || always;
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
  glyph(name, x, y, label, { lit = 0.4, on = false, standard = false } = {}) {
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
      // On (a new game waiting to begin): a ring cut round it.
      if (on) {
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, 45, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }, lit);
    this.regions.push({ kind: 'button', id: name, x: x - 52, y: y - 52, w: 104, h: 96 });
    if (label) this.line(`g:${name}`, label, x, y + 62, { size: 22, max: 132, lit: 0.26, always: standard });
  }

  glyphRow(items, y) {
    const gap = items.length > 4 ? 124 : 150;
    items.forEach((item, i) => {
      const x = C + (i - (items.length - 1) / 2) * gap;
      this.glyph(item.name, x, y, item.label, item);
    });
  }

  // A slider: a groove from silent to full, a knob where the value is, and the value in numerals
  // beyond. Touching anywhere along it, or drawing a finger along it, sets the value.
  slider(key, x, y, width) {
    const value = Math.max(0, Math.min(1, this.settings[key] ?? 0));
    const x0 = x - width / 2;
    const x1 = x + width / 2;
    const at = x0 + (x1 - x0) * value;
    this.cut((g, color) => {
      g.strokeStyle = color;
      g.lineCap = 'round';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x1, y);
      g.stroke();
      // Ticks at silent, half and full.
      for (const t of [0, 0.5, 1]) {
        g.beginPath();
        g.moveTo(x0 + (x1 - x0) * t, y - 10);
        g.lineTo(x0 + (x1 - x0) * t, y + 10);
        g.stroke();
      }
    }, 0.3);
    this.cut((g, color) => {
      // The groove filled as far as the value, and the knob.
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineCap = 'round';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(at, y);
      g.stroke();
      g.beginPath();
      g.arc(at, y, 14, 0, Math.PI * 2);
      g.fill();
    }, 0.75);
    const text = `${Math.round(value * 100)}%`;
    this.line(`slider:${key}:value`, { v: text, s: text }, x1 + 62, y, { size: 26, max: 90, lit: 0.5, numerals: true });
    this.regions.push({ kind: 'slider', id: `slider:${key}`, key, x: x0 - 30, y: y - 34, w: x1 - x0 + 60, h: 68, x0, x1, y0: y });
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
    this.line('title', TEXT.title, C, 142, { size: 92, script: true, max: 480, lit: 0.55 });
    // The players: a mark each (a diamond for a Vulcan), filled for whose turn it is, in a ring
    // painted their colour, and a score. With others at the board, each seat is named over its
    // mark and its plays are marked beneath.
    const seats = this.state.seats ?? game?.players.map((p, i) => ({ vulcan: p.vulcan, now: i === game.current && !game.over, score: scoreText(game, p) })) ?? [];
    const plays = this.state.plays ?? [];
    const named = seats.length > 1;
    const y = named ? 226 : 200;
    seats.forEach((seat, i) => {
      const x = C + (i - (seats.length - 1) / 2) * 150;
      if (named) this.line(`name${i}`, seatText(i, seat.vulcan), x, 190, { size: 27, max: 140, lit: seat.now ? 0.5 : 0.24 });
      this.paint((g) => {
        g.strokeStyle = SEAT_PAINT[i % SEAT_PAINT.length];
        g.lineWidth = 6;
        g.beginPath();
        g.arc(x, y, 18, 0, Math.PI * 2);
        g.stroke();
      });
      this.cut((g, color) => {
        g.fillStyle = color;
        g.strokeStyle = color;
        g.lineWidth = 3;
        g.beginPath();
        if (seat.vulcan) {
          g.moveTo(x, y - 11);
          g.lineTo(x + 11, y);
          g.lineTo(x, y + 11);
          g.lineTo(x - 11, y);
          g.closePath();
        } else {
          g.arc(x, y, 10, 0, Math.PI * 2);
        }
        if (seat.now) g.fill();
        else g.stroke();
      }, seat.now ? 0.95 : 0.3);
      this.line(`seat${i}`, seat.score, x, y + 34, { size: 30, max: 140, lit: seat.now ? 0.6 : 0.28 });
      if (named) this.playMarks(plays.filter((p) => p.player === i).map((p) => p.mark), x, y + 62, seat.now);
    });
    if (this.state.zen) this.zenProgress(this.state.zen);
    this.line('event', event, C, 352, { size: 38, max: 2 * chord(352) - 90, lit: 0.6 });
    const lines = this.state.lines ?? [TEXT.lift, TEXT.touch, TEXT.ring, TEXT.hold, formText(this.settings.form), TEXT.turn, TEXT.shake, TEXT.rim];
    lines.forEach((text, i) => {
      const y = 398 + i * 44;
      this.line(`l${i}`, text, C, y, { size: 30, max: 2 * chord(y) - 80 });
    });
    this.glyphRow([
      { name: 'ways', label: TEXT.ways },
      // Its name is carved in Standard in either script: it is how a reader of Standard finds it.
      { name: 'translate', label: TEXT.translateGlyph, standard: true },
      { name: 'anew', label: TEXT.anew, on: this.state.pending },
    ], GLYPHS_Y);
  }

  // A player's plays, in order, as small marks beneath their seat (see MARKS): rows of seven, the
  // latest twenty-one.
  playMarks(marks, x, y, now) {
    marks.slice(-21).forEach((mark, i) => {
      const mx = x + ((i % 7) - 3) * 18;
      const my = y + Math.floor(i / 7) * 18;
      this.cut((g, color) => MARKS[mark]?.(g, mx, my, color), now ? 0.75 : 0.4);
    });
  }

  // Zen keeps no seats: where they would be, its progress. A ringed dot for each of its forms taken
  // (a bare ring for each still to come), and beneath, a dot for each t'an placed toward the next.
  zenProgress({ forms, taken, placed, per, complete }) {
    const row = (count, done, y, gap, size, mark) => {
      for (let i = 0; i < count; i++) {
        const x = C + (i - (count - 1) / 2) * gap;
        const on = i < done;
        this.cut((g, color) => {
          g.save();
          g.translate(x, y);
          g.scale(size, size);
          if (on) {
            MARKS[mark](g, 0, 0, color);
          } else {
            g.strokeStyle = color;
            g.lineWidth = 1.4;
            g.beginPath();
            g.arc(0, 0, mark === 'ring' ? 7 : 4.6, 0, Math.PI * 2);
            g.stroke();
          }
          g.restore();
        }, on ? 0.8 : 0.3);
      }
    };
    row(forms, taken, 210, 50, 2.1, 'ring');
    if (!complete) row(per, placed, 262, 27, 1.3, 'join');
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
      const h = o.slider ? 80 : o.choices.some((c) => c[3]) ? 106 : 80;
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
    this.line('waysTitle', TEXT.waysTitle, C, 140, { size: 44, lit: 0.5 });
    this.dots(pages.length, this.wayPage, 184);
    let y = 228;
    for (const o of pages[this.wayPage]) {
      const max = Math.min(ROW_MAX, 2 * chord(y + 16) - 90);
      if (o.slider) {
        // Its name, and beneath it a groove to draw the finger along.
        this.line(`row:${o.key}`, { v: o.v, s: o.s }, C, y, { size: 25, max, lit: 0.22 });
        this.slider(o.key, C, y + 40, Math.min(420, max - 150));
        y += 80;
        continue;
      }
      const choice = o.choices.find(([value]) => value === this.settings[o.key]) ?? o.choices[0];
      // The name of the way, its value beneath (touch to change), and what that means.
      this.line(`row:${o.key}`, { v: o.v, s: o.s }, C, y, { size: 25, max, lit: 0.22 });
      this.line(`row:${o.key}`, { v: choice[1], s: choice[2] }, C, y + 32, { size: 31, max, lit: 0.62, kind: 'value', key: o.key });
      if (choice[3]) this.line(`hint:${o.key}`, choice[3], C, y + 63, { size: 26, max, lit: 0.36 });
      y += o.choices.some((c) => c[3]) ? 106 : 80;
    }
    this.arrows(this.wayPage, pages.length);
    // Ways that shape the game wait for it to begin anew.
    if (this.state.pending) this.line('pending', TEXT.pending, C, 738, { size: 28, max: 2 * chord(738) - 80, lit: 0.7 });
    this.glyphRow([
      { name: 'rules', label: TEXT.rules },
      { name: 'anew', label: TEXT.anew, on: this.state.pending },
      { name: 'back', label: TEXT.back },
    ], GLYPHS_Y);
  }

  drawRules() {
    this.line('rulesTitle', TEXT.rulesTitle, C, 150, { size: 44, lit: 0.5 });
    rulesText(this.settings).forEach((text, i) => {
      const y = 214 + i * 46;
      this.line(`r${i}`, text, C, y, { size: 28, max: 2 * chord(y) - 80 });
    });
    // What the marks beneath each seat mean (in zen, which has no seats, the marks of its progress;
    // nothing falls there).
    const legend = this.settings.way === 'zen' ? [['ring', TEXT.markForm], ['join', TEXT.markPlaced]]
      : this.settings.way === 'rings' ? [['join', TEXT.markPlaced], ['ring', TEXT.markRing], ['fall', TEXT.markFell]]
      : [['join', TEXT.markJoined], ['ring', this.settings.way === 'forms' ? TEXT.markLoop : TEXT.markHoop], ['fall', TEXT.markFell]];
    legend.forEach(([mark, label], i) => {
      const x = C + (i - (legend.length - 1) / 2) * 168;
      this.cut((g, color) => MARKS[mark](g, x - 52, 690, color), 0.6);
      this.line(`legend${i}`, label, x + 8, 690, { size: 24, max: 104, lit: 0.36 });
    });
    this.glyphRow([{ name: 'ways', label: TEXT.ways }, { name: 'back', label: TEXT.back }], GLYPHS_Y);
  }

  // Recut one strip of the carving as it now stands (the page drawn again within it), quickly,
  // without smoothing it away: a slider being drawn along.
  recutStrip({ x, y, w, h }) {
    if (this.phase !== 'still' || this.dirty) {
      this.dirty = true;
      return;
    }
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
    this.drawPage();
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

  // The point of the carving under CSS pixel (x, y), in canvas pixels, if the carving is what is
  // seen there (in front of the stone, its face to the eye).
  pointAt(x, y) {
    const { stage } = this;
    const ndc = new THREE.Vector2((x / stage.size.width) * 2 - 1, -(y / stage.size.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, stage.camera);
    const hit = this.raycaster.intersectObjects([this.baseMesh, this.mesh], false)[0];
    if (!hit || hit.object !== this.mesh) return null;
    return { px: hit.uv.x * SIZE, py: (1 - hit.uv.y) * SIZE };
  }

  // Is a finger within the framing circle of a carving that faces the eye? There it touches the
  // carving, and turns nothing.
  covers(x, y) {
    return this.seen && (this.facingNow ?? 0) > 0.25 && this.pointAt(x, y) !== null;
  }

  // The most specific region under a canvas point.
  regionAt(px, py, kinds) {
    return this.regions.filter((r) => kinds.includes(r.kind) && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;
  }

  // The slider under a finger, if any.
  sliderAt(x, y) {
    if (!this.covers(x, y) || this.phase === 'smoothing') return null;
    const at = this.pointAt(x, y);
    return at ? this.regionAt(at.px, at.py, ['slider']) : null;
  }

  // A finger on a slider: its value follows the finger along the groove.
  slide(region, x, y) {
    const at = this.pointAt(x, y);
    if (!at) return;
    const value = Math.round(Math.max(0, Math.min(1, (at.px - region.x0) / (region.x1 - region.x0))) * 100) / 100;
    if (value === this.settings[region.key]) return;
    this.settings[region.key] = value;
    this.onOption?.(region.key, value);
    this.recutStrip({ x: region.x - 10, y: region.y, w: region.w + 140, h: region.h });
  }

  // A tap at CSS pixel (x, y). Returns true if it fell on the carving (and was used).
  tap(x, y) {
    if (!this.seen) return false;
    const at = this.pointAt(x, y);
    if (!at) return false;
    const { px, py } = at;
    const region = this.regionAt(px, py, ['value', 'button', 'slider']);
    if (!region) return true;
    if (region.kind === 'value') {
      const option = OPTIONS.find((o) => o.key === region.key);
      const i = option.choices.findIndex(([value]) => value === this.settings[option.key]);
      const next = option.choices[(i + 1) % option.choices.length][0];
      this.settings[option.key] = next;
      this.dirty = true;
      this.onOption?.(option.key, next);
    } else if (region.kind === 'slider') {
      this.slide(region, x, y);
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
    } else if (name === 'back') {
      const to = this.page === 'rules' ? 'ways' : 'main';
      turn(() => {
        this.page = to;
      });
      this.onAction?.('page', to);
      return;
    } else if (name === 'translate') {
      this.translate();
      this.onAction?.('translate');
      return;
    } else if (name === 'more' || name === 'prev') {
      const by = name === 'more' ? 1 : -1;
      turn(() => {
        this.wayPage = Math.max(0, this.wayPage + by);
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
// The marks of the plays under each seat: a dot for a true join (or a t'an placed), a ringed dot
// for a ring or a great hoop, a cross where t'an fell.
const MARKS = {
  join(g, x, y, color) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, 4.6, 0, Math.PI * 2);
    g.fill();
  },
  ring(g, x, y, color) {
    g.fillStyle = color;
    g.strokeStyle = color;
    g.beginPath();
    g.arc(x, y, 3.2, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.stroke();
  },
  fall(g, x, y, color) {
    g.strokeStyle = color;
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - 5, y - 5);
    g.lineTo(x + 5, y + 5);
    g.moveTo(x + 5, y - 5);
    g.lineTo(x - 5, y + 5);
    g.stroke();
  },
};

const GLYPHS = {
  ways(g) {
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 10, 0, Math.PI * 2);
    g.stroke();
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
  // Starfleet's delta: an arrowhead, its sides gently bowed, its foot cut back in an arc, and a
  // star at its heart. It translates the carving.
  translate(g) {
    g.beginPath();
    g.moveTo(0, -37);
    g.quadraticCurveTo(12, -4, 25, 33);
    g.quadraticCurveTo(0, 12, -25, 33);
    g.quadraticCurveTo(-12, -4, 0, -37);
    g.closePath();
    g.stroke();
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 3.2 : 9;
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, 6 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  },
};
