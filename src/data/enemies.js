/**
 * Enemy roster + the scaling curves.
 *
 * Everything about difficulty lives in this file: change the four
 * `scale*` functions to rebalance the whole run.
 */

/** A boss appears on every Nth floor. */
export const BOSS_EVERY = 5;

/** Sprite geometry probed from the real files (see units.js for the format). */
const SHEETS = {
  sheep: {
    image: 'sheep',
    frameW: 128, frameH: 128, cols: 8, rows: 1,
    row: 0, frames: 8, fps: 6,
    footY: 85, charH: 38, centerX: 64,
  },
  goblinTorchRed: {
    image: 'goblin_torch_red',
    frameW: 192, frameH: 192, cols: 7, rows: 5,
    row: 0, frames: 7, fps: 8,
    footY: 132, charH: 79, centerX: 90,
  },
  goblinTorchPurple: {
    image: 'goblin_torch_purple',
    frameW: 192, frameH: 192, cols: 7, rows: 5,
    row: 0, frames: 7, fps: 8,
    footY: 132, charH: 79, centerX: 90,
  },
  goblinTorchYellow: {
    image: 'goblin_torch_yellow',
    frameW: 192, frameH: 192, cols: 7, rows: 5,
    row: 0, frames: 7, fps: 9,
    footY: 132, charH: 79, centerX: 90,
  },
  goblinTntRed: {
    image: 'goblin_tnt_red',
    frameW: 192, frameH: 192, cols: 7, rows: 3,
    row: 0, frames: 6, fps: 8,
    footY: 134, charH: 68, centerX: 100,
  },
  goblinTntPurple: {
    image: 'goblin_tnt_purple',
    frameW: 192, frameH: 192, cols: 7, rows: 3,
    row: 0, frames: 6, fps: 8,
    footY: 134, charH: 68, centerX: 100,
  },
  warriorRed: {
    image: 'warrior_red',
    frameW: 192, frameH: 192, cols: 8, rows: 1,
    row: 0, frames: 8, fps: 8,
    footY: 136, charH: 89, centerX: 101,
  },
  warriorPurple: {
    image: 'warrior_purple',
    frameW: 192, frameH: 192, cols: 8, rows: 1,
    row: 0, frames: 8, fps: 8,
    footY: 136, charH: 89, centerX: 101,
  },
  warriorBlack: {
    image: 'warrior_black',
    frameW: 192, frameH: 192, cols: 8, rows: 1,
    row: 0, frames: 8, fps: 8,
    footY: 136, charH: 89, centerX: 101,
  },
  archerBlack: {
    image: 'archer_black',
    frameW: 192, frameH: 192, cols: 6, rows: 1,
    row: 0, frames: 6, fps: 7,
    footY: 135, charH: 88, centerX: 93,
  },
  archerRed: {
    image: 'archer_red',
    frameW: 192, frameH: 192, cols: 6, rows: 1,
    row: 0, frames: 6, fps: 7,
    footY: 135, charH: 88, centerX: 93,
  },
  monkPurple: {
    image: 'monk_purple',
    frameW: 192, frameH: 192, cols: 6, rows: 1,
    row: 0, frames: 6, fps: 6,
    footY: 133, charH: 69, centerX: 95,
  },
};

/**
 * Normal enemies, cycled in order. `heightMul` nudges the rendered size
 * so a sheep does not end up as tall as a knight.
 */
export const ENEMIES = [
  { name: 'Woolly Beast', sheet: SHEETS.sheep, heightMul: 0.62, hpMul: 0.85 },
  { name: 'Goblin Torch', sheet: SHEETS.goblinTorchRed, heightMul: 0.92 },
  { name: 'Goblin Bomber', sheet: SHEETS.goblinTntRed, heightMul: 0.9, hpMul: 0.92, atkMul: 1.15 },
  { name: 'Goblin Brute', sheet: SHEETS.goblinTorchPurple, heightMul: 1.0, hpMul: 1.12 },
  { name: 'Rogue Knight', sheet: SHEETS.warriorRed, heightMul: 1.0 },
  { name: 'Dark Archer', sheet: SHEETS.archerBlack, heightMul: 0.98, hpMul: 0.9, atkMul: 1.2 },
  { name: 'Sapper Goblin', sheet: SHEETS.goblinTntPurple, heightMul: 0.95, atkMul: 1.1 },
  { name: 'Cult Adept', sheet: SHEETS.monkPurple, heightMul: 0.95, hpMul: 1.15 },
  { name: 'Blade Marauder', sheet: SHEETS.warriorPurple, heightMul: 1.02 },
  { name: 'Crimson Ranger', sheet: SHEETS.archerRed, heightMul: 1.0, atkMul: 1.15 },
];

/** Bosses, cycled in order every BOSS_EVERY floors. */
export const BOSSES = [
  { name: 'Goblin Chieftain', sheet: SHEETS.goblinTorchYellow, heightMul: 1.0 },
  { name: 'The Black Knight', sheet: SHEETS.warriorBlack, heightMul: 1.0 },
  { name: 'Warlord Grimtusk', sheet: SHEETS.goblinTorchPurple, heightMul: 1.05, atkMul: 1.1 },
  { name: 'Dread Sovereign', sheet: SHEETS.monkPurple, heightMul: 1.0, hpMul: 1.15 },
];

// ---------------------------------------------------------------------
// Scaling curves. `index` is 0-based (floor 1 => index 0).
// ---------------------------------------------------------------------

const scaleHp = (index) => 24 * Math.pow(1.34, index);
const scaleAtk = (index) => 4 * Math.pow(1.26, index);
const scaleGold = (index) => 9 + 4 * index;
const scaleXp = (index) => 9 + 5 * index;

/** Turns of warning the player gets before this enemy swings. */
function countdownFor(index, isBoss) {
  if (isBoss) return 6;
  if (index >= 12) return 3;
  return 4;
}

/**
 * Build the full enemy definition for a floor.
 * @param {number} index 0-based enemy index across the run.
 * @returns {{name:string, sheet:object, heightMul:number, isBoss:boolean,
 *            level:number, floor:number, maxHp:number, attack:number,
 *            countdownMax:number, gold:number, xp:number}}
 */
export function buildEnemy(index) {
  const floor = index + 1;
  const isBoss = floor % BOSS_EVERY === 0;
  const template = isBoss
    ? BOSSES[Math.floor(floor / BOSS_EVERY - 1) % BOSSES.length]
    : ENEMIES[index % ENEMIES.length];

  const bossHp = isBoss ? 2.3 : 1;
  const bossAtk = isBoss ? 1.65 : 1;
  const bossReward = isBoss ? 3 : 1;

  return {
    name: template.name,
    sheet: template.sheet,
    heightMul: template.heightMul ?? 1,
    isBoss,
    floor,
    level: floor,
    maxHp: Math.max(8, Math.round(scaleHp(index) * (template.hpMul ?? 1) * bossHp)),
    attack: Math.max(2, Math.round(scaleAtk(index) * (template.atkMul ?? 1) * bossAtk)),
    countdownMax: countdownFor(index, isBoss),
    gold: Math.round(scaleGold(index) * bossReward),
    xp: Math.round(scaleXp(index) * bossReward),
  };
}
