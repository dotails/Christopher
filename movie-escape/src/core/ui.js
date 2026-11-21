// All DOM / HUD work lives here so the game code stays about the game.
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function h32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

export const BEAN_COLORS = ['#ff4f9a', '#ffd23f', '#27d3c3', '#8b5cf6', '#ff8a3d', '#3d8bff', '#4cd964', '#ffffff'];

export class UI {
  constructor(game) {
    this.game = game;
    this.dialogQueue = [];
    this.dialogBusy = false;
    this.paperState = null;
    this._bind();
  }

  _bind() {
    const g = this.game;
    const click = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); g.audio.unlock(); g.audio.sfx('click'); fn(); });
    click('btn-play', () => g.newGame());
    click('btn-continue', () => g.continueGame());
    click('btn-settings', () => this.openSettings());
    click('btn-howto', () => $('howto').classList.add('show'));
    click('btn-howto-close', () => $('howto').classList.remove('show'));
    click('btn-pause', () => g.pause(true));
    click('btn-resume', () => g.pause(false));
    click('btn-respawn', () => { g.pause(false); g.respawn(true); });
    click('btn-pause-settings', () => this.openSettings());
    click('btn-quit', () => g.quitToMenu());
    click('btn-settings-close', () => { $('settings').classList.remove('show'); g.saveSettings(); });
    click('btn-skip', () => g.skipCinematic());
    click('btn-explore', () => { $('credits').classList.remove('show'); g.keepExploring(); });
    click('btn-end-menu', () => { $('credits').classList.remove('show'); g.quitToMenu(); });
    $('paper-wrap').addEventListener('click', (e) => { e.stopPropagation(); this.openBigPaper(); });
    $('paper-wrap').addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
    $('paper-big').addEventListener('click', () => { $('paper-big').classList.remove('show'); g.audio.sfx('paper'); g.setModal(false); });
    // first interaction unlocks audio
    const unlock = () => { g.audio.unlock(); };
    window.addEventListener('pointerdown', unlock, { once: false, passive: true });

    // settings controls
    const s = g.settings;
    const music = $('set-music'), sfx = $('set-sfx'), sens = $('set-sens');
    music.addEventListener('input', () => { s.music = +music.value; g.applySettings(); });
    sfx.addEventListener('input', () => { s.sfx = +sfx.value; g.applySettings(); });
    sens.addEventListener('input', () => { s.sens = +sens.value; g.applySettings(); });
    const seg = (id, key, map = (v) => v) => {
      const el = $(id);
      el.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation(); g.audio.sfx('click');
        s[key] = map(b.dataset.v); g.applySettings(); this.syncSettings();
      }));
    };
    seg('set-quality', 'quality');
    seg('set-autocam', 'autocam', (v) => v === 'on');
    seg('set-invert', 'invert', (v) => v === 'on');
    const sw = $('set-color');
    BEAN_COLORS.forEach((c) => {
      const b = document.createElement('button'); b.style.background = c; b.dataset.c = c;
      b.addEventListener('click', (e) => { e.stopPropagation(); g.audio.sfx('click'); s.color = c; g.applySettings(); this.syncSettings(); });
      sw.appendChild(b);
    });
    if (g.input.isTouch) { document.body.classList.add('touch'); $('rotate-hint').classList.add('enabled'); }
  }

  syncSettings() {
    const s = this.game.settings;
    $('set-music').value = s.music; $('set-sfx').value = s.sfx; $('set-sens').value = s.sens;
    const on = (id, v) => $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    on('set-quality', s.quality); on('set-autocam', s.autocam ? 'on' : 'off'); on('set-invert', s.invert ? 'on' : 'off');
    $('set-color').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === s.color));
  }

  openSettings() { this.syncSettings(); $('settings').classList.add('show'); }

  // ---------------- screens ----------------
  loading(p, tip) { $('load-fill').style.width = `${Math.round(p * 100)}%`; if (tip) $('load-tip').textContent = tip; }
  hideLoading() { const l = $('loading'); l.style.transition = 'opacity .6s'; l.style.opacity = 0; setTimeout(() => l.classList.remove('show'), 650); }
  showMenu(hasSave) {
    $('menu').classList.add('show');
    $('btn-continue').style.display = hasSave ? '' : 'none';
  }
  hideMenu() { $('menu').classList.remove('show'); }
  hud(on) { $('hud').classList.toggle('show', on); }
  touch(on) { $('touch').classList.toggle('show', on && this.game.input.isTouch); }
  pauseMenu(on) { $('pause').classList.toggle('show', on); }
  paperVisible(on) { $('paper-wrap').classList.toggle('hidden', !on); }

  setScene(num, name, take) {
    $('scene-name').textContent = num ? `SCENE ${num} · ${name}` : name;
    $('take-count').textContent = `TAKE ${take}`;
  }

  // ---------------- the task paper ----------------
  // state: { mode: 'old'|'fresh', title, groups: [{ title, current, tasks: [{id,text,count,total,done}] }] }
  renderPaper(state) {
    this.paperState = state;
    $('paper').innerHTML = this._paperHTML(state, false);
    $('paper').className = `paper ${state.mode}`;
    if ($('paper-big').classList.contains('show')) this._renderBig();
  }

  _fade(text, seed, big) {
    // An ancient, half-erased script: every letter fades differently.
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ' ') { out += ' '; continue; }
      const r = h32(seed + i);
      let o = 0.1 + r * 0.8;
      if (big) o = 0.32 + r * 0.6;
      if (r > 0.93) o = big ? 0.25 : 0.06;
      out += `<span style="opacity:${o.toFixed(2)}">${ch}</span>`;
    }
    return out;
  }

  _paperHTML(state, big) {
    const old = state.mode === 'old';
    let html = `<div class="ttl">${old ? this._fade(state.title, 'title', big) : state.title}</div>`;
    for (const grp of state.groups) {
      if (!big && !grp.current) continue;
      if (big || state.groups.length > 1) {
        const cls = grp.current || !old ? '' : 'ghost';
        html += `<div class="scene-h ${cls}">${old ? this._fade(grp.title, grp.title, big) : grp.title}</div>`;
      }
      for (const t of grp.tasks) {
        const txt = old ? this._fade(t.text, t.id, big) : t.text;
        const prog = t.total > 1 ? `<span class="prog">${t.count}/${t.total}</span>` : '';
        const ghost = old && !grp.current && !grp.done ? 'ghost' : '';
        html += `<div class="task ${t.done ? 'done' : ''} ${ghost}"><span class="box"></span><span class="txt">${txt}</span>${grp.current || !old ? prog : ''}</div>`;
      }
    }
    if (!old) html += '<div class="stamp">FINAL CUT</div>';
    return html;
  }

  _renderBig() {
    const inner = $('paper-big-inner');
    inner.innerHTML = this._paperHTML(this.paperState, true);
    inner.className = `paper ${this.paperState.mode}`;
  }

  openBigPaper() {
    if (!this.paperState) return;
    this._renderBig();
    $('paper-big').classList.add('show');
    this.game.audio.sfx('paper');
    this.game.setModal(true);
  }

  pulsePaper() {
    const p = $('paper');
    p.classList.remove('pulse'); void p.offsetWidth; p.classList.add('pulse');
  }

  async crumblePaper() {
    const p = $('paper');
    p.classList.add('shake');
    this.game.audio.sfx('crumble');
    await sleep(1100);
    p.classList.remove('shake');
    const rect = p.getBoundingClientRect();
    const layer = $('crumble-layer');
    const cols = 4, rows = 6;
    const fw = rect.width / cols, fh = rect.height / rows;
    const frags = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const f = document.createElement('div');
      f.className = 'frag';
      Object.assign(f.style, { left: `${rect.left + c * fw}px`, top: `${rect.top + r * fh}px`, width: `${fw + 1}px`, height: `${fh + 1}px` });
      const clone = p.cloneNode(true); clone.removeAttribute('id');
      Object.assign(clone.style, { left: `${-c * fw}px`, top: `${-r * fh}px`, width: `${rect.width}px`, transform: 'none' });
      f.appendChild(clone); layer.appendChild(f); frags.push(f);
    }
    $('paper-wrap').classList.add('hidden');
    this.game.audio.sfx('crumble');
    const anims = frags.map((f, i) => {
      const dx = (Math.random() - 0.5) * 260, rot = (Math.random() - 0.5) * 540;
      const fall = window.innerHeight - rect.top + 50;
      return f.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1, filter: 'brightness(1)' },
        { transform: `translate(${dx * 0.3}px, ${-20 - Math.random() * 40}px) rotate(${rot * 0.2}deg)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${dx}px, ${fall}px) rotate(${rot}deg)`, opacity: 0, filter: 'brightness(.6)' },
      ], { duration: 1500 + Math.random() * 900, delay: Math.random() * 450 + (rows - Math.floor(i / cols)) * 40, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' }).finished;
    });
    await Promise.all(anims);
    layer.innerHTML = '';
  }

  freshPaperIn() {
    $('paper-wrap').classList.remove('hidden');
    const p = $('paper');
    p.classList.remove('stamp-in'); void p.offsetWidth; p.classList.add('stamp-in');
    this.pulsePaper();
    setTimeout(() => this.game.audio.sfx('stamp'), 250);
  }

  // ---------------- dialog (the Director) ----------------
  say(lines, { cine = false } = {}) {
    return new Promise((resolve) => {
      // never let the Director fall behind the action: drop stale queued lines
      if (this.dialogQueue.length >= 2) this.dialogQueue.splice(0, this.dialogQueue.length - 1).forEach((q) => q.resolve());
      this.dialogQueue.push({ lines: Array.isArray(lines) ? lines : [lines], resolve, cine });
      if (!this.dialogBusy) this._runDialog();
    });
  }

  clearDialog() {
    this.dialogQueue.forEach((q) => q.resolve());
    this.dialogQueue = [];
    this.dialogSkip = true;
  }

  async _runDialog() {
    this.dialogBusy = true;
    const box = $('dialog'), txt = $('dialog-text');
    while (this.dialogQueue.length) {
      const item = this.dialogQueue.shift();
      box.classList.toggle('cine', item.cine);
      box.classList.add('show');
      for (const line of item.lines) {
        this.dialogSkip = false;
        txt.textContent = '';
        for (let i = 0; i < line.length; i++) {
          if (this.dialogSkip || this.game.skipping) break;
          txt.textContent = line.slice(0, i + 1);
          if (i % 3 === 0) this.game.audio.sfx('tick');
          await sleep(26);
        }
        txt.textContent = line;
        const hold = Math.max(1600, line.length * 48);
        const t0 = performance.now();
        while (performance.now() - t0 < hold && !this.dialogSkip && !this.game.skipping) await sleep(50);
      }
      item.resolve();
    }
    box.classList.remove('show');
    this.dialogBusy = false;
  }

  // ---------------- popups ----------------
  toast(text, cls = '') {
    const el = document.createElement('div');
    el.className = `toast-item ${cls}`;
    el.textContent = text;
    $('toast').appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  slate(title, scene, take) {
    $('slate-title').textContent = title;
    $('slate-scene').textContent = scene;
    $('slate-take').textContent = take;
    const s = $('slate');
    s.classList.remove('show'); void s.offsetWidth; s.classList.add('show');
    setTimeout(() => this.game.audio.sfx('clap'), 600);
  }

  letterbox(on) { $('letterbox').classList.toggle('show', on); if (!on) this.caption(''); }
  caption(text) { const c = $('caption'); if (text) { c.textContent = text; c.classList.add('show'); } else c.classList.remove('show'); }
  skipButton(on) { $('btn-skip').classList.toggle('show', on); }

  fade(to, { white = false, ms = 600 } = {}) {
    const f = $('fade');
    f.classList.toggle('white', white);
    f.style.transition = `opacity ${ms}ms ease`;
    f.style.opacity = to;
    return sleep(ms);
  }

  bossBar(show, hp = 3) {
    $('boss-bar').classList.toggle('show', show);
    document.querySelectorAll('.boss-hp i').forEach((el, i) => el.classList.toggle('gone', i >= hp));
  }

  credits(stats) {
    $('end-stats').innerHTML = stats.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    $('credits').classList.add('show');
  }
}
