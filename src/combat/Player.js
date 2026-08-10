/** XP needed to go from `level` to `level + 1`. */
export function xpForLevel(level) {
  return Math.round(22 + 16 * Math.pow(level, 1.35));
}

/** The player's hero: stats plus the flat list of upgrades taken. */
export class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.maxHp = 100;
    this.hp = 100;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = xpForLevel(1);
    this.gold = 0;

    // RPG modifiers, all applied on top of the base 2^level merge damage.
    this.dmgMult = 1;
    this.flatAtk = 0;
    this.critChance = 0;
    this.goldMult = 1;
    this.xpMult = 1;
    this.countdownBonus = 0;
    this.shields = 0;

    /** Upgrade + shop ids taken this run, for the HUD badge strip. */
    this.perks = [];
  }

  get alive() {
    return this.hp > 0;
  }

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, Math.round(amount)));
    return this.hp - before;
  }

  /**
   * Take a hit. Shields absorb the whole attack.
   * @returns {{blocked: boolean, dealt: number, dead: boolean}}
   */
  takeDamage(amount) {
    if (this.shields > 0) {
      this.shields--;
      return { blocked: true, dealt: 0, dead: false };
    }
    const dealt = Math.max(0, Math.round(amount));
    this.hp = Math.max(0, this.hp - dealt);
    return { blocked: false, dealt, dead: this.hp <= 0 };
  }

  addGold(amount) {
    const gained = Math.max(0, Math.round(amount * this.goldMult));
    this.gold += gained;
    return gained;
  }

  spendGold(amount) {
    if (this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }

  /**
   * Award XP, rolling over as many levels as it covers.
   * @returns {{gained: number, levelsGained: number}}
   */
  addXp(amount) {
    const gained = Math.max(0, Math.round(amount * this.xpMult));
    this.xp += gained;
    let levelsGained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      levelsGained++;
      this.xpToNext = xpForLevel(this.level);
    }
    return { gained, levelsGained };
  }

  /**
   * Damage for a merge that produced `mergedLevel`.
   * Base is 2^mergedLevel, then flat bonus, then multiplier, then crit.
   * @returns {{damage: number, crit: boolean, base: number}}
   */
  mergeDamage(mergedLevel) {
    const base = Math.pow(2, mergedLevel);
    let damage = (base + this.flatAtk) * this.dmgMult;
    const crit = Math.random() < this.critChance;
    if (crit) damage *= 2;
    return { damage: Math.max(1, Math.round(damage)), crit, base };
  }
}
