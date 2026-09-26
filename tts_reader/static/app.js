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
const editorEl = $("editor");
const sheetEl = $("sheet");
const progressEl = $("progress");
const progressFill = $("progressFill");

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
let charsBefore = [0]; // chunk index -> characters before it (for progress and time left)
let docId = "";        // identifies the raw text, for the Recent list
let docTitle = "";     // file name or shared title; empty means "use the first line"
let pos = 0;           // current chunk index
let cursorPicked = false;
let message = "";      // one-off status message, cleared on the next action
const shown = { pos: -1, playing: null, loading: null, ready: "" };

const settings = {
  size: +store.get("size", 100),                 // reader text size, %
  clean: store.get("clean", "1") === "1",        // tidy text for listening
  autosave: store.get("autosave", "1") === "1",  // save the recording to Downloads when ready
};

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

// Makes text from web pages, notes and papers pleasant to listen to.
function cleanForSpeech(s) {
  return s
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")                          // Markdown headings
    .replace(/^\s*(?:[-*+•▪◦]|\d{1,3}[.)])\s+/gm, "")           // list bullets and numbers
    .replace(/^\s*>\s?/gm, "")                                    // quote markers
    .replace(/^\s*[-*_=]{3,}\s*$/gm, "")                          // horizontal rules
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")                    // images: keep the alt text
    .replace(/\[([^\]]+)\]\((?:https?:|www\.|\/|#)[^)]*\)/g, "$1") // links: keep the label
    .replace(/\bhttps?:\/\/[^\s)>\]]+|\bwww\.[^\s)>\]]+/g, "link") // bare URLs
    .replace(/\s?\[(?:\d+(?:\s*[-–,]\s*\d+)*)\]/g, "")          // citations like [12], [3, 4], [5–7]
    .replace(/\*\*|__|~~|`/g, "")                                 // bold, strike, code marks
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,!?;:]|$)/gm, "$1$2"); // *emphasis*
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
    const t = (settings.clean ? cleanForSpeech(raw) : raw).replace(/\s+/g, " ").trim();
    if (!t) continue;
    const p = paraStart.length;
    paraStart.push(chunks.length);
    paraOffset.push(at);
    for (const c of splitChunks(t)) chunks.push({ p, text: c });
  }
  parsedText = text;
  textKey = hashText(chunks.map((c) => c.text));
  docId = hashText([text]);
  charsBefore = [0];
  for (const c of chunks) charsBefore.push(charsBefore[charsBefore.length - 1] + c.text.length + 1);
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
  let saveRequested = false;
  let sleepEnd = 0;

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
        entry.bytes = blob.size;
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
        if (next < 0) {
          if (settings.autosave || saveRequested) await saveRecording();
          break;
        }
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
    if ((savedFor === id && !saveRequested) || !chunks.length) return;
    savedFor = id;
    saveRequested = false;
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
    setAutoSave() { if (settings.autosave) preload(); },
    saveNow() {
      saveRequested = true;
      preload();
    },
    setSleepTimer(minutes) { sleepEnd = minutes > 0 ? Date.now() + minutes * 60000 : 0; },
    state() {
      if (sleepEnd && Date.now() >= sleepEnd) {
        sleepEnd = 0;
        if (playing) stop();
      }
      const saved = savedFor === textKey + "|" + voiceEl.value ? savedName : "";
      let chars = 0, secs = 0;
      for (const [i, e] of cache) {
        if (e.url && e.voice === voiceEl.value && chunks[i]) {
          chars += chunks[i].text.length;
          secs += Math.max(0, e.bytes - 44) / 48000; // 16-bit mono at 24 kHz
        }
      }
      return {
        pos, playing, loading, finished, ready: isReady, saved,
        cps: secs > 0 ? chars / secs : 0,
        sleep: sleepEnd ? Math.max(0, sleepEnd - Date.now()) : 0,
        error: preloadError ? `Couldn't generate speech (${preloadError}).` : "",
      };
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
    app.setAutoSave(settings.autosave); // the service may not have been connected at startup
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
    setAutoSave() { app.setAutoSave(settings.autosave); },
    saveNow() { app.saveNow(); },
    setSleepTimer(minutes) { app.setSleepTimer(minutes); },
    startedAt() { return 0; },
    state() {
      poll();
      if (st.key !== textKey) return { pos, playing: false, loading: false, finished: false, ready: () => false, error: "", sleep: st.sleep || 0 };
      return {
        pos: st.pos,
        playing: st.playing,
        loading: st.waiting,
        finished: st.finished,
        ready: (i) => st.ready[i] === "1",
        error: st.error,
        saved: st.saved,
        voice: st.voice,
        cps: st.cps,
        sleep: st.sleep,
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

function formatDuration(secs) {
  if (secs >= 3600) return `${Math.floor(secs / 3600)} h ${Math.round((secs % 3600) / 60)} min`;
  if (secs >= 60) return `${Math.round(secs / 60)} min`;
  return "under a minute";
}

// Syncs the page with the player: position, play button, and which sentences are ready.
function refresh() {
  const s = player.state();
  if (chunks.length && typeof s.pos === "number" && s.pos !== pos) {
    pos = Math.min(s.pos, chunks.length - 1);
    store.set("pos", pos);
    rememberPosition();
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
  shown.allReady = chunks.length > 0 && readyCount === chunks.length;
  $("saveNow").disabled = !shown.allReady;

  const total = charsBefore[charsBefore.length - 1] || 1;
  const done = chunks.length ? charsBefore[pos] : 0;
  if (!dragging) progressFill.style.width = `${(100 * done) / total}%`;

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
      const cps = s.cps > 0 ? s.cps : 15; // characters per second of speech at 1×
      status += ` · ${formatDuration((total - done) / cps / speed())} left`;
    }
  }
  if (s.sleep > 0) status += `${status ? " · " : ""}sleep in ${formatDuration(s.sleep / 1000)}`;
  if (statusEl.textContent !== status) statusEl.textContent = status;

  const sleepMin = s.sleep > 0 ? activeSleep : 0;
  if (sleepMin !== shown.sleep) {
    for (const b of $("sleep").children) b.classList.toggle("on", +b.dataset.min === sleepMin);
    shown.sleep = sleepMin;
  }
}

function showReader() {
  const changed = textEl.value !== parsedText;
  if (changed) parse(textEl.value);
  if (cursorPicked) pos = paraStart[paraAtOffset(textEl.selectionStart)] || 0;
  cursorPicked = false;
  pos = Math.min(pos, Math.max(0, chunks.length - 1));
  if (changed) rememberText();
  textEl.blur();
  editorEl.hidden = true;
  readerEl.hidden = false;
  editBtn.hidden = false;
  shown.pos = -1;
  refresh();
  highlight(true);
}

function showEditor() {
  player.pause();
  readerEl.hidden = true;
  editorEl.hidden = false;
  editBtn.hidden = true;
  refresh();
}

// Replaces the text (from a file, a share, or the Recent list) and shows it ready to play.
function setDocument(text, title, startPos) {
  player.pause();
  textEl.value = text;
  docTitle = title || "";
  store.set("text", text);
  store.set("title", docTitle);
  cursorPicked = false;
  message = "";
  parse(text);
  pos = Math.min(startPos || 0, Math.max(0, chunks.length - 1));
  store.set("pos", pos);
  rememberText();
  editorEl.hidden = false; // so showReader() takes over from a consistent state
  showReader();
}

// ---------- recent texts ----------
// Metadata in "recent"; each text in its own "doc.<id>" key, so saving the
// position while reading doesn't rewrite whole documents.

function titleOf(text) {
  const line = text.trim().split("\n")[0].replace(/^[#>*\s-]+/, "").trim();
  return line.length > 70 ? line.slice(0, 67).trimEnd() + "…" : line || "Untitled";
}

function loadRecent() {
  try { return JSON.parse(store.get("recent", "[]")) || []; } catch { return []; }
}

function saveRecent(list) {
  const keep = new Set(list.map((r) => r.id));
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("ttsr.doc.") && !keep.has(k.slice(9))) localStorage.removeItem(k);
    }
  } catch { /* storage unavailable */ }
  store.set("recent", JSON.stringify(list));
}

function rememberText() {
  if (!parsedText || !parsedText.trim()) return;
  let list = loadRecent().filter((r) => r.id !== docId);
  list.unshift({ id: docId, title: docTitle || titleOf(parsedText), pos, total: chunks.length, at: Date.now() });
  list = list.slice(0, 15);
  // Big books may not fit in storage: drop the oldest entries until this one does.
  for (;;) {
    try {
      localStorage.setItem("ttsr.doc." + docId, parsedText);
      break;
    } catch {
      if (list.length <= 1) { list = list.filter((r) => r.id !== docId); break; }
      list.pop();
      saveRecent(list);
    }
  }
  saveRecent(list);
}

let rememberTimer = 0;
function rememberPosition() {
  clearTimeout(rememberTimer);
  rememberTimer = setTimeout(() => {
    const list = loadRecent();
    const entry = list.find((r) => r.id === docId);
    if (!entry) return;
    entry.pos = pos;
    entry.at = Date.now();
    store.set("recent", JSON.stringify(list));
  }, 1000);
}

function renderRecent() {
  const ul = $("recent");
  ul.textContent = "";
  const list = loadRecent();
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Texts you read will appear here.";
    ul.appendChild(li);
    return;
  }
  for (const r of list) {
    const li = document.createElement("li");
    const open = document.createElement("button");
    open.className = "open";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = r.title;
    const meta = document.createElement("span");
    meta.className = "meta";
    const pct = r.total ? Math.round((100 * r.pos) / r.total) : 0;
    meta.textContent = (r.id === docId ? "Open now · " : "") + `${pct}% read · ${new Date(r.at).toLocaleDateString()}`;
    open.append(title, meta);
    open.addEventListener("click", () => {
      const text = store.get("doc." + r.id, null);
      closeSheet();
      if (text === null) { message = "That text is no longer stored."; refresh(); return; }
      if (r.id !== docId) setDocument(text, r.title, r.pos);
      else if (readerEl.hidden) showReader();
    });
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.setAttribute("aria-label", "Remove from Recent");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      saveRecent(loadRecent().filter((x) => x.id !== r.id));
      renderRecent();
    });
    li.append(open, remove);
    ul.appendChild(li);
  }
}

// ---------- menu sheet ----------

let activeSleep = 0;

function openSheet() {
  renderRecent();
  $("sizeOut").textContent = settings.size + "%";
  $("autosave").checked = settings.autosave;
  $("clean").checked = settings.clean;
  sheetEl.hidden = false;
  history.pushState({ sheet: true }, ""); // the Back button closes the sheet
}

function closeSheet() {
  if (sheetEl.hidden) return;
  sheetEl.hidden = true;
  if (history.state && history.state.sheet) history.back();
}

window.addEventListener("popstate", () => { sheetEl.hidden = true; });
sheetEl.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeSheet(); });
$("menu").addEventListener("click", openSheet);

$("sleep").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-min]");
  if (!b) return;
  activeSleep = +b.dataset.min;
  player.setSleepTimer(activeSleep);
  shown.sleep = -1;
  refresh();
});

function applySize() {
  document.documentElement.style.setProperty("--reader-size", (18 * settings.size) / 100 + "px");
  $("sizeOut").textContent = settings.size + "%";
  store.set("size", settings.size);
}
$("smaller").addEventListener("click", () => { settings.size = Math.max(70, settings.size - 10); applySize(); });
$("larger").addEventListener("click", () => { settings.size = Math.min(200, settings.size + 10); applySize(); });

$("autosave").addEventListener("change", (e) => {
  settings.autosave = e.target.checked;
  store.set("autosave", settings.autosave ? "1" : "0");
  player.setAutoSave();
});
$("saveNow").addEventListener("click", () => {
  player.saveNow();
  message = "Saving the recording…";
  closeSheet();
  refresh();
  setTimeout(() => { if (message === "Saving the recording…") { message = ""; refresh(); } }, 4000);
});
$("clean").addEventListener("change", (e) => {
  settings.clean = e.target.checked;
  store.set("clean", settings.clean ? "1" : "0");
  if (parsedText === null) return;
  const keep = pos;
  parse(parsedText); // the sentences change, so the audio is generated again
  pos = Math.min(keep, Math.max(0, chunks.length - 1));
  refresh();
  highlight(true);
});

// Android only: copies the player's state and recent events, to paste into a bug report.
if (nativeApp && nativeApp.debugInfo) {
  $("debug").hidden = false;
  $("debug").addEventListener("click", () => {
    const page = `Page: text ${chunks.length} sentences, key ${textKey}, pos ${pos}, reader ${readerEl.hidden ? "hidden" : "shown"}, ` +
      `voice ${voiceEl.value}, speed ${speed()}, autosave ${settings.autosave}, clean ${settings.clean}`;
    nativeApp.copyText(nativeApp.debugInfo() + "\n" + page);
    closeSheet();
    message = "Debug info copied. Paste it into your chat with Claude.";
    refresh();
    setTimeout(() => { message = ""; refresh(); }, 5000);
  });
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
    if (!chunks.length) { showEditor(); message = "Type, paste or open some text first"; refresh(); return; }
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

// Progress bar: drag or tap to move through the text.
let dragging = false;
function chunkAtFraction(f) {
  const target = f * charsBefore[charsBefore.length - 1];
  let i = 0;
  while (i + 1 < chunks.length && charsBefore[i + 1] <= target) i++;
  return i;
}
function progressFraction(e) {
  const r = progressEl.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
}
progressEl.addEventListener("pointerdown", (e) => {
  if (readerEl.hidden) showReader();
  if (!chunks.length) return;
  dragging = true;
  progressEl.setPointerCapture(e.pointerId);
  progressFill.style.width = progressFraction(e) * 100 + "%";
});
progressEl.addEventListener("pointermove", (e) => {
  if (dragging) progressFill.style.width = progressFraction(e) * 100 + "%";
});
progressEl.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false;
  jumpTo(chunkAtFraction(progressFraction(e)));
  highlight(true);
});
progressEl.addEventListener("pointercancel", () => { dragging = false; refresh(); });

textEl.addEventListener("input", () => {
  cursorPicked = false;
  docTitle = "";
  store.set("text", textEl.value);
  store.set("title", "");
});
textEl.addEventListener("click", () => { cursorPicked = true; });

// Editor toolbar
$("openFile").addEventListener("click", () => {
  if (nativeApp && nativeApp.openFile) nativeApp.openFile();
  else $("filePicker").click();
});
$("filePicker").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let text = await file.text();
  if (/\.html?$/i.test(file.name) || file.type === "text/html") {
    const doc = new DOMParser().parseFromString(text, "text/html");
    doc.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
    doc.querySelectorAll("p,div,h1,h2,h3,h4,h5,h6,li,blockquote,br,tr").forEach((n) => n.append("\n\n"));
    text = doc.body.textContent.replace(/\n\s*\n\s*/g, "\n\n").trim();
  }
  setDocument(text, file.name.replace(/\.[^.]+$/, ""));
});
$("paste").addEventListener("click", async () => {
  let clip = "";
  try {
    clip = nativeApp && nativeApp.clipboardText ? nativeApp.clipboardText() : await navigator.clipboard.readText();
  } catch { /* not allowed */ }
  if (!clip) { message = "Nothing to paste. Long-press in the text box to paste instead."; refresh(); return; }
  textEl.setRangeText(clip, textEl.selectionStart, textEl.selectionEnd, "end");
  textEl.dispatchEvent(new Event("input"));
});
$("clear").addEventListener("click", () => {
  textEl.value = "";
  textEl.dispatchEvent(new Event("input"));
  textEl.focus();
});

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

// Called by the Android app for shared text and opened documents.
window.receiveSharedText = (text, title) => setDocument(text, title || "");
window.appMessage = (msg) => { message = msg; refresh(); };

// ---------- startup ----------

textEl.value = store.get("text", "");
docTitle = store.get("title", "");
speedEl.value = store.get("speed", "1");
speedOut.textContent = speed().toFixed(2) + "×";
applySize();
player.setSpeed();
player.setAutoSave();
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
      // Grouped by accent, so the option only needs the name: "Heart (US female)" -> "Heart ♀".
      const label = v.group ? v.name.replace(/\s*\([^)]*\b(female|male)\)$/, (_, g) => (g === "female" ? " ♀" : " ♂")) : v.name;
      parent.appendChild(new Option(label, v.id));
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
