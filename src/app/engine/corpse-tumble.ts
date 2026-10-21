import { GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse } from '@shared/game-entities';
import { limitTilt } from './prop-tumble';

/**
 * Corpse tumbling (pure, so the host's corpse physics and the tests share the math). A tossed,
 * blasted or flying-killed body tilts the way it flies (`ZombieCorpse.angle`, never past
 * CORPSE_MAX_TILT: it is limp, it doesn't cartwheel), bounces a little off a hard landing, slides
 * on along what it landed on and flops back flat. Its box stays upright: the tilt is drawn only.
 */

/** One tick in the air: sideways drag and the tilt. Gravity and the move are the caller's. */
export function flyCorpse(c: ZombieCorpse): void {
  c.velocityX *= GAME_CONSTANTS.CORPSE_AIR_DRAG;
  if (Math.abs(c.velocityX) < 0.1) c.velocityX = 0;
  limitTilt(c, GAME_CONSTANTS.CORPSE_MAX_TILT);
  c.angle += c.spin;
}

/**
 * The falling corpse's box bottom reached `surfaceY`: it lands there. A hard landing bounces it
 * back up (turning slower); otherwise it stays down, sliding on with part of its sideways speed.
 * Returns true when it stays down.
 */
export function landCorpse(c: ZombieCorpse, surfaceY: number): boolean {
  c.y = surfaceY - c.height;
  c.velocityX *= GAME_CONSTANTS.CORPSE_LAND_KEEP_SPEED;
  if (c.velocityY > GAME_CONSTANTS.CORPSE_BOUNCE_MIN_SPEED) {
    c.velocityY = -c.velocityY * GAME_CONSTANTS.CORPSE_BOUNCE;
    c.spin /= 2;
    return false;
  }
  c.velocityY = 0;
  if (Math.abs(c.velocityX) < 0.1) c.velocityX = 0;
  c.spin = 0;
  c.isGrounded = true;
  return true;
}

/** One tick on the ground: it slides on, slowing, and flops back flat. */
export function slideCorpse(c: ZombieCorpse): void {
  c.x += c.velocityX;
  c.velocityX *= GAME_CONSTANTS.CORPSE_SLIDE_FRICTION;
  if (Math.abs(c.velocityX) < 0.1) c.velocityX = 0;
  const step: number = Math.min(Math.abs(c.angle), GAME_CONSTANTS.CORPSE_SETTLE_SPIN);
  c.angle -= Math.sign(c.angle) * step;
  if (Math.abs(c.angle) < 1e-3) c.angle = 0;
}

/** Still and flat: nothing left to move. */
export function corpseAtRest(c: ZombieCorpse): boolean {
  return c.velocityX === 0 && c.angle === 0;
}

/** How fast a zombie killed flying at this sideways speed turns (it keeps tumbling that way). */
export function deathSpin(velocityX: number): number {
  return velocityX * GAME_CONSTANTS.CORPSE_HIT_SPIN_PER_SPEED;
}
