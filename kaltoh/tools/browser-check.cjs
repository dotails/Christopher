// Plays the real game in headless Chromium and checks it end to end, through simulated touch.
// First the original kal-toh, the way to play on first opening: the jumble grows, a t'an taken up
// by one finger and then held by a second joins two true neighbours, tips too far apart for a t'an
// are refused, a false bond falls
// (the first tip's true neighbours glowing), two taps test the spin, nothing passes into the
// stone, and t'an meeting at a junction are mitred to touch. Then, through the carved ways to play,
// many forms: a new form's jumble with a sample of its loops true and noise among it, a true join,
// noise touched falling away, the inner form whole with struts at every junction and a longer t'an
// in the tray, and a join on the struts' tips. Then (turning the ways' pages by the arrows at the
// rim) the game of rings: a two-finger lift and placement, the Vulcan's reply (the light behind
// turning the second player's green, the plays carved under the seats), a spin test, a ring,
// a drag on open space turning nothing, turning the base by the stone (the t'an lag, catch up, and
// then hold perfectly still on it), spinning the
// t'an by dragging their area, t'an never passing into the stone, turning the base over to read
// its underside (whichever way it was turned, the carving reads with its top up), touching the
// carving to translate all of it, the carved ways to play and the hologram's tuning, fallen t'an
// lying where they fell until a new game, and shaking to begin anew. Nothing may be written on
// the screen itself. Screenshots land in the directory given as the first argument.
//
// The hologram as on the phone, where the Android shell follows the head, is checked with a stand-in
// for the shell. With a Y4M video of a face as the second argument, the page's own eye finder is
// checked too: the front camera (faked by Chromium) is watched for the eyes and the view follows them.
//
// Run: node kaltoh/tools/browser-check.cjs [out-dir] [face.y4m]
// Needs Playwright with Chromium (NODE_PATH or a global install).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '../android/app/src/main/assets/www');
const OUT = path.resolve(process.argv[2] || 'kaltoh-check');
const FACE = process.argv[3] ? path.resolve(process.argv[3]) : null;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.ttf': 'font/ttf', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.task': 'application/octet-stream',
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
  const camera = FACE ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${FACE}`] : [];
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...camera] });
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
    const state = () => page.evaluate(() => {
      const k = window.__kaltoh;
      return { phase: k.phase, moves: k.game.moves, rings: k.game.rings.filter((r) => !r.broken).length, current: k.game.current, revealed: k.game.revealed, rods: k.display.size };
    });
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
          if (!k.touchesBase(x, y) || k.touchesAssembly(x, y)) continue;
          const d = Math.hypot(x - near.x, y - near.y);
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      return best && { x: best.x, y: best.y };
    }, near);

    // The original game is the way to play at first; these ways wait for the game of rings.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('kaltoh.check')) {
        sessionStorage.setItem('kaltoh.check', '1');
        localStorage.setItem('kaltoh.settings.v2', JSON.stringify({ opponent: 'adept', foresight: 'always', test: 'free' }));
      }
    });
    await page.goto(`${base}?seed=7`);
    await waitFor(['intro', 'play']);
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
    // Two tips to join, under two fingers (a finger touches a little below what it picks): true
    // neighbours within a t'an's reach, false ones within reach, or a pair too far apart.
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
            if (fits) return { u, v, a: { x: a.x, y: a.y + 10 }, b: { x: b.x, y: b.y + 10 } };
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
    const touchSpot = () => page.evaluate(() => {
      const k = window.__kaltoh;
      for (let y = 220; y < 480; y += 12) for (let x = 110; x < 310; x += 12) if (k.touchesAssembly(x, y)) return { x, y };
      return null;
    });
    // Two taps in quick succession. (Dispatched together in the page: under software rendering
    // each touch sent from outside arrives a frame late, too slow to count as a double tap.)
    const doubleTap = (spot) => page.evaluate(({ x, y }) => {
      const canvas = document.getElementById('view');
      for (let i = 0; i < 2; i++) {
        for (const type of ['pointerdown', 'pointerup']) {
          canvas.dispatchEvent(new PointerEvent(type, { pointerId: 40 + i, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
        }
      }
    }, spot);
    await doubleTap(await touchSpot());
    await page.waitForFunction(() => window.__kaltoh.phase === 'testing', null, { timeout: 20000 });
    const trayWhileSpinning = await page.evaluate(() => window.__kaltoh.tray.visible);
    let closest = Infinity;
    for (let i = 0; i < 12; i++) {
      closest = Math.min(closest, await page.evaluate(() => window.nearest(window.classicRods())));
      await sleep(150);
    }
    await page.screenshot({ path: path.join(OUT, '0c-spin-test.png') });
    check(true, 'two taps on it test the spin');
    check(trayWhileSpinning && await page.evaluate(() => window.__kaltoh.tray.visible), 'and the t\'an in the tray stays there while it spins');
    await waitFor(['play']);
    closest = Math.min(closest, await page.evaluate(() => window.nearest(window.classicRods())));
    check(closest > -0.002, `none of its t'an pass into the stone, at rest or spinning (closest ${closest.toFixed(3)})`);
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

    // Turn the base over, and choose the game of rings in the carved ways to play. A change of
    // game waits for a new one; the ways turn their pages by arrows at the rim.
    const where = (id, kind) => page.evaluate(([id, kind]) => window.__kaltoh.engraving.screenOf(id, kind), [id, kind]);
    const carved = (id) => page.evaluate((id) => window.__kaltoh.engraving.regions.some((r) => r.id === id), id);
    const recut = () => page.waitForFunction(() => window.__kaltoh.engraving.phase === 'still', null, { timeout: 10000 });
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
    await tap(await where('ways', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.page === 'ways', null, { timeout: 10000 });
    await recut();
    check(!(await carved('more')) && !(await carved('prev')), 'the original game\'s ways fit on one page, with no arrows');
    await tap(await where('row:way', 'value'));
    await sleep(500);
    check(await page.evaluate(() => window.__kaltoh.settings.way === 'forms' && window.__kaltoh.engraving.state.pending), 'touching the game changes it, to begin anew: many forms');
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
            if (kind === 'noise' ? v.kind === 'discord' && v.noise >= 0 : v.kind === kind) return { a: { x: pa.x, y: pa.y + 10 }, b: { x: pb.x, y: pb.y + 10 } };
          }
        }
        return null;
      }, kind);
    }
    let formsJoin = await findFormsJoin('harmony');
    check(formsJoin, 'two true neighbours within a t\'an\'s reach can be found on screen');
    const formsHeld = await place(formsJoin, '0e-forms-joining.png');
    check(formsHeld.pose && formsHeld.glow > 0.9, 'carried over two tips, the t\'an shows where it will join them');
    await page.waitForFunction(() => window.__kaltoh.forms.game.history.length >= 1 && window.__kaltoh.phase === 'play', null, { timeout: 60000 });
    check((await formsState()).history[0] === 'harmony', 'true neighbours join');
    await settle();
    await doubleTap(await touchSpot());
    await page.waitForFunction(() => window.__kaltoh.phase === 'testing', null, { timeout: 20000 });
    check(await page.evaluate(() => window.__kaltoh.tray.visible), 'two taps test its spin, and the t\'an in the tray stays there while it spins');
    await waitFor(['play']);
    formsJoin = await findFormsJoin('noise');
    check(formsJoin, 'a tip of the noise within reach can be found on screen');
    const noiseBefore = (await formsState()).noise;
    await place(formsJoin);
    await page.waitForFunction(() => window.__kaltoh.forms.game.history.length >= 2 && window.__kaltoh.phase === 'play', null, { timeout: 60000 });
    const touchedNoise = await formsState();
    check(touchedNoise.history[1] === 'discord' && touchedNoise.noise < noiseBefore, 'joining it to the noise is discord, and the noise falls away');
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

    // Then the game of rings, whose ways turn their pages by arrows at the rim.
    await turnOver();
    await tap(await where('ways', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.page === 'ways', null, { timeout: 10000 });
    await recut();
    await tap(await where('row:way', 'value'));
    await sleep(500);
    check(await page.evaluate(() => window.__kaltoh.settings.way === 'rings' && window.__kaltoh.engraving.state.pending), 'touching it again chooses the game of rings');
    check(await carved('more') && !(await carved('prev')), 'the game of rings has more ways: an arrow at the rim turns to them');
    await tap(await where('more', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.wayPage === 1, null, { timeout: 10000 });
    await recut();
    await page.screenshot({ path: path.join(OUT, '0d-ways-page.png') });
    check(await carved('prev'), 'and an arrow on the other side turns back');
    await tap(await where('prev', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.wayPage === 0, null, { timeout: 10000 });
    await recut();
    await page.evaluate(() => {
      window.__kaltoh.seed = 42;
    });
    await tap(await where('anew', 'button'));
    await page.waitForFunction(() => window.__kaltoh.way === 'rings', null, { timeout: 30000 });
    await page.evaluate(() => window.__kaltoh.engraving.show('main'));
    await drag(await stoneSpot({ x: 206, y: 420 }), 0, 155);
    await page.waitForFunction(() => window.__kaltoh.stage.view.read.k < 0.1, null, { timeout: 30000 });
    await waitFor(['play']);
    await level();
    check(await page.evaluate(() => window.__kaltoh.falling.rods.length === 0), 'beginning anew plays the game of rings');

    let s = await state();
    check(s.rods >= 40, `the nest gathers about its centre mass (${s.rods} t'an)`);
    await page.screenshot({ path: path.join(OUT, '1-nest.png') });

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

    // Two t'an under two fingers that make a good placement (a ring, if wanted).
    async function findMove(wantRing) {
      await settle();
      return page.evaluate((wantRing) => {
        const k = window.__kaltoh;
        const { game, R, AI } = k;
        const ids = [...k.display.keys()].filter((id) => game.nest.rods[id]?.alive);
        const spots = [0.15, 0.35, 0.5, 0.65, 0.85];
        const eye = k.motion.toLocal(k.stage.camera.position, k.stage.camera.position.clone());
        let fallback = null;
        for (const ia of ids) {
          for (const ib of ids) {
            if (ia >= ib) continue;
            for (const sa of spots) {
              for (const sb of spots) {
                const pa = k.rodScreen(ia, sa);
                const pb = k.rodScreen(ib, sb);
                if (!pa || !pb || Math.hypot(pa.x - pb.x, pa.y - pb.y) < 50) continue;
                if (pa.y < 120 || pb.y < 120 || pa.y > 560 || pb.y > 560) continue;
                const ha = k.pickRod(pa.x, pa.y);
                const hb = k.pickRod(pb.x, pb.y);
                if (!ha || !hb || ha.rod !== ia || hb.rod !== ib) continue;
                const steady = (p, id) => [[-5, 0], [5, 0], [0, -5], [0, 5]].every(([dx, dy]) => k.pickRod(p.x + dx, p.y + dy)?.rod === id);
                if (!steady(pa, ia) || !steady(pb, ib)) continue;
                const pose = R.placement(game, ha, hb, [eye.x, eye.y, eye.z]);
                if (!pose.ok) continue;
                const ring = AI.ringFor(game, pose);
                const move = { a: { x: pa.x, y: pa.y + 10 }, b: { x: pb.x, y: pb.y + 10 }, ring: ring?.k ?? 0 };
                const sure = () => [[-3, 0], [3, 0], [0, -3], [0, 3]].every(([dx, dy]) => {
                  const ja = k.pickRod(pa.x + dx, pa.y + dy);
                  const jb = k.pickRod(pb.x + dx, pb.y + dy);
                  const p = ja && jb && R.placement(game, ja, jb, [eye.x, eye.y, eye.z]);
                  return p?.ok && AI.ringFor(game, p);
                });
                if (!wantRing || (ring && sure())) return move;
                fallback ??= move;
              }
            }
          }
        }
        return wantRing ? null : fallback;
      }, wantRing);
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
        f1.x += (move.a.x - f1.x) * t;
        f1.y += (move.a.y - f1.y) * t;
        f2.x += (move.b.x - f2.x) * t;
        f2.y += (move.b.y - f2.y) * t;
        await touch('touchMove', [f1, f2]);
        await sleep(30);
      }
      await sleep(200);
      if (shot) await page.screenshot({ path: path.join(OUT, shot) });
      const held = await page.evaluate(() => {
        const k = window.__kaltoh;
        const a = k.aim;
        return { pose: k.way === 'rings' ? Boolean(a?.pose) : Boolean((k.way === 'classic' ? k.classic : k.forms).aimed), ring: a?.ring?.k ?? 0, glow: k.hand.glow };
      });
      await touch('touchEnd', [f2]);
      await sleep(30);
      await touch('touchEnd', []);
      return held;
    }

    // Take up the t'an with one finger and carry it to the first piece; a second finger, put down
    // on the other, takes hold of it too. Let go, it is placed.
    async function placeByOne(move, shot) {
      await page.waitForFunction(() => window.__kaltoh.tray.visible && window.__kaltoh.tray.arrive >= 1, null, { timeout: 30000 });
      const g = await page.evaluate(() => ({ y: window.__kaltoh.tray.y, w: window.__kaltoh.stage.size.width }));
      const f1 = { id: 1, x: g.w / 2 - 60, y: g.y };
      await touch('touchStart', [f1]);
      await sleep(60);
      check(await page.evaluate(() => window.__kaltoh.input.mode === 'grab' && window.__kaltoh.hand.holding), 'one finger on the tray takes up the t\'an');
      const from = { ...f1 };
      for (let i = 1; i <= 8; i++) {
        f1.x = from.x + ((move.a.x - from.x) * i) / 8;
        f1.y = from.y + ((move.a.y - from.y) * i) / 8;
        await touch('touchMove', [f1]);
        await sleep(30);
      }
      await sleep(600);
      if (shot) await page.screenshot({ path: path.join(OUT, shot.replace('.png', '-one.png')) });
      // The point it was touched at stays under the finger; carried up from the tray, it draws in to
      // the size it will be at the kal-toh.
      const carried = await page.evaluate((f) => {
        const k = window.__kaltoh;
        const a = k.stage.toScreen(k.hand.a);
        const b = k.stage.toScreen(k.hand.b);
        const t = k.hand.carried.along;
        return { off: Math.hypot(a.x + (b.x - a.x) * t - f.x, a.y + (b.y - a.y) * t - f.y), length: Math.hypot(b.x - a.x, b.y - a.y), own: k.hand.atKaltoh() };
      }, f1);
      check(carried.off < 6, `it slides across the glass under the finger (${carried.off.toFixed(1)} px off)`);
      check(Math.abs(carried.length - carried.own) < 6, `drawing in to the size it will be at the kal-toh (${carried.length.toFixed(0)} px long)`);
      const f2 = { id: 2, x: move.b.x, y: move.b.y };
      await touch('touchStart', [f1, f2]);
      await sleep(60);
      check((await page.evaluate(() => window.__kaltoh.input.mode)) === 'hold', 'a second finger, put down on the other piece, takes hold of it too');
      await sleep(400);
      if (shot) await page.screenshot({ path: path.join(OUT, shot) });
      const held = await page.evaluate(() => {
        const k = window.__kaltoh;
        return { pose: k.way === 'rings' ? Boolean(k.aim?.pose) : Boolean((k.way === 'classic' ? k.classic : k.forms).aimed), glow: k.hand.glow };
      });
      await touch('touchEnd', [f1]);
      await sleep(30);
      await touch('touchEnd', []);
      return held;
    }

    // 1. A plain move.
    const first = await findMove(false);
    check(first, 'a placement within reach can be found on screen');
    const held = await place(first, '2-holding.png');
    check(held.pose && held.glow > 0.9, 'carried over two pieces, the t\'an shows where it will rest, glowing blue');
    await page.waitForFunction(() => window.__kaltoh.game.moves >= 1, null, { timeout: 60000 });
    check(true, 'releasing places the t\'an');
    await page.waitForFunction(() => window.__kaltoh.game.current === 1, null, { timeout: 60000 });
    const lit = (seat) => page.waitForFunction((seat) => [...document.querySelectorAll('.tint')].every((el, i) => el.classList.contains('on') === (i + 1 === seat)),
      seat, { timeout: 10000 }).then(() => true, () => false);
    check(await lit(1), 'on the second player\'s turn the light behind turns green');
    // 2. The Vulcan replies.
    await page.waitForFunction(() => window.__kaltoh.phase === 'play' && window.__kaltoh.game.current === 0, null, { timeout: 240000 });
    s = await state();
    check(s.moves >= 2 || s.revealed, `the Vulcan takes its turn (${s.moves} moves)`);
    check(await lit(0), 'and back to red on the first player\'s');
    const carvedPlays = await page.evaluate(() => (window.__kaltoh.engraving.state.plays ?? []).map((p) => p.player));
    check(carvedPlays.includes(0) && carvedPlays.includes(1), `each player's plays are kept for the carving under their seat (${carvedPlays.length})`);
    check(await carved('name0') && await carved('name1'), 'and each seat is named over its mark');
    await page.screenshot({ path: path.join(OUT, '3-after-vulcan.png') });

    // 3. Two quick taps on the t'an test the spin (free in this game).
    await settle();
    const spot = await touchSpot();
    check(spot, 'the t\'an have an area to touch');
    await doubleTap(spot);
    await page.waitForFunction(() => window.__kaltoh.phase === 'testing', null, { timeout: 20000 });
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, '4-spin-test.png') });
    check((await state()).revealed, 'two taps on the t\'an test the spin, revealing the axis');
    check(await page.evaluate(() => window.__kaltoh.phase === 'testing' && window.__kaltoh.tray.visible), 'and the t\'an in the tray stays there while it spins');
    await waitFor(['play']);

    // 4. Close a ring: by touch if one sits steadily under the fingers, else placed directly.
    let ringMove = null;
    for (let look = 0; look < 3 && !ringMove; look++) {
      ringMove = await findMove(true);
      if (!ringMove) await drag(await stoneSpot({ x: 206, y: 600 }), 60, 0);
    }
    const ringsBefore = (await state()).rings;
    if (ringMove) {
      const preview = await place(ringMove, '5-ring-preview.png');
      check(preview.ring > 0, `foresight shows the ring the move would make (${preview.ring})`);
    } else {
      await page.evaluate(() => {
        const k = window.__kaltoh;
        const pose = k.AI.candidateMoves(k.game, { limit: 900 }).find((p) => k.AI.ringFor(k.game, p));
        if (pose) k.commit(pose);
      });
    }
    await sleep(900);
    await page.screenshot({ path: path.join(OUT, '6-ring-forming.png') });
    await page.waitForFunction((n) => window.__kaltoh.game.rings.length > n, ringsBefore, { timeout: 30000 });
    check(true, 'closing a loop around the axis makes a ring');
    await page.waitForFunction(() => ['play', 'over', 'complete'].includes(window.__kaltoh.phase) && window.__kaltoh.game.current === 0, null, { timeout: 240000 });

    // 5. A drag on open space below the stone, where a finger reaching for the tray might land, turns
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

    // 6. Drag on the t'an's area, between the t'an: the assembly turns on the base; the base does not.
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
    const clearance = await page.evaluate(() => window.nearest([...window.__kaltoh.display.values()].map((e) => [e.wa, e.wb])));
    check(clearance > -0.002, `the t'an never pass into the stone (closest ${clearance.toFixed(3)})`);

    // 7. Turn the base over: its underside comes to the eye to be read, top up whichever way the
    // base had been turned before.
    await turnOver();
    check(true, 'turned over, the base brings its carved underside to the eye');
    const title = await where('title');
    const glyphs = await where('ways', 'button');
    check(title.y < glyphs.y - 100 && Math.abs(title.x - glyphs.x) < 140, 'its carving reads with its top up');
    await page.screenshot({ path: path.join(OUT, '8-underside.png') });
    // Touch the carving: all of it is smoothed away and cut again in Standard; again: Vulcan.
    await tap(await where('l0'));
    await page.waitForFunction(() => window.__kaltoh.engraving.depth.value < 0.5, null, { timeout: 10000, polling: 'raf' });
    await recut();
    check(await page.evaluate(() => window.__kaltoh.engraving.standard), 'touching the carving smooths it away and cuts it again in Standard');
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, '9-translated.png') });
    await tap(await where('l3'));
    await recut();
    check(await page.evaluate(() => !window.__kaltoh.engraving.standard), 'touching it again returns all of it to Vulcan');

    // 8. The carved ways to play, and the hologram's tuning: choose pass and play, begin anew.
    await tap(await where('ways', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.page === 'ways', null, { timeout: 10000 });
    await recut();
    await page.screenshot({ path: path.join(OUT, '10-ways.png') });
    check(true, 'the carved circle opens the ways to play');
    await tap(await where('tune', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.page === 'tune', null, { timeout: 10000 });
    await recut();
    const depthBefore = await page.evaluate(() => window.__kaltoh.settings.holo.depth);
    await tap(await where('step:depth+', 'step'));
    await sleep(400);
    const depthAfter = await page.evaluate(() => window.__kaltoh.settings.holo.depth);
    check(depthAfter > depthBefore, `the hologram's tuning steps up when its value's right is touched (${depthBefore} to ${depthAfter} mm)`);
    await tap(await where('step:depth', 'step'));
    await sleep(400);
    check(await page.evaluate((d) => window.__kaltoh.settings.holo.depth === d, depthBefore), 'and down when its left is');
    check(await carved('tune:hologram'), 'the tuning begins with the hologram itself, on or off');
    await page.screenshot({ path: path.join(OUT, '10b-tuning.png') });
    await tap(await where('more', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.tunePage === 1, null, { timeout: 10000 });
    await recut();
    check(await carved('step:steady+') && await carved('prev'), 'an arrow at the rim turns to how it follows the eyes');
    await tap(await where('back', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.page === 'ways', null, { timeout: 10000 });
    await recut();
    for (let i = 0; i < 4 && (await page.evaluate(() => window.__kaltoh.settings.opponent)) !== 'none'; i++) {
      await tap(await where('row:opponent', 'value'));
      await sleep(400);
    }
    check(await page.evaluate(() => window.__kaltoh.settings.opponent === 'none'), 'touching a way\'s value changes it');
    await tap(await where('anew', 'button'));
    await page.waitForFunction(() => window.__kaltoh.phase === 'dissolving' || window.__kaltoh.phase === 'intro', null, { timeout: 20000 });
    await waitFor(['play']);
    check(await page.evaluate(() => window.__kaltoh.game.players.every((p) => !p.vulcan)), 'a new game begins with the new ways');

    // 9. Fallen t'an lie where they fell until a new game: some on the stone's lip, some on the
    // floor in front of it - and none in the stone.
    await drag(await stoneSpot({ x: 206, y: 420 }), 0, 155);
    await page.waitForFunction(() => window.__kaltoh.stage.view.read.k < 0.1 && !window.__kaltoh.engraving.seen, null, { timeout: 30000 });
    await page.waitForFunction(() => window.__kaltoh.motion.asleep, null, { timeout: 90000, polling: 100 });
    await page.evaluate(() => {
      const k = window.__kaltoh;
      const V = k.stage.camera.position.constructor;
      for (let i = 0; i < 3; i++) {
        // Across the lip, at the front of the basin.
        const angle = ((i - 1) * Math.PI) / 3;
        const c = new V(Math.sin(angle) * 0.64, 0.9, Math.cos(angle) * 0.64);
        const along = new V(Math.cos(angle), 0, -Math.sin(angle)).multiplyScalar(0.315);
        k.falling.spawn(c.clone().sub(along), c.clone().add(along), new V(0, -0.2, 0), { spin: 0.4 });
        // And in front of the stone, onto the floor.
        const d = new V((i - 1) * 0.6, 1.0, 1.1);
        k.falling.spawn(d.clone().add(new V(-0.3, 0, 0)), d.clone().add(new V(0.3, 0, 0)), new V(0, 0, 0.3));
      }
      // Two into the basin itself, beneath the kal-toh.
      for (const side of [-1, 1]) {
        const c = new V(side * 0.36, 0.45, 0);
        k.falling.spawn(c.clone().add(new V(0, 0, -0.315)), c.clone().add(new V(0, 0, 0.315)), new V(0, -0.1, 0), { spin: 0.2 });
      }
    });
    await page.waitForFunction(() => window.__kaltoh.falling.rods.every((r) => r.asleep), null, { timeout: 60000, polling: 200 });
    await sleep(2000);
    const fallen = await page.evaluate(() => ({
      count: window.__kaltoh.falling.rods.length,
      onStone: window.__kaltoh.falling.rods.filter((r) => r.mid.y > 0.1).length,
    }));
    check(fallen.count >= 8, `fallen t'an come to rest and stay (${fallen.onStone} on the stone, ${fallen.count - fallen.onStone} on the floor)`);
    const lying = await page.evaluate(() => window.nearest(window.__kaltoh.falling.rods.map((r) => [r.a, r.b])));
    check(fallen.onStone > 0 && lying > -0.002, `nor do they pass into the stone (closest ${lying.toFixed(3)})`);
    await page.screenshot({ path: path.join(OUT, '10c-fallen.png') });

    // 10. Shake for three seconds to begin anew; what had fallen goes with the old game.
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
    check(true, 'shaking begins anew');
    await page.waitForFunction(() => window.__kaltoh.falling.rods.length === 0, null, { timeout: 30000 });
    check(true, 'and the fallen t\'an fade with the old game');
    await page.screenshot({ path: path.join(OUT, '11-anew.png') });

    // 11. The hologram, given a face to watch: the eye is found and the view follows it.
    if (FACE) {
      await page.evaluate(() => {
        window.__kaltoh.settings.holo.engine = 'cpu';
      });
      await page.evaluate(() => window.__kaltoh.setHologram(true));
      await page.waitForFunction(() => window.__kaltoh.head.status === 'on' && window.__kaltoh.head.last, null, { timeout: 120000 });
      const seen = [];
      for (let i = 0; i < 40; i++) {
        seen.push(await page.evaluate(() => ({ x: window.__kaltoh.head.last.x, z: window.__kaltoh.head.last.z, cam: window.__kaltoh.stage.camera.position.x })));
        await sleep(400);
      }
      const xs = seen.map((s) => s.x);
      const zs = seen.map((s) => s.z);
      const cams = seen.map((s) => s.cam);
      check(Math.max(...zs) < 900 && Math.min(...zs) > 120, `the hologram finds the eye at a likely distance (${Math.min(...zs).toFixed(0)} to ${Math.max(...zs).toFixed(0)} mm)`);
      check(Math.max(...xs) - Math.min(...xs) > 30 && Math.max(...cams) - Math.min(...cams) > 0.5, 'and the view follows it as it moves');
      await page.evaluate(() => window.__kaltoh.setHologram(false));
    }
    check(errors.length === 0, `no errors on the page${errors.length ? `: ${errors.join(' | ')}` : ''}`);

    // 12. On the phone the Android shell follows the head (HeadTracker.java). A stand-in for it here
    // reports a face swaying from side to side, as ML Kit would: the view follows it.
    const phone = await browser.newContext({ viewport: { width: 412, height: 892 } });
    const handset = await phone.newPage();
    const phoneErrors = [];
    handset.on('pageerror', (e) => phoneErrors.push(e.message));
    await handset.addInitScript(() => {
      localStorage.setItem('kaltoh.settings.v2', JSON.stringify({ hologram: true }));
      let timer = null;
      window.KalTohAndroid = {
        hologram(on) {
          clearInterval(timer);
          if (!on) return;
          setTimeout(() => {
            window.kaltoh.headEngine('mlkit');
            window.kaltoh.headStatus('on');
          }, 100);
          let t = 0;
          timer = setInterval(() => {
            t += 1 / 30;
            // Eyes 60 px apart in a 480 x 640 picture (the player's left eye further right).
            const sway = Math.sin(t * 1.4) * 70;
            window.kaltoh.face(270 + sway, 300, 210 + sway, 300, 240 + sway, 320, 160, 480, 640, 0, 40);
          }, 33);
        },
        device: () => JSON.stringify({ xdpi: 420, ydpi: 420, fovLong: 75, fovShort: 60 }),
        haptic() {},
        insets: () => '{"top":0,"bottom":0}',
      };
    });
    await handset.goto(`${base}?seed=3`);
    await handset.waitForFunction(() => window.__kaltoh?.head?.status === 'on' && window.__kaltoh.head.source === 'native' && window.__kaltoh.head.last,
      null, { timeout: 120000 });
    const swayed = [];
    for (let i = 0; i < 30; i++) {
      swayed.push(await handset.evaluate(() => ({ z: window.__kaltoh.head.last.z, cam: window.__kaltoh.stage.camera.position.x })));
      await sleep(150);
    }
    const near = Math.min(...swayed.map((v) => v.z));
    const far = Math.max(...swayed.map((v) => v.z));
    const cams = swayed.map((v) => v.cam);
    check(near > 300 && far < 600, `on the phone, the shell's sightings place the head at a likely distance (${near.toFixed(0)} to ${far.toFixed(0)} mm)`);
    check(Math.max(...cams) - Math.min(...cams) > 0.3, 'and the view follows the head as it moves');
    // The t'an at the foot of the screen lies on the glass: it keeps its place however the head
    // moves or the view is drawn near.
    const trayAt = () => handset.evaluate(() => {
      const k = window.__kaltoh;
      return [k.stage.toScreen(k.tray.restA), k.stage.toScreen(k.tray.restB)].flatMap((p) => [p.x, p.y]);
    });
    // (Once it has slid in: under software rendering the jumble may still be growing.)
    await handset.waitForFunction(() => window.__kaltoh.tray.visible && window.__kaltoh.tray.arrive >= 1, null, { timeout: 120000 });
    const trayAt0 = await trayAt();
    let trayDrift = 0;
    for (let i = 0; i < 8; i++) {
      if (i === 4) {
        await handset.evaluate(() => {
          window.__kaltoh.stage.view.zoom = 0.45;
          window.dispatchEvent(new Event('resize'));
        });
      }
      await sleep(200);
      const now = await trayAt();
      trayDrift = Math.max(trayDrift, ...now.map((v, j) => Math.abs(v - trayAt0[j])));
    }
    check(trayDrift < 1.5 && trayAt0[1] < 892 && trayAt0[1] > 600, `the t'an at the foot of the screen stays put as the head moves and the view draws near (${trayDrift.toFixed(2)} px)`);
    check(phoneErrors.length === 0, `no errors on the page with the shell${phoneErrors.length ? `: ${phoneErrors.join(' | ')}` : ''}`);
    await phone.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
