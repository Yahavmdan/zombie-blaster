import { GAME_CONSTANTS } from '@shared/index';
import { MagnetPull, ZombieState, ZombieType } from '@shared/game-entities';

/**
 * Monster magnet drags zombies instead of teleporting them. Each zombie braces for a moment
 * (longer the farther it stands), is torn loose, lifted off its feet and pulled along an arc
 * that accelerates into the caster's spot, then drops. Host-simulated; `magnetPull` is synced
 * with the zombie, so clients draw the same drag from state.
 */
export function startMagnetPull(z: ZombieState, targetX: number, targetFeetY: number): void {
  const dist: number = Math.hypot(targetX - z.x, targetFeetY - (z.y + z.instanceHeight));
  const per100: number = dist / 100;
  const pull: MagnetPull = {
    startX: z.x,
    startY: z.y,
    targetX,
    targetY: targetFeetY - z.instanceHeight,
    delayTicks: Math.round(per100 * GAME_CONSTANTS.MAGNET_PULL_DELAY_TICKS_PER_100PX),
    elapsedTicks: 0,
    durationTicks: Math.min(
      GAME_CONSTANTS.MAGNET_PULL_MAX_TICKS,
      Math.round(
        GAME_CONSTANTS.MAGNET_PULL_BASE_TICKS + per100 * GAME_CONSTANTS.MAGNET_PULL_TICKS_PER_100PX,
      ),
    ),
  };
  z.magnetPull = pull;
  z.velocityX = 0;
  z.velocityY = 0;
  z.knockbackFrames = 0;
  // Torn out of whatever it was doing.
  z.attackAnimTimer = 0;
  z.attackHasHit = false;
  z.eatingTargetId = null;
  z.eatingTimer = 0;
}

/** Advances a zombie's drag by one tick. Returns true while the magnet controls the zombie. */
export function advanceMagnetPull(z: ZombieState): boolean {
  const pull: MagnetPull | null = z.magnetPull;
  if (!pull) return false;
  if (pull.delayTicks > 0) {
    pull.delayTicks--;
    z.velocityX = 0;
    z.facing = pull.targetX >= pull.startX ? 1 : -1;
    return true;
  }
  pull.elapsedTicks++;
  const t: number = Math.min(1, pull.elapsedTicks / pull.durationTicks);
  // Magnetic force grows as the gap closes: slow start, accelerating finish.
  const eased: number = t * t;
  const prevX: number = z.x;
  const prevY: number = z.y;
  z.x = pull.startX + (pull.targetX - pull.startX) * eased;
  z.y =
    pull.startY +
    (pull.targetY - pull.startY) * eased -
    GAME_CONSTANTS.MAGNET_PULL_LIFT_PX * Math.sin(Math.PI * t);
  z.velocityX = z.x - prevX;
  z.velocityY = z.y - prevY;
  z.isGrounded = false;
  if (t >= 1) {
    z.magnetPull = null;
    z.velocityX = 0;
    z.velocityY = 0;
    return false;
  }
  return true;
}

/** 0 while bracing, then 0..1 along the drag; null when not pulled. */
export function magnetPullProgress(z: ZombieState): number | null {
  const pull: MagnetPull | null = z.magnetPull;
  if (!pull) return null;
  return pull.delayTicks > 0 ? 0 : Math.min(1, pull.elapsedTicks / pull.durationTicks);
}

/** Starts a drag for every pullable zombie within range of the caster (bosses resist). */
export function pullZombiesToward(
  zombies: ZombieState[],
  casterX: number,
  casterY: number,
  range: number,
): void {
  const casterCX: number = casterX + GAME_CONSTANTS.PLAYER_WIDTH / 2;
  const casterCY: number = casterY + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
  const casterFeetY: number = casterY + GAME_CONSTANTS.PLAYER_HEIGHT;
  const spreadHalf: number = GAME_CONSTANTS.PLAYER_WIDTH * 2;
  for (const z of zombies) {
    if (z.isDead || z.spawnTimer > 0) continue;
    if (z.type === ZombieType.Boss || z.type === ZombieType.DragonBoss) continue;
    const dist: number = Math.hypot(
      z.x + z.instanceWidth / 2 - casterCX,
      z.y + z.instanceHeight / 2 - casterCY,
    );
    if (dist > range) continue;
    const offsetX: number = (Math.random() - 0.5) * spreadHalf * 2;
    startMagnetPull(z, casterX + offsetX, casterFeetY);
  }
}
