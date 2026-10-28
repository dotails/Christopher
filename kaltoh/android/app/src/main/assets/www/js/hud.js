// The inscription at the foot of the board: each line in Vulcan script (Modern Vulcan, whose
// glyphs encipher the Latin letters) with a faint Federation Standard translation beneath.
// Neither Vulcan font carries digits or punctuation, so the Vulcan line is letters only and
// numbers are spelled out.

const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function spell(n) {
  if (n < 20) return NUMBERS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + NUMBERS[n % 10] : '');
  return spell(Math.floor(n / 100)) + ' hundred' + (n % 100 ? ' ' + spell(n % 100) : '');
}
export const ROMAN = ['I', 'II', 'III', 'IV'];

// Each entry: v = what is written in Vulcan, s = its Standard translation.
export const TEXT = {
  lift: { v: 'lift a tan with two fingers', s: "Lift a t'an from the tray with two fingers" },
  touch: { v: 'touch two tan to join their tips', s: "Touch two t'an to join their tips" },
  truth: { v: 'true neighbours bring order', s: 'True neighbours bring order. False bonds fall.' },
  angles: { v: 'read the angles of each joint', s: 'Joints keep true angles: 60° a triangle, 108° a pentagon' },
  axis: { v: 'it spins on a hidden axis', s: 'It spins on a hidden axis. Keep it in balance.' },
  goal: { v: 'complete the sphere', s: 'Complete the sphere' },
  turn: { v: 'drag the base to turn it', s: 'Drag the base to turn it. Pinch to draw near.' },
  shake: { v: 'shake three seconds to begin anew', s: 'Shake for three seconds to begin anew' },
  minds: { v: 'touch the marks to choose players', s: 'Tap the marks above to choose the number of players' },
  begin: { v: 'find the order within the chaos', s: 'Find the order within the chaos' },
  twoFingers: { v: 'two fingers lift a tan', s: "Two fingers lift a t'an" },
  aimNone: { v: 'touch two tan', s: "Touch two t'an of the structure" },
  aimOne: { v: 'touch a second tan', s: "Touch a second t'an" },
  aimReady: { v: 'release to join', s: 'Release to join them' },
  aimSame: { v: 'choose two different tips', s: 'Choose two different tips' },
  aimJoined: { v: 'already joined', s: 'Those tips are already joined' },
  returned: { v: 'the tan returns', s: "The t'an returns to the tray" },
  harmony: { v: 'harmony', s: 'Harmony. Order emerges.' },
  hoop: { v: 'a great hoop is closed', s: 'A great hoop is closed' },
  discord: { v: 'discord', s: 'Discord. The bond fails.' },
  shaken: { v: 'discord', s: "Discord. A t'an is shaken loose." },
  flung: { v: 'the spin flings it away', s: 'Unbalanced. The spin flings it away.' },
  wobble: { v: 'it wobbles', s: 'It wobbles. Restore its balance.' },
  keepShaking: { v: 'keep shaking', s: 'Keep shaking to begin anew' },
  locked: { v: 'begin anew to change players', s: 'Shake to begin anew, then choose players' },
};

export function playersText(n) {
  return n === 1
    ? { v: 'one mind', s: 'One player' }
    : { v: `${spell(n)} minds`, s: `${spell(n).replace(/^./, (c) => c.toUpperCase())} players` };
}

export function turnText(player) {
  return { v: `player ${spell(player + 1)}`, s: `Player ${ROMAN[player]}` };
}

export function completeText(game) {
  if (game.players > 1) {
    const w = game.winner;
    return { v: `player ${spell(w + 1)} completes the sphere`, s: `Player ${ROMAN[w]} completes the sphere` };
  }
  const s = game.stats[0];
  const moves = s.joined + s.discord + s.flung;
  return {
    v: `the sphere is complete in ${spell(moves)} moves`,
    s: `The sphere is complete · ${moves} moves · ${s.fallen} fallen`,
  };
}

const vulcanOnly = (text) => text.toLowerCase().replace(/[^a-z ]+/g, '').replace(/\s+/g, ' ').trim();

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.box = document.getElementById('inscription');
    this.vulcan = document.getElementById('vulcan');
    this.standard = document.getElementById('standard');
    this.minds = document.getElementById('minds');
    this.cycle = [];
    this.cycleIndex = 0;
    this.cycleTimer = 0;
    this.message = null; // { text, until }
    this.queue = [];
    this.hintText = null;
    this.shown = null;
    this.time = 0;
    this.pending = null;
  }

  show() {
    this.root.classList.add('ready');
  }

  setCycle(lines) {
    this.cycle = lines;
    this.cycleIndex = 0;
    this.cycleTimer = 0;
  }

  // A message for a while, then back to the instructions.
  say(text, seconds = 2.6) {
    this.message = { text, until: this.time + seconds };
    this.queue = [];
  }

  // A message to follow the current one.
  then(text, seconds = 2.6) {
    if (!this.message) this.say(text, seconds);
    else this.queue.push({ text, seconds });
  }

  // Shown for as long as it is set (e.g. while a t'an is held).
  hint(text) {
    this.hintText = text;
  }

  setPlayers(count, current) {
    if (this.minds.children.length !== count) {
      this.minds.replaceChildren(...Array.from({ length: count }, () => document.createElement('i')));
    }
    [...this.minds.children].forEach((el, i) => el.classList.toggle('now', i === current));
    this.minds.classList.toggle('solo', count === 1);
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
      if (this.cycleTimer > 5.2) {
        this.cycleTimer = 0;
        this.cycleIndex = (this.cycleIndex + 1) % this.cycle.length;
      }
      text = this.cycle[this.cycleIndex];
    }
    if (text && text !== this.shown) this.display(text);
  }

  // Cross-fade to new text; quick changes (while aiming) swap without a fade.
  display(text) {
    const quick = this.hintText !== null;
    this.shown = text;
    clearTimeout(this.pending);
    const swap = () => {
      this.vulcan.textContent = vulcanOnly(text.v);
      this.standard.textContent = text.s;
      this.fit();
      this.vulcan.classList.remove('hidden');
      this.standard.classList.remove('hidden');
    };
    if (quick) {
      swap();
      return;
    }
    this.vulcan.classList.add('hidden');
    this.standard.classList.add('hidden');
    this.pending = setTimeout(swap, 380);
  }

  // Shrink the Vulcan line to fit the width rather than wrap it.
  fit() {
    const el = this.vulcan;
    el.style.fontSize = '21px';
    const room = el.clientWidth;
    const need = el.scrollWidth;
    if (need > room && room > 0) el.style.fontSize = `${Math.max(11, Math.floor((21 * room) / need))}px`;
  }
}
