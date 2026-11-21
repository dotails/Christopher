import * as THREE from 'three';

// A tiny purpose-built collision world for a capsule-ish character against
// axis-aligned boxes and vertical cylinders (both can move / rotate).

export class PhysicsWorld {
  constructor() {
    this.sets = new Map(); // key -> array of colliders
    this.active = [];
  }

  _add(key, c) {
    if (!this.sets.has(key)) this.sets.set(key, []);
    this.sets.get(key).push(c);
    c.key = key;
    return c;
  }

  addBox(key, minX, minY, minZ, maxX, maxY, maxZ, opts = {}) {
    return this._add(key, {
      type: 'box',
      min: new THREE.Vector3(minX, minY, minZ),
      max: new THREE.Vector3(maxX, maxY, maxZ),
      delta: new THREE.Vector3(),
      enabled: true,
      ...opts,
    });
  }

  addCyl(key, x, z, r, y0, y1, opts = {}) {
    return this._add(key, {
      type: 'cyl', x, z, r, y0, y1,
      delta: new THREE.Vector3(), dAngle: 0,
      enabled: true,
      ...opts,
    });
  }

  remove(c) {
    const arr = this.sets.get(c.key);
    if (!arr) return;
    const i = arr.indexOf(c);
    if (i >= 0) arr.splice(i, 1);
    this.setActive(this.activeKeys || []);
  }

  setActive(keys) {
    this.activeKeys = keys;
    this.active = [];
    for (const k of keys) { const a = this.sets.get(k); if (a) this.active.push(...a); }
  }

  // Move a box collider to a new centre (keeping size) and record its delta.
  static moveBox(c, cx, cy, cz) {
    const hx = (c.max.x - c.min.x) / 2, hy = (c.max.y - c.min.y) / 2, hz = (c.max.z - c.min.z) / 2;
    const ox = (c.min.x + c.max.x) / 2, oy = (c.min.y + c.max.y) / 2, oz = (c.min.z + c.max.z) / 2;
    c.delta.set(cx - ox, cy - oy, cz - oz);
    c.min.set(cx - hx, cy - hy, cz - hz);
    c.max.set(cx + hx, cy + hy, cz + hz);
  }

  // Resolve a vertical cylinder body (feet at p, radius R, height H) against
  // the active colliders. Returns info about ground contact.
  resolve(body) {
    const p = body.pos, v = body.vel, R = body.radius, H = body.height;
    let grounded = false, ground = null;
    for (const c of this.active) {
      if (!c.enabled) continue;
      if (c.type === 'box') {
        const { min, max } = c;
        if (p.y >= max.y || p.y + H <= min.y) continue;
        const cx = p.x < min.x ? min.x : (p.x > max.x ? max.x : p.x);
        const cz = p.z < min.z ? min.z : (p.z > max.z ? max.z : p.z);
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        const tol = 0.06 + Math.abs(c.delta.y) + Math.max(0, -v.y) * 0.02;
        const penTop = max.y - p.y;
        if ((body.prevY >= max.y - tol || (penTop < 0.42 && body.wasGrounded && v.y <= 0.5)) && v.y <= 0.5) {
          p.y = max.y;
          if (v.y < 0) v.y = 0;
          grounded = true; ground = c;
          continue;
        }
        if (body.prevY + H <= min.y + 0.08 && v.y > 0) {
          p.y = min.y - H; v.y = 0; continue;
        }
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, push = R - d;
          p.x += nx * push; p.z += nz * push;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
          body.wallHit = true;
        } else {
          // centre inside the box footprint: push out along the shallowest axis
          const l = p.x - min.x, r = max.x - p.x, b = p.z - min.z, f = max.z - p.z;
          const m = Math.min(l, r, b, f);
          if (m === l) { p.x = min.x - R; v.x = Math.min(v.x, 0); }
          else if (m === r) { p.x = max.x + R; v.x = Math.max(v.x, 0); }
          else if (m === b) { p.z = min.z - R; v.z = Math.min(v.z, 0); }
          else { p.z = max.z + R; v.z = Math.max(v.z, 0); }
          body.wallHit = true;
        }
      } else {
        // vertical cylinder
        if (p.y >= c.y1 || p.y + H <= c.y0) continue;
        const dx = p.x - c.x, dz = p.z - c.z;
        const d2 = dx * dx + dz * dz;
        const rr = c.r + R;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        const onTop = d < c.r + R * 0.55;
        const tol = 0.06 + Math.abs(c.delta.y) + Math.max(0, -v.y) * 0.02;
        if (onTop && (body.prevY >= c.y1 - tol || (c.y1 - p.y < 0.42 && body.wasGrounded)) && v.y <= 0.5) {
          p.y = c.y1; if (v.y < 0) v.y = 0; grounded = true; ground = c; continue;
        }
        if (body.prevY + H <= c.y0 + 0.08 && v.y > 0) { p.y = c.y0 - H; v.y = 0; continue; }
        if (d > 1e-6) {
          const nx = dx / d, nz = dz / d, push = rr - d;
          p.x += nx * push; p.z += nz * push;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
        } else { p.x += rr; }
        body.wallHit = true;
      }
    }
    return { grounded, ground };
  }

  // Ground height under a point (for shadows / blob placement / spawning)
  groundHeight(x, z, fromY = 100) {
    let best = -Infinity;
    for (const c of this.active) {
      if (!c.enabled) continue;
      if (c.type === 'box') {
        if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && c.max.y <= fromY && c.max.y > best) best = c.max.y;
      } else {
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz <= c.r * c.r && c.y1 <= fromY && c.y1 > best) best = c.y1;
      }
    }
    return best;
  }
}
