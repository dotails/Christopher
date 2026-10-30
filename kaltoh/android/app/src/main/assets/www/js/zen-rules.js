// Zen: a calm way to play, alone. No opponent, no score, no hidden forces, no strain; nothing
// falls. Pure logic: no rendering, no DOM, so it also runs under Node for tests.
//
// It begins as a splintering nest of t'an gathered about a centre mass (rules.js). A t'an laid
// across any two pieces rests there, wherever they are touched - no reach, no harmony, no loop.
// Every ten t'an placed, the whole assembly takes a form of many forms (forms-rules.js), at the
// size and place many forms builds its outer shell: each t'an glides to a rod of the form, those
// the form has no rod for fade away, and rods no t'an reaches are filled by new t'an. Five forms,
// each richer than the last; after the fifth it is fully formed.
//
// Units are the rules' (a t'an of the nest is rules.js ROD_LENGTH long), about the kal-toh's centre.
import * as G from './geom.js';
import * as R from './rules.js';
import { buildForm } from './forms-rules.js';

// T'an placed between one form and the next.
export const PER_FORM = 10;
// The forms it takes, each with more rods than the last: the truncated tetrahedron (18 rods:
// triangles and hexagons), the cuboctahedron (24: triangles and squares), the octagonal antiprism
// (32: octagons and triangles), the truncated octahedron (36: squares and hexagons) and the
// rhombicuboctahedron (48: triangles and squares).
export const FORMS = ['tetra', 'cubocta', 'anti8', 'octa', 'rhombi'];
// A form's radius: many forms' outer shell (forms.js SPHERE), so it stands where many forms
// stands, clear of the basin however it is turned.
export const RADIUS = 0.44;
// A form is tried turned this many ways before it is taken.
const TURNS = 48;
const T = R.ROD_THICKNESS;

const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

export function createGame(options = {}) {
  const seed = options.seed ?? (Math.random() * 2 ** 32) >>> 0;
  const { nest } = R.startingNest({ seed });
  const rods = nest.liveRods.map((r, i) => ({ id: i, a: [...r.a], b: [...r.b], kind: r.kind === 'core' ? 'core' : 'nest', edge: -1 }));
  return {
    seed,
    rng: G.mulberry32((seed ^ 0x2545f491) >>> 0),
    radius: options.radius ?? RADIUS,
    forms: options.forms ?? FORMS,
    per: options.per ?? PER_FORM,
    rods, // the t'an of the kal-toh: { id, a, b, kind: core | nest | placed | form, edge }
    next: rods.length, // the next t'an's id
    length: R.ROD_LENGTH, // a t'an's own length: the nest's, then the rods' of the form taken
    stage: 0, // forms taken: 0, the nest; then 1, 2, ... as each is taken
    form: null, // the key of the form taken last
    turn: G.qIdentity(), // how it is turned
    placed: 0, // t'an placed toward the next form
    total: 0, // t'an placed in all
    complete: false,
    history: [],
  };
}

export const rodOf = (state, id) => state.rods.find((r) => r.id === id) ?? null;

// The form taken last, or null while it is the nest.
export const formOf = (state) => (state.form ? buildForm(state.form) : null);

// Where a t'an rests across two pieces, touched at hitA and hitB ({ rod, s }: a t'an and how far
// along it): against each one's side, toward `toward` (the eye), offset by its thickness square to
// both, centred between them at its own length - or, the pieces being further apart than that,
// just long enough to rest across both. Refused only when both ends are on one piece.
export function placement(state, hitA, hitB, toward) {
  if (state.complete) return { ok: false, reason: 'complete' };
  if (!hitA || !hitB) return { ok: false, reason: 'none' };
  if (hitA.rod === hitB.rod) return { ok: false, reason: 'same' };
  const ra = rodOf(state, hitA.rod);
  const rb = rodOf(state, hitB.rod);
  if (!ra || !rb) return { ok: false, reason: 'gone' };
  const pa = G.lerp(ra.a, ra.b, hitA.s);
  const pb = G.lerp(rb.a, rb.b, hitB.s);
  if (G.dist(pa, pb) < T) return { ok: false, reason: 'same' };
  const side = (rod, p, dir) => {
    const u = G.normalize(G.sub(rod.b, rod.a));
    let n = G.cross(u, dir);
    if (G.length(n) < 1e-6) n = G.perpendicular(u);
    n = G.normalize(n);
    if (G.dot(n, G.sub(toward, p)) < 0) n = G.scale(n, -1);
    return G.madd(p, n, T);
  };
  let qa = pa;
  let qb = pb;
  for (let i = 0; i < 3; i++) {
    const dir = G.normalize(G.sub(qb, qa));
    qa = side(ra, pa, dir);
    qb = side(rb, pb, dir);
  }
  const dir = G.normalize(G.sub(qb, qa));
  const span = G.dist(qa, qb);
  const length = Math.max(state.length, span + 2 * T);
  const mid = G.lerp(qa, qb, 0.5);
  return { ok: true, a: G.madd(mid, dir, -length / 2), b: G.madd(mid, dir, length / 2), span, length, pieces: [hitA.rod, hitB.rod] };
}

// Place a t'an where placement() found it rests. The tenth since the last form brings the next
// form (`transform`, as transform() reports it).
export function place(state, pose) {
  if (state.complete || !pose?.ok) return null;
  const rod = { id: state.next++, a: [...pose.a], b: [...pose.b], kind: 'placed', edge: -1 };
  state.rods.push(rod);
  state.placed += 1;
  state.total += 1;
  state.history.push({ rod: rod.id, stage: state.stage, on: [...pose.pieces] });
  const result = { rod: rod.id, placed: state.placed, total: state.total, transform: null };
  if (state.placed >= state.per) result.transform = transform(state);
  return result;
}

// The whole assembly takes the next form: each rod of the form is matched to a t'an so that all
// together they travel least (the form turned whichever of many ways asks least of them), each
// end to its nearer end of the rod. Reports where each matched t'an goes (`moves`), those the form
// has no rod for (`faded`, gone from the kal-toh), and the new t'an that fill rods none reached
// (`added`).
export function transform(state) {
  if (state.complete) return null;
  const key = state.forms[state.stage];
  const form = buildForm(key);
  const place = (q) => form.edges.map(([u, v]) => [G.scale(G.qRotate(q, form.verts[u]), state.radius), G.scale(G.qRotate(q, form.verts[v]), state.radius)]);
  let best = null;
  for (let i = 0; i < TURNS; i++) {
    const q = i === 0 ? state.turn : randomTurn(state.rng);
    const edges = place(q);
    const m = match(state.rods, edges);
    if (!best || m.total < best.total) best = { q, edges, ...m };
  }
  const moves = [];
  const faded = [];
  const added = [];
  const rods = [];
  const filled = new Set();
  state.rods.forEach((rod, i) => {
    const e = best.edgeOf[i];
    if (e < 0) {
      faded.push({ rod: rod.id, from: { a: rod.a, b: rod.b } });
      return;
    }
    const [ea, eb] = best.edges[e];
    const flip = d2(rod.a, eb) + d2(rod.b, ea) < d2(rod.a, ea) + d2(rod.b, eb);
    const to = flip ? { a: eb, b: ea } : { a: ea, b: eb };
    moves.push({ rod: rod.id, edge: e, from: { a: rod.a, b: rod.b }, to });
    rods.push({ id: rod.id, a: [...to.a], b: [...to.b], kind: 'form', edge: e });
    filled.add(e);
  });
  best.edges.forEach(([ea, eb], e) => {
    if (filled.has(e)) return;
    const rod = { id: state.next++, a: [...ea], b: [...eb], kind: 'form', edge: e };
    added.push({ rod: rod.id, edge: e, to: { a: ea, b: eb } });
    rods.push(rod);
  });
  rods.sort((p, q) => p.edge - q.edge);
  state.rods = rods;
  state.stage += 1;
  state.form = key;
  state.turn = best.q;
  state.length = state.radius / form.rho;
  state.placed = 0;
  state.complete = state.stage >= state.forms.length;
  return { stage: state.stage, form: key, turn: best.q, length: state.length, moves, faded, added, complete: state.complete };
}

// How far it has come: forms taken (of how many), t'an placed toward the next form (of how many).
export function progress(state) {
  return { stage: state.stage, forms: state.forms.length, form: state.form, placed: state.placed, per: state.per, total: state.total, complete: state.complete };
}

// --- Matching t'an to rods ---------------------------------------------------------------------

// How far a t'an goes to lie along a rod: the squared distances its ends travel, each to the
// nearer end. (Squared, so many short journeys are preferred to a few long ones, and paths seldom
// cross.)
function travel(rod, [ea, eb]) {
  return Math.min(d2(rod.a, ea) + d2(rod.b, eb), d2(rod.a, eb) + d2(rod.b, ea));
}

// Every rod of the form to its own t'an, or every t'an to its own rod when there are fewer t'an,
// so that together they travel least. edgeOf[i]: the rod t'an i goes to, or -1. (Exported for
// tests.)
export function match(rods, edges) {
  const n = rods.length;
  const m = edges.length;
  const byRod = n <= m; // rows are the t'an, or else the rods
  const rows = byRod ? n : m;
  const cols = byRod ? m : n;
  const cost = new Float64Array(rows * cols);
  for (let i = 0; i < n; i++) {
    for (let e = 0; e < m; e++) cost[byRod ? i * cols + e : e * cols + i] = travel(rods[i], edges[e]);
  }
  const pick = hungarian(cost, rows, cols);
  const edgeOf = new Int32Array(n).fill(-1);
  let total = 0;
  for (let r = 0; r < rows; r++) {
    total += cost[r * cols + pick[r]];
    if (byRod) edgeOf[r] = pick[r];
    else edgeOf[pick[r]] = r;
  }
  return { edgeOf, total };
}

// The least-cost way to give each row a column of its own (the Hungarian method, with potentials;
// rows <= cols). cost[r * cols + c]. Returns each row's column.
function hungarian(cost, rows, cols) {
  const u = new Float64Array(rows + 1);
  const v = new Float64Array(cols + 1);
  const p = new Int32Array(cols + 1); // the row (1-based) holding each column, 0 for none
  const way = new Int32Array(cols + 1);
  const minv = new Float64Array(cols + 1);
  const used = new Uint8Array(cols + 1);
  for (let i = 1; i <= rows; i++) {
    p[0] = i;
    let j0 = 0;
    minv.fill(Infinity);
    used.fill(0);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= cols; j++) {
        if (used[j]) continue;
        const cur = cost[(i0 - 1) * cols + j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= cols; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const out = new Int32Array(rows).fill(-1);
  for (let j = 1; j <= cols; j++) if (p[j]) out[p[j] - 1] = j - 1;
  return out;
}

// Any way up: a uniformly random turn (a unit quaternion, [x, y, z, w]).
function randomTurn(rng) {
  const u = rng();
  const a = rng() * 2 * Math.PI;
  const b = rng() * 2 * Math.PI;
  const s = Math.sqrt(1 - u);
  const t = Math.sqrt(u);
  return [s * Math.sin(a), s * Math.cos(a), t * Math.sin(b), t * Math.cos(b)];
}
