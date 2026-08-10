import * as THREE from 'three';

/**
 * Procedurally generated textures: tile plates, glows, the sky gradient
 * and all the text (damage numbers, tile level labels).
 *
 * None of this touches the Tiny Swords artwork — it is the frame around
 * it. Results are memoised because tile plates and numbers repeat a lot.
 */

const cache = new Map();

function memo(key, factory) {
  let hit = cache.get(key);
  if (!hit) {
    hit = factory();
    cache.set(key, hit);
  }
  return hit;
}

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

/** Wrap a canvas in a texture configured for either pixel art or smooth art. */
export function canvasTexture(canvas, { nearest = false, repeat = null } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  texture.minFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  texture.generateMipmaps = false;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat.x, repeat.y);
  }
  texture.needsUpdate = true;
  return texture;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Slightly lighten / darken a hex colour. */
export function shade(hex, amount) {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const num = parseInt(full, 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((num >> 16) & 255) + 255 * amount);
  const g = clamp(((num >> 8) & 255) + 255 * amount);
  const b = clamp((num & 255) + 255 * amount);
  return `rgb(${r},${g},${b})`;
}

/**
 * The plate a unit stands on. Chunky dark outline + gradient fill +
 * inner highlight, in the spirit of the Tiny Swords UI.
 */
export function tilePlateTexture({ fill, edge, size = 192, radius = 30 }) {
  return memo(`plate:${fill}:${edge}:${size}:${radius}`, () => {
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const outline = 11;
    const inset = 5;
    // Each nested layer sheds exactly its own inset, keeping the corners
    // concentric with the outer edge.
    const step = (extra) => Math.max(2, radius - extra);

    // dark outline
    ctx.fillStyle = '#141728';
    roundRectPath(ctx, inset, inset, size - inset * 2, size - inset * 2, radius);
    ctx.fill();

    // coloured rim
    ctx.fillStyle = edge;
    roundRectPath(
      ctx,
      inset + 4,
      inset + 4,
      size - (inset + 4) * 2,
      size - (inset + 4) * 2,
      step(4),
    );
    ctx.fill();

    // body gradient
    const bodyInset = inset + outline;
    const bodySize = size - bodyInset * 2;
    const bodyRadius = step(outline);
    const grad = ctx.createLinearGradient(0, bodyInset, 0, size - bodyInset);
    grad.addColorStop(0, shade(fill, 0.16));
    grad.addColorStop(0.55, fill);
    grad.addColorStop(1, shade(fill, -0.16));
    ctx.fillStyle = grad;
    roundRectPath(ctx, bodyInset, bodyInset, bodySize, bodySize, bodyRadius);
    ctx.fill();

    // top sheen
    ctx.save();
    roundRectPath(ctx, bodyInset, bodyInset, bodySize, bodySize, bodyRadius);
    ctx.clip();
    const sheen = ctx.createLinearGradient(0, bodyInset, 0, bodyInset + size * 0.3);
    sheen.addColorStop(0, 'rgba(255,255,255,0.26)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(bodyInset, bodyInset, size - bodyInset * 2, size * 0.3);
    ctx.restore();

    return canvasTexture(canvas);
  });
}

/** Empty board slot. */
export function slotTexture({ size = 192, radius = 30 } = {}) {
  return memo(`slot:${size}:${radius}`, () => {
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(12,14,28,0.58)';
    roundRectPath(ctx, 6, 6, size - 12, size - 12, radius);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 5;
    roundRectPath(ctx, 8, 8, size - 16, size - 16, radius - 2);
    ctx.stroke();
    return canvasTexture(canvas);
  });
}

/**
 * The wooden panel the whole grid sits on.
 *
 * `radius` is the outer corner radius in texture pixels. Every nested
 * shape steps its radius down by exactly its own inset, so all the
 * curves stay concentric instead of drifting apart at the corners.
 */
export function boardFrameTexture({ size = 512, radius = 32 } = {}) {
  return memo(`frame:${size}:${radius}`, () => {
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const pad = 8; // keeps the outline stroke inside the canvas
    const bevel = 12; // inset of the inner highlight from the outer edge
    const step = (inset) => Math.max(2, radius - inset);

    // drop shadow, nudged down
    ctx.fillStyle = 'rgba(10,12,22,0.42)';
    roundRectPath(ctx, pad + 2, pad + 6, size - (pad + 2) * 2, size - (pad + 2) * 2, step(2));
    ctx.fill();

    const grad = ctx.createLinearGradient(0, pad, 0, size - pad);
    grad.addColorStop(0, '#6b4630');
    grad.addColorStop(0.5, '#573726');
    grad.addColorStop(1, '#3d2618');
    ctx.fillStyle = grad;
    roundRectPath(ctx, pad, pad, size - pad * 2, size - pad * 2, radius);
    ctx.fill();

    ctx.strokeStyle = '#2a1a11';
    ctx.lineWidth = 8;
    roundRectPath(ctx, pad, pad, size - pad * 2, size - pad * 2, radius);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,220,170,0.16)';
    ctx.lineWidth = 4;
    const innerSize = size - (pad + bevel) * 2;
    roundRectPath(ctx, pad + bevel, pad + bevel, innerSize, innerSize, step(bevel));
    ctx.stroke();

    return canvasTexture(canvas);
  });
}

/** Soft radial glow used for auras, impact flashes and gold pops. */
export function glowTexture({ color = '#ffd45e', size = 256, power = 2.2 } = {}) {
  return memo(`glow:${color}:${size}:${power}`, () => {
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      grad.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, power)})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    return canvasTexture(canvas);
  });
}

/** hex -> rgba() string, so gradients can fade a colour to transparent. */
function rgba(hex, alpha) {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const num = parseInt(full, 16);
  return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${alpha})`;
}

/**
 * Bright-cored mote for XP pickups.
 *
 * A plain radial falloff (glowTexture) is too diffuse at mote size — over
 * bright grass it reads as a speck. This keeps a hot white core so the
 * mote stays legible while still glowing.
 */
export function orbTexture({ color = '#8ae0ff', size = 128 } = {}) {
  return memo(`orb:${color}:${size}`, () => {
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.17, '#ffffff');
    grad.addColorStop(0.3, rgba(color, 0.95));
    grad.addColorStop(0.55, rgba(color, 0.45));
    grad.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();
    return canvasTexture(canvas);
  });
}

/** Flat soft ellipse — contact shadow under sprites. */
export function shadowTexture({ size = 128 } = {}) {
  return memo(`shadow:${size}`, () => {
    const canvas = makeCanvas(size, size / 2);
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 4, 0, size / 2, size / 4, size / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.42)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.save();
    ctx.translate(size / 2, size / 4);
    ctx.scale(1, 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return canvasTexture(canvas);
  });
}

/** Vertical sky gradient. */
export function skyTexture() {
  return memo('sky', () => {
    const canvas = makeCanvas(4, 256);
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#4a7fb5');
    grad.addColorStop(0.34, '#79b3d8');
    grad.addColorStop(0.66, '#a8d8e8');
    grad.addColorStop(0.88, '#d5ecdc');
    grad.addColorStop(1, '#bfe0b4');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);
    return canvasTexture(canvas);
  });
}

/** Rolling far-hill silhouette so the horizon is not a flat line. */
export function hillsTexture({ color = '#5f9b52', width = 512, height = 128 } = {}) {
  return memo(`hills:${color}:${width}:${height}`, () => {
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, height);
    const bumps = 5;
    for (let i = 0; i <= bumps; i++) {
      const x = (i / bumps) * width;
      const peak = height * (i % 2 === 0 ? 0.52 : 0.24);
      ctx.quadraticCurveTo(x - width / (bumps * 2), height - peak, x, height - peak * 0.45);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    return canvasTexture(canvas);
  });
}

const FONT_STACK = '"Trebuchet MS", "Segoe UI", Tahoma, system-ui, sans-serif';

/**
 * Chunky outlined text on a tight canvas, returned with the aspect ratio
 * so callers can size a plane without squashing the glyphs.
 * @returns {{texture: THREE.Texture, aspect: number}}
 */
export function textTexture(
  text,
  { fontSize = 64, color = '#ffffff', outline = '#141728', outlineWidth = 7, glow = null } = {},
) {
  const key = `text:${text}:${fontSize}:${color}:${outline}:${outlineWidth}:${glow}`;
  return memo(key, () => {
    const measure = makeCanvas(8, 8).getContext('2d');
    const font = `bold ${fontSize}px ${FONT_STACK}`;
    measure.font = font;
    const metrics = measure.measureText(text);
    const pad = outlineWidth * 2 + (glow ? fontSize * 0.35 : 6);
    const width = Math.ceil(metrics.width + pad * 2);
    const height = Math.ceil(fontSize * 1.42 + pad * 2);

    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = fontSize * 0.5;
    }
    if (outlineWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeStyle = outline;
      ctx.lineWidth = outlineWidth;
      ctx.strokeText(text, width / 2, height / 2);
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillText(text, width / 2, height / 2);

    return { texture: canvasTexture(canvas), aspect: width / height };
  });
}

/** Small filled star row used as level pips on ascended units. */
export function starsTexture(count, { color = '#ffe07a', size = 26 } = {}) {
  return memo(`stars:${count}:${color}:${size}`, () => {
    const width = count * size;
    const canvas = makeCanvas(width, size);
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < count; i++) {
      const cx = i * size + size / 2;
      const cy = size / 2;
      const outer = size * 0.42;
      const inner = outer * 0.45;
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const radius = p % 2 === 0 ? outer : inner;
        const angle = (Math.PI / 5) * p - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#141728';
      ctx.lineWidth = size * 0.18;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fill();
    }
    return { texture: canvasTexture(canvas), aspect: width / size };
  });
}

/** Simple opaque square, used as a placeholder when a file is missing. */
export function placeholderTexture(color) {
  return memo(`ph:${color}`, () => {
    const canvas = makeCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 58, 58);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `bold 34px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 32, 34);
    return { canvas, texture: canvasTexture(canvas, { nearest: true }) };
  });
}

