// The stage: renderer, lights, the mess-hall reflections, the stone base, and a camera that
// stays put while the player's eye may move - the screen is a window into the phone.
//
// World units are the base model's own: its foot rests at y = 0 and it is about 1.9 across.
// The sphere the kal-toh becomes is centred PIVOT above the foot; the base turns about that
// point, and the field holds the assembly of t'an there.
import * as THREE from '../vendor/three.module.min.js';

export const PIVOT = new THREE.Vector3(0, 0.95, 0);
// The rules measure the kal-toh in their own units (a t'an is 0.42 long); on the stone it is
// drawn half again as large, so the finished form overhangs the basin's recess as it should.
export const SCALE = 1.5;
const ENVIRONMENT_TURN = 4.71;
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
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);

  // Key light: warm, high front-left. It draws the long specular streaks down the brushed t'an
  // and casts their shadows into the basin.
  const key = new THREE.DirectionalLight(0xfff1e0, 3.2);
  key.position.set(-2.4, 5.6, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2.1, right: 2.1, top: 2.4, bottom: -1.4, near: 2, far: 12 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 3;
  key.target.position.copy(PIVOT).setY(0.6);
  scene.add(key, key.target);
  // A red rim from below and behind, as if the gradient behind glowed; and a cool fill.
  const rim = new THREE.DirectionalLight(0xff5a4a, 1.3);
  rim.position.set(2.2, -0.6, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7);
  fill.position.set(3.5, 2.5, 2);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0x3a3e48, 0x2a0a08, 0.55));

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
    distance: 8, // from the eye to the pivot
    zoom: 1,
    focus: { x: 0.5, y: 0.4 }, // where the target sits on screen (fractions of width, height)
    target: PIVOT.clone(),
  };
  // The player's eye relative to where it usually is (see head.js): angles off the screen's
  // axis and relative distance. The window stays fixed, so moving the eye looks around inside.
  const eye = { x: 0, y: 0, distance: 1 };

  function layout(width, height, dpr) {
    size.width = width;
    size.height = height;
    size.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Fit the base (and the sphere's overhang) across the width with a little room each side.
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const byWidth = 1.22 / (t * camera.aspect);
    const byHeight = 1.75 / t;
    view.distance = Math.max(byWidth, byHeight);
  }

  // Elevation of the eye above the base's plane.
  const ELEVATION = THREE.MathUtils.degToRad(15);

  function update() {
    const d = view.distance * view.zoom;
    camera.position.set(0, view.target.y + Math.sin(ELEVATION) * d, Math.cos(ELEVATION) * d);
    camera.lookAt(view.target);
    camera.updateMatrixWorld();

    // An off-axis frustum through a fixed window at the target's depth: the eye may move,
    // the window does not.
    const D = d * eye.distance;
    const ex = D * Math.tan(eye.x);
    const ey = D * Math.tan(eye.y);
    camera.matrixWorld.extractBasis(across, upward, backward);
    camera.position.addScaledVector(across, ex).addScaledVector(upward, ey).addScaledVector(backward, D - d);
    camera.updateMatrixWorld();
    const half = d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const width = half * camera.aspect;
    // Shift the window so the target sits at the chosen point of the screen.
    const shiftX = width * (1 - 2 * view.focus.x);
    const shiftY = half * (2 * view.focus.y - 1);
    const n = camera.near / D;
    camera.projectionMatrix.makePerspective(
      (-width + shiftX - ex) * n, (width + shiftX - ex) * n, (half + shiftY - ey) * n, (-half + shiftY - ey) * n, camera.near, camera.far,
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

  return { renderer, scene, camera, key, baseRoot, assemblyRoot, size, view, eye, layout, update, toScreen, fromScreen, rayAt };
}

// What the metal reflects: a panorama of a starship mess hall. The photograph is low dynamic
// range, so its light panels and glowing tables are lifted far above white before filtering;
// polished t'an then catch real highlights instead of a flat grey.
export async function loadEnvironment(stage) {
  const { renderer, scene } = stage;
  const photo = await loadTexture('assets/env.jpg', true);
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
  // Turn the room so its ceiling lights and windows fall where the eye sees them in the metal.
  scene.environmentRotation.set(0, ENVIRONMENT_TURN, 0);
  pmrem.dispose();
  target.dispose();
  photo.dispose();
  lift.geometry.dispose();
  lift.material.dispose();
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
  return { mesh, meta, surface, slope, radius };
}

function loadTexture(url, color) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (t) => {
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      resolve(t);
    }, undefined, reject);
  });
}
