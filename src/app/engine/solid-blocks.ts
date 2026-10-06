import { GAME_CONSTANTS } from '@shared/index';
import { Platform } from './engine-types';

/** How far below a solid's top an entity's feet may be and still count as standing on it. */
const ON_TOP_TOLERANCE_PX: number = 2;

/**
 * Pushes a box (player or zombie) out of the sides of solid props after a horizontal move.
 * Standing on top (feet at or above the prop's top) is not blocked. Returns the corrected x and
 * whether the move was blocked.
 */
export function pushOutOfSolids(
  x: number,
  y: number,
  width: number,
  height: number,
  prevX: number,
  platforms: Platform[],
): { x: number; blocked: boolean } {
  let nx: number = x;
  let blocked: boolean = false;
  const bottom: number = y + height;
  for (const s of platforms) {
    if (!s.solid) continue;
    if (bottom <= s.y + ON_TOP_TOLERANCE_PX || y >= s.y + s.height) continue;
    if (nx + width <= s.x || nx >= s.x + s.width) continue;
    // Push back toward the side it came from; a solid touching a screen edge (the puzzle wall)
    // only has an on-screen side, so anything that ends up inside it (a dash) goes there.
    const fromLeft: boolean =
      s.x + s.width >= GAME_CONSTANTS.CANVAS_WIDTH
        ? true
        : s.x <= 0
          ? false
          : prevX + width / 2 <= s.x + s.width / 2;
    nx = fromLeft ? s.x - width : s.x + s.width;
    blocked = true;
  }
  return { x: nx, blocked };
}
