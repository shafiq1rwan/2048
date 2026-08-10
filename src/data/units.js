/**
 * The merge ladder.
 *
 * Every entry carries the sprite-sheet geometry that was measured from
 * the real Tiny Swords files:
 *   frameW/frameH  frame cell size in the sheet
 *   cols/rows      sheet grid
 *   row/frames     which row to animate and how many frames are used
 *   footY          Y of the character's feet inside the frame (px)
 *   charH          visual character height inside the frame (px)
 *
 * footY + charH let the renderer size and baseline-align sprites that
 * come from sheets with different frame sizes, so a 320px Lancer frame
 * and a 192px Pawn frame end up looking like the same scale of soldier.
 */

/**
 * The named ladder. Levels past the end of this array reuse the top
 * sprite and add star pips plus a golden aura (see getUnit).
 */
export const UNITS = [
  {
    level: 1,
    name: 'Recruit',
    tint: '#6d7c9c',
    edge: '#98a6c4',
    sprite: {
      image: 'pawn_blue',
      frameW: 192, frameH: 192, cols: 8, rows: 1,
      row: 0, frames: 8, fps: 7,
      footY: 134, charH: 71, centerX: 95,
    },
  },
  {
    level: 2,
    name: 'Swordsman',
    tint: '#3f7cc0',
    edge: '#7fb4e6',
    sprite: {
      image: 'warrior_blue',
      frameW: 192, frameH: 192, cols: 8, rows: 1,
      row: 0, frames: 8, fps: 8,
      footY: 136, charH: 89, centerX: 101,
    },
  },
  {
    level: 3,
    name: 'Archer',
    tint: '#2f9484',
    edge: '#6fd6c0',
    sprite: {
      image: 'archer_blue',
      frameW: 192, frameH: 192, cols: 6, rows: 1,
      row: 0, frames: 6, fps: 7,
      footY: 135, charH: 88, centerX: 93,
    },
  },
  {
    level: 4,
    name: 'Knight',
    tint: '#4358c0',
    edge: '#8090ee',
    sprite: {
      image: 'lancer_blue',
      frameW: 320, frameH: 320, cols: 12, rows: 1,
      row: 0, frames: 12, fps: 9,
      footY: 197, charH: 118, centerX: 150,
    },
  },
  {
    level: 5,
    name: 'Elite Knight',
    tint: '#c69a24',
    edge: '#ffe07a',
    sprite: {
      image: 'lancer_yellow',
      frameW: 320, frameH: 320, cols: 12, rows: 1,
      row: 0, frames: 12, fps: 9,
      footY: 197, charH: 118, centerX: 150,
    },
  },
  {
    level: 6,
    name: 'Champion',
    tint: '#c1462f',
    edge: '#ff8f70',
    sprite: {
      image: 'lancer_red',
      frameW: 320, frameH: 320, cols: 12, rows: 1,
      row: 0, frames: 12, fps: 10,
      footY: 197, charH: 118, centerX: 150,
    },
  },
  {
    level: 7,
    name: 'Royal Guard',
    tint: '#7b46c0',
    edge: '#c8a0ff',
    sprite: {
      image: 'lancer_purple',
      frameW: 320, frameH: 320, cols: 12, rows: 1,
      row: 0, frames: 12, fps: 10,
      footY: 197, charH: 118, centerX: 150,
    },
  },
  {
    level: 8,
    name: 'Hero',
    tint: '#2b2f4a',
    edge: '#ffd45e',
    aura: true,
    sprite: {
      image: 'lancer_black',
      frameW: 320, frameH: 320, cols: 12, rows: 1,
      row: 0, frames: 12, fps: 11,
      footY: 197, charH: 118, centerX: 150,
    },
  },
];

/** Names used for levels beyond the hand-authored ladder. */
const ASCENDED_NAMES = ['Legend', 'Warlord', 'Demigod', 'Ascendant', 'Eternal'];

/**
 * Definition for any level, including levels past the named ladder.
 * @param {number} level
 */
export function getUnit(level) {
  const clamped = Math.max(1, Math.floor(level));
  if (clamped <= UNITS.length) return UNITS[clamped - 1];

  const top = UNITS[UNITS.length - 1];
  const beyond = clamped - UNITS.length;
  return {
    ...top,
    level: clamped,
    name: ASCENDED_NAMES[Math.min(beyond - 1, ASCENDED_NAMES.length - 1)],
    tint: '#1d2138',
    edge: '#ffe89a',
    aura: true,
    /** Extra pips drawn on the tile so level 9+ still reads at a glance. */
    stars: Math.min(beyond, 5),
  };
}

/** Power number shown on the tile — the same value that fuels damage. */
export function unitPower(level) {
  return Math.pow(2, level);
}
