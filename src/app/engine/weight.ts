import { GAME_CONSTANTS, ZOMBIE_TYPES } from '@shared/index';
import { LooseProp, ZombieCorpse, ZombieType } from '@shared/game-entities';

/**
 * Weights (kg) of bodies and objects. The numbers live in `shared/game-constants.ts`
 * (PLAYER_WEIGHT_KG, ZOMBIE_TYPES[type].weightKg, PROP_WEIGHT_KG); these helpers apply them.
 */

/** A zombie of this type, alive or as a corpse (0 for a type this build does not know). */
export function zombieWeightKg(type: ZombieType): number {
  return ZOMBIE_TYPES[type]?.weightKg ?? 0;
}

/** A player's body plus every corpse and prop they carry overhead. */
export function playerLoadKg(
  playerId: string,
  corpses: ZombieCorpse[],
  props: LooseProp[],
): number {
  const bodies: number = corpses
    .filter((c: ZombieCorpse): boolean => c.carrierId === playerId)
    .reduce((sum: number, c: ZombieCorpse): number => sum + zombieWeightKg(c.type), 0);
  const things: number = props
    .filter((p: LooseProp): boolean => p.carrierId === playerId)
    .reduce((sum: number, p: LooseProp): number => sum + p.weightKg, 0);
  return GAME_CONSTANTS.PLAYER_WEIGHT_KG + bodies + things;
}
