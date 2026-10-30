// The guide: a voice that talks a new player through the game - Kokoro's Sky voice, its lines
// rendered ahead of time (tools/make_voice.py, tools/voice-lines.json, assets/voice) - until they
// turn it off under the stone. It hears what the game reports (a t'an taken up, held, aimed, let
// go, placed; what the carving says) and watches what it can see for itself (the stone turned
// over, a player waiting, a t'an left dangling), and says each thing when it helps: the lessons
// once (remembered from one day to the next), a mistake again whenever it is made again (but not
// too often), never two lines at once.
import { CLASSIC, MANY } from './texts.js';

const FILES = 'assets/voice/';
const QUIET = 1.2; // seconds of quiet kept between two lines
const AGAIN = 20; // seconds before a mistake's line may be said again
const STORE = 'kaltoh.guide.v1';
const PRAISE = ['placed1', 'placed2', 'placed3'];
const WAY_START = { zen: 'startZen', classic: 'startKaltoh', forms: 'startForms' };
const WAY_NEXT = { zen: 'wayZen', classic: 'wayKaltoh', forms: 'wayForms' };

export class Guide {
  // sound: audio.js's Sound (it speaks the lines); settings: the player's settings (`guide` false
  // silences it).
  constructor({ sound, settings }) {
    this.sound = sound;
    this.settings = settings;
    this.queue = []; // lines waiting: { key, still }
    this.talking = false;
    this.quiet = 0; // seconds since the last line ended
    this.last = new Map(); // key -> when it was last said (seconds)
    this.clock = 0;
    this.placements = 0; // t'an placed since the app opened
    this.dangling = 0; // seconds a t'an has hung from one finger
    this.amber = 0; // seconds a t'an has been held where it cannot rest
    this.waiting = 0; // seconds the t'an has waited in the tray, untouched
    this.flippedFor = 0; // seconds the underside has been turned up
    try {
      this.learnt = new Set(JSON.parse(localStorage.getItem(STORE) ?? '[]'));
    } catch {
      this.learnt = new Set();
    }
  }

  get on() {
    return this.settings.guide !== false;
  }

  // Say a line now or as soon as the voice is free. once: never again (remembered); gap: not
  // again within that many seconds; still(): is it still worth saying when its turn comes.
  say(key, { once = false, gap = 0, still = null } = {}) {
    if (!this.on) return;
    if (once && this.learnt.has(key)) return;
    if (gap && this.clock - (this.last.get(key) ?? -Infinity) < gap) return;
    if (this.queue.some((q) => q.key === key)) return;
    this.last.set(key, this.clock);
    this.queue.push({ key, still, once });
    if (this.queue.length > 6) this.queue.shift();
  }

  remember(key) {
    this.learnt.add(key);
    try {
      localStorage.setItem(STORE, JSON.stringify([...this.learnt]));
    } catch {
      // Private mode: the lessons are given again next time.
    }
  }

  // --- What the game reports -------------------------------------------------------------------

  // A game is under way: its way of playing, how many players, and whether it is the very first.
  begin(way) {
    this.say('welcome', { once: true });
    if (WAY_START[way]) this.say(WAY_START[way], { once: true });
    if ((this.settings.players ?? 1) > 1) this.say('twoPlayers', { once: true });
  }

  // Begun anew (shaken, or the glyph under the stone).
  anew(way) {
    this.say('newGame', { gap: 5 });
    this.begin(way);
  }

  // Taken up by one finger: it dangles.
  lifted() {
    this.waiting = 0;
    this.dangling = 0.001;
    this.say('dangling', { once: true });
  }

  // Held by two.
  held() {
    this.dangling = 0;
    this.holding = true;
    this.say('holding', { once: true, still: () => this.holding });
  }

  // Where the held t'an would rest: 'blue', 'amber', or null (its ends on nothing yet).
  aimed(kind) {
    this.holding = true;
    if (kind === 'blue') {
      this.amber = 0;
      this.say('blue', { once: true, still: () => this.aim === 'blue' });
    } else if (kind === 'amber' && this.aim !== 'amber') {
      this.amber = 0.001;
      this.say('amber', { once: true, still: () => this.aim === 'amber' });
    }
    this.aim = kind;
  }

  // Let go. placed: it rests where it was shown; early: a finger came away while the other still
  // held it; dangling: it hung from one finger.
  released({ placed, early, dangling }) {
    this.holding = false;
    this.aim = null;
    this.amber = 0;
    this.dangling = 0;
    if (placed) {
      this.placements += 1;
      if (!this.learnt.has('placedFirst')) this.say('placedFirst', { once: true });
      else if (this.placements % 4 === 0) this.say(PRAISE[Math.floor(this.placements / 4) % PRAISE.length], { gap: 30 });
      if (this.placements === 3) this.say('turnStone', { once: true });
      if (this.placements === 6) this.say('flipHint', { once: true, still: () => !this.flipped });
      return;
    }
    this.say(early || dangling ? 'droppedOne' : 'missed', { gap: AGAIN });
  }

  // What the carving says just happened: the lines that need a word of explanation.
  heard(text) {
    if (!text) return;
    const s = text.s ?? '';
    if (text === CLASSIC.harmony || text === MANY.harmony) this.say('harmony', { once: true });
    else if (text === CLASSIC.discord || text === MANY.discord || text === CLASSIC.shaken || text === MANY.shaken) this.say('discord', { gap: 60 });
    else if (text === MANY.whole) this.say('struts', { once: true });
    else if (/too far/i.test(s)) this.say('tooFar', { gap: AGAIN });
    else if (/\bloops?\b/i.test(s) && /close/i.test(s)) this.say('loopClosed', { once: true });
    else if (/complete|fully formed/i.test(s)) this.say(/fully formed/i.test(s) ? 'zenComplete' : 'complete', { gap: 30 });
  }

  // Zen: the structure transforms, into a form of Many forms (its key in forms-rules.js).
  transformed(formKey) {
    this.say('zenTransform', { gap: 10 });
    if (formKey) this.say(`form_${formKey}`, { gap: 10 });
    this.say('zenTen', { once: true });
    this.say('flipHint', { once: true, still: () => !this.flipped });
  }

  // Another way chosen under the stone, waiting for a new game.
  chose(way) {
    if (WAY_NEXT[way]) this.say(WAY_NEXT[way], { gap: 3 });
    this.say('shakeHint', { once: true });
  }

  // The Starfleet delta touched.
  translated() {
    this.say('translate', { once: true });
  }

  // The guide turned on or off under the stone: it says so (off, then silence).
  toggled(on) {
    if (on) {
      this.say('guideOn');
      return;
    }
    this.queue.length = 0;
    this.sound.hush();
    this.talking = true;
    this.sound.speak(`${FILES}guideOff.mp3`).finally(() => {
      this.talking = false;
    });
  }

  // Turned with two fingers (a twist or a pinch): the lesson needs no telling.
  twisted() {
    this.remember('twoFingerTurn');
  }

  // --- What it watches, each frame ----------------------------------------------------------------

  // state: { playing (a game under way and the player's to move), trayWaiting (the t'an lies in
  // the tray, the player's to take), flipped (the underside turned up to be read) }
  update(dt, { playing, trayWaiting, flipped }) {
    this.clock += dt;
    if (!this.on) {
      this.queue.length = 0;
      return;
    }
    // Waiting in the tray, untouched: first how to take it up, later a gentle word.
    this.waiting = playing && trayWaiting && !flipped ? this.waiting + dt : 0;
    if (this.waiting > 7) this.say('touchTray', { once: true });
    if (this.waiting > 45) this.say('idle', { gap: 90 });
    // Hanging from one finger a while: a second finger is wanted.
    if (this.dangling > 0) {
      this.dangling += dt;
      if (this.dangling > 3.5) this.say('danglingAgain', { gap: AGAIN, still: () => this.dangling > 0 });
    }
    // Held where it cannot rest a while.
    if (this.amber > 0) {
      this.amber += dt;
      if (this.amber > 4) this.say('amberAgain', { gap: AGAIN, still: () => this.aim === 'amber' });
    }
    // The underside turned up: what is there; left up a long while, how to turn it back.
    if (flipped && !this.flipped) {
      this.remember('flipHint');
      this.say('flipped', { once: true });
      this.say('chooseWay', { once: true, still: () => this.flipped });
    }
    this.flipped = flipped;
    this.flippedFor = flipped ? this.flippedFor + dt : 0;
    if (this.flippedFor > 30) this.say('flippedBack', { once: true, still: () => this.flipped });
    // After a few placements, how to turn the stone and look under it, if not yet found.
    if (this.placements >= 8 && !this.learnt.has('twoFingerTurn')) this.say('twoFingerTurn', { once: true });
    if (this.placements >= 10) this.say('flipHint', { gap: 120, still: () => !this.flipped && !this.learnt.has('flipped') });
    // One line at a time, with a breath between.
    if (this.talking) return;
    this.quiet += dt;
    if (this.quiet < QUIET) return;
    while (this.queue.length) {
      const { key, still, once } = this.queue.shift();
      if (still && !still()) continue;
      if (once) this.remember(key);
      this.talking = true;
      this.sound.speak(`${FILES}${key}.mp3`).finally(() => {
        this.talking = false;
        this.quiet = 0;
      });
      break;
    }
  }
}

// The lines it can say, for tests: every key it may ask for has a file (tools/voice-lines.json).
export const GUIDE_KEYS = [
  'welcome', 'touchTray', 'dangling', 'danglingAgain', 'holding', 'blue', 'amber', 'amberAgain', 'droppedOne',
  'missed', 'placedFirst', ...PRAISE, 'idle', 'turnStone', 'twoFingerTurn', 'flipHint', 'flipped', 'flippedBack',
  'chooseWay', ...Object.values(WAY_NEXT), 'translate', 'shakeHint', 'newGame', ...Object.values(WAY_START), 'zenTen',
  'zenTransform', 'zenComplete', 'harmony', 'discord', 'tooFar', 'loopClosed', 'struts', 'complete', 'twoPlayers',
  'guideOn', 'guideOff',
];
