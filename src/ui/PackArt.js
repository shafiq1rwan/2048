/**
 * Composites sheets from the pack's "UI Elements" folder into single
 * DOM-ready images (data URLs).
 *
 * The pack stores these as slice sheets with transparent gutters
 * between the pieces, so the raw files cannot be used directly as a
 * CSS background or border-image. Every rectangle below was measured
 * from the real PNGs (alpha bounding runs) — the artwork itself is
 * used untouched.
 */

/**
 * Ribbons/BigRibbons.png — 448x640, five 128px colour rows, each with a
 * left tail, a tileable middle and a right tail.
 */
const RIBBON = {
  rowH: 128,
  top: 20,
  h: 103,
  left: { x: 30, w: 98 },
  mid: { x: 192, w: 64 },
  right: { x: 320, w: 97 },
};

export const RIBBON_ROW = { teal: 0, red: 1, yellow: 2, purple: 3, navy: 4 };

/**
 * For layout: the folded tails scale with the plate's height, so text
 * needs side padding of roughly `height * tailW / h` to stay on the
 * flat cloth between them.
 */
export const RIBBON_METRICS = { h: RIBBON.h, tailW: Math.max(RIBBON.left.w, RIBBON.right.w) };

/**
 * Compose one ribbon row into a banner image of the requested size.
 * @param {CanvasImageSource} image the BigRibbons sheet
 */
export function ribbonDataUrl(image, { row = RIBBON_ROW.navy, width = 360, height = 44 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.round(width));
  canvas.height = Math.max(8, Math.round(height));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const scale = canvas.height / RIBBON.h;
  const sy = row * RIBBON.rowH + RIBBON.top;
  const lw = Math.round(RIBBON.left.w * scale);
  const rw = Math.round(RIBBON.right.w * scale);
  const mw = Math.max(1, Math.round(RIBBON.mid.w * scale));

  // Tile the middle first so its seams end up hidden under the tails.
  for (let x = lw - 4; x < canvas.width - rw + 4; x += mw) {
    ctx.drawImage(image, RIBBON.mid.x, sy, RIBBON.mid.w, RIBBON.h, x, 0, mw, canvas.height);
  }
  ctx.drawImage(image, RIBBON.left.x, sy, RIBBON.left.w, RIBBON.h, 0, 0, lw, canvas.height);
  ctx.drawImage(
    image,
    RIBBON.right.x,
    sy,
    RIBBON.right.w,
    RIBBON.h,
    canvas.width - rw,
    0,
    rw,
    canvas.height,
  );
  return canvas.toDataURL();
}

/**
 * Papers/SpecialPaper.png — 320x320, a dark slate panel with gold
 * filigree corners, stored as nine blocks with gutters.
 */
const PAPER = {
  cols: [
    { x: 9, w: 55 },
    { x: 128, w: 64 },
    { x: 256, w: 55 },
  ],
  rows: [
    { y: 20, h: 44 },
    { y: 128, h: 64 },
    { y: 256, h: 43 },
  ],
};

/**
 * Compose the paper panel at an exact pixel size. Done per element
 * (instead of CSS border-image) because Chromium ignores
 * image-rendering when scaling border-image, which smears the art.
 *
 * @param {CanvasImageSource} image the SpecialPaper sheet
 * @param {{width:number, height:number, edge?:number, ratio?:number}} opts
 *        width/height in CSS px; edge = rendered corner width in CSS px;
 *        ratio = supersampling factor for crispness
 */
export function paperDataUrl(image, { width, height, edge = 20, ratio = 2 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.round(width * ratio));
  canvas.height = Math.max(8, Math.round(height * ratio));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const s = (edge / PAPER.cols[0].w) * ratio;
  const xs = [0, Math.round(PAPER.cols[0].w * s), canvas.width - Math.round(PAPER.cols[2].w * s)];
  const ys = [0, Math.round(PAPER.rows[0].h * s), canvas.height - Math.round(PAPER.rows[2].h * s)];
  const ws = [xs[1], xs[2] - xs[1], canvas.width - xs[2]];
  const hs = [ys[1], ys[2] - ys[1], canvas.height - ys[2]];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (ws[c] <= 0 || hs[r] <= 0) continue;
      ctx.drawImage(
        image,
        PAPER.cols[c].x,
        PAPER.rows[r].y,
        PAPER.cols[c].w,
        PAPER.rows[r].h,
        xs[c],
        ys[r],
        ws[c],
        hs[r],
      );
    }
  }
  return canvas.toDataURL();
}

// Note: the pack's Big*Button sheets (9-slice faces) were also probed —
// columns x 19w45 / 128w64 / 256w45, rows y 17h47 / 128h64 / 256h47
// (pressed top band y 28h36, bottom 256h49). A border-image skin built
// from them was tried and rejected: Chromium does not honour
// image-rendering on border-image scaling, which smears the pixel rims
// at UI sizes. The measurements are kept here for a future attempt.
