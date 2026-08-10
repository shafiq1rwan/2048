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

  for (let index = 0; index < size; index++) {
    const coords = lineCoords(dir, index, size);

    const queue = [];
    for (const { row, col } of coords) {
      const tile = cells[row][col];
      if (tile) queue.push(tile);
    }

    let slot = 0;
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
  }

  return { moved, cells: next, moves, merges };
}

/** True if any direction would change the board. */
export function hasMoves(cells) {
  const size = cells.length;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const tile = cells[row][col];
      if (!tile) return true;
      const right = col + 1 < size ? cells[row][col + 1] : null;
      const down = row + 1 < size ? cells[row + 1][col] : null;
      if (right && right.level === tile.level) return true;
      if (down && down.level === tile.level) return true;
    }
  }
  return false;
}
