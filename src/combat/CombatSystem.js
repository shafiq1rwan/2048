import { shuffled } from '../core/Tween.js';

/**
 * The rules of a fight. Pure state changes and number crunching — the
 * animation sequencing lives in Game.js so combat stays testable.
 */
export class CombatSystem {
  /**
   * @param {import('./Player.js').Player} player
   * @param {import('../progression/EnemyManager.js').EnemyManager} enemies
   */
  constructor(player, enemies) {
    this.player = player;
    this.enemies = enemies;
  }

  get enemy() {
    return this.enemies.current;
  }

  /** Reset the countdown, applying the player's Watchtower bonuses. */
  resetCountdown(enemy = this.enemy) {
    if (!enemy) return;
    enemy.countdown = enemy.countdownMax + this.player.countdownBonus;
  }

  /**
   * Damage for a single merge. Returns null when there is nothing to hit.
   * @param {number} mergedLevel
   */
  resolveMerge(mergedLevel) {
    const enemy = this.enemy;
    if (!enemy || !enemy.alive) return null;

    const { damage, crit } = this.player.mergeDamage(mergedLevel);
    const result = enemy.takeDamage(damage);
    return {
      level: mergedLevel,
      damage: result.dealt,
      requested: damage,
      crit,
      killed: result.dead,
    };
  }

  /**
   * Count down one turn.
   * @returns {{attacks: boolean, remaining: number}}
   */
  advanceTurn() {
    const enemy = this.enemy;
    if (!enemy || !enemy.alive) return { attacks: false, remaining: 0 };
    enemy.countdown = Math.max(0, enemy.countdown - 1);
    return { attacks: enemy.countdown <= 0, remaining: enemy.countdown };
  }

  /**
   * Enemy swing. Bosses hit for a bit more than their listed attack.
   * @returns {{damage: number, blocked: boolean, dealt: number, dead: boolean}}
   */
  performEnemyAttack() {
    const enemy = this.enemy;
    const variance = 0.9 + Math.random() * 0.2;
    const damage = Math.max(1, Math.round(enemy.attack * variance));
    const result = this.player.takeDamage(damage);
    this.resetCountdown(enemy);
    return { damage, ...result };
  }

  /** Rewards for the kill, already multiplied by the player's perks. */
  collectRewards() {
    const enemy = this.enemy;
    const gold = this.player.addGold(enemy.goldReward);
    const { gained: xp, levelsGained } = this.player.addXp(enemy.xpReward);
    this.enemies.registerDefeat();
    return { gold, xp, levelsGained, wasBoss: enemy.isBoss, floor: enemy.floor };
  }

  /**
   * Pick `count` distinct offers from a pool, honouring each entry's
   * optional `available(player)` guard.
   */
  rollOffers(pool, count) {
    const eligible = pool.filter((item) => !item.available || item.available(this.player));
    const source = eligible.length >= count ? eligible : pool;
    return shuffled(source).slice(0, count);
  }
}
