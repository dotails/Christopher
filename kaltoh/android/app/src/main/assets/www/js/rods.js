// Rendering of t'an: each is a scaled cube (12 triangles) of polished metal, all drawn as one
// instanced mesh, plus a soft additive halo layer for the blue glow of order.
import * as THREE from '../vendor/three.module.min.js';

export const ROD_WIDTH = 0.026;
export const ROD_DEPTH = 0.016;
export const BLUE = new THREE.Color(0x4cc6ff);
export const AMBER = new THREE.Color(0xff8a3c);

const tmpX = new THREE.Vector3();
const tmpY = new THREE.Vector3();
const tmpZ = new THREE.Vector3();
const tmpM = new THREE.Vector3();
const basis = new THREE.Matrix4();

// Orientation of a rod from a to b: its length runs along z, its broad face turned toward `up`.
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
  basis.makeBasis(
    tmpX.multiplyScalar(ROD_WIDTH * widthScale),
    tmpY.multiplyScalar(ROD_DEPTH * widthScale),
    tmpZ.multiplyScalar(len),
  );
  basis.setPosition(tmpM);
  return out.copy(basis);
}

export class RodPool {
  constructor(scene, capacity = 96) {
    this.capacity = capacity;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    this.glow = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    this.glow.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aGlow', this.glow);

    const material = new THREE.MeshStandardMaterial({
      // Polished chrome: a mirror of the room around it.
      color: 0xffffff,
      metalness: 1,
      roughness: 0.2,
      envMapIntensity: 3.3,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBlue = { value: BLUE };
      shader.uniforms.uAmber = { value: AMBER };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aGlow;\nvarying vec2 vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uBlue;\nuniform vec3 uAmber;\nvarying vec2 vGlow;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uBlue * vGlow.x * 0.55 + uAmber * vGlow.y * 0.6;',
        );
    };
    material.customProgramCacheKey = () => 'kaltoh-rod';

    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
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
  push(a, b, up, blue = 0, amber = 0, widthScale = 1) {
    const i = this.mesh.count;
    if (i >= this.capacity) return;
    rodMatrix(a, b, up, widthScale, this.matrix);
    this.mesh.setMatrixAt(i, this.matrix);
    this.glow.setXY(i, blue, amber);
    this.mesh.count = i + 1;
  }

  end() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.needsUpdate = true;
  }
}

// Additive halos: a camera-facing ribbon along each glowing segment, or a disc for a point.
export class Halos {
  constructor(scene, capacity = 160) {
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
          float a = exp(-d * d * 2.4) * (1.0 - smoothstep(0.7, 1.0, d)) * vIntensity;
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

  push(a, b, intensity, width = 0.055, amber = 0) {
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
