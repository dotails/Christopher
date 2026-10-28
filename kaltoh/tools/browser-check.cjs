// Plays the real game in headless Chromium and checks it end to end, through simulated touch:
// a two-finger lift and placement, the Vulcan's reply, a spin test (two taps on the t'an), a ring,
// turning the base (the t'an lag, catch up, and then hold perfectly still on it), spinning the
// t'an by dragging their area, turning the base over to read its underside (it rights itself so
// the carving reads upright), touching carved lines to translate them, the carved ways to play,
// and shaking to begin anew. Nothing may be written on the screen itself. Screenshots land in
// the directory given as the first argument.
//
// Run: node kaltoh/tools/browser-check.cjs [out-dir]
// Needs Playwright with Chromium (NODE_PATH or a global install).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '../android/app/src/main/assets/www');
const OUT = path.resolve(process.argv[2] || 'kaltoh-check');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.bin': 'application/octet-stream' };
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
    const tap = async (p, id = 9) => {
      await touch('touchStart', [{ id, x: p.x, y: p.y }]);
      await sleep(50);
      await touch('touchEnd', []);
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

    await page.addInitScript(() => {
      localStorage.setItem('kaltoh.settings.v2', JSON.stringify({ opponent: 'adept', foresight: 'always', test: 'free' }));
    });
    await page.goto(`${base}?seed=42`);
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
    await waitFor(['play']);
    let s = await state();
    check(s.rods >= 40, `the nest gathers about its centre mass (${s.rods} t'an)`);
    check(await page.evaluate(() => [...document.body.querySelectorAll('*')].every((el) => el.id === 'note' || !(el.textContent || '').trim() || el.tagName === 'SCRIPT' || el.tagName === 'STYLE')),
      'nothing is written on the screen');
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
        const a = window.__kaltoh.aim;
        return { pose: Boolean(a?.pose), ring: a?.ring?.k ?? 0, glow: window.__kaltoh.hand.glow };
      });
      await touch('touchEnd', [f2]);
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
    // 2. The Vulcan replies.
    await page.waitForFunction(() => window.__kaltoh.phase === 'play' && window.__kaltoh.game.current === 0, null, { timeout: 240000 });
    s = await state();
    check(s.moves >= 2 || s.revealed, `the Vulcan takes its turn (${s.moves} moves)`);
    await page.screenshot({ path: path.join(OUT, '3-after-vulcan.png') });

    // 3. Two quick taps on the t'an test the spin (free in this game).
    await settle();
    const spot = await page.evaluate(() => {
      const k = window.__kaltoh;
      for (let y = 220; y < 480; y += 12) for (let x = 110; x < 310; x += 12) if (k.touchesAssembly(x, y)) return { x, y };
      return null;
    });
    check(spot, 'the t\'an have an area to touch');
    // Two taps in quick succession. (Dispatched together in the page: under software rendering
    // each touch sent from outside arrives a frame late, too slow to count as a double tap.)
    await page.evaluate(({ x, y }) => {
      const canvas = document.getElementById('view');
      for (let i = 0; i < 2; i++) {
        for (const type of ['pointerdown', 'pointerup']) {
          canvas.dispatchEvent(new PointerEvent(type, { pointerId: 40 + i, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
        }
      }
    }, spot);
    await page.waitForFunction(() => window.__kaltoh.phase === 'testing', null, { timeout: 20000 });
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, '4-spin-test.png') });
    check((await state()).revealed, 'two taps on the t\'an test the spin, revealing the axis');
    await waitFor(['play']);

    // 4. Close a ring: by touch if one sits steadily under the fingers, else placed directly.
    let ringMove = null;
    for (let look = 0; look < 3 && !ringMove; look++) {
      ringMove = await findMove(true);
      if (!ringMove) await drag({ x: 40, y: 600 }, 60, 0);
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

    // 5. Turn the base on open space: the t'an lag, catch up, then hold perfectly still on it.
    await settle();
    const start = await onBase();
    await drag({ x: 40, y: 640 }, 160, 0);
    await sleep(300);
    const during = await onBase();
    check(differ(start.base, during.base, 0.05), 'a drag on open space turns the base');
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
    const clearance = await page.evaluate(() => {
      const k = window.__kaltoh;
      const THREE = k.stage.camera.position.constructor;
      let worst = Infinity;
      for (const e of k.display.values()) {
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const w = new THREE().lerpVectors(e.wa, e.wb, t);
          const local = k.motion.baseLocal(w, new THREE());
          const r = Math.hypot(local.x, local.z);
          if (r > 0.95 || local.y < 0) continue;
          worst = Math.min(worst, local.y - k.baseSurface(r));
        }
      }
      return worst;
    });
    check(clearance > -0.03, `the t'an stay clear of the stone (closest ${clearance.toFixed(3)})`);

    // 7. Turn the base over: its underside comes to the eye to be read.
    await settle();
    await drag({ x: 30, y: 700 }, 0, -155);
    await page.waitForFunction(() => window.__kaltoh.stage.view.read.k > 0.9, null, { timeout: 30000 });
    check(true, 'turned over, the base brings its carved underside to the eye');
    // However it was turned, it rights itself about its own axis so the carving reads upright.
    await page.waitForFunction(() => window.__kaltoh.motion.asleep, null, { timeout: 90000, polling: 100 });
    const where = (id, kind) => page.evaluate(([id, kind]) => window.__kaltoh.engraving.screenOf(id, kind), [id, kind]);
    const title = await where('title');
    const glyphs = await where('ways', 'button');
    check(title.y < glyphs.y - 100 && Math.abs(title.x - glyphs.x) < 140, 'and turns itself so its carving reads upright');
    await page.screenshot({ path: path.join(OUT, '8-underside.png') });
    // Touch a line: it reads in Standard; touch again: Vulcan.
    await tap(await where('l0'));
    await page.waitForFunction(() => window.__kaltoh.engraving.flipped.has('l0'), null, { timeout: 10000 });
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, '9-translated.png') });
    check(true, 'touching a carved line translates it');
    await tap(await where('l0'));
    await page.waitForFunction(() => !window.__kaltoh.engraving.flipped.has('l0'), null, { timeout: 10000 });
    check(true, 'touching it again returns it to Vulcan');

    // 8. The carved ways to play: choose pass and play, begin anew.
    await tap(await where('ways', 'button'));
    await page.waitForFunction(() => window.__kaltoh.engraving.page === 'ways', null, { timeout: 10000 });
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, '10-ways.png') });
    check(true, 'the carved circle opens the ways to play');
    for (let i = 0; i < 4 && (await page.evaluate(() => window.__kaltoh.settings.opponent)) !== 'none'; i++) {
      await tap(await where('row:opponent', 'value'));
      await sleep(400);
    }
    check(await page.evaluate(() => window.__kaltoh.settings.opponent === 'none'), 'touching a way\'s value changes it');
    await tap(await where('anew', 'button'));
    await page.waitForFunction(() => window.__kaltoh.phase === 'dissolving' || window.__kaltoh.phase === 'intro', null, { timeout: 20000 });
    await waitFor(['play']);
    check(await page.evaluate(() => window.__kaltoh.game.players.every((p) => !p.vulcan)), 'a new game begins with the new ways');

    // 9. Shake for three seconds to begin anew.
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
    await page.screenshot({ path: path.join(OUT, '11-anew.png') });
    check(errors.length === 0, `no errors on the page${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
