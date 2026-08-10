import * as THREE from 'three';

/** One shared quad; every sprite scales it rather than building geometry. */
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

/**
 * Steps a cloned texture's UV offset across a sprite sheet.
 *
 * Sheets are described by the geometry measured from the real files:
 * `{ frameW, frameH, cols, rows, row, frames, fps }`.
 */
export class SpriteAnimator {
  /**
   * @param {THREE.Texture} texture a private clone — offsets are mutated
   * @param {object} sheet
   */
  constructor(texture, sheet) {
    this.texture = texture;
    this.sheet = sheet;
    this.cols = sheet.cols;
    this.rows = sheet.rows;
    texture.repeat.set(1 / this.cols, 1 / this.rows);

    this.row = sheet.row ?? 0;
    this.frameCount = Math.min(sheet.frames ?? this.cols, this.cols);
    this.fps = sheet.fps ?? 8;
    this.loop = true;
    this.playing = true;
    this.frame = 0;
    this.elapsed = 0;
    this.onComplete = null;

    this.setFrame(0);
  }

  /**
   * @param {{row?:number, frames?:number, fps?:number, loop?:boolean,
   *          startFrame?:number, onComplete?:(()=>void)|null}} [opts]
   */
  play(opts = {}) {
    this.row = opts.row ?? this.row;
    this.frameCount = Math.min(opts.frames ?? this.frameCount, this.cols);
    this.fps = opts.fps ?? this.fps;
    this.loop = opts.loop ?? true;
    this.onComplete = opts.onComplete ?? null;
    this.playing = true;
    this.elapsed = 0;
    this.setFrame(opts.startFrame ?? 0);
    return this;
  }

  /** Start somewhere random so identical tiles do not animate in lockstep. */
  randomiseFrame() {
    this.setFrame(Math.floor(Math.random() * this.frameCount));
    this.elapsed = Math.random() / this.fps;
    return this;
  }

  setFrame(index) {
    this.frame = ((index % this.frameCount) + this.frameCount) % this.frameCount;
    // flipY is on by default, so rows are addressed from the bottom up.
    this.texture.offset.set(this.frame / this.cols, 1 - (this.row + 1) / this.rows);
  }

  /** @param {number} dt seconds */
  update(dt) {
    if (!this.playing || this.frameCount <= 1) return;
    this.elapsed += dt;
    const step = 1 / this.fps;
    while (this.elapsed >= step) {
      this.elapsed -= step;
      const next = this.frame + 1;
      if (next >= this.frameCount) {
        if (this.loop) {
          this.setFrame(0);
        } else {
          this.setFrame(this.frameCount - 1);
          this.playing = false;
          const done = this.onComplete;
          this.onComplete = null;
          done?.();
          return;
        }
      } else {
        this.setFrame(next);
      }
    }
  }

  stop() {
    this.playing = false;
  }

  dispose() {
    this.texture.dispose();
  }
}

/**
 * A positioned, animated pixel-art sprite.
 *
 * The entity's own origin sits at the character's *feet*, which makes
 * baseline alignment and feet-anchored squash/stretch trivial even
 * though the source sheets have wildly different frame padding.
 *
 * Layout: SpriteEntity (feet) > art (squash + flip) > mesh (+ additive
 * flash copy for white hit flashes).
 */
export class SpriteEntity extends THREE.Group {
  /**
   * @param {{texture: THREE.Texture, sheet: object, charHeight: number,
   *          renderOrder?: number, flash?: boolean}} opts
   */
  constructor({ texture, sheet, charHeight, renderOrder = 0, flash = true }) {
    super();
    this.sheet = sheet;
    this.animator = new SpriteAnimator(texture, sheet);

    this.art = new THREE.Group();
    this.add(this.art);

    this.material = new THREE.MeshBasicMaterial({
      map: this.animator.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      alphaTest: 0.02,
    });
    this.mesh = new THREE.Mesh(UNIT_PLANE, this.material);
    this.mesh.renderOrder = renderOrder;
    this.art.add(this.mesh);

    if (flash) {
      this.flashMaterial = new THREE.MeshBasicMaterial({
        map: this.animator.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      this.flashMesh = new THREE.Mesh(UNIT_PLANE, this.flashMaterial);
      this.flashMesh.renderOrder = renderOrder + 1;
      this.flashMesh.visible = false;
      this.art.add(this.flashMesh);
    }

    this.squashX = 1;
    this.squashY = 1;
    this.flipSign = 1;
    this.setCharHeight(charHeight);
  }

  /** Resize so the character reads `height` world units tall. */
  setCharHeight(height) {
    const sheet = this.sheet;
    const scale = height / sheet.charH;
    this.charHeight = height;
    this.planeW = sheet.frameW * scale;
    this.planeH = sheet.frameH * scale;

    const centerX = sheet.centerX ?? sheet.frameW / 2;
    const offsetX = -(centerX - sheet.frameW / 2) * scale;
    const offsetY = (sheet.footY - sheet.frameH / 2) * scale;

    for (const mesh of [this.mesh, this.flashMesh]) {
      if (!mesh) continue;
      mesh.scale.set(this.planeW, this.planeH, 1);
      mesh.position.set(offsetX, offsetY, 0);
    }
    return this;
  }

  /** Feet-anchored squash. (1, 1) is rest. */
  setSquash(x, y) {
    this.squashX = x;
    this.squashY = y;
    this.art.scale.set(x * this.flipSign, y, 1);
  }

  setFlip(flipped) {
    this.flipSign = flipped ? -1 : 1;
    this.setSquash(this.squashX, this.squashY);
  }

  /** 0 = normal, 1 = blown out white. */
  setFlash(amount) {
    if (!this.flashMaterial) return;
    this.flashMaterial.opacity = amount;
    this.flashMesh.visible = amount > 0.001;
  }

  /** Multiplicative tint, e.g. a red wash while taking damage. */
  setTint(r, g, b) {
    this.material.color.setRGB(r, g, b);
  }

  setOpacity(value) {
    this.material.opacity = value;
    this.material.transparent = true;
  }

  play(opts) {
    this.animator.play(opts);
    return this;
  }

  update(dt) {
    this.animator.update(dt);
  }

  dispose() {
    this.animator.dispose();
    this.material.dispose();
    this.flashMaterial?.dispose();
    this.removeFromParent();
  }
}

/**
 * A one-shot, non-looping effect sprite that removes itself when the
 * animation finishes. Used for explosions, dust and impact bursts.
 */
export class EffectSprite extends THREE.Mesh {
  /**
   * @param {{texture: THREE.Texture, sheet: object, size: number,
   *          renderOrder?: number, additive?: boolean, fps?: number,
   *          onDone?: ()=>void}} opts
   */
  constructor({ texture, sheet, size, renderOrder = 0, additive = false, fps, onDone }) {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    super(UNIT_PLANE, material);
    this.material = material;
    this.renderOrder = renderOrder;

    const aspect = sheet.frameW / sheet.frameH;
    this.baseWidth = size * aspect;
    this.baseHeight = size;
    this.scale.set(this.baseWidth, this.baseHeight, 1);

    this.finished = false;
    this.animator = new SpriteAnimator(texture, sheet);
    this.animator.play({
      row: sheet.row ?? 0,
      frames: sheet.frames,
      fps: fps ?? sheet.fps ?? 20,
      loop: false,
      onComplete: () => {
        this.finished = true;
        onDone?.();
      },
    });
  }

  update(dt) {
    this.animator.update(dt);
  }

  dispose() {
    this.animator.dispose();
    this.material.dispose();
    this.removeFromParent();
  }
}

export { UNIT_PLANE };
