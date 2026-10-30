// The guide: a voice that talks a new player through the game - Kokoro's Sky voice, its lines
// rendered ahead of time (tools/make_voice.py, tools/voice-lines.json, assets/voice). It starts
// silent, waiting until the player turns it up under the stone (the Voice slider), and falls silent
// again whenever it is turned down to nothing. It hears what the game reports (a t'an taken up, held, aimed, let
// go, placed; what the carving says) and watches what it can see for itself (the stone turned
// over, a player waiting, a t'an left dangling, a shake gathering), and says each thing when it
// helps: the lessons once (remembered from one day to the next), a mistake again whenever it is
// made again (but not too often), never two lines at once.
import { CLASSIC, MANY, ZEN } from './texts.js';
import { FAMILIES } from './forms-rules.js';

const FILES = 'assets/voice/';
const QUIET = 1.2; // seconds of quiet kept between two lines
const AGAIN = 20; // seconds before a mistake's line may be said again
const STORE = 'kaltoh.guide.v1';
const PRAISE = ['placed1', 'placed2', 'placed3'];
const WAY_START = { zen: 'startZen', classic: 'startKaltoh', forms: 'startForms' };
const WAY_NEXT = { zen: 'wayZen', classic: 'wayKaltoh', forms: 'wayForms' };
const FORMS = FAMILIES.flatMap((f) => f.forms);

// What the carving says when a held t'an cannot rest where it is, and the line that explains it.
const REFUSALS = new Map([
  [CLASSIC.aimSame, 'aimSame'],
  [ZEN.aimSame, 'aimSame'],
  [CLASSIC.aimJoined, 'aimJoined'],
  [CLASSIC.aimFar, 'tooFar'],
  [CLASSIC.aimNear, 'tooNear'],
  [MANY.aimOuter, 'aimOuter'],
  [MANY.aimInner, 'struts'],
]);

export class Guide {
  // sound: audio.js's Sound (it speaks the lines); settings: the player's settings (`voice` at
  // nothing silences it).
  constructor({ sound, settings }) {
    this.sound = sound;
    this.settings = settings;
    this.queue = []; // lines waiting: { key, still, once }
    this.talking = false;
    this.quiet = 0; // seconds since the last line ended
    this.last = new Map(); // key -> when it was last said (seconds)
    this.clock = 0;
    this.way = null; // the way the game under way is played
    this.placements = 0; // t'an placed since the app opened
    this.dangling = 0; // seconds a t'an has hung from one finger
    this.amber = 0; // seconds a t'an has been held where it cannot rest
    this.aim = null; // where the held t'an would rest: 'blue', 'amber' or null
    this.waiting = 0; // seconds the t'an has waited in the tray, untouched
    this.flipped = false;
    this.flippedFor = 0; // seconds the underside has been turned up
    this.shaking = 0; // how far a shake to begin anew has gathered (0..1)
    this.awake = this.on; // whether the voice was up, as last set
    let saved = null;
    try {
      saved = localStorage.getItem(STORE);
    } catch {
      // Private mode: nothing was remembered.
    }
    // Never guided before: the first game is a calm one (main.js begins it in zen), and only the
    // first.
    this.fresh = saved === null;
    try {
      this.learnt = new Set(JSON.parse(saved ?? '[]'));
    } catch {
      this.learnt = new Set();
    }
  }

  get on() {
    return (this.settings.voice ?? 0) > 0.001;
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
    if (key) this.learnt.add(key);
    try {
      localStorage.setItem(STORE, JSON.stringify([...this.learnt]));
    } catch {
      // Private mode: the lessons are given again next time.
    }
  }

  // --- What the game reports -------------------------------------------------------------------

  // A game is under way: its way of playing, and how many take turns at it (zen is played alone).
  begin(way) {
    this.way = way;
    if (this.fresh) {
      this.fresh = false;
      this.remember();
    }
    this.greet();
  }

  // What is said of the game under way as it begins: a welcome (the first time), what its way is,
  // and taking turns.
  greet() {
    this.say('welcome', { once: true });
    if (WAY_START[this.way]) this.say(WAY_START[this.way], { once: true });
    if (this.way !== 'zen' && (this.settings.players ?? 1) > 1) this.say('twoPlayers', { once: true });
  }

  // Begun anew (shaken, or Shake under the stone).
  anew(way) {
    this.say('newGame', { gap: 5 });
    this.begin(way);
  }

  // Taken up by one finger: it dangles.
  lifted() {
    this.waiting = 0;
    this.dangling = 0.001;
    this.say('dangling', { once: true, still: () => this.dangling > 0 });
  }

  // Held by two.
  held() {
    this.dangling = 0;
    this.holding = true;
    this.say('holding', { once: true, still: () => this.holding });
  }

  // Where the held t'an would rest: 'blue', 'amber', or null (its ends not on two pieces yet).
  aimed(kind) {
    if (kind === 'blue' && this.aim !== 'blue') {
      this.amber = 0;
      this.say('blue', { once: true, still: () => this.aim === 'blue' });
    } else if (kind === 'amber' && this.aim !== 'amber') {
      this.amber = 0.001;
      this.say('amber', { once: true, still: () => this.aim === 'amber' });
    } else if (kind !== 'amber') {
      this.amber = 0;
    }
    this.aim = kind;
  }

  // Let go. placed: it rests where it was shown. dropped: it dangled from one finger, and fell
  // (or was thrown), another rising in the tray. Otherwise it went back to the tray: dangling, it
  // hung from one finger, barely moved; aim, where it would have rested when let go ('amber': where
  // it could not; null: its ends were not yet on two pieces, let go too soon).
  released({ placed, dangling = false, aim = null, dropped = false }) {
    this.holding = false;
    this.aim = null;
    this.amber = 0;
    this.dangling = 0;
    if (placed) {
      this.placements += 1;
      if (!this.learnt.has('placedFirst')) this.say('placedFirst', { once: true });
      else if (this.placements % 4 === 0) this.say(PRAISE[Math.floor(this.placements / 4) % PRAISE.length], { gap: 30 });
      if (this.way === 'zen' && this.placements >= 2) this.say('zenTen', { once: true });
      if (this.way === 'classic' && this.placements >= 3) this.say('lookKaltoh', { once: true });
      if (this.placements >= 3) this.say('turnStone', { once: true });
      if (this.placements >= 6) this.say('flipHint', { once: true, still: () => !this.flipped });
      return;
    }
    if (dropped) this.say('droppedDangling', { gap: AGAIN });
    else if (dangling) return;
    else if (aim === 'amber') this.say('missed', { gap: AGAIN });
    else this.say('droppedOne', { gap: AGAIN });
  }

  // What the carving says just happened: the lines that need a word of explanation.
  heard(text) {
    if (!text) return;
    const s = text.s ?? '';
    const refusal = REFUSALS.get(text);
    if (refusal) {
      this.say(refusal, { gap: AGAIN, still: () => this.aim === 'amber' });
      return;
    }
    if (text === CLASSIC.harmony || text === MANY.harmony || text === CLASSIC.hoop) this.say('harmony', { once: true });
    else if (text === CLASSIC.discord || text === MANY.discord || text === CLASSIC.shaken || text === MANY.shaken) {
      this.say('discord', { gap: 60 });
      if (this.way === 'classic') this.say('lookKaltoh', { once: true });
    } else if (text === MANY.whole) this.say('struts', { once: true });
    else if (text === MANY.noiseTouched || text === MANY.noiseFalls) this.say('noise', { gap: 60 });
    else if (text === CLASSIC.eases || text === MANY.eases || text === MANY.easesOuter) this.say('eases', { once: true });
    else if (text === CLASSIC.flung) this.say('flung', { gap: 60 });
    else if (text === CLASSIC.wobble) this.say('wobble', { gap: 60 });
    else if (text === ZEN.gathers) this.say('zenTransform', { gap: 10 });
    else if (/^It becomes the /.test(s)) this.transformed(FORMS.find((f) => s === `It becomes the ${f.s}`)?.key);
    else if (/^Fully formed/.test(s)) this.say('zenComplete', { gap: 30 });
    else if (/closed? true/i.test(s)) this.say('loopClosed', { once: true });
    else if (/complete|is whole/i.test(s)) this.say('complete', { gap: 30 });
  }

  // Zen: the structure has taken a form of many forms (its key in forms-rules.js).
  transformed(formKey) {
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

  // The Voice slider drawn along. Turned down to nothing, the guide falls silent at once, and
  // waits; turned up, it says how loud it will be (a line already being spoken follows the slider),
  // and turned up from nothing, it takes up the game under way where it stands.
  levelled(level) {
    const waited = !this.awake;
    this.awake = level > 0.001;
    if (!this.awake) {
      this.queue.length = 0;
      this.sound.hush();
      return;
    }
    if (!this.talking) this.say('voiceLevel', { gap: 8 });
    if (waited && this.way) this.greet();
  }

  // The stone taken by a finger to turn it: that lesson needs no telling.
  turned() {
    if (!this.learnt.has('turnStone')) this.remember('turnStone');
  }

  // Turned with two fingers (a twist or a pinch): nor that one.
  twisted() {
    if (!this.learnt.has('twoFingerTurn')) this.remember('twoFingerTurn');
  }

  // --- What it watches, each frame ----------------------------------------------------------------

  // state: { playing (a game under way and the player's to move), trayWaiting (the t'an lies in
  // the tray, the player's to take), flipped (the underside turned up to be read), shaking (how
  // far a shake to begin anew has gathered) }
  update(dt, { playing, trayWaiting, flipped, shaking = 0 }) {
    this.clock += dt;
    if (!this.on) {
      this.queue.length = 0;
      return;
    }
    // Waiting in the tray, untouched: first how to take it up, later a gentle word.
    this.waiting = playing && trayWaiting && !flipped ? this.waiting + dt : 0;
    if (this.waiting > 7) this.say('touchTray', { once: true, still: () => this.waiting > 0 });
    if (this.waiting > 45) this.say('idle', { gap: 90, still: () => this.waiting > 0 });
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
    // A shake gathering: what it will do.
    this.shaking = shaking;
    if (shaking > 0.3) this.say('shaking', { once: true, still: () => this.shaking > 0 });
    // The underside turned up: what is there; left up a long while, how to turn it back.
    if (flipped && !this.flipped) {
      this.remember('flipHint');
      this.say('flipped', { once: true, still: () => this.flipped });
      this.say('chooseWay', { once: true, still: () => this.flipped });
    }
    this.flipped = flipped;
    this.flippedFor = flipped ? this.flippedFor + dt : 0;
    if (this.flippedFor > 30) this.say('flippedBack', { once: true, still: () => this.flipped });
    // After a few placements, how to turn it with two fingers, and to look under it, if not found.
    if (this.placements >= 8 && !this.learnt.has('twoFingerTurn')) this.say('twoFingerTurn', { once: true });
    if (this.placements >= 10 && !this.learnt.has('flipped')) this.say('flipHint', { gap: 120, still: () => !this.flipped });
    // One line at a time, with a breath between; none while it could not be heard (before the
    // page may play sound, or with the app put away), the lines waiting till it can.
    if (this.talking || !this.sound.canSpeak) return;
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
export const GUIDE_KEYS = [...new Set([
  'welcome', 'touchTray', 'dangling', 'danglingAgain', 'holding', 'blue', 'amber', 'amberAgain', 'droppedDangling',
  'droppedOne', 'missed', 'placedFirst', ...PRAISE, 'idle', 'turnStone', 'twoFingerTurn', 'flipHint', 'flipped',
  'flippedBack', 'chooseWay', ...Object.values(WAY_NEXT), 'translate', 'shakeHint', 'shaking', 'newGame',
  ...Object.values(WAY_START), 'zenTen', 'zenTransform', 'zenComplete', 'harmony', 'discord', 'lookKaltoh',
  ...new Set(REFUSALS.values()), 'noise', 'eases', 'flung', 'wobble', 'loopClosed', 'struts', 'complete',
  'twoPlayers', 'voiceLevel',
])];
