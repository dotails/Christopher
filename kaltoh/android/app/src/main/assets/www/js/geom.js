// Geometry for rods: small vector and quaternion helpers on [x, y, z] arrays, and closest
// points between segments. Pure functions, no rendering, so the physics runs under Node too.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a) => Math.sqrt(dot(a, a));
export const dist = (a, b) => length(sub(a, b));
export const normalize = (a) => scale(a, 1 / (length(a) || 1));
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Rodrigues rotation of v about unit axis k by angle t.
export function rotate(v, k, t) {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

// Any unit vector perpendicular to n.
export function perpendicular(n) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize(cross(n, a));
}

// An orthonormal frame [e1, e2] spanning the plane perpendicular to the unit axis.
export function frameAround(axis) {
  const e1 = perpendicular(axis);
  return [e1, cross(axis, e1)];
}

// Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection).
// Returns parameters s, t in [0, 1], the points c1, c2 and the squared distance.
export function closestSegSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s;
  let t;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = madd(p1, d1, s);
  const c2 = madd(p2, d2, t);
  const d = sub(c1, c2);
  return { s, t, c1, c2, d2: dot(d, d) };
}

// Closest point on segment a-b to point p.
export function closestPointSeg(p, a, b) {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1);
  const c = madd(a, ab, t);
  const d = sub(p, c);
  return { t, c, d2: dot(d, d) };
}

// Closest points between an infinite ray (origin o, unit direction u, t >= 0) and segment a-b.
export function closestRaySeg(o, u, a, b) {
  const far = madd(o, u, 1000);
  const r = closestSegSeg(o, far, a, b);
  return { along: r.s * 1000, t: r.t, onRay: r.c1, onSeg: r.c2, d2: r.d2 };
}

// --- Quaternions as [x, y, z, w] -------------------------------------------------------------

export const qIdentity = () => [0, 0, 0, 1];

export function qAxisAngle(axis, angle) {
  const h = angle / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

export function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function qNormalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];

export function qRotate(q, v) {
  const u = [q[0], q[1], q[2]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[3])), cross(u, t));
}

// Rigid transform of a point: rotate about the origin, then translate.
export const transformPoint = (q, p, v) => add(qRotate(q, v), p);
export const inverseTransformPoint = (q, p, v) => qRotate(qConj(q), sub(v, p));

// Deterministic PRNG so a seed reproduces a game exactly.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A uniformly random unit vector.
export function randomUnit(rng) {
  const z = rng() * 2 - 1;
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), z, r * Math.sin(a)];
}
