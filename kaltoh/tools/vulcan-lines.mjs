// The lines carved under the stone, Vulcan beside Standard, as the rows of docs/vulcan.md's table of
// every line (vulcan.test.mjs checks the table is as this prints it). Run: node kaltoh/tools/vulcan-lines.mjs
const W = new URL('../android/app/src/main/assets/www/js/', import.meta.url).href;
const T = await import(W + 'texts.js');
const { OPTIONS } = await import(W + 'settings.js');
const { FAMILIES } = await import(W + 'forms-rules.js');
const rows = [];
const row = (t, note = '') => rows.push(`| ${t.v.replace(/\|/g, '/')} | ${t.s.replace(/\|/g, '/')}${note ? ` (${note})` : ''} |`);
const section = (title) => rows.push(`| **${title}** | |`);
section('The face and its glyphs');
for (const k of ['title', 'begin', 'applied', 'pending', 'anew', 'rules', 'back', 'rulesTitle', 'translateGlyph']) row(T.TEXT[k]);
section('The ways');
for (const o of OPTIONS) {
  row({ v: o.v, s: o.s });
  for (const c of o.choices ?? []) {
    row({ v: c[1], s: c[2] });
    if (c[3]) row(c[3]);
  }
}
section('The players and the marks under them');
row(T.playerText(0));
row(T.playerText(1));
row(T.ofText(7, 9), 'a seat\'s score');
for (const k of ['markJoined', 'markHoop', 'markLoop', 'markFell', 'markForm', 'markPlaced']) row(T.TEXT[k]);
section('The kal-toh');
for (const t of Object.values(T.CLASSIC)) row(t);
for (const t of T.rulesText({ way: 'classic' })) row(t);
row(T.classicCompleteText({ players: 2, winner: 0 }));
row(T.classicCompleteText({ players: 1, stats: [{ joined: 60, discord: 3, flung: 1, fallen: 4 }] }));
section('Many forms');
for (const t of Object.values(T.MANY)) row(t);
row(T.loopText([3], false));
row(T.loopText([3, 3, 4], true));
row(T.loopsText({ inner: 3, outer: 1, loops: 14 }));
for (const t of T.rulesText({ way: 'forms' })) row(t);
const forms = FAMILIES.flatMap((f) => f.forms);
row(T.manyCompleteText({ players: 2, winner: 1 }, forms[1]));
row(T.manyCompleteText({ players: 1, stats: [{ joined: 30, discord: 4 }] }, forms[1]));
section('Zen');
for (const t of Object.values(T.ZEN)) row(t);
row(T.zenStatusText({ stage: 0, forms: 5, placed: 3, per: 10 }));
row(T.zenStatusText({ stage: 2, forms: 5, placed: 9, per: 10 }));
row(T.zenStatusText({ complete: true, forms: 5 }));
row(T.zenBecomesText(forms[1]));
row(T.zenWholeText(forms[4]));
for (const t of T.rulesText({ way: 'zen' })) row(t);
section('The forms');
for (const f of forms) row({ v: f.v, s: f.s });
console.log(rows.join('\n'));
