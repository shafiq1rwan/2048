/**
 * Level-up upgrades and boss-shop wares.
 *
 * Each entry is `{ id, name, desc, icon, apply(player) }` plus optional
 * `available(player)` filtering. Descriptions stay one short line.
 */

/** Offered three at a time whenever the player levels up. */
export const UPGRADES = [
  {
    id: 'dmg',
    name: 'Sharpen Blades',
    desc: '+20% merge damage',
    icon: 'icon_sword',
    apply: (p) => {
      p.dmgMult += 0.2;
    },
  },
  {
    id: 'maxhp',
    name: 'Iron Rations',
    desc: '+20 max HP, healed too',
    icon: 'icon_meat',
    apply: (p) => {
      p.maxHp += 20;
      p.heal(20);
    },
  },
  {
    id: 'heal',
    name: 'Field Medic',
    desc: 'Heal 30% of max HP',
    icon: 'icon_meat_res',
    available: (p) => p.hp < p.maxHp,
    apply: (p) => {
      p.heal(Math.ceil(p.maxHp * 0.3));
    },
  },
  {
    id: 'countdown',
    name: 'Watchtower',
    desc: '+1 turn before enemies attack',
    icon: 'icon_arrow_up',
    apply: (p) => {
      p.countdownBonus += 1;
    },
  },
  {
    id: 'gold',
    name: "Merchant's Favour",
    desc: '+15% gold earned',
    icon: 'icon_gold',
    apply: (p) => {
      p.goldMult += 0.15;
    },
  },
  {
    id: 'crit',
    name: 'Critical Merge',
    desc: '+10% chance to double damage',
    icon: 'icon_swords',
    available: (p) => p.critChance < 0.8,
    apply: (p) => {
      p.critChance = Math.min(0.8, p.critChance + 0.1);
    },
  },
  {
    id: 'shield',
    name: 'Tower Shield',
    desc: 'Block the next 2 enemy attacks',
    icon: 'icon_shield',
    apply: (p) => {
      p.shields += 2;
    },
  },
  {
    id: 'flat',
    name: 'War Hammer',
    desc: '+3 flat damage per merge',
    icon: 'icon_hammer',
    apply: (p) => {
      p.flatAtk += 3;
    },
  },
  {
    id: 'xp',
    name: 'Battle Study',
    desc: '+20% XP gained',
    icon: 'icon_axe',
    apply: (p) => {
      p.xpMult += 0.2;
    },
  },
];

/** Rolled three at a time in the shop that follows each boss. */
export const SHOP_ITEMS = [
  {
    id: 'shop_sword',
    name: 'Sword Upgrade',
    desc: '+10% merge damage',
    icon: 'icon_sword',
    cost: 30,
    apply: (p) => {
      p.dmgMult += 0.1;
    },
  },
  {
    id: 'shop_armor',
    name: 'Armour',
    desc: '+15 max HP',
    icon: 'icon_shield',
    cost: 25,
    apply: (p) => {
      p.maxHp += 15;
      p.heal(15);
    },
  },
  {
    id: 'shop_potion',
    name: 'Healing Potion',
    desc: 'Restore 50% max HP',
    icon: 'icon_meat_res',
    cost: 20,
    available: (p) => p.hp < p.maxHp,
    apply: (p) => {
      p.heal(Math.ceil(p.maxHp * 0.5));
    },
  },
  {
    id: 'shop_charm',
    name: 'Lucky Charm',
    desc: '+8% critical chance',
    icon: 'icon_swords',
    cost: 35,
    available: (p) => p.critChance < 0.8,
    apply: (p) => {
      p.critChance = Math.min(0.8, p.critChance + 0.08);
    },
  },
  {
    id: 'shop_training',
    name: 'Battle Training',
    desc: '+25% XP gained',
    icon: 'icon_axe',
    cost: 30,
    apply: (p) => {
      p.xpMult += 0.25;
    },
  },
  {
    id: 'shop_banner',
    name: 'Rally Banner',
    desc: '+1 turn before enemies attack',
    icon: 'icon_arrow_up',
    cost: 45,
    apply: (p) => {
      p.countdownBonus += 1;
    },
  },
  {
    id: 'shop_bulwark',
    name: 'Bulwark',
    desc: 'Block the next 3 enemy attacks',
    icon: 'icon_shield',
    cost: 28,
    apply: (p) => {
      p.shields += 3;
    },
  },
];
