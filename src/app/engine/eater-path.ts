import { GAME_CONSTANTS } from '@shared/index';
import { Platform } from './engine-types';

/** A point where feet stand (center x, bottom y). */
export interface Feet {
  x: number;
  y: number;
}

/** What an Eater does this tick on its way to a goal. */
export interface EaterStep {
  /** Where to run to (center x). */
  aimX: number;
  /** Jump now: straight up through a ledge overhead, or a leap across to one (`jumpVx`). */
  jump: boolean;
  /** Sideways speed of the jump: 0 straight up, else what carries it onto the ledge it leaps to. */
  jumpVx: number;
  /** Drop through the platform it stands on (the goal is below). */
  drop: boolean;
}

/** How high (px) an Eater's jump lifts its feet onto a ledge, with a margin for landing. */
export function eaterJumpReach(gravity: number): number {
  const v: number = GAME_CONSTANTS.ZOMBIE_EATER_JUMP_FORCE;
  return (v * v) / (2 * gravity) - GAME_CONSTANTS.ZOMBIE_EATER_JUMP_MARGIN_PX;
}

/**
 * The way to a goal over the level's platforms (all one-way from below). A goal within one jump
 * is jumped to: straight up from under its ledge, or a leap from the edge of the ledge it stands
 * on when the two don't overlap. A higher goal is climbed ledge by ledge (the reachable ledge with
 * the shortest detour), a lower one dropped down to.
 */
export function eaterStep(
  feet: Feet,
  halfWidth: number,
  goal: Feet,
  platforms: Platform[],
  gravity: number,
): EaterStep {
  const tolerance: number = GAME_CONSTANTS.ZOMBIE_EATER_LEVEL_TOLERANCE_PX;
  const rise: number = feet.y - goal.y;
  const walk: (x: number) => EaterStep = (x: number): EaterStep => ({
    aimX: x,
    jump: false,
    jumpVx: 0,
    drop: false,
  });

  if (rise < -tolerance) {
    const platform: Platform | null = surfaceUnder(feet, platforms);
    if (platform && platform.y < GAME_CONSTANTS.GROUND_Y) return { ...walk(goal.x), drop: true };
    // On a head or a pile there is nothing to drop through: step off it toward the goal.
    const dir: number = goal.x >= feet.x ? 1 : -1;
    const clear: number = halfWidth * GAME_CONSTANTS.ZOMBIE_EATER_STEP_OFF_WIDTHS;
    return walk(Math.abs(goal.x - feet.x) > clear ? goal.x : feet.x + dir * clear);
  }
  if (rise <= tolerance) return walk(goal.x);

  const reach: number = eaterJumpReach(gravity);
  const ledges: Platform[] = platforms.filter(
    (p: Platform): boolean =>
      !p.safe &&
      !p.solid &&
      p.y < feet.y - tolerance &&
      feet.y - p.y <= reach &&
      p.y >= goal.y - tolerance,
  );
  if (ledges.length === 0) {
    // Nothing to climb by (a corpse pile, say): hop at the goal.
    return { ...walk(goal.x), jump: Math.abs(goal.x - feet.x) <= halfWidth };
  }

  const standingOn: Platform | null = surfaceUnder(feet, platforms);
  let best: Platform = ledges[0];
  let bestCost: number = Infinity;
  for (const p of ledges) {
    const x: number = takeoff(p, standingOn, halfWidth, feet.x).x;
    // The goal's own ledge first, then the shortest walk there and on to the goal.
    const onGoalLedge: boolean =
      Math.abs(p.y - goal.y) <= tolerance && goal.x >= p.x && goal.x <= p.x + p.width;
    const cost: number = (onGoalLedge ? 0 : 10_000) + Math.abs(x - feet.x) + Math.abs(x - goal.x);
    if (cost < bestCost) {
      bestCost = cost;
      best = p;
    }
  }

  const from: Takeoff = takeoff(best, standingOn, halfWidth, feet.x);
  const ready: boolean = Math.abs(from.x - feet.x) <= GAME_CONSTANTS.ZOMBIE_EATER_ARRIVE_THRESHOLD;
  return {
    aimX: from.x,
    jump: ready,
    jumpVx: ready && from.leap ? leapSpeed(feet, halfWidth, best, gravity) : 0,
    drop: false,
  };
}

/** The platform the feet stand on (null on a corpse or in the air). */
function surfaceUnder(feet: Feet, platforms: Platform[]): Platform | null {
  return (
    platforms.find(
      (p: Platform): boolean =>
        Math.abs(p.y - feet.y) <= 1 && feet.x >= p.x && feet.x <= p.x + p.width,
    ) ?? null
  );
}

interface Takeoff {
  x: number;
  /** Across to the ledge from the end of its own platform (else straight up from under it). */
  leap: boolean;
}

/**
 * Where to jump from for a ledge: under it (nearest spot where the whole body fits), or, when
 * that is off the platform it stands on, the end of its platform facing the ledge.
 */
function takeoff(
  ledge: Platform,
  standingOn: Platform | null,
  halfWidth: number,
  x: number,
): Takeoff {
  const under: number = clampInto(ledge, halfWidth, x);
  if (!standingOn || (under >= standingOn.x && under <= standingOn.x + standingOn.width))
    return { x: under, leap: false };
  const rightward: boolean = ledge.x > standingOn.x;
  return {
    x: rightward ? standingOn.x + standingOn.width - halfWidth : standingOn.x + halfWidth,
    leap: true,
  };
}

function clampInto(p: Platform, halfWidth: number, x: number): number {
  const lo: number = p.x + halfWidth + 2;
  const hi: number = p.x + p.width - halfWidth - 2;
  if (lo > hi) return p.x + p.width / 2;
  return Math.min(hi, Math.max(lo, x));
}

/** Sideways speed that lands the body just inside the ledge's near end as it comes down onto it. */
function leapSpeed(feet: Feet, halfWidth: number, ledge: Platform, gravity: number): number {
  const v: number = -GAME_CONSTANTS.ZOMBIE_EATER_JUMP_FORCE;
  const height: number = feet.y - ledge.y;
  const ticks: number = (v + Math.sqrt(Math.max(0, v * v - 2 * gravity * height))) / gravity;
  const rightward: boolean = ledge.x + ledge.width / 2 > feet.x;
  const landX: number = rightward
    ? ledge.x + halfWidth + GAME_CONSTANTS.ZOMBIE_EATER_LEAP_INSET_PX
    : ledge.x + ledge.width - halfWidth - GAME_CONSTANTS.ZOMBIE_EATER_LEAP_INSET_PX;
  const speed: number = Math.min(
    GAME_CONSTANTS.ZOMBIE_EATER_LEAP_MAX_SPEED,
    Math.abs(landX - feet.x) / ticks,
  );
  return rightward ? speed : -speed;
}
