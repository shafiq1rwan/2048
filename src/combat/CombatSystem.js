import { shuffled } from '../core/Tween.js';

/**
 * Chain merges in one move escalate: the 2nd merge deals x1.5, the 3rd
 * x2 and so on, capped. Rewards setting the board up over merging
 * greedily one pair at a time.
 */
export const COMBO = { step: 0.5, max: 3 };

/** Damage multiplier for the Nth merge of a single move (0-based). */
export function comboMultiplier(index) {
  return Math.min(COMBO.max, 1 + COMBO.step * index);
}

/**
 * What each enemy intent does to the player, as a fraction of the
 * enemy's attack stat. Board sabotage trades damage for pressure.
 */
export const INTENT_DAMAGE = { strike: 1, bomb: 0.65, freeze: 0 };

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
   * @param {number} [combo] damage multiplier for chained merges
   */
  resolveMerge(mergedLevel, combo = 1) {
    const enemy = this.enemy;
    if (!enemy || !enemy.alive) return null;

    const { damage, crit } = this.player.mergeDamage(mergedLevel);
    const total = Math.max(1, Math.round(damage * combo));
    const result = enemy.takeDamage(total);
    return {
      level: mergedLevel,
      damage: result.dealt,
      requested: total,
      combo,
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
   * Enemy swing, typed by intent. A strike is pure damage; a bomb hits
   * softer (the rubble it leaves is handled by the caller, which owns
   * the board); a freeze deals none and never wastes a player shield.
   *
   * @param {'strike'|'bomb'|'freeze'} [intent]
   * @returns {{type: string, damage: number, blocked: boolean,
   *            dealt: number, dead: boolean}}
   */
  performEnemyAttack(intent = 'strike') {
    const enemy = this.enemy;
    const fraction = INTENT_DAMAGE[intent] ?? 1;
    const variance = 0.9 + Math.random() * 0.2;
    const damage = fraction > 0 ? Math.max(1, Math.round(enemy.attack * fraction * variance)) : 0;
    const result =
      damage > 0 ? this.player.takeDamage(damage) : { blocked: false, dealt: 0, dead: false };
    enemy.advanceIntent();
    this.resetCountdown(enemy);
    return { type: intent, damage, ...result };
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
