import * as THREE from 'three';
import { SpriteEntity, UNIT_PLANE } from './SpriteAnimator.js';
import {
  tilePlateTexture,
  slotTexture,
  boardFrameTexture,
  glowTexture,
  textTexture,
  starsTexture,
} from './Textures.js';
import { getUnit } from '../data/units.js';
import { BOARD, GRID_EXTENT, SCENE, RENDER_LAYER, TIME, cellCenter } from '../core/config.js';
import { Ease } from '../core/Tween.js';

/**
 * Texture resolutions. These are authoring sizes only — each texture is
 * scaled down to its design-unit footprint, so corner radii are
 * specified in design units and converted here.
 */
const CELL_TEX = 192;
const FRAME_TEX = 512;

/** Outer extent of the board frame, in design units. */
const FRAME_SIZE = GRID_EXTENT + BOARD.padding * 2;

/** Cell corner radius, expressed in cell-texture pixels. */
const CELL_RADIUS_TEX = (BOARD.cornerRadius * CELL_TEX) / BOARD.cell;

/**
 * Frame corner radius in frame-texture pixels. A corner sitting `padding`
 * outside the cell corners has to be that much rounder to stay
 * concentric with them.
 */
const FRAME_RADIUS_TEX = ((BOARD.cornerRadius + BOARD.padding) * FRAME_TEX) / FRAME_SIZE;

/**
 * Visual representation of one board tile: plate, unit sprite, level
 * label and (for ascended units) a golden aura and star pips.
 */
class TileView extends THREE.Group {
  constructor(tile, assets) {
    super();
    this.tileId = tile.id;
    this.assets = assets;
    this.level = 0;

    /** Wrapper that carries pop/squash so position stays independent. */
    this.body = new THREE.Group();
    this.add(this.body);

    this.plateMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.plate = new THREE.Mesh(UNIT_PLANE, this.plateMaterial);
    this.plate.renderOrder = RENDER_LAYER.tile;
    this.plate.scale.set(BOARD.cell, BOARD.cell, 1);
    this.body.add(this.plate);

    this.auraMaterial = new THREE.MeshBasicMaterial({
      map: glowTexture({ color: '#ffd45e', power: 2.4 }),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    this.aura = new THREE.Mesh(UNIT_PLANE, this.auraMaterial);
    this.aura.renderOrder = RENDER_LAYER.tile - 1;
    this.aura.scale.set(BOARD.cell * 1.9, BOARD.cell * 1.9, 1);
    this.aura.visible = false;
    this.body.add(this.aura);

    this.labelMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.label = new THREE.Mesh(UNIT_PLANE, this.labelMaterial);
    this.label.renderOrder = RENDER_LAYER.tileLabel;
    this.body.add(this.label);

    this.starsMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.stars = new THREE.Mesh(UNIT_PLANE, this.starsMaterial);
    this.stars.renderOrder = RENDER_LAYER.tileLabel;
    this.stars.visible = false;
    this.body.add(this.stars);

    /** @type {SpriteEntity|null} */
    this.unit = null;

    this.setLevel(tile.level);
  }

  /** Rebuild plate colour, unit sprite and label for a (new) level. */
  setLevel(level) {
    if (this.level === level) return;
    this.level = level;
    const def = getUnit(level);
    this.def = def;

    this.plateMaterial.map = tilePlateTexture({
      fill: def.tint,
      edge: def.edge,
      size: CELL_TEX,
      radius: CELL_RADIUS_TEX,
    });
    this.plateMaterial.needsUpdate = true;

    // unit sprite
    if (this.unit) this.unit.dispose();
    this.unit = new SpriteEntity({
      texture: this.assets.clone(def.sprite.image),
      sheet: def.sprite,
      charHeight: SCENE.unitHeight,
      renderOrder: RENDER_LAYER.tileUnit,
      flash: true,
    });
    // Feet sit just below centre so the unit reads as standing on the plate.
    this.unit.position.set(0, -BOARD.cell * 0.29, 0);
    this.unit.animator.randomiseFrame();
    this.body.add(this.unit);

    // level number, bottom-right of the plate
    const { texture, aspect } = textTexture(String(level), {
      fontSize: 46,
      color: def.aura ? '#ffe89a' : '#ffffff',
      outline: '#141728',
      outlineWidth: 8,
    });
    this.labelMaterial.map = texture;
    this.labelMaterial.needsUpdate = true;
    const labelH = 26;
    this.label.scale.set(labelH * aspect, labelH, 1);
    this.label.position.set(BOARD.cell * 0.3, -BOARD.cell * 0.335, 0);

    // ascended units get an aura + star pips
    const starCount = def.stars ?? 0;
    if (starCount > 0) {
      const stars = starsTexture(starCount);
      this.starsMaterial.map = stars.texture;
      this.starsMaterial.needsUpdate = true;
      const h = 13;
      this.stars.scale.set(h * stars.aspect, h, 1);
      this.stars.position.set(-BOARD.cell * 0.22, BOARD.cell * 0.34, 0);
      this.stars.visible = true;
    } else {
      this.stars.visible = false;
    }

    this.aura.visible = Boolean(def.aura);
    this.auraMaterial.opacity = def.aura ? 0.3 : 0;
  }

  setBodyScale(scale) {
    this.body.scale.set(scale, scale, 1);
  }

  setSquash(x, y) {
    this.body.scale.set(x, y, 1);
  }

  update(dt, time) {
    this.unit?.update(dt);
    if (this.aura.visible) {
      this.auraMaterial.opacity = 0.24 + Math.sin(time * 3.1 + this.tileId) * 0.1;
    }
  }

  dispose() {
    this.unit?.dispose();
    this.plateMaterial.dispose();
    this.labelMaterial.dispose();
    this.starsMaterial.dispose();
    this.auraMaterial.dispose();
    this.removeFromParent();
  }
}

/**
 * Renders the 4x4 board and every board animation: slides, merge
 * squash/bounce, spawn pops and the invalid-move nudge.
 */
export class BoardView {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./AssetManager.js').AssetManager} assets
   * @param {import('../core/Tween.js').Tweens} tweens
   * @param {import('./Effects.js').Effects} effects
   */
  constructor(scene, assets, tweens, effects) {
    this.scene = scene;
    this.assets = assets;
    this.tweens = tweens;
    this.effects = effects;

    this.root = new THREE.Group();
    scene.add(this.root);

    /** @type {Map<number, TileView>} tile id -> view */
    this.views = new Map();
    this.time = 0;

    this.buildFrame();
    this.buildSlots();
  }

  buildFrame() {
    const material = new THREE.MeshBasicMaterial({
      map: boardFrameTexture({ size: FRAME_TEX, radius: FRAME_RADIUS_TEX }),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.frame = new THREE.Mesh(UNIT_PLANE, material);
    this.frame.renderOrder = RENDER_LAYER.boardFrame;
    this.frame.scale.set(FRAME_SIZE, FRAME_SIZE, 1);
    this.frame.position.set(0, BOARD.centerY, 0);
    this.root.add(this.frame);
  }

  buildSlots() {
    const material = new THREE.MeshBasicMaterial({
      map: slotTexture({ size: CELL_TEX, radius: CELL_RADIUS_TEX }),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    for (let row = 0; row < BOARD.size; row++) {
      for (let col = 0; col < BOARD.size; col++) {
        const mesh = new THREE.Mesh(UNIT_PLANE, material);
        mesh.renderOrder = RENDER_LAYER.boardCell;
        mesh.scale.set(BOARD.cell, BOARD.cell, 1);
        const { x, y } = cellCenter(row, col);
        mesh.position.set(x, y, 0);
        this.root.add(mesh);
      }
    }
  }

  // ---------------------------------------------------------------- //

  viewFor(tile) {
    return this.views.get(tile.id) ?? null;
  }

  /** Place a view for a tile that is not on screen yet. */
  addTile(tile, { animate = true } = {}) {
    let view = this.views.get(tile.id);
    if (!view) {
      view = new TileView(tile, this.assets);
      this.views.set(tile.id, view);
      this.root.add(view);
    }
    const { x, y } = cellCenter(tile.row, tile.col);
    view.position.set(x, y, 0);

    if (animate) {
      view.setBodyScale(0.1);
      this.tweens.add({
        duration: TIME.tileSpawn,
        ease: Ease.outBack,
        onUpdate: (v) => view.setBodyScale(0.1 + 0.9 * v),
        onComplete: () => view.setBodyScale(1),
      });
    } else {
      view.setBodyScale(1);
    }
    return view;
  }

  /** Wipe the board (restart). */
  clear() {
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
  }

  /** Rebuild from scratch to match board state exactly. */
  syncAll(tiles) {
    this.clear();
    for (const tile of tiles) this.addTile(tile, { animate: false });
  }

  /**
   * Animate one move.
   * @param {Array<{tile:object, from:{row,col}, to:{row,col}, absorbed?:boolean}>} moves
   * @returns {Promise<boolean>} resolves when every tile has landed
   */
  animateSlides(moves) {
    if (moves.length === 0) return Promise.resolve(true);

    const jobs = [];
    for (const move of moves) {
      const view = this.views.get(move.tile.id);
      if (!view) continue;
      const from = cellCenter(move.from.row, move.from.col);
      const to = cellCenter(move.to.row, move.to.col);
      // Absorbed tiles must draw beneath the survivor as they overlap.
      if (move.absorbed) {
        view.plate.renderOrder = RENDER_LAYER.tile - 1;
        if (view.unit) view.unit.mesh.renderOrder = RENDER_LAYER.tileUnit - 2;
      }
      jobs.push({ view, from, to });
    }

    return new Promise((resolve) => {
      this.tweens.add({
        duration: TIME.tileSlide,
        ease: Ease.outQuad,
        onUpdate: (v) => {
          for (const job of jobs) {
            job.view.position.x = job.from.x + (job.to.x - job.from.x) * v;
            job.view.position.y = job.from.y + (job.to.y - job.from.y) * v;
          }
        },
        onComplete: () => {
          for (const job of jobs) {
            job.view.position.set(job.to.x, job.to.y, 0);
          }
          resolve(true);
        },
        onCancel: () => resolve(false),
      });
    });
  }

  /**
   * Squash, pop and level-up one merged tile. The absorbed tile's view
   * is removed here.
   *
   * @param {{tile:object, absorbed:object, level:number, at:{row,col}}} merge
   * @returns {Promise<boolean>} resolves at the peak of the bounce, so
   *          the caller can fire the attack right on the impact frame
   */
  animateMerge(merge) {
    const view = this.views.get(merge.tile.id);
    const absorbedView = this.views.get(merge.absorbed.id);
    if (absorbedView) {
      absorbedView.dispose();
      this.views.delete(merge.absorbed.id);
    }
    if (!view) return Promise.resolve(true);

    const { x, y } = cellCenter(merge.at.row, merge.at.col);
    view.position.set(x, y, 0);

    return new Promise((resolve) => {
      // 1. squash on impact
      this.tweens.add({
        duration: TIME.mergeSquash,
        ease: Ease.outQuad,
        onUpdate: (v) => view.setSquash(1 + 0.26 * v, 1 - 0.24 * v),
        onComplete: () => {
          // 2. swap in the stronger unit at the bottom of the squash
          view.setLevel(merge.level);
          this.effects.mergePop(x, y, {
            size: BOARD.cell * 1.35,
            color: getUnit(merge.level).edge,
          });
          this.effects.dust(x, y - BOARD.cell * 0.3, { size: BOARD.cell * 0.8 });

          // 3. quick overshoot bounce back to rest
          this.tweens.add({
            duration: TIME.mergeBounce,
            ease: Ease.outBack,
            onUpdate: (v) => {
              const s = 1.26 - 0.26 * v;
              view.setSquash(s, 0.76 + 0.24 * v + 0.14 * Math.sin(v * Math.PI));
            },
            onComplete: () => view.setSquash(1, 1),
          });
          resolve(true);
        },
        onCancel: () => resolve(false),
      });
    });
  }

  /** Little kick towards a wall when the move was illegal. */
  nudge(dir) {
    const offset = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }[dir] ?? [0, 0];
    const distance = 9;
    this.tweens.add({
      duration: 170,
      ease: Ease.outQuad,
      onUpdate: (v) => {
        const push = Math.sin(v * Math.PI) * distance;
        this.root.position.x = offset[0] * push;
        this.root.position.y = offset[1] * push;
      },
      onComplete: () => this.root.position.set(0, 0, 0),
    });
  }

  /** World position of a tile, for aiming attack bolts. */
  tilePosition(tile) {
    const view = this.views.get(tile.id);
    if (view) return { x: view.position.x, y: view.position.y };
    const { x, y } = cellCenter(tile.row, tile.col);
    return { x, y };
  }

  /** Flash every tile — used on level-up and shop purchases. */
  pulseAll(color = '#ffe07a') {
    for (const view of this.views.values()) {
      this.effects.flashRing(view.position.x, view.position.y, {
        size: BOARD.cell * 1.1,
        color,
        duration: 320,
      });
    }
  }

  update(dt) {
    this.time += dt;
    for (const view of this.views.values()) view.update(dt, this.time);
  }
}
