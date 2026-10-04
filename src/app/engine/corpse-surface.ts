import { GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse } from '@shared/game-entities';

/**
 * Walkable surface a corpse provides. Ordinary corpses give a narrow, low foothold (piles grow
 * slowly); exit-stack corpses give a wide step so players can climb the stack like stairs.
 */
export interface CorpseSurface {
  x: number;
  width: number;
  y: number;
}

export function corpseSurface(corpse: ZombieCorpse): CorpseSurface {
  const ratio: number = corpse.anchored
    ? GAME_CONSTANTS.EXIT_STACK_STEP_WIDTH_RATIO
    : GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_WIDTH_RATIO;
  const width: number = corpse.width * ratio;
  return {
    x: corpse.x + (corpse.width - width) / 2,
    width,
    y: corpse.y + corpse.height - corpse.platformHeight,
  };
}

/** Horizontal offset of the nth body in the exit pile: left, center, right, so it reads as a heap. */
export function exitPileOffset(index: number): number {
  const pattern: number[] = [0, -1, 1];
  return pattern[index % pattern.length] * GAME_CONSTANTS.EXIT_STACK_SPREAD_PX;
}
