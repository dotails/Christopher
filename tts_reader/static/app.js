"use strict";

const $ = (id) => document.getElementById(id);
const textEl = $("text");
const readerEl = $("reader");
const voiceEl = $("voice");
const speedEl = $("speed");
const speedOut = $("speedOut");
const playBtn = $("play");
const editBtn = $("edit");
const statusEl = $("status");

const store = {
  get(k, d) { try { const v = localStorage.getItem("ttsr." + k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ttsr." + k, v); } catch { /* storage unavailable */ } },
};

const MAX_CHUNK = 180; // characters per synthesis request; small chunks start playing sooner

let chunks = [];       // [{p: paragraphIndex, text}]
let paraStart = [];    // paragraph index -> first chunk index
let paraOffset = [];   // paragraph index -> character offset in the textarea
let parsedText = null;
let textKey = "";      // identifies the parsed text (the Android player uses it)
let pos = 0;           // current chunk index
let cursorPicked = false;
let message = "";      // one-off status message, cleared on the next action
const shown = { pos: -1, playing: null, loading: null, ready: "" };

function speed() { return +(+speedEl.value).toFixed(2); }

// ---------- text -> paragraphs -> chunks ----------

function splitChunks(t) {
  const sentences = t.match(/[^.!?…]*[.!?…]+["'”’)\]]*\s*|[^.!?…]+/g) || [t];
  const out = [];
  let cur = "";
  for (let s of sentences) {
    while (s.length > 400) {
      let cut = s.lastIndexOf(", ", 300);
      if (cut < 100) cut = s.lastIndexOf(" ", 300);
      cut = cut < 100 ? 300 : cut + 1;
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      out.push(s.slice(0, cut).trim());
      s = s.slice(cut);
    }
    if (cur && (cur + s).length > MAX_CHUNK) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function hashText(parts) {
  let h = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) h = Math.imul(h ^ part.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 1, 16777619);
  }
  return parts.length + "-" + (h >>> 0).toString(36);
}

function parse(text) {
  // Blank lines separate paragraphs; if there are none, every line is a paragraph.
  const blocks = /\n[ \t]*\n/.test(text) ? text.split(/\n[ \t]*\n/) : text.split("\n");
  chunks = [];
  paraStart = [];
  paraOffset = [];
  let from = 0;
  for (const raw of blocks) {
    const at = text.indexOf(raw, from);
    from = at + raw.length;
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) continue;
    const p = paraStart.length;
    paraStart.push(chunks.length);
    paraOffset.push(at);
    for (const c of splitChunks(t)) chunks.push({ p, text: c });
  }
  parsedText = text;
  textKey = hashText(chunks.map((c) => c.text));
  pos = 0;
  player.textChanged();
  renderReader();
}

function paraAtOffset(offset) {
  let p = 0;
  while (p + 1 < paraOffset.length && paraOffset[p + 1] <= offset) p++;
  return p;
}

// ---------- browser player (Python server version) ----------
// Generates the whole text one sentence at a time, starting at the current position,
// and plays the clips with an <audio> element. Speed is applied at playback.

function createWebPlayer() {
  const audio = new Audio();
  audio.preload = "auto";
  const cache = new Map(); // chunk index -> {voice, ctrl, promise, url}
  const clientId = Math.random().toString(36).slice(2);
  let epoch = 0;           // bumped on every jump; the server skips requests from older epochs
  let playing = false;
  let loading = false;
  let finished = false;
  let token = 0;           // bumps whenever playback is redirected, so stale awaits bail out
  let loaded = null;       // {i, voice, url} of the clip in the audio element
  let unlocked = false;
  let preloading = false;
  let preloadError = "";
  let wakeLock = null;
  let savedFor = "";       // text+voice last downloaded as one WAV
  let savedName = "";

  const isReady = (i) => { const e = cache.get(i); return !!(e && e.url && e.voice === voiceEl.value); };

  function getAudio(i) {
    const voice = voiceEl.value;
    const hit = cache.get(i);
    if (hit && hit.voice === voice) return hit.promise;
    if (hit) drop(i);
    const ctrl = new AbortController();
    const entry = { voice, ctrl, url: null };
    const query = new URLSearchParams({ text: chunks[i].text, voice, speed: 1, client: clientId, epoch });
    entry.promise = fetch("api/tts?" + query, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error("server error " + r.status);
        return r.blob();
      })
      .then((blob) => {
        entry.url = URL.createObjectURL(blob);
        return { i, voice, url: entry.url };
      });
    entry.promise.catch(() => { if (cache.get(i) === entry) cache.delete(i); });
    cache.set(i, entry);
    return entry.promise;
  }

  function drop(i) {
    const e = cache.get(i);
    if (!e) return;
    e.ctrl.abort();
    if (e.url && (!loaded || loaded.url !== e.url)) URL.revokeObjectURL(e.url);
    cache.delete(i);
  }

  function clearCache() { [...cache.keys()].forEach(drop); }

  // Call before redirecting playback: cancels clips still being generated for the old spot.
  function newEpoch() {
    epoch++;
    for (const [i, e] of [...cache]) if (!e.url) drop(i);
  }

  // Generates every sentence in order from the current position, then wraps to the start.
  async function preload() {
    if (preloading) return;
    preloading = true;
    preloadError = "";
    try {
      while (chunks.length) {
        let next = -1;
        for (let k = 0; k < chunks.length; k++) {
          const i = (pos + k) % chunks.length;
          if (!isReady(i)) { next = i; break; }
        }
        if (next < 0) { await saveRecording(); break; }
        try {
          await getAudio(next);
        } catch (err) {
          if (err.name === "AbortError" || /409/.test(err.message)) continue; // superseded by a jump
          preloadError = err.message;
          break;
        }
      }
    } finally {
      preloading = false;
    }
  }

  // Once every sentence is ready, joins the clips into one WAV and downloads it.
  async function saveRecording() {
    const voice = voiceEl.value;
    const id = textKey + "|" + voice;
    if (savedFor === id || !chunks.length) return;
    savedFor = id;
    try {
      const parts = [];
      let rate = 24000;
      for (let i = 0; i < chunks.length; i++) {
        const buf = await (await fetch(cache.get(i).url)).arrayBuffer();
        if (i === 0) rate = new DataView(buf).getUint32(24, true);
        parts.push(new Uint8Array(buf, 44)); // skip each clip's 44-byte WAV header
      }
      const size = parts.reduce((n, p) => n + p.length, 0);
      const header = new DataView(new ArrayBuffer(44));
      const str = (o, t) => [...t].forEach((c, k) => header.setUint8(o + k, c.charCodeAt(0)));
      str(0, "RIFF"); header.setUint32(4, 36 + size, true); str(8, "WAVEfmt ");
      header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true);
      header.setUint32(24, rate, true); header.setUint32(28, rate * 2, true); header.setUint16(32, 2, true);
      header.setUint16(34, 16, true); str(36, "data"); header.setUint32(40, size, true);
      const words = chunks[0].text.replace(/[\\/:*?"<>|\s]+/g, " ").trim().split(" ").slice(0, 6).join(" ").slice(0, 60);
      const voiceName = voiceEl.selectedOptions[0]?.textContent.split(" (")[0] || voice;
      savedName = `TTS Reader - ${words} - ${voiceName}.wav`;
      const url = URL.createObjectURL(new Blob([header.buffer, ...parts], { type: "audio/wav" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = savedName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      savedFor = "";
      savedName = "";
      preloadError = "saving the recording failed: " + err.message;
    }
  }

  async function playFrom(i) {
    if (!chunks.length) return;
    pos = Math.max(0, Math.min(i, chunks.length - 1));
    const my = ++token;
    playing = true;
    loading = true;
    finished = false;
    audio.pause();
    keepAwake(true);
    preload();
    let clip;
    try {
      clip = await getAudio(pos);
    } catch (err) {
      if (my !== token) return;
      if (err.name === "AbortError" || /409/.test(err.message)) { playFrom(pos); return; }
      stop();
      message = `Couldn't generate speech (${err.message}). Is the server still running?`;
      return;
    }
    if (my !== token) return;
    loaded = clip;
    audio.src = clip.url;
    audio.defaultPlaybackRate = audio.playbackRate = speed();
    loading = false;
    try {
      await audio.play();
    } catch {
      if (my !== token) return;
      stop();
      message = "Tap play to start";
    }
  }

  function stop() {
    token++;
    playing = false;
    loading = false;
    audio.pause();
    keepAwake(false);
  }

  function unlockAudio() {
    // iOS only lets an audio element play after it has been started inside a tap.
    if (unlocked) return;
    unlocked = true;
    const rate = 8000, n = 800;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, s) => [...s].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 2, true);
    audio.src = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
    audio.play().catch(() => {});
  }

  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch { /* not supported or not allowed */ }
  }

  audio.addEventListener("ended", () => {
    if (!playing || !loaded || audio.src !== loaded.url) return;
    if (pos + 1 < chunks.length) {
      playFrom(pos + 1);
    } else {
      stop();
      finished = true;
      pos = 0;
      loaded = null;
    }
  });

  audio.addEventListener("pause", () => {
    // Paused from outside the page (headphones unplugged, another app took audio).
    if (playing && !loading && audio.paused && !audio.ended && loaded && audio.src === loaded.url) {
      playing = false;
      keepAwake(false);
    }
  });

  return {
    textChanged() {
      stop();
      epoch++;
      clearCache();
      loaded = null;
      finished = false;
    },
    play() {
      unlockAudio();
      if (loaded && loaded.i === pos && loaded.voice === voiceEl.value && !audio.ended) {
        playing = true;
        finished = false;
        audio.playbackRate = speed();
        keepAwake(true);
        preload();
        audio.play().catch(() => playFrom(pos));
      } else {
        playFrom(pos);
      }
    },
    pause() { if (playing) stop(); },
    seek(i, andPlay) {
      newEpoch();
      if (playing || andPlay) {
        unlockAudio();
        playFrom(i);
        return;
      }
      token++;
      pos = i;
      loaded = null;
      finished = false;
      audio.removeAttribute("src");
      preload();
    },
    setSpeed() { if (loaded) audio.playbackRate = speed(); },
    setVoice() {
      epoch++;
      clearCache();
      if (playing) playFrom(pos);
    },
    startedAt() { return loaded && loaded.i === pos ? audio.currentTime : 0; },
    state() {
      const saved = savedFor === textKey + "|" + voiceEl.value ? savedName : "";
      return { pos, playing, loading, finished, ready: isReady, saved, error: preloadError ? `Couldn't generate speech (${preloadError}).` : "" };
    },
  };
}

// ---------- Android player ----------
// The app's PlaybackService generates and plays in the background (screen off too);
// the page sends it the sentences and polls its state.

function createNativePlayer(app) {
  let st = {};
  const poll = () => { try { st = JSON.parse(app.state()); } catch { st = {}; } };
  const ensureLoaded = () => {
    poll();
    if (st.key !== textKey) {
      app.load(textKey, JSON.stringify(chunks.map((c) => c.text)), JSON.stringify(chunks.map((c) => c.p)), voiceEl.value, pos);
      st = { key: textKey, pos, playing: false, ready: "" };
    }
  };
  return {
    textChanged() { if (st.key && st.key !== textKey && st.playing) app.pause(); },
    play() {
      ensureLoaded();
      if (st.pos !== pos) app.seek(pos);
      app.setSpeed(speed());
      app.play();
      st.playing = true;
    },
    pause() { app.pause(); st.playing = false; },
    seek(i, andPlay) {
      ensureLoaded();
      app.seek(i);
      st.pos = i;
      if (andPlay && !st.playing) { app.setSpeed(speed()); app.play(); st.playing = true; }
    },
    setSpeed() { app.setSpeed(speed()); },
    setVoice() { app.setVoice(voiceEl.value); },
    startedAt() { return 0; },
    state() {
      poll();
      if (st.key !== textKey) return { pos, playing: false, loading: false, finished: false, ready: () => false, error: "" };
      return {
        pos: st.pos,
        playing: st.playing,
        loading: st.waiting,
        finished: st.finished,
        ready: (i) => st.ready[i] === "1",
        error: st.error,
        saved: st.saved,
        voice: st.voice,
      };
    },
  };
}

const nativeApp = window.AndroidApp && window.AndroidApp.hasPlayer ? window.AndroidApp : null;
const player = nativeApp ? createNativePlayer(nativeApp) : createWebPlayer();

// ---------- views ----------

function renderReader() {
  readerEl.textContent = "";
  let pEl = null;
  chunks.forEach((c, i) => {
    if (!pEl || +pEl.dataset.p !== c.p) {
      pEl = document.createElement("p");
      pEl.dataset.p = c.p;
      readerEl.appendChild(pEl);
    } else {
      pEl.appendChild(document.createTextNode(" "));
    }
    const span = document.createElement("span");
    span.textContent = c.text;
    span.dataset.i = i;
    span.className = "pending";
    pEl.appendChild(span);
  });
  shown.pos = -1;
  shown.ready = "";
}

function highlight(scroll) {
  readerEl.querySelectorAll(".current").forEach((e) => e.classList.remove("current"));
  const span = readerEl.querySelector(`span[data-i="${pos}"]`);
  if (!span) return;
  span.classList.add("current");
  span.parentElement.classList.add("current");
  if (!scroll || readerEl.hidden) return;
  const r = span.getBoundingClientRect();
  const box = readerEl.getBoundingClientRect();
  if (r.top < box.top + 20 || r.bottom > box.bottom - 20) {
    span.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

// Syncs the page with the player: position, play button, and which sentences are ready.
function refresh() {
  const s = player.state();
  if (chunks.length && typeof s.pos === "number" && s.pos !== pos) {
    pos = Math.min(s.pos, chunks.length - 1);
    store.set("pos", pos);
  }
  if (pos !== shown.pos) {
    highlight(shown.pos !== -1 || s.playing);
    shown.pos = pos;
  }

  const loading = !!(s.playing && s.loading);
  if (s.playing !== shown.playing || loading !== shown.loading) {
    playBtn.classList.toggle("playing", !!s.playing);
    playBtn.classList.toggle("loading", loading);
    playBtn.setAttribute("aria-label", s.playing ? "Pause" : "Play");
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = s.playing ? "playing" : "paused";
    if (s.playing) message = "";
    shown.playing = !!s.playing;
    shown.loading = loading;
  }

  let readyCount = 0;
  let readyText = "";
  for (let i = 0; i < chunks.length; i++) {
    const r = s.ready(i);
    if (r) readyCount++;
    readyText += r ? "1" : "0";
  }
  if (readyText !== shown.ready) {
    const spans = readerEl.querySelectorAll("span[data-i]");
    for (let i = 0; i < spans.length; i++) {
      if (readyText[i] !== shown.ready[i]) spans[i].classList.toggle("pending", readyText[i] !== "1");
    }
    shown.ready = readyText;
  }

  let status = "";
  if (message) status = message;
  else if (s.error) status = s.error;
  else if (!readerEl.hidden && chunks.length) {
    if (s.finished && !s.playing) status = "Finished" + (s.saved ? " · saved to Downloads" : "");
    else {
      status = `Paragraph ${chunks[pos].p + 1} of ${paraStart.length}`;
      if (loading) status += " · generating…";
      else if (readyCount < chunks.length) status += ` · ${Math.floor((100 * readyCount) / chunks.length)}% ready`;
      else status += s.saved ? " · saved to Downloads" : " · all ready";
    }
  }
  if (statusEl.textContent !== status) statusEl.textContent = status;
}

function showReader() {
  const changed = textEl.value !== parsedText;
  if (changed) parse(textEl.value);
  if (cursorPicked) pos = paraStart[paraAtOffset(textEl.selectionStart)] || 0;
  cursorPicked = false;
  pos = Math.min(pos, Math.max(0, chunks.length - 1));
  textEl.blur();
  textEl.hidden = true;
  readerEl.hidden = false;
  editBtn.hidden = false;
  shown.pos = -1;
  refresh();
  highlight(true);
}

function showEditor() {
  player.pause();
  readerEl.hidden = true;
  textEl.hidden = false;
  editBtn.hidden = true;
  refresh();
}

// ---------- controls ----------

function jumpTo(i) {
  message = "";
  pos = i;
  store.set("pos", pos);
  player.seek(i, false);
  refresh();
}

function next() {
  if (readerEl.hidden) showReader();
  if (!chunks.length) return;
  const p = chunks[pos].p + 1;
  if (p < paraStart.length) jumpTo(paraStart[p]);
}

function prev() {
  if (readerEl.hidden) showReader();
  if (!chunks.length) return;
  const p = chunks[pos].p;
  const intoParagraph = pos > paraStart[p] || player.startedAt() > 3;
  jumpTo(intoParagraph ? paraStart[p] : paraStart[Math.max(0, p - 1)]);
}

playBtn.addEventListener("click", () => {
  message = "";
  if (player.state().playing) {
    player.pause();
  } else {
    if (readerEl.hidden) showReader();
    if (!chunks.length) { showEditor(); message = "Type or paste some text first"; refresh(); return; }
    player.play();
  }
  refresh();
});
$("next").addEventListener("click", next);
$("prev").addEventListener("click", prev);
editBtn.addEventListener("click", showEditor);

readerEl.addEventListener("click", (e) => {
  const span = e.target.closest("span[data-i]");
  if (!span) return;
  message = "";
  pos = +span.dataset.i;
  player.seek(pos, true);
  refresh();
});

textEl.addEventListener("input", () => {
  cursorPicked = false;
  store.set("text", textEl.value);
});
textEl.addEventListener("click", () => { cursorPicked = true; });

speedEl.addEventListener("input", () => {
  speedOut.textContent = speed().toFixed(2) + "×";
  store.set("speed", speedEl.value);
  player.setSpeed();
});

voiceEl.addEventListener("change", () => {
  store.set("voice", voiceEl.value);
  player.setVoice();
  refresh();
});

if ("mediaSession" in navigator && !nativeApp) {
  const ms = navigator.mediaSession;
  const handlers = { play: () => player.play(), pause: () => player.pause(), nexttrack: next, previoustrack: prev };
  for (const [action, fn] of Object.entries(handlers)) {
    try { ms.setActionHandler(action, fn); } catch { /* unsupported action */ }
  }
  try { ms.metadata = new MediaMetadata({ title: "TTS Reader", artist: "Kokoro" }); } catch { /* unsupported */ }
}

// Called by the Android app when text is shared to it from another app.
window.receiveSharedText = (text) => {
  showEditor();
  textEl.value = text;
  cursorPicked = false;
  store.set("text", text);
};

// ---------- startup ----------

textEl.value = store.get("text", "");
speedEl.value = store.get("speed", "1");
speedOut.textContent = speed().toFixed(2) + "×";
player.setSpeed();
if (textEl.value) {
  parse(textEl.value);
  pos = Math.min(+store.get("pos", 0) || 0, Math.max(0, chunks.length - 1));
}

fetch("api/voices")
  .then((r) => r.json())
  .then((voices) => {
    const groups = {};
    for (const v of voices) {
      let parent = voiceEl;
      if (v.group) {
        parent = groups[v.group];
        if (!parent) {
          parent = groups[v.group] = document.createElement("optgroup");
          parent.label = v.group;
          voiceEl.appendChild(parent);
        }
      }
      parent.appendChild(new Option(v.name, v.id));
    }
    // If the app is still reading this text in the background, match its voice and view.
    const s = player.state();
    const saved = s.voice || store.get("voice", "");
    if (voices.some((v) => v.id === saved)) voiceEl.value = saved;
    if (nativeApp && s.playing && chunks.length) showReader();
  })
  .catch(() => {
    message = nativeApp ? "Couldn't load the voices." : "Can't reach the TTS server. Is app.py running?";
    refresh();
  });

setInterval(refresh, 250);
refresh();
