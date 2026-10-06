import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { SpringState, ZombieCorpse } from '@shared/game-entities';
import { Box } from './boulder-puzzle';
import { Platform, SpringPuzzleLayout } from './engine-types';

/**
 * Floor-3 spring puzzle rules, free of engine state so the host system, the client, the renderer
 * and the tests all use the same math.
 *
 * The exit hangs at the very top of the screen. Straight under it, at the screen edge, stands a
 * big spring (a solid block one hop high). Corpses landing on it charge it. With a full charge, a
 * hit on the lever beside it starts a 3-2-1: when it runs out, the spring launches everyone
 * standing on it (or on the corpses piled on it) straight up to the exit. It stays charged.
 */
export type LeverPull = 'countdown' | 'wobble';

/** How far the plate sinks while the spring winds up, and how far it shoots up on release. */
const WIND_PX: number = 6;
const RELEASE_PX: number = 30;

export const SPRING_FLOOR_HINT: string = 'Pile corpses on the spring, pull its lever and hop on';

/** Horizontal span of the spring: under the whole exit, from the screen edge. */
export function springSpan(puzzle: SpringPuzzleLayout): [number, number] {
  return [puzzle.spring.x, puzzle.spring.x + puzzle.spring.width];
}

/** The lever on the ground beside the spring's open side (toward the screen center). */
export function leverBox(puzzle: SpringPuzzleLayout): Box {
  const width: number = GAME_CONSTANTS.SPRING_LEVER_WIDTH_PX;
  const height: number = GAME_CONSTANTS.SPRING_LEVER_HEIGHT_PX;
  const gap: number = GAME_CONSTANTS.SPRING_LEVER_GAP_PX;
  const s: Platform = puzzle.spring;
  const x: number = puzzle.side === 1 ? s.x - gap - width : s.x + s.width + gap;
  return { x, y: GAME_CONSTANTS.GROUND_Y - height, width, height };
}

/** Corpses resting on the spring (or piled on corpses there): its charge. */
export function chargeCorpses(corpses: ZombieCorpse[], puzzle: SpringPuzzleLayout): ZombieCorpse[] {
  const [left, right]: [number, number] = springSpan(puzzle);
  const top: number = puzzle.spring.y;
  return corpses.filter((c: ZombieCorpse): boolean => {
    if (!c.isGrounded) return false;
    const cx: number = c.x + c.width / 2;
    const feet: number = c.y + c.height;
    return cx >= left && cx <= right && feet <= top + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE;
  });
}

export function isCharged(count: number): boolean {
  return count >= GAME_CONSTANTS.SPRING_CHARGE_CORPSES;
}

/** True while it counts down, bounces or jiggles: the lever can't be pulled again yet. */
export function isBusy(state: SpringState): boolean {
  return state.countdownTicks > 0 || state.bounceTicks > 0 || state.wobbleTicks > 0;
}

/**
 * An attacking player next to the lever (within reach, level with it) and facing it pulls it:
 * from the ground beside it or from the spring.
 */
export function leverHitBy(
  player: Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>,
  puzzle: SpringPuzzleLayout,
): boolean {
  if (!player.isAttacking || player.isDead || player.isDown) return false;
  const lever: Box = leverBox(puzzle);
  const width: number = GAME_CONSTANTS.PLAYER_WIDTH;
  const top: number = player.y;
  const bottom: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT;
  if (bottom <= lever.y || top >= lever.y + lever.height) return false;
  const gap: number = Math.max(
    0,
    Math.max(lever.x - (player.x + width), player.x - (lever.x + lever.width)),
  );
  if (gap > GAME_CONSTANTS.SPRING_HIT_REACH_PX) return false;
  const facing: number = player.facing === Direction.Right ? 1 : -1;
  const side: number = Math.sign(lever.x + lever.width / 2 - (player.x + width / 2));
  return side === 0 || side === facing;
}

/**
 * What a lever pull does: nothing while the spring is busy, a 3-2-1 with a full charge, else a
 * jiggle. Starts it on the state.
 */
export function pullLever(state: SpringState, charge: number): LeverPull | null {
  if (isBusy(state)) return null;
  if (!isCharged(charge)) {
    state.wobbleTicks = GAME_CONSTANTS.SPRING_WOBBLE_TICKS;
    return 'wobble';
  }
  state.countdownTicks = GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS;
  return 'countdown';
}

/** One host tick. Returns true on the tick the countdown runs out: the launch (counted here). */
export function tickSpring(state: SpringState): boolean {
  if (state.bounceTicks > 0) state.bounceTicks--;
  if (state.wobbleTicks > 0) state.wobbleTicks--;
  if (state.countdownTicks <= 0) return false;
  state.countdownTicks--;
  if (state.countdownTicks > 0) return false;
  state.launches++;
  state.bounceTicks = GAME_CONSTANTS.SPRING_BOUNCE_TICKS;
  return true;
}

/** One client tick between snapshots: the countdown waits at its last tick for the host's launch. */
export function tickSpringClient(state: SpringState): void {
  if (state.bounceTicks > 0) state.bounceTicks--;
  if (state.wobbleTicks > 0) state.wobbleTicks--;
  if (state.countdownTicks > 1) state.countdownTicks--;
}

/** A client flings itself only on a launch it just saw happen, not on a bounce it joined late. */
export function freshLaunch(state: SpringState): boolean {
  return (
    state.bounceTicks >
    GAME_CONSTANTS.SPRING_BOUNCE_TICKS - GAME_CONSTANTS.SPRING_FLING_WINDOW_TICKS
  );
}

/** Seconds shown in the 3-2-1 (0 when not counting). */
export function countdownSeconds(state: SpringState): number {
  return Math.ceil(state.countdownTicks / GAME_CONSTANTS.TICK_RATE);
}

/** A player standing on the spring: on its plate or on the corpses piled on it. */
export function onSpring(
  player: Pick<CharacterState, 'x' | 'y' | 'isGrounded' | 'isDead' | 'isDown' | 'isClimbing'>,
  puzzle: SpringPuzzleLayout,
): boolean {
  if (player.isDead || player.isDown || player.isClimbing || !player.isGrounded) return false;
  const [left, right]: [number, number] = springSpan(puzzle);
  const cx: number = player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
  const feet: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT;
  return (
    cx >= left && cx <= right && feet <= puzzle.spring.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE
  );
}

/**
 * Launches a player on the spring straight up toward the exit: walking speed is dropped, so the
 * exit (straight above) catches them unless they steer off it. Returns whether it did.
 */
export function flingIfOnSpring(player: CharacterState, puzzle: SpringPuzzleLayout): boolean {
  if (!onSpring(player, puzzle)) return false;
  player.velocityX = 0;
  player.velocityY = -GAME_CONSTANTS.SPRING_LAUNCH_FORCE;
  player.isGrounded = false;
  return true;
}

/**
 * How far (px, + = down) the drawn plate sits from rest: it sinks as the spring winds up during
 * the 3-2-1 and shoots up on release, settling with a damped bounce.
 */
export function plateOffset(state: SpringState): number {
  if (state.countdownTicks > 0) {
    return WIND_PX * (1 - state.countdownTicks / GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS);
  }
  if (state.bounceTicks > 0) {
    const t: number = GAME_CONSTANTS.SPRING_BOUNCE_TICKS - state.bounceTicks;
    const decay: number = state.bounceTicks / GAME_CONSTANTS.SPRING_BOUNCE_TICKS;
    return -RELEASE_PX * Math.cos(t * 0.45) * decay;
  }
  return 0;
}
