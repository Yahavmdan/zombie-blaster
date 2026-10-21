import { CharacterState, Direction, GAME_CONSTANTS, vary } from '@shared/index';
import { LooseProp, ZombieCorpse, ZombieState, ZombieType } from '@shared/game-entities';
import { Point } from './boulder-puzzle';

/**
 * Exploding barrel rules, free of engine state so the host system, the renderer and the tests use
 * the same math. An attack on a barrel lights its fuse; BARREL_FUSE_TICKS later it blows up,
 * hurting every zombie and player near it, throwing the corpses lying there and setting off the
 * barrels next to it (a chain reaction).
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

/**
 * Share (0..1) of its full damage the blast does to something whose center is at (x, y): all of it
 * within BARREL_BLAST_CORE_RADIUS_PX, falling off squared to BARREL_BLAST_EDGE_DAMAGE_SCALE at the
 * edge of the radius, so right beside the barrel is far worse than a bit away from it.
 */
export function blastFalloff(center: Point, x: number, y: number): number {
  const core: number = GAME_CONSTANTS.BARREL_BLAST_CORE_RADIUS_PX;
  const span: number = GAME_CONSTANTS.BARREL_BLAST_RADIUS_PX - core;
  const distance: number = Math.hypot(x - center.x, y - center.y);
  const t: number = Math.min(1, Math.max(0, (distance - core) / span));
  const edge: number = GAME_CONSTANTS.BARREL_BLAST_EDGE_DAMAGE_SCALE;
  return edge + (1 - edge) * (1 - t) * (1 - t);
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

/** Standing (not down, not dead) players whose center is within the blast, whoever lit it. */
export function blastPlayers<T extends Pick<CharacterState, 'x' | 'y' | 'isDead' | 'isDown'>>(
  players: T[],
  center: Point,
): T[] {
  return players.filter(
    (p: T): boolean =>
      !p.isDead &&
      !p.isDown &&
      inBlast(
        center,
        p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
        p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      ),
  );
}

/** What the blast takes off a player: a share of their max HP scaled by `falloff` (blastFalloff), at least 1. */
export function blastPlayerDamage(maxHp: number, falloff: number): number {
  const percent: number = GAME_CONSTANTS.BARREL_BLAST_PLAYER_DAMAGE_PERCENT * falloff;
  return Math.max(1, Math.ceil((maxHp * percent) / 100));
}

/** The side (-1 or 1) the blast throws something whose center is at `x`: away from the barrel. */
export function blastPushDir(center: Point, x: number): number {
  return Math.sign(x - center.x) || 1;
}

/** Lying corpses (not carried) whose center is within the blast. */
export function blastCorpses(corpses: ZombieCorpse[], center: Point): ZombieCorpse[] {
  return corpses.filter(
    (c: ZombieCorpse): boolean =>
      c.carrierId === null && inBlast(center, c.x + c.width / 2, c.y + c.height / 2),
  );
}

/**
 * Throws a corpse up and away from the barrel, tilting that way; it falls and lands by normal
 * corpse physics (corpse-tumble).
 */
export function flingCorpse(corpse: ZombieCorpse, center: Point): void {
  const dir: number = blastPushDir(center, corpse.x + corpse.width / 2);
  // No two bodies fly alike: a varied throw and turn.
  corpse.velocityX = dir * vary(GAME_CONSTANTS.BARREL_BLAST_CORPSE_SPEED_X, GAME_CONSTANTS.CORPSE_BLAST_SPREAD);
  corpse.velocityY = vary(GAME_CONSTANTS.BARREL_BLAST_CORPSE_SPEED_Y, GAME_CONSTANTS.CORPSE_BLAST_SPREAD);
  corpse.spin = dir * vary(GAME_CONSTANTS.CORPSE_BLAST_SPIN, GAME_CONSTANTS.CORPSE_SPIN_SPREAD);
  corpse.isGrounded = false;
}

/** Lying or flying props (not carried) whose center is within the blast: it throws them. */
export function blastProps(props: LooseProp[], center: Point): LooseProp[] {
  return props.filter((p: LooseProp): boolean => {
    const c: Point = blastCenter(p);
    return p.carrierId === null && inBlast(center, c.x, c.y);
  });
}

/** How the blast throws a prop: up and away from the barrel, tumbling that way. */
export function propFling(prop: LooseProp, center: Point): { vx: number; vy: number; spin: number } {
  const dir: number = blastPushDir(center, prop.x + prop.width / 2);
  return {
    vx: dir * GAME_CONSTANTS.PROP_BLAST_SPEED_X,
    vy: GAME_CONSTANTS.PROP_BLAST_SPEED_Y,
    spin: dir * GAME_CONSTANTS.PROP_BLAST_SPIN,
  };
}

/** Other barrels whose center is within the blast: they go up next. */
export function blastBarrels(barrels: LooseProp[], center: Point): LooseProp[] {
  return barrels.filter((b: LooseProp): boolean => {
    const c: Point = blastCenter(b);
    return inBlast(center, c.x, c.y);
  });
}

/**
 * What the blast takes off a zombie: a share of its max HP (a small one for bosses) scaled by
 * `falloff` (blastFalloff), at least 1.
 */
export function blastDamage(zombie: Pick<ZombieState, 'type' | 'maxHp'>, falloff: number): number {
  const isBoss: boolean = zombie.type === ZombieType.Boss || zombie.type === ZombieType.DragonBoss;
  const percent: number = isBoss
    ? GAME_CONSTANTS.BARREL_BLAST_BOSS_DAMAGE_PERCENT
    : GAME_CONSTANTS.BARREL_BLAST_DAMAGE_PERCENT;
  return Math.max(1, Math.ceil((zombie.maxHp * percent * falloff) / 100));
}
