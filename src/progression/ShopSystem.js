import { SHOP_ITEMS } from '../data/upgrades.js';
import { shuffled } from '../core/Tween.js';

/** The little three-slot shop that opens after every boss. */
export class ShopSystem {
  /** @param {import('../combat/Player.js').Player} player */
  constructor(player) {
    this.player = player;
    this.visits = 0;
  }

  reset() {
    this.visits = 0;
  }

  /**
   * Three random wares. Prices creep up each visit so gold keeps mattering.
   * @returns {Array<{id:string,name:string,desc:string,icon:string,cost:number,apply:Function}>}
   */
  roll(count = 3) {
    this.visits++;
    const markup = 1 + 0.25 * (this.visits - 1);
    const eligible = SHOP_ITEMS.filter((i) => !i.available || i.available(this.player));
    const source = eligible.length >= count ? eligible : SHOP_ITEMS;
    return shuffled(source)
      .slice(0, count)
      .map((item) => ({ ...item, cost: Math.round(item.cost * markup) }));
  }

  canAfford(offer) {
    return this.player.gold >= offer.cost;
  }

  /** @returns {boolean} false when the player cannot pay */
  buy(offer) {
    if (!this.player.spendGold(offer.cost)) return false;
    offer.apply(this.player);
    this.player.perks.push({ id: offer.id, name: offer.name });
    return true;
  }
}
