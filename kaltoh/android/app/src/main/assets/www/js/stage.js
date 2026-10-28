// The stage: renderer, camera rig, light, the stone base and the table it stands on.
import * as THREE from '../vendor/three.module.min.js';

// World layout, in the base model's own units (its footprint is about 1.9 across).
export const SPHERE_RADIUS = 0.8;
export const CENTER = new THREE.Vector3(0, 1.14, 0);

const ROOM = 0x08090c;
const across = new THREE.Vector3();
const upward = new THREE.Vector3();
const backward = new THREE.Vector3();
const ENVIRONMENT_TURN = 4.71;
const PITCH_MIN = THREE.MathUtils.degToRad(-4);
const PITCH_MAX = THREE.MathUtils.degToRad(84);

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  // One colour for the room and the fog, so the table fades into darkness without a horizon.
  scene.background = new THREE.Color(ROOM);
  scene.fog = new THREE.FogExp2(ROOM, 0.12);

  // Reflections come from a panorama of a starship mess hall (see loadEnvironment).
  scene.environmentIntensity = 1;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);

  // Key light: warm, from high front-left, casting the shadows that give the rods depth.
  const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
  key.position.set(-2.6, 5.2, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.9;
  key.shadow.camera.right = 1.9;
  key.shadow.camera.top = 2.2;
  key.shadow.camera.bottom = -1.6;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 12;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 3;
  key.target.position.set(0, 0.6, 0);
  scene.add(key, key.target);

  // Cool rim from behind separates the metal from the dark.
  const rim = new THREE.DirectionalLight(0xa9cbff, 1.1);
  rim.position.set(2.4, 3.0, -4.2);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x2a3240, 0x120d0b, 0.6));

  const table = new THREE.Mesh(
    new THREE.CircleGeometry(14, 72),
    new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.55, metalness: 0.2, envMapIntensity: 0.25 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  // Everything that turns when the base is dragged.
  const gameRoot = new THREE.Group();
  scene.add(gameRoot);
  // The structure hangs at the centre of the basin; its wobble and spin rotate this group.
  const structureRoot = new THREE.Group();
  structureRoot.position.copy(CENTER);
  gameRoot.add(structureRoot);

  const rig = {
    yaw: 0.6,
    pitch: THREE.MathUtils.degToRad(17),
    zoom: 1,
    yawVelocity: 0,
    pitchVelocity: 0,
    distance: 8,
    focusY: 0.4, // fraction of the screen height where the structure's centre sits
  };

  const size = { width: 1, height: 1, dpr: 1 };
  // Where the player's eye is relative to the screen (see head.js); centred unless tracked.
  const eye = { x: 0, y: 0, distance: 1 };

  function layout(width, height, dpr) {
    size.width = width;
    size.height = height;
    size.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Fit the jumble and the base across the width, and table-to-crown down the height.
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const byWidth = 1.17 / (t * camera.aspect);
    const byHeight = 1.95 / t;
    rig.distance = Math.max(byWidth, byHeight);
  }

  function update(dt) {
    // Release inertia when no finger is steering.
    const decay = Math.exp(-dt / 0.32);
    rig.yaw += rig.yawVelocity * dt;
    rig.pitch = THREE.MathUtils.clamp(rig.pitch + rig.pitchVelocity * dt, PITCH_MIN, PITCH_MAX);
    rig.yawVelocity *= decay;
    rig.pitchVelocity *= decay;
    gameRoot.rotation.y = rig.yaw;

    const d = rig.distance * rig.zoom;
    camera.position.set(0, CENTER.y + Math.sin(rig.pitch) * d, Math.cos(rig.pitch) * d);
    camera.lookAt(CENTER);
    camera.updateMatrixWorld();

    // The screen is a window at the structure's depth. Moving the eye keeps that window fixed
    // and looks through it from the new place: an off-axis frustum, as a hologram would appear.
    const D = d * eye.distance;
    const ex = D * Math.tan(eye.x);
    const ey = D * Math.tan(eye.y);
    camera.matrixWorld.extractBasis(across, upward, backward);
    camera.position.addScaledVector(across, ex).addScaledVector(upward, ey).addScaledVector(backward, D - d);
    camera.updateMatrixWorld();
    const half = d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const width = half * camera.aspect;
    // The window's centre sits below the structure's, so the structure rides high on screen.
    const lift = half * (2 * rig.focusY - 1);
    const n = camera.near / D;
    camera.projectionMatrix.makePerspective(
      (-width - ex) * n, (width - ex) * n, (lift + half - ey) * n, (lift - half - ey) * n, camera.near, camera.far,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function turn(dx, dy) {
    rig.yaw += (dx / size.width) * Math.PI * 1.25;
    rig.pitch = THREE.MathUtils.clamp(rig.pitch + (dy / size.height) * Math.PI * 0.9, PITCH_MIN, PITCH_MAX);
  }

  function fling(vx, vy) {
    rig.yawVelocity = (vx / size.width) * Math.PI * 1.25;
    rig.pitchVelocity = (vy / size.height) * Math.PI * 0.9;
  }

  const projected = new THREE.Vector3();
  // World point to CSS pixels, plus its distance from the camera.
  function toScreen(world, out = { x: 0, y: 0, depth: 0 }) {
    projected.copy(world).project(camera);
    out.x = (projected.x * 0.5 + 0.5) * size.width;
    out.y = (-projected.y * 0.5 + 0.5) * size.height;
    out.depth = camera.position.distanceTo(world);
    return out;
  }

  // CSS pixel to a world point on the plane through `anchor` facing the camera.
  const ndc = new THREE.Vector3();
  const ray = new THREE.Ray();
  const plane = new THREE.Plane();
  const facing = new THREE.Vector3();
  function fromScreen(x, y, anchor, out = new THREE.Vector3()) {
    ndc.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1, 0.5).unproject(camera);
    ray.origin.copy(camera.position);
    ray.direction.copy(ndc).sub(camera.position).normalize();
    camera.getWorldDirection(facing);
    plane.setFromNormalAndCoplanarPoint(facing, anchor);
    return ray.intersectPlane(plane, out) ?? out.copy(anchor);
  }

  return { renderer, scene, camera, gameRoot, structureRoot, rig, size, eye, layout, update, turn, fling, toScreen, fromScreen, key };
}

// What the chrome reflects: a panorama of a starship mess hall. The photograph is low dynamic
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
          gl_FragColor = vec4(c * (1.25 + 14.0 * smoothstep(0.42, 0.95, luma)), 1.0);
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

// The stone basin, from the compact mesh written by tools/convert_base.py.
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
    envMapIntensity: 1.1,
  });
  const base = new THREE.Mesh(geometry, material);
  base.castShadow = true;
  base.receiveShadow = true;
  stage.gameRoot.add(base);

  // Height of the basin's upper surface at distance r from its axis (for falling t'an).
  const surface = (r) => {
    const f = r / meta.profileStep;
    const i = Math.floor(f);
    if (i >= meta.profile.length - 1) return 0;
    const a = meta.profile[i];
    const b = meta.profile[i + 1];
    return a + (b - a) * (f - i);
  };
  return { mesh: base, meta, surface };
}

function loadTexture(url, color) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (t) => {
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      resolve(t);
    }, undefined, reject);
  });
}
