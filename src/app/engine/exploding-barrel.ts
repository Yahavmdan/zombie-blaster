import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { LooseProp, ZombieState, ZombieType } from '@shared/game-entities';
import { Point } from './boulder-puzzle';

/**
 * Exploding barrel rules, free of engine state so the host system, the renderer and the tests use
 * the same math. An attack on a barrel lights its fuse; BARREL_FUSE_TICKS later it blows up,
 * hurting every zombie near it and setting off the barrels next to it (a chain reaction).
 */

/**
 * An attacking player next to a barrel that isn't lit yet (within reach, level with it) and
 * facing it lights it. A carried barrel can't be hit; a lit one keeps burning while carried.
 */
export function barrelHitBy(
  player: Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>,
  barrel: LooseProp,
): boolean {
  if (barrel.fuseTicks > 0 || barrel.carrierId !== null) return false;
  if (!player.isAttacking || player.isDead || player.isDown) return false;
  const width: number = GAME_CONSTANTS.PLAYER_WIDTH;
  const top: number = player.y;
  const bottom: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT;
  if (bottom <= barrel.y || top >= barrel.y + barrel.height) return false;
  const gap: number = Math.max(
    0,
    Math.max(barrel.x - (player.x + width), player.x - (barrel.x + barrel.width)),
  );
  if (gap > GAME_CONSTANTS.BARREL_HIT_REACH_PX) return false;
  const facing: number = player.facing === Direction.Right ? 1 : -1;
  const side: number = Math.sign(barrel.x + barrel.width / 2 - (player.x + width / 2));
  return side === 0 || side === facing;
}

/** Lights the fuse of a barrel that isn't burning yet. Returns true when it was lit now. */
export function lightFuse(barrel: LooseProp): boolean {
  if (barrel.fuseTicks > 0) return false;
  barrel.fuseTicks = GAME_CONSTANTS.BARREL_FUSE_TICKS;
  return true;
}

/** A barrel caught in another's blast blows up soon after (never later than its own fuse). */
export function chainFuse(barrel: LooseProp): void {
  const chain: number = GAME_CONSTANTS.BARREL_CHAIN_FUSE_TICKS;
  barrel.fuseTicks = barrel.fuseTicks > 0 ? Math.min(barrel.fuseTicks, chain) : chain;
}

/** One host tick of a burning fuse. Returns true on the tick it runs out: the blast. */
export function tickFuse(barrel: LooseProp): boolean {
  if (barrel.fuseTicks <= 0) return false;
  barrel.fuseTicks--;
  return barrel.fuseTicks === 0;
}

/** Whole seconds left on a burning fuse (3, 2, 1), 0 when not lit. */
export function fuseSeconds(barrel: LooseProp): number {
  return Math.ceil(barrel.fuseTicks / GAME_CONSTANTS.TICK_RATE);
}

export function blastCenter(barrel: LooseProp): Point {
  return { x: barrel.x + barrel.width / 2, y: barrel.y + barrel.height / 2 };
}

function inBlast(center: Point, x: number, y: number): boolean {
  return Math.hypot(x - center.x, y - center.y) <= GAME_CONSTANTS.BARREL_BLAST_RADIUS_PX;
}

/** Living zombies whose center is within the blast. */
export function blastZombies<
  T extends Pick<ZombieState, 'x' | 'y' | 'instanceWidth' | 'instanceHeight' | 'isDead'>,
>(zombies: T[], center: Point): T[] {
  return zombies.filter(
    (z: T): boolean =>
      !z.isDead && inBlast(center, z.x + z.instanceWidth / 2, z.y + z.instanceHeight / 2),
  );
}

/** Other barrels whose center is within the blast: they go up next. */
export function blastBarrels(barrels: LooseProp[], center: Point): LooseProp[] {
  return barrels.filter((b: LooseProp): boolean => {
    const c: Point = blastCenter(b);
    return inBlast(center, c.x, c.y);
  });
}

/** What the blast takes off a zombie: a share of its max HP (a small one for bosses), at least 1. */
export function blastDamage(zombie: Pick<ZombieState, 'type' | 'maxHp'>): number {
  const isBoss: boolean = zombie.type === ZombieType.Boss || zombie.type === ZombieType.DragonBoss;
  const percent: number = isBoss
    ? GAME_CONSTANTS.BARREL_BLAST_BOSS_DAMAGE_PERCENT
    : GAME_CONSTANTS.BARREL_BLAST_DAMAGE_PERCENT;
  return Math.max(1, Math.ceil((zombie.maxHp * percent) / 100));
}
