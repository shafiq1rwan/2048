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
  /**
   * The middle cloth (y 22..110, centre 66) is shorter than the
   * drooping tails (y 20..122, centre 71.5). Text centres on the
   * element, so the composition shifts down by the difference to put
   * the cloth's centre at the element's centre.
   */
  clothShift: (71.5 - 66) / 103,
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
  const dy = Math.round(canvas.height * RIBBON.clothShift);

  // Tile the middle first so its seams end up hidden under the tails.
  for (let x = lw - 4; x < canvas.width - rw + 4; x += mw) {
    ctx.drawImage(image, RIBBON.mid.x, sy, RIBBON.mid.w, RIBBON.h, x, dy, mw, canvas.height);
  }
  ctx.drawImage(image, RIBBON.left.x, sy, RIBBON.left.w, RIBBON.h, 0, dy, lw, canvas.height);
  ctx.drawImage(
    image,
    RIBBON.right.x,
    sy,
    RIBBON.right.w,
    RIBBON.h,
    canvas.width - rw,
    dy,
    rw,
    canvas.height,
  );
  return canvas.toDataURL();
}

/**
 * Papers/SpecialPaper.png — 320x320, a dark slate panel stored as nine
 * blocks with gutters. The art's gold trim and filigree decorate only
 * the TOP and LEFT pieces, so compositions mirror those pieces onto
 * the right and bottom — otherwise the outline looks incomplete.
 */
const PAPER = {
  corner: { x: 9, y: 20, w: 55, h: 44 },
  topEdge: { x: 128, y: 20, w: 64, h: 44 },
  leftEdge: { x: 10, y: 128, w: 54, h: 64 },
  center: { x: 128, y: 128, w: 64, h: 64 },
};

/** drawImage with optional mirroring into the destination rect. */
function drawPiece(ctx, image, src, dx, dy, dw, dh, flipX = false, flipY = false) {
  ctx.save();
  ctx.translate(flipX ? dx + dw : dx, flipY ? dy + dh : dy);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(image, src.x, src.y, src.w, src.h, 0, 0, dw, dh);
  ctx.restore();
}

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

  const s = (edge / PAPER.corner.w) * ratio;
  const cw = Math.round(PAPER.corner.w * s);
  const ch = Math.round(PAPER.corner.h * s);
  const ew = Math.round(PAPER.leftEdge.w * s);
  const W = canvas.width;
  const H = canvas.height;
  const midW = W - cw * 2;
  const midH = H - ch * 2;

  // centre fill first, then edges, corners last so the filigree wins
  drawPiece(ctx, image, PAPER.center, ew, ch, W - ew * 2, H - ch * 2);
  if (midW > 0) {
    drawPiece(ctx, image, PAPER.topEdge, cw, 0, midW, ch);
    drawPiece(ctx, image, PAPER.topEdge, cw, H - ch, midW, ch, false, true);
  }
  if (midH > 0) {
    drawPiece(ctx, image, PAPER.leftEdge, 0, ch, ew, midH);
    drawPiece(ctx, image, PAPER.leftEdge, W - ew, ch, ew, midH, true, false);
  }
  drawPiece(ctx, image, PAPER.corner, 0, 0, cw, ch);
  drawPiece(ctx, image, PAPER.corner, W - cw, 0, cw, ch, true, false);
  drawPiece(ctx, image, PAPER.corner, 0, H - ch, cw, ch, false, true);
  drawPiece(ctx, image, PAPER.corner, W - cw, H - ch, cw, ch, true, true);
  return canvas.toDataURL();
}

// Note: the pack's Big*Button sheets (9-slice faces) were also probed —
// columns x 19w45 / 128w64 / 256w45, rows y 17h47 / 128h64 / 256h47
// (pressed top band y 28h36, bottom 256h49). A border-image skin built
// from them was tried and rejected: Chromium does not honour
// image-rendering on border-image scaling, which smears the pixel rims
// at UI sizes. The measurements are kept here for a future attempt.
