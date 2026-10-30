// The game in play, kept between sessions: closed (or let go of by the phone) and opened again,
// the app takes the game up where it was rather than beginning anew. It is kept in the page's own
// storage, and on the phone by the shell too, which writes it down at once: the page's storage is
// written a few seconds after, and a game left just before the app was closed could be lost.
import { native } from './native.js';

const KEY = 'kaltoh.game.v1';
let last = null; // as last kept, so the same is not written again

// As plain data, and back, exactly: Maps, Sets and typed arrays marked as such, and functions (a
// game's random numbers) left out - the game makes them afresh from its seed.
export function pack(value) {
  return JSON.stringify(value, (key, v) => {
    if (typeof v === 'function') return undefined;
    if (v instanceof Map) return { $map: [...v] };
    if (v instanceof Set) return { $set: [...v] };
    if (ArrayBuffer.isView(v)) return { $array: v.constructor.name, values: [...v] };
    return v;
  });
}

export function unpack(text) {
  return JSON.parse(text, (key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (Array.isArray(v.$map)) return new Map(v.$map);
      if (Array.isArray(v.$set)) return new Set(v.$set);
      if (typeof v.$array === 'string' && /^(Float|Int|Uint)(8|16|32|64)Array$/.test(v.$array)) return new globalThis[v.$array](v.values);
    }
    return v;
  });
}

// Keep the game as it stands (or, given nothing, forget it: a new game is on its way).
export function keepGame(data) {
  const text = data ? pack(data) : '';
  if (text === last) return;
  last = text;
  try {
    if (text) localStorage.setItem(KEY, text);
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the shell may keep it still; in a browser, the game simply begins anew.
  }
  native.keep(text);
}

// The game kept last, if any.
export function keptGame() {
  let text = native.kept();
  if (!text) {
    try {
      text = localStorage.getItem(KEY);
    } catch {
      text = null;
    }
  }
  if (!text) return null;
  last = text;
  try {
    return unpack(text);
  } catch {
    return null;
  }
}
