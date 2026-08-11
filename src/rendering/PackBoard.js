import { canvasTexture, makeCanvas, boardFrameTexture, slotTexture } from './Textures.js';

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
const TABLE = {
  cols: [
    { x: 44, w: 84 },
    { x: 192, w: 64 },
    { x: 320, w: 84 },
  ],
  rows: [
    { y: 43, h: 85 },
    { y: 192, h: 64 },
    { y: 320, h: 103 },
  ],
};

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

  // Corner scale: keeps the carved rim about as thick as the board's
  // padding ring, so the trim stays visible around the outer cells —
  // chunky enough that the corner joinery still reads as woodwork.
  const s = (size / 512) * 0.82;
  const cw = [Math.round(TABLE.cols[0].w * s), 0, Math.round(TABLE.cols[2].w * s)];
  const rh = [Math.round(TABLE.rows[0].h * s), 0, Math.round(TABLE.rows[2].h * s)];
  const xs = [0, cw[0], size - cw[2]];
  const ys = [0, rh[0], size - rh[2]];
  const ws = [cw[0], size - cw[0] - cw[2], cw[2]];
  const hs = [rh[0], size - rh[0] - rh[2], rh[2]];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (ws[c] <= 0 || hs[r] <= 0) continue;
      ctx.drawImage(
        image,
        TABLE.cols[c].x,
        TABLE.rows[r].y,
        TABLE.cols[c].w,
        TABLE.rows[r].h,
        xs[c],
        ys[r],
        ws[c],
        hs[r],
      );
    }
  }
  return canvasTexture(canvas, { nearest: true });
}

/**
 * The recessed wood slot for empty cells — WoodTable_Slots.png is a
 * single 192px tile, the same resolution the cells render at.
 */
export function woodSlotTexture(assets, { size = 192, fallbackRadius = 30 } = {}) {
  if (assets.missing.has('ui_wood_slot')) {
    return slotTexture({ size, radius: fallbackRadius });
  }
  const image = assets.get('ui_wood_slot').image;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, size, size);
  // Deepen the recess: the raw slot tone sits too close to the table
  // top, and empty cells need to read at a glance. source-atop keeps
  // the wood grain while pushing it into shadow.
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(24, 14, 8, 0.42)';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  return canvasTexture(canvas, { nearest: true });
}
