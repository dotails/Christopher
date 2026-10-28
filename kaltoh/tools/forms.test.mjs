// Checks the rules of many forms (forms-rules.js): every form it may hide, a new game of each, the
// moves, and - played within reach, as the game draws the jumble - that every game can be finished.
// Run: node kaltoh/tools/forms.test.mjs
import assert from 'node:assert/strict';
import * as F from '../android/app/src/main/assets/www/js/forms-rules.js';
import { vec } from '../android/app/src/main/assets/www/js/classic-rules.js';

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};
const dist = (a, b) => vec.length(vec.sub(a, b));

// --- The forms --------------------------------------------------------------------------------
for (const key of F.FORM_KEYS) {
  const f = F.buildForm(key);
  const V = f.verts.length;
  ok(f.verts.every((p) => Math.abs(vec.length(p) - 1) < 1e-9), `${key}: junctions on one sphere`);
  ok(f.edges.every(([u, v]) => Math.abs(dist(f.verts[u], f.verts[v]) - 1 / f.rho) < 1e-9), `${key}: equal rods`);
  ok(V - f.edges.length + f.faces.length === 2, `${key}: junctions, rods and loops as a solid's`);
  ok(f.kinds.length >= 2, `${key}: loops of more than one kind (${f.kinds.join(', ')})`);
  ok(f.edgeFaces.every((fs) => fs.length === 2), `${key}: every rod between two loops`);
  for (const face of f.faces) {
    ok(face.every((v, i) => f.edgeOf(v, face[(i + 1) % face.length]) >= 0), `${key}: each loop closed in order`);
    // Flat and regular: every corner the same angle, that of a regular polygon.
    const want = Math.PI - (2 * Math.PI) / face.length;
    face.forEach((v, i) => {
      const a = vec.normalize(vec.sub(f.verts[face[(i + face.length - 1) % face.length]], f.verts[v]));
      const b = vec.normalize(vec.sub(f.verts[face[(i + 1) % face.length]], f.verts[v]));
      ok(Math.abs(Math.acos(Math.max(-1, Math.min(1, vec.dot(a, b)))) - want) < 1e-9, `${key}: true corner angles`);
    });
  }
  ok(new Set(f.neighbours.map((n) => n.length)).size === 1, `${key}: every junction alike`);
}

// --- A new game --------------------------------------------------------------------------------
const jointAngles = (pos, g) => {
  const f = F.formOf(g);
  const tree = new Set(g.tree.edges);
  const out = [];
  for (let v = 0; v < g.V; v++) {
    const ns = f.neighbours[v].filter((w) => tree.has(f.edgeOf(v, w)));
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const a = vec.normalize(vec.sub(pos[ns[i]], pos[v]));
        const b = vec.normalize(vec.sub(pos[ns[j]], pos[v]));
        out.push(Math.acos(Math.max(-1, Math.min(1, vec.dot(a, b)))));
      }
    }
  }
  return out;
};

const seen = new Set();
for (let seed = 1; seed <= 120; seed++) {
  const g = F.createGame({ seed, crumpleCandidates: 8, crumplePasses: 3 });
  const f = F.formOf(g);
  seen.add(g.form);
  ok(g.tree.edges.length === g.V - 1, `seed ${seed}: a spanning tree`);
  ok(new Set(g.tree.order).size === g.V, `seed ${seed}: the tree reaches every junction`);
  for (const e of g.tree.edges) {
    const [u, v] = f.edges[e];
    ok(Math.abs(dist(g.chaos[u], g.chaos[v]) - g.rodIn) < 1e-9, `seed ${seed}: crumpling keeps lengths`);
  }
  const before = jointAngles(g.targetIn, g);
  const after = jointAngles(g.chaos, g);
  ok(before.every((a, i) => Math.abs(a - after[i]) < 1e-9), `seed ${seed}: crumpling keeps every joint angle`);
  ok(g.chaos.every((p) => vec.length(p) < 1.2), `seed ${seed}: the jumble stays compact`);
  // The sample: loops about one junction, closed in their true shape and place, never all of them.
  ok(g.preview.faces.length >= 2 && g.preview.faces.length < f.facesAt[g.preview.at].length, `seed ${seed}: a sample of the pattern`);
  ok(g.doneIn.size === g.preview.faces.length, `seed ${seed}: only the sample's loops are closed`);
  for (const fi of g.preview.faces) {
    for (const v of f.faces[fi]) {
      ok(dist(g.chaos[v], g.targetIn[v]) < 1e-9 && g.orderIn[v] === 1, `seed ${seed}: the sample in its true shape and place`);
      ok(g.sprouted[v], `seed ${seed}: struts brace out from the sample`);
    }
  }
  ok(new Set(g.preview.faces.map((fi) => f.faces[fi].length)).size >= Math.min(2, f.kinds.length), `seed ${seed}: the sample shows more than one kind of loop`);
  ok(g.noise.length === Math.round(g.V / 3) && g.noise.every((n) => !g.lockedIn[n.host]), `seed ${seed}: noise hangs among the jumble`);
  ok(g.splay.every((d, v) => Math.abs(vec.length(d) - 1) < 1e-9 && vec.dot(d, g.radial[v]) > 0.6), `seed ${seed}: struts lean out from true`);
}
ok(seen.size >= 10, `games hide many forms (${seen.size} of ${F.FORM_KEYS.length} in 120)`);
{
  const g1 = F.createGame({ seed: 7 });
  const g2 = F.createGame({ seed: 7 });
  ok(JSON.stringify(g1.chaos) === JSON.stringify(g2.chaos) && g1.form === g2.form, 'seeds are reproducible');
}

// --- Moves -----------------------------------------------------------------------------------
{
  const g = F.createGame({ seed: 11, players: 2, form: 'octa' });
  const f = F.formOf(g);
  const [tu, tv] = f.edges[g.tree.edges[0]];
  ok(F.play(g, tu, tv).kind === 'invalid', 'cannot rejoin joined tips');
  ok(F.play(g, 3, 3).kind === 'invalid', 'cannot join a tip to itself');
  const sproutedTip = g.V + g.sprouted.indexOf(true);
  ok(F.judge(g, sproutedTip, 0).reason === 'outer', 'the outer shell waits for the inner');
  ok(g.current === 0, 'invalid moves keep the turn');

  const e = F.missingEdges(g)[0];
  const [u, v] = f.edges[e];
  const r = F.play(g, u, v);
  ok(r.kind === 'harmony' && g.presentIn.has(e), 'true neighbours join');
  ok(r.loop.length >= 3 && r.loop[0] === u && r.loop[r.loop.length - 1] === v, 'a join closes a loop');
  ok(g.current === 1, 'the turn passes');
  ok(g.orderIn[u] > 0 && g.orderIn[v] > 0, 'harmony brings order');

  // Discord shakes loose the newest bond at its tips, not one a closed loop holds.
  let bad = null;
  for (let b = 0; b < g.V && !bad; b++) if (b !== u && f.edgeOf(u, b) < 0) bad = [u, b];
  const sizeBefore = g.presentIn.size;
  const d = F.play(g, bad[0], bad[1]);
  ok(d.kind === 'discord', 'false neighbours are discord');
  const heldByLoop = f.edgeFaces[e].some((fi) => g.doneIn.has(fi));
  ok(heldByLoop ? d.fallen.length === 0 : d.fallen[0] === e && g.presentIn.size === sizeBefore - 1, 'discord shakes the newest loose bond loose');
  ok(g.current === 0, 'discord spends the turn');

  // Touching noise is discord, and the noise falls away.
  const i = g.noise.findIndex((n) => n.alive);
  const noiseTip = 2 * g.V + i;
  const host = g.noise[i].host;
  const other = f.neighbours[host].find((w) => w !== host) ?? 0;
  const n = F.play(g, noiseTip, other);
  ok(n.kind === 'discord' && n.noise.includes(i) && !g.noise[i].alive, 'noise touched is discord, and falls away');
}

// Closing every loop: struts brace out from each loop closed, the inner shell becomes whole, the
// outer shell is built on the struts, and the kal-toh completes.
for (const key of F.FORM_KEYS) {
  const g = F.createGame({ seed: 40, form: key, players: 2 });
  const f = F.formOf(g);
  let guard = 0;
  let wholeAt = -1;
  while (g.phase === 'inner' && guard++ < 500) {
    const miss = F.missingEdges(g);
    const [u, v] = f.edges[miss[Math.floor(g.rng() * miss.length)]];
    const r = F.play(g, u, v);
    assert.equal(r.kind, 'harmony');
    for (const fi of r.faces) ok(f.faces[fi].every((w) => g.sprouted[w] && g.lockedIn[w]), `${key}: a loop closed whole holds and braces outward`);
    if (r.whole) wholeAt = g.turns;
  }
  ok(wholeAt > 0 && g.phase === 'outer' && g.sprouted.every(Boolean), `${key}: the inner shell whole, struts stand at every junction`);
  ok(g.noise.every((nz) => !nz.alive), `${key}: and the noise has fallen away`);
  ok(F.judge(g, 0, f.neighbours[0][0]).reason === 'inner', `${key}: the outer shell is built on the struts' tips`);
  while (!g.complete && guard++ < 1000) {
    const miss = F.missingEdges(g);
    const [u, v] = F.tipsOf(g, 'outer', miss[Math.floor(g.rng() * miss.length)]);
    assert.equal(F.play(g, u, v).kind, 'harmony');
  }
  ok(g.complete && g.doneIn.size === f.faces.length && g.doneOut.size === f.faces.length, `${key}: both shells whole, every loop closed`);
  const most = Math.max(...g.stats.map((s) => s.joined));
  ok(g.stats[g.winner].joined === most, `${key}: the most true joins prevails`);
  ok(vec.length(F.wobble(g).direction) < 1e-9 || F.wobble(g).magnitude < 1e-9, `${key}: the finished kal-toh is perfectly balanced`);
}

// Within reach: a t'an joins only tips about its own length apart as the jumble lies (REACH), the
// jumble lying as the game draws it - each tip drawn toward its resting place, every rod kept rigid
// (the solver of forms.js, run to rest after each move). Played by true moves alone, and with false
// ones mixed in, easing whenever no true join is within reach (as the game does), every game ends.
{
  const settle = (g, pos, iterations) => {
    const rest = F.restingPlaces(g);
    for (let t = 0; t < rest.length; t++) if (rest[t] && !pos[t]) pos[t] = [...rest[t]];
    const rods = F.rods(g);
    for (let it = 0; it < iterations; it++) {
      rest.forEach((r, t) => {
        if (!r) return;
        for (let k = 0; k < 3; k++) pos[t][k] += (r[k] - pos[t][k]) * 0.06;
      });
      for (const [a, b, L] of rods) {
        const d = vec.sub(pos[b], pos[a]);
        const len = vec.length(d) || 1e-9;
        const shift = vec.scale(d, ((len - L) / len) * 0.5);
        pos[a] = vec.add(pos[a], shift);
        pos[b] = vec.sub(pos[b], shift);
      }
    }
  };
  const [near, far] = F.REACH;
  for (const mistakes of [0, 0.35]) {
    let eased = 0;
    let moves = 0;
    const games = 42;
    for (let seed = 300; seed < 300 + games; seed++) {
      const g = F.createGame({ seed, form: F.FORM_KEYS[seed % F.FORM_KEYS.length], crumpleCandidates: 8, crumplePasses: 3 });
      const pos = [];
      settle(g, pos, 400);
      let firstChoices = null;
      let steps = 0;
      while (!g.complete && steps++ < 4000) {
        const good = [];
        const bad = [];
        const tips = F.liveTips(g);
        const L = F.rodLength(g);
        for (let i = 0; i < tips.length; i++) {
          for (let j = i + 1; j < tips.length; j++) {
            const a = tips[i];
            const b = tips[j];
            const apart = dist(pos[a], pos[b]) / L;
            if (apart < near || apart > far) continue;
            const kind = F.judge(g, a, b).kind;
            if (kind === 'harmony') good.push([a, b]);
            else if (kind === 'discord') bad.push([a, b]);
          }
        }
        firstChoices ??= good.length;
        if (!good.length) {
          F.ease(g);
          eased += 1;
          settle(g, pos, 60);
          continue;
        }
        const pool = bad.length && g.rng() < mistakes ? bad : good;
        const [a, b] = pool[Math.floor(g.rng() * pool.length)];
        F.play(g, a, b);
        moves += 1;
        settle(g, pos, 200);
      }
      ok(g.complete, `seed ${seed} (${g.form}): played within reach${mistakes ? ', mistakes and all,' : ''} the kal-toh completes`);
      if (!mistakes) ok(firstChoices >= 1, `seed ${seed} (${g.form}): from the start a true move lies within reach (${firstChoices})`);
    }
    console.log(`  within reach, ${mistakes ? 'with mistakes' : 'true moves only'}: ${(moves / games).toFixed(1)} moves a game, eased ${eased} times in ${games} games`);
  }
}

console.log(`many forms: ${checks} checks passed`);
