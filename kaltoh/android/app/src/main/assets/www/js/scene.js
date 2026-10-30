// The stage: renderer, lights, the mess hall all round (out of focus beyond the kal-toh, sharp in
// its metal), the stone base, and a camera framed through the screen as through a window, the
// kal-toh standing a little out of it.
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
// Tuvok, at his mess-hall table in the old panorama (of which only his patch is kept, for the t'an
// waiting in the tray): it was turned so that he sat behind the player.
const ROOM = new THREE.Euler(0, 3.69, 0);
// A direction in the panorama (u along it, v up it), as the room is turned.
function roomward(u, v) {
  const azimuth = (u - 0.5) * 2 * Math.PI;
  const elevation = (v - 0.5) * Math.PI;
  return new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation)).applyEuler(ROOM);
}
// The direction of his face (three.js shows the panorama's direction e at the room's turn applied
// to e).
export const TUVOK = roomward(0.337, 0.478);
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
  // and casts their shadows into the basin.
  const key = new THREE.DirectionalLight(0xfff1e0, 3.2);
  key.position.set(-2.4, 5.6, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2.3, right: 2.3, top: 2.4, bottom: -2.4, near: 2, far: 13 }); // the floor in front too
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 3;
  key.target.position.copy(PIVOT).setY(0.6);
  scene.add(key, key.target);
  // A warm rim from below and behind, as from the mess hall's lights beyond; and a cool fill.
  const rim = new THREE.DirectionalLight(0xffd8c0, 1.1);
  rim.position.set(2.2, -0.6, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7);
  fill.position.set(3.5, 2.5, 2);
  scene.add(fill);
  const ambient = new THREE.HemisphereLight(0x3a3e48, 0x1c1a18, 0.55);
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
    zoom: 1,
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

  return { renderer, scene, camera, key, rim, ambient, baseRoot, assemblyRoot, size, view, screen, optics, eye, glass, layout, update, toScreen, fromScreen, onGlass, rayAt };
}

// The light the stone and the table are lit by, and what the metal mirrors: the mess hall about
// the table (room-env.jpg, tools/make_environment.py) - the dining room behind the player, the
// galley before them, the rest of it filled from their edges. The photographs are of low dynamic
// range, so their light panels are lifted far above white before filtering; polished t'an then
// catch real highlights instead of a flat grey. The t'an waiting in the tray alone mirrors Tuvok,
// at his table behind the player: a patch of the old panorama set into the same light where he
// sat (stage.tuvokEnvironment). Beyond the kal-toh stands the galley (makeRoom).
const TUVOK_PATCH = { x: 1385, y: 390 }; // where it lies in the 2048 x 1024 light (the old panorama, turned as the room is)
export async function loadEnvironment(stage) {
  const { renderer, scene } = stage;
  const [light, tuvok, galley] = await Promise.all([
    loadTexture('assets/room-env.jpg', true),
    loadImage('assets/tuvok.jpg'),
    loadTexture('assets/room.jpg', true),
  ]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const lifter = new THREE.ShaderMaterial({
    uniforms: { map: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(map, vUv).rgb;
        float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
        gl_FragColor = vec4(c * (1.3 + 16.0 * smoothstep(0.42, 0.95, luma)), 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const flat = new THREE.Scene();
  flat.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lifter));
  const flatEye = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // A panorama, its lights lifted, filtered for every roughness.
  const lit = (texture) => {
    const target = new THREE.WebGLRenderTarget(2048, 1024, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    lifter.uniforms.map.value = texture;
    renderer.setRenderTarget(target);
    renderer.render(flat, flatEye);
    renderer.setRenderTarget(null);
    target.texture.mapping = THREE.EquirectangularReflectionMapping;
    const filtered = pmrem.fromEquirectangular(target.texture).texture;
    target.dispose();
    return filtered;
  };
  scene.environment = lit(light);
  stage.skyEnvironment = scene.environment;
  // The same light, Tuvok set into it, its edges feathered away.
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const g = canvas.getContext('2d');
  g.drawImage(light.image, 0, 0, 2048, 1024);
  const patch = document.createElement('canvas');
  patch.width = tuvok.width;
  patch.height = tuvok.height;
  const p = patch.getContext('2d');
  p.drawImage(tuvok, 0, 0);
  p.globalCompositeOperation = 'destination-in';
  const fade = p.createRadialGradient(tuvok.width / 2, tuvok.height / 2, Math.min(tuvok.width, tuvok.height) * 0.3, tuvok.width / 2, tuvok.height / 2, Math.min(tuvok.width, tuvok.height) * 0.5);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  p.fillStyle = fade;
  p.fillRect(0, 0, tuvok.width, tuvok.height);
  g.drawImage(patch, TUVOK_PATCH.x, TUVOK_PATCH.y);
  const withTuvok = new THREE.CanvasTexture(canvas);
  withTuvok.colorSpace = THREE.SRGBColorSpace;
  stage.tuvokEnvironment = lit(withTuvok);
  withTuvok.dispose();
  stage.sky = makeRoom(galley);
  scene.add(stage.sky);
  pmrem.dispose();
  light.dispose();
  lifter.dispose();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

// The room the table stands in: the galley, a photograph, projected from where it was taken onto
// the room's own floor and walls, so the table stands on its floor. The photograph was measured by
// its lines (the floor's, the counters', the ceiling's: tools/measure_room.py): where they meet, the
// room's three directions, and from them its lens and how it was held - looking 4.7 degrees down
// and 19.6 degrees to the right of the room's length, from an eye 1.18 counters high - and where its
// counters stand. The room is laid out by those measures in the world: its floor level with the
// table's foot, its length along the table's, so the table's edges run with the floor's lines; and
// the photograph's camera stands where it stood, forward of the table, at the player's eye height.
// Each ray from the eye finds what it meets (the floor, the right counter's front, the wall of the
// pass-through block and of the galley behind the counter, or the corridor beyond) and takes the
// photograph's colour there. Drawn nearer, the eye moves through the room, as it would.
const GALLEY = {
  size: new THREE.Vector2(2400, 1792), // pixels
  focal: 1906.3, // pixels
  // The room's directions in the photograph camera's frame (x right, y down, z ahead).
  across: new THREE.Vector3(0.94262, -0.02969, 0.33255),
  up: new THREE.Vector3(-0.00255, -0.99665, -0.08177),
  ahead: new THREE.Vector3(-0.33387, -0.07623, 0.93953),
  // In heights of its camera above the floor: how far ahead the right counter's front stands, the
  // pass-through block's front (and the galley wall behind the counter), and the corridor's end;
  // where across the block begins and the right counter begins; and how high the counters are.
  rightFront: 2.92,
  blockFront: 3.93,
  corridor: 6.37,
  blockFrom: -0.05,
  counterFrom: 1.48,
  counterTop: 0.847,
};
// The table's foot, where the floor is (the table's top is at FLOOR, 1.7182 of its model's units
// above its foot, scaled 3.7 times: table.js).
const FLOOR_LEVEL = FLOOR - 1.7182 * 3.7;
// In the world: the photograph's camera, its height above the floor (the player's own eye's, as
// the view is laid out), and where it stands: across, to the left of the table's middle, and
// beyond the table, toward the galley.
const ROOM_EYE = new THREE.Vector3(-15, FLOOR_LEVEL + 9.15, -10.7);
function makeRoom(texture) {
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  // What lies beyond the photograph's edges (the floor nearer the table than its camera saw, say)
  // continues it, mirrored.
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  const h = ROOM_EYE.y - FLOOR_LEVEL;
  const toPhoto = new THREE.Matrix3().set(
    GALLEY.across.x, GALLEY.up.x, -GALLEY.ahead.x,
    GALLEY.across.y, GALLEY.up.y, -GALLEY.ahead.y,
    GALLEY.across.z, GALLEY.up.z, -GALLEY.ahead.z,
  );
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      level: { value: 0.8 },
      size: { value: GALLEY.size },
      focal: { value: GALLEY.focal },
      eye: { value: ROOM_EYE },
      toPhoto: { value: toPhoto },
      floorY: { value: FLOOR_LEVEL },
      // The world's z of the right counter's front, the block's and the wall behind, the corridor's end.
      fronts: { value: new THREE.Vector3(ROOM_EYE.z - GALLEY.rightFront * h, ROOM_EYE.z - GALLEY.blockFront * h, ROOM_EYE.z - GALLEY.corridor * h) },
      // Where across the block begins and the right counter begins, and the counters' tops (world).
      bounds: { value: new THREE.Vector3(ROOM_EYE.x + GALLEY.blockFrom * h, ROOM_EYE.x + GALLEY.counterFrom * h, FLOOR_LEVEL + GALLEY.counterTop * h) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vRay;
      void main() {
        // The box is about the eye, unturned: its points are directions from the eye in the world.
        vRay = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float level;
      uniform vec2 size;
      uniform float focal;
      uniform vec3 eye;
      uniform mat3 toPhoto;
      uniform float floorY;
      uniform vec3 fronts;
      uniform vec3 bounds;
      varying vec3 vRay;
      void main() {
        vec3 d = normalize(vRay);
        vec3 o = cameraPosition;
        // What the ray meets first: the floor, or the room's fronts, nearest first.
        float t = 1e6;
        if (d.y < 0.0) t = (floorY - o.y) / d.y;
        if (d.z < 0.0) {
          float wall = (fronts.z - o.z) / d.z; // the corridor's end, unless something nearer
          vec3 p = o + d * ((fronts.y - o.z) / d.z);
          if (p.x >= bounds.x) wall = (fronts.y - o.z) / d.z;
          p = o + d * ((fronts.x - o.z) / d.z);
          if (p.x >= bounds.y && p.y < bounds.z) wall = (fronts.x - o.z) / d.z;
          t = min(t, wall);
        }
        vec3 c = toPhoto * (o + d * t - eye);
        vec2 px = 0.5 * size + focal * c.xy / max(c.z, 1e-3);
        vec2 uv = vec2(px.x / size.x, 1.0 - px.y / size.y);
        gl_FragColor = vec4(texture2D(map, uv).rgb * level, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const room = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  room.frustumCulled = false;
  room.renderOrder = -100;
  room.onBeforeRender = (renderer, scene, camera) => {
    room.position.setFromMatrixPosition(camera.matrixWorld);
    room.updateMatrixWorld();
  };
  return room;
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
    envMapIntensity: 1.0,
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
