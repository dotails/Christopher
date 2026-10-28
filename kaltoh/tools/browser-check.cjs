// Plays the real game in headless Chromium and checks it end to end, through simulated touch:
// a two-finger lift and placement, the Vulcan's reply, a ring, turning the base and spinning the
// t'an, the spin test, wiping Vulcan text into Standard and back, the ways-to-play page, and
// shaking to begin anew. Screenshots land in the directory given as the first argument.
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
    const waitFor = (names, timeout = 240000) => page.waitForFunction((n) => n.includes(window.__kaltoh?.phase), names, { timeout });
    const state = () => page.evaluate(() => {
      const k = window.__kaltoh;
      return { phase: k.phase, moves: k.game.moves, rings: k.game.rings.filter((r) => !r.broken).length, current: k.game.current, revealed: k.game.revealed, rods: k.display.size };
    });

    // A fresh game against nobody, with foresight always, so rings can be sought on purpose.
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
    const fpsStart = await pace();
    await waitFor(['play']);
    let s = await state();
    check(s.rods >= 40, `the nest gathers about its centre mass (${s.rods} t'an)`);
    check(await page.evaluate(() => document.querySelector('#inscription .v').textContent.length > 0), 'the inscription is written in Vulcan');
    check(await page.evaluate(() => !document.getElementById('inscription').classList.contains('show-s')), 'and not in Standard until wiped');
    await page.screenshot({ path: path.join(OUT, '1-nest.png') });

    // Find touch points for a move: two t'an under two fingers that make a good placement.
    // wantRing: a placement that would close a ring (with the true axis).
    async function findMove(wantRing) {
      // Let the assembly come to rest first, so what is found on screen stays where it was found.
      let still = 0;
      let last = null;
      for (let i = 0; i < 240 && still < 3; i++) {
        const now = await page.evaluate(() => [...window.__kaltoh.motion.q.toArray(), ...window.__kaltoh.motion.pos.toArray()]);
        still = last && now.every((x, j) => Math.abs(x - last[j]) < 1e-4) ? still + 1 : 0;
        last = now;
        await sleep(250);
      }
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
                // Only touch points that are unambiguous: a finger a few pixels off finds the same t'an.
                const steady = (p, id) => [[-5, 0], [5, 0], [0, -5], [0, 5]].every(([dx, dy]) => k.pickRod(p.x + dx, p.y + dy)?.rod === id);
                if (!steady(pa, ia) || !steady(pb, ib)) continue;
                const pose = R.placement(game, ha, hb, [eye.x, eye.y, eye.z]);
                if (!pose.ok) continue;
                const ring = AI.ringFor(game, pose);
                const move = { a: { x: pa.x, y: pa.y + 10 }, b: { x: pb.x, y: pb.y + 10 }, ring: ring?.k ?? 0, rods: [ia, ib], s: [ha.s, hb.s] };
                // A ring that still forms when the fingers land a few pixels off.
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
      const held = await page.evaluate(() => document.querySelector('#inscription .s').textContent);
      await touch('touchEnd', [f2]);
      await sleep(30);
      await touch('touchEnd', []);
      return held;
    }

    // 1. A plain move.
    const first = await findMove(false);
    check(first, 'a placement within reach can be found on screen');
    const held = await place(first, '2-holding.png');
    check(/Release/.test(held), `holding over two pieces offers to place it ("${held}")`);
    await page.waitForFunction(() => window.__kaltoh.game.moves >= 1, null, { timeout: 60000 });
    check(true, 'releasing places the t\'an');
    // 2. The Vulcan replies.
    await page.waitForFunction(() => window.__kaltoh.phase === 'play' && window.__kaltoh.game.current === 0, null, { timeout: 240000 });
    s = await state();
    check(s.moves >= 2 || s.revealed, `the Vulcan takes its turn (${s.moves} moves)`);
    check(await page.evaluate(() => [...document.querySelectorAll('#minds .seat')].findIndex((el) => el.classList.contains('now')) === window.__kaltoh.game.current),
      'the lit mark shows whose turn it is');
    await page.screenshot({ path: path.join(OUT, '3-after-vulcan.png') });

    // 3. Test the spin (free in this game), then close a ring.
    await page.click('#spiral');
    await page.waitForFunction(() => window.__kaltoh.phase === 'testing', null, { timeout: 20000 });
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, '4-spin-test.png') });
    check((await state()).revealed, 'testing the spin reveals the axis');
    await waitFor(['play']);
    // Look for a ring on screen; if none shows from here, turn the t'an a little and look again.
    let ringMove = null;
    for (let look = 0; look < 5 && !ringMove; look++) {
      ringMove = await findMove(true);
      if (!ringMove) {
        await page.evaluate(() => {
          const m = window.__kaltoh.motion;
          const q = new m.q.constructor().setFromAxisAngle(new m.pos.constructor(0, 1, 0), 0.9);
          m.q.premultiply(q);
        });
        await sleep(400);
      }
    }
    if (ringMove) {
      const before = (await state()).rings;
      const preview = await place(ringMove, '5-ring-preview.png');
      check(/ring/i.test(preview), `foresight shows the ring the move would make ("${preview}")`);
      await sleep(900);
      await page.screenshot({ path: path.join(OUT, '6-ring-forming.png') });
      await page.waitForFunction((n) => window.__kaltoh.game.rings.length > n, before, { timeout: 30000 });
      check(true, 'closing a loop around the axis makes a ring');
      await page.waitForFunction(() => ['play', 'over', 'complete'].includes(window.__kaltoh.phase) && window.__kaltoh.game.current === 0, null, { timeout: 240000 });
    } else {
      // No ring sits steadily under the fingers from here; place one directly, to see it form.
      const before = (await state()).rings;
      const placed = await page.evaluate(() => {
        const k = window.__kaltoh;
        const pose = k.AI.candidateMoves(k.game, { limit: 900 }).find((p) => k.AI.ringFor(k.game, p));
        if (!pose) return false;
        k.commit(pose);
        return true;
      });
      if (placed) {
        await sleep(900);
        await page.screenshot({ path: path.join(OUT, '6-ring-forming.png') });
        await page.waitForFunction((n) => window.__kaltoh.game.rings.length > n, before, { timeout: 30000 });
        check(true, 'closing a loop around the axis makes a ring (placed directly)');
        await page.waitForFunction(() => ['play', 'over', 'complete'].includes(window.__kaltoh.phase) && window.__kaltoh.game.current === 0, null, { timeout: 240000 });
      } else {
        console.log('(no ring to be made this game)');
      }
    }

    // 4. Turn the base with one finger on open space: the assembly lags, then follows.
    const before = await page.evaluate(() => ({ b: window.__kaltoh.motion.baseQ.toArray(), a: window.__kaltoh.motion.q.toArray() }));
    const p = { id: 3, x: 60, y: 700 };
    await touch('touchStart', [p]);
    for (let i = 0; i < 10; i++) {
      p.x += 18;
      await touch('touchMove', [p]);
      await sleep(30);
    }
    await touch('touchEnd', []);
    await sleep(1500);
    const after = await page.evaluate(() => ({ b: window.__kaltoh.motion.baseQ.toArray(), a: window.__kaltoh.motion.q.toArray() }));
    const moved = (x, y) => Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) > 0.05;
    check(moved(before.b, after.b), 'a drag on open space turns the base');
    check(moved(before.a, after.a), 'and the assembly follows it');
    await page.screenshot({ path: path.join(OUT, '7-base-turned.png') });

    // 5. Spin the t'an by dragging them; the stone never cuts into them.
    const rod = await page.evaluate(() => {
      const k = window.__kaltoh;
      for (const id of k.display.keys()) {
        const q = k.rodScreen(id, 0.5);
        if (q && q.y > 200 && q.y < 450 && k.pickRod(q.x, q.y)?.rod === id) return q;
      }
      return null;
    });
    check(rod, 'a t\'an can be touched');
    const baseBefore = await page.evaluate(() => window.__kaltoh.motion.baseQ.toArray());
    const spinBefore = await page.evaluate(() => window.__kaltoh.motion.q.toArray());
    const f = { id: 4, x: rod.x, y: rod.y };
    await touch('touchStart', [f]);
    for (let i = 0; i < 10; i++) {
      f.y += 16;
      await touch('touchMove', [f]);
      await sleep(30);
    }
    await touch('touchEnd', []);
    await sleep(300);
    const spinAfter = await page.evaluate(() => window.__kaltoh.motion.q.toArray());
    const baseAfter = await page.evaluate(() => window.__kaltoh.motion.baseQ.toArray());
    check(moved(spinBefore, spinAfter), 'dragging the t\'an spins the assembly');
    check(!moved(baseBefore, baseAfter), 'without turning the base');
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
          worst = Math.min(worst, local.y - window.__kaltoh.baseSurface(r));
        }
      }
      return worst;
    });
    check(clearance > -0.03, `the t'an stay clear of the stone (closest ${clearance.toFixed(3)})`);

    // 6. Wipe across the inscription: Standard appears; wipe again: Vulcan.
    const box = await page.evaluate(() => {
      const r = document.getElementById('inscription').getBoundingClientRect();
      return { x: r.left, y: r.top + r.height / 2, w: r.width };
    });
    async function wipe(dir) {
      const w = { id: 5, x: dir > 0 ? box.x + 10 : box.x + box.w - 10, y: box.y };
      await touch('touchStart', [w]);
      for (let i = 0; i < 10; i++) {
        w.x += dir * box.w * 0.09;
        await touch('touchMove', [w]);
        await sleep(25);
        if (i === 4 && dir > 0) await page.screenshot({ path: path.join(OUT, '8-wiping.png') });
      }
      await touch('touchEnd', []);
      await sleep(500);
    }
    await wipe(1);
    check(await page.evaluate(() => document.getElementById('inscription').classList.contains('show-s')), 'wiping across the Vulcan shows its translation');
    await page.screenshot({ path: path.join(OUT, '9-translated.png') });
    await wipe(-1);
    check(await page.evaluate(() => !document.getElementById('inscription').classList.contains('show-s')), 'wiping back returns it to Vulcan');

    // 7. The ways to play: open, translate, choose pass-and-play, begin anew.
    await page.click('#gear');
    await sleep(500);
    check(await page.evaluate(() => document.getElementById('panel').classList.contains('open')), 'the circle opens the ways to play');
    await page.screenshot({ path: path.join(OUT, '10-ways.png') });
    await page.evaluate(() => { window.__kaltoh.panel.zone.set('s'); });
    await page.screenshot({ path: path.join(OUT, '11-ways-standard.png') });
    await page.click('.chip[data-key="opponent"][data-index="3"]');
    check(await page.evaluate(() => window.__kaltoh.settings.opponent === 'none'), 'choosing pass and play');
    await page.click('[data-action="rules"]');
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, '12-rules.png') });
    await page.click('[data-action="ways"]');
    await page.click('[data-action="apply"]');
    await page.waitForFunction(() => window.__kaltoh.phase === 'dissolving' || window.__kaltoh.phase === 'intro', null, { timeout: 20000 });
    await waitFor(['play']);
    check(await page.evaluate(() => window.__kaltoh.game.players.every((p) => !p.vulcan)), 'a new game begins with the new ways');

    // 8. Shake for three seconds to begin anew.
    const fpsLate = await pace();
    console.log(`(software rendering: ${fpsStart.toFixed(1)} fps at first, ${fpsLate.toFixed(1)} fps now)`);
    const seedBefore = await page.evaluate(() => window.__kaltoh.game.seed);
    for (let i = 0; i < 400; i++) {
      const st = await page.evaluate(() => {
        window.kaltoh.shake(20);
        return { phase: window.__kaltoh.phase };
      });
      if (st.phase !== 'play') break;
      await sleep(60);
    }
    await page.waitForFunction((seed) => window.__kaltoh.game.seed !== seed && window.__kaltoh.phase === 'play', seedBefore, { timeout: 240000 });
    check((await page.evaluate(() => window.__kaltoh.game.seed)) !== seedBefore, 'shaking begins anew');
    await page.screenshot({ path: path.join(OUT, '13-anew.png') });
    check(errors.length === 0, `no errors on the page${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
