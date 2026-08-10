import { Tile } from './Tile.js';
import { slide, hasMoves } from './MergeSystem.js';
import { BOARD } from '../core/config.js';

/** Chance that a freshly spawned recruit arrives already promoted. */
const SPAWN_LEVEL2_CHANCE = 0.12;

/**
 * Board state only: the 4x4 grid of tiles plus the 2048 rules.
 * Knows nothing about combat or rendering.
 */
export class Board {
  constructor(size = BOARD.size) {
    this.size = size;
    this.cells = [];
    this.reset();
  }

  reset() {
    this.cells = Array.from({ length: this.size }, () => new Array(this.size).fill(null));
    this.spawn();
    this.spawn();
  }

  get(row, col) {
    return this.cells[row]?.[col] ?? null;
  }

  /** All tiles currently on the board. */
  tiles() {
    const out = [];
    for (const row of this.cells) {
      for (const tile of row) if (tile) out.push(tile);
    }
    return out;
  }

  emptyCells() {
    const out = [];
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        if (!this.cells[row][col]) out.push({ row, col });
      }
    }
    return out;
  }

  /**
   * Place a new unit on a random empty cell.
   * @param {number} [level] force a level (used by tests)
   * @returns {Tile|null} null when the board is full
   */
  spawn(level) {
    const empty = this.emptyCells();
    if (empty.length === 0) return null;
    const { row, col } = empty[Math.floor(Math.random() * empty.length)];
    const chosen = level ?? (Math.random() < SPAWN_LEVEL2_CHANCE ? 2 : 1);
    const tile = new Tile(chosen, row, col);
    tile.justSpawned = true;
    this.cells[row][col] = tile;
    return tile;
  }

  /**
   * Attempt a move. An invalid move returns `moved: false` and must not
   * consume a turn or spawn anything.
   *
   * @param {'up'|'down'|'left'|'right'} dir
   */
  move(dir) {
    for (const tile of this.tiles()) {
      tile.justMerged = false;
      tile.justSpawned = false;
    }

    const result = slide(this.cells, dir);
    if (!result.moved) {
      return { moved: false, moves: [], merges: [], spawned: null };
    }

    this.cells = result.cells;
    const spawned = this.spawn();
    return { moved: true, moves: result.moves, merges: result.merges, spawned };
  }

  canMove() {
    return hasMoves(this.cells);
  }

  highestLevel() {
    let best = 0;
    for (const tile of this.tiles()) best = Math.max(best, tile.level);
    return best;
  }

  /** Plain level grid — handy for debugging and tests. */
  toLevels() {
    return this.cells.map((row) => row.map((tile) => (tile ? tile.level : 0)));
  }
}
