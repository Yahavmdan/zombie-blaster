import { GAME_CONSTANTS, ZombieEffectRequest, ZombieState, ZombieType } from '@shared/index';

/** Bosses shrug off launches and knockdowns (they still take the stun of a parry or a roar). */
function isHeavy(z: ZombieState): boolean {
  return z.type === ZombieType.Boss || z.type === ZombieType.DragonBoss;
}

/**
 * Applies a skill's push, launch or stun to a zombie on the simulating side (solo or host). A guest's
 * request goes through the same function, clamped so a tampered client can't fling zombies off screen.
 */
export function applyZombieEffect(z: ZombieState, req: ZombieEffectRequest, fixedDt: number): void {
  if (z.isDead || z.spawnTimer > 0 || z.magnetPull) return;
  const dir: number = req.dir < 0 ? -1 : 1;
  const stunMs: number = Math.max(0, Math.min(req.stunMs, GAME_CONSTANTS.SKILL_MAX_REMOTE_STUN_MS));
  const stunTicks: number = Math.round(stunMs / fixedDt);
  if (stunTicks > 0) z.stunTicks = Math.max(z.stunTicks, stunTicks);

  if (req.kind === 'stun') return;
  if (isHeavy(z)) return;
  if (req.kind === 'launch') {
    const force: number = Math.max(
      0,
      Math.min(req.force, GAME_CONSTANTS.SKILL_MAX_REMOTE_LAUNCH_FORCE),
    );
    z.velocityY = -force;
    z.velocityX = dir * GAME_CONSTANTS.SKILL_LAUNCH_DRIFT_SPEED;
    z.isGrounded = false;
    z.knockbackFrames = 0;
    return;
  }
  const push: number = Math.max(0, Math.min(req.force, GAME_CONSTANTS.SKILL_MAX_REMOTE_PUSH_FORCE));
  z.velocityX = dir * push;
  z.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
  z.isGrounded = false;
  z.knockbackFrames = GAME_CONSTANTS.KNOCKBACK_ZOMBIE_FRAMES;
}

/** Launch speed (px per tick, upward) that throws a body this many px high under normal gravity. */
export function launchForceForHeight(heightPx: number): number {
  return Math.sqrt(2 * GAME_CONSTANTS.GRAVITY * Math.max(0, heightPx));
}

/** Ticks a body launched at this speed stays in the air before it is back at the same height. */
export function airTimeTicks(force: number): number {
  return Math.ceil((2 * force) / GAME_CONSTANTS.GRAVITY);
}
