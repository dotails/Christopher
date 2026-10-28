// Drawing t'an: each is a scaled cube (12 triangles) of brushed stainless steel - a light,
// cool aluminium tint, mirror-bright along its length, with fine scratches running lengthwise -
// all drawn as one instanced mesh. Glow (the blue of order, the amber of strain) is added light
// per instance; soft additive halos give the glow its bloom.
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

// A unit box along z (length 1, cross-section 1 x 1) whose long faces are mapped with u running
// down the length, so the brushed grain and the scratches follow the t'an.
function rodGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const index = [];
  // The scratch texture repeats this often along one t'an, and once across each face, so its
  // texels come out about square on the metal.
  const REPEAT = 2.5;
  // One face: normal n, u running along uDir; v = n x u keeps every face wound outward.
  const face = (n, uDir, uScale, vScale) => {
    const vDir = [n[1] * uDir[2] - n[2] * uDir[1], n[2] * uDir[0] - n[0] * uDir[2], n[0] * uDir[1] - n[1] * uDir[0]];
    const corner = [0, 1, 2].map((k) => 0.5 * n[k] - 0.5 * uDir[k] - 0.5 * vDir[k]);
    const base = positions.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      positions.push(corner[0] + uDir[0] * u + vDir[0] * v, corner[1] + uDir[1] * u + vDir[1] * v, corner[2] + uDir[2] * u + vDir[2] * v);
      normals.push(...n);
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

// A tangent-space normal map of lengthwise scratches over a fine brushed grain: each scratch is
// a shallow groove (its two walls tilt opposite ways across the t'an).
function scratchMap() {
  const W = 1024;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);
  const tilt = new Float32Array(W * H); // across-the-grain slope
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Brushed grain: every row its own faint ridge, constant along the length.
  for (let y = 0; y < H; y++) {
    const ridge = (rand() - 0.5) * 0.06;
    for (let x = 0; x < W; x++) tilt[y * W + x] += ridge;
  }
  // Scratches: long, hairline, of varied depth, a few lying at a slight angle.
  for (let i = 0; i < 150; i++) {
    const length = 120 + rand() ** 1.5 * 1400;
    const x0 = rand() * W;
    const y0 = rand() * H;
    const lean = (rand() - 0.5) * 0.012;
    const depth = 0.2 + rand() ** 2 * 0.8;
    for (let s = 0; s < length; s++) {
      const x = Math.floor(x0 + s) % W;
      const y = y0 + lean * s;
      const yi = ((Math.floor(y) % H) + H) % H;
      const fade = Math.sin((s / length) * Math.PI);
      tilt[yi * W + x] += depth * fade;
      tilt[((yi + 1) % H) * W + x] -= depth * fade;
    }
  }
  for (let i = 0; i < W * H; i++) {
    const t = Math.max(-1, Math.min(1, tilt[i]));
    const nz = Math.sqrt(1 - t * t * 0.5);
    img.data[i * 4] = 128;
    img.data[i * 4 + 1] = Math.round(128 + t * 0.7 * 127);
    img.data[i * 4 + 2] = Math.round(nz * 255);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function rodMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe6e9ee,
    metalness: 1,
    roughness: 0.13,
    // Brushed along its length: highlights stretch into streaks down the t'an.
    anisotropy: 0.45,
    anisotropyRotation: 0,
    normalMap: scratchMap(),
    normalScale: new THREE.Vector2(0.28, 0.28),
    clearcoat: 0.35,
    clearcoatRoughness: 0.08,
    envMapIntensity: 2.4,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlue = { value: BLUE };
    shader.uniforms.uAmber = { value: AMBER };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nvarying vec3 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBlue;\nuniform vec3 uAmber;\nvarying vec3 vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        // x: blue, y: amber, z: fade to darkness (a t'an dissolving away)
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uBlue * vGlow.x * 0.42 + uAmber * vGlow.y * 0.5;\ndiffuseColor.rgb *= 1.0 - vGlow.z;',
      );
  };
  material.customProgramCacheKey = () => 'kaltoh-rod-v2';
  return material;
}

// Orientation of a rod from a to b: its length along z, its broad face turned toward `up`.
export function rodMatrix(a, b, up, widthScale, out) {
  tmpZ.subVectors(b, a);
  const len = tmpZ.length() || 1e-6;
  tmpZ.multiplyScalar(1 / len);
  tmpY.copy(up).addScaledVector(tmpZ, -up.dot(tmpZ));
  if (tmpY.lengthSq() < 1e-8) {
    tmpY.set(0, 1, 0).addScaledVector(tmpZ, -tmpZ.y);
    if (tmpY.lengthSq() < 1e-8) tmpY.set(1, 0, 0);
  }
  tmpY.normalize();
  tmpX.crossVectors(tmpY, tmpZ);
  tmpM.addVectors(a, b).multiplyScalar(0.5);
  basis.makeBasis(tmpX.multiplyScalar(ROD_WIDTH * widthScale), tmpY.multiplyScalar(ROD_DEPTH * widthScale), tmpZ.multiplyScalar(len));
  basis.setPosition(tmpM);
  return out.copy(basis);
}

export class RodPool {
  constructor(scene, capacity = 256) {
    this.capacity = capacity;
    const geometry = rodGeometry();
    this.glow = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.glow.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aGlow', this.glow);
    this.mesh = new THREE.InstancedMesh(geometry, rodMaterial(), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.matrix = new THREE.Matrix4();
  }

  begin() {
    this.mesh.count = 0;
  }

  // Draw one rod between world points a and b this frame.
  push(a, b, up, blue = 0, amber = 0, widthScale = 1, dark = 0) {
    const i = this.mesh.count;
    if (i >= this.capacity) return;
    rodMatrix(a, b, up, widthScale, this.matrix);
    this.mesh.setMatrixAt(i, this.matrix);
    this.glow.setXYZ(i, blue, amber, dark);
    this.mesh.count = i + 1;
  }

  end() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.needsUpdate = true;
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
