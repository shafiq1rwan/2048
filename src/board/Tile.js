let nextId = 1;

/**
 * Pure board state for one unit. Deliberately holds no Three.js data —
 * the renderer keeps its own map from tile id to mesh.
 */
export class Tile {
  /**
   * @param {number} level merge level (1 = Recruit)
   * @param {number} row 0 = top
   * @param {number} col 0 = left
   */
  constructor(level, row, col) {
    this.id = nextId++;
    this.level = level;
    this.row = row;
    this.col = col;
    /** True on the turn this tile was produced by a merge. */
    this.justMerged = false;
    /** True on the turn this tile was spawned. */
    this.justSpawned = false;
  }
}

/** Only used by tests to keep ids readable between runs. */
export function _resetTileIds() {
  nextId = 1;
}
