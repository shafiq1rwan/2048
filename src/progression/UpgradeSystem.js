import { UPGRADES } from '../data/upgrades.js';
import { shuffled } from '../core/Tween.js';

/** Rolls and applies the three-choice level-up upgrades. */
export class UpgradeSystem {
  /** @param {import('../combat/Player.js').Player} player */
  constructor(player) {
    this.player = player;
  }

  /** @returns {typeof UPGRADES} three distinct, currently useful upgrades */
  roll(count = 3) {
    const eligible = UPGRADES.filter((u) => !u.available || u.available(this.player));
    const source = eligible.length >= count ? eligible : UPGRADES;
    return shuffled(source).slice(0, count);
  }

  /** @param {typeof UPGRADES[number]} upgrade */
  apply(upgrade) {
    upgrade.apply(this.player);
    this.player.perks.push({ id: upgrade.id, name: upgrade.name });
    return upgrade;
  }
}
