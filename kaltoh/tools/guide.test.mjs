// Checks the guide (guide.js): it walks a new player through taking up a t'an with one finger,
// holding it with two, the blue and the amber, letting go too soon or in the wrong place, and
// placing it; explains what the carving says (a refusal, discord, a transformation); says each
// lesson once and a repeated mistake again (not too often); says nothing when turned off; and
// every line it can say is written in voice-lines.json and rendered into assets/voice.
// Run: node kaltoh/tools/guide.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// What the guide remembers from one day to the next, kept as the browser keeps it.
const stored = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, String(v)) },
});

const { Guide, GUIDE_KEYS } = await import('../android/app/src/main/assets/www/js/guide.js');
const { FAMILIES } = await import('../android/app/src/main/assets/www/js/forms-rules.js');
const texts = await import('../android/app/src/main/assets/www/js/texts.js');
const { CLASSIC } = texts;

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
  console.log(`ok - ${msg}`);
};

// A voice that says each line at once, and remembers what it said.
const spoken = [];
const sound = {
  canSpeak: false, // not until the page may play sound
  speak: async (url) => {
    spoken.push(url.replace(/^.*\/(\w+)\.mp3$/, '$1'));
  },
  hush() {},
};
const settings = { voice: 1, players: 2 };
const guide = new Guide({ sound, settings });
// Let the guide run a while, frame by frame, as the game does.
const run = async (seconds, state = {}) => {
  for (let t = 0; t < seconds; t += 1 / 30) {
    guide.update(1 / 30, { playing: true, trayWaiting: false, flipped: false, ...state });
    await Promise.resolve();
  }
};
const said = (key) => spoken.includes(key);
const count = (key) => spoken.filter((k) => k === key).length;
const since = (n) => spoken.slice(n);

ok(guide.fresh, 'never guided before: a fresh start (main.js begins it in zen)');
guide.begin('zen');
ok(!guide.fresh && !new Guide({ sound, settings }).fresh, 'once begun, never fresh again, even before a word is said');
await run(3);
ok(spoken.length === 0, 'nothing said while it could not be heard');
sound.canSpeak = true;
await run(20);
ok(said('welcome') && said('startZen'), 'then a first game: welcome, and what zen is');
ok(!said('twoPlayers'), 'zen is played alone: nothing about taking turns');
await run(10, { trayWaiting: true });
ok(said('touchTray'), 'the t\'an left waiting in the tray: how to take it up');
guide.lifted();
await run(6);
ok(said('dangling') && said('danglingAgain'), 'taken up by one finger: it dangles, and a second finger is wanted');
guide.released({ placed: false, dangling: true });
await run(4);
ok(said('droppedDangling'), 'let go of while dangling: back to the tray, and how to hold it');
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
let before = spoken.length;
guide.lifted();
guide.held();
guide.aimed('amber');
guide.aimed('blue');
guide.released({ placed: true });
await run(8);
ok(!since(before).some((k) => ['dangling', 'holding', 'amber', 'blue', 'placedFirst'].includes(k)), 'each lesson once');
ok(said('zenTen'), 'zen: every ten placed, it takes a new form');
guide.lifted();
guide.held();
guide.released({ placed: false, aim: null });
await run(5);
ok(said('droppedOne'), 'let go before its ends were on two pieces: too soon');
guide.lifted();
guide.held();
guide.aimed('amber');
guide.released({ placed: false, aim: 'amber' });
await run(5);
ok(said('missed'), 'let go where it glowed amber: the wrong place');
const drops = count('droppedOne');
guide.released({ placed: false, aim: null });
await run(3);
ok(count('droppedOne') === drops, 'a mistake made again at once is not said again at once');
await run(25);
guide.released({ placed: false, aim: null });
await run(5);
ok(count('droppedOne') === drops + 1, 'but again a while later');
if (texts.ZEN) {
  guide.heard(texts.ZEN.gathers);
  guide.heard(texts.zenBecomesText({ v: 'cuboctahedron', s: 'cuboctahedron' }));
  await run(10);
  ok(said('zenTransform') && said('form_cubocta'), 'zen transforms: and into what');
} else {
  guide.transformed('cubocta');
  await run(10);
  ok(said('form_cubocta'), 'zen transforms: into what');
}
before = spoken.length;
guide.lifted();
guide.held();
guide.aimed('amber');
guide.heard(CLASSIC.aimFar);
await run(6);
ok(since(before).includes('tooFar'), 'a refusal explained while it is held there');
guide.aimed('blue');
guide.heard(CLASSIC.aimNear);
await run(6);
ok(!said('tooNear'), 'but not once it has moved on');
guide.released({ placed: true });
await run(4);
before = spoken.length;
await run(4, { shaking: 0.5 });
ok(since(before).includes('shaking'), 'a shake gathering: what it will do');
await run(3, { flipped: true });
await run(12, { flipped: true });
ok(said('flipped') && said('chooseWay'), 'the underside turned up: everything is here, and how to choose a way');
guide.chose('classic');
await run(8);
ok(said('wayKaltoh'), 'another way chosen: what comes next');
guide.anew('classic');
await run(30);
ok(said('startKaltoh') && said('twoPlayers'), 'the kal-toh begun, two at the board: what it is, and taking turns');
guide.heard(CLASSIC.discord);
await run(14);
ok(said('discord') && said('lookKaltoh'), 'discord: why, and what to look for');
settings.voice = 0.4;
guide.levelled(0.4);
await run(4);
ok(spoken.at(-1) === 'voiceLevel', 'the voice turned down: it says how loud it will be');
settings.voice = 0;
guide.levelled(0);
await run(2);
const quiet = spoken.length;
guide.lifted();
guide.aimed('amber');
guide.released({ placed: false, aim: 'amber' });
guide.heard(CLASSIC.discord);
await run(10, { trayWaiting: true });
ok(spoken.length === quiet, 'turned down to nothing: it says nothing more');

// Every line it may ask for is written, and rendered.
const lines = JSON.parse(readFileSync(new URL('./voice-lines.json', import.meta.url)));
const formKeys = FAMILIES.flatMap((f) => f.forms.map((x) => `form_${x.key}`));
const wanted = [...GUIDE_KEYS, ...formKeys];
const missing = wanted.filter((k) => !lines[k]);
ok(missing.length === 0, `every line it may say is written (${wanted.length})${missing.length ? `: missing ${missing}` : ''}`);
const unused = Object.keys(lines).filter((k) => !wanted.includes(k));
ok(unused.length === 0, `and none is written that it never says${unused.length ? `: ${unused}` : ''}`);
const voice = new URL('../android/app/src/main/assets/www/assets/voice/', import.meta.url);
const unrendered = wanted.filter((k) => !existsSync(new URL(`${k}.mp3`, voice)));
ok(unrendered.length === 0, `each rendered in the Sky voice${unrendered.length ? `: missing ${unrendered}` : ''}`);
const manifest = JSON.parse(readFileSync(new URL('voice.json', voice)));
const stale = wanted.filter((k) => manifest[k]?.text !== lines[k]);
ok(stale.length === 0, `as it is written now${stale.length ? `: re-render ${stale}` : ''}`);

console.log(`guide: ${checks} checks passed`);
