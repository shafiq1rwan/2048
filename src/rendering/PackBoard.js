import { canvasTexture, makeCanvas, boardFrameTexture } from './Textures.js';

/**
 * Board chrome built from the pack's Wood Table art, so the 2048 grid
 * reads as a proper Tiny Swords game table instead of a procedural
 * chocolate slab. Falls back to the old procedural textures when the
 * art is missing.
 *
 * WoodTable.png (448x448) stores a 9-slice with gutters — rects
 * measured from the file. The bottom band is taller than the top: it
 * carries the table's 3D base shadow.
 */
/**
 * Every border block carries the table's torn under-rim shading on its
 * inner side; through the translucent slots it reads as black drips.
 * All pieces are therefore cropped to their clean rim-only cores,
 * anchored to the outer edge of each block (left col keeps x45.., the
 * right col ends at its true edge 403, the bottom at 422 past the 3D
 * base).
 */
const TABLE = {
  cols: [
    { x: 45, w: 56 },
    { x: 192, w: 64 },
    { x: 347, w: 56 },
  ],
  rows: [
    { y: 43, h: 56 },
    { y: 192, h: 64 },
    { y: 366, h: 56 },
  ],
};

/** Clean core of the centre block, used to fill the play surface. */
const TABLE_FILL = { x: 198, y: 210, w: 52, h: 40 };


/**
 * The full board frame as one composed texture.
 * @param {import('./AssetManager.js').AssetManager} assets
 */
export function woodFrameTexture(assets, { size = 512, fallbackRadius = 30 } = {}) {
  if (assets.missing.has('ui_wood_table')) {
    return boardFrameTexture({ size, radius: fallbackRadius });
  }
  const image = assets.get('ui_wood_table').image;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Corner scale: the rim must stay THINNER than the board's padding
  // ring, so a strip of the dark play surface always separates rim from
  // cells — a rim thicker than the padding ends exactly at the tile
  // edges and reads as a ledge lying over the bottom row.
  const s = (size / 512) * 0.34;
  const cw = [Math.round(TABLE.cols[0].w * s), 0, Math.round(TABLE.cols[2].w * s)];
  const rh = [Math.round(TABLE.rows[0].h * s), 0, Math.round(TABLE.rows[2].h * s)];
  const xs = [0, cw[0], size - cw[2]];
  const ys = [0, rh[0], size - rh[2]];
  const ws = [cw[0], size - cw[0] - cw[2], cw[2]];
  const hs = [rh[0], size - rh[0] - rh[2], rh[2]];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (ws[c] <= 0 || hs[r] <= 0) continue;
      const src =
        r === 1 && c === 1
          ? { x: TABLE_FILL.x, y: TABLE_FILL.y, w: TABLE_FILL.w, h: TABLE_FILL.h }
          : { x: TABLE.cols[c].x, y: TABLE.rows[r].y, w: TABLE.cols[c].w, h: TABLE.rows[r].h };
      ctx.drawImage(image, src.x, src.y, src.w, src.h, xs[c], ys[r], ws[c], hs[r]);
    }
  }

  // Calm the busy plank pattern inside the rim so the play surface
  // reads as a recessed board and the translucent slots stay legible
  // on top of it.
  ctx.fillStyle = 'rgba(38, 22, 12, 0.36)';
  ctx.fillRect(xs[1], ys[1], ws[1], hs[1]);

  return canvasTexture(canvas, { nearest: true });
}
