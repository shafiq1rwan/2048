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

// Note: the pack's Big*Button sheets (9-slice faces) were also probed —
// columns x 19w45 / 128w64 / 256w45, rows y 17h47 / 128h64 / 256h47
// (pressed top band y 28h36, bottom 256h49). A border-image skin built
// from them was tried and rejected: Chromium does not honour
// image-rendering on border-image scaling, which smears the pixel rims
// at UI sizes. The measurements are kept here for a future attempt.
