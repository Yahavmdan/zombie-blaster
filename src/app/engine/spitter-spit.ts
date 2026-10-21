import { GAME_CONSTANTS, ZOMBIE_TYPES } from '@shared/game-constants';
import { ZombieState, ZombieType } from '@shared/game-entities';
import { Platform } from './engine-types';
import { SPITTER_MOUTH } from './spitter-mouth';
import {
  SPITTER_ATTACK_FRAME_TICKS,
  ZOMBIE_FRAME_SIZE,
  ZombieAnimState,
  ZombieSpriteAnchor,
  zombieSpriteAnchor,
  zombieSpriteSize,
} from './zombie-sprite-animator';

export interface Point {
  x: number;
  y: number;
}

export interface Velocity {
  vx: number;
  vy: number;
}

/** Where a glob burst on a surface: its top and the span the puddle may cover. */
export interface SpitSurface {
  y: number;
  minX: number;
  maxX: number;
}

/** The attack sheet's spit frame (the one with the spray): the frame playing on the hit tick. */
export const SPIT_FRAME: number = Math.floor(
  ZOMBIE_TYPES[ZombieType.Spitter].attackHitTick / SPITTER_ATTACK_FRAME_TICKS,
);

/**
 * The spitter's mouth in the world for one frame of one animation (sprite frames face right;
 * a spitter facing left draws mirrored). Null for frames without a mouth (lying dead).
 */
export function spitterMouth(z: ZombieState, state: ZombieAnimState, frame: number): Point | null {
  const frames: readonly (readonly [number, number] | null)[] | undefined = SPITTER_MOUTH[state];
  const mouth: readonly [number, number] | null | undefined =
    frames?.[Math.min(frame, frames.length - 1)];
  if (!mouth) return null;
  const size: number = zombieSpriteSize(z.type, z.instanceHeight);
  const anchor: ZombieSpriteAnchor = zombieSpriteAnchor('spitter');
  const flipX: boolean = z.facing < 0;
  const drawX: number =
    z.x + z.instanceWidth / 2 - size * (flipX ? 1 - anchor.anchorX : anchor.anchorX);
  const drawY: number = z.y + z.instanceHeight - size * anchor.anchorY;
  const scale: number = size / ZOMBIE_FRAME_SIZE;
  const px: number = flipX ? ZOMBIE_FRAME_SIZE - mouth[0] - 0.5 : mouth[0] + 0.5;
  return { x: drawX + px * scale, y: drawY + (mouth[1] + 0.5) * scale };
}

/**
 * A lobbed shot from `from` that comes down on `to`: horizontal speed `speed`, pulled down by
 * `gravity` every tick (the update adds velocity, then gravity), so it arcs like real spit.
 */
export function aimSpit(from: Point, to: Point, speed: number, gravity: number): Velocity {
  const dx: number = to.x - from.x;
  const dy: number = to.y - from.y;
  const ticks: number = Math.max(1, Math.round(Math.abs(dx) / speed));
  return {
    vx: dx / ticks,
    vy: (dy - (gravity * ticks * (ticks - 1)) / 2) / ticks,
  };
}

/**
 * The surface a falling glob crossed this tick (its top between `prevY` and `y`), or null. The
 * ground is always a surface; platforms are, except the one the spitter stood on.
 */
export function spitSurfaceHit(
  x: number,
  prevY: number,
  y: number,
  platforms: readonly Platform[],
  fromSurfaceY: number | null,
): SpitSurface | null {
  if (y <= prevY) return null;
  let best: SpitSurface | null = null;
  for (const plat of platforms) {
    if (plat.y === fromSurfaceY) continue;
    if (x < plat.x || x > plat.x + plat.width) continue;
    if (prevY > plat.y || y < plat.y) continue;
    if (!best || plat.y < best.y) best = { y: plat.y, minX: plat.x, maxX: plat.x + plat.width };
  }
  if (best) return best;
  if (prevY <= GAME_CONSTANTS.GROUND_Y && y >= GAME_CONSTANTS.GROUND_Y) {
    return { y: GAME_CONSTANTS.GROUND_Y, minX: 0, maxX: GAME_CONSTANTS.CANVAS_WIDTH };
  }
  return null;
}

/** A puddle's centre kept on its surface (it never hangs past an edge). */
export function puddleX(x: number, width: number, surface: SpitSurface): number {
  const half: number = width / 2;
  if (surface.maxX - surface.minX <= width) return (surface.minX + surface.maxX) / 2;
  return Math.min(surface.maxX - half, Math.max(surface.minX + half, x));
}
