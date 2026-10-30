// The table the kal-toh stands on: a silver pedestal table (from the compact mesh written by
// tools/convert_table.py), its top plates level with the floor the stone rests on, turned so the
// groove down its middle runs across the view. Plain silver (the model's own texture is left
// aside: its patches looked speckled). Its satin metal mirrors the room as the eye sees it
// beyond the kal-toh, out of focus (stage.skyEnvironment); and in its top, the stone and the t'an
// on it - drawn a second time each frame as the top would show them, a little softened.
import * as THREE from '../vendor/three.module.min.js';
import { FLOOR } from './scene.js';

// World units per model unit: the top some three times the stone's breadth.
const SCALE = 3.1;
// The top in world units, about the stone's axis: half its width (0.95 in the model, table.json)
// and the radius of its rounded corners. Fallen t'an lie on it, and off its edge they fall away.
export const TOP = { half: 0.95 * SCALE, corner: 0.3 * SCALE };

// The mirror in the top: everything drawn again from the eye turned over in the plane of the top
// (the view reflected, and the image flipped left to right so that faces still face the same way
// and three.js culls and lights them as it should), into a target half the screen's size whose
// smaller mipmaps soften it as a satin finish would.
const FLIP = new THREE.Matrix4().set(1, 0, 0, 0, 0, -1, 0, 2 * FLOOR, 0, 0, 1, 0, 0, 0, 0, 1);
const MIRROR_X = new THREE.Matrix4().makeScale(-1, 1, 1);

export async function loadTable(stage) {
  const bin = await fetch('assets/table.bin').then((r) => r.arrayBuffer());
  const view = new DataView(bin);
  const magic = String.fromCharCode(...new Uint8Array(bin, 0, 4));
  if (magic !== 'KTT1') throw new Error('table.bin: bad header');
  const count = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);
  const extent = [view.getFloat32(12, true), view.getFloat32(16, true), view.getFloat32(20, true)];
  let offset = 24;
  const qp = new Int16Array(bin, offset, count * 3);
  offset += count * 6;
  const qn = new Int8Array(bin, offset, count * 4);
  offset += count * 4;
  offset += count * 4; // texture coordinates, not needed: the table is plain silver
  offset = (offset + 3) & ~3; // the indices start on a four-byte boundary
  const index = new Uint32Array(bin, offset, indexCount);

  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      position[i * 3 + k] = (qp[i * 3 + k] / 32767) * extent[k];
      normal[i * 3 + k] = qn[i * 4 + k] / 127;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();

  const target = new THREE.WebGLRenderTarget(1, 1, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const screen = new THREE.Vector2(1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xc9ccd1,
    metalness: 0.8,
    roughness: 0.3,
    envMap: stage.skyEnvironment,
    envMapIntensity: 1.2,
  });
  material.envMapRotation.copy(stage.scene.environmentRotation);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tMirror = { value: target.texture };
    shader.uniforms.uScreen = { value: screen };
    shader.uniforms.uTop = { value: FLOOR };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vHeight;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHeight = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tMirror;\nuniform vec2 uScreen;\nuniform float uTop;\nvarying float vHeight;')
      .replace(
        '#include <lights_fragment_maps>',
        // Where the top faces up, what stands on it is mirrored over the room it mirrors (the
        // mirror's image is flipped left to right; its alpha is where something was drawn).
        `#include <lights_fragment_maps>
{
  float up = inverseTransformDirection(normal, viewMatrix).y;
  float onTop = smoothstep(0.9, 0.97, up) * (1.0 - smoothstep(0.08, 0.2, abs(vHeight - uTop)));
  vec2 st = gl_FragCoord.xy / uScreen;
  vec4 seen = textureLod(tMirror, vec2(1.0 - st.x, st.y), 1.8);
  radiance = mix(radiance, seen.rgb / max(seen.a, 1e-3), clamp(seen.a, 0.0, 1.0) * onTop);
}`,
      );
  };
  material.customProgramCacheKey = () => 'kaltoh-table-v2';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(SCALE);
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(0, FLOOR, 0);
  mesh.receiveShadow = true;
  stage.scene.add(mesh);

  const eye = new THREE.PerspectiveCamera();
  eye.matrixAutoUpdate = false;
  eye.matrixWorldAutoUpdate = false;
  const clear = new THREE.Color();
  const table = { mesh, mirror: true, reflect };

  // Draw what the top mirrors, before the scene itself; `hidden`: what the mirror does not show
  // (the room, which the table mirrors by its own lights, and the t'an on the glass). Before the
  // scene has first been drawn (and its shadows with it) the mirror is only cleared.
  function reflect(hidden) {
    const { renderer, scene, camera } = stage;
    if (!table.mirror) return;
    renderer.getDrawingBufferSize(screen);
    const w = Math.max(1, Math.round(screen.x / 2));
    const h = Math.max(1, Math.round(screen.y / 2));
    if (target.width !== w || target.height !== h) target.setSize(w, h);
    eye.matrixWorld.multiplyMatrices(FLIP, camera.matrixWorld);
    eye.matrixWorldInverse.copy(eye.matrixWorld).invert();
    eye.projectionMatrix.multiplyMatrices(MIRROR_X, camera.projectionMatrix);
    eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();
    const shown = hidden.map((o) => o.visible);
    mesh.visible = false;
    for (const o of hidden) o.visible = false;
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.getClearColor(clear);
    const alpha = renderer.getClearAlpha();
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    if (renderer.info.render.frame > 0) renderer.render(scene, eye);
    renderer.setRenderTarget(before);
    renderer.setClearColor(clear, alpha);
    renderer.shadowMap.autoUpdate = shadows;
    hidden.forEach((o, i) => (o.visible = shown[i]));
    mesh.visible = true;
  }

  return table;
}
