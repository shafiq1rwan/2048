/** One live enemy, built from a definition in data/enemies.js. */
export class Enemy {
  /** @param {ReturnType<import('../data/enemies.js').buildEnemy>} def */
  constructor(def) {
    this.name = def.name;
    this.sheet = def.sheet;
    this.heightMul = def.heightMul;
    this.isBoss = def.isBoss;
    this.floor = def.floor;
    this.level = def.level;

    this.maxHp = def.maxHp;
    this.hp = def.maxHp;
    this.attack = def.attack;

    this.countdownMax = def.countdownMax;
    this.countdown = def.countdownMax;

    this.goldReward = def.gold;
    this.xpReward = def.xp;
  }

  get alive() {
    return this.hp > 0;
  }

  get hpFraction() {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  /** @returns {{dealt: number, dead: boolean, overkill: number}} */
  takeDamage(amount) {
    const requested = Math.max(0, Math.round(amount));
    const dealt = Math.min(this.hp, requested);
    this.hp -= dealt;
    return { dealt, dead: this.hp <= 0, overkill: requested - dealt };
  }
}
