import * as THREE from 'three';
import { IMAGES, assetUrl } from '../data/assets.js';
import { placeholderTexture, canvasTexture, makeCanvas } from './Textures.js';

/**
 * Loads and hands out every Tiny Swords texture.
 *
 * Nothing else in the codebase knows a file path — callers ask for keys
 * declared in data/assets.js. A file that fails to load is replaced by a
 * flat colour placeholder so the game still runs.
 */
export class AssetManager {
  constructor() {
    /** @type {Map<string, THREE.Texture>} */
    this.textures = new Map();
    /** @type {Map<string, string>} key -> URL usable in an <img> tag */
    this.imageUrls = new Map();
    /** @type {Set<string>} keys that fell back to a placeholder */
    this.missing = new Set();
    this.loader = new THREE.TextureLoader();
  }

  /**
   * @param {(loaded:number, total:number, key:string)=>void} [onProgress]
   */
  async loadAll(onProgress) {
    const entries = Object.entries(IMAGES);
    let loaded = 0;

    await Promise.all(
      entries.map(async ([key, def]) => {
        const url = assetUrl(def.path);
        try {
          const texture = await this.loadTexture(url);
          this.configure(texture);
          this.textures.set(key, texture);
          this.imageUrls.set(key, url);
        } catch (err) {
          this.missing.add(key);
          const { texture, canvas } = placeholderTexture(def.fallback ?? '#b06de0');
          this.textures.set(key, texture);
          this.imageUrls.set(key, canvas.toDataURL('image/png'));
          console.warn(`[AssetManager] "${key}" missing (${def.path}) — using placeholder.`, err);
        } finally {
          loaded++;
          onProgress?.(loaded, entries.length, key);
        }
      }),
    );

    if (this.missing.size > 0) {
      console.warn(
        `[AssetManager] ${this.missing.size}/${entries.length} textures used placeholders:`,
        [...this.missing].join(', '),
      );
    }
    return this;
  }

  loadTexture(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, () => reject(new Error(`failed to load ${url}`)));
    });
  }

  /** Pixel-art defaults: no filtering, no mipmaps, sRGB. */
  configure(texture) {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  has(key) {
    return this.textures.has(key) && !this.missing.has(key);
  }

  /** @returns {THREE.Texture} never null — placeholder if unknown */
  get(key) {
    const texture = this.textures.get(key);
    if (texture) return texture;
    console.warn(`[AssetManager] unknown texture key "${key}"`);
    return placeholderTexture('#b06de0').texture;
  }

  /**
   * A private copy of a texture, so sprite-sheet offset/repeat can be
   * animated per instance without disturbing other users of the image.
   */
  clone(key) {
    const source = this.get(key);
    const copy = source.clone();
    copy.needsUpdate = true;
    return this.configure(copy);
  }

  /** URL for DOM `<img>` icons (a data URL when the file was missing). */
  url(key) {
    return this.imageUrls.get(key) ?? '';
  }

  /**
   * Copy one sub-rectangle out of a texture into a standalone tiling
   * texture — used to pull a single grass tile out of the terrain
   * tilemap and repeat it across the battlefield.
   */
  extractTile(key, sx, sy, sw, sh, repeat = { x: 1, y: 1 }) {
    const source = this.get(key);
    const image = source.image;
    const canvas = makeCanvas(sw, sh);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (image && image.width) {
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    } else {
      ctx.fillStyle = '#6aa84f';
      ctx.fillRect(0, 0, sw, sh);
    }
    return canvasTexture(canvas, { nearest: true, repeat });
  }

  dispose() {
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.imageUrls.clear();
  }
}
