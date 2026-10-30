// Nothing is written on the screen. Everything the kal-toh says is carved into the underside of
// its stone base, in a medallion, all on one face: its name and the shape the game builds, the
// players and whose turn it is, what last happened, the ways to play (the game first), the base,
// the room, the sound, the voice, the music and vibration, and the glyphs that act - the rules,
// translating, and beginning anew (Shake). Turn the base over to read it: whichever way it is
// tipped, the carving is found with its top up.
//
// It is carved in Standard at first. The Starfleet delta among the glyphs translates all of it: the
// carving smooths away to bare stone, and the other script (Vulcan) is cut in its place, as deep;
// it reads in that script from then on, until translated again. Within its framing circle the
// carving is for touching - glyphs, values, and sliders drawn along their grooves - and the stone
// is turned by its rim (input.js).
//
// The medallion's frame is cut into the stone for good. Its words and glyphs are a second layer
// whose depth the shader can scale (relief and darkened grooves alike), so they can be smoothed
// away and recut. All of it is engraved alike: dark grooves in the stone (frosted pale in an
// obsidian base's black glass), without light of their own, their walls crisp - the words' relief
// found by the shader itself, at each pixel, from the depth cut at the canvas's full resolution.
import * as THREE from '../vendor/three.module.min.js';
import { PIVOT } from './scene.js';
import { OPTIONS, UNSHAPING } from './settings.js';
import { TEXT, vulcanOnly, rulesText, playerText } from './texts.js';

const SIZE = 1024;
const C = SIZE / 2;
// How steep a groove's walls are, from its depth across a pixel either side; and, for the words,
// how far either side the shader looks (in canvas pixels): a little more than one, so a wall is
// wide enough to catch the light and still crisp.
const STEEP = 2.6;
const WALL = 1.5;
const WALL_STEEP = 3.4;
export const MEDALLION_RADIUS = 0.8; // in the base's own units, inside its foot
const STANDARD_FONT = "'Roboto', 'Helvetica Neue', system-ui, sans-serif";
// The face, top to bottom (texture pixels): the name and the shape the game builds, the players
// (their marks; their names above and scores and plays beneath), what just happened, a rule, the
// ways, the glyphs.
const TITLE_Y = 92;
const SHAPE_Y = 138;
const SEATS_Y = 212;
const EVENT_Y = 340;
const RULE_Y = 400;
const WAYS_Y = 433; // the first of the ways: the game itself
const ROW = 50; // from one way to the next
const HINT = 34; // the line beneath the game saying what it is
const FOOT_Y = 786; // the last row, clear of the glyphs: the base, sound, voice, music and vibration end here
const FOOT_ROW = 44; // from one to the next of those, a little closer
const GLYPHS_Y = 860; // the row of glyphs at the foot of every page, their names beneath, clear of the frame
const GUTTER = 16; // either side of the centre line: a way's name ends, its value begins
// The solid triangles either side of a value chosen from a list, pointing away from it: how tall
// and how wide each is, and the room between it and the value.
const STEP_H = 26;
const STEP_W = 21;
const STEP_GAP = 14;
const MORE_Y = 236; // the first row on a page of further ways (only if they do not all fit)
const RELIEF = 1.4; // the normal maps' strength at full depth
const FAINT = 0.75; // how deep a faint line is cut
// Golic Vulcan's marks, which the Vulcan fonts do not carry, cut by hand among its letters: the
// stroke (pakh, -) a short bar across the letters' middle, joining a word's roots; the double
// stroke (--) a longer one, standing for a colon; the half-stop (') a short upright at their top,
// setting a prefix apart. Each its width, its length, and where it sits (from the letters' middle
// line: 'middle' of each font is not quite the middle of its letters), as fractions of the letters'
// size.
const STROKES = {
  '-': { width: 0.42, length: 0.28 },
  '\u2013': { width: 0.86, length: 0.66 },
  "'": { width: 0.24, length: 0.22 },
};
const LETTERS_MIDDLE = { ModernVulcan: -0.07, VulcanScript: -0.13 };
const LETTERS_TOP = { ModernVulcan: -0.42, VulcanScript: -0.5 };
const SMOOTH = 0.32; // seconds for the carving to smooth away ...
const RECUT = 0.42; // ... and to be cut again
// How squarely the underside must face the eye to count as seen (and so be set upright).
const SEEN = 0.08;
const UNSEEN = 0.02;
// How the carving is cut, under either base: in the basin's rough stone, dark grooves with a worn,
// pale lip; in polished obsidian, grooves frosted pale into the black glass, matt where it shines.
// Their colour (and the lip's), as rgba, and how rough the face is, and the grooves.
const LOOKS = {
  stone: { groove: [10, 6, 5, 0.9], lip: [255, 240, 230, 0.22], roughness: 0.86, rough: 0.86 },
  obsidian: { groove: [216, 208, 200, 0.94], lip: null, roughness: 0.3, rough: 0.92 },
};
const rgba = ([r, g, b, a], depth) => `rgba(${r}, ${g}, ${b}, ${a * depth})`;
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

// The carving's layer, blended into MeshStandardMaterial: its colour over the stone, its grooves'
// roughness (carveRough), and its relief added to the frame's - the slope of the depth cut (the
// mask's alpha) across a texel either side, so its walls are as crisp as the canvas is fine - all
// scaled by carveDepth.
function carveShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = `uniform sampler2D carveColor;\nuniform sampler2D carveMask;\nuniform float carveDepth;\nuniform float carveRough;\n${shader.fragmentShader}`
    .replace('#include <map_fragment>', `#include <map_fragment>
      vec4 carveTint = texture2D( carveColor, vMapUv );
      diffuseColor.rgb = mix( diffuseColor.rgb, carveTint.rgb, carveTint.a * carveDepth );`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix( roughnessFactor, carveRough, texture2D( carveMask, vMapUv ).a * carveDepth );`)
    .replace('#include <normal_fragment_maps>', `
      const float carveTexel = ${WALL.toFixed(2)} / ${SIZE.toFixed(1)};
      vec2 carveSlope = vec2(
        texture2D( carveMask, vNormalMapUv + vec2( carveTexel, 0.0 ) ).a - texture2D( carveMask, vNormalMapUv - vec2( carveTexel, 0.0 ) ).a,
        texture2D( carveMask, vNormalMapUv + vec2( 0.0, carveTexel ) ).a - texture2D( carveMask, vNormalMapUv - vec2( 0.0, carveTexel ) ).a
      ) * ${WALL_STEEP.toFixed(2)};
      carveSlope /= sqrt( 1.0 + dot( carveSlope, carveSlope ) );
      vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
      mapN.xy *= normalScale;
      mapN.xy += carveSlope * normalScale * carveDepth;
      normal = normalize( tbn * mapN );`);
}

export class Engraving {
  constructor(stage, { settings, base, onAction, onOption }) {
    this.stage = stage;
    this.settings = settings;
    this.onAction = onAction;
    this.onOption = onOption;

    // The frame, cut for good (dress): stone colour and relief.
    this.stone = canvasOf(SIZE);
    this.frameMask = canvasOf(SIZE);
    this.frameRelief = canvasOf(SIZE);
    const frameGlow = canvasOf(SIZE);
    frameGlow.getContext('2d').fillRect(0, 0, SIZE, SIZE);

    // The words and glyphs: a layer of their own, its colour and its depth.
    this.carve = { color: canvasOf(SIZE), mask: canvasOf(SIZE) };

    const texture = (canvas, srgb) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      return t;
    };
    const map = texture(this.stone, true);
    const normalMap = texture(this.frameRelief, false);
    const emissiveMap = texture(frameGlow, true);
    this.carveColor = texture(this.carve.color, true);
    this.carveMask = texture(this.carve.mask, false);
    this.depth = { value: 1 }; // the shader's, eased from `cutting`
    this.rough = { value: LOOKS.stone.rough }; // how rough the grooves are (dress)
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
      carveMask: { value: this.carveMask },
      carveDepth: this.depth,
      carveRough: this.rough,
    });
    material.customProgramCacheKey = () => 'kaltoh-carving-v3';
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(MEDALLION_RADIUS, 96), material);
    // Facing down, just proud of the foot.
    this.mesh.quaternion.copy(qLay);
    this.mesh.position.y = -PIVOT.y - 0.0025;
    this.mesh.receiveShadow = true;
    stage.baseRoot.add(this.mesh);

    this.page = 'main';
    this.wayPage = 0;
    this.standard = settings.script !== 'vulcan'; // which script is cut now
    this.state = { event: TEXT.begin };
    this.regions = [];
    this.dirty = true;
    this.change = null; // what is to be cut once the carving has smoothed away
    this.phase = 'still'; // still | smoothing | cutting
    this.seen = false; // the underside faces the eye
    this.raycaster = new THREE.Raycaster();
    this.dress(base);
  }

  // Dressed for the base it is under (and again whenever that changes): the frame cut for good in
  // its stone - or its black glass - the carving cut as that takes it, and the medallion the size of
  // the circle its foot gives it, the eye coming as much nearer to read a smaller one (scene.js).
  dress({ kind, mesh, foot }) {
    this.baseMesh = mesh;
    this.look = LOOKS[kind] ?? LOOKS.stone;
    this.makeBackground(mesh.material.map?.image, this.stone);
    this.frameMask.getContext('2d').clearRect(0, 0, SIZE, SIZE);
    this.layer = { color: this.stone, mask: this.frameMask };
    this.ring(C - 12, 7, 0.2);
    this.ring(C - 30, 2.5, 0.25);
    buildRelief(this.frameMask, this.frameRelief);
    const { material } = this.mesh;
    material.map.needsUpdate = true;
    material.normalMap.needsUpdate = true;
    material.roughness = this.look.roughness;
    this.rough.value = this.look.rough;
    const size = (foot ?? MEDALLION_RADIUS) / MEDALLION_RADIUS;
    this.mesh.scale.setScalar(size);
    this.stage.view.read.size = size;
    this.dirty = true;
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

  // The other script, from now on: the settings remember it (main.js saves them), so the carving
  // first reads in whichever script it was last translated to.
  translate() {
    this.settings.script = this.settings.script === 'vulcan' ? 'standard' : 'vulcan';
    const standard = this.settings.script === 'standard';
    this.recut(() => {
      this.standard = standard;
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

  makeBackground(stone, bg = canvasOf(SIZE)) {
    const g = bg.getContext('2d');
    g.clearRect(0, 0, SIZE, SIZE);
    if (this.look === LOOKS.obsidian) {
      // Black glass, polished flat: the faintest warmth at its heart, darker to its rim.
      g.fillStyle = '#0d0b0c';
      g.fillRect(0, 0, SIZE, SIZE);
      const sheen = g.createRadialGradient(C, C, C * 0.1, C, C, C);
      sheen.addColorStop(0, 'rgba(70, 40, 44, 0.16)');
      sheen.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
      g.fillStyle = sheen;
      g.fillRect(0, 0, SIZE, SIZE);
      return bg;
    }
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
    const { color, mask } = this.carve;
    color.getContext('2d').clearRect(0, 0, SIZE, SIZE);
    mask.getContext('2d').clearRect(0, 0, SIZE, SIZE);
    this.layer = this.carve;
    this.regions = [];
    this.drawPage();
    this.carveColor.needsUpdate = true;
    this.carveMask.needsUpdate = true;
  }

  drawPage() {
    if (this.page === 'rules') {
      this.drawRules();
      return;
    }
    const pages = this.wayPages();
    this.wayPage = Math.min(this.wayPage, pages.length - 1);
    if (this.wayPage > 0) this.drawMore(pages);
    else this.drawMain(pages);
  }

  // Cut into a layer: the stone (a faint worn lip and a black groove) and the depth mask (for the
  // relief). Frame, words and glyphs alike are engraved black; none of them carries light of its
  // own (`lit`, from when they did, is let be). A shallower cut (`depth` below 1) is fainter.
  cut(draw, lit, depth = 1) {
    const { color, mask } = this.layer;
    const { groove, lip } = this.look;
    const g = color.getContext('2d');
    if (lip) {
      g.save();
      g.translate(1.6, 1.6);
      draw(g, rgba(lip, depth));
      g.restore();
    }
    draw(g, rgba(groove, depth));
    const m = mask.getContext('2d');
    m.save();
    m.globalAlpha = depth;
    draw(m, '#fff');
    m.restore();
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

  // A line of text, centred at (x, y) - or beginning there (`align` left), or ending there (right) -
  // fitted into `max` pixels. `numerals` keeps it in Standard letters whatever the script (the
  // Vulcan fonts have no digits), as does `always` (what must be read by everyone, Vulcan or not).
  // A `faint` line is cut shallower: what names a thing, beside the thing itself. In Standard,
  // `caps` cuts it in capitals, spaced, as an inscription.
  line(id, text, x, y, { size = 32, script = false, max = 760, lit = 0.32, kind = 'line', key, numerals = false, always = false, align = 'center', faint = false, caps = false } = {}) {
    const standard = this.standard || numerals || always;
    let str = standard ? text.s : vulcanOnly(text.v);
    if (!str) return null;
    const face = script ? 'VulcanScript' : 'ModernVulcan';
    const family = standard ? STANDARD_FONT : `'${face}'`;
    let px = standard ? size * (script ? 0.55 : caps ? 0.7 : 0.82) : size;
    const spacing = standard && caps ? 0.16 : 0; // between the letters, of their size
    if (spacing) str = str.toUpperCase();
    // Vulcan: runs of letters, and between them its marks, cut by hand.
    const runs = standard ? [str] : str.split(/(['\-\u2013])/).filter(Boolean);
    const g = this.layer.color.getContext('2d');
    const measure = () => {
      g.font = `400 ${px}px ${family}`;
      g.letterSpacing = `${px * spacing}px`;
      return runs.reduce((sum, run) => sum + (STROKES[run] ? STROKES[run].width * px : g.measureText(run).width), 0);
    };
    let w = measure();
    if (w > max) {
      px *= max / w;
      w = measure();
    }
    w -= px * spacing; // none after the last letter
    g.letterSpacing = '0px';
    const font = `400 ${px}px ${family}`;
    const tracking = `${px * spacing}px`;
    const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    this.cut((c, color) => {
      c.font = font;
      c.letterSpacing = tracking;
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillStyle = color;
      let at = x0;
      for (const run of runs) {
        const mark = STROKES[run];
        if (!mark) {
          c.fillText(run, at, y);
          at += c.measureText(run).width;
          continue;
        }
        const thick = px * 0.075;
        const mid = at + (mark.width * px) / 2;
        const [bx, by, bw, bh] = run === "'"
          ? [mid - thick / 2, y + LETTERS_TOP[face] * px, thick, mark.length * px]
          : [mid - (mark.length * px) / 2, y + LETTERS_MIDDLE[face] * px - thick / 2, mark.length * px, thick];
        c.beginPath();
        if (c.roundRect) c.roundRect(bx, by, bw, bh, thick / 2);
        else c.rect(bx, by, bw, bh);
        c.fill();
        at += mark.width * px;
      }
      c.letterSpacing = '0px';
    }, lit, faint ? FAINT : 1);
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
    if (label) this.line(`g:${name}`, label, x, y + 62, { size: 26, max: 140, lit: 0.26, always: standard });
  }

  glyphRow(items, y) {
    const gap = items.length > 4 ? 124 : 150;
    items.forEach((item, i) => {
      const x = C + (i - (items.length - 1) / 2) * gap;
      this.glyph(item.name, x, y, item.label, item);
    });
  }

  // The glyphs at the foot of every page, always in the same places: the rules (on the rules, the
  // way back), the Starfleet delta, and Shake - touched, it begins anew, as shaking the phone does;
  // ringed while a change of way waits for a new game.
  glyphs(first) {
    this.glyphRow([
      first,
      // Its name is carved in Standard in either script: it is how a reader of Standard finds it.
      { name: 'translate', label: TEXT.translateGlyph, standard: true },
      { name: 'anew', label: TEXT.anew, on: this.state.pending },
    ], GLYPHS_Y);
  }

  // A slider: a groove from silent to full, beginning at x0, a knob where the value is, and the
  // value in numerals beyond, in a row h high. Touching anywhere along it, or drawing a finger along
  // it, sets the value.
  slider(key, x0, y, width, h = ROW) {
    const value = Math.max(0, Math.min(1, this.settings[key] ?? 0));
    const x1 = x0 + width;
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
    this.line(`slider:${key}:value`, { v: text, s: text }, x1 + 30, y, { size: 30, max: 96, lit: 0.5, numerals: true, align: 'left' });
    this.regions.push({ kind: 'slider', id: `slider:${key}`, key, x: x0 - 30, y: y - h / 2, w: x1 - x0 + 60, h, x0, x1, y0: y });
  }

  // A rule across the face, tapering away either side of a small diamond - or of a note.
  rule(y, note) {
    const half = Math.min(330, chord(y) - 80);
    let gap = 18;
    if (note) gap = this.line('note', note, C, y, { size: 28, max: 2 * half - 140 }).w / 2 + 6;
    this.cut((g, color) => {
      g.fillStyle = color;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(C + side * gap, y - 2.2);
        g.lineTo(C + side * half, y);
        g.lineTo(C + side * gap, y + 2.2);
        g.closePath();
        g.fill();
      }
      if (note) return;
      g.beginPath();
      g.moveTo(C, y - 8);
      g.lineTo(C + 8, y);
      g.lineTo(C, y + 8);
      g.lineTo(C - 8, y);
      g.closePath();
      g.fill();
    });
  }

  // The face: the name, the players, what just happened, and the ways to play - the game, its
  // ways, then what neither shapes the game nor waits for a new one (the base, the room, the sound,
  // the voice, the music and vibration) at the foot.
  drawMain(pages) {
    const { event, status, shape } = this.state;
    this.line('title', TEXT.title, C, TITLE_Y, { size: 66, script: true, max: 400, caps: true });
    // Beneath the name, the shape this game builds, where the game says (state.shape).
    if (shape) this.line('shape', shape, C, SHAPE_Y, { size: 25, max: 2 * chord(SHAPE_Y) - 120, caps: true });
    this.drawSeats();
    this.line('event', event, C, EVENT_Y, { size: 38, max: 2 * chord(EVENT_Y) - 100 });
    // How far the game has come, where it says (many forms: the loops closed).
    if (status) this.line('status', status, C, EVENT_Y + 36, { size: 26, max: 2 * chord(EVENT_Y + 36) - 110, faint: true });
    // Ways that shape the game wait for it to begin anew: the rule says so.
    this.rule(RULE_Y, this.state.pending ? TEXT.pending : null);
    const { rows, sound } = pages[0];
    for (const row of rows) this.way(row, pages.length > 1);
    sound.forEach((o, i) => this.way({ o, y: FOOT_Y - (sound.length - 1 - i) * FOOT_ROW, h: FOOT_ROW }, pages.length > 1));
    if (pages.length > 1) this.arrows(0, pages.length, (rows[0].y + rows[rows.length - 1].y) / 2);
    this.glyphs({ name: 'rules', label: TEXT.rules });
  }

  // The players: a mark each, filled for whose turn it is, in a ring painted their colour, and a
  // score. With others at the board, each seat is named over its mark and its plays are marked
  // beneath. Whose turn it is is told here, and only here. Zen, played alone, has no seats: its
  // progress stands in their place.
  drawSeats() {
    if (this.state.zen) {
      this.zenProgress(this.state.zen, SEATS_Y);
      return;
    }
    const seats = this.state.seats ?? [];
    const plays = this.state.plays ?? [];
    const named = seats.length > 1;
    // Alone, the mark and score sit lower, midway down the space the names and plays would take.
    const y = named ? SEATS_Y : SEATS_Y + 22;
    seats.forEach((seat, i) => {
      const x = C + (i - (seats.length - 1) / 2) * 170;
      if (named) this.line(`name${i}`, playerText(i), x, y - 38, { size: 27, max: 160, lit: seat.now ? 0.5 : 0.24 });
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
        g.arc(x, y, 10, 0, Math.PI * 2);
        if (seat.now) g.fill();
        else g.stroke();
      }, seat.now ? 0.95 : 0.3);
      this.line(`seat${i}`, seat.score, x, y + 36, { size: 30, max: 160, lit: seat.now ? 0.6 : 0.28 });
      if (named) this.playMarks(plays.filter((p) => p.player === i).map((p) => p.mark), x, y + 64, seat.now);
    });
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

  // Zen keeps no seats: where they would be (from height y), its progress. A ringed dot for each of
  // its forms taken (a bare ring for each still to come), and beneath, a dot for each t'an placed
  // toward the next.
  zenProgress({ forms, taken, placed, per, complete }, y = 210) {
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
    row(forms, taken, y, 50, 2.1, 'ring');
    if (!complete) row(per, placed, y + 52, 27, 1.3, 'join');
  }

  visibleOptions() {
    return OPTIONS.filter((o) => !o.when || o.when(this.settings));
  }

  choiceOf(o) {
    return o.choices.find(([value]) => value === this.settings[o.key]) ?? o.choices[0];
  }

  // The ways shown, placed: the game first (with a line on what it is), then its ways, as many as
  // fit on the face between the rule and the sound, which keeps the foot; any more (none, for the
  // games there are) follow on pages of their own, turned to by an arrow at the rim.
  wayPages() {
    const shown = this.visibleOptions();
    const sound = shown.filter((o) => UNSHAPING.has(o.key));
    const pages = [{ rows: [], sound }];
    let y = WAYS_Y;
    let last = FOOT_Y - sound.length * FOOT_ROW - (ROW - FOOT_ROW) / 2; // the last row clear of the sound
    shown.filter((o) => !UNSHAPING.has(o.key)).forEach((o, i) => {
      // Room for the line on what the game is, whichever is chosen: what follows stays put.
      const tall = i === 0 && !o.slider && o.choices.some((c) => c[3]);
      if (y > last && pages[pages.length - 1].rows.length) {
        pages.push({ rows: [] });
        y = MORE_Y;
        last = FOOT_Y;
      }
      pages[pages.length - 1].rows.push({ o, y, tall });
      y += ROW + (tall ? HINT : 0);
    });
    return pages;
  }

  // A way: its name, faint, ending short of the centre line, and its value beginning beyond it,
  // between two solid triangles that say it can be changed - touch the one before it for the choice
  // before, anywhere else on the row for the next - or the groove of its slider; and for the game, a
  // line beneath on what it is.
  way({ o, y, tall, h = ROW }, narrow = false) {
    const room = Math.min(narrow ? 280 : 340, chord(y) - GUTTER - 60); // each side, clear of the frame (and of arrows at the rim)
    this.line(`row:${o.key}`, { v: o.v, s: o.s }, C - GUTTER, y, { size: 30, max: room, align: 'right', faint: true });
    if (o.slider) {
      this.slider(o.key, C + GUTTER + 14, y, Math.min(250, room - 90), h);
      return;
    }
    const choice = this.choiceOf(o);
    const start = C + GUTTER + STEP_W + STEP_GAP;
    const value = this.line(`row:${o.key}`, { v: choice[1], s: choice[2] }, start, y, { size: 36, max: room - 2 * (STEP_W + STEP_GAP), align: 'left' });
    const after = (value ? value.x + value.w - 14 : start) + STEP_GAP; // where the second triangle begins
    this.steps(C + GUTTER, after, y);
    if (tall && choice[3]) this.line(`hint:${o.key}`, choice[3], C, y + HINT, { size: 27, max: 2 * chord(y + HINT) - 120, faint: true });
    // The whole row is for touching, name and value alike: a broad mark for a fingertip. Each
    // triangle is a mark of its own, as broad as the row allows: the first reaches back over the
    // gutter, the second on toward the frame.
    this.regions.push({ kind: 'value', id: `row:${o.key}`, key: o.key, x: C - GUTTER - room, y: y - h / 2, w: 2 * (GUTTER + room), h: h + (tall ? HINT : 0) });
    this.regions.push({ kind: 'value', id: `prev:${o.key}`, key: o.key, by: -1, x: C - 6, y: y - h / 2, w: start - STEP_GAP / 2 - (C - 6), h });
    this.regions.push({ kind: 'value', id: `next:${o.key}`, key: o.key, by: 1, x: after - STEP_GAP / 2, y: y - h / 2, w: STEP_W + STEP_GAP / 2 + 30, h });
  }

  // The solid triangles either side of a value, pointing away from it: the first with its tip at
  // x0, the second with its back at x1.
  steps(x0, x1, y) {
    this.cut((g, color) => {
      g.fillStyle = color;
      for (const [tip, back] of [[x0, x0 + STEP_W], [x1 + STEP_W, x1]]) {
        g.beginPath();
        g.moveTo(tip, y);
        g.lineTo(back, y - STEP_H / 2);
        g.lineTo(back, y + STEP_H / 2);
        g.closePath();
        g.fill();
      }
    }, 0.6);
  }

  // Large chevrons at the rim, either side at height y: touch one to turn to the page before or
  // after. Only where there is such a page.
  arrows(page, pages, y) {
    for (const [side, id] of [[-1, 'prev'], [1, 'more']]) {
      if (side < 0 ? page <= 0 : page >= pages - 1) continue;
      const x = C + side * (chord(y) - 100);
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
      this.regions.push({ kind: 'button', id, x: x - 60, y: y - 110, w: 120, h: 220 });
    }
  }

  // Ways that do not fit on the face, on a page of their own.
  drawMore(pages) {
    const { rows } = pages[this.wayPage];
    this.line('waysTitle', TEXT.waysTitle, C, 150, { size: 44, lit: 0.5 });
    this.rule(194, this.state.pending ? TEXT.pending : null);
    for (const row of rows) this.way(row, true);
    this.arrows(this.wayPage, pages.length, (rows[0].y + rows[rows.length - 1].y) / 2);
    this.glyphs({ name: 'rules', label: TEXT.rules });
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
      : [['join', TEXT.markJoined], ['ring', this.settings.way === 'forms' ? TEXT.markLoop : TEXT.markHoop], ['fall', TEXT.markFell]];
    legend.forEach(([mark, label], i) => {
      const x = C + (i - (legend.length - 1) / 2) * 168;
      this.cut((g, color) => MARKS[mark](g, x - 52, 690, color), 0.6);
      this.line(`legend${i}`, label, x + 8, 690, { size: 24, max: 104, lit: 0.36 });
    });
    this.glyphs({ name: 'back', label: TEXT.back });
  }

  // Recut one strip of the carving as it now stands (the page drawn again within it), quickly,
  // without smoothing it away: a slider being drawn along.
  recutStrip({ x, y, w, h }) {
    if (this.phase !== 'still' || this.dirty) {
      this.dirty = true;
      return;
    }
    const { color, mask } = this.carve;
    color.getContext('2d').clearRect(x, y, w, h);
    mask.getContext('2d').clearRect(x, y, w, h);
    const keep = this.regions;
    this.regions = [];
    this.layer = this.carve;
    const g = [color, mask].map((c) => c.getContext('2d'));
    for (const c of g) {
      c.save();
      c.beginPath();
      c.rect(x, y, w, h);
      c.clip();
    }
    this.drawPage();
    for (const c of g) c.restore();
    this.regions = keep;
    this.carveColor.needsUpdate = true;
    this.carveMask.needsUpdate = true;
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
      // The choice after - or, touched on the triangle before the value, the choice before.
      const option = OPTIONS.find((o) => o.key === region.key);
      const n = option.choices.length;
      const i = option.choices.findIndex(([value]) => value === this.settings[option.key]);
      const next = option.choices[(i + (region.by ?? 1) + n) % n][0];
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
    if (name === 'rules') {
      turn(() => {
        this.page = 'rules';
      });
    } else if (name === 'back') {
      turn(() => {
        this.page = 'main';
      });
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
    this.wayPage = 0;
    this.dirty = true;
  }
}

// The frame's relief from its depth mask, as a normal map at the map's own resolution: the frame
// is cut into the stone, so light catches the lower lip of each ring and shades the upper. (The
// words' relief is found by the shader, from their mask: carveShader.)
function buildRelief(mask, out) {
  const n = out.width;
  const scratch = canvasOf(n).getContext('2d', { willReadFrequently: true });
  scratch.drawImage(mask, 0, 0, n, n);
  const src = scratch.getImageData(0, 0, n, n).data;
  const depth = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) depth[i] = src[i * 4 + 3] / 255;
  // Soften the walls a little.
  const soft = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      soft[i] = x > 0 && x < n - 1 && y > 0 && y < n - 1
        ? (depth[i] * 4 + depth[i - 1] + depth[i + 1] + depth[i - n] + depth[i + n]) / 8
        : depth[i];
    }
  }
  const g = out.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const dx = x > 0 && x < n - 1 ? soft[i + 1] - soft[i - 1] : 0;
      const dy = y > 0 && y < n - 1 ? soft[i + n] - soft[i - n] : 0;
      // Height is minus depth; v runs up the texture while canvas rows run down.
      let nx = dx * STEEP;
      let ny = -dy * STEEP;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      img.data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i * 4 + 2] = Math.round((0.5 / len + 0.5) * 255);
      img.data[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

// The glyphs, drawn about their centre.
// The marks of the plays under each seat: a dot for a true join, a ringed dot for a great hoop or a
// loop closed, a cross where t'an fell (and in zen's progress, a ringed dot for a form taken and a
// dot for a t'an placed).
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
  // Beginning anew (carved "Shake": shaking the phone does it too).
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
