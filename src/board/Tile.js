let nextId = 1;

/**
 * Pure board state for one unit. Deliberately holds no Three.js data —
 * the renderer keeps its own map from tile id to mesh.
 */
export class Tile {
  /**
   * @param {number} level merge level (1 = Recruit; 0 for rubble)
   * @param {number} row 0 = top
   * @param {number} col 0 = left
   * @param {'unit'|'rubble'} [kind] rubble is enemy sabotage: it merges
   *        with nothing, never moves, and crumbles after `ttl` turns
   */
  constructor(level, row, col, kind = 'unit') {
    this.id = nextId++;
    this.level = level;
    this.row = row;
    this.col = col;
    this.kind = kind;
    /** Turns before rubble crumbles (only meaningful for kind 'rubble'). */
    this.ttl = 0;
    /** Turns this unit stays frozen — immovable and unmergeable. */
    this.frozenFor = 0;
    /** True on the turn this tile was produced by a merge. */
    this.justMerged = false;
    /** True on the turn this tile was spawned. */
    this.justSpawned = false;
  }

  /** Locked tiles act as walls: they never slide and never merge. */
  get locked() {
    return this.kind === 'rubble' || this.frozenFor > 0;
  }
}

/** Only used by tests to keep ids readable between runs. */
export function _resetTileIds() {
  nextId = 1;
}
