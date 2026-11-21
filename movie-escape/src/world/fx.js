import * as THREE from 'three';

// Pooled particle system using a single InstancedMesh (one draw call).
export class FX {
  constructor(scene, max = 600) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(0.12, 0);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x222222 });
    this.mesh = new THREE.InstancedMesh(geo, m, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.parts = [];
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
    // colour attribute
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    // expanding rings (shockwaves, pickups)
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.scene = scene;
  }

  spawn(pos, vel, color, life = 1, size = 1, grav = 18, drag = 0.98, spin = 6) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({ p: pos.clone(), v: vel, c: new THREE.Color(color), life, t: life, size, grav, drag, rot: Math.random() * 6, spin: (Math.random() - 0.5) * spin });
  }

  burst(pos, color, n = 16, speed = 7, opts = {}) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * (opts.up ?? 0.9) + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      const c = Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color;
      this.spawn(pos, v, c, (opts.life ?? 0.9) * (0.6 + Math.random() * 0.6), (opts.size ?? 1) * (0.6 + Math.random() * 0.8), opts.grav ?? 16);
    }
  }

  confetti(pos, n = 60) {
    const cols = ['#ff4f9a', '#ffd23f', '#27d3c3', '#8b5cf6', '#ff8a3d', '#3d8bff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 12, 8 + Math.random() * 10, (Math.random() - 0.5) * 12);
      this.spawn(pos, v, cols[i % cols.length], 2 + Math.random() * 1.5, 1.1, 9, 0.96, 14);
    }
  }

  puff(pos, n = 6, color = '#f4eee0') {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const v = new THREE.Vector3(Math.cos(a) * 3, 0.6 + Math.random(), Math.sin(a) * 3);
      this.spawn(pos.clone().setY(pos.y + 0.1), v, color, 0.45, 1.6, -1, 0.9, 2);
    }
  }

  ring(pos, color = '#ffffff', maxR = 3, dur = 0.5, opacity = 0.8) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos);
    this.scene.add(m);
    this.rings.push({ m, t: 0, dur, maxR, opacity });
  }

  update(dt) {
    const d = this.dummy;
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.t -= dt;
      if (q.t <= 0) { this.parts.splice(i, 1); continue; }
      q.v.y -= q.grav * dt;
      q.v.multiplyScalar(Math.pow(q.drag, dt * 60));
      q.p.addScaledVector(q.v, dt);
      q.rot += q.spin * dt;
    }
    for (const q of this.parts) {
      const k = q.t / q.life;
      const s = q.size * (k < 0.3 ? k / 0.3 : 1);
      d.position.copy(q.p); d.rotation.set(q.rot, q.rot * 0.7, 0); d.scale.setScalar(s);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.mesh.instanceColor.setXYZ(n, q.c.r, q.c.g, q.c.b);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); continue; }
      r.m.scale.setScalar(0.2 + k * r.maxR);
      r.m.material.opacity = r.opacity * (1 - k);
    }
  }
}
