// Checks the guide (guide.js): it walks a new player through taking up a t'an with one finger,
// holding it with two, the blue and the amber, letting go too soon and placing it; says each
// lesson once and a repeated mistake again (not too often); says nothing when turned off; and
// every line it can say is written in voice-lines.json and rendered into assets/voice.
// Run: node kaltoh/tools/guide.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const { Guide, GUIDE_KEYS } = await import('../android/app/src/main/assets/www/js/guide.js');
const { FAMILIES } = await import('../android/app/src/main/assets/www/js/forms-rules.js');

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
  console.log(`ok - ${msg}`);
};

// A voice that says each line at once, and remembers what it said.
const spoken = [];
const sound = {
  speak: async (url) => {
    spoken.push(url.replace(/^.*\/(\w+)\.mp3$/, '$1'));
  },
  hush() {},
};
const settings = { guide: true, players: 2 };
const guide = new Guide({ sound, settings });
// Let the guide run a while, frame by frame, as the game does.
const run = async (seconds, state = {}) => {
  for (let t = 0; t < seconds; t += 1 / 30) {
    guide.update(1 / 30, { playing: true, trayWaiting: false, flipped: false, ...state });
    await Promise.resolve();
  }
};
const said = (key) => spoken.includes(key);

guide.begin('zen');
await run(20);
ok(said('welcome') && said('startZen') && said('twoPlayers'), 'a first game: welcome, what zen is, and that two take turns');
await run(10, { trayWaiting: true });
ok(said('touchTray'), 'the t\'an left waiting in the tray: how to take it up');
guide.lifted();
await run(6);
ok(said('dangling') && said('danglingAgain'), 'taken up by one finger: it dangles, and a second finger is wanted');
guide.released({ placed: false, dangling: true });
await run(3);
ok(said('droppedOne'), 'let go of while dangling: it went back to the tray, and why');
guide.lifted();
guide.held();
guide.aimed('amber');
await run(8);
ok(said('holding') && said('amber') && said('amberAgain'), 'held by two: where to lay it; amber, and amber again a while later');
guide.aimed('blue');
await run(3);
ok(said('blue'), 'blue: lift both fingers to place it');
guide.released({ placed: true });
await run(3);
ok(said('placedFirst'), 'the first placed: well done');
const before = spoken.length;
guide.lifted();
guide.held();
guide.aimed('amber');
guide.aimed('blue');
guide.released({ placed: true });
await run(4);
ok(!spoken.slice(before).some((k) => ['dangling', 'holding', 'amber', 'blue', 'placedFirst'].includes(k)), 'each lesson once');
guide.released({ placed: false, early: true });
await run(3);
const drops = spoken.filter((k) => k === 'droppedOne').length;
guide.released({ placed: false, early: true });
await run(3);
ok(spoken.filter((k) => k === 'droppedOne').length === drops, 'a mistake made again at once is not said again at once');
await run(25);
guide.released({ placed: false, early: true });
await run(3);
ok(spoken.filter((k) => k === 'droppedOne').length === drops + 1, 'but again a while later');
guide.transformed('cubocta');
await run(10);
ok(said('zenTransform') && said('form_cubocta'), 'zen transforms: and into what');
await run(3, { flipped: true });
await run(8, { flipped: true });
ok(said('flipped') && said('chooseWay'), 'the underside turned up: everything is here, and how to choose a way');
guide.chose('classic');
await run(4);
ok(said('wayKaltoh'), 'another way chosen: what comes next');
settings.guide = false;
guide.toggled(false);
await run(2);
const quiet = spoken.length;
guide.lifted();
guide.aimed('amber');
guide.released({ placed: false, early: true });
await run(10, { trayWaiting: true });
ok(spoken.at(-1) === 'guideOff' || spoken.length === quiet, 'turned off: it says so, then nothing');
ok(spoken.length === quiet, 'and says nothing more');

// Every line it may ask for is written, and rendered.
const lines = JSON.parse(readFileSync(new URL('./voice-lines.json', import.meta.url)));
const formKeys = Object.values(FAMILIES).flatMap((f) => f.forms.map((x) => `form_${x.key}`));
const wanted = [...GUIDE_KEYS, ...formKeys];
const missing = wanted.filter((k) => !lines[k]);
ok(missing.length === 0, `every line it may say is written (${wanted.length})${missing.length ? `: missing ${missing}` : ''}`);
const voice = new URL('../android/app/src/main/assets/www/assets/voice/', import.meta.url);
const unrendered = wanted.filter((k) => !existsSync(new URL(`${k}.mp3`, voice)));
ok(unrendered.length === 0, `and rendered in the Sky voice${unrendered.length ? `: missing ${unrendered}` : ''}`);

console.log(`guide: ${checks} checks passed`);
