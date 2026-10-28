// The original kal-toh: the rules of the game the app first shipped with, now the first of its
// ways to play. Pure logic: no rendering, no DOM, so it also runs under Node for tests.
//
// The hidden form is an icosidodecahedron: 30 junctions and 60 t'an (rods) of equal length,
// 20 triangular and 12 pentagonal faces, its rods lying on 6 great circles ("hoops").
//
// A game starts from a spanning tree of that form (29 t'an, no loops) whose joints have been
// twisted at random. Twisting about each rod's own axis keeps every joint angle true, so the
// order is hidden in the chaos rather than destroyed: two t'an meeting at 60 degrees frame a
// triangle, at 108 degrees a pentagon.
//
// A move joins the tips of two existing t'an with a new one, which always closes a loop.
//   harmony  - the tips are true neighbours in the sphere: the loop pulls into its true shape.
//   discord  - they are not: the new t'an falls, shaking loose the newest bond at those tips.
//   flung    - a true join that unbalances the structure's secret spin beyond what it can bear:
//              the spin flings the new t'an away.
// The structure spins about a hidden axis through its centre. Every t'an is a mass on that
// spin; the sum of their offsets from the axis is the imbalance, felt as a wobble.
// The game ends when all 60 t'an are in place: the sphere is complete.

export const PHI = (1 + Math.sqrt(5)) / 2;
export const VERTEX_COUNT = 30;
export const EDGE_COUNT = 60;
// Rod length when the sphere's radius is 1.
export const EDGE_LENGTH = 1 / PHI;
// How far the imbalance may grow, in units of the sphere's radius, before the spin flings a t'an.
export const BALANCE_LIMIT = 1.6;
// A t'an joins only tips it can reach: about its own length apart as the jumble lies, no more than
// a quarter longer or shorter. (Played only by true moves within this reach, every game can still
// be finished: tools/classic.test.mjs.)
export const REACH = [0.75, 1.25];

// ---------------------------------------------------------------------------------------------
// Small vector helpers on [x, y, z] arrays.

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.sqrt(dot(a, a));
const normalize = (a) => scale(a, 1 / (length(a) || 1));

// Rodrigues rotation of v about unit axis k by angle t.
function rotate(v, k, t) {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

export const vec = { add, sub, scale, dot, cross, length, normalize, rotate };

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

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export const edgeKey = (u, v) => (u < v ? u * 64 + v : v * 64 + u);

// ---------------------------------------------------------------------------------------------
// The lattice. Built once; positions are on the unit sphere with a 5-fold axis along +z.

let latticeCache = null;

export function buildLattice() {
  if (latticeCache) return latticeCache;

  // Icosahedron, rotated so the vertex (0, 1, PHI) sits on +z.
  const raw = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      raw.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
    }
  }
  const pole = normalize([0, 1, PHI]);
  const turnAxis = normalize(cross(pole, [0, 0, 1]));
  const turnAngle = Math.acos(dot(pole, [0, 0, 1]));
  const ico = raw.map((p) => rotate(normalize(p), turnAxis, turnAngle));

  const icoEdgeLen = Math.min(...ico.slice(1).map((p) => length(sub(p, ico[0]))));
  const near = (i, j) => Math.abs(length(sub(ico[i], ico[j])) - icoEdgeLen) < 1e-6;
  const icoEdges = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (near(i, j)) icoEdges.push([i, j]);
  const icoFaces = [];
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      for (let k = j + 1; k < 12; k++) if (near(i, j) && near(j, k) && near(i, k)) icoFaces.push([i, j, k]);
    }
  }

  // Icosidodecahedron vertices are the icosahedron's edge midpoints, pushed out to the sphere.
  const vertexOfIcoEdge = new Map();
  const verts = icoEdges.map(([i, j], n) => {
    vertexOfIcoEdge.set(edgeKey(i, j), n);
    return normalize(add(ico[i], ico[j]));
  });
  const mid = (i, j) => vertexOfIcoEdge.get(edgeKey(i, j));

  // Each icosahedron face contributes one triangle and its three edges.
  const edges = [];
  const edgeIndex = new Map();
  const tris = [];
  for (const [i, j, k] of icoFaces) {
    const t = [mid(i, j), mid(j, k), mid(k, i)];
    tris.push(t);
    for (let n = 0; n < 3; n++) {
      const u = t[n];
      const v = t[(n + 1) % 3];
      edgeIndex.set(edgeKey(u, v), edges.length);
      edges.push(u < v ? [u, v] : [v, u]);
    }
  }

  // Each icosahedron vertex contributes one pentagon: the midpoints of its five edges in turn.
  const pents = ico.map((center, i) => {
    const ring = icoEdges.filter(([a, b]) => a === i || b === i).map(([a, b]) => mid(a, b));
    const ref = normalize(sub(verts[ring[0]], scale(center, dot(verts[ring[0]], center))));
    const side = cross(center, ref);
    const angle = (v) => Math.atan2(dot(verts[v], side), dot(verts[v], ref));
    return ring.sort((a, b) => angle(a) - angle(b));
  });

  const neighbours = verts.map(() => []);
  for (const [u, v] of edges) {
    neighbours[u].push(v);
    neighbours[v].push(u);
  }

  // Every rod lies on one of six great circles; group them by the circle's normal.
  const hoops = [];
  edges.forEach(([u, v], e) => {
    const n = normalize(cross(verts[u], verts[v]));
    let hoop = hoops.find((h) => Math.abs(Math.abs(dot(h.normal, n)) - 1) < 1e-6);
    if (!hoop) hoops.push((hoop = { normal: n, edges: [] }));
    hoop.edges.push(e);
  });

  latticeCache = { verts, edges, edgeIndex, tris, pents, neighbours, hoops };
  return latticeCache;
}

// ---------------------------------------------------------------------------------------------
// A new game.

// A uniformly random direction for the hidden axis, kept away from the vertical and horizontal
// so turning the base and tilting the view both matter when searching for it.
function randomAxis(rng) {
  const elevation = (15 + rng() * 60) * (Math.PI / 180);
  const azimuth = rng() * Math.PI * 2;
  return [Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)];
}

// Rotation taking the lattice's +z onto `axis`, followed by a random turn about it.
function orientLattice(axis, rng) {
  const lattice = buildLattice();
  const z = [0, 0, 1];
  const spin = rng() * Math.PI * 2;
  let k = cross(z, axis);
  const s = length(k);
  const angle = Math.atan2(s, dot(z, axis));
  k = s > 1e-9 ? scale(k, 1 / s) : [1, 0, 0];
  return lattice.verts.map((p) => rotate(rotate(p, z, spin), k, angle));
}

function midPerpOf(target, axis, [u, v]) {
  const m = scale(add(target[u], target[v]), 0.5);
  return sub(m, scale(axis, dot(m, axis)));
}

// Breadth-first walk over a set of edges from `root`: parents and visiting order.
function rootTree(edgeSet, root) {
  const { neighbours } = buildLattice();
  const parent = new Array(VERTEX_COUNT).fill(-1);
  const depth = new Array(VERTEX_COUNT).fill(-1);
  const order = [root];
  depth[root] = 0;
  for (let q = 0; q < order.length; q++) {
    const v = order[q];
    for (const w of neighbours[v]) {
      if (depth[w] >= 0 || !edgeSet.has(latticeEdge(v, w))) continue;
      depth[w] = depth[v] + 1;
      parent[w] = v;
      order.push(w);
    }
  }
  return { root, parent, order, depth, height: Math.max(...depth), edges: [...edgeSet] };
}

// Path between two junctions within a tree's edges.
function treePath(edgeSet, from, to) {
  const t = rootTree(edgeSet, from);
  const path = [to];
  while (path[path.length - 1] !== from) path.push(t.parent[path[path.length - 1]]);
  return path;
}

// A random spanning tree whose rods balance about the hidden axis.
// Starts breadth-first (shallow and branching, a jagged star), then swaps rods: adding any
// missing rod closes one loop, and removing another rod of that loop leaves a tree again.
function balancedTree(midPerp, rng) {
  const { neighbours, edgeIndex, edges } = buildLattice();
  const start = Math.floor(rng() * VERTEX_COUNT);
  const seen = new Array(VERTEX_COUNT).fill(false);
  const queue = [start];
  const tree = new Set();
  seen[start] = true;
  for (let q = 0; q < queue.length; q++) {
    const v = queue[q];
    for (const w of shuffle([...neighbours[v]], rng)) {
      if (seen[w]) continue;
      seen[w] = true;
      queue.push(w);
      tree.add(edgeIndex.get(edgeKey(v, w)));
    }
  }

  let sum = [...tree].reduce((s, e) => add(s, midPerp[e]), [0, 0, 0]);
  for (let step = 0; step < 600 && length(sum) > 0.08; step++) {
    const missing = [];
    for (let e = 0; e < EDGE_COUNT; e++) if (!tree.has(e)) missing.push(e);
    const enter = missing[Math.floor(rng() * missing.length)];
    const [a, b] = edges[enter];
    const loop = treePath(tree, a, b);
    const i = Math.floor(rng() * (loop.length - 1));
    const leave = latticeEdge(loop[i], loop[i + 1]);
    const next = add(sub(sum, midPerp[leave]), midPerp[enter]);
    if (length(next) >= length(sum)) continue;
    tree.delete(leave);
    tree.add(enter);
    // Keep it a star rather than a chain: no junction too far from the rest.
    const centre = treeCentre(tree);
    if (rootTree(tree, centre).height > 6) {
      tree.delete(enter);
      tree.add(leave);
      continue;
    }
    sum = next;
  }
  return rootTree(tree, treeCentre(tree));
}

// The junction from which the tree is shallowest: its natural core.
function treeCentre(tree) {
  let best = 0;
  let bestHeight = Infinity;
  for (let v = 0; v < VERTEX_COUNT; v++) {
    const h = rootTree(tree, v).height;
    if (h < bestHeight) {
      bestHeight = h;
      best = v;
    }
  }
  return best;
}

// Twist every joint of the tree about its rod's own axis. Lengths and joint angles survive;
// the overall shape does not. Each twist is the best of a few random candidates, keeping the
// jumble compact, clear of the base, and its junctions apart so each can be touched.
function crumple(target, tree, rng, opts) {
  const children = target.map(() => []);
  for (const v of tree.order) if (tree.parent[v] >= 0) children[tree.parent[v]].push(v);
  const subtree = (v) => {
    const out = [v];
    for (let i = 0; i < out.length; i++) out.push(...children[out[i]]);
    return out;
  };
  const treeKeys = new Set(tree.edges.map((e) => {
    const [u, v] = buildLattice().edges[e];
    return edgeKey(u, v);
  }));
  const treeNeighbours = target.map(() => []);
  for (const e of tree.edges) {
    const [u, v] = buildLattice().edges[e];
    treeNeighbours[u].push(v);
    treeNeighbours[v].push(u);
  }

  let pos = target.map((p) => [...p]);
  const centroidOf = () => scale(pos.reduce(add, [0, 0, 0]), 1 / pos.length);
  // Below the stone (when its surface is known) counts as heavily as straying too far.
  const floorAt = (p) => Math.max(opts.minY, opts.floor ? opts.floor(p[0], p[2]) : -Infinity);
  const penalty = (moved, inside, centre) => {
    let s = 0;
    for (const w of moved) {
      const q = sub(pos[w], centre);
      const r = length(q);
      if (r > opts.maxRadius) s += (r - opts.maxRadius) * 10;
      const low = floorAt(q);
      if (q[1] < low) s += (low - q[1]) * 10;
      // Along each rod from it, too: a rod may not dip into the stone between its tips.
      if (opts.floor) {
        for (const u of treeNeighbours[w]) {
          const m = scale(add(pos[w], pos[u]), 0.5);
          const qm = sub(m, centre);
          const lowM = floorAt(qm);
          if (qm[1] < lowM) s += (lowM - qm[1]) * 10;
        }
      }
      for (let j = 0; j < VERTEX_COUNT; j++) {
        if (inside.has(j) || treeKeys.has(edgeKey(w, j))) continue;
        const d = length(sub(pos[w], pos[j]));
        if (d < opts.minGap) s += (opts.minGap - d) * 4;
      }
    }
    return s;
  };

  // First pass scrambles every joint; later passes only accept twists that tidy the bounds,
  // so the jumble stays as random as the space allows.
  for (let pass = 0; pass < opts.passes; pass++) {
    for (const v of tree.order) {
      const p = tree.parent[v];
      if (p < 0) continue;
      const moved = subtree(v);
      const inside = new Set(moved);
      const centre = centroidOf();
      const k = normalize(sub(pos[v], pos[p]));
      const original = moved.map((w) => pos[w]);
      const place = (t) => moved.forEach((w, i) => {
        pos[w] = add(rotate(sub(original[i], pos[p]), k, t), pos[p]);
      });
      let bestAngle = 0;
      let bestScore = pass === 0 ? Infinity : penalty(moved, inside, centre);
      for (let c = 0; c < opts.candidates; c++) {
        const t = (rng() * 2 - 1) * Math.PI;
        place(t);
        const s = penalty(moved, inside, centre);
        if (s < bestScore) {
          bestScore = s;
          bestAngle = t;
        }
      }
      place(bestAngle);
    }
  }

  const centre = centroidOf();
  return pos.map((p) => sub(p, centre));
}

export function createGame(options = {}) {
  const seed = options.seed ?? (Math.random() * 2 ** 32) >>> 0;
  const players = Math.max(1, Math.min(4, options.players ?? 1));
  const balanceLimit = options.balanceLimit ?? BALANCE_LIMIT;
  const rng = mulberry32(seed);
  const lattice = buildLattice();

  const axis = randomAxis(rng);
  const target = orientLattice(axis, rng);
  const midPerp = lattice.edges.map((e) => midPerpOf(target, axis, e));

  // The chaos should not wobble before anyone has touched it.
  const tree = balancedTree(midPerp, rng);
  // `floor(x, z)`: the lowest the jumble may reach there (the stone beneath it), in units of the
  // sphere's radius from its centre; without one, it keeps above minY.
  const chaos = crumple(target, tree, rng, {
    candidates: options.crumpleCandidates ?? 16,
    passes: options.crumplePasses ?? 4,
    maxRadius: 1.1,
    minY: -0.9,
    minGap: 0.3,
    floor: options.floor ?? null,
  });

  const present = new Map();
  for (const e of tree.edges) present.set(e, { seq: 0, by: -1, tree: true });

  return {
    seed,
    rng,
    players,
    balanceLimit,
    axis,
    target,
    chaos,
    midPerp,
    tree,
    order: new Array(VERTEX_COUNT).fill(0),
    present,
    seq: 0,
    current: 0,
    turns: 0,
    stats: Array.from({ length: players }, () => ({ joined: 0, discord: 0, flung: 0, fallen: 0 })),
    complete: false,
    winner: -1,
    history: [],
  };
}

// The number of players may change only before the first move.
export function setPlayers(state, count) {
  if (state.turns > 0) return false;
  state.players = Math.max(1, Math.min(4, count));
  state.current = 0;
  state.stats = Array.from({ length: state.players }, () => ({ joined: 0, discord: 0, flung: 0, fallen: 0 }));
  return true;
}

// ---------------------------------------------------------------------------------------------
// Queries.

export function latticeEdge(u, v) {
  return buildLattice().edgeIndex.get(edgeKey(u, v)) ?? -1;
}

export function isJoined(state, u, v) {
  const e = latticeEdge(u, v);
  return e >= 0 && state.present.has(e);
}

export function degree(state, v) {
  return buildLattice().neighbours[v].filter((w) => isJoined(state, v, w)).length;
}

export function imbalance(state, extraEdge = -1, withoutEdge = -1) {
  let b = [0, 0, 0];
  for (const e of state.present.keys()) if (e !== withoutEdge) b = add(b, state.midPerp[e]);
  if (extraEdge >= 0) b = add(b, state.midPerp[extraEdge]);
  return b;
}

// Wobble as seen by the renderer: how close the imbalance is to the limit, and its direction.
export function wobble(state) {
  const b = imbalance(state);
  const m = length(b);
  return { amount: m / state.balanceLimit, magnitude: m, direction: m > 1e-9 ? scale(b, 1 / m) : [0, 0, 0] };
}

// Path between two junctions through the t'an currently in the structure.
export function shortestPath(state, from, to) {
  const { neighbours } = buildLattice();
  const prev = new Array(VERTEX_COUNT).fill(-1);
  prev[from] = from;
  const queue = [from];
  for (let q = 0; q < queue.length && prev[to] < 0; q++) {
    const v = queue[q];
    for (const w of neighbours[v]) {
      if (prev[w] >= 0 || !state.present.has(latticeEdge(v, w))) continue;
      prev[w] = v;
      queue.push(w);
    }
  }
  if (prev[to] < 0) return null;
  const path = [to];
  while (path[path.length - 1] !== from) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

export function missingEdges(state) {
  const out = [];
  for (let e = 0; e < EDGE_COUNT; e++) if (!state.present.has(e)) out.push(e);
  return out;
}

// When no true join lies within a t'an's reach, the jumble eases: each junction still missing a true
// neighbour finds a little more of its order, drawing those neighbours toward a t'an's length apart.
// (The game calls this while it is stuck, so a true move always comes within reach.)
export function ease(state, amount = 0.04) {
  const loose = new Set();
  for (const e of missingEdges(state)) for (const v of buildLattice().edges[e]) loose.add(v);
  shiftOrder(state, [...loose], amount);
  return loose.size;
}

// Would joining these t'an keep the spin within its limit?
export function balancedAfter(state, e) {
  // Within the limit; or, past it (a false bond's shaking loose can leave it there), no worse than
  // before - a join that brings the spin back toward balance always holds.
  const after = length(imbalance(state, e));
  return after <= state.balanceLimit || after <= length(imbalance(state));
}

// Faces and hoops whose every rod is present.
export function completedFaces(state) {
  const { tris, pents } = buildLattice();
  const done = (ring) => ring.every((v, i) => isJoined(state, v, ring[(i + 1) % ring.length]));
  return { tris: tris.filter(done), pents: pents.filter(done) };
}

export function completedHoops(state) {
  return buildLattice().hoops.filter((h) => h.edges.every((e) => state.present.has(e)));
}

// A hoop's axis in this game's orientation (the lattice's own normals are unrotated).
export function hoopNormal(state, hoop) {
  const [u, v] = buildLattice().edges[hoop.edges[0]];
  return normalize(cross(state.target[u], state.target[v]));
}

// The hoop that girdles the hidden axis.
export function equatorHoop(state) {
  const tilt = (h) => Math.abs(dot(hoopNormal(state, h), state.axis));
  return buildLattice().hoops.reduce((best, h) => (tilt(h) > tilt(best) ? h : best));
}

// ---------------------------------------------------------------------------------------------
// Playing a move.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function shiftOrder(state, vertices, amount) {
  for (const v of vertices) state.order[v] = clamp01(state.order[v] + amount);
}

function neighbourhood(vertices) {
  const { neighbours } = buildLattice();
  const inside = new Set(vertices);
  const out = new Set();
  for (const v of vertices) for (const w of neighbours[v]) if (!inside.has(w)) out.add(w);
  return [...out];
}

// The newest t'an a player placed at either tip: the weakest bond, first to shake loose.
function newestBondAt(state, tips) {
  let found = -1;
  let newest = -1;
  const { edges } = buildLattice();
  for (const [e, info] of state.present) {
    if (info.tree) continue;
    const [a, b] = edges[e];
    if (!tips.includes(a) && !tips.includes(b)) continue;
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
export function judge(state, u, v) {
  if (state.complete) return { kind: 'invalid', reason: 'complete' };
  if (u === v) return { kind: 'invalid', reason: 'same' };
  if (isJoined(state, u, v)) return { kind: 'invalid', reason: 'joined' };
  const e = latticeEdge(u, v);
  if (e < 0) return { kind: 'discord', edge: -1 };
  if (!balancedAfter(state, e)) return { kind: 'flung', edge: e };
  return { kind: 'harmony', edge: e };
}

// Join the tips u and v with a new t'an. Mutates state and reports what happened.
export function play(state, u, v) {
  const verdict = judge(state, u, v);
  const player = state.current;
  const before = length(imbalance(state));
  const result = { ...verdict, u, v, player, fallen: [], loop: [], hoops: [], faces: 0, complete: false };
  if (verdict.kind === 'invalid') return result;

  const stats = state.stats[player];
  result.loop = shortestPath(state, u, v) ?? [u, v];

  if (verdict.kind === 'harmony') {
    state.seq += 1;
    state.present.set(verdict.edge, { seq: state.seq, by: player, tree: false });
    stats.joined += 1;
    // The closed loop pulls toward its true shape; its surroundings follow a little.
    const tight = result.loop.length <= 5;
    shiftOrder(state, result.loop, tight ? 0.55 : 0.4);
    shiftOrder(state, neighbourhood(result.loop), 0.12);
    shiftOrder(state, [...Array(VERTEX_COUNT).keys()], 0.02);
    const facesNow = completedFaces(state);
    result.faces = facesNow.tris.length + facesNow.pents.length;
    result.hoops = completedHoops(state).filter((h) => h.edges.includes(verdict.edge));
    if (state.present.size === EDGE_COUNT) {
      state.complete = true;
      state.winner = player;
      state.order.fill(1);
      result.complete = true;
    }
  } else if (verdict.kind === 'flung') {
    // A true join, but the spin cannot bear it: the new t'an is thrown off and the tips it
    // tugged at loosen.
    stats.flung += 1;
    stats.fallen += 1;
    shiftOrder(state, [u, v], -0.12);
  } else {
    // Discord: the new t'an cannot hold and falls, shaking loose the newest bond at its tips.
    stats.discord += 1;
    stats.fallen += 1;
    const loose = newestBondAt(state, [u, v]);
    if (loose >= 0) {
      state.present.delete(loose);
      result.fallen.push(loose);
      stats.fallen += 1;
    }
    shiftOrder(state, [u, v], -0.3);
    shiftOrder(state, neighbourhood([u, v]), -0.08);
    shiftOrder(state, [...Array(VERTEX_COUNT).keys()], -0.02);
  }

  result.imbalance = { before, after: length(imbalance(state)), limit: state.balanceLimit };
  state.history.push({ u, v, kind: verdict.kind, player, fallen: [...result.fallen] });
  if (!result.complete) advanceTurn(state);
  return result;
}

// Overall closeness to the sphere, 0..1, for display.
export function harmony(state) {
  const placed = state.present.size / EDGE_COUNT;
  const ordered = state.order.reduce((s, o) => s + o, 0) / VERTEX_COUNT;
  return 0.5 * placed + 0.5 * ordered;
}
