// Checks the Vulcan carved under the stone: every line the carving can cut - the texts, the ways,
// the forms' names, and the lines made with numbers - is Golic Vulcan that can be cut (letters, the
// stroke, double stroke and half-stop); every word of it is one docs/vulcan.md accounts for (a word
// of its table, after the prefixes of its table, or a number); numbers are counted as the Vulcan
// Language Institute's tables count them; no English is left; and the doc's table of every line is
// as tools/vulcan-lines.mjs prints it.
// Run: node kaltoh/tools/vulcan.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const W = '../android/app/src/main/assets/www/js/';
const T = await import(`${W}texts.js`);
const { OPTIONS } = await import(`${W}settings.js`);
const { FAMILIES } = await import(`${W}forms-rules.js`);

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
  console.log(`ok - ${msg}`);
};

// Every line the carving can cut in Vulcan.
const carved = [];
const add = (t) => t && carved.push(t.v);
for (const group of [T.TEXT, T.CLASSIC, T.MANY, T.ZEN]) Object.values(group).forEach(add);
for (const way of ['classic', 'forms', 'zen']) T.rulesText({ way }).forEach(add);
for (const o of OPTIONS) {
  carved.push(o.v);
  for (const c of o.choices ?? []) {
    carved.push(c[1]);
    add(c[3]);
  }
}
const forms = FAMILIES.flatMap((f) => f.forms);
forms.forEach((f) => carved.push(f.v));
for (let i = 0; i < 4; i++) add(T.playerText(i));
for (let x = 0; x <= 60; x += 7) add(T.ofText(x, x + 3));
for (const sizes of [[3], [4], [5], [6], [7], [8], [3, 4], [3, 3, 5]]) for (const braced of [false, true]) add(T.loopText(sizes, braced));
add(T.loopsText({ inner: 3, outer: 1, loops: 14 }));
for (const f of forms) {
  add(T.zenBecomesText(f));
  add(T.zenWholeText(f));
  add(T.manyCompleteText({ players: 2, winner: 1 }, f));
  add(T.manyCompleteText({ players: 1, stats: [{ joined: 30, discord: 4 }] }, f));
}
for (let placed = 0; placed < 10; placed++) for (let stage = 0; stage < 5; stage++) add(T.zenStatusText({ stage, forms: 5, placed, per: 10 }));
add(T.zenStatusText({ complete: true, forms: 5 }));
add(T.classicCompleteText({ players: 2, winner: 0 }));
add(T.classicCompleteText({ players: 1, stats: [{ joined: 60, discord: 3, flung: 1, fallen: 4 }] }));
for (let n = 0; n <= 1000; n++) carved.push(T.spell(n));

ok(carved.every((v) => typeof v === 'string' && v.length > 0), `every line has its Vulcan (${carved.length})`);
const cut = carved.map(T.vulcanOnly);
const uncuttable = carved.filter((v) => !/^[a-z '-]+$/i.test(v));
ok(uncuttable.length === 0, `all of it can be cut: letters, the stroke, the double stroke, the half-stop${uncuttable.length ? `: ${uncuttable.slice(0, 3)}` : ''}`);

// The doc's prefixes and words.
const doc = readFileSync(new URL('../docs/vulcan.md', import.meta.url), 'utf8');
const section = (title) => doc.split(`## ${title}`)[1].split('\n## ')[0];
const firstColumn = (text) => [...text.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
const prefixes = firstColumn(section('The prefixes'));
const words = new Set(firstColumn(section('The words')));
ok(prefixes.length >= 10 && words.size >= 150, `docs/vulcan.md lists ${prefixes.length} prefixes and ${words.size} words`);
const NUMBER = /^(ris|teh|leh(-teh)?|(wuh|dah|reh|keh|kau|sheh|steh|oh|nau)(-(leh|teh|leh-teh))?|leh-(wuh|dah|reh|keh|kau|sheh|steh|oh|nau))$/;
// A word as carved: one the doc lists, or a number, either perhaps behind prefixes.
const known = (word) => words.has(word) || NUMBER.test(word) || prefixes.some((p) => word.startsWith(p) && word.length > p.length && known(word.slice(p.length)));
const unknown = new Set();
for (const line of cut) for (const word of line.split(' ')) if (word && word !== '-' && word !== '–' && !known(word)) unknown.add(word);
ok(unknown.size === 0, `every word carved is one the doc accounts for${unknown.size ? `: ${[...unknown].slice(0, 12)}` : ''}`);

// No English left among it.
const ENGLISH = new Set(['the', 'of', 'and', 'is', 'are', 'a', 'an', 'to', 'it', 'in', 'on', 'with', 'for', 'from', 'into', 'its', 'this', 'that', 'was', 'player', 'game', 'form', 'one', 'two', 'three', 'four', 'shake', 'rules']);
const english = new Set(cut.flatMap((l) => l.split(' ')).filter((w) => ENGLISH.has(w)));
ok(english.size === 0, `and no English is left in it${english.size ? `: ${[...english]}` : ''}`);

// Counted as the Institute counts (its tables of cardinal and enumerating numbers).
const TABLE = { 1: 'wuh', 2: 'dah', 3: 'reh', 4: 'keh', 5: 'kau', 6: 'sheh', 7: 'steh', 8: 'oh', 9: 'nau', 10: 'leh', 11: 'leh-wuh', 12: 'leh-dah', 19: 'leh-nau', 20: 'dah-leh', 25: 'dah-leh kau', 30: 'reh-leh', 90: 'nau-leh', 100: 'teh', 150: 'teh kau-leh', 200: 'dah-teh', 1000: 'leh-teh', 1500: 'leh-teh kau-teh', 2000: 'dah-leh-teh' };
const miscounted = Object.entries(TABLE).filter(([n, v]) => T.spell(Number(n)) !== v);
ok(miscounted.length === 0, `numbers counted as the Institute's tables count them${miscounted.length ? `: ${miscounted}` : ''}`);
ok(T.playerText(0).v === 'wuhr-mavausu' && T.playerText(3).v === 'kehr-mavausu' && T.ofText(7, 9).v === "steh t'nau", "the first player, the fourth, and seven of nine: wuhr-mavausu, kehr-mavausu, steh t'nau");
ok(T.CLASSIC.shape.v === 'dah ka-svitanik reh-leh dah-muk' && forms.find((f) => f.key === 'cube').v === 'snem-sheh-muk', 'the kal-toh\'s shape and the truncated cube named as the dictionary names solids');

// The doc's table of every line, as tools/vulcan-lines.mjs prints it.
const printed = execFileSync(process.execPath, [new URL('./vulcan-lines.mjs', import.meta.url).pathname], { encoding: 'utf8' }).trim();
const table = section('Every line').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Vulcan |')).join('\n').trim();
ok(table === printed, 'docs/vulcan.md\'s table of every line is as the game now carves it (else: node kaltoh/tools/vulcan-lines.mjs)');

console.log(`vulcan: ${checks} checks passed`);
