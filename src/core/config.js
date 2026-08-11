/**
 * Single source of truth for layout + timing.
 *
 * The world is measured in "design units". The orthographic camera is
 * always scaled so that a DESIGN.width x DESIGN.height box is fully
 * visible and centred; any leftover viewport shows extra scenery.
 */

export const DESIGN = {
  width: 500,
  height: 1000,
};

/**
 * Vertical budget across the 1000-unit design box:
 *   500 .. 382   top HUD (enemy name, HP, countdown)   118
 *   382 ..  98   battlefield (horizon at 244, enemy at 202)
 *    98 .. -390  board frame (488 tall)
 *  -396 .. -500  bottom HUD (player HP, level, XP, gold)  104
 */
export const BOARD = {
  size: 4,
  cell: 108,
  gap: 10,
  /** World Y of the board's centre — keeps the frame clear of both HUDs. */
  centerY: -146,
  /** Padding between the outermost cells and the board frame. */
  padding: 13,
  /**
   * Corner radius of a cell (slot and tile plate), in design units.
   * The frame derives its own radius as `cornerRadius + padding` so the
   * outer corner stays concentric with the cells it encloses.
   */
  cornerRadius: 17,
};

/** Distance between the centres of two neighbouring cells. */
export const CELL_PITCH = BOARD.cell + BOARD.gap; // 118
/** Outer extent of the 4x4 grid of cells (not counting the frame). */
export const GRID_EXTENT = BOARD.size * BOARD.cell + (BOARD.size - 1) * BOARD.gap; // 462

export const SCENE = {
  /** World Y where the grass surface begins. */
  groundY: 244,
  /** World Y of the enemy's feet — well below the horizon so it stands
   *  ON the field rather than hovering at the sky line. */
  enemyFeetY: 202,
  /** Rendered character height (design units) for a normal enemy. */
  enemyHeight: 120,
  /** Rendered character height for a boss. */
  bossHeight: 160,
  /** Rendered character height for a unit standing on a board tile. */
  unitHeight: 68,
};

/** Animation timings in milliseconds — tuned to feel snappy, not slow. */
export const TIME = {
  tileSlide: 125,
  tileSpawn: 150,
  mergeSquash: 80,
  mergeBounce: 130,
  /**
   * Delay between successive merges resolving in one move. The blocking
   * path per merge is squash + projectile + impact + this, so it is kept
   * short: a four-merge move should still finish inside ~1.4s.
   */
  mergeStagger: 40,
  projectile: 150,
  impact: 80,
  enemyReact: 200,
  enemyAttackWindup: 200,
  enemyAttackStrike: 180,
  enemyDeath: 520,
  enemySpawn: 420,
  bossSpawn: 700,
  damageNumber: 800,
  /** Board jolt + units thrown airborne when an enemy attack lands. */
  boardJolt: 420,
  tileLaunch: 400,
  victoryBeat: 200,
  /** Dropped coins tumble under gravity for this long before magnetising. */
  goldScatter: 300,
  /** Flight time from the scatter point to the HUD purse. */
  goldFly: 380,
  /** Per-coin delay, so they stream into the purse instead of clumping. */
  goldStagger: 16,
};

/**
 * World-space centre of a board cell. row 0 is the top row, col 0 is left.
 * @returns {{x:number, y:number}}
 */
export function cellCenter(row, col) {
  const half = (BOARD.size - 1) / 2;
  return {
    x: (col - half) * CELL_PITCH,
    y: BOARD.centerY - (row - half) * CELL_PITCH,
  };
}

/**
 * Camera shake magnitudes, in design units. The design box is 500 wide,
 * so 10 units is a ~2% jolt — enough to feel, not enough to fight.
 *
 * Set `scale` to 0 to switch shake off entirely, or lower it to taste;
 * it multiplies every value below.
 */
export const SHAKE = {
  scale: 1,
  /** Cap on stacked intensity so a long merge chain cannot spiral. */
  max: 13,
  /** Board-level feedback for a merge, growing slightly with tier. */
  merge: (level) => Math.min(3.5, 0.8 + level * 0.3),
  hit: 4,
  crit: 7,
  enemyDeath: 5.5,
  bossDeath: 9,
  bossLand: 9,
  playerHit: 8.5,
  /** Local jolt of the board group itself when the army takes a hit. */
  boardHit: 9,
  blocked: 3,
  gameOver: 7,
};

export const RENDER_LAYER = {
  sky: -60,
  clouds: -50,
  ground: -40,
  decorBack: -30,
  enemy: -10,
  decorFront: -5,
  boardFrame: 0,
  boardCell: 1,
  tile: 10,
  tileUnit: 12,
  tileLabel: 14,
  effect: 40,
  damage: 50,
};
