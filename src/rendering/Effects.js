import * as THREE from 'three';
import { EffectSprite, UNIT_PLANE } from './SpriteAnimator.js';
import { glowTexture, orbTexture, textTexture, starsTexture } from './Textures.js';
import { RENDER_LAYER, TIME } from '../core/config.js';
import { Ease, rand } from '../core/Tween.js';

/** Tiny Swords effect sheets, geometry probed from the real files. */
const FX_SHEETS = {
  explosion: {
    image: 'fx_explosion',
    frameW: 192, frameH: 192, cols: 10, rows: 1, row: 0, frames: 10, fps: 24,
  },
  burst: {
    image: 'fx_burst',
    frameW: 192, frameH: 192, cols: 8, rows: 1, row: 0, frames: 8, fps: 26,
  },
  impact: {
    image: 'fx_impact',
    frameW: 192, frameH: 192, cols: 9, rows: 1, row: 0, frames: 9, fps: 24,
  },
  dust: {
    image: 'fx_dust',
    frameW: 64, frameH: 64, cols: 8, rows: 1, row: 0, frames: 8, fps: 22,
  },
  dustBig: {
    image: 'fx_dust_big',
    frameW: 64, frameH: 64, cols: 10, rows: 1, row: 0, frames: 10, fps: 22,
  },
};

/**
 * Everything short-lived and decorative: Tiny Swords effect sheets,
 * floating damage numbers, energy bolts, sparks and gold pops.
 *
 * Owns its own update list so Game only has to call `update(dt)`.
 */
export class Effects {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./AssetManager.js').AssetManager} assets
   * @param {import('../core/Tween.js').Tweens} tweens
   */
  constructor(scene, assets, tweens) {
    this.scene = scene;
    this.assets = assets;
    this.tweens = tweens;

    this.root = new THREE.Group();
    this.root.position.z = 6;
    scene.add(this.root);

    /** @type {EffectSprite[]} */
    this.sprites = [];
    /** @type {Array<{mesh:THREE.Mesh, vx:number, vy:number, life:number, maxLife:number, gravity:number, spin:number}>} */
    this.particles = [];
    /** @type {THREE.Mesh[]} */
    this.transient = [];
    /** Dropped coins in flight towards the HUD purse. */
    this.coins = [];
    /** Resolvers for in-flight goldBurst promises, settled by clear(). */
    this.coinCancels = [];

    this.glowMaterials = new Map();
    /** World half-extents currently on screen, kept fresh by resize(). */
    this.viewport = { halfW: 400, halfH: 700 };
  }

  resize(visible) {
    this.viewport = { halfW: visible.halfW, halfH: visible.halfH };
  }

  /**
   * Tint the whole screen for a beat — red when the player is hit,
   * gold on a level-up.
   */
  screenFlash({ color = '#ff5a4a', opacity = 0.34, duration = 260 } = {}) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity,
    });
    const mesh = new THREE.Mesh(UNIT_PLANE, material);
    mesh.userData.ownMaterial = true;
    mesh.renderOrder = RENDER_LAYER.damage - 1;
    mesh.scale.set(this.viewport.halfW * 2.4, this.viewport.halfH * 2.4, 1);
    mesh.position.set(0, 0, 0);
    this.addTransient(mesh, duration, { fadeFrom: opacity, ease: Ease.outQuad });
    return mesh;
  }

  // ---------------------------------------------------------------- //
  // internals
  // ---------------------------------------------------------------- //

  glowMaterial(color, additive = true) {
    const key = `${color}:${additive}`;
    let material = this.glowMaterials.get(key);
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        map: glowTexture({ color }),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.glowMaterials.set(key, material);
    }
    return material;
  }

  /** A quad that fades out and removes itself. */
  addTransient(mesh, duration, { fadeFrom = 1, ease = Ease.outQuad, onUpdate, order } = {}) {
    mesh.renderOrder = order ?? (mesh.renderOrder || RENDER_LAYER.effect);
    this.root.add(mesh);
    this.transient.push(mesh);
    this.tweens.add({
      duration,
      ease,
      onUpdate: (v) => {
        mesh.material.opacity = fadeFrom * (1 - v);
        onUpdate?.(v, mesh);
      },
      onComplete: () => this.removeTransient(mesh),
    });
    return mesh;
  }

  removeTransient(mesh) {
    const index = this.transient.indexOf(mesh);
    if (index >= 0) this.transient.splice(index, 1);
    mesh.removeFromParent();
    // Canvas textures are memoised and shared; only per-mesh materials
    // (flagged with ownMaterial) belong to us to dispose.
    if (mesh.userData.ownMaterial) mesh.material.dispose();
  }

  // ---------------------------------------------------------------- //
  // Tiny Swords effect sheets
  // ---------------------------------------------------------------- //

  /**
   * Play a one-shot effect sheet.
   * @param {keyof typeof FX_SHEETS} name
   */
  playSheet(name, x, y, { size = 120, additive = false, fps, rotation = 0, order } = {}) {
    const sheet = FX_SHEETS[name];
    if (!sheet) return null;
    const sprite = new EffectSprite({
      texture: this.assets.clone(sheet.image),
      sheet,
      size,
      fps,
      additive,
      renderOrder: order ?? RENDER_LAYER.effect,
    });
    sprite.position.set(x, y, 0);
    sprite.rotation.z = rotation;
    this.root.add(sprite);
    this.sprites.push(sprite);
    return sprite;
  }

  /** Big golden burst — used when a merge lands on the enemy. */
  hitBurst(x, y, { size = 150 } = {}) {
    this.playSheet('impact', x, y, { size, additive: false });
    this.flashRing(x, y, { size: size * 1.5, color: '#fff2c0', duration: 190 });
    this.sparks(x, y, { count: 9, color: '#ffe08a', speed: 240, size: 13 });
  }

  /** Merge pop on the board. */
  mergePop(x, y, { size = 130, color = '#ffe6a0' } = {}) {
    this.playSheet('burst', x, y, { size, additive: true });
    this.flashRing(x, y, { size: size * 1.1, color, duration: 170 });
    this.sparks(x, y, { count: 8, color, speed: 190, size: 11, life: 0.42 });
  }

  /** Enemy death: layered explosions plus a shower of dust. */
  deathExplosion(x, y, { size = 190, boss = false } = {}) {
    this.playSheet('explosion', x, y, { size });
    if (boss) {
      this.tweens.after(110, () => this.playSheet('explosion', x - size * 0.3, y + size * 0.12, { size: size * 0.8 }));
      this.tweens.after(220, () => this.playSheet('explosion', x + size * 0.32, y - size * 0.05, { size: size * 0.85 }));
    }
    this.playSheet('dustBig', x, y - size * 0.28, { size: size * 0.9 });
    this.sparks(x, y, { count: boss ? 26 : 16, color: '#ffd45e', speed: 330, size: 15, life: 0.7 });
    this.flashRing(x, y, { size: size * 2.1, color: '#fff6d8', duration: 300 });
  }

  /** Puff of dust where a tile lands or a foot stomps. */
  dust(x, y, { size = 64, big = false } = {}) {
    this.playSheet(big ? 'dustBig' : 'dust', x, y, { size });
  }

  // ---------------------------------------------------------------- //
  // procedural juice
  // ---------------------------------------------------------------- //

  /** Expanding, fading ring of light. */
  flashRing(x, y, { size = 140, color = '#ffffff', duration = 200 } = {}) {
    const mesh = new THREE.Mesh(UNIT_PLANE, this.glowMaterial(color).clone());
    mesh.userData.ownMaterial = true;
    mesh.position.set(x, y, 0);
    mesh.scale.set(size * 0.35, size * 0.35, 1);
    this.addTransient(mesh, duration, {
      fadeFrom: 0.95,
      ease: Ease.outQuad,
      onUpdate: (v) => {
        const s = size * (0.35 + 0.85 * v);
        mesh.scale.set(s, s, 1);
      },
    });
    return mesh;
  }

  /** Steady glow that pulses once (aura hits, level-up). */
  glowPulse(x, y, { size = 200, color = '#ffd45e', duration = 420 } = {}) {
    const mesh = new THREE.Mesh(UNIT_PLANE, this.glowMaterial(color).clone());
    mesh.userData.ownMaterial = true;
    mesh.position.set(x, y, 0);
    this.addTransient(mesh, duration, {
      fadeFrom: 0.8,
      ease: Ease.linear,
      onUpdate: (v) => {
        const s = size * (0.5 + Ease.outQuad(Math.min(1, v * 1.6)) * 0.7);
        mesh.scale.set(s, s, 1);
      },
    });
    return mesh;
  }

  /** Radial shower of little glowing squares. */
  sparks(x, y, { count = 10, color = '#ffe08a', speed = 220, size = 12, life = 0.5, spread = Math.PI * 2, angle = 0, gravity = -520 } = {}) {
    const material = this.glowMaterial(color);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(UNIT_PLANE, material);
      mesh.renderOrder = RENDER_LAYER.effect;
      mesh.position.set(x, y, 0);
      const s = size * rand(0.6, 1.3);
      mesh.scale.set(s, s, 1);
      this.root.add(mesh);
      const dir = angle + (spread >= Math.PI * 2 ? rand(0, Math.PI * 2) : rand(-spread / 2, spread / 2));
      const v = speed * rand(0.55, 1.25);
      this.particles.push({
        mesh,
        vx: Math.cos(dir) * v,
        vy: Math.sin(dir) * v,
        life: life * rand(0.7, 1.2),
        maxLife: life,
        gravity,
        baseScale: s,
      });
    }
  }

  /**
   * An energy bolt that travels from a merged tile to the enemy.
   * @returns {Promise<void>} resolves when it lands
   */
  bolt(from, to, { color = '#ffe08a', duration = TIME.projectile, width = 26 } = {}) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);

    const mesh = new THREE.Mesh(UNIT_PLANE, this.glowMaterial(color).clone());
    mesh.userData.ownMaterial = true;
    mesh.renderOrder = RENDER_LAYER.effect;
    mesh.rotation.z = angle;
    mesh.position.set(from.x, from.y, 0);
    this.root.add(mesh);
    this.transient.push(mesh);

    // Trail sparks left along the flight path.
    let trailTimer = 0;

    return new Promise((resolve) => {
      this.tweens.add({
        duration,
        ease: Ease.inQuad,
        onUpdate: (v, raw) => {
          mesh.position.x = from.x + dx * v;
          mesh.position.y = from.y + dy * v;
          const stretch = 1.6 + 2.4 * Math.sin(Math.min(1, raw * 1.4) * Math.PI * 0.5);
          mesh.scale.set(width * stretch, width * (1.05 - 0.25 * raw), 1);
          mesh.material.opacity = 0.5 + 0.5 * Math.sin(raw * Math.PI);

          trailTimer += 1;
          if (trailTimer % 3 === 0) {
            this.sparks(mesh.position.x, mesh.position.y, {
              count: 1,
              color,
              speed: 60,
              size: 8,
              life: 0.22,
              gravity: -120,
            });
          }
        },
        onComplete: () => {
          this.removeTransient(mesh);
          resolve();
        },
        onCancel: () => {
          this.removeTransient(mesh);
          resolve();
        },
      });
    });
  }

  /**
   * Floating damage number.
   * @param {'enemy'|'player'|'heal'|'gold'|'xp'} kind
   */
  damageNumber(x, y, value, { kind = 'enemy', crit = false, prefix = '', big = false } = {}) {
    const styles = {
      enemy: { color: crit ? '#fff2a0' : '#ffffff', glow: crit ? '#ffb020' : null, size: crit ? 92 : 68 },
      player: { color: '#ff9a8a', glow: null, size: 66 },
      heal: { color: '#a8f08a', glow: null, size: 62 },
      gold: { color: '#ffd45e', glow: null, size: 58 },
      xp: { color: '#a8e6ff', glow: null, size: 56 },
      combo: { color: '#ffd45e', glow: '#ff8c20', size: 60 },
      freeze: { color: '#bfeaff', glow: '#58a8e0', size: 56 },
    };
    const style = { ...(styles[kind] ?? styles.enemy) };
    if (big) {
      style.size = Math.round(style.size * 1.9);
      style.glow = style.glow ?? '#ff4030';
    }
    const label = `${prefix}${value}`;
    const { texture, aspect } = textTexture(label, {
      fontSize: style.size,
      color: style.color,
      outline: '#191d31',
      outlineWidth: Math.round(style.size * 0.14),
      glow: style.glow,
    });

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(UNIT_PLANE, material);
    mesh.userData.ownMaterial = true;
    mesh.renderOrder = RENDER_LAYER.damage;

    const height = style.size * 0.72;
    const baseW = height * aspect;
    mesh.position.set(x + rand(-9, 9), y, 0);
    this.root.add(mesh);
    this.transient.push(mesh);

    // Big numbers sit over the board, so they drift up out of the tiles
    // instead of sinking into them, and hang around a little longer.
    const rise = big ? 44 : kind === 'player' ? -54 : 108;
    const startY = mesh.position.y;

    this.tweens.add({
      duration: big ? TIME.damageNumber * 1.25 : TIME.damageNumber,
      ease: Ease.linear,
      onUpdate: (v) => {
        // punchy scale-in, slow drift, late fade
        const pop = v < 0.16 ? Ease.outBack(v / 0.16) : 1;
        const shrink = v > 0.72 ? 1 - (v - 0.72) / 0.28 * 0.25 : 1;
        mesh.scale.set(baseW * pop * shrink, height * pop * shrink, 1);
        mesh.position.y = startY + rise * Ease.outCubic(v);
        material.opacity = v > 0.62 ? 1 - (v - 0.62) / 0.38 : 1;
      },
      onComplete: () => this.removeTransient(mesh),
    });

    if (crit) this.flashRing(x, y + 20, { size: 150, color: '#ffcf5a', duration: 240 });
    return mesh;
  }

  /**
   * A lobbed projectile on a ballistic arc — the goblin bomb. Resolves
   * false if cancelled (restart) so callers can bail out.
   *
   * @param {{x:number,y:number}} from
   * @param {{x:number,y:number}} to
   * @returns {Promise<boolean>}
   */
  lob(from, to, { duration = 460, size = 34, arc = 130, color = '#5a5a6a' } = {}) {
    const material = new THREE.MeshBasicMaterial({
      map: orbTexture({ color }),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(UNIT_PLANE, material);
    mesh.userData.ownMaterial = true;
    mesh.renderOrder = RENDER_LAYER.effect;
    mesh.scale.set(size, size, 1);
    mesh.position.set(from.x, from.y, 0);
    this.root.add(mesh);
    this.transient.push(mesh);

    let trailTimer = 0;
    return new Promise((resolve) => {
      this.tweens.add({
        duration,
        ease: Ease.linear,
        onUpdate: (v, dtMs) => {
          mesh.position.x = from.x + (to.x - from.x) * v;
          mesh.position.y = from.y + (to.y - from.y) * v + arc * Math.sin(v * Math.PI);
          mesh.rotation.z -= (dtMs ?? 16) * 0.012;
          trailTimer += dtMs ?? 16;
          if (trailTimer > 55) {
            trailTimer = 0;
            this.sparks(mesh.position.x, mesh.position.y, {
              count: 1,
              color: '#ffb060',
              speed: 40,
              size: 8,
              life: 0.3,
            });
          }
        },
        onComplete: () => {
          this.removeTransient(mesh);
          resolve(true);
        },
        onCancel: () => {
          this.removeTransient(mesh);
          resolve(false);
        },
      });
    });
  }

  /** Shared material for dropped coins (Tiny Swords coin icon). */
  coinMaterial() {
    if (!this._coinMaterial) {
      this._coinMaterial = new THREE.MeshBasicMaterial({
        map: this.assets.get('icon_gold'),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
    }
    return this._coinMaterial;
  }

  /** Shared material for XP motes — additive so they read as light. */
  orbMaterial() {
    if (!this._orbMaterial) {
      this._orbMaterial = new THREE.MeshBasicMaterial({
        map: orbTexture({ color: '#8ae0ff' }),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    }
    return this._orbMaterial;
  }

  /**
   * Gold drop: coins burst out of the dying enemy, tumble under gravity
   * for a beat, then magnetise into the HUD purse one after another.
   *
   * @param {{x:number,y:number}} from world position of the kill
   * @param {{x:number,y:number}} to world position of the gold readout
   * @param {number} amount gold awarded — drives how many coins spawn
   * @param {{onCoin?:(index:number, total:number)=>void, onFirst?:()=>void}} [hooks]
   * @returns {Promise<boolean>} resolves once the last coin lands
   */
  goldBurst(from, to, amount, hooks = {}) {
    // Enough coins to feel like loot, capped so a boss payout stays readable.
    return this.lootBurst({
      from,
      to,
      amount,
      count: Math.max(4, Math.min(12, Math.round(amount / 6))),
      material: this.coinMaterial(),
      size: [23, 31],
      spin: true,
      landColor: '#ffd45e',
      hooks,
    });
  }

  /**
   * XP drop: glowing motes drift out of the kill and stream into the XP
   * bar. Same flight as the coins but lighter, slower and bluer, so the
   * two rewards read as separate channels rather than one mess.
   */
  xpBurst(from, to, amount, hooks = {}) {
    return this.lootBurst({
      from,
      to,
      amount,
      count: Math.max(3, Math.min(9, Math.round(amount / 7))),
      material: this.orbMaterial(),
      size: [30, 44],
      spin: false,
      pulse: true,
      gravity: -420,
      speed: [110, 220],
      landColor: '#8ae0ff',
      hooks,
    });
  }

  /**
   * The shared burst-then-magnetise flight used by gold and XP.
   *
   * @param {{from:{x:number,y:number}, to:{x:number,y:number}, amount:number,
   *          count:number, material:THREE.Material, size:[number,number],
   *          spin?:boolean, pulse?:boolean, gravity?:number,
   *          speed?:[number,number], landColor:string, hooks:object}} opts
   * @returns {Promise<boolean>} resolves once the last piece lands
   */
  lootBurst(opts) {
    const { from, to, amount, material, landColor, hooks = {} } = opts;
    if (amount <= 0) return Promise.resolve(true);

    const count = Math.max(1, opts.count);
    const [minSize, maxSize] = opts.size;
    const [minSpeed, maxSpeed] = opts.speed ?? [170, 330];
    const gravity = opts.gravity ?? -900;
    let landed = 0;
    let first = true;

    return new Promise((resolve) => {
      const settle = () => resolve(true);
      this.coinCancels.push(settle);
      const done = () => {
        const at = this.coinCancels.indexOf(settle);
        if (at >= 0) this.coinCancels.splice(at, 1);
        settle();
      };

      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(UNIT_PLANE, material);
        mesh.renderOrder = RENDER_LAYER.effect + 5;
        const size = rand(minSize, maxSize);
        mesh.scale.set(size, size, 1);
        mesh.position.set(from.x + rand(-16, 16), from.y + rand(-12, 12), 0);
        this.root.add(mesh);

        // fan upwards and outwards out of the corpse
        const angle = rand(Math.PI * 0.18, Math.PI * 0.82);
        const speed = rand(minSpeed, maxSpeed);

        this.coins.push({
          mesh,
          size,
          gravity,
          landColor,
          pulse: Boolean(opts.pulse),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          spin: opts.spin ? rand(-9, 9) : 0,
          age: 0,
          scatter: TIME.goldScatter / 1000 + rand(0, 0.09),
          delay: (i * TIME.goldStagger) / 1000,
          flyFor: TIME.goldFly / 1000 + rand(0, 0.1),
          t: 0,
          curve: rand(-80, 80),
          phase: 'scatter',
          to,
          onLand: () => {
            landed++;
            if (first) {
              first = false;
              hooks.onFirst?.();
            }
            hooks.onCoin?.(landed, count);
            if (landed >= count) done();
          },
        });
      }
    });
  }

  /** Physics + magnet flight for dropped loot (coins and XP motes). */
  updateCoins(dt) {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.age += dt;

      if (coin.phase === 'scatter') {
        coin.vy += coin.gravity * dt;
        coin.mesh.position.x += coin.vx * dt;
        coin.mesh.position.y += coin.vy * dt;
        coin.mesh.rotation.z += coin.spin * dt;

        if (coin.age >= coin.scatter + coin.delay) {
          coin.phase = 'fly';
          coin.t = 0;
          coin.start = { x: coin.mesh.position.x, y: coin.mesh.position.y };
          // unit normal to the flight path, for a slight arc
          const dx = coin.to.x - coin.start.x;
          const dy = coin.to.y - coin.start.y;
          const len = Math.hypot(dx, dy) || 1;
          coin.nx = -dy / len;
          coin.ny = dx / len;
        }
        continue;
      }

      coin.t = Math.min(1, coin.t + dt / coin.flyFor);
      // accelerating ease = the pull of a magnet rather than a glide
      const eased = coin.t * coin.t;
      const arc = Math.sin(coin.t * Math.PI) * coin.curve;
      coin.mesh.position.set(
        coin.start.x + (coin.to.x - coin.start.x) * eased + coin.nx * arc,
        coin.start.y + (coin.to.y - coin.start.y) * eased + coin.ny * arc,
        0,
      );
      coin.mesh.rotation.z += coin.spin * 1.7 * dt;
      let shrink = coin.size * (1 - 0.35 * coin.t);
      // XP motes breathe on the way in instead of tumbling
      if (coin.pulse) shrink *= 1 + Math.sin(coin.age * 17) * 0.14;
      coin.mesh.scale.set(shrink, shrink, 1);

      if (coin.t >= 1) {
        coin.mesh.removeFromParent();
        this.coins.splice(i, 1);
        this.flashRing(coin.to.x, coin.to.y, {
          size: 64,
          color: coin.landColor,
          duration: 190,
        });
        coin.onLand();
      }
    }
  }

  /** Floating icon + amount, used for gold and XP drops. */
  rewardPop(x, y, value, kind = 'gold') {
    this.damageNumber(x, y, value, { kind, prefix: '+' });
    const color = kind === 'gold' ? '#ffd45e' : '#a8e6ff';
    this.sparks(x, y, { count: 7, color, speed: 150, size: 10, life: 0.55, gravity: -260 });
  }

  /** Star pips flying up on a level-up. */
  levelUpFlare(x, y, count = 3) {
    const { texture, aspect } = starsTexture(Math.max(1, Math.min(5, count)), { color: '#ffe07a' });
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(UNIT_PLANE, material);
    mesh.userData.ownMaterial = true;
    mesh.renderOrder = RENDER_LAYER.damage;
    const height = 44;
    mesh.position.set(x, y, 0);
    mesh.scale.set(height * aspect, height, 1);
    this.root.add(mesh);
    this.transient.push(mesh);

    const startY = y;
    this.tweens.add({
      duration: 900,
      ease: Ease.outCubic,
      onUpdate: (v) => {
        mesh.position.y = startY + 90 * v;
        material.opacity = v > 0.6 ? 1 - (v - 0.6) / 0.4 : 1;
        const pop = v < 0.2 ? Ease.outBack(v / 0.2) : 1;
        mesh.scale.set(height * aspect * pop, height * pop, 1);
      },
      onComplete: () => this.removeTransient(mesh),
    });

    this.glowPulse(x, y, { size: 260, color: '#ffe07a', duration: 520 });
    this.sparks(x, y, { count: 18, color: '#ffe07a', speed: 260, size: 13, life: 0.75, gravity: -300 });
  }

  /** Confetti-ish celebration used on victory beats. */
  celebrate(x, y) {
    for (const color of ['#ffd45e', '#8ae0ff', '#b0f08a', '#ff9ad0']) {
      this.sparks(x + rand(-40, 40), y + rand(-20, 20), {
        count: 6,
        color,
        speed: 300,
        size: 12,
        life: 0.85,
        gravity: -420,
      });
    }
  }

  // ---------------------------------------------------------------- //

  update(dt) {
    // sheet-driven effects
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const sprite = this.sprites[i];
      sprite.update(dt);
      if (sprite.finished) {
        this.sprites.splice(i, 1);
        sprite.dispose();
      }
    }

    this.updateCoins(dt);

    // spark particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.removeFromParent();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      const t = Math.max(0, p.life / p.maxLife);
      const s = p.baseScale * (0.25 + 0.75 * t);
      p.mesh.scale.set(s, s, 1);
    }
  }

  /** Drop everything (used on restart). */
  clear() {
    for (const sprite of this.sprites.slice()) sprite.dispose();
    this.sprites.length = 0;
    for (const p of this.particles) p.mesh.removeFromParent();
    this.particles.length = 0;
    for (const coin of this.coins) coin.mesh.removeFromParent();
    this.coins.length = 0;
    // Settle any awaited goldBurst so its sequence can bail out cleanly.
    for (const settle of this.coinCancels.slice()) settle();
    this.coinCancels.length = 0;
    for (const mesh of this.transient.slice()) {
      mesh.removeFromParent();
      if (mesh.userData.ownMaterial) mesh.material.dispose();
    }
    this.transient.length = 0;
  }
}
