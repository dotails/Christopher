import '@fontsource/titan-one/latin-400.css';
import '@fontsource/special-elite/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './style.css';
import { Game } from './game/Game.js';

const game = new Game();
window.__reel = game; // handy for debugging from the console

game.boot().catch((err) => {
  console.error(err);
  const tip = document.getElementById('load-tip');
  if (tip) tip.textContent = 'The projector jammed: ' + (err && err.message ? err.message : err);
});

// Keep the screen awake on phones while playing (best effort)
if ('wakeLock' in navigator) {
  const lock = () => navigator.wakeLock.request('screen').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lock(); });
  lock();
}
