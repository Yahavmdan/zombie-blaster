import { GAME_CONSTANTS } from '@shared/index';
import { Platform } from './engine-types';

/**
 * Each floor has one safe spot: a high ledge reached by its own ladder. A player standing on it
 * (or jumping above it) rests: zombies can't land there, don't hunt them and can't hit them, and
 * the player can't attack from it. Players earn the rest by fighting their way up the ladder.
 *
 * (x, y) is the player's top-left corner.
 */
export function restsOnSafeSpot(platforms: Platform[], x: number, y: number): boolean {
  const spot: Platform | undefined = platforms.find((p: Platform): boolean => p.safe === true);
  if (!spot) return false;
  const centerX: number = x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
  const feet: number = y + GAME_CONSTANTS.PLAYER_HEIGHT;
  return (
    centerX >= spot.x &&
    centerX <= spot.x + spot.width &&
    feet <= spot.y + 1 &&
    feet >= spot.y - GAME_CONSTANTS.SAFE_SPOT_HEADROOM_PX
  );
}
