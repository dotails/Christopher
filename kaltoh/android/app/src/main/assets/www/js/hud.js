// Everything written on the screen is Vulcan - the title in Vulcan script, everything else in
// Modern Vulcan, whose glyphs encipher the Latin letters - and translates when wiped: drag a
// finger across a line and the Standard appears where the finger has passed; wipe it again and
// it is Vulcan once more. The settings and the rules translate the same way, as a whole page.
import { OPTIONS } from './settings.js';
import { FORMS } from './rules.js';

const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function spell(n) {
  n = Math.round(n);
  if (n < 0) return `less ${spell(-n)}`;
  if (n < 20) return NUMBERS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${NUMBERS[n % 10]}` : '');
  return `${spell(Math.floor(n / 100))} hundred${n % 100 ? ` ${spell(n % 100)}` : ''}`;
}
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
const vulcanOnly = (text) => text.toLowerCase().replace(/[^a-z ]+/g, '').replace(/\s+/g, ' ').trim();

export const TEXT = {
  begin: { v: 'find the order within the chaos', s: 'Find the order within the chaos' },
  lift: { v: 'lift a tan with two fingers', s: "Lift a t'an from the tray with two fingers" },
  touch: { v: 'touch two tan within its reach', s: "Touch two t'an, no further apart than its length" },
  ring: { v: 'close a loop around the hidden spin', s: 'Close a loop around the hidden spin: it becomes a ring' },
  hold: { v: 'what cannot bear the spin will fall', s: 'What cannot bear the spin will fall' },
  form: { v: 'rings above below and about the middle', s: 'Rings above, below and about the middle complete the form' },
  turnBase: { v: 'drag the base to turn it', s: "Drag the base to turn it. Drag the t'an to spin them." },
  test: { v: 'touch the spiral to test the spin', s: 'Tap the spiral to watch it spin' },
  wipe: { v: 'wipe across vulcan to translate', s: 'Wipe across Vulcan to translate it' },
  shake: { v: 'shake three seconds to begin anew', s: 'Shake for three seconds to begin anew' },
  gear: { v: 'the circle above holds the ways to play', s: 'The circle above holds the ways to play' },
  aimNone: { v: 'touch two tan', s: "Touch two t'an" },
  aimOne: { v: 'touch a second tan', s: "Touch a second t'an" },
  aimSame: { v: 'two different tan', s: "Two different t'an" },
  aimFar: { v: 'beyond its reach', s: 'Too far apart: beyond its length' },
  aimNear: { v: 'too close together', s: 'Too close together' },
  aimBlocked: { v: 'something is in the way', s: 'Something is in the way' },
  aimReady: { v: 'release to place', s: 'Release to place it' },
  returned: { v: 'the tan returns', s: "The t'an returns to the tray" },
  holds: { v: 'it holds', s: 'It holds' },
  ringLost: { v: 'the ring could not hold', s: 'The ring could not hold' },
  vulcanThinks: { v: 'the vulcan considers', s: 'The Vulcan considers' },
  vulcanTests: { v: 'the vulcan tests the spin', s: 'The Vulcan tests the spin' },
  yourTurn: { v: 'your turn', s: 'Your turn' },
  testing: { v: 'it spins on its hidden axis', s: 'It spins on its hidden axis' },
  testNotNow: { v: 'not now', s: 'Not now' },
  testOff: { v: 'testing is not allowed', s: 'Testing the spin is not allowed in this game' },
  outOfTan: { v: 'no tan remain', s: "No t'an remain" },
  lifeLost: { v: 'a life is lost', s: 'A life is lost' },
  quickens: { v: 'the spin quickens', s: 'The spin quickens' },
  keepShaking: { v: 'keep shaking', s: 'Keep shaking to begin anew' },
  lens: { v: 'touch the lens to see it as a hologram', s: 'Tap the lens for the hologram view' },
  hologramOn: { v: 'it follows your eyes', s: 'Hologram: the view follows your eyes' },
  hologramOff: { v: 'the view is still', s: 'Hologram off' },
  hologramDenied: { v: 'the camera was refused', s: 'Hologram needs the front camera; permission was refused' },
  hologramUnavailable: { v: 'no camera to follow you', s: 'No front camera is available for the hologram' },
  applied: { v: 'a new game begins', s: 'A new game begins' },
};

export const ringText = (k) => ({ v: `a ring of ${spell(k)}`, s: `A ring of ${k}` });
export const fellText = (n) => ({ v: n === 1 ? 'one tan falls' : `${spell(n)} tan fall`, s: n === 1 ? "A t'an falls" : `${n} t'an fall` });
export const ringPreviewText = (k) => ({ v: `release a ring of ${spell(k)} forms`, s: `Release: a ring of ${k} forms` });
export const playerText = (i) => ({ v: `player ${spell(i + 1)}`, s: `Player ${i + 1}` });
export const supplyText = (n) => ({ v: `${spell(n)} tan remain`, s: `${n} t'an remain` });

export function completeText(game) {
  const form = game.settings.form;
  if (game.settings.mode === 'meditation') {
    return { v: `the ${form} is complete in ${spell(game.moves)} moves`, s: `The ${form} is complete in ${game.moves} moves` };
  }
  return winnerText(game, `the ${form} is complete`, `The ${form} is complete`);
}

export function winnerText(game, v = '', s = '') {
  const w = game.winner;
  const lead = v ? `${v} ` : '';
  const leadS = s ? `${s}. ` : '';
  if (w < 0) return { v: `${lead}no one prevails`, s: `${leadS}No one prevails.` };
  if (game.players[w].vulcan) return { v: `${lead}the vulcan prevails`, s: `${leadS}The Vulcan prevails.` };
  if (game.players.some((p) => p.vulcan)) return { v: `${lead}you prevail`, s: `${leadS}You prevail.` };
  if (game.players.length === 1) return { v: `${lead}`.trim() || 'it is done', s: s || 'It is done' };
  return { v: `${lead}player ${spell(w + 1)} prevails`, s: `${leadS}Player ${w + 1} prevails.` };
}

// A translatable line: both scripts stacked in one place.
export function tr(text, cls = '') {
  const el = document.createElement('span');
  el.className = `tr ${cls}`.trim();
  const v = document.createElement('span');
  v.className = 'v';
  const s = document.createElement('span');
  s.className = 's';
  el.append(v, s);
  setTr(el, text);
  return el;
}

export function setTr(el, text) {
  el.querySelector('.v').textContent = vulcanOnly(text.v);
  el.querySelector('.s').textContent = text.s;
}

// A region whose lines translate when a finger wipes across it.
export class WipeZone {
  constructor(el, shown = 'v') {
    this.el = el;
    this.shown = shown;
    this.wipe = null;
    this.el.classList.toggle('show-s', shown === 's');
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
  }

  set(shown) {
    this.shown = shown;
    this.el.classList.toggle('show-s', shown === 's');
    this.clear();
  }

  down(e) {
    if (this.animating) return;
    this.start = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  }

  move(e) {
    const s = this.start;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!this.wipe) {
      if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      this.wipe = { dir: Math.sign(dx), x: e.clientX };
      this.el.setPointerCapture?.(e.pointerId);
      this.el.classList.add('wiping');
    }
    e.preventDefault();
    e.stopPropagation();
    this.wipe.x = e.clientX;
    this.paint(this.wipe.x);
  }

  up(e, cancelled) {
    const s = this.start;
    if (!s || s.id !== e.pointerId) return;
    this.start = null;
    if (!this.wipe) return;
    e.stopPropagation();
    const { dir, x } = this.wipe;
    const box = this.el.getBoundingClientRect();
    const travelled = (x - s.x) * dir;
    const quick = performance.now() - s.t < 260 && travelled > 40;
    const done = !cancelled && (quick || travelled > box.width * 0.28);
    const end = done ? (dir > 0 ? box.right + 4 : box.left - 4) : s.x;
    this.animate(x, end, () => {
      this.wipe = null;
      this.el.classList.remove('wiping');
      if (done) this.set(this.shown === 'v' ? 's' : 'v');
      else this.clear();
      this.onChange?.(this.shown);
    });
  }

  animate(from, to, done) {
    this.animating = true;
    const t0 = performance.now();
    const duration = 200;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / duration);
      this.paint(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(tick);
      else {
        this.animating = false;
        done();
      }
    };
    requestAnimationFrame(tick);
  }

  // Reveal the other script wherever the finger has passed.
  paint(x) {
    const dir = this.wipe.dir;
    const incoming = this.shown === 'v' ? '.s' : '.v';
    const outgoing = this.shown === 'v' ? '.v' : '.s';
    for (const el of this.el.querySelectorAll('.tr')) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const f = Math.min(1, Math.max(0, dir > 0 ? (x - r.left) / r.width : (r.right - x) / r.width));
      const pct = (v) => `${(v * 100).toFixed(2)}%`;
      const inEl = el.querySelector(incoming);
      const outEl = el.querySelector(outgoing);
      inEl.style.clipPath = dir > 0 ? `inset(0 ${pct(1 - f)} 0 0)` : `inset(0 0 0 ${pct(1 - f)})`;
      outEl.style.clipPath = dir > 0 ? `inset(0 0 0 ${pct(f)})` : `inset(0 ${pct(f)} 0 0)`;
    }
  }

  clear() {
    for (const el of this.el.querySelectorAll('.tr .v, .tr .s')) el.style.clipPath = '';
  }
}

export class Hud {
  constructor({ language = 'vulcan' } = {}) {
    this.root = document.getElementById('hud');
    this.crest = document.getElementById('crest');
    this.minds = document.getElementById('minds');
    this.box = document.getElementById('inscription');
    const shown = language === 'standard' ? 's' : 'v';
    this.title = tr({ v: 'kaltoh', s: 'KAL-TOH' }, 'title');
    document.getElementById('title').append(this.title);
    this.line = tr({ v: '', s: '' }, 'line');
    this.box.append(this.line);
    this.zones = [new WipeZone(this.crest, shown), new WipeZone(this.box, shown)];
    this.cycle = [];
    this.cycleIndex = 0;
    this.cycleTimer = 0;
    this.message = null;
    this.queue = [];
    this.hintText = null;
    this.shown = null;
    this.time = 0;
    this.pending = null;
  }

  setLanguage(language) {
    for (const z of this.zones) z.set(language === 'standard' ? 's' : 'v');
  }

  show() {
    this.root.classList.add('ready');
  }

  setCycle(lines) {
    this.cycle = lines;
    this.cycleIndex = 0;
    this.cycleTimer = 0;
  }

  say(text, seconds = 2.6) {
    this.message = { text, until: this.time + seconds };
    this.queue = [];
  }

  then(text, seconds = 2.6) {
    if (!this.message) this.say(text, seconds);
    else this.queue.push({ text, seconds });
  }

  hint(text) {
    this.hintText = text;
  }

  // The marks at the top: one per seat, the current one lit, each with its score or lives.
  setPlayers(game) {
    const seats = game.players;
    if (this.minds.children.length !== seats.length) {
      this.minds.replaceChildren(...seats.map(() => {
        const seat = document.createElement('div');
        seat.className = 'seat';
        const mark = document.createElement('i');
        seat.append(mark, tr({ v: '', s: '' }, 'score'));
        return seat;
      }));
    }
    [...this.minds.children].forEach((el, i) => {
      const p = seats[i];
      el.classList.toggle('now', i === game.current && !game.over);
      el.classList.toggle('out', p.out);
      el.classList.toggle('vulcan', Boolean(p.vulcan));
      const mode = game.settings.mode;
      const score = mode === 'collapse'
        ? { v: `${spell(p.lives)} ${p.lives === 1 ? 'life' : 'lives'}`, s: `${p.lives} ${p.lives === 1 ? 'life' : 'lives'}` }
        : mode === 'meditation'
          ? { v: `${spell(game.moves)} moves`, s: `${game.moves} moves` }
          : { v: spell(p.score), s: String(p.score) };
      setTr(el.querySelector('.score'), score);
    });
    this.minds.classList.toggle('solo', seats.length === 1);
  }

  charge(on) {
    this.box.classList.toggle('charged', on);
  }

  update(dt) {
    this.time += dt;
    if (this.message && this.time > this.message.until) {
      const next = this.queue.shift();
      this.message = next ? { text: next.text, until: this.time + next.seconds } : null;
    }
    let text = this.hintText ?? this.message?.text;
    if (!text && this.cycle.length) {
      this.cycleTimer += dt;
      if (this.cycleTimer > 5.4) {
        this.cycleTimer = 0;
        this.cycleIndex = (this.cycleIndex + 1) % this.cycle.length;
      }
      text = this.cycle[this.cycleIndex];
    }
    if (text && text !== this.shown) this.display(text);
  }

  display(text) {
    const quick = this.hintText !== null;
    this.shown = text;
    clearTimeout(this.pending);
    const swap = () => {
      setTr(this.line, text);
      this.fit();
      this.line.classList.remove('hidden');
    };
    if (quick) {
      swap();
      return;
    }
    this.line.classList.add('hidden');
    this.pending = setTimeout(swap, 360);
  }

  // Shrink a long line to fit the width rather than wrap it.
  fit() {
    for (const el of [this.line.querySelector('.v'), this.line.querySelector('.s')]) {
      el.style.fontSize = '';
      const room = this.box.clientWidth;
      const need = el.scrollWidth;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (need > room && room > 0) el.style.fontSize = `${Math.max(10, Math.floor((size * room) / need))}px`;
    }
  }
}

// The ways to play, and the rules - one page, translated by wiping like everything else.
export class Panel {
  constructor({ settings, nativeHologram, onChange, onApply, onClose }) {
    this.el = document.getElementById('panel');
    this.settings = settings;
    this.nativeHologram = nativeHologram;
    this.onChange = onChange;
    this.onApply = onApply;
    this.onClose = onClose;
    this.zone = new WipeZone(this.el, settings.language === 'standard' ? 's' : 'v');
    this.page = 'ways';
    this.el.addEventListener('click', (e) => this.click(e));
  }

  get open() {
    return this.el.classList.contains('open');
  }

  show(page = 'ways') {
    this.page = page;
    this.zone.set(this.settings.language === 'standard' ? 's' : 'v');
    this.render();
    this.el.scrollTop = 0;
    this.el.classList.add('open');
  }

  hide() {
    this.el.classList.remove('open');
  }

  click(e) {
    if (this.zone.wipe) return;
    const chip = e.target.closest('[data-key]');
    const action = e.target.closest('[data-action]');
    if (chip) {
      const option = OPTIONS.find((o) => o.key === chip.dataset.key);
      const choice = option.choices[Number(chip.dataset.index)];
      this.settings[option.key] = choice[0];
      this.onChange(option.key, choice[0]);
      this.render();
    } else if (action) {
      const a = action.dataset.action;
      if (a === 'apply') this.onApply();
      else if (a === 'close') this.onClose();
      else if (a === 'rules') this.show('rules');
      else if (a === 'ways') this.show('ways');
    }
  }

  render() {
    const body = document.createElement('div');
    body.className = 'page';
    const heading = (text) => {
      const h = document.createElement('div');
      h.className = 'heading';
      h.append(tr(text));
      return h;
    };
    const button = (text, action) => {
      const b = document.createElement('div');
      b.className = 'button';
      b.dataset.action = action;
      b.append(tr(text));
      return b;
    };
    if (this.page === 'ways') {
      body.append(heading({ v: 'ways to play', s: 'Ways to play' }));
      for (const o of OPTIONS) {
        if (o.when && !o.when(this.settings)) continue;
        if (o.native && !this.nativeHologram) continue;
        const row = document.createElement('div');
        row.className = 'row';
        const label = document.createElement('div');
        label.className = 'label';
        label.append(tr({ v: o.v, s: o.s }));
        const chips = document.createElement('div');
        chips.className = 'chips';
        o.choices.forEach(([value, v, s], i) => {
          const c = document.createElement('div');
          c.className = `chip${this.settings[o.key] === value ? ' on' : ''}`;
          c.dataset.key = o.key;
          c.dataset.index = String(i);
          c.append(tr({ v, s }));
          chips.append(c);
        });
        row.append(label, chips);
        body.append(row);
      }
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.append(
        button({ v: 'begin anew', s: 'Begin anew' }, 'apply'),
        button({ v: 'the rules', s: 'Rules' }, 'rules'),
        button({ v: 'return', s: 'Return' }, 'close'),
      );
      body.append(actions);
    } else {
      body.append(heading({ v: 'the rules of kaltoh', s: 'The rules of kal-toh' }));
      for (const [v, s] of RULES(this.settings)) {
        const p = document.createElement('div');
        p.className = 'para';
        p.append(tr({ v, s }));
        body.append(p);
      }
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.append(button({ v: 'ways to play', s: 'Ways to play' }, 'ways'), button({ v: 'return', s: 'Return' }, 'close'));
      body.append(actions);
    }
    const hint = document.createElement('div');
    hint.className = 'para hint';
    hint.append(tr(TEXT.wipe));
    body.append(hint);
    this.el.replaceChildren(body);
  }
}

function RULES(settings) {
  const form = FORMS[settings.form] ?? FORMS.globe;
  const formLine = settings.form === 'lantern'
    ? ['a lantern is three rings at least one above the centre and one below', 'A lantern: three rings - at least one above the centre mass and one below it.']
    : settings.form === 'sphere'
      ? ['a sphere is six rings two above two below one about the middle and one crowning each pole', 'A sphere: six rings - two above, two below, one about the middle, and one crowning each pole.']
      : ['a globe is four rings at least one above one below and one about the middle', 'A globe: four rings - at least one above, one below, and one about the middle.'];
  return [
    ['the tan cling where they touch gathered about a centre mass', "The t'an cling magnetically where they touch, gathered about a centre mass."],
    ['the kaltoh spins on a hidden axis every game a different one at a different speed', 'The kal-toh spins on a hidden axis - each game a different axis, at a different speed, sometimes with a drift.'],
    ['each turn place one tan touching two others no further apart than its length', "Each turn, place one t'an touching two others whose touch points are no further apart than its length."],
    ['close a loop that winds around the hidden axis and it becomes a ring', 'Close a loop that winds around the hidden axis, and its t\'an slide tip to tip into a ring, square to the axis.'],
    ['a loop too ragged cannot find its ring and stays a loop', 'A loop too ragged to become a ring stays a loop - though loops still share their load.'],
    ['after every move the spin tests the structure what cannot bear it falls', 'After every move the spin tests the structure: bonds that cannot bear their load give way, and whatever no longer hangs from the centre mass falls.'],
    ['test the spin to see the axis it costs a turn', 'Testing the spin shows the axis to everyone, at the cost of a turn. A ring shows it too.'],
    [formLine[0], formLine[1]],
    ['harmony each ring scores its tan each fallen tan costs one', "Harmony: a ring scores one point for each of its t'an; each t'an your move drops costs one. Completing the form scores ten."],
    ['collapse drop two or more and lose a life the spin quickens each round', "Collapse: drop two or more t'an and lose a life. The spin quickens every round."],
    ['meditation alone complete the form in as few moves as you can', 'Meditation: alone, complete the form in as few moves as you can.'],
    [`this form needs ${spell(form.rings)} rings`, `This form needs ${form.rings} rings.`],
    ['shake the device three seconds to begin anew', 'Shake the device for three seconds to begin anew.'],
  ];
}

export { cap };
