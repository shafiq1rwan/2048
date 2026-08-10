/**
 * The 2048 slide/merge rules, kept pure so they can be unit tested and
 * so the renderer can be handed an exact description of what moved.
 */

export const DIRECTIONS = ['up', 'down', 'left', 'right'];

/**
 * Cell coordinates along one traversal line, ordered front-first
 * (the front is the edge the tiles are sliding towards).
 */
function lineCoords(dir, index, size) {
  const coords = [];
  for (let i = 0; i < size; i++) {
    switch (dir) {
      case 'left':
        coords.push({ row: index, col: i });
        break;
      case 'right':
        coords.push({ row: index, col: size - 1 - i });
        break;
      case 'up':
        coords.push({ row: i, col: index });
        break;
      case 'down':
        coords.push({ row: size - 1 - i, col: index });
        break;
      default:
        throw new Error(`unknown direction "${dir}"`);
    }
  }
  return coords;
}

/**
 * Locked tiles (rubble, frozen units) act as walls: they hold their
 * cell, and free tiles slide up against them without crossing. Reads
 * the properties directly so plain `{level}` objects in tests count as
 * ordinary unlocked tiles.
 */
function isLocked(tile) {
  return Boolean(tile && (tile.kind === 'rubble' || tile.frozenFor > 0));
}

/**
 * Resolve one move.
 *
 * Tiles mutate their own row/col/level so the renderer can read final
 * state straight off them, while `moves` records where each tile came
 * from for the slide animation.
 *
 * @param {(import('./Tile.js').Tile|null)[][]} cells grid[row][col]
 * @param {'up'|'down'|'left'|'right'} dir
 * @returns {{
 *   moved: boolean,
 *   cells: (import('./Tile.js').Tile|null)[][],
 *   moves: Array<{tile: object, from: {row:number,col:number}, to: {row:number,col:number}, absorbed?: boolean}>,
 *   merges: Array<{tile: object, absorbed: object, level: number, at: {row:number,col:number}}>
 * }}
 */
export function slide(cells, dir) {
  const size = cells.length;
  const next = Array.from({ length: size }, () => new Array(size).fill(null));
  const moves = [];
  const merges = [];
  let moved = false;

  /** Slide + merge the free tiles occupying coords[start..end). */
  const runSegment = (coords, start, end) => {
    const queue = [];
    for (let pos = start; pos < end; pos++) {
      const tile = cells[coords[pos].row][coords[pos].col];
      if (tile) queue.push(tile);
    }

    let slot = start;
    let i = 0;
    while (i < queue.length) {
      const tile = queue[i];
      const partner = queue[i + 1];
      const target = coords[slot];

      if (partner && partner.level === tile.level) {
        // Front tile survives and levels up; the follower is absorbed.
        const from = { row: tile.row, col: tile.col };
        const partnerFrom = { row: partner.row, col: partner.col };

        tile.row = target.row;
        tile.col = target.col;
        tile.level += 1;
        tile.justMerged = true;

        partner.row = target.row;
        partner.col = target.col;

        next[target.row][target.col] = tile;
        moves.push({ tile, from, to: { ...target } });
        moves.push({ tile: partner, from: partnerFrom, to: { ...target }, absorbed: true });
        merges.push({ tile, absorbed: partner, level: tile.level, at: { ...target } });
        moved = true;
        i += 2;
      } else {
        const from = { row: tile.row, col: tile.col };
        if (from.row !== target.row || from.col !== target.col) {
          tile.row = target.row;
          tile.col = target.col;
          moves.push({ tile, from, to: { ...target } });
          moved = true;
        }
        next[target.row][target.col] = tile;
        i += 1;
      }
      slot++;
    }
  };

  for (let index = 0; index < size; index++) {
    const coords = lineCoords(dir, index, size);

    // Locked tiles split the line into independent segments.
    let segStart = 0;
    for (let pos = 0; pos <= size; pos++) {
      const coord = pos < size ? coords[pos] : null;
      const tile = coord ? cells[coord.row][coord.col] : null;
      if (pos === size || isLocked(tile)) {
        runSegment(coords, segStart, pos);
        if (tile) next[coord.row][coord.col] = tile;
        segStart = pos + 1;
      }
    }
  }

  return { moved, cells: next, moves, merges };
}

/** True if any direction would change the board. */
export function hasMoves(cells) {
  const size = cells.length;
  const freeUnitAt = (row, col) => {
    const tile = cells[row]?.[col] ?? null;
    return tile && !isLocked(tile) ? tile : null;
  };

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const tile = cells[row][col];
      if (!tile) {
        // An empty cell is only an option if a free tile can actually
        // slide into it — with rubble walls around, it may not be.
        if (
          freeUnitAt(row - 1, col) ||
          freeUnitAt(row + 1, col) ||
          freeUnitAt(row, col - 1) ||
          freeUnitAt(row, col + 1)
        ) {
          return true;
        }
        continue;
      }
      if (isLocked(tile)) continue;
      const right = freeUnitAt(row, col + 1);
      const down = freeUnitAt(row + 1, col);
      if (right && right.level === tile.level) return true;
      if (down && down.level === tile.level) return true;
    }
  }
  return false;
}
