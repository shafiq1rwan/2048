import { Enemy } from '../combat/Enemy.js';
import { buildEnemy, BOSS_EVERY } from '../data/enemies.js';

/** Walks the enemy ladder and hands out fresh Enemy instances. */
export class EnemyManager {
  constructor() {
    this.reset();
  }

  reset() {
    /** 0-based index of the enemy about to be / currently being fought. */
    this.index = 0;
    this.defeated = 0;
    this.bossesDefeated = 0;
    this.current = null;
  }

  /** Advance to the next floor and return the new enemy. */
  next() {
    this.current = new Enemy(buildEnemy(this.index));
    this.index++;
    return this.current;
  }

  /** Called once the current enemy dies. */
  registerDefeat() {
    this.defeated++;
    if (this.current?.isBoss) this.bossesDefeated++;
  }

  /** Floor number of the fight in progress (1-based). */
  get floor() {
    return this.current?.floor ?? this.index + 1;
  }

  /** True when the enemy just beaten was a boss (so the shop should open). */
  get lastWasBoss() {
    return Boolean(this.current?.isBoss);
  }

  get bossEvery() {
    return BOSS_EVERY;
  }
}
