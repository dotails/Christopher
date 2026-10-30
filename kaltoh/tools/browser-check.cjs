// Plays the real game in headless Chromium and checks it end to end, through simulated touch.
// First the original kal-toh, the way to play on first opening: the jumble grows, a t'an taken up
// by one finger and then held by a second joins two true neighbours, tips too far apart for a t'an
// are refused, a false bond falls (the first tip's true neighbours glowing), nothing passes into
// the stone, and t'an meeting at a junction are mitred to touch. Then, through the ways to play
// carved on the one face under the base (with the shape the game builds beneath the name, and
// nothing to turn to), many forms for two players: a new form's jumble with a sample of its loops
// true and noise among it, a true join, the turn passing (told only under the board, the scene's
// light the same for both; each seat named, the plays carved under the seats), noise touched
// falling away, the inner form whole with struts at every junction and a longer t'an in the tray,
// and a join on the struts' tips. Then zen, alone: the nest, a t'an laid across two pieces by
// touch, the five forms taken one after another, and the kal-toh fully formed and glowing. On it:
// a drag on open space turning nothing, turning the base by the stone (the t'an lag, catch up, and
// then hold perfectly still on it), two fingers twisting it, spinning the t'an by dragging their
// area, t'an never passing into the stone, turning the base over to read its underside (whichever
// way it was turned, the carving reads with its top up), touching the carving to translate all of
// it (Standard at first; remembered for next time), the rules a glyph away and back, the ways on
// the face (the room's and the voice's sliders, a value touched, Shake to begin anew), fallen t'an
// lying where they fell until a new game, and shaking to begin anew. Held sideways and back: the
// room drawn nearer to fill the wide screen, the view framed afresh and pinched no nearer or further
// than its photograph allows, the stone clear of the tray, and its carving all on the screen.
// Nothing may be written on the screen itself. Screenshots land in the directory given as the
// first argument.
//
// Run: node kaltoh/tools/browser-check.cjs [out-dir]
// Needs Playwright with Chromium (NODE_PATH or a global install).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '../android/app/src/main/assets/www');
const OUT = path.resolve(process.argv[2] || 'kaltoh-check');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.bin': 'application/octet-stream',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function check(condition, message) {
  if (!condition) throw new Error(`check failed: ${message}`);
  console.log(`ok - ${message}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })),
    });
    // A tap is stamped 50 ms long however slowly the page answers, so a slow frame never makes
    // it a press.
    const tap = async (p, id = 9) => {
      const t = Date.now() / 1000;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id, radiusX: 8, radiusY: 8, force: 1 }], timestamp: t });
      await sleep(50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t + 0.05 });
    };
    const drag = async (from, dx, dy, steps = 10, id = 3) => {
      const f = { id, x: from.x, y: from.y };
      await touch('touchStart', [f]);
      for (let i = 0; i < steps; i++) {
        f.x += dx / steps;
        f.y += dy / steps;
        await touch('touchMove', [f]);
        await sleep(30);
      }
      await touch('touchEnd', []);
    };
    const waitFor = (names, timeout = 240000) => page.waitForFunction((n) => n.includes(window.__kaltoh?.phase), names, { timeout });
    // The assembly's orientation on the base, and its place.
    const onBase = () => page.evaluate(() => {
      const m = window.__kaltoh.motion;
      return { rel: m.baseQ.clone().invert().multiply(m.q).toArray(), pos: m.pos.toArray(), base: m.baseQ.toArray() };
    });
    const differ = (a, b, tol) => a.some((x, i) => Math.abs(x - b[i]) > tol);
    // The point on the stone nearest a given one (off the t'an): only there does a drag turn it.
    const stoneSpot = (near) => page.evaluate((near) => {
      const k = window.__kaltoh;
      let best = null;
      for (let y = 100; y < 860; y += 10) {
        for (let x = 20; x < 400; x += 10) {
          if (!k.touchesBase(x, y) || k.touchesAssembly(x, y) || k.engraving.covers(x, y)) continue;
          const d = Math.hypot(x - near.x, y - near.y);
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      return best && { x: best.x, y: best.y };
    }, near);
    // Whose turn it is is told only under the board: the scene's light is the same for every player.
    const sceneLight = () => page.evaluate(() => {
      const s = window.__kaltoh.stage;
      return [s.rim.color.getHex(), s.ambient.groundColor.getHex(), document.querySelectorAll('.tint').length].join();
    });

    // Met before, the guide lets the game begin as it would (the original kal-toh): a first meeting
    // begins in zen, checked at the end.
    await page.addInitScript(() => localStorage.setItem('kaltoh.guide.v1', localStorage.getItem('kaltoh.guide.v1') ?? '[]'));
    await page.goto(`${base}?seed=7`);
    await waitFor(['intro', 'play']);
    // The stone stands on the table, in the mess hall: the table's top at the floor, the stone and
    // t'an mirrored in it. Drawing its metal makes this software renderer several times slower, so
    // from here on the table is put out of sight (nothing that follows depends on how it looks).
    const laid = await page.evaluate(async () => {
      const { FLOOR } = await import('/js/scene.js');
      const k = window.__kaltoh;
      return { top: k.table ? k.table.mesh.position.y - FLOOR : NaN, mirror: k.table?.mirror, room: Boolean(k.stage.sky?.parent) };
    });
    check(Math.abs(laid.top) < 1e-6 && laid.mirror && laid.room, 'the stone stands on the table in the mess hall, its top at the floor, mirroring what stands on it');
    await page.evaluate(() => {
      window.__kaltoh.table.mesh.visible = false;
      window.__kaltoh.table.mirror = false;
    });
    // Software rendering is slow; keep game time close to wall time.
    const pace = async () => {
      const fps = await page.evaluate(() => new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => (performance.now() - t0 < 1500 ? (n++, requestAnimationFrame(f)) : res(n / 1.5));
        requestAnimationFrame(f);
      }));
      await page.evaluate((s) => { window.__kaltoh.timeScale = s; }, Math.max(1, 1 / (0.05 * fps)));
      return fps;
    };
    await pace();
    // How near any t'an comes to the stone: its edge (half its width from its centre line) against
    // the stone's surface, finely along its whole length - over the basin's lip too.
    await page.evaluate(() => {
      const k = window.__kaltoh;
      const V = k.stage.camera.position.constructor;
      const local = new V();
      const point = new V();
      window.nearest = (rods) => {
        let worst = Infinity;
        for (const [a, b] of rods) {
          for (let i = 0; i <= 40; i++) {
            k.motion.baseLocal(point.lerpVectors(a, b, i / 40), local);
            const r = Math.hypot(local.x, local.z);
            if (r >= 0.98 || local.y < -0.014) continue;
            worst = Math.min(worst, local.y - 0.014 - k.baseSurface(r));
          }
        }
        return worst;
      };
      // Where two fingers go so that the t'an carried between them lays its ends on two points: on
      // the line through them, spread wide of them (out of the way); and its ends as the game has
      // them.
      window.fingersFor = (a, b, spread = 45) => {
        const [ea, eb] = k.rodEnds(a, b);
        const L = Math.hypot(eb.x - ea.x, eb.y - ea.y);
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / d;
        const uy = (b.y - a.y) / d;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const f1 = { x: mx - ux * (L / 2 + spread), y: my - uy * (L / 2 + spread) };
        const f2 = { x: mx + ux * (L / 2 + spread), y: my + uy * (L / 2 + spread) };
        const [e1, e2] = k.rodEnds(f1, f2);
        const inside = (f) => f.x > 8 && f.x < k.stage.size.width - 8 && f.y > 60 && f.y < k.stage.size.height - 8;
        return { f1, f2, e1: { x: e1.x, y: e1.y }, e2: { x: e2.x, y: e2.y }, onScreen: inside(f1) && inside(f2) };
      };
      // Every t'an of the original game, its two shells and the struts between, as world ends.
      window.classicRods = () => {
        const s = k.classic.structure;
        const rods = k.classic.worldRods().map(([a, b]) => [a, b]);
        for (const r of s.inner.rods) if (r.appear >= 1) rods.push([s.toWorld(r.wa, r.wa.clone()), s.toWorld(r.wb, r.wb.clone())]);
        return rods;
      };
    });
    const nothingWritten = () => page.evaluate(() => [...document.body.querySelectorAll('*')]
      .every((el) => el.id === 'note' || !(el.textContent || '').trim() || el.tagName === 'SCRIPT' || el.tagName === 'STYLE'));

    // 0. The original kal-toh, the way to play at first.
    check(await page.evaluate(() => window.__kaltoh.way === 'classic'), 'the original kal-toh is the way to play at first');
    await waitFor(['play']);
    check(await page.evaluate(() => window.__kaltoh.classic.worldRods().length === 29 && window.__kaltoh.classic.structure.inner.rods.length === 90),
      'its jumble grows: twenty-nine t\'an twisted out of their order, ninety more tangled through them');
    check(await nothingWritten(), 'nothing is written on the screen');
    await page.screenshot({ path: path.join(OUT, '0-jumble.png') });
    // Two tips to join, under the ends of the t'an carried between two fingers spread wide of them:
    // true neighbours within a t'an's reach, false ones within reach, or a pair too far apart.
    async function findJoin(kind) {
      await settle();
      return page.evaluate(async (kind) => {
        const K = await import('/js/classic-rules.js');
        const k = window.__kaltoh;
        const c = k.classic;
        // Tips that a finger there picks, steadily.
        const spots = new Map();
        for (let v = 0; v < 30; v++) {
          const t = k.stage.toScreen(c.tipWorld(v));
          if (t.y < 120 || t.y > 600 || t.x < 20 || t.x > 392) continue;
          const steady = [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]].every(([dx, dy]) => k.pickRod(t.x + dx, t.y + dy)?.tip === v);
          if (steady) spots.set(v, { x: t.x, y: t.y });
        }
        const [near, far] = K.REACH;
        for (const [u, a] of spots) {
          for (const [v, b] of spots) {
            if (u >= v || Math.hypot(a.x - b.x, a.y - b.y) < 50 || K.isJoined(c.game, u, v)) continue;
            const apart = c.apart(u, v);
            const within = apart >= near && apart <= far;
            const fits = kind === 'far' ? apart > far + 0.1 : within && K.judge(c.game, u, v).kind === kind;
            if (!fits) continue;
            const hold = window.fingersFor(a, b);
            const lands = (e, tip) => [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]].every(([dx, dy]) => k.pickRod(e.x + dx, e.y + dy)?.tip === tip);
            if (hold.onScreen && lands(hold.e1, u) && lands(hold.e2, v)) return { u, v, ...hold };
          }
        }
        return null;
      }, kind);
    }
    let join = await findJoin('harmony');
    check(join, 'two true neighbours within a t\'an\'s reach can be found on screen');
    const joining = await placeByOne(join, '0b-joining.png');
    check(joining.pose && joining.glow > 0.9, 'carried over two tips, the t\'an shows where it will join them, glowing blue');
    await page.waitForFunction(() => window.__kaltoh.classic.game.history.length >= 1 && window.__kaltoh.phase === 'play', null, { timeout: 60000 });
    check(await page.evaluate(() => window.__kaltoh.classic.game.history[0].kind === 'harmony'), 'joining true neighbours brings harmony');
    check(await page.evaluate(() => window.__kaltoh.guide.placements === 1 && window.__kaltoh.guide.way === 'classic'), 'the guide is told of the t\'an placed, and of the way played');
    join = await findJoin('far');
    check(join, 'two tips too far apart for one t\'an can be found on screen');
    const reaching = await place(join);
    await sleep(800);
    check(!reaching.pose && await page.evaluate(() => window.__kaltoh.classic.game.history.length === 1 && !window.__kaltoh.hand.holding),
      'a t\'an cannot join tips further apart than it reaches: it goes back to the tray');
    join = await findJoin('discord');
    check(join, 'two tips within reach that are not neighbours can be found on screen');
    await place(join);
    await page.waitForFunction(() => window.__kaltoh.classic.game.history.length >= 2, null, { timeout: 60000 });
    check(await page.evaluate(() => window.__kaltoh.classic.game.history[1].kind === 'discord'), 'a false bond is discord');
    await page.waitForFunction(() => window.__kaltoh.classic.structure.lesson?.tips.length > 0, null, { timeout: 10000 });
    check(true, 'and where the first tip truly belongs glows a moment');
    await page.waitForFunction(() => window.__kaltoh.falling.rods.length >= 1, null, { timeout: 20000 });
    check(true, 'and its t\'an falls away');
    await waitFor(['play']);
    await settle();
    const closest = await page.evaluate(() => window.nearest(window.classicRods()));
    check(closest > -0.002, `none of its t'an pass into the stone (closest ${closest.toFixed(3)})`);
    // Where the jumble's t'an meet at a junction their ends are mitred: each corner of an end lies on
    // its own side of the plane halving the angle to every other t'an there, and rests against one.
    const junctions = await page.evaluate(async () => {
      const { ROD_WIDTH, ROD_DEPTH } = await import('/js/rodmesh.js');
      const V = window.__kaltoh.stage.camera.position.constructor;
      const rods = window.__kaltoh.classic.structure.drawn.filter((r) => r.whole && r.kind === 'outer');
      const frame = (r) => {
        const z = new V().subVectors(r.b, r.a).normalize();
        let y = r.up.clone().addScaledVector(z, -r.up.dot(z));
        if (y.lengthSq() < 1e-8) y = new V(0, 1, 0).addScaledVector(z, -z.y);
        y.normalize();
        return { z, y, x: new V().crossVectors(y, z) };
      };
      let worst = Infinity;
      let meetings = 0;
      let resting = 0;
      rods.forEach((r, i) => {
        const f = frame(r);
        for (const k of [0, 1]) {
          const p = k ? r.b : r.a;
          const into = f.z.clone().multiplyScalar(k ? -1 : 1);
          const others = [];
          rods.forEach((o, j) => {
            if (j === i) return;
            for (const kj of [0, 1]) if (p.distanceTo(kj ? o.b : o.a) < 0.035) others.push({ o, kj });
          });
          if (!others.length) continue;
          const meet = others.reduce((m, { o, kj }) => m.add(kj ? o.b : o.a), p.clone()).multiplyScalar(1 / (others.length + 1));
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], c) => {
            const corner = p.clone().addScaledVector(into, r.trims[k * 4 + c]).addScaledVector(f.x, (sx * ROD_WIDTH) / 2).addScaledVector(f.y, (sy * ROD_DEPTH) / 2);
            let closest = Infinity;
            for (const { o, kj } of others) {
              const g = frame(o);
              const intoOther = g.z.clone().multiplyScalar(kj ? -1 : 1);
              const m = into.clone().sub(intoOther);
              if (m.lengthSq() < 1e-8) continue;
              const d = corner.clone().sub(meet).dot(m.normalize());
              meetings += 1;
              worst = Math.min(worst, d);
              closest = Math.min(closest, d);
            }
            if (closest < 1e-4) resting += 1;
          });
        }
      });
      return { worst, meetings, resting };
    });
    check(junctions.meetings > 20 && junctions.worst > -1e-4 && junctions.resting > 20,
      `where t'an meet at a junction their ends are mitred to touch, neither apart nor through each other (${junctions.resting} corners resting, closest ${junctions.worst.toExponential(1)})`);

    // Turn the base over, and choose many forms among the ways to play carved on its face, for two
    // players (as there are at first). A change of game waits for a new one.
    const where = (id, kind) => page.evaluate(([id, kind]) => window.__kaltoh.engraving.screenOf(id, kind), [id, kind]);
    const carved = (id) => page.evaluate((id) => window.__kaltoh.engraving.regions.some((r) => r.id === id), id);
    const recut = () => page.waitForFunction(() => window.__kaltoh.engraving.phase === 'still', null, { timeout: 30000 });
    // A new game begun, the base set level again (as a player would before playing): turned over
    // and back by hand, it keeps a little of the tilt, and over two games that adds up.
    const level = () => page.evaluate(() => {
      const m = window.__kaltoh.motion;
      m.baseQ.identity();
      m.baseW.set(0, 0, 0);
      m.resetPlace();
    });
    const turnOver = async () => {
      await settle();
      await drag(await stoneSpot({ x: 206, y: 640 }), 0, -155);
      await page.waitForFunction(() => window.__kaltoh.stage.view.read.k > 0.9, null, { timeout: 30000 });
      await page.waitForFunction(() => window.__kaltoh.motion.asleep, null, { timeout: 90000, polling: 100 });
    };
    await turnOver();
    // One face holds it all: the name and the shape the game builds, the players (two at first,
    // passing and playing), what just happened, the game and its ways, the room, the sound, the
    // voice and vibration, and the glyphs.
    check(await page.evaluate(() => {
      const e = window.__kaltoh.engraving;
      return e.page === 'main' && e.state.shape?.s === 'Two concentric icosidodecahedra' && window.__kaltoh.classic.game.players === 2
        && ['title', 'shape', 'name0', 'name1', 'event', 'row:way', 'row:players', 'slider:music', 'slider:sfx', 'slider:voice', 'row:haptics', 'rules', 'translate', 'anew']
          .every((id) => e.regions.some((r) => r.id === id));
    }), 'turned over, one carved face holds the name, the shape it builds, the two players, what happened, the ways, the room, the sound, the voice and vibration');
    check(!(await carved('more')) && !(await carved('prev')) && !(await carved('row:language')), 'all of it, with no page to turn to (and no row for the script)');
    await tap(await where('row:way', 'value'));
    await sleep(500);
    check(await page.evaluate(() => window.__kaltoh.settings.way === 'forms' && window.__kaltoh.engraving.state.pending), 'touching the game changes it, to begin anew: many forms');
    check(await page.evaluate(() => window.__kaltoh.settings.players === 2), 'two players take turns at it, as at first');
    check(await carved('note') && await page.evaluate(async () => {
      const { TEXT } = await import('/js/texts.js');
      return TEXT.pending.s === 'Shake to play this way' && TEXT.anew.s === 'Shake';
    }), 'the carving says to shake to play this way, and the glyph that begins anew is named Shake');
    await page.evaluate(() => {
      window.__kaltoh.seed = 7;
    });
    await tap(await where('anew', 'button'));
    await page.waitForFunction(() => window.__kaltoh.way === 'forms', null, { timeout: 30000 });
    await page.evaluate(() => window.__kaltoh.engraving.show('main'));
    await drag(await stoneSpot({ x: 206, y: 420 }), 0, 155);
    await page.waitForFunction(() => window.__kaltoh.stage.view.read.k < 0.1, null, { timeout: 30000 });
    await waitFor(['play']);
    await level();

    // 0b. Many forms: a new form each game, its inner shell built loop by loop from a sample of its
    // pattern among noise; struts brace out from each loop closed, and the outer shell is built on them.
    const formsState = () => page.evaluate(() => {
      const g = window.__kaltoh.forms.game;
      return {
        form: g.form, phase: g.phase, doneIn: g.doneIn.size, sprouted: g.sprouted.filter(Boolean).length, noise: g.noise.filter((n) => n.alive).length,
        history: g.history.map((h) => h.kind), tray: window.__kaltoh.tray.length, rods: g.rodOut / g.rodIn,
      };
    });
    const formsAt = await formsState();
    check(formsAt.doneIn >= 2 && formsAt.sprouted >= 3 && formsAt.noise >= 1,
      `many forms: a new form hides in the jumble (${formsAt.form}), a sample of its loops true, struts bracing out from them, noise among it`);
    check(await nothingWritten(), 'nothing is written on the screen');
    await page.screenshot({ path: path.join(OUT, '0e-forms.png') });
    // Two tips under two fingers, steadily, within a t'an's reach: true neighbours, or noise.
    async function findFormsJoin(kind) {
      await settle();
      return page.evaluate(async (kind) => {
        const F = await import('/js/forms-rules.js');
        const k = window.__kaltoh;
        const f = k.forms;
        const shown = f.structure.shownTips();
        const spots = new Map();
        for (const t of F.liveTips(f.game)) {
          if (!shown.has(t)) continue;
          const p = k.stage.toScreen(f.tipWorld(t));
          if (p.y < 120 || p.y > 600 || p.x < 20 || p.x > 392) continue;
          const steady = [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]].every(([dx, dy]) => k.pickRod(p.x + dx, p.y + dy)?.tip === t);
          if (steady) spots.set(t, { x: p.x, y: p.y });
        }
        for (const [a, pa] of spots) {
          for (const [b, pb] of spots) {
            if (a >= b || Math.hypot(pa.x - pb.x, pa.y - pb.y) < 40) continue;
            const apart = f.apart(a, b);
            if (apart < F.REACH[0] || apart > F.REACH[1]) continue;
            const v = F.judge(f.game, a, b);
            if (!(kind === 'noise' ? v.kind === 'discord' && v.noise >= 0 : v.kind === kind)) continue;
            const hold = window.fingersFor(pa, pb);
            const lands = (e, tip) => [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]].every(([dx, dy]) => k.pickRod(e.x + dx, e.y + dy)?.tip === tip);
            if (hold.onScreen && lands(hold.e1, a) && lands(hold.e2, b)) return hold;
          }
        }
        return null;
      }, kind);
    }
    let formsJoin = await findFormsJoin('harmony');
    check(formsJoin, 'two true neighbours within a t\'an\'s reach can be found on screen');
    const lightBefore = await sceneLight();
    const formsHeld = await place(formsJoin, '0e-forms-joining.png');
    check(formsHeld.pose && formsHeld.glow > 0.9, 'carried over two tips, the t\'an shows where it will join them');
    await page.waitForFunction(() => window.__kaltoh.forms.game.history.length >= 1 && window.__kaltoh.phase === 'play', null, { timeout: 60000 });
    check((await formsState()).history[0] === 'harmony', 'true neighbours join');
    await sleep(1500);
    check(await page.evaluate(() => window.__kaltoh.forms.game.current === 1) && await sceneLight() === lightBefore,
      'the turn passes to the second player, and the scene\'s light is as it was: whose turn it is is told under the board');
    formsJoin = await findFormsJoin('noise');
    check(formsJoin, 'a tip of the noise within reach can be found on screen');
    const noiseBefore = (await formsState()).noise;
    await place(formsJoin);
    await page.waitForFunction(() => window.__kaltoh.forms.game.history.length >= 2 && window.__kaltoh.phase === 'play', null, { timeout: 60000 });
    const touchedNoise = await formsState();
    check(touchedNoise.history[1] === 'discord' && touchedNoise.noise < noiseBefore, 'joining it to the noise is discord, and the noise falls away');
    check(await sceneLight() === lightBefore, 'and on the first player\'s turn again the light is as it was');
    const carvedPlays = await page.evaluate(() => (window.__kaltoh.engraving.state.plays ?? []).map((p) => p.player));
    check(carvedPlays.includes(0) && carvedPlays.includes(1), `each player's plays are kept for the carving under their seat (${carvedPlays.length})`);
    check(await carved('name0') && await carved('name1'), 'and each seat is named over its mark');
    // The rest of the inner form's loops closed (as players would close them): it is whole.
    for (let i = 0; i < 80; i++) {
      const left = await page.evaluate(async () => {
        const F = await import('/js/forms-rules.js');
        const k = window.__kaltoh;
        const f = k.forms;
        const g = f.game;
        if (g.phase !== 'inner') return 0;
        const [a, b] = F.tipsOf(g, 'inner', F.missingEdges(g)[0]);
        f.phase = 'resolving';
        k.tray.hide();
        f.resolve(F.play(g, a, b));
        return F.missingEdges(g).length + 1;
      });
      if (!left) break;
      await page.waitForFunction(() => window.__kaltoh.phase === 'play' && window.__kaltoh.tray.visible, null, { timeout: 60000 });
    }
    const whole = await formsState();
    check(whole.phase === 'outer' && whole.sprouted === await page.evaluate(() => window.__kaltoh.forms.game.V) && whole.noise === 0,
      'the inner form whole, struts brace out from every junction and the noise is gone');
    check(Math.abs(whole.tray / formsAt.tray - whole.rods) < 1e-6, 'and the tray brings a longer t\'an for the outer shell');
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, '0f-forms-whole.png') });
    formsJoin = await findFormsJoin('harmony');
    check(formsJoin, 'two struts\' tips, true neighbours within reach, can be found on screen');
    await place(formsJoin);
    await page.waitForFunction(() => window.__kaltoh.forms.game.presentOut.size >= 1 && window.__kaltoh.phase === 'play', null, { timeout: 60000 });
    check(true, 'the outer shell is built on the struts\' tips');

    // Then zen, alone and calm: chosen on the face, and begun.
    await turnOver();
    check(await page.evaluate(() => {
      const { state, page: carvedPage } = window.__kaltoh.engraving;
      return carvedPage === 'main' && state.shape?.s === window.__kaltoh.forms.form.s && /^Loops closed/.test(state.status?.s);
    }), 'many forms carves the name of its form beneath the title, and how many loops are closed');
    // (Cutting the carving can take a software renderer many seconds.)
    await recut();
    await tap(await where('row:way', 'value'));
    await sleep(500);
    check(await page.evaluate(() => window.__kaltoh.settings.way === 'zen' && window.__kaltoh.engraving.state.pending), 'touching it again chooses zen');
    await page.waitForFunction(() => !window.__kaltoh.engraving.dirty, null, { timeout: 60000 });
    check(!(await carved('row:players')) && !(await carved('more')), 'zen is played alone: no players to choose, and its ways fit on one page');
    await page.evaluate(() => {
      window.__kaltoh.seed = 7;
    });
    await tap(await where('anew', 'button'));
    await page.waitForFunction(() => window.__kaltoh.way === 'zen', null, { timeout: 30000 });
    await page.evaluate(() => window.__kaltoh.engraving.show('main'));
    await drag(await stoneSpot({ x: 206, y: 420 }), 0, 155);
    await page.waitForFunction(() => window.__kaltoh.stage.view.read.k < 0.1, null, { timeout: 30000 });
    await waitFor(['play']);
    await level();
    check(await page.evaluate(() => window.__kaltoh.falling.rods.length === 0), 'beginning anew plays zen, and what fell in many forms goes with the old game');

    // Let the assembly come to rest, so what is found on screen stays where it was found.
    async function settle() {
      let still = 0;
      let last = null;
      for (let i = 0; i < 240 && still < 3; i++) {
        const now = await page.evaluate(() => [...window.__kaltoh.motion.q.toArray(), ...window.__kaltoh.motion.pos.toArray()]);
        still = last && !differ(now, last, 1e-4) ? still + 1 : 0;
        last = now;
        await sleep(250);
      }
    }

    // Lift the t'an with two fingers from the tray, carry them to the pieces, let go.
    async function place(move, shot) {
      await page.waitForFunction(() => window.__kaltoh.tray.visible && window.__kaltoh.tray.arrive >= 1, null, { timeout: 30000 });
      const g = await page.evaluate(() => ({ y: window.__kaltoh.tray.y, w: window.__kaltoh.stage.size.width }));
      const f1 = { id: 1, x: g.w / 2 - 60, y: g.y };
      const f2 = { id: 2, x: g.w / 2 + 60, y: g.y };
      await touch('touchStart', [f1]);
      await sleep(40);
      await touch('touchStart', [f1, f2]);
      await sleep(60);
      check((await page.evaluate(() => window.__kaltoh.input.mode)) === 'hold', 'two fingers on the tray lift a t\'an');
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        f1.x += (move.f1.x - f1.x) * t;
        f1.y += (move.f1.y - f1.y) * t;
        f2.x += (move.f2.x - f2.x) * t;
        f2.y += (move.f2.y - f2.y) * t;
        await touch('touchMove', [f1, f2]);
        await sleep(30);
      }
      await sleep(200);
      if (shot) await page.screenshot({ path: path.join(OUT, shot) });
      const held = await page.evaluate(() => {
        const k = window.__kaltoh;
        return { pose: Boolean(k[k.way].aimed), glow: k.hand.glow };
      });
      await touch('touchEnd', [f2]);
      await sleep(30);
      await touch('touchEnd', []);
      return held;
    }

    // Take up the t'an with one finger and carry it near the first piece; a second finger, put down
    // beyond the other, takes hold of it too, the t'an between them laying its ends on the two. Let
    // go, it is placed.
    async function placeByOne(move, shot) {
      await page.waitForFunction(() => window.__kaltoh.tray.visible && window.__kaltoh.tray.arrive >= 1, null, { timeout: 30000 });
      const g = await page.evaluate(() => ({ y: window.__kaltoh.tray.y, w: window.__kaltoh.stage.size.width }));
      const f1 = { id: 1, x: g.w / 2 - 60, y: g.y };
      await touch('touchStart', [f1]);
      await sleep(60);
      check(await page.evaluate(() => window.__kaltoh.input.mode === 'grab' && window.__kaltoh.hand.holding), 'one finger on the tray takes up the t\'an');
      const from = { ...f1 };
      for (let i = 1; i <= 8; i++) {
        f1.x = from.x + ((move.f1.x - from.x) * i) / 8;
        f1.y = from.y + ((move.f1.y - from.y) * i) / 8;
        await touch('touchMove', [f1]);
        await sleep(30);
      }
      await sleep(600);
      if (shot) await page.screenshot({ path: path.join(OUT, shot.replace('.png', '-one.png')) });
      // It dangles from the finger, swinging: one end at the finger, the rest hanging down the screen
      // below it (watched for a second, through its swing); carried up from the tray, it stays about
      // as large as it lay there.
      let carried = null;
      for (let i = 0; i < 10; i++) {
        const now = await page.evaluate((f) => {
          const k = window.__kaltoh;
          const a = k.stage.toScreen(k.hand.a);
          const b = k.stage.toScreen(k.hand.b);
          const near = Math.hypot(a.x - f.x, a.y - f.y) < Math.hypot(b.x - f.x, b.y - f.y);
          const [top, low] = near ? [a, b] : [b, a];
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          return { off: Math.hypot(top.x - f.x, top.y - f.y), drop: (low.y - f.y) / length, length, tray: k.stage.size.width / 2 };
        }, f1);
        carried = carried ? { ...now, off: Math.max(carried.off, now.off), drop: Math.max(carried.drop, now.drop) } : now;
        await sleep(100);
      }
      check(carried.off < 0.12 * carried.length + 4 && carried.drop > 0.85,
        `it dangles from the finger (its end ${carried.off.toFixed(1)} px from it, hanging down ${(carried.drop * 100).toFixed(0)}% of its length)`);
      check(carried.length > 0.85 * carried.tray && carried.length <= carried.tray + 1, `about as large as it lay in the tray (${carried.length.toFixed(0)} of ${carried.tray.toFixed(0)} px long)`);
      const f2 = { id: 2, x: move.f2.x, y: move.f2.y };
      await touch('touchStart', [f1, f2]);
      await sleep(60);
      check((await page.evaluate(() => window.__kaltoh.input.mode)) === 'hold', 'a second finger, put down beyond the other end, takes hold of it too');
      await sleep(400);
      if (shot) await page.screenshot({ path: path.join(OUT, shot) });
      const held = await page.evaluate(() => {
        const k = window.__kaltoh;
        return { pose: Boolean(k[k.way].aimed), glow: k.hand.glow };
      });
      await touch('touchEnd', [f1]);
      await sleep(30);
      await touch('touchEnd', []);
      return held;
    }

    // 1. Zen, alone and calm: it begins as a nest of t'an about a centre mass; a t'an laid across any
    // two pieces rests there; every ten placed, the whole assembly takes the next of five forms, each
    // with more rods than the last; then it is fully formed, and glows, and the carving says so.
    // Nothing falls.
    const zenState = () => page.evaluate(() => {
      const k = window.__kaltoh;
      const g = k.zen.game;
      return { stage: g.stage, form: g.form, placed: g.placed, total: g.total, rods: g.rods.length, views: k.zen.views.size, complete: g.complete, length: g.length, tray: k.tray.length, carved: k.engraving.state.zen, shape: k.engraving.state.shape };
    });
    let zen = await zenState();
    check(zen.stage === 0 && zen.rods >= 40 && zen.views === zen.rods && zen.carved?.taken === 0 && zen.shape?.s === 'The nest',
      `zen: the nest gathers about its centre mass (${zen.rods} t'an), and the carving has it so`);
    await page.screenshot({ path: path.join(OUT, '1-zen-nest.png') });
    // Two pieces under the ends of the t'an carried between two fingers, steadily.
    const zenMove = async () => {
      await settle();
      return page.evaluate(() => {
        const k = window.__kaltoh;
        const m = k.stage.assemblyRoot.matrixWorld;
        const at = (v, s) => k.stage.toScreen(v.a.clone().lerp(v.b, s).applyMatrix4(m));
        const steady = (p, id) => [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4]].every(([dx, dy]) => k.pickRod(p.x + dx, p.y + dy)?.rod === id);
        const views = [...k.zen.views.values()];
        for (const va of views) {
          for (const vb of views) {
            if (va.id >= vb.id) continue;
            for (const [sa, sb] of [[0.5, 0.5], [0.3, 0.7], [0.7, 0.3], [0.3, 0.3], [0.7, 0.7]]) {
              const pa = at(va, sa);
              const pb = at(vb, sb);
              if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 50 || [pa, pb].some((p) => p.y < 120 || p.y > 560)) continue;
              const hold = window.fingersFor(pa, pb);
              if (hold.onScreen && steady(hold.e1, va.id) && steady(hold.e2, vb.id)) return { ...hold, pieces: [va.id, vb.id] };
            }
          }
        }
        return null;
      });
    };
    const across = await zenMove();
    check(across, 'two pieces under the ends of a held t\'an can be found on screen');
    const zenHeld = await place(across, '2-zen-holding.png');
    check(zenHeld.pose && zenHeld.glow > 0.9, 'carried with its ends on any two pieces, the t\'an shows where it will rest across them, glowing blue');
    await page.waitForFunction(() => window.__kaltoh.zen.game.total === 1 && window.__kaltoh.phase === 'play', null, { timeout: 60000 });
    zen = await zenState();
    check(zen.rods === zen.views && zen.placed === 1 && zen.carved?.placed === 1, 'letting go, it rests across them: one of ten toward the next form, the carving says');
    // The rest laid through the game's own hand, as if by touch (fifty placed by touch would take
    // too long here): each across two pieces chosen at random.
    const layOne = () => page.evaluate(async () => {
      const Z = await import('/js/zen-rules.js');
      const G = await import('/js/geom.js');
      const k = window.__kaltoh;
      const g = k.zen.game;
      const rng = (window.zenRng ??= G.mulberry32(5));
      const eye = k.motion.toLocal(k.stage.camera.position, k.stage.camera.position.clone());
      for (let tries = 0; tries < 400; tries++) {
        const a = g.rods[Math.floor(rng() * g.rods.length)];
        const b = g.rods[Math.floor(rng() * g.rods.length)];
        if (a.id === b.id) continue;
        const pose = Z.placement(g, { rod: a.id, s: 0.2 + rng() * 0.6 }, { rod: b.id, s: 0.2 + rng() * 0.6 }, [eye.x, eye.y, eye.z]);
        if (pose.ok && pose.length < g.length * 1.6) return Boolean(k.zen.commit(pose).transform);
      }
      return null;
    });
    const zenEdges = (form) => page.evaluate(async (form) => (await import('/js/forms-rules.js')).buildForm(form).edges.length, form);
    let taken = 0;
    const rodsOfForms = [];
    for (let i = 0; i < 60 && !(await zenState()).complete; i++) {
      await waitFor(['play']);
      const transformed = await layOne();
      if (transformed === null) check(false, 'a placement across two pieces can be laid');
      if (!transformed) continue;
      taken += 1;
      if (taken === 1) {
        await page.waitForFunction(() => [...window.__kaltoh.zen.views.values()].some((v) => v.anim?.kind === 'glide' && v.anim.t > v.anim.delay + 0.4), null, { timeout: 60000 });
        await page.screenshot({ path: path.join(OUT, '3-zen-taking-form.png') });
      }
      await waitFor(['play', 'complete']);
      zen = await zenState();
      const edges = await zenEdges(zen.form);
      rodsOfForms.push(edges);
      check(zen.stage === taken && zen.rods === edges && zen.views === edges && zen.placed === 0 && zen.carved?.taken === taken && (zen.complete || Math.abs(zen.tray - zen.length * 1.5) < 1e-9),
        `ten more placed, it takes form ${taken} of five: the ${zen.shape?.s}, its ${edges} rods each a t'an${zen.complete ? '' : ', and the tray brings one of their length'}`);
      if (taken === 1) await page.screenshot({ path: path.join(OUT, '4-zen-form.png') });
    }
    check(taken === 5 && zen.complete && rodsOfForms.every((n, i) => i === 0 || n > rodsOfForms[i - 1]), `five forms taken, each with more rods than the last (${rodsOfForms.join(', ')})`);
    await page.waitForFunction(() => window.__kaltoh.zen.glow > 0.99, null, { timeout: 60000 });
    const zenWhole = await page.evaluate(() => ({ visible: window.__kaltoh.tray.visible, event: window.__kaltoh.engraving.state.event, carved: window.__kaltoh.engraving.state.zen, fell: window.__kaltoh.falling.rods.length }));
    check(zenWhole.carved?.complete && !zenWhole.visible && /fully formed/i.test(zenWhole.event.s), `it is fully formed, and glows; the carving says so (${zenWhole.event.s})`);
    check(zenWhole.fell === 0, 'and nothing fell');
    await page.screenshot({ path: path.join(OUT, '5-zen-whole.png') });

    // 2. A drag on open space below the stone, where a finger reaching for the tray might land, turns
    // nothing. One on the stone turns it: the t'an lag, catch up, then hold perfectly still on it.
    await settle();
    const start = await onBase();
    const open = await page.evaluate(() => {
      const k = window.__kaltoh;
      for (let y = 560; y < 800; y += 8) {
        for (const x of [40, 372, 206]) if (!k.touchesBase(x, y) && !k.touchesAssembly(x, y) && !k.tray.contains(x, y, 16)) return { x, y };
      }
      return null;
    });
    check(open, `there is open space below the stone (${open?.x}, ${open?.y})`);
    await drag(open, 160, 0);
    await sleep(600);
    const still = await onBase();
    check(!differ(start.base, still.base, 1e-6) && !differ(start.rel, still.rel, 1e-6), 'a drag there turns nothing');
    await drag(await stoneSpot({ x: 206, y: 600 }), 160, 0);
    await sleep(300);
    const during = await onBase();
    check(differ(start.base, during.base, 0.05), 'a drag on the stone turns the base');
    check(differ(start.rel, during.rel, 0.01), 'the t\'an lag behind it');
    // Software rendering runs the physics slower than the clock: wait for it to come to rest.
    const settledIn = await page.waitForFunction(() => window.__kaltoh.motion.asleep, null, { timeout: 60000, polling: 100 })
      .then(() => true, () => false);
    const rest1 = await onBase();
    await sleep(1500);
    const rest2 = await onBase();
    check(!differ(rest1.rel, start.rel, 0.01), 'then catch up to their place on the base');
    if (!settledIn || differ(rest1.rel, rest2.rel, 1e-9) || differ(rest1.pos, rest2.pos, 1e-9)) console.log('resting:', JSON.stringify(rest1), JSON.stringify(rest2));
    check(settledIn && !differ(rest1.rel, rest2.rel, 1e-9) && !differ(rest1.pos, rest2.pos, 1e-9), 'and, untouched, do not move on it at all');
    await page.screenshot({ path: path.join(OUT, '7-base-turned.png') });
    // Two fingers on the stone turn it as the eye sees it: twisted, about the line of sight, the
    // same way round.
    const twist = async (degrees) => {
      const a = { id: 1, ...(await stoneSpot({ x: 110, y: 560 })) };
      const b = { id: 2, ...(await stoneSpot({ x: 300, y: 560 })) };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
      const a0 = Math.atan2(b.y - a.y, b.x - a.x);
      await touch('touchStart', [a]);
      await sleep(40);
      await touch('touchStart', [a, b]);
      await sleep(40);
      for (let i = 1; i <= 10; i++) {
        const t = a0 + (i / 10) * ((degrees * Math.PI) / 180);
        a.x = mid.x - Math.cos(t) * r;
        a.y = mid.y - Math.sin(t) * r;
        b.x = mid.x + Math.cos(t) * r;
        b.y = mid.y + Math.sin(t) * r;
        await touch('touchMove', [a, b]);
        await sleep(30);
      }
      await touch('touchEnd', [a]);
      await touch('touchEnd', []);
      await sleep(300);
    };
    const untwisted = await onBase();
    await twist(40);
    const twisted = await page.evaluate((q0) => {
      const k = window.__kaltoh;
      const d = k.motion.baseQ.clone().multiply(k.motion.baseQ.clone().fromArray(q0).invert());
      const angle = 2 * Math.acos(Math.min(1, Math.abs(d.w)));
      const s = Math.sqrt(Math.max(1e-12, 1 - d.w * d.w)) * Math.sign(d.w || 1);
      const toward = k.stage.camera.position.clone().set(0, 0, 1).applyQuaternion(k.stage.camera.quaternion);
      return { degrees: (angle * 180) / Math.PI, along: (d.x * toward.x + d.y * toward.y + d.z * toward.z) / s };
    }, untwisted.base);
    check(Math.abs(twisted.degrees - 40) < 4 && twisted.along < -0.97,
      `two fingers twisted on the stone turn it about the line of sight, the same way round (${twisted.degrees.toFixed(0)} degrees)`);
    await twist(-40);
    await page.waitForFunction(() => window.__kaltoh.motion.asleep, null, { timeout: 60000, polling: 100 });

    // 3. Drag on the t'an's area, between the t'an: the assembly turns on the base; the base does not.
    const between = await page.evaluate(() => {
      const k = window.__kaltoh;
      for (let y = 220; y < 480; y += 8) for (let x = 110; x < 310; x += 8) if (k.touchesAssembly(x, y) && !k.pickRod(x, y, 10)) return { x, y };
      return null;
    });
    check(between, 'there is open space within the t\'an\'s area');
    const before = await onBase();
    await drag(between, 0, 90);
    await sleep(2500);
    const after = await onBase();
    check(differ(before.rel, after.rel, 0.05), 'dragging the t\'an\'s area turns the assembly on its base');
    check(!differ(before.base, after.base, 1e-6), 'without turning the base');
    const clearance = await page.evaluate(() => window.nearest(window.__kaltoh.zen.worldRods().map(([a, b]) => [a, b])));
    check(clearance > -0.002, `the t'an never pass into the stone (closest ${clearance.toFixed(3)})`);

    // 4. Turn the base over: its underside comes to the eye to be read, top up whichever way the
    // base had been turned before.
    await turnOver();
    check(true, 'turned over, the base brings its carved underside to the eye');
    const title = await where('title');
    const glyphs = await where('translate', 'button');
    check(title.y < glyphs.y - 100 && Math.abs(title.x - glyphs.x) < 140, 'its carving reads with its top up');
    await page.screenshot({ path: path.join(OUT, '8-underside.png') });
    // Within the carving's framing circle, a drag turns nothing, and a touch does not translate it.
    const flat = await onBase();
    await drag(await where('title'), 120, 60);
    await sleep(600);
    check(!differ(flat.base, (await onBase()).base, 1e-6), 'a drag within the carving\'s circle turns nothing');
    await tap(await where('event'));
    await sleep(800);
    check(await page.evaluate(() => window.__kaltoh.engraving.standard && window.__kaltoh.engraving.phase === 'still'), 'nor does touching the carving translate it');
    // It reads in Standard at first. The Starfleet delta among the glyphs: all of it is smoothed
    // away and cut again in Vulcan, which the carving reads in from then on (the settings remember
    // it); touched again, Standard.
    const script = () => page.evaluate(async () => {
      const { loadSettings } = await import('/js/settings.js');
      return [window.__kaltoh.settings.script, loadSettings().script].join();
    });
    check(await script() === 'standard,standard', 'the carving reads in Standard at first');
    await tap(await where('translate', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.depth.value < 0.5, null, { timeout: 30000, polling: 'raf' });
    await recut();
    check(await page.evaluate(() => !window.__kaltoh.engraving.standard), 'the Starfleet delta smooths the carving away and cuts it again in Vulcan');
    check(await script() === 'vulcan,vulcan', 'and the carving will first read in Vulcan from now on');
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, '9-translated.png') });
    await tap(await where('translate', 'button'));
    await recut();
    check(await page.evaluate(() => window.__kaltoh.engraving.standard) && await script() === 'standard,standard', 'touched again, it returns all of it to Standard, and remembers that');

    // 5. The rules, a glyph away, and back; then the ways on the face: the room's slider, the voice's,
    // a value touched, and the glyph named Shake to begin anew.
    await tap(await where('rules', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.page === 'rules', null, { timeout: 30000 });
    await recut();
    check(await carved('r0') && await carved('legend0') && await carved('back') && await carved('translate') && await carved('anew'),
      'the rules glyph turns to the rules of the game and its marks, with the way back');
    await page.screenshot({ path: path.join(OUT, '10-rules.png') });
    await tap(await where('back', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.page === 'main', null, { timeout: 30000 });
    await recut();
    await page.screenshot({ path: path.join(OUT, '10-ways.png') });
    check(await carved('row:way') && await carved('rules'), 'and the way back returns to the face');
    // Drawn along, a slider sets its level, and turns nothing: the music, from where it is to a fifth.
    const knob = await page.evaluate(() => {
      const r = window.__kaltoh.engraving.regions.find((x) => x.id === 'slider:music');
      return r && { x0: r.x0, x1: r.x1, y0: r.y0, v: window.__kaltoh.settings.music };
    });
    check(knob, 'the room has a slider on the face, and so do the sound effects');
    const canvasPoint = (px, py) => page.evaluate(([px, py]) => {
      const e = window.__kaltoh.engraving;
      e.regions.push({ kind: 'probe', id: 'probe', x: px - 1, y: py - 1, w: 2, h: 2 });
      const at = e.screenOf('probe');
      e.regions.pop();
      return at;
    }, [px, py]);
    const fromKnob = await canvasPoint(knob.x0 + (knob.x1 - knob.x0) * knob.v, knob.y0);
    const toFifth = await canvasPoint(knob.x0 + (knob.x1 - knob.x0) * 0.2, knob.y0);
    const unslid = await onBase();
    await drag(fromKnob, toFifth.x - fromKnob.x, toFifth.y - fromKnob.y, 12);
    await sleep(400);
    const music = await page.evaluate(() => window.__kaltoh.settings.music);
    check(Math.abs(music - 0.2) < 0.06 && !differ(unslid.base, (await onBase()).base, 1e-6) && await carved('slider:sfx'),
      `drawing a finger along it sets the music's level (${Math.round(music * 100)}%), and turns nothing`);
    // The music plays from the first touch; silenced, it pauses, and raised again it plays on.
    const musicPlays = () => page.waitForFunction(() => {
      const m = window.__kaltoh.sound.music;
      return Boolean(m) && !m.paused && m.currentTime > 0;
    }, null, { timeout: 20000 }).then(() => true, () => false);
    check(await musicPlays(), 'the music plays');
    await tap(await canvasPoint(knob.x0 - 8, knob.y0));
    await sleep(400);
    check(await page.evaluate(() => window.__kaltoh.settings.music === 0 && window.__kaltoh.sound.music.paused), 'silenced, it pauses');
    await tap(await canvasPoint(knob.x0 + (knob.x1 - knob.x0) * 0.6, knob.y0));
    check(await musicPlays(), 'and raised again, it plays on');
    // The guiding voice has a slider of its own, full at first: touched lower along it and then
    // past its end, its level follows, remembered like the other ways, waiting for no new game.
    const voice = () => page.evaluate(async () => {
      const { loadSettings } = await import('/js/settings.js');
      return { now: window.__kaltoh.settings.voice, saved: loadSettings().voice, pending: Boolean(window.__kaltoh.engraving.state.pending) };
    });
    const voiceGroove = await page.evaluate(() => {
      const r = window.__kaltoh.engraving.regions.find((x) => x.id === 'slider:voice');
      return r && { x0: r.x0, x1: r.x1, y0: r.y0 };
    });
    const voiced = await voice();
    await tap(await canvasPoint(voiceGroove.x0 + (voiceGroove.x1 - voiceGroove.x0) * 0.3, voiceGroove.y0));
    await sleep(400);
    const lowered = await voice();
    await tap(await canvasPoint(voiceGroove.x1 + 10, voiceGroove.y0));
    await sleep(400);
    const raised = await voice();
    check(voiced.now === 1 && Math.abs(lowered.now - 0.3) < 0.06 && lowered.saved === lowered.now && !lowered.pending && raised.now === 1 && raised.saved === 1,
      `the voice has a slider of its own, full at first, its level remembered and waiting for no new game (lowered to ${Math.round(lowered.now * 100)}%)`);
    // Touching a value changes it: vibration, say, which does not wait for a new game.
    const haptics = await page.evaluate(() => window.__kaltoh.settings.haptics);
    await tap(await where('row:haptics', 'value'));
    await sleep(400);
    check(await page.evaluate((h) => window.__kaltoh.settings.haptics !== h && !window.__kaltoh.engraving.state.pending, haptics),
      'touching a way\'s value changes it (vibration, which needs no new game)');
    await tap(await where('row:haptics', 'value'));
    await sleep(400);
    const seedNow = await page.evaluate(() => window.__kaltoh.game.seed);
    await tap(await where('anew', 'button'));
    await page.waitForFunction(() => window.__kaltoh.phase === 'dissolving' || window.__kaltoh.phase === 'intro', null, { timeout: 20000 });
    await waitFor(['play']);
    check(await page.evaluate((seed) => window.__kaltoh.way === 'zen' && window.__kaltoh.game.seed !== seed && window.__kaltoh.game.stage === 0, seedNow),
      'begun anew, a new game of zen gathers from the nest');

    // 6. Fallen t'an lie where they fell until a new game: some on the stone's lip, some on the
    // floor in front of it - and none in the stone.
    await drag(await stoneSpot({ x: 206, y: 420 }), 0, 155);
    await page.waitForFunction(() => window.__kaltoh.stage.view.read.k < 0.1 && !window.__kaltoh.engraving.seen, null, { timeout: 30000 });
    await page.waitForFunction(() => window.__kaltoh.motion.asleep, null, { timeout: 90000, polling: 100 });
    await level();
    await page.waitForFunction(() => window.__kaltoh.motion.asleep, null, { timeout: 90000, polling: 100 });
    check(await page.evaluate(() => window.__kaltoh.motion.drop > 0.5), 'level, the stone has come down to rest on the floor');
    await page.evaluate(() => {
      const k = window.__kaltoh;
      const V = k.stage.camera.position.constructor;
      // Heights above the stone's foot, wherever it now rests.
      const foot = -k.motion.drop;
      for (let i = 0; i < 3; i++) {
        // Across the lip, at the front of the basin.
        const angle = ((i - 1) * Math.PI) / 3;
        const c = new V(Math.sin(angle) * 0.64, foot + 0.9, Math.cos(angle) * 0.64);
        const along = new V(Math.cos(angle), 0, -Math.sin(angle)).multiplyScalar(0.315);
        k.falling.spawn(c.clone().sub(along), c.clone().add(along), new V(0, -0.2, 0), { spin: 0.4 });
        // And in front of the stone, onto the floor.
        const d = new V((i - 1) * 0.6, foot + 1.0, 1.1);
        k.falling.spawn(d.clone().add(new V(-0.3, 0, 0)), d.clone().add(new V(0.3, 0, 0)), new V(0, 0, 0.3));
      }
      // Two into the basin itself, beneath the kal-toh.
      for (const side of [-1, 1]) {
        const c = new V(side * 0.36, foot + 0.45, 0);
        k.falling.spawn(c.clone().add(new V(0, 0, -0.315)), c.clone().add(new V(0, 0, 0.315)), new V(0, -0.1, 0), { spin: 0.2 });
      }
    });
    await page.waitForFunction(() => window.__kaltoh.falling.rods.every((r) => r.asleep), null, { timeout: 60000, polling: 200 });
    await sleep(2000);
    const fallen = await page.evaluate(() => ({
      count: window.__kaltoh.falling.rods.length,
      onStone: window.__kaltoh.falling.rods.filter((r) => r.mid.y > 0.1 - window.__kaltoh.motion.drop).length,
    }));
    check(fallen.count >= 8, `fallen t'an come to rest and stay (${fallen.onStone} on the stone, ${fallen.count - fallen.onStone} on the floor)`);
    const lying = await page.evaluate(() => window.nearest(window.__kaltoh.falling.rods.map((r) => [r.a, r.b])));
    check(fallen.onStone > 0 && lying > -0.002, `nor do they pass into the stone (closest ${lying.toFixed(3)})`);
    await page.screenshot({ path: path.join(OUT, '10c-fallen.png') });

    // 7. Shake for three seconds to begin anew; what had fallen goes with the old game.
    await pace();
    const seedBefore = await page.evaluate(() => window.__kaltoh.game.seed);
    for (let i = 0; i < 400; i++) {
      const phase = await page.evaluate(() => {
        window.kaltoh.shake(20);
        return window.__kaltoh.phase;
      });
      if (phase !== 'play') break;
      await sleep(60);
    }
    await page.waitForFunction((seed) => window.__kaltoh.game.seed !== seed && window.__kaltoh.phase === 'play', seedBefore, { timeout: 240000 });
    check(await page.evaluate(() => window.__kaltoh.way === 'zen' && window.__kaltoh.game.stage === 0), 'shaking begins anew: zen, from the nest');
    await page.waitForFunction(() => window.__kaltoh.falling.rods.length === 0, null, { timeout: 30000 });
    check(true, 'and the fallen t\'an fade with the old game');
    await page.screenshot({ path: path.join(OUT, '11-anew.png') });

    // Held sideways and back. On the tall screen the room stands far off, the galley whole to its
    // ceiling's lights; on the wide one it comes nearer, until its photograph fills the screen. The
    // view is framed afresh each way round, and however it is pinched it never shows the room
    // beyond the photograph; the tray's t'an is as long either way, the stone stands clear of where
    // a finger takes it up, and turned over, the stone's carving is all on the screen.
    const turned = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await turned.addInitScript(() => localStorage.setItem('kaltoh.guide.v1', '[]'));
    const side = await turned.newPage();
    side.on('pageerror', (e) => errors.push(e.message));
    const sideTouch = await turned.newCDPSession(side);
    const fingers = (type, points) => sideTouch.send('Input.dispatchTouchEvent', {
      type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })),
    });
    await side.goto(`${base}?seed=7`);
    await side.waitForFunction(() => ['intro', 'play'].includes(window.__kaltoh?.phase), null, { timeout: 240000 });
    const framing = () => side.evaluate(async () => {
      const { TOP, TRAY_REACH } = { ...(await import('/js/table.js')), ...(await import('/js/tray.js')) };
      const k = window.__kaltoh;
      const s = k.stage;
      const v = s.view;
      const covers = (z) => {
        const keep = v.zoom;
        v.zoom = z;
        s.update();
        const all = s.photographCovers(TOP);
        v.zoom = keep;
        s.update();
        return all;
      };
      const foot = s.toScreen(new (s.camera.position.constructor)(0, -0.62, 0.9));
      return {
        room: v.room, zoom: v.zoom, range: v.zoomRange, framed: v.framed, span: k.tray.span,
        covers: covers(v.zoom) && covers(v.zoomRange[0]) && covers(v.zoomRange[1]),
        clear: foot.y < k.tray.y - TRAY_REACH - 16,
      };
    });
    // Two fingers on open space, drawn together or apart.
    const pinch = async (at, from, to) => {
      const a = { id: 1, x: at.x - from / 2, y: at.y };
      const b = { id: 2, x: at.x + from / 2, y: at.y };
      await fingers('touchStart', [a]);
      await sleep(40);
      await fingers('touchStart', [a, b]);
      for (let i = 1; i <= 8; i++) {
        const d = from + ((to - from) * i) / 8;
        a.x = at.x - d / 2;
        b.x = at.x + d / 2;
        await fingers('touchMove', [a, b]);
        await sleep(30);
      }
      await fingers('touchEnd', [a]);
      await fingers('touchEnd', []);
      await sleep(300);
    };
    const upright = await framing();
    check(upright.room === 1 && upright.zoom === upright.framed && upright.covers && upright.clear,
      `upright, the room stands far off, the galley whole, and the view shows only its photograph, from as near as it may be drawn to as far back (zoom ${upright.range.map((z) => z.toFixed(2)).join(' to ')})`);
    await pinch({ x: 206, y: 120 }, 60, 260);
    const nearest = await side.evaluate(() => window.__kaltoh.stage.view.zoom);
    await pinch({ x: 206, y: 120 }, 260, 20);
    const furthest = await side.evaluate(() => window.__kaltoh.stage.view.zoom);
    check(Math.abs(nearest - upright.range[0]) < 1e-6 && Math.abs(furthest - upright.range[1]) < 1e-6,
      'pinched, the view is drawn near and back again, no nearer and no further than the photograph allows');
    await side.setViewportSize({ width: 892, height: 412 });
    await side.waitForFunction(() => window.__kaltoh.stage.size.width === 892, null, { timeout: 30000 });
    await sleep(800);
    const sideways = await framing();
    check(sideways.room < 1 && sideways.zoom === sideways.framed && sideways.covers && sideways.clear && sideways.span === upright.span,
      `held sideways, the room comes nearer (${sideways.room.toFixed(2)}), the view is framed afresh and shows only the photograph however pinched, the tray's t'an as long, the stone clear of it`);
    await side.screenshot({ path: path.join(OUT, '12-sideways.png') });
    const sideSpot = await side.evaluate(() => {
      const k = window.__kaltoh;
      let best = null;
      for (let y = 10; y < innerHeight - 10; y += 8) {
        for (let x = 10; x < innerWidth - 10; x += 8) {
          if (!k.touchesBase(x, y) || k.touchesAssembly(x, y) || k.engraving.covers(x, y) || k.tray.contains(x, y, 16)) continue;
          const d = Math.hypot(x - innerWidth / 2, y - innerHeight * 0.7);
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      return best;
    });
    const f = { id: 3, x: sideSpot.x, y: sideSpot.y };
    await fingers('touchStart', [f]);
    for (let i = 0; i < 10; i++) {
      f.y -= 15;
      await fingers('touchMove', [f]);
      await sleep(30);
    }
    await fingers('touchEnd', []);
    await side.waitForFunction(() => window.__kaltoh.stage.view.read.k > 0.9, null, { timeout: 30000 });
    await side.waitForFunction(() => window.__kaltoh.motion.asleep, null, { timeout: 90000, polling: 100 });
    const carvedSideways = await side.evaluate(() => ['title', 'translate', 'anew', 'row:way', 'slider:voice'].every((id) => {
      const p = window.__kaltoh.engraving.screenOf(id);
      return p && p.x > 0 && p.x < innerWidth && p.y > 0 && p.y < innerHeight;
    }));
    check(carvedSideways, 'turned over sideways by the same drag as upright, its carving is all on the screen');
    await side.screenshot({ path: path.join(OUT, '13-sideways-underside.png') });
    await side.setViewportSize({ width: 412, height: 892 });
    await side.waitForFunction(() => window.__kaltoh.stage.size.width === 412, null, { timeout: 30000 });
    await sleep(800);
    const back = await framing();
    check(back.room === 1 && back.zoom === back.framed, 'and upright again, the room stands far off again, framed afresh');
    await turned.close();

    // Never guided before (nothing remembered), the very first game is zen's, the guide welcoming.
    const fresh = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const first = await fresh.newPage();
    first.on('pageerror', (e) => errors.push(e.message));
    await first.goto(`${base}?seed=7`);
    await first.waitForFunction(() => ['intro', 'play'].includes(window.__kaltoh?.phase), null, { timeout: 240000 });
    check(await first.evaluate(() => window.__kaltoh.way === 'zen' && window.__kaltoh.settings.way === 'zen' && !window.__kaltoh.guide.fresh
      && window.__kaltoh.guide.queue.concat(window.__kaltoh.guide.talking ? [{ key: 'welcome' }] : []).some((q) => q.key === 'welcome' || q.key === 'startZen')),
    'never guided before, the first game is zen\'s, and the guide is to welcome the player');
    await fresh.close();

    check(errors.length === 0, `no errors on the page${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
