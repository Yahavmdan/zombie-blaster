import { Point } from './boulder-puzzle';

/** Small odd multipliers that scatter neighbouring tile coordinates. */
const HASH_X: number = 0x9e3779b1;
const HASH_Y: number = 0x85ebca6b;
const HASH_MIX: number = 0xc2b2ae35;

/** A stable pseudo-random number from a tile's place on the map. */
function tileHash(col: number, row: number): number {
  const mixed: number = Math.imul(col, HASH_X) ^ Math.imul(row, HASH_Y);
  return Math.imul(mixed ^ (mixed >>> 15), HASH_MIX) >>> 0;
}

/**
 * The tile ids of a plain wall, `grid[row][col]`: a mix of `palette` picked by each tile's place on
 * the map, so the same wall always looks the same on every client, stretching one keeps the tiles
 * it had, and no tile matches the one left of it or above it. Row 0 takes part so row 1 varies from
 * something, whatever the caller draws there.
 */
export function wallBodyTiles(
  origin: Point,
  cols: number,
  rows: number,
  tileSize: number,
  palette: readonly number[],
): number[][] {
  const left: number = Math.floor(origin.x / tileSize);
  const top: number = Math.floor(origin.y / tileSize);
  const grid: number[][] = [];
  for (let row: number = 0; row < rows; row++) {
    const tiles: number[] = [];
    for (let col: number = 0; col < cols; col++) {
      let index: number = tileHash(left + col, top + row) % palette.length;
      const taken: (id: number) => boolean = (id: number): boolean =>
        id === tiles[col - 1] || id === grid[row - 1]?.[col];
      for (let tries: number = 0; tries < 2 && taken(palette[index]); tries++) {
        index = (index + 1) % palette.length;
      }
      tiles.push(palette[index]);
    }
    grid.push(tiles);
  }
  return grid;
}
