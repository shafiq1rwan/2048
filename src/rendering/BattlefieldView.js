import * as THREE from 'three';
import { SpriteEntity, UNIT_PLANE } from './SpriteAnimator.js';
import { skyTexture, hillsTexture, shadowTexture, glowTexture } from './Textures.js';
import { SCENE, RENDER_LAYER, TIME, DESIGN } from '../core/config.js';
import { Ease, rand } from '../core/Tween.js';

/** Where each piece of scenery stands. x is mirrored for |x| > design edge. */
const DECOR = [
  { key: 'tower', x: -232, y: 249, height: 112, sheet: null, order: RENDER_LAYER.decorBack },
  { key: 'house', x: 214, y: 247, height: 78, order: RENDER_LAYER.decorBack },
  { key: 'tree', x: -318, y: 236, height: 138, animated: true, order: RENDER_LAYER.decorBack },
  { key: 'tree_alt', x: 322, y: 233, height: 132, animated: true, order: RENDER_LAYER.decorBack },
  { key: 'tree', x: -228, y: 196, height: 152, animated: true, order: RENDER_LAYER.decorFront },
  { key: 'tree_alt', x: 236, y: 191, height: 146, animated: true, order: RENDER_LAYER.decorFront },
  { key: 'bush', x: -150, y: 172, height: 40, animated: true, order: RENDER_LAYER.decorFront },
  { key: 'bush', x: 158, y: 166, height: 38, animated: true, order: RENDER_LAYER.decorFront },
  { key: 'deco_sign', x: -196, y: 150, height: 62, order: RENDER_LAYER.decorFront },
  { key: 'deco_skull_sign', x: 200, y: 146, height: 66, order: RENDER_LAYER.decorFront },
  { key: 'rock_a', x: -112, y: 228, height: 22, order: RENDER_LAYER.decorBack },
  { key: 'rock_b', x: 122, y: 232, height: 20, order: RENDER_LAYER.decorBack },
  { key: 'deco_stone', x: -412, y: 202, height: 26, order: RENDER_LAYER.decorBack },
  { key: 'deco_mushroom', x: 398, y: 174, height: 26, order: RENDER_LAYER.decorFront },
  { key: 'deco_bush', x: -390, y: 158, height: 34, order: RENDER_LAYER.decorFront },
  { key: 'deco_grass', x: -262, y: 146, height: 24, order: RENDER_LAYER.decorFront },
  { key: 'deco_grass', x: 276, y: 142, height: 24, order: RENDER_LAYER.decorFront },
  { key: 'deco_grass', x: -76, y: 250, height: 18, order: RENDER_LAYER.decorBack },
  { key: 'deco_mushroom', x: 84, y: 252, height: 20, order: RENDER_LAYER.decorBack },
];

/** Static (non-sheet) decorations still need a content box to size against. */
const DECOR_BOX = {
  tower: { frameW: 128, frameH: 256, charH: 183, footY: 234, centerX: 63 },
  house: { frameW: 128, frameH: 192, charH: 148, footY: 171, centerX: 63 },
  deco_sign: { frameW: 64, frameH: 128, charH: 90, footY: 104, centerX: 31 },
  deco_skull_sign: { frameW: 64, frameH: 128, charH: 101, footY: 103, centerX: 32 },
  rock_a: { frameW: 64, frameH: 64, charH: 30, footY: 52, centerX: 32 },
  rock_b: { frameW: 64, frameH: 64, charH: 29, footY: 51, centerX: 33 },
  deco_stone: { frameW: 64, frameH: 64, charH: 34, footY: 48, centerX: 33 },
  deco_mushroom: { frameW: 64, frameH: 64, charH: 37, footY: 48, centerX: 32 },
  deco_bush: { frameW: 64, frameH: 64, charH: 42, footY: 52, centerX: 32 },
  deco_grass: { frameW: 64, frameH: 64, charH: 35, footY: 49, centerX: 35 },
};

/** Animated decoration sheets (wind sway), probed from the real files. */
const DECOR_SHEETS = {
  tree: { frameW: 192, frameH: 256, cols: 8, rows: 1, row: 0, frames: 8, fps: 6, footY: 240, charH: 190, centerX: 96 },
  tree_alt: { frameW: 192, frameH: 256, cols: 8, rows: 1, row: 0, frames: 8, fps: 5, footY: 240, charH: 190, centerX: 96 },
  bush: { frameW: 128, frameH: 128, cols: 8, rows: 1, row: 0, frames: 8, fps: 6, footY: 78, charH: 46, centerX: 64 },
};

/**
 * The battlefield: sky, hills, grass, scenery, clouds, and the single
 * enemy that stands above the board — including all of its reactions.
 */
export class BattlefieldView {
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

    /** @type {SpriteEntity|null} */
    this.enemySprite = null;
    this.enemyShadow = null;
    this.enemyGlow = null;
    /** Offset applied on top of the enemy's resting position. */
    this.enemyOffset = { x: 0, y: 0 };
    this.enemyBob = 0;
    this.enemyBusy = false;
    this.animatedDecor = [];
    this.clouds = [];
    this.time = 0;
    /** Set by Game so entrance impacts can rattle the camera. */
    this.onShake = null;

    this.buildSky();
    this.buildGround();
    this.buildClouds();
    this.buildDecor();
  }

  // ---------------------------------------------------------------- //
  // environment
  // ---------------------------------------------------------------- //

  buildSky() {
    const height = 780;
    const material = new THREE.MeshBasicMaterial({
      map: skyTexture(),
      depthTest: false,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(UNIT_PLANE, material);
    this.sky.renderOrder = RENDER_LAYER.sky;
    this.sky.scale.set(4200, height, 1);
    // Bottom edge of the gradient meets the horizon; above it the clear
    // colour continues the topmost gradient stop seamlessly.
    this.sky.position.set(0, SCENE.groundY - 50 + height / 2, -20);
    this.root.add(this.sky);

    const hills = (color, y, h, order) => {
      const mesh = new THREE.Mesh(
        UNIT_PLANE,
        new THREE.MeshBasicMaterial({
          map: hillsTexture({ color }),
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      mesh.renderOrder = order;
      mesh.scale.set(4200, h, 1);
      mesh.position.set(0, y + h / 2, -18);
      this.root.add(mesh);
      return mesh;
    };
    hills('#87b98a', SCENE.groundY - 6, 116, RENDER_LAYER.sky + 1);
    hills('#6fa863', SCENE.groundY - 22, 92, RENDER_LAYER.sky + 2);
  }

  buildGround() {
    // Pull the fully opaque interior tile out of the terrain tilemap.
    const texture = this.assets.extractTile('ground_tiles', 64, 64, 64, 64, { x: 1, y: 1 });
    this.groundTexture = texture;
    this.groundMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
    });
    this.ground = new THREE.Mesh(UNIT_PLANE, this.groundMaterial);
    this.ground.renderOrder = RENDER_LAYER.ground;
    this.root.add(this.ground);

    // Soft darkening towards the bottom so the board reads clearly.
    const vignette = new THREE.Mesh(
      UNIT_PLANE,
      new THREE.MeshBasicMaterial({
        map: glowTexture({ color: '#0b1020', power: 1.4 }),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        opacity: 0.5,
      }),
    );
    vignette.renderOrder = RENDER_LAYER.ground + 1;
    vignette.scale.set(1500, 1200, 1);
    vignette.position.set(0, -420, 0);
    this.root.add(vignette);

    this.resizeGround(DESIGN.width, DESIGN.height);
  }

  /** Keep the grass covering the viewport and tiling on 64px boundaries. */
  resizeGround(halfW, halfH) {
    const width = Math.max(DESIGN.width, halfW * 2) + 400;
    const top = SCENE.groundY;
    const bottom = Math.min(-DESIGN.height / 2, -halfH) - 200;
    const height = top - bottom;
    this.ground.scale.set(width, height, 1);
    this.ground.position.set(0, bottom + height / 2, -16);
    this.groundTexture.repeat.set(width / 64, height / 64);
    this.groundTexture.needsUpdate = true;
  }

  buildClouds() {
    const defs = [
      { key: 'cloud_a', y: 452, width: 330, speed: 7, x: -260 },
      { key: 'cloud_b', y: 388, width: 250, speed: 11, x: 120 },
      { key: 'cloud_c', y: 508, width: 290, speed: 5, x: 380 },
    ];
    for (const def of defs) {
      const material = new THREE.MeshBasicMaterial({
        map: this.assets.get(def.key),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(UNIT_PLANE, material);
      mesh.renderOrder = RENDER_LAYER.clouds;
      // source frames are 576x256
      mesh.scale.set(def.width, def.width * (256 / 576), 1);
      mesh.position.set(def.x, def.y, -19);
      this.root.add(mesh);
      this.clouds.push({ mesh, speed: def.speed });
    }
  }

  buildDecor() {
    for (const def of DECOR) {
      const sheetBase = def.animated ? DECOR_SHEETS[def.key] : DECOR_BOX[def.key];
      if (!sheetBase) continue;
      const sheet = def.animated
        ? sheetBase
        : { ...sheetBase, cols: 1, rows: 1, row: 0, frames: 1, fps: 1 };

      const entity = new SpriteEntity({
        texture: this.assets.clone(def.key),
        sheet,
        charHeight: def.height,
        renderOrder: def.order,
        flash: false,
      });
      entity.position.set(def.x, def.y, -10);
      if (def.animated) entity.animator.randomiseFrame();
      // Mirror a few so repeated art does not read as copy-paste.
      if (def.x > 0 && Math.random() < 0.6) entity.setFlip(true);
      this.root.add(entity);
      if (def.animated) this.animatedDecor.push(entity);
    }
  }

  // ---------------------------------------------------------------- //
  // enemy
  // ---------------------------------------------------------------- //

  /** Body-centre anchor that merge bolts should fly towards. */
  enemyAnchor() {
    const height = this.enemyHeight ?? SCENE.enemyHeight;
    return {
      x: (this.enemySprite?.position.x ?? 0),
      y: (this.enemySprite?.position.y ?? SCENE.enemyFeetY) + height * 0.5,
    };
  }

  /** Where the enemy's feet rest, ignoring transient offsets. */
  get enemyBaseY() {
    return SCENE.enemyFeetY;
  }

  clearEnemy() {
    this.cancelHitReact();
    this.enemyBusy = false;
    this.enemyOffset.x = 0;
    this.enemyOffset.y = 0;
    this.enemySprite?.dispose();
    this.enemySprite = null;
    this.enemyShadow?.removeFromParent();
    this.enemyShadow = null;
    this.enemyGlow?.removeFromParent();
    this.enemyGlow = null;
  }

  /**
   * Build and animate in a new enemy.
   * @param {import('../combat/Enemy.js').Enemy} enemy
   * @returns {Promise<boolean>}
   */
  async spawnEnemy(enemy) {
    this.clearEnemy();

    const baseHeight = enemy.isBoss ? SCENE.bossHeight : SCENE.enemyHeight;
    this.enemyHeight = baseHeight * enemy.heightMul;

    const sprite = new SpriteEntity({
      texture: this.assets.clone(enemy.sheet.image),
      sheet: enemy.sheet,
      charHeight: this.enemyHeight,
      renderOrder: RENDER_LAYER.enemy,
    });
    sprite.position.set(0, SCENE.enemyFeetY, 0);
    sprite.animator.randomiseFrame();
    this.root.add(sprite);
    this.enemySprite = sprite;

    // contact shadow
    const shadow = new THREE.Mesh(
      UNIT_PLANE,
      new THREE.MeshBasicMaterial({
        map: shadowTexture(),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        opacity: 0.75,
      }),
    );
    shadow.renderOrder = RENDER_LAYER.enemy - 1;
    const shadowW = this.enemyHeight * 1.0;
    shadow.scale.set(shadowW, shadowW * 0.34, 1);
    shadow.position.set(0, SCENE.enemyFeetY + 3, -1);
    this.root.add(shadow);
    this.enemyShadow = shadow;

    if (enemy.isBoss) {
      const glow = new THREE.Mesh(
        UNIT_PLANE,
        new THREE.MeshBasicMaterial({
          map: glowTexture({ color: '#ff6a4a', power: 2.6 }),
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.4,
        }),
      );
      glow.renderOrder = RENDER_LAYER.enemy - 2;
      const size = this.enemyHeight * 2.4;
      glow.scale.set(size, size, 1);
      glow.position.set(0, SCENE.enemyFeetY + this.enemyHeight * 0.5, -2);
      this.root.add(glow);
      this.enemyGlow = glow;
    }

    return enemy.isBoss ? this.bossEntrance() : this.normalEntrance();
  }

  /**
   * Walks in from the right and settles.
   *
   * Entrances drive `enemyOffset`, never `sprite.position` directly —
   * update() owns the final transform.
   */
  normalEntrance() {
    const sprite = this.enemySprite;
    const fromX = 300;
    this.enemyBusy = true;
    this.enemyOffset.x = fromX;
    sprite.setOpacity(0);
    if (this.enemyShadow) this.enemyShadow.material.opacity = 0;

    return new Promise((resolve) => {
      this.tweens.add({
        duration: TIME.enemySpawn,
        ease: Ease.outCubic,
        onUpdate: (v) => {
          if (!this.enemySprite) return;
          this.enemyOffset.x = fromX * (1 - v);
          sprite.setOpacity(Math.min(1, v * 2));
          if (this.enemyShadow) this.enemyShadow.material.opacity = 0.75 * Math.min(1, v * 2);
          // little running bounce
          this.enemyOffset.y = Math.abs(Math.sin(v * Math.PI * 4)) * 9 * (1 - v);
        },
        onComplete: () => {
          this.enemyOffset.x = 0;
          this.enemyOffset.y = 0;
          this.enemyBusy = false;
          this.effects.dust(0, SCENE.enemyFeetY + 4, { size: 70 });
          resolve(true);
        },
        onCancel: () => resolve(false),
      });
    });
  }

  /** Slams down from above with dust and a shake. */
  bossEntrance() {
    const sprite = this.enemySprite;
    const dropFrom = 420;
    this.enemyBusy = true;
    this.enemyOffset.y = dropFrom;
    sprite.setOpacity(1);
    if (this.enemyShadow) this.enemyShadow.material.opacity = 0;

    return new Promise((resolve) => {
      this.tweens.add({
        duration: TIME.bossSpawn * 0.62,
        ease: Ease.inCubic,
        onUpdate: (v) => {
          if (!this.enemySprite) return;
          this.enemyOffset.y = dropFrom * (1 - v);
          sprite.setSquash(1 - 0.12 * v, 1 + 0.2 * v);
          if (this.enemyShadow) this.enemyShadow.material.opacity = 0.75 * v;
        },
        onComplete: () => {
          if (!this.enemySprite) {
            this.enemyBusy = false;
            return resolve(true);
          }
          this.enemyOffset.y = 0;
          this.onShake?.(22, 7);
          this.effects.dust(0, SCENE.enemyFeetY + 6, { size: 190, big: true });
          this.effects.sparks(0, SCENE.enemyFeetY + 10, {
            count: 16,
            color: '#e8dcc0',
            speed: 300,
            size: 14,
            life: 0.5,
            spread: Math.PI,
            angle: 0,
          });
          this.effects.flashRing(0, SCENE.enemyFeetY + 20, { size: 380, color: '#ffd0a0', duration: 320 });
          // land squash then settle
          this.tweens.add({
            duration: 110,
            onUpdate: (v) => sprite.setSquash(1 + 0.3 * (1 - v), 1 - 0.28 * (1 - v)),
            onComplete: () => {
              this.tweens.add({
                duration: 240,
                ease: Ease.outElastic,
                onUpdate: (v) => sprite.setSquash(1 + 0.12 * (1 - v), 1 - 0.1 * (1 - v)),
                onComplete: () => {
                  sprite.setSquash(1, 1);
                  this.enemyBusy = false;
                  resolve(true);
                },
                onCancel: () => resolve(false),
              });
            },
          });
        },
      });
    });
  }

  /** Cancel a recoil that is still running, so it cannot reset a pose. */
  cancelHitReact() {
    this.hitTween?.cancel();
    this.hitTween = null;
  }

  /** Recoil + white flash when a merge connects. */
  hitReact({ crit = false, lethal = false } = {}) {
    const sprite = this.enemySprite;
    if (!sprite) return;

    this.cancelHitReact();
    const push = crit ? 26 : 15;
    this.hitTween = this.tweens.add({
      duration: TIME.enemyReact,
      ease: Ease.outQuad,
      onUpdate: (v) => {
        if (!this.enemySprite) return;
        const decay = 1 - v;
        this.enemyOffset.x = Math.sin(v * Math.PI * 3) * push * decay;
        this.enemyOffset.y = Math.sin(v * Math.PI) * push * 0.5;
        sprite.setSquash(1 + 0.18 * decay, 1 - 0.16 * decay);
        sprite.setFlash((crit ? 0.95 : 0.7) * Math.pow(decay, 1.5));
        const tint = 1 - 0.35 * decay;
        sprite.setTint(1, tint, tint);
      },
      onComplete: () => {
        this.hitTween = null;
        if (!this.enemySprite) return;
        this.enemyOffset.x = 0;
        this.enemyOffset.y = 0;
        sprite.setSquash(1, 1);
        sprite.setFlash(0);
        sprite.setTint(1, 1, 1);
      },
    });

    if (!lethal) {
      this.effects.dust(
        this.enemySprite.position.x,
        SCENE.enemyFeetY + 4,
        { size: crit ? 96 : 72 },
      );
    }
  }

  /** Wind up, then lunge towards the player's board. */
  async attackAnimation() {
    const sprite = this.enemySprite;
    if (!sprite) return;
    this.cancelHitReact();
    sprite.setFlash(0);
    sprite.setTint(1, 1, 1);
    this.enemyOffset.x = 0;
    this.enemyBusy = true;

    await new Promise((resolve) => {
      this.tweens.add({
        duration: TIME.enemyAttackWindup,
        ease: Ease.outQuad,
        onUpdate: (v) => {
          if (!this.enemySprite) return;
          this.enemyOffset.y = 26 * v;
          sprite.setSquash(1 - 0.1 * v, 1 + 0.14 * v);
        },
        onComplete: resolve,
        onCancel: resolve,
      });
    });

    if (!this.enemySprite) {
      this.enemyBusy = false;
      return;
    }

    await new Promise((resolve) => {
      this.tweens.add({
        duration: TIME.enemyAttackStrike,
        ease: Ease.outCubic,
        onUpdate: (v) => {
          if (!this.enemySprite) return;
          const swing = Math.sin(v * Math.PI);
          this.enemyOffset.y = 26 - 74 * swing;
          sprite.setSquash(1 + 0.2 * swing, 1 - 0.18 * swing);
        },
        onComplete: () => {
          if (this.enemySprite) {
            this.enemyOffset.y = 0;
            sprite.setSquash(1, 1);
          }
          this.enemyBusy = false;
          resolve();
        },
        onCancel: resolve,
      });
    });
  }

  /** Death: flash out, topple, explode. */
  async die({ boss = false } = {}) {
    const sprite = this.enemySprite;
    if (!sprite) return;
    // A recoil still in flight would reset flash/squash mid-death.
    this.cancelHitReact();
    this.enemyBusy = true;
    const x = sprite.position.x;
    const y = SCENE.enemyFeetY;

    this.effects.deathExplosion(x, y + (this.enemyHeight ?? 120) * 0.45, {
      size: boss ? 300 : 190,
      boss,
    });

    await new Promise((resolve) => {
      this.tweens.add({
        duration: boss ? TIME.enemyDeath * 1.3 : TIME.enemyDeath,
        ease: Ease.outQuad,
        onUpdate: (v) => {
          if (!this.enemySprite) return;
          sprite.setFlash(Math.max(0, 1 - v * 1.4));
          sprite.setOpacity(1 - v);
          sprite.setSquash(1 + 0.5 * v, Math.max(0.05, 1 - 0.85 * v));
          this.enemyOffset.y = -8 * v;
          if (this.enemyShadow) this.enemyShadow.material.opacity = 0.75 * (1 - v);
          if (this.enemyGlow) this.enemyGlow.material.opacity = 0.4 * (1 - v);
        },
        onComplete: () => {
          this.clearEnemy();
          resolve();
        },
        onCancel: resolve,
      });
    });
  }

  // ---------------------------------------------------------------- //

  update(dt) {
    this.time += dt;

    for (const decor of this.animatedDecor) decor.update(dt);

    for (const cloud of this.clouds) {
      cloud.mesh.position.x += cloud.speed * dt;
      const limit = 900;
      if (cloud.mesh.position.x > limit) cloud.mesh.position.x = -limit;
    }

    const sprite = this.enemySprite;
    if (sprite) {
      sprite.update(dt);
      if (!this.enemyBusy) {
        this.enemyBob = Math.sin(this.time * 1.9) * 4;
      }
      sprite.position.y =
        SCENE.enemyFeetY + this.enemyOffset.y + (this.enemyBusy ? 0 : this.enemyBob);
      sprite.position.x = this.enemyOffset.x;
      if (this.enemyShadow) {
        this.enemyShadow.position.x = sprite.position.x;
        const lift = Math.max(0, sprite.position.y - SCENE.enemyFeetY);
        const shrink = 1 - Math.min(0.4, lift / 400);
        const w = (this.enemyHeight ?? 120) * shrink;
        this.enemyShadow.scale.set(w, w * 0.34, 1);
      }
      if (this.enemyGlow) {
        this.enemyGlow.position.x = sprite.position.x;
        this.enemyGlow.material.opacity = 0.32 + Math.sin(this.time * 3.4) * 0.1;
      }
    }
  }

  resize(visible) {
    this.resizeGround(visible.halfW, visible.halfH);
  }
}
