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
// The room is turned so that Tuvok, seated at the mess-hall table in the panorama, is behind the
// player: seen in the metal, never beyond the kal-toh.
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
// The bar, where Picard sits: the glowing panel behind it.
const BAR = roomward(0.83, 0.525);
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

// What the metal reflects: a panorama of a starship mess hall. The photograph is low dynamic
// range, so its light panels and glowing tables are lifted far above white before filtering;
// polished t'an then catch real highlights instead of a flat grey. Beyond the kal-toh the same room
// is seen out of focus (the player's own blurred copy of it, turned the same way, so what the
// metal mirrors agrees with what is behind it); and that blurred room is what the table's satin
// metal mirrors (stage.skyEnvironment).
export async function loadEnvironment(stage) {
  const { renderer, scene } = stage;
  const [photo, blurred] = await Promise.all([loadTexture('assets/env.jpg', true), loadTexture('assets/sky.jpg', true)]);
  const target = new THREE.WebGLRenderTarget(2048, 1024, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const lift = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { map: { value: photo } },
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
    }),
  );
  const flat = new THREE.Scene();
  flat.add(lift);
  renderer.setRenderTarget(target);
  renderer.render(flat, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  renderer.setRenderTarget(null);
  target.texture.mapping = THREE.EquirectangularReflectionMapping;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(target.texture).texture;
  scene.environmentRotation.copy(ROOM);
  blurred.mapping = THREE.EquirectangularReflectionMapping;
  stage.skyEnvironment = pmrem.fromEquirectangular(blurred).texture;
  stage.sky = makeSky(blurred, stage.view);
  scene.add(stage.sky);
  pmrem.dispose();
  target.dispose();
  photo.dispose();
  lift.geometry.dispose();
  lift.material.dispose();
}

// The room beyond the kal-toh, at any distance: a box about the eye, drawn first and behind
// everything. It is shown small - the panorama's turning and tilting from the eye's line of sight
// taken WIDE times over - so that much of the room is on the screen and little enlarged, and
// framed so that the bar where Picard sits stands up and to the right, clear of the kal-toh (BAR
// at AT of the way from the screen's middle to its right and top edges). It is a real room, though,
// not a picture on the glass: drawn nearer to the kal-toh, or back from it, the eye nears or leaves
// its far wall too, FAR beyond the kal-toh, and the room grows or shrinks about the line of sight
// as that wall would.
const WIDE = 8;
const AT = new THREE.Vector2(0.48, 0.45);
const FAR = 14;
const forward = new THREE.Vector3();
function makeSky(texture, view) {
  const turn = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(ROOM)).transpose();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      turn: { value: turn },
      level: { value: 0.75 },
      wide: { value: WIDE },
      sight: { value: new THREE.Vector2() }, // the line of sight: its heading and elevation
      shown: { value: new THREE.Vector2() }, // what is shown along it
    },
    vertexShader: /* glsl */ `
      varying vec3 vSeen;
      void main() {
        vSeen = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform sampler2D map;
      uniform mat3 turn;
      uniform float level;
      uniform float wide;
      uniform vec2 sight;
      uniform vec2 shown;
      varying vec3 vSeen;
      void main() {
        vec3 ray = normalize(vSeen);
        float heading = atan(ray.x, -ray.z);
        float elevation = asin(clamp(ray.y, -1.0, 1.0));
        float turned = heading - sight.x;
        turned -= 2.0 * PI * floor((turned + PI) / (2.0 * PI));
        heading = shown.x + wide * turned;
        elevation = clamp(shown.y + wide * (elevation - sight.y), -0.5 * PI, 0.5 * PI);
        vec3 look = turn * vec3(sin(heading) * cos(elevation), sin(elevation), -cos(heading) * cos(elevation));
        gl_FragColor = vec4(texture2D(map, equirectUv(look)).rgb * level, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const barHeading = Math.atan2(BAR.x, -BAR.z);
  const barElevation = Math.asin(BAR.y);
  const sky = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.setFromMatrixPosition(camera.matrixWorld);
    sky.updateMatrixWorld();
    // The line of sight is the camera's own (it never turns with the eye, only moves), and the
    // screen spans FOV about it, at rest.
    forward.setFromMatrixColumn(camera.matrixWorld, 2).negate().normalize();
    const heading = Math.atan2(forward.x, -forward.z);
    const elevation = Math.asin(forward.y);
    const halfHigh = THREE.MathUtils.degToRad(FOV / 2);
    const halfWide = Math.atan(Math.tan(halfHigh) * camera.aspect);
    material.uniforms.sight.value.set(heading, elevation);
    material.uniforms.shown.value.set(barHeading - WIDE * AT.x * halfWide, barElevation - WIDE * AT.y * halfHigh);
    // How much nearer the far wall is than as first framed.
    const near = view.distance * view.zoom * (1 - 0.3 * view.read.k);
    material.uniforms.wide.value = (WIDE * (FAR + near)) / (FAR + view.distance);
  };
  return sky;
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
