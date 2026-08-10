import { AssetManager } from './rendering/AssetManager.js';
import { SaveManager } from './core/SaveManager.js';
import { SoundManager } from './audio/SoundManager.js';
import { UIManager } from './ui/UIManager.js';
import { Game } from './Game.js';

/** Entry point: load assets, wire the managers, hand control to Game. */
async function main() {
  const canvas = document.getElementById('scene');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('missing #scene canvas');
  }

  const save = new SaveManager();
  const sound = new SoundManager({ muted: save.get('muted') });
  const assets = new AssetManager();

  const loadingText = document.getElementById('loading-text');
  const loadingFill = document.getElementById('loading-fill');

  await assets.loadAll((loaded, total) => {
    if (loadingFill) loadingFill.style.width = `${Math.round((loaded / total) * 100)}%`;
    if (loadingText) loadingText.textContent = `Mustering troops… ${loaded}/${total}`;
  });

  const ui = new UIManager({ assets, save, sound });
  if (assets.missing.size > 0) {
    ui.setLoadMessage(`${assets.missing.size} art files missing — using placeholders.`);
  }

  const game = new Game({ canvas, assets, save, sound, ui });
  // Handy for poking at balance from the console.
  window.game = game;

  ui.hideLoading();
  game.start();
}

main().catch((err) => {
  console.error('[main] fatal:', err);
  const text = document.getElementById('loading-text');
  if (text) {
    text.classList.add('error');
    text.textContent = `Failed to start: ${err.message}`;
  }
});
