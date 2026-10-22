import { GAME_CONSTANTS, randomBetween, vary, ZombieState, ZombieType } from '@shared/index';
import { limitTilt } from './prop-tumble';

/**
 * Knocked zombies (pure, host-simulated and synced): every knock throws a little differently. The
 * push and the pop are scaled by a random factor, and the body tilts while it flies
 * (`ZombieState.angle`): mostly leaning with the push, sometimes swept off its feet the other way,
 * more or less each time, never past ZOMBIE_KNOCK_MAX_TILT. Once landed it stands back up. Its box
 * stays upright: the tilt is drawn only. The dragon is a boss: a hit only nudges it, and it never
 * tilts (it never lands, so it would never stand back up).
 */

/** Throws the zombie `dir`-wards (1 right, -1 left) with a varied push and pop, tilting. */
export function knockZombie(
  z: ZombieState,
  dir: number,
  push: number,
  up: number,
  frames: number,
): void {
  if (z.type === ZombieType.DragonBoss) {
    const mult: number = GAME_CONSTANTS.DRAGON_KNOCKBACK_TAKEN_MULT;
    z.velocityX = dir * push * mult;
    z.velocityY = up * mult;
    z.knockbackFrames = GAME_CONSTANTS.DRAGON_KNOCKBACK_FRAMES;
    return;
  }
  z.velocityX = dir * vary(push, GAME_CONSTANTS.ZOMBIE_KNOCK_PUSH_SPREAD);
  z.velocityY = vary(up, GAME_CONSTANTS.ZOMBIE_KNOCK_UP_SPREAD);
  z.isGrounded = false;
  z.knockbackFrames = frames;
  startKnockTilt(z, dir);
}

/** Starts the body turning: mostly leaning with the push, sometimes swept back toward the hitter. */
export function startKnockTilt(z: ZombieState, dir: number): void {
  if (z.type === ZombieType.DragonBoss) return;
  const swept: boolean = Math.random() < GAME_CONSTANTS.ZOMBIE_KNOCK_SWEPT_CHANCE;
  const speed: number = randomBetween(
    GAME_CONSTANTS.ZOMBIE_KNOCK_SPIN_MIN,
    GAME_CONSTANTS.ZOMBIE_KNOCK_SPIN_MAX,
  );
  z.spin = (swept ? -dir : dir) * speed;
}

/** One tick: in the air it keeps turning, slower and slower; on the ground it stands back up. */
export function tickKnockTilt(z: ZombieState): void {
  if (!z.isGrounded) {
    z.spin *= GAME_CONSTANTS.ZOMBIE_KNOCK_SPIN_DRAG;
    limitTilt(z, GAME_CONSTANTS.ZOMBIE_KNOCK_MAX_TILT);
    z.angle += z.spin;
    return;
  }
  z.spin = 0;
  const step: number = Math.min(Math.abs(z.angle), GAME_CONSTANTS.ZOMBIE_KNOCK_SETTLE_SPIN);
  z.angle -= Math.sign(z.angle) * step;
  if (Math.abs(z.angle) < 1e-3) z.angle = 0;
}
