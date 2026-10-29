// Drawing t'an: each is a scaled cube (12 triangles) of polished steel - a light, cool tint, its
// faces mirrors, gently domed so each shows the room the way a convex mirror does (smaller and
// wider, but true to its shapes), scored by scratches running mostly lengthwise that catch the
// light - all drawn as one instanced mesh. Glow (the blue of order, the amber of strain) is added
// light per instance; soft additive halos give the glow its bloom.
import * as THREE from '../vendor/three.module.min.js';

// In world units (the kal-toh is drawn at scene.SCALE): about the rules' contact distance.
export const ROD_WIDTH = 0.028;
export const ROD_DEPTH = 0.02;
export const BLUE = new THREE.Color(0x63c8ff);
export const AMBER = new THREE.Color(0xff8a3c);

const tmpX = new THREE.Vector3();
const tmpY = new THREE.Vector3();
const tmpZ = new THREE.Vector3();
const tmpM = new THREE.Vector3();
const basis = new THREE.Matrix4();

// How far each long face's normals turn toward its ends (the tangent of the angle): each face is
// drawn as a shallow dome, curved alike along and across it, so it reflects a wider sweep of the
// room behind the player than a flat face would, without stretching it one way more than the other.
const DOME = Math.tan((25 * Math.PI) / 180);

// A unit box along z (length 1, cross-section 1 x 1) whose long faces are mapped with u running
// down the length, so the scratches follow the t'an.
function rodGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const index = [];
  // The scratch texture repeats this often along one t'an, and once across each face, so its
  // texels come out about square on the metal.
  const REPEAT = 0.7;
  // One face: normal n, u running along uDir; v = n x u keeps every face wound outward. The long
  // faces are flat here: the shader domes them, since how far depends on each t'an's length.
  const face = (n, uDir, uScale, vScale) => {
    const vDir = [n[1] * uDir[2] - n[2] * uDir[1], n[2] * uDir[0] - n[0] * uDir[2], n[0] * uDir[1] - n[1] * uDir[0]];
    const corner = [0, 1, 2].map((k) => 0.5 * n[k] - 0.5 * uDir[k] - 0.5 * vDir[k]);
    const base = positions.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      positions.push(corner[0] + uDir[0] * u + vDir[0] * v, corner[1] + uDir[1] * u + vDir[1] * v, corner[2] + uDir[2] * u + vDir[2] * v);
      normals.push(n[0], n[1], n[2]);
      uvs.push(u * uScale, v * vScale);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // Long faces: u along the length.
  for (const n of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]) face(n, [0, 0, 1], REPEAT, 1);
  // End caps.
  face([0, 0, 1], [1, 0, 0], 0.06, 0.06);
  face([0, 0, -1], [1, 0, 0], 0.06, 0.06);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeTangents();
  return g;
}

// The scratches, as two maps: a tangent-space normal map (each scratch a groove whose two walls
// tilt opposite ways across the t'an) and a roughness map (the metal mirror-smooth, the scratches
// rough, so they show as lines that catch the light). Only sixteen texels across a face, so even a
// fine scratch is still most of a pixel wide on the phone and survives being drawn small.
function scratchMaps() {
  const W = 512;
  const H = 16;
  const height = new Float32Array(W * H); // how deep the metal is scored
  const rough = new Float32Array(W * H).fill(0.035);
  const tilt = new Float32Array(W * H); // across-the-grain slope, from the height
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const at = (x, y) => (((y % H) + H) % H) * W + (((x % W) + W) % W);
  // Scratches: long, of varied depth, a few lying at a slight angle; few enough that the metal
  // between them is mirror enough to see the room in. A straight one is cut along one row; a
  // leaning one has its depth shared between the two rows it passes between, so it runs smoothly
  // rather than in steps.
  for (let i = 0; i < 5; i++) {
    const length = 60 + rand() ** 1.3 * 400;
    const x0 = rand() * W;
    const lean = rand() < 0.7 ? 0 : (rand() - 0.5) * 0.02;
    const y0 = lean ? rand() * H : Math.floor(rand() * H);
    const depth = 0.8 + rand() * 0.7;
    const grit = 0.32 + rand() * 0.32;
    for (let s = 0; s < length; s++) {
      const x = Math.floor(x0 + s);
      const y = y0 + lean * s;
      const row = Math.floor(y);
      const f = y - row;
      const cut = depth * Math.sin((s / length) * Math.PI) ** 0.4;
      for (const [r, w] of [[row, 1 - f], [row + 1, f]]) {
        height[at(x, r)] -= cut * w;
        rough[at(x, r)] = Math.max(rough[at(x, r)], 0.035 + grit * w * (cut / depth));
      }
    }
  }
  // The slope across the t'an, from the depth on either side: a scratch's walls glint, but only
  // a little way off what the metal around them mirrors. Between the scratches the metal is left
  // true, so the room is seen in it unrippled.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) tilt[at(x, y)] = (height[at(x, y - 1)] - height[at(x, y + 1)]) * 0.15;
  }
  const make = (fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    const img = g.createImageData(W, H);
    for (let i = 0; i < W * H; i++) fill(img.data, i * 4, i);
    g.putImageData(img, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 8;
    return texture;
  };
  const normal = make((d, o, i) => {
    const t = Math.max(-1, Math.min(1, tilt[i]));
    d[o] = 128;
    d[o + 1] = Math.round(128 + t * 0.8 * 127);
    d[o + 2] = Math.round(Math.sqrt(1 - 0.64 * t * t) * 255);
    d[o + 3] = 255;
  });
  const roughness = make((d, o, i) => {
    const r = Math.round(Math.min(1, rough[i]) * 255);
    d[o] = r;
    d[o + 1] = r;
    d[o + 2] = r;
    d[o + 3] = 255;
  });
  return { normal, roughness };
}

export function rodMaterial() {
  const { normal, roughness } = scratchMaps();
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe8ebf0,
    metalness: 1,
    // Mirror-smooth where unscratched (the map holds the roughness), so the room behind the
    // player is seen in the metal, clearly enough to make out who is there.
    roughness: 1,
    roughnessMap: roughness,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    envMapIntensity: 2,
  });
  // The room is looked up as sharp as the metal is smooth: three.js never lets it be sharper than
  // its coarser 256-texel mip (fine for lights, but it blurs a mirror), so the reflection of the
  // room takes its roughness from the map alone (plus what the shape's own curving adds).
  const maps = THREE.ShaderChunk.lights_fragment_maps.replace(
    'getIBLRadiance( geometryViewDir, geometryNormal, material.roughness )',
    'getIBLRadiance( geometryViewDir, geometryNormal, mirrorRoughness )',
  );
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlue = { value: BLUE };
    shader.uniforms.uAmber = { value: AMBER };
    shader.uniforms.uDome = { value: DOME };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nattribute vec4 aTrimA;\nattribute vec4 aTrimB;\nvarying vec3 vGlow;\nuniform float uDome;')
      .replace(
        '#include <beginnormal_vertex>',
        // Each long face domed: its normals turn toward its ends and its edges by as much for each
        // unit of distance from its middle - uDome at the ends - whatever the t'an's length. In the
        // unit box, as the instance's scaling will undo it (three.js divides a normal by the
        // squared scale of each axis, then turns it with the instance).
        `#include <beginnormal_vertex>
#ifdef USE_INSTANCING
if (abs(normal.z) < 0.5) {
  vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  bool onX = abs(normal.x) > 0.5;
  float sa = max(onX ? s.x : s.y, 1e-6);
  float sw = onX ? s.y : s.x;
  float k = 2.0 * uDome / sa;
  objectNormal.z += position.z * k * s.z;
  float across = (onX ? position.y : position.x) * k * sw * sw / max(s.z, 1e-6);
  if (onX) objectNormal.y += across; else objectNormal.x += across;
}
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        // Each corner of each end moved along the t'an by its trim (world units; see mitreAtJunctions).
        `#include <begin_vertex>
vGlow = aGlow;
#ifdef USE_INSTANCING
{
  vec4 trim = position.z < 0.0 ? aTrimA : aTrimB;
  float t = position.x < 0.0 ? (position.y < 0.0 ? trim.x : trim.w) : (position.y < 0.0 ? trim.y : trim.z);
  transformed.z += (position.z < 0.0 ? t : -t) / max(length(instanceMatrix[2].xyz), 1e-4);
}
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBlue;\nuniform vec3 uAmber;\nvarying vec3 vGlow;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nfloat mirrorRoughness = min( roughnessFactor + geometryRoughness, 1.0 );')
      .replace('#include <lights_fragment_maps>', maps)
      .replace(
        '#include <emissivemap_fragment>',
        // x: blue, y: amber, z: fade to darkness (a t'an dissolving away)
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uBlue * vGlow.x * 0.42 + uAmber * vGlow.y * 0.5;\ndiffuseColor.rgb *= 1.0 - vGlow.z;',
      );
  };
  material.customProgramCacheKey = () => 'kaltoh-rod-v5';
  return material;
}

// Where t'an meet at a junction, each end is cut on the planes that halve the angles between it and
// the others there - a mitre - so that they meet the last millimetre to the last, neither apart
// nor passing through one another. Each corner of an end is drawn back (or on, past the junction's
// point) to the nearest of those planes; the shader moves the corners (RodPool's aTrimA, aTrimB).
// `rods`: a list of { a, b, up, trims } - world ends, the broad face's direction, and eight trims
// (four corners at a, four at b; filled in, in world units).
const NEAR = 0.035; // ends this close meet at a junction
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const frames = [];
const into = new THREE.Vector3();
const intoOther = new THREE.Vector3();
const corner = new THREE.Vector3();
const offset = new THREE.Vector3();
const meeting = new THREE.Vector3();
export function mitreAtJunctions(rods) {
  const n = rods.length;
  for (let i = 0; i < n; i++) {
    frames[i] ??= { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), length: 1 };
    rodFrame(rods[i].a, rods[i].b, rods[i].up, frames[i]);
  }
  const ends = [];
  for (let i = 0; i < n; i++) {
    const r = rods[i];
    r.trims.fill(0);
    for (let k = 0; k < 2; k++) {
      const p = k ? r.b : r.a;
      ends.length = 0;
      meeting.copy(p);
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        for (let kj = 0; kj < 2; kj++) {
          const q = kj ? rods[j].b : rods[j].a;
          if (p.distanceToSquared(q) > NEAR * NEAR) continue;
          ends.push(j, kj);
          meeting.add(q);
        }
      }
      if (!ends.length) continue;
      // The junction's point, and this end's offset from it.
      meeting.multiplyScalar(1 / (1 + ends.length / 2));
      offset.subVectors(p, meeting);
      const f = frames[i];
      into.copy(f.z).multiplyScalar(k ? -1 : 1);
      for (let c = 0; c < 4; c++) {
        const [sx, sy] = CORNERS[c];
        corner.copy(f.x).multiplyScalar((sx * ROD_WIDTH) / 2).addScaledVector(f.y, (sy * ROD_DEPTH) / 2);
        let t = -Infinity;
        for (let m = 0; m < ends.length; m += 2) {
          const g = frames[ends[m]];
          intoOther.copy(g.z).multiplyScalar(ends[m + 1] ? -1 : 1);
          const apart = 1 - into.dot(intoOther);
          if (apart < 1e-3) continue;
          // On this t'an's side of the plane halving the angle between the two.
          t = Math.max(t, (corner.dot(intoOther) + offset.dot(intoOther) - offset.dot(into)) / apart);
        }
        if (t === -Infinity) continue;
        r.trims[k * 4 + c] = Math.max(-0.6 * ROD_WIDTH, Math.min(0.3 * f.length, t));
      }
    }
  }
  return rods;
}

// A rod's frame: along it from a to b, and its cross-section's axes, the broad face (y, its depth)
// turned toward `up`.
function rodFrame(a, b, up, out) {
  out.z.subVectors(b, a);
  out.length = out.z.length() || 1e-6;
  out.z.multiplyScalar(1 / out.length);
  out.y.copy(up).addScaledVector(out.z, -up.dot(out.z));
  if (out.y.lengthSq() < 1e-8) {
    out.y.set(0, 1, 0).addScaledVector(out.z, -out.z.y);
    if (out.y.lengthSq() < 1e-8) out.y.set(1, 0, 0);
  }
  out.y.normalize();
  out.x.crossVectors(out.y, out.z);
  return out;
}

// Orientation of a rod from a to b: its length along z, its broad face turned toward `up`.
const frame = { x: tmpX, y: tmpY, z: tmpZ, length: 1 };
export function rodMatrix(a, b, up, widthScale, out) {
  rodFrame(a, b, up, frame);
  tmpM.addVectors(a, b).multiplyScalar(0.5);
  basis.makeBasis(tmpX.multiplyScalar(ROD_WIDTH * widthScale), tmpY.multiplyScalar(ROD_DEPTH * widthScale), tmpZ.multiplyScalar(frame.length));
  basis.setPosition(tmpM);
  return out.copy(basis);
}

export class RodPool {
  // onTop: drawn over everything else, untouched by shadow (the tray's t'an, on the glass).
  constructor(scene, capacity = 256, { onTop = false } = {}) {
    this.capacity = capacity;
    const geometry = rodGeometry();
    this.glow = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.glow.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aGlow', this.glow);
    // How far each corner of each end is drawn back (mitreAtJunctions).
    this.trimA = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.trimB = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.trimA.setUsage(THREE.DynamicDrawUsage);
    this.trimB.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aTrimA', this.trimA);
    geometry.setAttribute('aTrimB', this.trimB);
    this.mesh = new THREE.InstancedMesh(geometry, rodMaterial(), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = !onTop;
    this.mesh.receiveShadow = !onTop;
    if (onTop) {
      this.mesh.material.depthTest = false;
      this.mesh.material.depthWrite = false;
      this.mesh.renderOrder = 10;
    }
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.matrix = new THREE.Matrix4();
  }

  begin() {
    this.mesh.count = 0;
  }

  // Draw one rod between world points a and b this frame (its ends mitred by `trims`, if given).
  push(a, b, up, blue = 0, amber = 0, widthScale = 1, dark = 0, trims = null) {
    const i = this.mesh.count;
    if (i >= this.capacity) return;
    rodMatrix(a, b, up, widthScale, this.matrix);
    this.mesh.setMatrixAt(i, this.matrix);
    this.glow.setXYZ(i, blue, amber, dark);
    if (trims) {
      this.trimA.setXYZW(i, trims[0], trims[1], trims[2], trims[3]);
      this.trimB.setXYZW(i, trims[4], trims[5], trims[6], trims[7]);
    } else {
      this.trimA.setXYZW(i, 0, 0, 0, 0);
      this.trimB.setXYZW(i, 0, 0, 0, 0);
    }
    this.mesh.count = i + 1;
  }

  end() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.needsUpdate = true;
    this.trimA.needsUpdate = true;
    this.trimB.needsUpdate = true;
  }
}

// Ghosts: where t'an would go - the ring a loop would become - drawn as faint blue light.
export class Ghosts {
  constructor(scene, capacity = 16) {
    this.capacity = capacity;
    const material = new THREE.MeshBasicMaterial({
      color: BLUE,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 9;
    scene.add(this.mesh);
    this.matrix = new THREE.Matrix4();
  }

  begin() {
    this.mesh.count = 0;
  }

  push(a, b, up, opacity = 1) {
    const i = this.mesh.count;
    if (i >= this.capacity) return;
    rodMatrix(a, b, up, 1.15, this.matrix);
    this.mesh.setMatrixAt(i, this.matrix);
    this.mesh.material.opacity = 0.32 * opacity;
    this.mesh.count = i + 1;
  }

  end() {
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Additive halos: a camera-facing ribbon along each glowing segment.
export class Halos {
  constructor(scene, capacity = 256) {
    this.capacity = capacity;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.b = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.params = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    for (const attr of [this.a, this.b, this.params]) attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this.a);
    g.setAttribute('iB', this.b);
    g.setAttribute('iParams', this.params);
    g.instanceCount = 0;
    this.geometry = g;
    const material = new THREE.ShaderMaterial({
      uniforms: { uBlue: { value: BLUE }, uAmber: { value: AMBER } },
      vertexShader: /* glsl */ `
        attribute vec2 corner;
        attribute vec3 iA;
        attribute vec3 iB;
        attribute vec3 iParams;
        varying vec2 vLocal;
        varying float vHalf;
        varying float vWidth;
        varying float vIntensity;
        varying float vMix;
        void main() {
          vec3 a = (viewMatrix * vec4(iA, 1.0)).xyz;
          vec3 b = (viewMatrix * vec4(iB, 1.0)).xyz;
          vec3 mid = 0.5 * (a + b);
          vec3 d = b - a;
          float len = length(d);
          vec3 axis = len > 1e-5 ? d / len : vec3(1.0, 0.0, 0.0);
          vec3 side = cross(axis, normalize(-mid));
          float sl = length(side);
          side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
          float w = iParams.y;
          float halfLen = 0.5 * len;
          vLocal = vec2(corner.x * (halfLen + w), corner.y * w);
          vHalf = halfLen;
          vWidth = w;
          vIntensity = iParams.x;
          vMix = iParams.z;
          gl_Position = projectionMatrix * vec4(mid + axis * vLocal.x + side * vLocal.y, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBlue;
        uniform vec3 uAmber;
        varying vec2 vLocal;
        varying float vHalf;
        varying float vWidth;
        varying float vIntensity;
        varying float vMix;
        void main() {
          float dx = max(abs(vLocal.x) - vHalf, 0.0);
          float d = length(vec2(dx, vLocal.y)) / vWidth;
          // A soft falloff, never a hard edge.
          float a = exp(-d * d * 3.2) * (1.0 - smoothstep(0.6, 1.0, d)) * vIntensity;
          gl_FragColor = vec4(mix(uBlue, uAmber, vMix), a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
  }

  begin() {
    this.geometry.instanceCount = 0;
  }

  push(a, b, intensity, width = 0.06, amber = 0) {
    const i = this.geometry.instanceCount;
    if (i >= this.capacity || intensity < 0.004) return;
    this.a.setXYZ(i, a.x, a.y, a.z);
    this.b.setXYZ(i, b.x, b.y, b.z);
    this.params.setXYZ(i, intensity, width, amber);
    this.geometry.instanceCount = i + 1;
  }

  end() {
    this.a.needsUpdate = true;
    this.b.needsUpdate = true;
    this.params.needsUpdate = true;
  }
}
