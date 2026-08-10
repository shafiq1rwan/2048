import { defineConfig } from 'vite';
import { readdirSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { IMAGES, ASSET_ROOT } from './src/data/assets.js';

/**
 * Vite copies all of public/ into dist, but public/assets/tiny-swords is
 * the complete pack (517 PNGs) while data/assets.js references ~50 of
 * them. This drops the unreferenced files from dist after the build, so
 * the deploy only ships art the game can actually load. The working tree
 * keeps the whole pack — dev serving and future data/assets.js entries
 * are unaffected.
 */
function trimUnusedArt() {
  return {
    name: 'trim-unused-art',
    apply: 'build',
    closeBundle() {
      const root = join('dist', ...ASSET_ROOT.split('/').filter(Boolean));
      const keep = new Set(Object.values(IMAGES).map((img) => normalize(img.path)));
      let kept = 0;
      let removed = 0;
      let freed = 0;

      const walk = (dir, rel) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const abs = join(dir, entry.name);
          const relPath = rel ? join(rel, entry.name) : entry.name;
          if (entry.isDirectory()) {
            walk(abs, relPath);
            if (readdirSync(abs).length === 0) rmdirSync(abs);
          } else if (keep.has(relPath)) {
            kept += 1;
          } else {
            freed += statSync(abs).size;
            rmSync(abs);
            removed += 1;
          }
        }
      };

      try {
        walk(root, '');
      } catch (err) {
        // A missing art folder is not a broken build — the game falls
        // back to placeholders — so only warn.
        console.warn(`[trim-unused-art] skipped: ${err.message}`);
        return;
      }
      console.log(
        `[trim-unused-art] kept ${kept} referenced files, ` +
          `removed ${removed} (${(freed / 1024 / 1024).toFixed(1)} MB)`,
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [trimUnusedArt()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
