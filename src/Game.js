import { Board } from './board/Board.js';
import { Player } from './combat/Player.js';
import { CombatSystem } from './combat/CombatSystem.js';
import { EnemyManager } from './progression/EnemyManager.js';
import { UpgradeSystem } from './progression/UpgradeSystem.js';
import { ShopSystem } from './progression/ShopSystem.js';
import { Renderer } from './rendering/Renderer.js';
import { BoardView } from './rendering/BoardView.js';
import { BattlefieldView } from './rendering/BattlefieldView.js';
import { Effects } from './rendering/Effects.js';
import { InputManager } from './input/InputManager.js';
import { Tweens } from './core/Tween.js';
import { BOARD, TIME, SHAKE, DESIGN } from './core/config.js';
import { getUnit } from './data/units.js';

/**
 * Wires state, rendering and input together and owns the turn sequence.
 *
 * Gameplay state lives in board/, combat/ and progression/; drawing
 * lives in rendering/; this class is the only place that knows the order
 * in which things happen.
 */
export class Game {
  /**
   * @param {{canvas: HTMLCanvasElement,
   *          assets: import('./rendering/AssetManager.js').AssetManager,
   *          save: import('./core/SaveManager.js').SaveManager,
   *          sound: import('./audio/SoundManager.js').SoundManager,
   *          ui: import('./ui/UIManager.js').UIManager}} deps
   */
  constructor({ canvas, assets, save, sound, ui }) {
    this.assets = assets;
    this.save = save;
    this.sound = sound;
    this.ui = ui;

    // --- state -----------------------------------------------------
    this.board = new Board();
    this.player = new Player();
    this.enemies = new EnemyManager();
    this.combat = new CombatSystem(this.player, this.enemies);
    this.upgrades = new UpgradeSystem(this.player);
    this.shop = new ShopSystem(this.player);

    this.score = 0;
    this.stats = { enemies: 0, bosses: 0, highestUnit: 0, goldEarned: 0, turns: 0 };
    /** 'title' | 'idle' | 'busy' | 'over' */
    this.state = 'title';
    /** Bumped on every restart so in-flight sequences can bail out. */
    this.runToken = 0;

    // --- rendering -------------------------------------------------
    this.tweens = new Tweens();
    this.renderer = new Renderer(canvas);
    this.effects = new Effects(this.renderer.scene, assets, this.tweens);
    this.battlefield = new BattlefieldView(this.renderer.scene, assets, this.tweens, this.effects);
    this.boardView = new BoardView(this.renderer.scene, assets, this.tweens, this.effects);
    this.battlefield.onShake = (amount, decay) => this.renderer.shake.add(amount, decay);

    this.renderer.onResize((rect) => {
      this.ui.applyStageRect(rect);
      this.battlefield.resize(this.renderer.visible);
      this.effects.resize(this.renderer.visible);
    });

    // --- input -----------------------------------------------------
    this.input = new InputManager({
      onMove: (dir) => this.handleMove(dir),
      onConfirm: () => this.ui.confirmModal(),
      onFirstInteraction: () => {
        this.sound.unlock();
        this.sound.setMuted(this.save.get('muted'));
      },
    });
    this.input.lock();

    this.lastTime = performance.now();
    this._loop = this.loop.bind(this);
  }

  get enemy() {
    return this.enemies.current;
  }

  // ------------------------------------------------------------------ //
  // lifecycle
  // ------------------------------------------------------------------ //

  start() {
    requestAnimationFrame(this._loop);
    this.showTitle();
  }

  async showTitle() {
    this.state = 'title';
    this.input.lock();
    this.ui.setHudVisible(false);
    await this.ui.showTitle();
    this.sound.unlock();
    this.sound.setMuted(this.save.get('muted'));
    this.sound.play('start');
    await this.startRun();
  }

  /** Fresh run: reset every system, then bring in the first enemy. */
  async startRun() {
    this.runToken++;
    const token = this.runToken;

    this.tweens.clear();
    this.effects.clear();
    this.boardView.clear();
    this.battlefield.clearEnemy();
    this.renderer.shake.reset();

    this.player.reset();
    this.enemies.reset();
    this.shop.reset();
    this.board.reset();

    this.score = 0;
    this.stats = { enemies: 0, bosses: 0, highestUnit: 0, goldEarned: 0, turns: 0 };
    this.stats.highestUnit = this.board.highestLevel();

    this.boardView.syncAll(this.board.tiles());
    this.ui.goldHold = false;
    this.ui.xpHold = false;
    this.ui.updatePlayer(this.player, this.score);
    this.ui.setHudVisible(true);
    this.ui.showHint();

    this.state = 'busy';
    await this.spawnNextEnemy();
    if (token !== this.runToken) return;

    this.state = 'idle';
    this.input.unlock();
  }

  loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    this.tweens.update(dt * 1000);
    this.battlefield.update(dt);
    this.boardView.update(dt);
    this.effects.update(dt);
    this.renderer.update(dt);
    this.renderer.render();

    requestAnimationFrame(this._loop);
  }

  // ------------------------------------------------------------------ //
  // turn sequence
  // ------------------------------------------------------------------ //

  handleMove(dir) {
    if (this.state !== 'idle') return;
    this.resolveMove(dir).catch((err) => {
      console.error('[Game] turn failed:', err);
      // Never leave the player stuck if a sequence throws.
      this.state = 'idle';
      this.input.unlock();
    });
  }

  /**
   * One full turn: slide, spawn, resolve merges into attacks, then let
   * the enemy's countdown tick.
   */
  async resolveMove(dir) {
    const token = this.runToken;
    const alive = () => token === this.runToken;

    const result = this.board.move(dir);
    if (!result.moved) {
      this.sound.play('invalid');
      this.boardView.nudge(dir);
      return;
    }

    this.state = 'busy';
    this.input.lock();
    this.ui.hideHint();
    this.stats.turns++;

    this.sound.play('slide');
    if (!(await this.boardView.animateSlides(result.moves)) || !alive()) return;

    if (result.spawned) {
      this.boardView.addTile(result.spawned);
      this.sound.play('spawn');
    }

    let killedThisTurn = false;
    for (let i = 0; i < result.merges.length; i++) {
      if (i > 0 && !(await this.tweens.wait(TIME.mergeStagger))) return;
      if (!alive()) return;

      const merge = result.merges[i];
      if (!(await this.boardView.animateMerge(merge)) || !alive()) return;

      this.registerMerge(merge.level);

      const killed = await this.attackWithMerge(merge);
      if (!alive()) return;

      if (killed) {
        killedThisTurn = true;
        await this.handleEnemyDefeated();
        if (!alive()) return;
      }
    }

    if (!killedThisTurn) {
      const tick = this.combat.advanceTurn();
      this.ui.updateCountdown(this.enemy);
      if (tick.attacks) {
        await this.enemyAttackSequence();
        if (!alive()) return;
      }
    }

    this.ui.updatePlayer(this.player, this.score);

    if (await this.checkGameOver()) return;

    this.state = 'idle';
    this.input.unlock();
  }

  /** Score + records for a merge, independent of combat. */
  registerMerge(level) {
    const power = Math.pow(2, level);
    this.score += power;
    this.sound.play('merge', { level });
    this.renderer.shake.add(SHAKE.merge(level), 9);

    if (level > this.stats.highestUnit) {
      this.stats.highestUnit = level;
      this.score += power * 10;
      if (level >= 4) {
        this.ui.toast(`New unit: ${getUnit(level).name}!`, 'good');
        this.sound.play('victory');
      }
    }
  }

  /**
   * Launch the merged unit's attack at the current enemy.
   * @returns {Promise<boolean>} true if this attack killed the enemy
   */
  async attackWithMerge(merge) {
    const enemy = this.enemy;
    if (!enemy || !enemy.alive) return false;

    const previousFraction = enemy.hpFraction;
    const hit = this.combat.resolveMerge(merge.level);
    if (!hit) return false;

    const from = this.boardView.tilePosition(merge.tile);
    const target = this.battlefield.enemyAnchor();
    const unit = getUnit(merge.level);

    this.sound.play('attack');
    await this.effects.bolt(
      { x: from.x, y: from.y + 10 },
      target,
      { color: unit.edge, duration: TIME.projectile, width: 22 + merge.level * 3 },
    );

    // impact
    this.sound.play(hit.crit ? 'crit' : 'enemyHit');
    this.effects.hitBurst(target.x, target.y, { size: 130 + merge.level * 14 });
    this.effects.damageNumber(target.x, target.y + 30, hit.damage, {
      kind: 'enemy',
      crit: hit.crit,
    });
    this.battlefield.hitReact({ crit: hit.crit, lethal: hit.killed });
    this.renderer.shake.add(hit.crit ? SHAKE.crit : SHAKE.hit, 8);

    this.score += Math.floor(hit.damage / 2);
    this.ui.updateEnemyHp(enemy, { showGhost: true, previousFraction });
    this.ui.updatePlayer(this.player, this.score);

    await this.tweens.wait(TIME.impact);
    return hit.killed;
  }

  /** Death, rewards, level-ups, shop, then the next floor. */
  async handleEnemyDefeated() {
    const token = this.runToken;
    const alive = () => token === this.runToken;

    const enemy = this.enemy;
    const wasBoss = enemy.isBoss;
    const floor = enemy.floor;

    // Snapshot before rewards land: the HUD keeps showing these values
    // until the dropped loot physically reaches the bars.
    const before = {
      gold: this.player.gold,
      xp: this.player.xp,
      level: this.player.level,
      xpToNext: this.player.xpToNext,
    };

    const rewards = this.combat.collectRewards();
    this.stats.enemies = this.enemies.defeated;
    this.stats.bosses = this.enemies.bossesDefeated;
    this.stats.goldEarned += rewards.gold;
    this.score += 25 * floor + (wasBoss ? 150 * floor : 0);

    this.ui.goldHold = true;
    this.ui.setGoldDisplay(before.gold);
    this.ui.xpHold = true;
    this.ui.setXpDisplay(before.level, before.xp, before.xpToNext);

    this.sound.play('enemyDeath');
    this.renderer.shake.add(wasBoss ? SHAKE.bossDeath : SHAKE.enemyDeath, 7);

    const anchor = this.battlefield.enemyAnchor();
    // Loot bursts out *with* the death explosion rather than queueing behind
    // it, so the two beats overlap and the payoff lands sooner. Gold streams
    // right into the purse, XP left into the bar — two readable channels.
    const goldFlight = this.collectGold(anchor, rewards.gold, before.gold);
    const xpFlight = this.collectXp(anchor, rewards.xp, before, rewards.levelsGained > 0);

    await this.battlefield.die({ boss: wasBoss });
    if (!alive()) return;

    this.ui.toast(`Floor ${floor} cleared!`, 'good');
    this.ui.updatePlayer(this.player, this.score);

    if (wasBoss) {
      this.effects.celebrate(anchor.x, anchor.y);
      this.sound.play('victory');
    }

    await Promise.all([goldFlight, xpFlight]);
    if (!alive()) return;

    if (!(await this.tweens.wait(TIME.victoryBeat)) || !alive()) return;

    for (let i = 0; i < rewards.levelsGained; i++) {
      await this.presentLevelUp();
      if (!alive()) return;
    }

    if (wasBoss) {
      await this.presentShop();
      if (!alive()) return;
    }

    await this.spawnNextEnemy();
  }

  /**
   * Loot pickup: coins burst from the corpse, fly into the HUD purse, and
   * the counter climbs as they land.
   *
   * @param {{x:number,y:number}} from world position of the kill
   * @param {number} amount gold awarded
   * @param {number} goldBefore the player's gold before this reward
   */
  async collectGold(from, amount, goldBefore) {
    const screen = this.ui.goldAnchor();
    const to = screen
      ? this.renderer.screenToWorld(screen.x, screen.y)
      : { x: 0, y: -DESIGN.height / 2 + 46 };

    // Each coin credits its own share as it lands, so the number climbs in
    // lockstep with the coins and stays monotonic — no separate tween that
    // could race the flight and make the total jump around.
    let credited = 0;

    await this.effects.goldBurst(from, to, amount, {
      onFirst: () => {
        this.sound.play('gold');
        this.ui.pulseGold();
        this.effects.damageNumber(to.x, to.y + 26, amount, { kind: 'gold', prefix: '+' });
      },
      onCoin: (landed, total) => {
        // Rounding by cumulative share puts the remainder on the last coin.
        const share = Math.round((amount * landed) / total) - credited;
        credited += share;
        this.ui.setGoldDisplay(goldBefore + credited);
        this.sound.play('coin', { index: landed - 1 });
        if (landed === total) this.ui.pulseGold();
      },
    });

    this.ui.goldHold = false;
    this.ui.setGoldDisplay(this.player.gold);
  }

  /**
   * XP pickup: glowing motes drift out of the corpse into the XP bar,
   * filling it as they land.
   *
   * @param {{x:number,y:number}} from world position of the kill
   * @param {number} amount XP awarded
   * @param {{level:number, xp:number, xpToNext:number}} before pre-reward state
   * @param {boolean} levelled true if this reward crossed a level threshold
   */
  async collectXp(from, amount, before, levelled) {
    const screen = this.ui.xpAnchor();
    const to = screen
      ? this.renderer.screenToWorld(screen.x, screen.y)
      : { x: -120, y: -DESIGN.height / 2 + 20 };

    // On a level-up the bar fills to the old threshold and the level-up
    // screen takes over from there — trying to animate through the rollover
    // mid-flight just reads as a glitch.
    const ceiling = levelled ? before.xpToNext : before.xp + amount;
    const climb = Math.max(0, ceiling - before.xp);
    let credited = 0;

    await this.effects.xpBurst(from, to, amount, {
      onFirst: () => {
        this.effects.damageNumber(to.x, to.y + 24, `${amount} XP`, {
          kind: 'xp',
          prefix: '+',
        });
      },
      onCoin: (landed, total) => {
        const share = Math.round((climb * landed) / total) - credited;
        credited += share;
        this.ui.setXpDisplay(before.level, before.xp + credited, before.xpToNext);
        // Only at the ends — motes land ~20ms apart, and restarting the
        // bump animation that often would freeze it on its first frame.
        if (landed === 1 || landed === total) this.ui.pulseXp();
      },
    });

    this.ui.xpHold = false;
    this.ui.setXpDisplay(this.player.level, this.player.xp, this.player.xpToNext);
  }

  async presentLevelUp() {
    const token = this.runToken;

    this.sound.play('levelUp');
    this.effects.levelUpFlare(0, BOARD.centerY + 40, Math.min(5, this.player.level));
    this.effects.screenFlash({ color: '#ffd45e', opacity: 0.26, duration: 380 });
    this.boardView.pulseAll('#ffe07a');
    this.ui.toast(`Level ${this.player.level}!`, 'xp');
    this.ui.updatePlayer(this.player, this.score);

    if (!(await this.tweens.wait(260)) || token !== this.runToken) return;

    const choices = this.upgrades.roll(3);
    const chosen = await this.ui.showLevelUp(choices, this.player);
    if (token !== this.runToken) return;

    this.upgrades.apply(chosen);
    this.sound.play('buy');
    this.ui.toast(chosen.name, 'good');
    this.ui.updatePlayer(this.player, this.score);
    // Watchtower upgrades should feel immediate.
    if (this.enemy) this.ui.updateCountdown(this.enemy);
  }

  async presentShop() {
    const token = this.runToken;
    const offers = this.shop.roll(3);
    await this.ui.showShop(offers, this.player, (offer) => {
      if (!this.shop.canAfford(offer)) {
        this.sound.play('deny');
        return false;
      }
      const bought = this.shop.buy(offer);
      if (bought) {
        this.sound.play('buy');
        this.ui.updatePlayer(this.player, this.score);
        this.boardView.pulseAll('#ffd45e');
      }
      return bought;
    });
    if (token !== this.runToken) return;
    this.ui.updatePlayer(this.player, this.score);
    if (this.enemy) this.ui.updateCountdown(this.enemy);
  }

  async spawnNextEnemy() {
    const token = this.runToken;
    const enemy = this.enemies.next();
    this.combat.resetCountdown(enemy);
    this.ui.setEnemy(enemy);

    if (enemy.isBoss) {
      this.sound.play('bossSpawn');
      this.ui.toast(`BOSS — ${enemy.name}`, 'warn');
    }

    await this.battlefield.spawnEnemy(enemy);
    if (token !== this.runToken) return;
    this.ui.updateCountdown(enemy);
  }

  /** Enemy's turn: wind up, swing, resolve. */
  async enemyAttackSequence() {
    const token = this.runToken;
    const alive = () => token === this.runToken;
    const enemy = this.enemy;
    if (!enemy || !enemy.alive) return;

    this.ui.updateCountdown(enemy);
    await this.battlefield.attackAnimation();
    if (!alive()) return;

    const result = this.combat.performEnemyAttack();
    const impact = { x: 0, y: BOARD.centerY + BOARD.cell * 1.6 };

    if (result.blocked) {
      this.sound.play('block');
      this.effects.flashRing(impact.x, impact.y, { size: 260, color: '#8fd8ff', duration: 300 });
      this.effects.damageNumber(impact.x, impact.y, 'BLOCKED', { kind: 'heal' });
      this.ui.toast('Shield held!', 'good');
      this.renderer.shake.add(SHAKE.blocked, 9);
    } else {
      this.sound.play('playerHit');
      this.effects.playSheet('impact', impact.x, impact.y, { size: 190 });
      this.effects.screenFlash({ color: '#ff4a3a', opacity: 0.32, duration: 300 });
      this.effects.damageNumber(impact.x, impact.y, result.dealt, {
        kind: 'player',
        prefix: '-',
      });
      this.effects.sparks(impact.x, impact.y, {
        count: 12,
        color: '#ff8a72',
        speed: 260,
        size: 13,
        life: 0.5,
      });
      this.renderer.shake.add(SHAKE.playerHit, 6.5);
    }

    this.ui.updatePlayer(this.player, this.score);
    this.ui.updateCountdown(enemy);
    await this.tweens.wait(240);
  }

  // ------------------------------------------------------------------ //
  // end of run
  // ------------------------------------------------------------------ //

  /** @returns {Promise<boolean>} true when the run has ended */
  async checkGameOver() {
    let reason = null;
    if (!this.player.alive) {
      reason = 'Your hero fell in battle.';
    } else if (!this.board.canMove()) {
      reason = 'The board is full — your army has nowhere left to march.';
    }
    if (!reason) return false;

    const token = this.runToken;
    this.state = 'over';
    this.input.lock();

    this.sound.play('gameOver');
    this.effects.screenFlash({ color: '#1a0d12', opacity: 0.5, duration: 700 });
    this.renderer.shake.add(SHAKE.gameOver, 5);

    if (!(await this.tweens.wait(520)) || token !== this.runToken) return true;

    const record = this.save.submitRun({
      score: this.score,
      floor: this.enemies.floor,
      highestUnit: this.stats.highestUnit,
      bosses: this.stats.bosses,
      enemies: this.stats.enemies,
    });

    const choice = await this.ui.showGameOver({
      score: this.score,
      floor: this.enemies.floor,
      enemies: this.stats.enemies,
      bosses: this.stats.bosses,
      highestUnit: this.stats.highestUnit,
      gold: this.stats.goldEarned,
      reason,
      record,
    });
    if (token !== this.runToken) return true;

    if (choice === 'again') {
      this.sound.play('start');
      await this.startRun();
    } else {
      await this.showTitle();
    }
    return true;
  }
}
