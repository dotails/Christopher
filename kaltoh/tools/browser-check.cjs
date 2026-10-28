// Plays the real game in headless Chromium and checks it end to end:
// two-finger lift and joins through simulated multi-touch, a complete sphere, and
// shake-to-begin-anew. Screenshots land in the directory given as the first argument.
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
  const url = `http://127.0.0.1:${server.address().port}/index.html?seed=42`;
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
    const phase = () => page.evaluate(() => window.__kaltoh.phase);
    const waitFor = (names) => page.waitForFunction((n) => n.includes(window.__kaltoh?.phase), names, { timeout: 180000 });

    await page.goto(url);
    await waitFor(['play']);
    // Software rendering is slow; keep game time close to wall time.
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const f = () => (performance.now() - t0 < 1500 ? (n++, requestAnimationFrame(f)) : res(n / 1.5));
      requestAnimationFrame(f);
    }));
    await page.evaluate((s) => { window.__kaltoh.timeScale = s; }, Math.max(1, 1 / (0.05 * fps)));
    await page.screenshot({ path: path.join(OUT, '1-jumble.png') });
    check((await page.evaluate(() => window.__kaltoh.game.present.size)) === 29, 'the jumble starts with the 29-rod skeleton');

    // Lift a t'an with two fingers, carry it to two tips, let go one finger first.
    async function join(u, v) {
      const g = await page.evaluate(([u, v]) => {
        const k = window.__kaltoh;
        const a = k.tipScreen(u);
        const b = k.tipScreen(v);
        return { a, b, trayY: k.tray.y, w: k.stage.size.width };
      }, [u, v]);
      const f1 = { id: 1, x: g.w / 2 - 60, y: g.trayY };
      const f2 = { id: 2, x: g.w / 2 + 60, y: g.trayY };
      await touch('touchStart', [f1]);
      await sleep(40);
      await touch('touchStart', [f1, f2]);
      for (let i = 1; i <= 6; i++) {
        const t = i / 6;
        await touch('touchMove', [
          { id: 1, x: f1.x + (g.a.x - f1.x) * t, y: f1.y + (g.a.y + 8 - f1.y) * t },
          { id: 2, x: f2.x + (g.b.x - f2.x) * t, y: f2.y + (g.b.y + 8 - f2.y) * t },
        ]);
        await sleep(30);
      }
      await sleep(250);
      const aimed = await page.evaluate(() => window.__kaltoh.input.targets.map((t) => t && t.tip));
      await touch('touchEnd', [{ id: 2, x: g.b.x, y: g.b.y + 8 }]);
      await touch('touchEnd', []);
      await waitFor(['play', 'complete']);
      return { aimed, last: await page.evaluate(() => window.__kaltoh.game.history.at(-1)) };
    }

    const [good, bad] = await page.evaluate(() => {
      const k = window.__kaltoh;
      const K = k.K;
      const g = k.game;
      const L = K.buildLattice();
      const s = (v) => k.tipScreen(v);
      const apart = (u, v) => Math.hypot(s(u).x - s(v).x, s(u).y - s(v).y);
      const true_ = K.missingEdges(g).filter((e) => K.balancedAfter(g, e)).map((e) => L.edges[e]).sort((p, q) => apart(...q) - apart(...p));
      let false_ = null;
      for (let u = 0; u < 30 && !false_; u++) {
        for (let v = u + 1; v < 30; v++) if (K.latticeEdge(u, v) < 0 && apart(u, v) > 110) { false_ = [u, v]; break; }
      }
      return [true_[0], false_];
    });
    let r = await join(...good);
    check(r.aimed.join() === good.join(), `fingers aimed at tips ${good}`);
    check(r.last.kind === 'harmony', 'joining true neighbours brings harmony');
    await page.screenshot({ path: path.join(OUT, '2-harmony.png') });
    await sleep(800);
    r = await join(...bad);
    check(r.last.kind === 'discord', 'joining false neighbours is discord');
    await page.screenshot({ path: path.join(OUT, '3-discord.png') });

    // Finish the sphere through the game's own placement path.
    for (let guard = 0; guard < 80 && (await phase()) !== 'complete'; guard++) {
      await waitFor(['play', 'complete']);
      if ((await phase()) === 'complete') break;
      await page.evaluate(() => {
        const k = window.__kaltoh;
        const K = k.K;
        const e = K.missingEdges(k.game).find((x) => K.balancedAfter(k.game, x));
        k.place(...K.buildLattice().edges[e]);
      });
      await sleep(100);
    }
    await waitFor(['complete']);
    check(await page.evaluate(() => window.__kaltoh.game.present.size === 60), 'all 60 outer t\'an are in place');
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, '4-complete.png') });
    const settled = await page.evaluate(() => window.__kaltoh.structure.inner.rods.filter((r) => r.settle > 0.95).length);
    check(settled === 90, 'the inner shell and its struts have settled');

    // A short shake is ignored; three seconds begins anew.
    const shakeFor = (seconds) => page.evaluate((secs) => new Promise((res) => {
      const t0 = performance.now();
      const id = setInterval(() => {
        window.kaltoh.shake(16);
        if (performance.now() - t0 > secs * 1000) {
          clearInterval(id);
          res();
        }
      }, 40);
    }), seconds);
    await shakeFor(1);
    await sleep(1200);
    check((await phase()) === 'complete', 'a one-second shake does not restart');
    // Keep shaking until the structure lets go (game time can lag wall time here).
    for (let i = 0; i < 20 && (await phase()) === 'complete'; i++) await shakeFor(1);
    check((await phase()) !== 'complete', 'a sustained shake dissolves the sphere');
    await waitFor(['play']);
    check(await page.evaluate(() => window.__kaltoh.game.seed !== 42), 'a three-second shake begins a new game');
    await page.screenshot({ path: path.join(OUT, '5-anew.png') });
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
