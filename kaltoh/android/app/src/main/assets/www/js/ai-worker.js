// The Vulcan thinks here, off the main thread, so the kal-toh keeps turning while it does.
import * as G from './geom.js';
import { restoreGame } from './rules.js';
import { chooseMove } from './ai.js';

self.onmessage = (e) => {
  const { id, game: data, level, seed } = e.data;
  try {
    const game = restoreGame(data);
    const rng = G.mulberry32(seed);
    const choice = chooseMove(game, { level, rng, revealed: game.revealed });
    self.postMessage({ id, choice: choice ? { pose: choice.pose } : null });
  } catch (err) {
    self.postMessage({ id, error: String(err?.stack ?? err) });
  }
};
