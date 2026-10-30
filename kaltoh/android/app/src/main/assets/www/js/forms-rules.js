// Many forms: the kal-toh built rather than found, and a new form each game. Pure logic: no
// rendering, no DOM, so it also runs under Node for tests.
//
// The hidden form is drawn at random from a family of solids whose t'an are all one length and
// whose loops are of more than one kind: triangles and hexagons, squares and octagons, pentagons
// and squares, and more. The kal-toh will be two of it, one within the other, joined junction to
// junction by struts.
//
// A game starts from the inner form's spanning tree with every joint twisted at random: its order
// is hidden in the chaos, but every joint angle is true, so the angles that repeat tell which
// loops it will close. A sample of its pattern - some of the loops about one junction - is
// already closed in its true shape, and loose t'an hang among it as noise.
//   harmony - two tips that are true neighbours: the loop the new t'an closes pulls toward its
//             true shape. A loop of the form closed whole finds its equilibrium and holds for
//             good, and struts brace outward from each of its junctions.
//   discord - two tips that are not (or the tip of a loose t'an, noise): the new t'an falls,
//             shaking loose the newest bond at those tips that no closed loop holds. Noise that
//             is touched falls away; so does noise about a junction whose loops are all closed.
// When the inner form is whole, struts stand out from every junction and the same form is built
// again on their tips, larger: the outer shell, its loops closing as the inner's did. Both shells
// whole, the kal-toh is complete.
//
// Tips: an inner junction v is tip v; the tip of its strut, V + v; the free tip of loose t'an i,
// 2V + i (V junctions in the form).

import { mulberry32, vec } from './classic-rules.js';

const { add, sub, scale, dot, cross, length, normalize, rotate } = vec;

// The outer shell's radius is 1; the inner's, this. Its rods are the outer's at the same scale.
export const INNER = 0.64;
// A t'an joins only tips about its own length apart as the jumble lies (as in the original game).
export const REACH = [0.75, 1.25];

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---------------------------------------------------------------------------------------------
// The forms.

const SQ2 = Math.SQRT2;
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

// Every arrangement of a point's coordinates with every choice of sign (or, `even`, only those with
// an even number of minus signs).
function arrangements(base, even = false) {
  const out = new Map();
  for (const p of PERMS) {
    for (let signs = 0; signs < 8; signs++) {
      const q = p.map((i, k) => base[i] * (signs & (1 << k) ? -1 : 1));
      if (even && q.filter((x) => x < 0).length % 2) continue;
      out.set(q.map((x) => x.toFixed(6)).join(','), q);
    }
  }
  return [...out.values()];
}

// Two rings of n about the vertical, half a rod apart: a prism; turned half a step and drawn
// together until their slanting rods are a rod long: an antiprism. (Rods of length 1.)
function rings(n, twist) {
  const r = 1 / (2 * Math.sin(Math.PI / n));
  const h = twist ? Math.sqrt(1 - (2 * r * Math.sin(Math.PI / (2 * n))) ** 2) : 1;
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    const b = a + (twist ? Math.PI / n : 0);
    out.push([r * Math.cos(a), h / 2, r * Math.sin(a)], [r * Math.cos(b), -h / 2, r * Math.sin(b)]);
  }
  return out;
}

// Each form's name, in Vulcan (Golic Vulcan, see docs/vulcan.md) and in Standard. A solid is named
// by its faces, as the Vulcan dictionaries name keh-muk, the tetrahedron, and sheh-muk, the cube;
// cut at its corners, snem- (removed), as they name snem-sheh-muk, the truncated cube.
const NUMBER = { 4: ['keh-vlaik', 'square'], 5: ['kau-vlaik', 'pentagonal'], 6: ['sheh-vlaik', 'hexagonal'], 7: ['steh-vlaik', 'heptagonal'], 8: ['oh-vlaik', 'octagonal'] };

// The forms a game may hide, by family: each family is as likely as the other two together, and a
// form as likely as the others of its family.
export const FAMILIES = [
  {
    weight: 2,
    forms: [
      { key: 'tetra', v: 'snem-keh-muk', s: 'truncated tetrahedron', points: () => arrangements([3, 1, 1], true) },
      { key: 'cubocta', v: 'leh-keh-muk', s: 'cuboctahedron', points: () => arrangements([1, 1, 0]) },
      { key: 'octa', v: 'snem-oh-muk', s: 'truncated octahedron', points: () => arrangements([0, 1, 2]) },
      { key: 'cube', v: 'snem-sheh-muk', s: 'truncated cube', points: () => arrangements([SQ2 - 1, 1, 1]) },
      { key: 'rhombi', v: 'dah-leh sheh-muk', s: 'rhombicuboctahedron', points: () => arrangements([1, 1, 1 + SQ2]) },
    ],
  },
  {
    weight: 1,
    forms: [5, 6, 7, 8].map((n) => ({ key: `prism${n}`, v: `${NUMBER[n][0]} takurek`, s: `${NUMBER[n][1]} prism`, points: () => rings(n, false) })),
  },
  {
    weight: 1,
    forms: [4, 5, 6, 7, 8].map((n) => ({ key: `anti${n}`, v: `${NUMBER[n][0]} tehn-takurek`, s: `${NUMBER[n][1]} antiprism`, points: () => rings(n, true) })),
  },
];
export const FORM_KEYS = FAMILIES.flatMap((f) => f.forms.map((form) => form.key));

const formCache = new Map();

// A form's junctions on the unit sphere, its rods (the closest pairs), and its loops (the faces,
// each in turn about its own outward normal), all built from its points.
export function buildForm(key) {
  if (formCache.has(key)) return formCache.get(key);
  const spec = FAMILIES.flatMap((f) => f.forms).find((f) => f.key === key);
  if (!spec) throw new Error(`no such form: ${key}`);
  const raw = spec.points();
  const centroid = scale(raw.reduce(add, [0, 0, 0]), 1 / raw.length);
  const centred = raw.map((p) => sub(p, centroid));
  const radius = length(centred[0]);
  const verts = centred.map((p) => scale(p, 1 / radius));
  const V = verts.length;

  let shortest = Infinity;
  for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) shortest = Math.min(shortest, length(sub(verts[i], verts[j])));
  const edges = [];
  const edgeIndex = new Map();
  const neighbours = verts.map(() => []);
  for (let i = 0; i < V; i++) {
    for (let j = i + 1; j < V; j++) {
      if (Math.abs(length(sub(verts[i], verts[j])) - shortest) > shortest * 1e-6) continue;
      edgeIndex.set(i * 256 + j, edges.length);
      edges.push([i, j]);
      neighbours[i].push(j);
      neighbours[j].push(i);
    }
  }

  // About each junction, its neighbours in turn (anticlockwise seen from outside).
  const around = verts.map((p, v) => {
    const n = normalize(p);
    const flat = (w) => sub(verts[w], scale(n, dot(verts[w], n)));
    const ref = normalize(flat(neighbours[v][0]));
    const side = cross(n, ref);
    const angle = (w) => Math.atan2(dot(flat(w), side), dot(flat(w), ref));
    return [...neighbours[v]].sort((a, b) => angle(a) - angle(b));
  });
  // Each loop, walked anticlockwise: arriving at a junction, leave by the rod before the one
  // arrived by.
  const faces = [];
  const walked = new Set();
  for (const [p, q] of edges) {
    for (const [u0, v0] of [[p, q], [q, p]]) {
      if (walked.has(u0 * 256 + v0)) continue;
      const face = [];
      let u = u0;
      let v = v0;
      do {
        walked.add(u * 256 + v);
        face.push(u);
        const ring = around[v];
        const w = ring[(ring.indexOf(u) - 1 + ring.length) % ring.length];
        u = v;
        v = w;
      } while (u !== u0 || v !== v0);
      faces.push(face);
    }
  }
  const edgeOf = (u, v) => edgeIndex.get(u < v ? u * 256 + v : v * 256 + u) ?? -1;
  const edgeFaces = edges.map(() => []);
  faces.forEach((face, f) => face.forEach((v, i) => edgeFaces[edgeOf(v, face[(i + 1) % face.length])].push(f)));
  const facesAt = verts.map(() => []);
  faces.forEach((face, f) => face.forEach((v) => facesAt[v].push(f)));

  const form = {
    key, v: spec.v, s: spec.s, verts, edges, edgeIndex, neighbours, faces, edgeFaces, facesAt, edgeOf,
    rho: 1 / shortest, // its radius in rods
    kinds: [...new Set(faces.map((f) => f.length))].sort((a, b) => a - b),
  };
  formCache.set(key, form);
  return form;
}

// ---------------------------------------------------------------------------------------------
// A new game.

function pickForm(rng) {
  const total = FAMILIES.reduce((s, f) => s + f.weight, 0);
  let r = rng() * total;
  const family = FAMILIES.find((f) => (r -= f.weight) < 0) ?? FAMILIES[0];
  return family.forms[Math.floor(rng() * family.forms.length)].key;
}

function randomUnit(rng) {
  for (;;) {
    const p = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1];
    const l = length(p);
    if (l > 0.1 && l <= 1) return scale(p, 1 / l);
  }
}

// A hidden axis kept away from the vertical and the horizontal, as in the original game.
function randomAxis(rng) {
  const elevation = (15 + rng() * 60) * (Math.PI / 180);
  const azimuth = rng() * Math.PI * 2;
  return [Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)];
}

// Any way up: a random rotation.
function randomTurn(rng) {
  const k = randomUnit(rng);
  const t = rng() * Math.PI * 2;
  const k2 = randomUnit(rng);
  const t2 = rng() * Math.PI * 2;
  return (p) => rotate(rotate(p, k, t), k2, t2);
}

// The sample of the pattern: some of the loops about one junction, of every kind found there
// first, then more, never all of them (a larger form shows more).
function choosePreview(form, rng) {
  const at = Math.floor(rng() * form.verts.length);
  const loops = shuffle([...form.facesAt[at]], rng);
  const want = Math.min(loops.length - 1, Math.max(2, Math.round(form.faces.length / 7)));
  const chosen = [];
  const kinds = new Set();
  for (const f of loops) if (chosen.length < want && !kinds.has(form.faces[f].length)) {
    chosen.push(f);
    kinds.add(form.faces[f].length);
  }
  for (const f of loops) if (chosen.length < want && !chosen.includes(f)) chosen.push(f);
  return { at, faces: chosen };
}

// A spanning tree holding the sample's loops (all but one rod of each, which closes it), reaching
// out from them breadth first so the jumble is a branching star rather than a chain.
function spanningTree(form, preview, rng) {
  const V = form.verts.length;
  const root = Array.from({ length: V }, (_, i) => i);
  const find = (v) => (root[v] === v ? v : (root[v] = find(root[v])));
  const tree = new Set();
  const closing = [];
  for (const f of preview.faces) {
    const face = form.faces[f];
    face.forEach((v, i) => {
      const w = face[(i + 1) % face.length];
      const e = form.edgeOf(v, w);
      if (tree.has(e) || closing.includes(e)) return;
      if (find(v) === find(w)) closing.push(e);
      else {
        root[find(v)] = find(w);
        tree.add(e);
      }
    });
  }
  const seen = new Array(V).fill(false);
  const queue = [preview.at];
  seen[preview.at] = true;
  for (let q = 0; q < queue.length; q++) {
    const v = queue[q];
    for (const w of shuffle([...form.neighbours[v]], rng)) {
      const e = form.edgeOf(v, w);
      if (tree.has(e) && !seen[w]) {
        seen[w] = true;
        queue.push(w);
      }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const v = queue[q];
    for (const w of shuffle([...form.neighbours[v]], rng)) {
      if (seen[w]) continue;
      seen[w] = true;
      queue.push(w);
      tree.add(form.edgeOf(v, w));
    }
  }
  return { tree, closing };
}

// The tree rooted at a junction: parents and visiting order.
function rootTree(form, tree, rootAt) {
  const V = form.verts.length;
  const parent = new Array(V).fill(-1);
  const depth = new Array(V).fill(-1);
  const order = [rootAt];
  depth[rootAt] = 0;
  for (let q = 0; q < order.length; q++) {
    const v = order[q];
    for (const w of form.neighbours[v]) {
      if (depth[w] >= 0 || !tree.has(form.edgeOf(v, w))) continue;
      depth[w] = depth[v] + 1;
      parent[w] = v;
      order.push(w);
    }
  }
  return { root: rootAt, parent, depth, order, edges: [...tree] };
}

// Twist every joint of the tree about its rod's own axis, but those within the sample's loops:
// lengths and joint angles survive, the sample keeps its true shape and place, and the rest is
// chaos. Each twist is the best of a few random ones, keeping the jumble within the outer shell,
// clear of the stone, and its junctions apart so each can be touched.
function crumple(form, target, tree, keep, rng, opts) {
  const V = target.length;
  const children = target.map(() => []);
  for (const v of tree.order) if (tree.parent[v] >= 0) children[tree.parent[v]].push(v);
  const subtree = (v) => {
    const out = [v];
    for (let i = 0; i < out.length; i++) out.push(...children[out[i]]);
    return out;
  };
  const treeEdges = new Set(tree.edges);
  const inTree = (u, w) => treeEdges.has(form.edgeOf(u, w));
  const pos = target.map((p) => [...p]);
  const floorAt = (p) => Math.max(opts.minY, opts.floor ? opts.floor(p[0], p[2]) : -Infinity);
  const penalty = (moved, inside) => {
    let s = 0;
    for (const w of moved) {
      const r = length(pos[w]);
      if (r > opts.maxRadius) s += (r - opts.maxRadius) * 10;
      const low = floorAt(pos[w]);
      if (pos[w][1] < low) s += (low - pos[w][1]) * 10;
      if (opts.floor) {
        for (const u of form.neighbours[w]) {
          if (!inTree(u, w)) continue;
          const m = scale(add(pos[w], pos[u]), 0.5);
          const lowM = floorAt(m);
          if (m[1] < lowM) s += (lowM - m[1]) * 10;
        }
      }
      for (let j = 0; j < V; j++) {
        if (inside.has(j) || inTree(w, j)) continue;
        const d = length(sub(pos[w], pos[j]));
        if (d < opts.minGap) s += (opts.minGap - d) * 4;
      }
    }
    return s;
  };
  for (let pass = 0; pass < opts.passes; pass++) {
    for (const v of tree.order) {
      const p = tree.parent[v];
      if (p < 0 || keep.has(form.edgeOf(p, v))) continue;
      const moved = subtree(v);
      const inside = new Set(moved);
      const k = normalize(sub(pos[v], pos[p]));
      const original = moved.map((w) => pos[w]);
      const place = (t) => moved.forEach((w, i) => {
        pos[w] = add(rotate(sub(original[i], pos[p]), k, t), pos[p]);
      });
      let bestAngle = 0;
      let bestScore = pass === 0 ? Infinity : penalty(moved, inside);
      for (let c = 0; c < opts.candidates; c++) {
        const t = (rng() * 2 - 1) * Math.PI;
        place(t);
        const s = penalty(moved, inside);
        if (s < bestScore) {
          bestScore = s;
          bestAngle = t;
        }
      }
      place(bestAngle);
    }
  }
  return pos;
}

export function createGame(options = {}) {
  const seed = options.seed ?? (Math.random() * 2 ** 32) >>> 0;
  const players = Math.max(1, Math.min(4, options.players ?? 1));
  const rng = mulberry32(seed);
  const key = options.form ?? pickForm(rng);
  const form = buildForm(key);
  const V = form.verts.length;
  const E = form.edges.length;
  const turn = randomTurn(rng);
  const radial = form.verts.map((p) => normalize(turn(p)));
  const targetIn = radial.map((p) => scale(p, INNER));
  const targetOut = radial;
  const rodIn = INNER / form.rho;
  const rodOut = 1 / form.rho;
  const strut = 1 - INNER;

  const preview = choosePreview(form, rng);
  const { tree, closing } = spanningTree(form, preview, rng);
  const keep = new Set();
  for (const f of preview.faces) form.faces[f].forEach((v, i, face) => keep.add(form.edgeOf(v, face[(i + 1) % face.length])));
  const rooted = rootTree(form, tree, preview.at);
  // `floor(x, z)`: the lowest the jumble may reach there (the stone beneath it), in units of the
  // outer shell's radius from its centre.
  const chaos = crumple(form, targetIn, rooted, keep, rng, {
    candidates: options.crumpleCandidates ?? 16,
    passes: options.crumplePasses ?? 4,
    maxRadius: 0.98,
    minY: -0.9,
    minGap: rodIn * 0.5,
    floor: options.floor ?? null,
  });

  const presentIn = new Map();
  for (const e of tree) presentIn.set(e, { seq: 0, by: -1, tree: true });
  for (const e of closing) presentIn.set(e, { seq: 0, by: -1, tree: true });
  // The sample's loops are closed: they hold, and struts brace outward from them already.
  const orderIn = new Array(V).fill(0);
  const lockedIn = new Array(V).fill(false);
  const sprouted = new Array(V).fill(false);
  const doneIn = new Set();
  form.faces.forEach((face, f) => {
    if (!face.every((v, i) => presentIn.has(form.edgeOf(v, face[(i + 1) % face.length])))) return;
    doneIn.add(f);
    for (const v of face) {
      orderIn[v] = 1;
      lockedIn[v] = true;
      sprouted[v] = true;
    }
  });

  // Struts lean out from their junctions at first, each its own way; they find their true lines
  // as the outer shell's loops close about them. They lean so far that a tip may stray a fifth of
  // an outer rod.
  const lean = Math.asin(Math.min(1, (0.2 * rodOut) / strut));
  const splay = radial.map((r) => {
    let across;
    do across = cross(r, randomUnit(rng));
    while (length(across) < 0.1);
    return normalize(rotate(r, normalize(across), lean * (0.4 + 0.6 * rng())));
  });

  // Noise: loose t'an hanging from junctions outside the sample, pointing anywhere clear.
  const noise = [];
  const hosts = shuffle([...Array(V).keys()].filter((v) => !lockedIn[v]), rng).slice(0, Math.round(V / 3));
  for (const host of hosts) {
    let best = null;
    for (let attempt = 0; attempt < 24; attempt++) {
      const dir = randomUnit(rng);
      const tip = add(chaos[host], scale(dir, rodIn));
      let gap = Infinity;
      for (let v = 0; v < V; v++) if (v !== host) gap = Math.min(gap, length(sub(tip, chaos[v])), length(sub(scale(add(tip, chaos[host]), 0.5), chaos[v])));
      for (const n of noise) gap = Math.min(gap, length(sub(tip, add(chaos[n.host], scale(n.dir, rodIn)))));
      const low = Math.max(-0.9, options.floor ? options.floor(tip[0], tip[2]) : -Infinity);
      const score = gap - (length(tip) > 0.98 ? 1 : 0) - (tip[1] < low ? 1 : 0);
      if (!best || score > best.score) best = { dir, score };
    }
    noise.push({ host, dir: best.dir, alive: true });
  }

  const midPerp = (a, b) => {
    const axis = state.axis;
    const m = scale(add(a, b), 0.5);
    return sub(m, scale(axis, dot(m, axis)));
  };
  const state = {
    seed,
    rng,
    players,
    form: key,
    V,
    E,
    axis: randomAxis(rng),
    radial,
    targetIn,
    targetOut,
    chaos,
    splay,
    rodIn,
    rodOut,
    strut,
    preview,
    tree: rooted,
    presentIn,
    presentOut: new Map(),
    orderIn,
    orderOut: new Array(V).fill(0),
    lockedIn,
    lockedOut: new Array(V).fill(false),
    doneIn,
    doneOut: new Set(),
    sprouted,
    noise,
    phase: 'inner', // inner | outer | complete
    seq: 0,
    current: 0,
    turns: 0,
    stats: Array.from({ length: players }, () => ({ joined: 0, discord: 0, fallen: 0 })),
    complete: false,
    winner: -1,
    history: [],
  };
  state.midIn = form.edges.map(([u, v]) => midPerp(targetIn[u], targetIn[v]));
  state.midOut = form.edges.map(([u, v]) => midPerp(targetOut[u], targetOut[v]));
  state.midStrut = radial.map((r) => midPerp(scale(r, INNER), r));
  return state;
}

// A game kept between sessions (keep.js), taken up again: made afresh from its seed (its jumble
// over the same floor, as when it began), then all that play has changed, as it was.
export function resumeGame(kept, options = {}) {
  return Object.assign(createGame({ ...options, seed: kept.seed, players: kept.players }), kept);
}

// The number of players may change only before the first move.
export function setPlayers(state, count) {
  if (state.turns > 0) return false;
  state.players = Math.max(1, Math.min(4, count));
  state.current = 0;
  state.stats = Array.from({ length: state.players }, () => ({ joined: 0, discord: 0, fallen: 0 }));
  return true;
}

// ---------------------------------------------------------------------------------------------
// Queries.

export const formOf = (state) => buildForm(state.form);

// What a tip is: 'inner' (a junction), 'outer' (a strut's tip), 'noise' (a loose t'an's tip), or
// null where there is no such tip.
export function tipKind(state, t) {
  const { V } = state;
  if (t < 0) return null;
  if (t < V) return 'inner';
  if (t < 2 * V) return state.sprouted[t - V] ? 'outer' : null;
  return state.noise[t - 2 * V]?.alive ? 'noise' : null;
}

// Every tip there is, of the shell being built (and the noise, while the inner one is).
export function liveTips(state) {
  const { V } = state;
  const out = [];
  if (state.phase === 'inner') {
    for (let v = 0; v < V; v++) out.push(v);
    state.noise.forEach((n, i) => n.alive && out.push(2 * V + i));
  } else if (state.phase === 'outer') {
    for (let v = 0; v < V; v++) if (state.sprouted[v]) out.push(V + v);
  }
  return out;
}

const presentOf = (state, layer) => (layer === 'inner' ? state.presentIn : state.presentOut);

// The form's rod between two tips of one shell, if any (-1).
export function edgeBetween(state, a, b) {
  const { V } = state;
  const ka = tipKind(state, a);
  if (ka !== tipKind(state, b) || (ka !== 'inner' && ka !== 'outer')) return -1;
  const off = ka === 'outer' ? V : 0;
  return formOf(state).edgeOf(a - off, b - off);
}

export function isJoined(state, a, b) {
  const e = edgeBetween(state, a, b);
  if (e >= 0) return presentOf(state, tipKind(state, a)).has(e);
  const n = state.noise[Math.max(a, b) - 2 * state.V];
  return Boolean(n?.alive) && Math.min(a, b) === n.host;
}

export function missingEdges(state, layer = state.phase) {
  if (layer !== 'inner' && layer !== 'outer') return [];
  const present = presentOf(state, layer);
  const out = [];
  for (let e = 0; e < state.E; e++) if (!present.has(e)) out.push(e);
  return out;
}

// The tips of a rod of the form in a shell.
export function tipsOf(state, layer, e) {
  const [u, v] = formOf(state).edges[e];
  const off = layer === 'outer' ? state.V : 0;
  return [u + off, v + off];
}

// The length of the t'an the shell being built takes (outer shell radius 1).
export const rodLength = (state) => (state.phase === 'outer' ? state.rodOut : state.rodIn);

// Path between two junctions through the t'an in a shell.
function shellPath(state, layer, from, to) {
  const form = formOf(state);
  const present = presentOf(state, layer);
  const prev = new Array(state.V).fill(-1);
  prev[from] = from;
  const queue = [from];
  for (let q = 0; q < queue.length && prev[to] < 0; q++) {
    const v = queue[q];
    for (const w of form.neighbours[v]) {
      if (prev[w] >= 0 || !present.has(form.edgeOf(v, w))) continue;
      prev[w] = v;
      queue.push(w);
    }
  }
  if (prev[to] < 0) return null;
  const path = [to];
  while (path[path.length - 1] !== from) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

const loopClosed = (state, layer, f) => {
  const form = formOf(state);
  const present = presentOf(state, layer);
  return form.faces[f].every((v, i, face) => present.has(form.edgeOf(v, face[(i + 1) % face.length])));
};

// A junction about which every loop of the inner shell is closed.
export function settled(state, v) {
  return formOf(state).facesAt[v].every((f) => state.doneIn.has(f));
}

// Where each tip rests as far as its junction has found its order (outer shell radius 1): an inner
// junction between its place in the chaos and its place in the form; a strut's tip out from its
// junction, its lean easing to the true line; a loose t'an's tip out from its host. (Orders may be
// given, as the display eases its own toward the game's.)
export function restingPlaces(state, orderIn = state.orderIn, orderOut = state.orderOut, out = []) {
  const { V } = state;
  for (let v = 0; v < V; v++) out[v] = lerp(state.chaos[v], state.targetIn[v], smooth(clamp01(orderIn[v])));
  for (let v = 0; v < V; v++) {
    if (!state.sprouted[v]) {
      out[V + v] = null;
      continue;
    }
    const dir = normalize(lerp(state.splay[v], state.radial[v], smooth(clamp01(orderOut[v]))));
    out[V + v] = add(out[v], scale(dir, state.strut));
  }
  state.noise.forEach((n, i) => {
    out[2 * V + i] = n.alive ? add(out[n.host], scale(n.dir, state.rodIn)) : null;
  });
  return out;
}

// Every rod there is as [tip, tip, length]: the shells' t'an, the struts and the noise.
export function rods(state) {
  const { V } = state;
  const form = formOf(state);
  const out = [];
  for (const e of state.presentIn.keys()) out.push([...form.edges[e], state.rodIn]);
  for (let v = 0; v < V; v++) if (state.sprouted[v]) out.push([v, V + v, state.strut]);
  for (const e of state.presentOut.keys()) out.push([form.edges[e][0] + V, form.edges[e][1] + V, state.rodOut]);
  state.noise.forEach((n, i) => n.alive && out.push([n.host, 2 * V + i, state.rodIn]));
  return out;
}

// Wobble: how far its rods lie off balance about the hidden axis.
export function wobble(state) {
  let b = [0, 0, 0];
  for (const e of state.presentIn.keys()) b = add(b, state.midIn[e]);
  for (const e of state.presentOut.keys()) b = add(b, state.midOut[e]);
  state.sprouted.forEach((s, v) => s && (b = add(b, state.midStrut[v])));
  const m = length(b);
  const limit = 1.2;
  return { amount: m / limit, magnitude: m, direction: m > 1e-9 ? scale(b, 1 / m) : [0, 0, 0] };
}

// Overall closeness to the finished kal-toh, 0..1, for display.
export function harmony(state) {
  return (state.presentIn.size + state.presentOut.size) / (2 * state.E);
}

// Loops closed in each shell, of how many.
export function progress(state) {
  const F = formOf(state).faces.length;
  return { inner: state.doneIn.size, outer: state.doneOut.size, loops: F };
}

// ---------------------------------------------------------------------------------------------
// Playing a move.

function shiftOrder(state, layer, vertices, amount) {
  const order = layer === 'inner' ? state.orderIn : state.orderOut;
  const locked = layer === 'inner' ? state.lockedIn : state.lockedOut;
  for (const v of vertices) if (!locked[v]) order[v] = clamp01(order[v] + amount);
}

function neighbourhood(state, vertices) {
  const form = formOf(state);
  const inside = new Set(vertices);
  const out = new Set();
  for (const v of vertices) for (const w of form.neighbours[v]) if (!inside.has(w)) out.add(w);
  return [...out];
}

// The newest t'an a player placed at these junctions that no closed loop holds: the weakest bond,
// first to shake loose.
function newestLooseBond(state, layer, junctions) {
  const form = formOf(state);
  const present = presentOf(state, layer);
  const done = layer === 'inner' ? state.doneIn : state.doneOut;
  let found = -1;
  let newest = -1;
  for (const [e, info] of present) {
    if (info.tree) continue;
    const [a, b] = form.edges[e];
    if (!junctions.includes(a) && !junctions.includes(b)) continue;
    if (form.edgeFaces[e].some((f) => done.has(f))) continue;
    if (info.seq > newest) {
      newest = info.seq;
      found = e;
    }
  }
  return found;
}

function advanceTurn(state) {
  state.turns += 1;
  state.current = (state.current + 1) % state.players;
}

// Judge a join without changing anything.
//   invalid: same, joined, complete, outer (the outer shell waits for the inner), inner (the inner
//   shell is whole: build on the struts).
export function judge(state, a, b) {
  if (state.complete) return { kind: 'invalid', reason: 'complete' };
  if (a === b) return { kind: 'invalid', reason: 'same' };
  const ka = tipKind(state, a);
  const kb = tipKind(state, b);
  if (!ka || !kb) return { kind: 'invalid', reason: 'gone' };
  if (state.phase === 'inner' && (ka === 'outer' || kb === 'outer')) return { kind: 'invalid', reason: 'outer' };
  if (state.phase === 'outer' && (ka !== 'outer' || kb !== 'outer')) return { kind: 'invalid', reason: 'inner' };
  const noise = ka === 'noise' ? a - 2 * state.V : kb === 'noise' ? b - 2 * state.V : -1;
  if (noise >= 0) {
    // A loose t'an's tip and the junction it hangs from are joined already.
    if ([a, b].includes(state.noise[noise].host)) return { kind: 'invalid', reason: 'joined' };
    return { kind: 'discord', edge: -1, noise };
  }
  const e = edgeBetween(state, a, b);
  if (e < 0) return { kind: 'discord', edge: -1, noise: -1 };
  if (presentOf(state, ka).has(e)) return { kind: 'invalid', reason: 'joined' };
  return { kind: 'harmony', edge: e, noise: -1 };
}

// Join tips a and b with a new t'an. Mutates the state and reports what happened:
//   loop: the junctions of the loop it closed; faces: loops of the form closed whole; sprouted:
//   junctions whose struts now stand; fallen: rods of the shell shaken loose; noise: loose t'an
//   that fell away; whole: the inner shell has just been completed; complete: the kal-toh.
export function play(state, a, b) {
  const verdict = judge(state, a, b);
  const player = state.current;
  const layer = state.phase;
  const result = { ...verdict, a, b, player, layer, loop: [], faces: [], sprouted: [], fallen: [], noise: [], whole: false, complete: false };
  if (verdict.kind === 'invalid') return result;
  const form = formOf(state);
  const { V } = state;
  const stats = state.stats[player];
  const all = [...Array(V).keys()];

  if (verdict.kind === 'harmony') {
    const off = layer === 'outer' ? V : 0;
    const [u, w] = [a - off, b - off];
    result.loop = shellPath(state, layer, u, w) ?? [u, w];
    state.seq += 1;
    presentOf(state, layer).set(verdict.edge, { seq: state.seq, by: player, tree: false });
    stats.joined += 1;
    // The closed loop pulls toward its true shape; its surroundings follow a little.
    shiftOrder(state, layer, result.loop, result.loop.length <= 6 ? 0.55 : 0.4);
    shiftOrder(state, layer, neighbourhood(state, result.loop), 0.12);
    shiftOrder(state, layer, all, 0.02);
    // A loop of the form closed whole finds its equilibrium, and holds.
    const done = layer === 'inner' ? state.doneIn : state.doneOut;
    const order = layer === 'inner' ? state.orderIn : state.orderOut;
    const locked = layer === 'inner' ? state.lockedIn : state.lockedOut;
    for (const f of form.edgeFaces[verdict.edge]) {
      if (done.has(f) || !loopClosed(state, layer, f)) continue;
      done.add(f);
      result.faces.push(f);
      for (const v of form.faces[f]) {
        order[v] = 1;
        locked[v] = true;
        // About the inner shell's closed loops, struts brace outward.
        if (layer === 'inner' && !state.sprouted[v]) {
          state.sprouted[v] = true;
          result.sprouted.push(v);
        }
      }
    }
    if (layer === 'inner') {
      // Noise about junctions whose loops are all closed falls away.
      state.noise.forEach((n, i) => {
        if (n.alive && settled(state, n.host)) {
          n.alive = false;
          result.noise.push(i);
        }
      });
      if (state.presentIn.size === state.E) {
        // The inner shell is whole: what noise is left falls, and the outer shell is begun.
        state.noise.forEach((n, i) => {
          if (!n.alive) return;
          n.alive = false;
          result.noise.push(i);
        });
        state.phase = 'outer';
        result.whole = true;
      }
    } else if (state.presentOut.size === state.E) {
      state.phase = 'complete';
      state.complete = true;
      state.orderOut.fill(1);
      // The most true joins wins; even, the one who completed it.
      const best = Math.max(...state.stats.map((s) => s.joined));
      state.winner = state.stats[player].joined === best ? player : state.stats.findIndex((s) => s.joined === best);
      result.complete = true;
    }
  } else {
    // Discord: the new t'an cannot hold and falls, shaking loose the newest bond at its tips that
    // no closed loop holds. Noise touched falls away with it.
    stats.discord += 1;
    stats.fallen += 1;
    if (verdict.noise >= 0) {
      state.noise[verdict.noise].alive = false;
      result.noise.push(verdict.noise);
    }
    const off = layer === 'outer' ? V : 0;
    const junctions = [a, b].filter((t) => tipKind(state, t) === layer).map((t) => t - off);
    const loose = newestLooseBond(state, layer, junctions);
    if (loose >= 0) {
      presentOf(state, layer).delete(loose);
      result.fallen.push(loose);
      stats.fallen += 1;
    }
    shiftOrder(state, layer, junctions, -0.3);
    shiftOrder(state, layer, neighbourhood(state, junctions), -0.08);
    shiftOrder(state, layer, all, -0.02);
  }

  state.history.push({ a, b, kind: verdict.kind, player, layer, fallen: [...result.fallen], faces: [...result.faces] });
  if (!result.complete) advanceTurn(state);
  return result;
}

// When no true join lies within a t'an's reach, the shell being built eases: each junction still
// missing a true neighbour finds a little more of its order (the jumble draws toward its form; the
// struts toward their true lines). The game calls this while it is stuck, so a true move always
// comes within reach.
export function ease(state, amount = 0.04) {
  const layer = state.phase;
  if (layer !== 'inner' && layer !== 'outer') return 0;
  const form = formOf(state);
  const loose = new Set();
  for (const e of missingEdges(state, layer)) for (const v of form.edges[e]) loose.add(v);
  shiftOrder(state, layer, [...loose], amount);
  return loose.size;
}
