/**
 * Sprite-sheet measuring tool.
 *
 * Retargeting the game to a new art pack is mostly a measuring problem:
 * for each sheet you need the frame grid, how many frames each row
 * actually uses, and where the character sits inside its frame. This
 * script reports all of that and prints a ready-to-paste sheet
 * descriptor in the exact shape data/units.js and data/enemies.js use.
 *
 * Pure Node — PNGs are decoded with the built-in zlib, no dependencies.
 *
 *   node tools/probe-assets.mjs <file-or-dir> [options]
 *
 *   --frame 192x192   frame size; omit to list candidate sizes instead
 *   --alpha 8         alpha above which a pixel counts as opaque (0-255)
 *   --name myKey      key to use in the printed descriptor
 *   --fps 8           fps to put in the printed descriptor
 *   --limit 40        max files to process
 *
 * Examples:
 *   node tools/probe-assets.mjs public/assets/tiny-swords/Units
 *   node tools/probe-assets.mjs sheet.png --frame 192x192 --name goblin
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, extname, basename, relative } from 'node:path';

// ---------------------------------------------------------------------
// minimal PNG decode -> alpha mask
// ---------------------------------------------------------------------

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * @param {Buffer} buf
 * @returns {{width:number, height:number, alpha:Uint8Array}}
 */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  let offset = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;

    offset += length + 12;
  }

  if (!header) throw new Error('no IHDR chunk');
  const { width, height, bitDepth, colorType, interlace } = header;
  if (interlace) throw new Error('interlaced (Adam7) PNGs are not supported');
  if (bitDepth !== 8 && bitDepth !== 16) {
    throw new Error(`unsupported bit depth ${bitDepth} (only 8 and 16)`);
  }
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerSample = bitDepth / 8;
  const bpp = channels * bytesPerSample;
  const stride = width * bpp;

  // Undo the per-scanline filters (PNG spec section 9).
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      const v = line[x];
      switch (filter) {
        case 0: out[x] = v; break;
        case 1: out[x] = (v + a) & 0xff; break;
        case 2: out[x] = (v + b) & 0xff; break;
        case 3: out[x] = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          out[x] = (v + pred) & 0xff;
          break;
        }
        default: throw new Error(`unknown filter ${filter} on row ${y}`);
      }
    }
  }

  // Collapse to an alpha-only mask.
  const alpha = new Uint8Array(width * height);
  const hasAlphaChannel = colorType === 4 || colorType === 6;
  for (let i = 0; i < width * height; i++) {
    if (hasAlphaChannel) {
      alpha[i] = pixels[i * bpp + (channels - 1) * bytesPerSample];
    } else if (colorType === 3 && transparency) {
      alpha[i] = transparency[pixels[i * bpp]] ?? 255;
    } else {
      alpha[i] = 255; // no transparency information
    }
  }
  return { width, height, alpha };
}

// ---------------------------------------------------------------------
// analysis
// ---------------------------------------------------------------------

/** Alpha bounding box of one frame, in frame-local coordinates. */
function frameBox(img, fx, fy, fw, fh, threshold) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < fh; y++) {
    const row = (fy + y) * img.width;
    for (let x = 0; x < fw; x++) {
      if (img.alpha[row + fx + x] > threshold) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1, count };
}

const CANDIDATE_SIZES = [16, 24, 32, 48, 64, 80, 96, 112, 128, 160, 192, 256, 320, 384];

/** Frame sizes that divide the image evenly, largest first. */
function candidateFrames(width, height) {
  const out = [];
  for (const size of CANDIDATE_SIZES) {
    if (width % size === 0 && height % size === 0) {
      out.push({ size, cols: width / size, rows: height / size });
    }
  }
  return out.reverse();
}

function analyse(img, fw, fh, threshold) {
  const cols = Math.floor(img.width / fw);
  const rows = Math.floor(img.height / fh);
  const perRow = [];
  let first = null;

  for (let r = 0; r < rows; r++) {
    let used = 0;
    let lastUsed = -1;
    for (let c = 0; c < cols; c++) {
      const box = frameBox(img, c * fw, r * fh, fw, fh, threshold);
      if (box) {
        used++;
        lastUsed = c;
        if (!first) first = { row: r, col: c, box };
      }
    }
    // Trailing blanks are padding; a gap in the middle is worth flagging.
    perRow.push({ row: r, used, lastUsed, contiguous: used === lastUsed + 1 });
  }
  return { cols, rows, perRow, first };
}

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { alpha: 8, fps: 8, limit: 60 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--frame') {
      const m = /^(\d+)x(\d+)$/.exec(argv[++i] ?? '');
      if (!m) throw new Error('--frame expects WxH, e.g. 192x192');
      opts.frameW = Number(m[1]);
      opts.frameH = Number(m[2]);
    } else if (arg === '--alpha') opts.alpha = Number(argv[++i]);
    else if (arg === '--fps') opts.fps = Number(argv[++i]);
    else if (arg === '--name') opts.name = argv[++i];
    else if (arg === '--limit') opts.limit = Number(argv[++i]);
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else positional.push(arg);
  }
  opts.target = positional[0];
  return opts;
}

function collectPngs(target, limit) {
  const stat = statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (out.length >= limit) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (extname(entry.name).toLowerCase() === '.png') out.push(full);
    }
  };
  walk(target);
  return out;
}

/** Turn a filename into a plausible asset key. */
function keyFor(file) {
  return basename(file, extname(file))
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.target) {
    console.error('usage: node tools/probe-assets.mjs <file-or-dir> [--frame 192x192] [--name key] [--fps 8]');
    process.exit(2);
  }

  const files = collectPngs(opts.target, opts.limit);
  if (files.length === 0) {
    console.error(`no PNG files found under ${opts.target}`);
    process.exit(1);
  }

  console.log(`Probing ${files.length} file(s), alpha threshold ${opts.alpha}\n`);
  const descriptors = [];

  for (const file of files) {
    const label = relative(process.cwd(), file).replace(/\\/g, '/');
    let img;
    try {
      img = decodePng(readFileSync(file));
    } catch (err) {
      console.log(`${label}\n  !! could not decode: ${err.message}\n`);
      continue;
    }

    console.log(`${label}  ${img.width}x${img.height}`);

    if (!opts.frameW) {
      const candidates = candidateFrames(img.width, img.height);
      if (candidates.length === 0) {
        console.log('  no square frame size from the preset list divides this image evenly');
      } else {
        console.log(
          '  candidate square frames: ' +
            candidates.map((c) => `${c.size}px (${c.cols}x${c.rows})`).join(', '),
        );
        // Best guess: the largest candidate that leaves more than one frame.
        const guess = candidates.find((c) => c.cols * c.rows > 1) ?? candidates[0];
        console.log(`  -> re-run with --frame ${guess.size}x${guess.size} for a full report`);
      }
      console.log('');
      continue;
    }

    const { cols, rows, perRow, first } = analyse(img, opts.frameW, opts.frameH, opts.alpha);
    console.log(`  grid ${cols} cols x ${rows} rows of ${opts.frameW}x${opts.frameH}`);
    if (img.width % opts.frameW || img.height % opts.frameH) {
      console.log('  !! frame size does not divide the image evenly — check --frame');
    }
    for (const row of perRow) {
      const warn = row.contiguous ? '' : '   <- non-contiguous, blank gap inside the row';
      console.log(`    row ${row.row}: ${row.used} frame(s) used${warn}`);
    }

    if (!first) {
      console.log('  fully transparent image\n');
      continue;
    }

    const b = first.box;
    // footY is the last opaque row, matching the existing data files.
    const footY = b.maxY;
    const charH = b.h;
    const centerX = Math.round((b.minX + b.maxX) / 2);
    console.log(
      `  frame[row ${first.row}, col ${first.col}] content x:${b.minX}..${b.maxX} ` +
        `y:${b.minY}..${b.maxY}  (${b.w}x${b.h})`,
    );

    const usedInRow = perRow[first.row].used;
    descriptors.push(
      [
        `  ${opts.name ?? keyFor(file)}: {`,
        `    image: '${opts.name ?? keyFor(file)}',`,
        `    frameW: ${opts.frameW}, frameH: ${opts.frameH}, cols: ${cols}, rows: ${rows},`,
        `    row: ${first.row}, frames: ${usedInRow}, fps: ${opts.fps},`,
        `    footY: ${footY}, charH: ${charH}, centerX: ${centerX},`,
        `  },`,
      ].join('\n'),
    );
    console.log('');
  }

  if (descriptors.length) {
    console.log('─'.repeat(68));
    console.log('Sheet descriptors (paste into data/units.js or data/enemies.js):\n');
    console.log(descriptors.join('\n'));
    console.log(
      '\nNote: charH is the full alpha bounding box. For a sprite whose art\n' +
        'sticks out well past the body (a raised spear, a bow, a big hat),\n' +
        'reduce charH by hand so the body — not the prop — sets the scale.\n' +
        'That is why the Tiny Swords Lancer uses charH 118 and not its\n' +
        'measured 150.',
    );
  }
}

main();
