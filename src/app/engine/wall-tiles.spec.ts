import { describe, expect, it } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import { wallBodyTiles } from './wall-tiles';

const TILE: number = GAME_CONSTANTS.LEVEL_TILE_PX;
const PALETTE: readonly number[] = GAME_CONSTANTS.WALL_BODY_TILES;

describe('wallBodyTiles', (): void => {
  it('never repeats a tile next to or under its neighbour, wherever the wall stands', (): void => {
    for (let x: number = 0; x < 40 * TILE; x += 3 * TILE) {
      for (let y: number = 0; y < 20 * TILE; y += 2 * TILE) {
        const grid: number[][] = wallBodyTiles({ x, y }, 6, 8, TILE, PALETTE);
        grid.forEach((tiles: number[], row: number): void => {
          tiles.forEach((id: number, col: number): void => {
            expect(PALETTE).toContain(id);
            if (col > 0) expect(id, `x ${x} y ${y} row ${row} col ${col}`).not.toBe(tiles[col - 1]);
            if (row > 0)
              expect(id, `x ${x} y ${y} row ${row} col ${col}`).not.toBe(grid[row - 1][col]);
          });
        });
      }
    }
  });

  it('mixes the palette: a wall is not a few tiles repeated', (): void => {
    const grid: number[][] = wallBodyTiles({ x: 320, y: 128 }, 4, 8, TILE, PALETTE);
    expect(new Set<number>(grid.flat()).size).toBeGreaterThanOrEqual(PALETTE.length / 2);
  });

  it('is the same on every client, and a wall made taller keeps the tiles it had', (): void => {
    const short: number[][] = wallBodyTiles({ x: 64, y: 96 }, 3, 4, TILE, PALETTE);
    expect(wallBodyTiles({ x: 64, y: 96 }, 3, 4, TILE, PALETTE)).toEqual(short);
    expect(wallBodyTiles({ x: 64, y: 96 }, 3, 7, TILE, PALETTE).slice(0, 4)).toEqual(short);
  });
});
