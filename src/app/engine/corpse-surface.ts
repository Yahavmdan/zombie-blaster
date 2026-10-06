import { GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse } from '@shared/game-entities';

/**
 * Walkable surface a corpse provides: a narrow, low foothold, so piles grow slowly. Every corpse
 * is the same wherever it falls, the pile under the exit included.
 */
export interface CorpseSurface {
  x: number;
  width: number;
  y: number;
}

export function corpseSurface(corpse: ZombieCorpse): CorpseSurface {
  const width: number = corpse.width * GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_WIDTH_RATIO;
  return {
    x: corpse.x + (corpse.width - width) / 2,
    width,
    y: corpse.y + corpse.height - GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_HEIGHT,
  };
}
