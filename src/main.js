import { AssetManager } from './rendering/AssetManager.js';
import { SaveManager } from './core/SaveManager.js';
import { SoundManager } from './audio/SoundManager.js';
import { UIManager } from './ui/UIManager.js';
import { Game } from './Game.js';

/**
 * Register the service worker so the game is installable and runs offline.
 * Dev is skipped — a caching SW there just hides your own edits.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[pwa] service worker registration failed:', err);
    });
  });
}

/**
 * Chrome fires this instead of showing its own install UI. Stash the event
 * so the title screen can offer an Install button.
 */
function watchInstallPrompt(ui) {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    ui.setInstallPrompt(event);
  });
  window.addEventListener('appinstalled', () => ui.setInstallPrompt(null));
}

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

  watchInstallPrompt(ui);
  registerServiceWorker();

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
