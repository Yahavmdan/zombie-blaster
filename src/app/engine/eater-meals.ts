import { GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse } from '@shared/game-entities';
import { Platform, PlatePuzzleLayout, SpringPuzzleLayout } from './engine-types';
import { CorpseSurface, corpseSurface } from './corpse-surface';
import { restsOnScale } from './spring-puzzle';
import { corpseOnPlate } from './plate-puzzle';

/** What decides which corpses an Eater may eat. */
export interface MealContext {
  corpses: ZombieCorpse[];
  platforms: Platform[];
  exitPlatform: Platform;
  springPuzzle: SpringPuzzleLayout | null;
  platePuzzle: PlatePuzzleLayout | null;
}

/**
 * Food for an Eater: a corpse lying in the world, but not where players need the bodies or where
 * it can't go: the pile under the exit, the floor-3 scale, the floor-5 plate and the safe spot.
 */
export function isEaterFood(corpse: ZombieCorpse, ctx: MealContext): boolean {
  if (!corpse.isGrounded || corpse.carrierId !== null) return false;
  const bottom: number = corpse.y + corpse.height;
  if (onSafeSpot(corpse, bottom, ctx.platforms)) return false;
  if (underExit(corpse, ctx.exitPlatform)) return false;
  if (ctx.springPuzzle && restsOnScale(corpse.x, corpse.width, bottom, ctx.springPuzzle)) {
    return false;
  }
  return !(ctx.platePuzzle && corpseOnPlate(corpse, ctx.platePuzzle));
}

/** The food an Eater can bite into now: not buried under another corpse (it eats a pile from the top). */
export function isEaterMeal(corpse: ZombieCorpse, ctx: MealContext): boolean {
  return isEaterFood(corpse, ctx) && !isBuried(corpse, ctx.corpses);
}

function onSafeSpot(corpse: ZombieCorpse, bottom: number, platforms: Platform[]): boolean {
  const spot: Platform | undefined = platforms.find((p: Platform): boolean => p.safe === true);
  if (!spot) return false;
  // Any part of it up there (a body hanging over the ledge's end rests on it too).
  const overlaps: boolean = corpse.x < spot.x + spot.width && corpse.x + corpse.width > spot.x;
  return overlaps && bottom <= spot.y + 1;
}

/** In the exit's column, where the pile up to it grows. */
function underExit(corpse: ZombieCorpse, exit: Platform): boolean {
  const foot: CorpseSurface = corpseSurface(corpse);
  return foot.x + foot.width > exit.x && foot.x < exit.x + exit.width;
}

/** Another lying corpse rests on this one's foothold. */
function isBuried(corpse: ZombieCorpse, corpses: ZombieCorpse[]): boolean {
  const foot: CorpseSurface = corpseSurface(corpse);
  return corpses.some((other: ZombieCorpse): boolean => {
    if (other === corpse || !other.isGrounded || other.carrierId !== null) return false;
    const top: CorpseSurface = corpseSurface(other);
    const otherBottom: number = other.y + other.height;
    // Higher up than this one (not a neighbour on the same floor), on its foothold.
    const restsOn: boolean =
      otherBottom < corpse.y + corpse.height - 1 &&
      Math.abs(otherBottom - foot.y) <= GAME_CONSTANTS.ZOMBIE_CORPSE_SNAP_TOLERANCE;
    return restsOn && top.x + top.width > foot.x && top.x < foot.x + foot.width;
  });
}
