// The stage: renderer, lights, the mess hall all round (the galley beyond the kal-toh, and its
// light in the metal), the stone base, and a camera framed through the screen as through a window,
// the kal-toh standing a little out of it.
//
// World units are the base model's own: its foot rests at y = 0 and it is about 1.9 across.
// The sphere the kal-toh becomes is centred PIVOT above the foot; the base turns about that
// point, and the field holds the assembly of t'an there.
import * as THREE from '../vendor/three.module.min.js';

export const PIVOT = new THREE.Vector3(0, 0.95, 0);
// The rules measure the kal-toh in their own units (a t'an is 0.42 long); on the stone it is
// drawn half again as large, so the finished form overhangs the basin's recess as it should.
export const SCALE = 1.5;
// The floor beneath - the top of the table the stone stands on (table.js) - where fallen t'an come
// to rest: just below anything the stone or the t'an on it can reach as they turn about the pivot,
// so what lies there is never disturbed by them.
export const FLOOR = -0.62;
// The layout's vertical field of view (degrees): the screen subtends this from the distance the
// scene is framed for.
export const FOV = 30;
// Tuvok at his mess-hall table, in the old panorama (assets/tuvok.jpg), kept whole for the t'an
// waiting in the tray and the one dangling from a finger: set into the light behind the player,
// turned so that he sits straight behind them. Where his face is in the panorama (u round it, v up
// it):
const TUVOK_AT = { u: 0.337, v: 0.478 };
// The direction of a point of a panorama (u round it, v up it), as three.js reads one (equirectUv).
function panoramaward(u, v) {
  const azimuth = (u - 0.5) * 2 * Math.PI;
  const elevation = (v - 0.5) * Math.PI;
  return new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation));
}
// The direction of his face: straight behind the player (u = 0.75).
export const TUVOK = panoramaward(0.75, TUVOK_AT.v);
const across = new THREE.Vector3();
const upward = new THREE.Vector3();
const backward = new THREE.Vector3();

export function createScene(canvas) {
  // The canvas is transparent: the black-to-red gradient behind it is the page's own.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 40);

  // Key light: warm, high front-left. It draws the long specular streaks down the brushed t'an
  // and casts their shadows into the basin, light and soft: the galley's light all round fills
  // them.
  const key = new THREE.DirectionalLight(0xfff1e0, 3.2);
  key.position.set(-2.4, 5.6, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2.3, right: 2.3, top: 2.4, bottom: -2.4, near: 2, far: 13 }); // the floor in front too
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 8;
  key.shadow.intensity = 0.5;
  key.target.position.copy(PIVOT).setY(0.6);
  scene.add(key, key.target);
  // A warm rim from below and behind, as from the mess hall's lights beyond; and a cool fill.
  const rim = new THREE.DirectionalLight(0xffd8c0, 1.1);
  rim.position.set(2.2, -0.6, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7);
  fill.position.set(3.5, 2.5, 2);
  scene.add(fill);
  // And the key again from below, as the silver table mirrors it back up (unshadowed, softer), with
  // the galley's light all round reflected off it too: what faces down - the stone's carved
  // underside, turned to the table - is lit from there, as it would be.
  const bounce = new THREE.DirectionalLight(0xfff1e0, 1.0);
  bounce.position.set(-2.4, -4.4, 3.6);
  bounce.target.position.copy(PIVOT).setY(0.6);
  scene.add(bounce, bounce.target);
  const ambient = new THREE.HemisphereLight(0x3a3e48, 0x34363b, 0.55);
  scene.add(ambient);

  // The base turns about the pivot; the base mesh hangs below it so its foot meets the floor.
  const baseRoot = new THREE.Group();
  baseRoot.position.copy(PIVOT);
  scene.add(baseRoot);
  // The assembly of t'an: placed and turned by the motion model each frame.
  const assemblyRoot = new THREE.Group();
  assemblyRoot.position.copy(PIVOT);
  assemblyRoot.scale.setScalar(SCALE);
  scene.add(assemblyRoot);

  const size = { width: 1, height: 1, dpr: 1 };
  const view = {
    distance: 8, // from the eye to the target
    zoom: 1, // the distance drawn nearer (less than 1) or further back (more), as the fingers pinch
    zoomRange: [0.45, 1], // how near, and how far back (fitZoom)
    framed: 1, // the zoom the view is first framed at (fitZoom)
    room: 1, // how far off the room stands, from 0 (near) to 1 (far: fitZoom)
    focus: { x: 0.5, y: 0.4 }, // where the target sits on screen (fractions of width, height)
    // The pivot as the stone rests on the floor, level (motion.js): tipped, it rises above it.
    target: new THREE.Vector3(PIVOT.x, PIVOT.y + FLOOR, PIVOT.z),
    // Turning the base over to read its underside brings the eye to it: k from 0 to 1, and the
    // point to look at.
    read: { k: 0, center: PIVOT.clone() },
  };
  // The window: the screen, at its true size in millimetres, is a pane of glass with the kal-toh's
  // centre `optics.depth` mm behind it (in front of it, standing out of the screen, when negative:
  // as it stands, 40 mm out); the eye is at rest before its middle, `optics.rest` mm away (or where
  // the layout assumes). The t'an waiting in the tray lies on the glass.
  const screen = { width: 70, height: 150 };
  const optics = { depth: -40, size: 1, rest: null };
  const eye = { x: 0, y: 0, z: null };
  // The glass itself in the world: its middle, its axes, and its half-width and half-height. A
  // point on it stays where it is on the screen however the view draws near.
  const glass = { centre: new THREE.Vector3(), across: new THREE.Vector3(), upward: new THREE.Vector3(), width: 1, half: 1 };

  function layout(width, height, dpr) {
    size.width = width;
    size.height = height;
    size.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Fit the base (and the sphere's overhang) across the width with a hair of room each side: near
    // enough that the table's front edge is out of sight below the screen.
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const byWidth = 1.05 / (t * camera.aspect);
    const byHeight = 1.75 / t;
    view.distance = Math.max(byWidth, byHeight);
  }

  // Elevation of the eye above the base's plane.
  const ELEVATION = THREE.MathUtils.degToRad(15);
  const target = new THREE.Vector3();

  // The camera is set as the layout has it - looking at the target from `view.distance` - and then
  // moved to the player's eye, its view framed by the glass. At rest the two agree: the scale
  // (world units per millimetre) is chosen so the target appears at its laid-out size and place
  // from the eye at rest, whatever the depth behind the glass.
  function update() {
    const k = view.read.k;
    target.copy(view.target).lerp(view.read.center, k);
    const d = view.distance * view.zoom * (1 - 0.3 * k);
    const focusY = view.focus.y + (0.48 - view.focus.y) * k;
    camera.position.set(target.x, target.y + Math.sin(ELEVATION) * d, target.z + Math.cos(ELEVATION) * d);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(across, upward, backward);

    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const rest = optics.rest ?? screen.height / (2 * t);
    const depth = optics.depth;
    const s = (2 * d * t * rest) / (screen.height * (rest + depth) * optics.size);
    const half = (s * screen.height) / 2;
    const width = half * camera.aspect;
    // Where the target is to appear, from the middle of the screen; the middle of the glass sits
    // off the line of sight to the target so that, from the eye at rest, it does.
    const fx = width * (2 * view.focus.x - 1);
    const fy = half * (1 - 2 * focusY);
    const cx = (-fx * (rest + depth)) / rest;
    const cy = (-fy * (rest + depth)) / rest;
    glass.centre.copy(target).addScaledVector(backward, s * depth).addScaledVector(across, cx).addScaledVector(upward, cy);
    glass.across.copy(across);
    glass.upward.copy(upward);
    glass.width = width;
    glass.half = half;
    const ex = s * eye.x;
    const ey = s * eye.y;
    // However near the eye comes, it stays clear of a kal-toh standing out of the screen.
    const D = s * Math.max(20, 70 - depth, eye.z ?? rest);
    camera.position.copy(target)
      .addScaledVector(backward, s * depth + D)
      .addScaledVector(across, cx + ex)
      .addScaledVector(upward, cy + ey);
    camera.updateMatrixWorld();
    // An off-axis frustum from the eye through the glass, reaching well past everything however far
    // back the eye is.
    camera.far = D + s * depth + 30;
    const n = camera.near / D;
    camera.projectionMatrix.makePerspective(
      (-width - ex) * n, (width - ex) * n, (half - ey) * n, (-half - ey) * n, camera.near, camera.far,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  const projected = new THREE.Vector3();
  // World point to CSS pixels, plus its distance from the eye.
  function toScreen(world, out = { x: 0, y: 0, depth: 0 }) {
    projected.copy(world).project(camera);
    out.x = (projected.x * 0.5 + 0.5) * size.width;
    out.y = (-projected.y * 0.5 + 0.5) * size.height;
    out.depth = camera.position.distanceTo(world);
    return out;
  }

  // CSS pixel to the world point on the glass shown there.
  function onGlass(x, y, out = new THREE.Vector3()) {
    return out.copy(glass.centre)
      .addScaledVector(glass.across, ((2 * x) / size.width - 1) * glass.width)
      .addScaledVector(glass.upward, (1 - (2 * y) / size.height) * glass.half);
  }

  // The ray from the eye through a CSS pixel.
  const ndc = new THREE.Vector3();
  function rayAt(x, y, out = new THREE.Ray()) {
    ndc.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1, 0.5).unproject(camera);
    out.origin.copy(camera.position);
    out.direction.copy(ndc).sub(camera.position).normalize();
    return out;
  }

  // CSS pixel to a world point on the plane through `anchor` facing the eye.
  const ray = new THREE.Ray();
  const plane = new THREE.Plane();
  const facing = new THREE.Vector3();
  function fromScreen(x, y, anchor, out = new THREE.Vector3()) {
    rayAt(x, y, ray);
    camera.getWorldDirection(facing);
    plane.setFromNormalAndCoplanarPoint(facing, anchor);
    return ray.intersectPlane(plane, out) ?? out.copy(anchor);
  }

  // Where the room stands, how near the view may be drawn and how far back, around the table's top
  // `top` (table.js TOP: a rounded square level with FLOOR about the stone's axis), looked for all
  // across the screen with the base at rest. Never so that the room is seen past the photograph
  // (where it goes on mirrored and soft: makeRoom), or where its camera never saw. The room as far
  // off as the view as laid out (zoom 1) allows, or as near as it comes; the view first framed as
  // laid out, or, if that sees past the photograph, as far back as sees none of it.
  const ZOOM = [0.45, 1.6]; // the nearest and the furthest ever
  const probe = new THREE.Ray();
  const seen = new THREE.Vector2();
  // How much of the screen sees the room past the photograph: past its sides alone (`sides`), past
  // its top (`above`), or past its bottom, or where its camera never saw (`other`), as fractions of
  // the screen; `beyond`, if given, gathers where (and what of the photograph is seen there). Where
  // the table stands (its top, or its sides down to its foot, below its top's edges on a tall
  // screen), the room is not seen.
  function pastPhotograph(top, beyond = null) {
    const inner = top.half - top.corner;
    // Whether a ray going down passes within the table's top's outline anywhere from its top's
    // height to its foot's.
    const table = (o, d) => {
      for (let k = 0; k <= 16; k++) {
        const t = (FLOOR - (FLOOR - FOOT) * (k / 16) - o.y) / d.y;
        const x = Math.max(Math.abs(o.x + d.x * t) - inner, 0);
        const z = Math.max(Math.abs(o.z + d.z * t) - inner, 0);
        if (x * x + z * z <= top.corner * top.corner) return true;
      }
      return false;
    };
    let sides = 0;
    let above = 0;
    let other = 0;
    let samples = 0;
    for (let j = 0; j <= 24; j++) {
      for (let i = 0; i <= 12; i++) {
        samples += 1;
        const { origin: o, direction: d } = rayAt((i / 12) * size.width, (j / 24) * size.height, probe);
        if (d.y < 0 && table(o, d)) continue; // the table, not the room
        photographed(o, d, seen);
        const across = seen.x >= 0 && seen.x <= 1;
        const upright = seen.y >= 0 && seen.y <= 1;
        if (across && upright) continue;
        if (upright) sides += 1;
        else if (seen.y > 1) above += 1;
        else other += 1;
        beyond?.push({ x: i / 12, y: j / 24, u: seen.x, v: seen.y });
      }
    }
    return { sides: sides / samples, above: above / samples, other: other / samples };
  }
  // Where in the photograph the room is seen at a point on the screen (CSS pixels).
  function photographedAt(x, y) {
    const { origin: o, direction: d } = rayAt(x, y, probe);
    return photographed(o, d, new THREE.Vector2());
  }
  // Whether the view, as it is now, sees nothing past the photograph.
  function photographAllows(top) {
    const past = pastPhotograph(top);
    return past.sides + past.above + past.other === 0;
  }
  function fitZoom(top) {
    const { zoom } = view;
    const reading = view.read.k;
    view.read.k = 0;
    const allows = (z) => {
      view.zoom = z;
      update();
      return photographAllows(top);
    };
    // Between a zoom that is allowed and one that is not, where it stops being.
    const edge = (inside, beyond) => {
      for (let i = 0; i < 7; i++) {
        const z = (inside + beyond) / 2;
        if (allows(z)) inside = z;
        else beyond = z;
      }
      return inside;
    };
    const fits = (away) => {
      placeRoom(away);
      return allows(1);
    };
    // Looked for from as far as it goes, nearer by steps (not everywhere nearer fits), then between
    // the step that fits and the one before it.
    let away = 1;
    let short = away;
    let fit = fits(away);
    while (!fit && away > 0) {
      short = away;
      away = Math.max(0, away - 0.0625);
      fit = fits(away);
    }
    if (fit && away < short) {
      for (let i = 0; i < 6; i++) {
        const s = (away + short) / 2;
        if (fits(s)) away = s;
        else short = s;
      }
    }
    placeRoom(away);
    view.room = away;
    let framed = 1;
    while (framed > ZOOM[0] && !allows(framed)) framed = Math.max(ZOOM[0], framed - 0.05);
    if (!allows(framed)) {
      // Nowhere does it see only the photograph: as near or far as ever.
      framed = 1;
      view.zoomRange = [ZOOM[0], 1];
    } else {
      let far;
      if (framed < 1) far = framed = edge(framed, framed + 0.05);
      else far = allows(ZOOM[1]) ? ZOOM[1] : edge(1, ZOOM[1]);
      view.zoomRange = [allows(ZOOM[0]) ? ZOOM[0] : edge(framed, ZOOM[0]), far];
    }
    view.framed = framed;
    view.zoom = Math.min(view.zoomRange[1], Math.max(view.zoomRange[0], zoom));
    view.read.k = reading;
    update();
  }

  return { renderer, scene, camera, key, rim, ambient, baseRoot, assemblyRoot, size, view, screen, optics, eye, glass, layout, update, toScreen, fromScreen, onGlass, rayAt, fitZoom, pastPhotograph, photographAllows, placeRoom, photographedAt };
}

// The light the stone and the table are lit by, and what the metal mirrors: the galley itself, the
// photograph seen beyond the kal-toh (makeRoom), stretched twice round the table - ahead as it was
// taken, behind mirrored, so that its edges meet - and from its floor to its ceiling, its lights
// overhead. It is of low dynamic range, so it is dimmed, and only its ceiling's lights are lifted
// above white before filtering: the table and the stone take it softly, and the t'an, mirroring
// it as bright as polished aluminium (rodmesh.js), catch real highlights. Below, the silver table
// mirrors it all back up, the ceiling and its lights (TABLE, as strongly as the table mirrors):
// what faces down - the stone's carved underside, turned to the table - is lit from there. The t'an waiting in the
// tray, and dangling from a finger, mirror Tuvok, at his table behind the player: behind them,
// his panorama, whole, in place of the galley's mirrored half, which meets it at the sides
// (stage.tuvokEnvironment); their faces turned away still catch the galley ahead.
const LIGHT = { level: 0.3, lift: 8, tuvok: 0.6 };
const TABLE = 0.55;
export async function loadEnvironment(stage) {
  const { renderer, scene } = stage;
  const [galley, tuvok] = await Promise.all([loadTexture('assets/galley.jpg', true), loadTexture('assets/tuvok.jpg', true)]);
  // The room first: it sets how the photograph is sampled before it is first drawn from.
  stage.sky = makeRoom(galley);
  scene.add(stage.sky);
  tuvok.wrapS = THREE.RepeatWrapping; // turned, the panorama goes round
  const pmrem = new THREE.PMREMGenerator(renderer);
  const lifter = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: galley },
      tuvok: { value: tuvok },
      turn: { value: TUVOK_AT.u - 0.75 },
      withTuvok: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform sampler2D tuvok;
      uniform float turn;
      uniform float withTuvok;
      varying vec2 vUv;
      vec3 lifted(vec3 c, float level) {
        float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
        return c * (level + ${LIGHT.lift.toFixed(1)} * smoothstep(0.6, 0.95, luma));
      }
      vec3 galley(vec2 at) {
        // Round the panorama: the photograph ahead (u = 0.25, toward -z), then mirrored behind.
        float u = 2.0 * at.x;
        return lifted(texture2D(map, vec2(u < 1.0 ? u : 2.0 - u, at.y)).rgb, ${LIGHT.level.toFixed(2)});
      }
      void main() {
        vec3 c = galley(vUv);
        // Below the horizon, a little past the table's edge, the table: the galley above, mirrored.
        float table = smoothstep(0.03, 0.07, 0.5 - vUv.y);
        c = mix(c, ${TABLE.toFixed(2)} * galley(vec2(vUv.x, 1.0 - vUv.y)), table);
        // Behind the player (u from 0.5 to 1), Tuvok's panorama, turned to put him straight behind,
        // met by the galley about the sides - whole, his own table beneath him: his face is just
        // below the horizon, where the silver table's mirror begins.
        float behind = smoothstep(-0.34, 0.34, sin((vUv.x - 0.5) * 6.2831853));
        vec3 t = lifted(texture2D(tuvok, vec2(vUv.x + turn, vUv.y)).rgb, ${LIGHT.tuvok.toFixed(2)});
        c = mix(c, t, withTuvok * behind);
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const flat = new THREE.Scene();
  flat.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lifter));
  const flatEye = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // The panorama, Tuvok in it or not, filtered for every roughness.
  const lit = (withTuvok) => {
    const target = new THREE.WebGLRenderTarget(2048, 1024, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    lifter.uniforms.withTuvok.value = withTuvok ? 1 : 0;
    renderer.setRenderTarget(target);
    renderer.render(flat, flatEye);
    renderer.setRenderTarget(null);
    target.texture.mapping = THREE.EquirectangularReflectionMapping;
    const filtered = pmrem.fromEquirectangular(target.texture).texture;
    target.dispose();
    return filtered;
  };
  scene.environment = lit(false);
  stage.skyEnvironment = scene.environment;
  stage.tuvokEnvironment = lit(true);
  pmrem.dispose();
  tuvok.dispose();
  lifter.dispose();
}

// The room the table stands in: the galley, a photograph (assets/galley.jpg: taken from well back
// in it, ceiling, floor and the far wall on the right in view; its left side, which is not the
// galley as it is, cut away), projected from where it was taken onto the room's own floor and
// walls. The photograph was measured by its lines (the floor's, the counters', the ceiling's:
// tools/measure_room.py): where they meet, the room's three directions, and from them its lens and
// how it was held - looking 1.4 degrees down and 17.2 degrees to the right of the room's length,
// from an eye 1.28 counters high - and where its counters and walls stand. The room is laid out by
// those measures in the world, its length along the table's, so the table's edges run with the
// floor's lines. Each ray from the eye finds what it meets (the floor, the right counter's front,
// the wall of the pass-through block and of the galley behind the counter, the wall on the right,
// or the back of the galley behind the block) and takes the photograph's colour there. Drawn
// nearer, the eye moves through the room, as it would. (The wall behind the counter is taken on to
// the wall on the right, and the counter past its end to the sink beyond it, as the photograph has
// them in front of what lies beyond: the eye, off to the right of where it was taken, would
// otherwise see round their ends to what its camera never saw.)
const GALLEY = {
  size: new THREE.Vector2(1776, 1792), // pixels
  centre: new THREE.Vector2(576, 896), // where its camera looked, in pixels from its left and top
  focal: 1685.6, // pixels
  // The room's directions in the photograph camera's frame (x right, y down, z ahead).
  across: new THREE.Vector3(0.95518, -0.0081, 0.2959),
  up: new THREE.Vector3(-0.00114, -0.99972, -0.02369),
  ahead: new THREE.Vector3(-0.29601, -0.02229, 0.95492),
  // In heights of its camera above the floor, ahead of it and across to its right: the right
  // counter's front, where it begins and ends across, and its top's height; the front of the
  // pass-through block and of the galley's wall behind the counter, and where it begins; the wall
  // on the right (the door, the replicator); and the back of the galley behind the block.
  counter: { front: 5.27, from: 1.71, to: 3.9, top: 0.78 },
  block: { front: 6.1, from: 0.48 },
  side: 5.9,
  back: 7.96,
  level: 0.4, // how bright it is drawn (it was taken brightly lit)
};
// Where the room stands: moved, never turned, so its lines still run to the table's own vanishing
// points. On a tall screen, far off and well below the table's foot (FAR), the galley shows from
// the block to the door on the right, its ceiling's lights above, the floor hidden by the table's
// top until the photograph's own. A wide screen would see past the photograph's sides from there,
// most of all past its left, cut away: the room is drawn nearer (NEAR, behind the table), until
// none of the screen is past them (fitZoom), the counters close, more of the floor in view and
// none of the ceiling. Between NEAR and FAR: how far below the table's foot its floor is, how far
// beyond the table's middle its camera stands, and how far to the left. (Where the table's foot
// meets the floor is never seen: the table's top hides the floor about it.)
const NEAR = { below: 1.5, ahead: -25, left: 35 };
const FAR = { below: 26, ahead: 110, left: 32.5 };
// The table's foot (its top is at FLOOR, 1.7182 of its model's units above its foot, scaled 3.7
// times: table.js), and the photograph camera's height above the room's floor.
const FOOT = FLOOR - 1.7182 * 3.7;
const ROOM_HEIGHT = 9.94;
// From the world's directions to the photograph camera's (x right, y down, z ahead).
const TO_PHOTO = new THREE.Matrix3().set(
  GALLEY.across.x, GALLEY.up.x, -GALLEY.ahead.x,
  GALLEY.across.y, GALLEY.up.y, -GALLEY.ahead.y,
  GALLEY.across.z, GALLEY.up.z, -GALLEY.ahead.z,
);
// The room as placed (placeRoom), in the world: its floor's height; the photograph's camera; the
// right counter (its front's z, its ends' x, its top's y); the walls (the z of the block's front
// and the wall behind the counter, the x where the block begins, the x of the wall on the right,
// the z of the back); and the shader's uniforms.
const room = { floor: 0, eye: new THREE.Vector3(), counter: new THREE.Vector4(), walls: new THREE.Vector4(), uniforms: null };
// s from 0, as near as it stands, to 1, as far.
function placeRoom(s) {
  const at = (key) => NEAR[key] + (FAR[key] - NEAR[key]) * s;
  const { counter, block } = GALLEY;
  room.floor = FOOT - at('below');
  room.eye.set(-at('left'), room.floor + ROOM_HEIGHT, -at('ahead'));
  const z = (k) => room.eye.z - k * ROOM_HEIGHT;
  const x = (k) => room.eye.x + k * ROOM_HEIGHT;
  room.counter.set(z(counter.front), x(counter.from), x(counter.to), room.floor + counter.top * ROOM_HEIGHT);
  room.walls.set(z(block.front), x(block.from), x(GALLEY.side), z(GALLEY.back));
  if (room.uniforms) room.uniforms.floorY.value = room.floor;
}
placeRoom(1);

// Where in the photograph the room is seen along a ray from `o` in direction `d`, as the room's
// shader finds it: (0, 0) at its lower left, (1, 1) at its upper right; beyond its edges outside
// that, and (-1, -1) for what its camera never saw at all.
const met = new THREE.Vector3();
function photographed(o, d, out) {
  const { counter, walls } = room;
  let t = Infinity;
  if (d.y < 0) t = (room.floor - o.y) / d.y;
  if (d.x > 0 && o.x < walls.z) t = Math.min(t, (walls.z - o.x) / d.x); // the wall on the right
  if (d.z < 0) {
    let wall = (walls.w - o.z) / d.z; // the back, unless something nearer
    const block = (walls.x - o.z) / d.z;
    if (o.x + d.x * block >= walls.y) wall = block;
    const front = (counter.x - o.z) / d.z;
    const x = o.x + d.x * front;
    if (x >= counter.y && x <= counter.z && o.y + d.y * front < counter.w) wall = front;
    t = Math.min(t, wall);
  }
  if (!Number.isFinite(t)) return out.set(-1, -1);
  met.copy(d).multiplyScalar(t).add(o).sub(room.eye).applyMatrix3(TO_PHOTO);
  if (met.z < 1e-3) return out.set(-1, -1);
  const { size, centre, focal } = GALLEY;
  return out.set((centre.x + (focal * met.x) / met.z) / size.x, 1 - (centre.y + (focal * met.y) / met.z) / size.y);
}

function makeRoom(texture) {
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  // Blurred past its edges, the photograph is read in mirror there (so its edge is not mixed with
  // the opposite one); the view is drawn no nearer or further than shows only the photograph, where
  // the screen allows it (fitZoom).
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      level: { value: GALLEY.level },
      // Drawn as itself (1, opaque); or into the table's mirror, at the strength the top mirrors it
      // and leaving the top its own light (table.js).
      drawn: { value: new THREE.Vector2(1, 1) },
      // Past the photograph's edges: how many pixels past for each halving of its sharpness, how dim
      // it grows far past, and over how many pixels.
      fill: { value: new THREE.Vector3(40, 0.6, 1500) },
      size: { value: GALLEY.size },
      centre: { value: GALLEY.centre },
      focal: { value: GALLEY.focal },
      eye: { value: room.eye },
      toPhoto: { value: TO_PHOTO },
      floorY: { value: room.floor },
      counter: { value: room.counter },
      walls: { value: room.walls },
    },
    vertexShader: /* glsl */ `
      varying vec3 vRay;
      void main() {
        // The box is about the eye, unturned: its points are directions from the eye in the world.
        vRay = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    // As photographed() finds it.
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float level;
      uniform vec2 drawn;
      uniform vec3 fill;
      uniform vec2 size;
      uniform vec2 centre;
      uniform float focal;
      uniform vec3 eye;
      uniform mat3 toPhoto;
      uniform float floorY;
      uniform vec4 counter;
      uniform vec4 walls;
      varying vec3 vRay;
      void main() {
        vec3 d = normalize(vRay);
        vec3 o = cameraPosition;
        // What the ray meets first: the floor, the wall on the right, or the room's fronts.
        float t = 1e6;
        if (d.y < 0.0) t = (floorY - o.y) / d.y;
        if (d.x > 0.0 && o.x < walls.z) t = min(t, (walls.z - o.x) / d.x); // the wall on the right
        if (d.z < 0.0) {
          float wall = (walls.w - o.z) / d.z; // the back, unless something nearer
          vec3 p = o + d * ((walls.x - o.z) / d.z);
          if (p.x >= walls.y) wall = (walls.x - o.z) / d.z;
          p = o + d * ((counter.x - o.z) / d.z);
          if (p.x >= counter.y && p.x <= counter.z && p.y < counter.w) wall = (counter.x - o.z) / d.z;
          t = min(t, wall);
        }
        vec3 c = toPhoto * (o + d * t - eye);
        vec2 px = centre + focal * c.xy / max(c.z, 1e-3);
        // Past the photograph's edges (a wide screen's sides, or what its camera never saw), the room
        // goes on as the photograph mirrored there, the further past the softer and the dimmer.
        vec2 inside = clamp(px, vec2(0.5), size - 0.5);
        float beyond = c.z > 1e-3 ? length(px - inside) : 1e5;
        vec2 at = beyond < 1e4 ? px : inside;
        float blur = min(log2(1.0 + beyond / fill.x), 9.0);
        vec3 seen = texture2D(map, vec2(at.x / size.x, 1.0 - at.y / size.y), blur).rgb;
        seen *= mix(1.0, fill.y, smoothstep(0.0, fill.z, beyond));
        gl_FragColor = vec4(seen * level * drawn.x, drawn.y);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  room.uniforms = material.uniforms;
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  box.frustumCulled = false;
  box.renderOrder = -100;
  box.onBeforeRender = (renderer, scene, camera) => {
    box.position.setFromMatrixPosition(camera.matrixWorld);
    box.updateMatrixWorld();
  };
  return box;
}

// The stone basin, from the compact mesh written by tools/convert_base.py. Returns the mesh and
// its profile: the height of its upper surface at each distance from its axis.
export async function loadBase(stage) {
  const [bin, meta, map, bump] = await Promise.all([
    fetch('assets/base.bin').then((r) => r.arrayBuffer()),
    fetch('assets/base.json').then((r) => r.json()),
    loadTexture('assets/base.jpg', true),
    loadTexture('assets/base-bump.jpg', false),
  ]);
  const view = new DataView(bin);
  const magic = String.fromCharCode(...new Uint8Array(bin, 0, 4));
  if (magic !== 'KTB1') throw new Error('base.bin: bad header');
  const count = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);
  const extent = [view.getFloat32(12, true), view.getFloat32(16, true), view.getFloat32(20, true)];
  let offset = 24;
  const qp = new Int16Array(bin, offset, count * 3);
  offset += count * 6;
  const qn = new Int8Array(bin, offset, count * 4);
  offset += count * 4;
  const qt = new Uint16Array(bin, offset, count * 2);
  offset += count * 4;
  const index = new Uint16Array(bin, offset, indexCount);

  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      position[i * 3 + k] = (qp[i * 3 + k] / 32767) * extent[k];
      normal[i * 3 + k] = qn[i * 4 + k] / 127;
    }
    uv[i * 2] = qt[i * 2] / 65535;
    uv[i * 2 + 1] = qt[i * 2 + 1] / 65535;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();

  map.anisotropy = Math.min(8, stage.renderer.capabilities.getMaxAnisotropy());
  const material = new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 2.2,
    roughness: 0.78,
    metalness: 0,
    // The room's light on it kept low: it is the t'an that should catch the eye.
    envMapIntensity: 0.5,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = -PIVOT.y;
  stage.baseRoot.add(mesh);

  const profile = meta.profile;
  const step = meta.profileStep;
  // Height of the upper surface at distance r from the axis, and its slope there.
  const surface = (r) => {
    const f = r / step;
    const i = Math.floor(f);
    if (i >= profile.length - 1) return 0;
    return profile[i] + (profile[i + 1] - profile[i]) * (f - i);
  };
  const slope = (r) => {
    const i = Math.min(profile.length - 2, Math.max(0, Math.floor(r / step)));
    return (profile[i + 1] - profile[i]) / step;
  };
  const radius = (profile.length - 1) * step;
  const top = Math.max(...profile); // nothing of the stone stands higher
  return { mesh, meta, surface, slope, radius, top };
}

function loadTexture(url, color) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (t) => {
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      resolve(t);
    }, undefined, reject);
  });
}
