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

const MAX_CHUNK = 220;   // characters per synthesis request; small chunks start playing sooner
const PREFETCH = 2;      // chunks generated ahead of the one playing

const audio = new Audio();
audio.preload = "auto";

let chunks = [];        // [{p: paragraphIndex, text}]
let paraStart = [];     // paragraph index -> first chunk index
let paraOffset = [];    // paragraph index -> character offset in the textarea
let parsedText = null;
let pos = 0;            // current chunk index
let playing = false;
let loading = false;
let token = 0;          // bumps whenever playback is redirected, so stale awaits bail out
let loaded = null;      // {i, voice, speed, url} of the clip currently in the audio element
let unlocked = false;
let cursorPicked = false;
let wakeLock = null;
const cache = new Map(); // chunk index -> {key, ctrl, promise, url}
const clientId = Math.random().toString(36).slice(2);
let epoch = 0;          // bumped on every jump; the server skips requests from older epochs

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
  epoch++;
  clearCache();
  loaded = null;
  renderReader();
}

function paraAtOffset(offset) {
  let p = 0;
  while (p + 1 < paraOffset.length && paraOffset[p + 1] <= offset) p++;
  return p;
}

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
    pEl.appendChild(span);
  });
}

function highlight() {
  readerEl.querySelectorAll(".current").forEach((e) => e.classList.remove("current"));
  if (!chunks.length) { setStatus(""); return; }
  setStatus(`Paragraph ${chunks[pos].p + 1} of ${paraStart.length}`);
  const span = readerEl.querySelector(`span[data-i="${pos}"]`);
  if (!span) return;
  span.classList.add("current");
  span.parentElement.classList.add("current");
  if (readerEl.hidden) return;
  const r = span.getBoundingClientRect();
  const box = readerEl.getBoundingClientRect();
  if (r.top < box.top + 20 || r.bottom > box.bottom - 20) {
    span.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function showReader() {
  const changed = textEl.value !== parsedText;
  if (changed) parse(textEl.value);
  if (cursorPicked) pos = paraStart[paraAtOffset(textEl.selectionStart)] || 0;
  else if (changed) pos = 0;
  cursorPicked = false;
  pos = Math.min(pos, Math.max(0, chunks.length - 1));
  textEl.blur();
  textEl.hidden = true;
  readerEl.hidden = false;
  editBtn.hidden = false;
  highlight();
}

function showEditor() {
  pause();
  readerEl.hidden = true;
  textEl.hidden = false;
  editBtn.hidden = true;
  setStatus("");
}

function setStatus(msg) { statusEl.textContent = msg; }

function updateUI() {
  playBtn.classList.toggle("playing", playing);
  playBtn.classList.toggle("loading", playing && loading);
  playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
}

// ---------- audio fetching ----------

function speed() { return +(+speedEl.value).toFixed(2); }
function cacheKey() { return voiceEl.value + "|" + speed(); }

function getAudio(i) {
  const key = cacheKey();
  const hit = cache.get(i);
  if (hit && hit.key === key) return hit.promise;
  if (hit) drop(i);
  const ctrl = new AbortController();
  const sp = speed();
  const entry = { key, ctrl, url: null };
  entry.promise = fetch("api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: chunks[i].text, voice: voiceEl.value, speed: sp, client: clientId, epoch }),
    signal: ctrl.signal,
  })
    .then((r) => {
      if (!r.ok) throw new Error("server error " + r.status);
      return r.blob();
    })
    .then((blob) => {
      entry.url = URL.createObjectURL(blob);
      return { i, voice: voiceEl.value, speed: sp, url: entry.url };
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

function prefetch() {
  for (const i of [...cache.keys()]) if (i < pos - 2 || i > pos + PREFETCH + 3) drop(i);
  for (let j = pos + 1; j <= pos + PREFETCH && j < chunks.length; j++) getAudio(j).catch(() => {});
}

// ---------- playback ----------

async function playFrom(i) {
  if (!chunks.length) return;
  pos = Math.max(0, Math.min(i, chunks.length - 1));
  const my = ++token;
  playing = true;
  loading = true;
  store.set("pos", pos);
  highlight();
  updateUI();
  audio.pause();
  keepAwake(true);

  let clip;
  try {
    clip = await getAudio(pos);
  } catch (err) {
    if (my !== token) return;
    stop(`Couldn't generate speech (${err.message}). Is the server still running?`);
    return;
  }
  if (my !== token) return;
  loaded = clip;
  audio.src = clip.url;
  audio.defaultPlaybackRate = audio.playbackRate = speed() / clip.speed;
  loading = false;
  updateUI();
  try {
    await audio.play();
  } catch (err) {
    if (my !== token) return;
    stop("Tap play to start");
    return;
  }
  prefetch();
}

function stop(msg) {
  token++;
  playing = false;
  loading = false;
  audio.pause();
  keepAwake(false);
  updateUI();
  if (msg !== undefined) setStatus(msg);
}

function pause() {
  if (playing) stop();
}

function resume() {
  if (!chunks.length) return;
  if (loaded && loaded.i === pos && loaded.voice === voiceEl.value && !audio.ended) {
    playing = true;
    audio.playbackRate = speed() / loaded.speed;
    updateUI();
    keepAwake(true);
    audio.play().catch(() => playFrom(pos));
  } else {
    playFrom(pos);
  }
}

function jumpTo(i) {
  newEpoch();
  if (playing) { playFrom(i); return; }
  token++;
  pos = i;
  loaded = null;
  audio.removeAttribute("src");
  store.set("pos", pos);
  highlight();
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
  const intoParagraph = pos > paraStart[p] || (loaded && loaded.i === pos && audio.currentTime > 3);
  jumpTo(intoParagraph ? paraStart[p] : paraStart[Math.max(0, p - 1)]);
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
    pos = 0;
    loaded = null;
    store.set("pos", 0);
    highlight();
    setStatus("Finished");
  }
});

audio.addEventListener("pause", () => {
  // Paused from outside the app (headphones unplugged, another app took audio).
  if (playing && !loading && audio.paused && !audio.ended && loaded && audio.src === loaded.url) {
    playing = false;
    keepAwake(false);
    updateUI();
  }
});

// ---------- controls ----------

playBtn.addEventListener("click", () => {
  if (playing) { pause(); return; }
  if (readerEl.hidden) showReader();
  if (!chunks.length) { setStatus("Type or paste some text first"); showEditor(); return; }
  unlockAudio();
  resume();
});
$("next").addEventListener("click", next);
$("prev").addEventListener("click", prev);
editBtn.addEventListener("click", showEditor);

readerEl.addEventListener("click", (e) => {
  const span = e.target.closest("span[data-i]");
  if (!span) return;
  unlockAudio();
  newEpoch();
  playFrom(+span.dataset.i);
});

textEl.addEventListener("input", () => {
  cursorPicked = false;
  store.set("text", textEl.value);
});
textEl.addEventListener("click", () => { cursorPicked = true; });

let speedTimer = 0;
speedEl.addEventListener("input", () => {
  speedOut.textContent = speed().toFixed(2) + "×";
  store.set("speed", speedEl.value);
  // Adjust the clip that's playing right away; regenerate upcoming clips at the new speed.
  if (loaded) audio.playbackRate = speed() / loaded.speed;
  clearTimeout(speedTimer);
  speedTimer = setTimeout(() => {
    epoch++;
    for (const i of [...cache.keys()]) if (!loaded || i !== loaded.i) drop(i);
    if (playing) prefetch();
  }, 500);
});

voiceEl.addEventListener("change", () => {
  store.set("voice", voiceEl.value);
  epoch++;
  clearCache();
  if (playing) playFrom(pos);
});

if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  const handlers = { play: () => { if (!playing) resume(); }, pause, nexttrack: next, previoustrack: prev };
  for (const [action, fn] of Object.entries(handlers)) {
    try { ms.setActionHandler(action, fn); } catch { /* unsupported action */ }
  }
  try { ms.metadata = new MediaMetadata({ title: "TTS Reader", artist: "Kokoro" }); } catch { /* unsupported */ }
}

// ---------- startup ----------

textEl.value = store.get("text", "");
speedEl.value = store.get("speed", "1");
speedOut.textContent = speed().toFixed(2) + "×";
if (textEl.value) {
  parse(textEl.value);
  pos = Math.min(+store.get("pos", 0) || 0, Math.max(0, chunks.length - 1));
}

fetch("api/voices")
  .then((r) => r.json())
  .then((voices) => {
    for (const v of voices) voiceEl.add(new Option(v.name, v.id));
    const saved = store.get("voice", "");
    if (voices.some((v) => v.id === saved)) voiceEl.value = saved;
  })
  .catch(() => setStatus("Can't reach the TTS server. Is app.py running?"));
