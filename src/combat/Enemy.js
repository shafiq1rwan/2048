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

    /** Attack pattern, cycled one entry per swing (see data/enemies.js). */
    this.pattern = def.pattern ?? ['strike'];
    this.patternIndex = 0;

    /** Which timbre this family speaks in (audio/SoundManager.js). */
    this.voice = def.voice ?? 'goblin';

    this.goldReward = def.gold;
    this.xpReward = def.xp;
  }

  /** What the next swing will do — shown to the player as a telegraph. */
  get intent() {
    return this.pattern[this.patternIndex % this.pattern.length];
  }

  /** Move to the next entry of the pattern after a swing. */
  advanceIntent() {
    this.patternIndex = (this.patternIndex + 1) % this.pattern.length;
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
