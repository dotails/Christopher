// Drawing t'an: each is a scaled cube (12 triangles) of polished metal, its faces flat mirrors
// with a trace of aluminium's pale grey over what they reflect - all drawn as one instanced mesh.
// Only the t'an waiting in the tray has its faces gently domed, so that it shows the room behind
// the player whole enough to make out Tuvok.
// Glow (the blue of order, the amber of strain) is added light per instance; soft additive halos
// give the glow its bloom.
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

// A unit box along z (length 1, cross-section 1 x 1), its faces flat.
function rodGeometry() {
  const positions = [];
  const normals = [];
  const index = [];
  // One face: normal n, its edges along uDir and v = n x u, which keeps every face wound outward.
  const face = (n, uDir) => {
    const vDir = [n[1] * uDir[2] - n[2] * uDir[1], n[2] * uDir[0] - n[0] * uDir[2], n[0] * uDir[1] - n[1] * uDir[0]];
    const corner = [0, 1, 2].map((k) => 0.5 * n[k] - 0.5 * uDir[k] - 0.5 * vDir[k]);
    const base = positions.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      positions.push(corner[0] + uDir[0] * u + vDir[0] * v, corner[1] + uDir[1] * u + vDir[1] * v, corner[2] + uDir[2] * u + vDir[2] * v);
      normals.push(n[0], n[1], n[2]);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // Long faces, then the end caps.
  for (const n of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]) face(n, [0, 0, 1]);
  face([0, 0, 1], [1, 0, 0]);
  face([0, 0, -1], [1, 0, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(index);
  return g;
}

// A trace of aluminium's own pale grey laid over what the metal mirrors, so that where it reflects
// the dark of the room it is still seen as metal.
const ALUMINIUM = new THREE.Color(0xb8bec5);
const TINT = 0.06;

// How far a domed face's normals turn toward its ends (the tangent of the angle): it reflects a
// wider sweep of the room than a flat face could, curved alike along and across it.
const DOME = Math.tan((25 * Math.PI) / 180);

export function rodMaterial({ dome = false } = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe8ebf0,
    metalness: 1,
    // Mirror-smooth, so the room behind the player is seen in the metal, clearly enough to make
    // out who is there; and as bright as polished aluminium, mirroring the room near its full
    // brightness (the light is dimmed for the table and the stone: scene.js).
    roughness: 0.035,
    envMapIntensity: 4.5,
  });
  // The room is looked up as sharp as the metal is smooth: three.js never lets it be sharper than
  // its coarser 256-texel mip (fine for lights, but it blurs a mirror), so the reflection of the
  // room takes the metal's own roughness.
  const maps = THREE.ShaderChunk.lights_fragment_maps.replace(
    'getIBLRadiance( geometryViewDir, geometryNormal, material.roughness )',
    'getIBLRadiance( geometryViewDir, geometryNormal, mirrorRoughness )',
  );
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlue = { value: BLUE };
    shader.uniforms.uAmber = { value: AMBER };
    shader.uniforms.uAluminium = { value: ALUMINIUM };
    shader.uniforms.uDome = { value: dome ? DOME : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nattribute vec4 aTrimA;\nattribute vec4 aTrimB;\nvarying vec3 vGlow;\nuniform float uDome;')
      .replace(
        '#include <beginnormal_vertex>',
        // A domed long face: its normals turn toward its ends and its edges by as much for each
        // unit of distance from its middle - uDome at the ends - whatever the t'an's length. In the
        // unit box, as the instance's scaling will undo it (three.js divides a normal by the
        // squared scale of each axis, then turns it with the instance).
        `#include <beginnormal_vertex>
#ifdef USE_INSTANCING
if (uDome > 0.0 && abs(normal.z) < 0.5) {
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
      .replace('#include <common>', '#include <common>\nuniform vec3 uBlue;\nuniform vec3 uAmber;\nuniform vec3 uAluminium;\nvarying vec3 vGlow;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nfloat mirrorRoughness = min( roughnessFactor + geometryRoughness, 1.0 );')
      .replace('#include <lights_fragment_maps>', maps)
      .replace(
        '#include <emissivemap_fragment>',
        // x: blue, y: amber, z: fade to darkness (a t'an dissolving away)
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uBlue * vGlow.x * 0.42 + uAmber * vGlow.y * 0.5;\ndiffuseColor.rgb *= 1.0 - vGlow.z;',
      )
      .replace(
        '#include <opaque_fragment>',
        // The aluminium's tint over what is mirrored and lit, the glow left as it is.
        `outgoingLight = mix(outgoingLight - totalEmissiveRadiance, uAluminium * (1.0 - vGlow.z), ${TINT.toFixed(2)}) + totalEmissiveRadiance;
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => (dome ? 'kaltoh-rod-v8-dome' : 'kaltoh-rod-v8');
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
  // dome: its t'an's faces domed (rodMaterial), as the one waiting in the tray is.
  constructor(scene, capacity = 256, { onTop = false, dome = false } = {}) {
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
    this.mesh = new THREE.InstancedMesh(geometry, rodMaterial({ dome }), capacity);
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
