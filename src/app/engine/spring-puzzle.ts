import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { LooseProp, SpringState, ZombieCorpse, ZombieState } from '@shared/game-entities';
import { Box, Point } from './boulder-puzzle';
import { Platform, SpringPuzzleLayout } from './engine-types';
import { playerLoadKg, zombieWeightKg } from './weight';

/**
 * Floor-3 spring puzzle rules, free of engine state so the host system, the client, the renderer
 * and the tests all use the same math.
 *
 * The exit hangs at the very top of the screen. Straight under it, at the screen edge, stands a
 * big spring (a solid block one hop high). On the far side of the floor a scale's pan is set into
 * the ground; a cable runs from it up to the ceiling, along it, and down to the spring's button.
 * While the scale holds SPRING_SCALE_KG_NEEDED (corpses, boxes and barrels, zombies, players and
 * what they carry), the cable slowly pulls the button up out of the ground; when the weight goes,
 * it sinks back. A hit on the fully raised button starts a 3-2-1: when it runs out, the spring
 * launches everyone standing on it straight up to the exit, and corpses lying on it scatter.
 */

/** How far the plate sinks while the spring winds up, and how far it shoots up on release. */
const WIND_PX: number = 6;
const RELEASE_PX: number = 30;
/** Scattered corpses pop up this fast (px/tick), from the low to the high end of the range. */
const SCATTER_POP_MIN: number = 11;
const SCATTER_POP_MAX: number = 19;
/** Corpses keep sliding at this fraction of their speed per tick while airborne (zombie-system). */
const CORPSE_AIR_DRAG: number = 0.92;
/** The pan is drawn this thick, set into the ground (inside the ground's collision). */
const PAN_THICKNESS_PX: number = 8;
/** The scale's gauge post stands at the pan's inner end: the cable leaves from its top. */
const POST_HEIGHT_PX: number = 96;
/** The pressed button sinks this far into its housing during the 3-2-1 and the bounce. */
const PRESSED_PX: number = 10;

/** Most kg the scale can report, for clamping synced state. */
export const SCALE_MAX_KG: number = 99_999;

export const SPRING_FLOOR_HINT: string =
  'Load the scale to raise the spring button, hit it and hop on';

export function newSpringState(): SpringState {
  return { launches: 0, countdownTicks: 0, bounceTicks: 0, scaleKg: 0, buttonTicks: 0 };
}

/** Horizontal span of the spring: under the whole exit, from the screen edge. */
export function springSpan(puzzle: SpringPuzzleLayout): [number, number] {
  return [puzzle.spring.x, puzzle.spring.x + puzzle.spring.width];
}

/** The button's box when fully up, on the ground beside the spring's open side (its hit area). */
export function buttonBox(puzzle: SpringPuzzleLayout): Box {
  const width: number = GAME_CONSTANTS.SPRING_BUTTON_WIDTH_PX;
  const height: number = GAME_CONSTANTS.SPRING_BUTTON_HEIGHT_PX;
  const gap: number = GAME_CONSTANTS.SPRING_BUTTON_GAP_PX;
  const s: Platform = puzzle.spring;
  const x: number = puzzle.side === 1 ? s.x - gap - width : s.x + s.width + gap;
  return { x, y: GAME_CONSTANTS.GROUND_Y - height, width, height };
}

/** How far up the button is: 0 = sunk in the ground, 1 = fully up. */
export function buttonRise(state: SpringState): number {
  return state.buttonTicks / GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS;
}

export function isButtonUp(state: SpringState): boolean {
  return state.buttonTicks >= GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS;
}

/** True while it counts down or bounces: the button can't be pressed again yet. */
export function isBusy(state: SpringState): boolean {
  return state.countdownTicks > 0 || state.bounceTicks > 0;
}

/** Top of the button's cap as drawn now: it rises with the cable and sinks while pressed. */
export function buttonTopY(puzzle: SpringPuzzleLayout, state: SpringState): number {
  const pressed: number = isBusy(state) ? PRESSED_PX : 0;
  return GAME_CONSTANTS.GROUND_Y - buttonBox(puzzle).height * buttonRise(state) + pressed;
}

/** The scale's pan as drawn: a strip set into the ground (inside its collision). */
export function scaleBox(puzzle: SpringPuzzleLayout): Box {
  return {
    x: puzzle.scaleX,
    y: GAME_CONSTANTS.GROUND_Y,
    width: GAME_CONSTANTS.SPRING_SCALE_WIDTH_PX,
    height: PAN_THICKNESS_PX,
  };
}

/** The pan's inner end (toward the spring): its gauge post stands there. */
export function scalePostX(puzzle: SpringPuzzleLayout): number {
  return puzzle.side === 1 ? puzzle.scaleX + GAME_CONSTANTS.SPRING_SCALE_WIDTH_PX : puzzle.scaleX;
}

export function scalePostTopY(): number {
  return GAME_CONSTANTS.GROUND_Y - POST_HEIGHT_PX;
}

/**
 * The cable (not walkable): from the scale's post straight up to a pulley on the ceiling, along
 * it, and down to the button's cap (which it pulls up).
 */
export function cablePath(puzzle: SpringPuzzleLayout, state: SpringState): Point[] {
  const postX: number = scalePostX(puzzle);
  const button: Box = buttonBox(puzzle);
  const buttonX: number = button.x + button.width / 2;
  const rowY: number = GAME_CONSTANTS.SPRING_CABLE_Y;
  return [
    { x: postX, y: scalePostTopY() },
    { x: postX, y: rowY },
    { x: buttonX, y: rowY },
    { x: buttonX, y: buttonTopY(puzzle, state) },
  ];
}

/**
 * Something resting on the pan or on the pile on it: its center over the pan, its bottom at the
 * ground or up to SPRING_SCALE_STACK_PX above it.
 */
export function restsOnScale(
  x: number,
  width: number,
  bottom: number,
  puzzle: SpringPuzzleLayout,
): boolean {
  const cx: number = x + width / 2;
  const pan: Box = scaleBox(puzzle);
  return (
    cx >= pan.x &&
    cx <= pan.x + pan.width &&
    bottom <= GAME_CONSTANTS.GROUND_Y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
    bottom >= GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.SPRING_SCALE_STACK_PX
  );
}

/** What weighing needs to know about a player. */
export type WeighedPlayer = Pick<
  CharacterState,
  'id' | 'x' | 'y' | 'isGrounded' | 'isDead' | 'isClimbing'
>;

/**
 * Everything on the scale now, in kg: lying corpses and props, standing zombies, and players
 * (downed ones too) with whatever they carry overhead.
 */
export function scaleLoadKg(
  puzzle: SpringPuzzleLayout,
  corpses: ZombieCorpse[],
  props: LooseProp[],
  zombies: ZombieState[],
  players: WeighedPlayer[],
): number {
  let kg: number = 0;
  for (const c of corpses) {
    if (!c.isGrounded || c.carrierId !== null) continue;
    if (restsOnScale(c.x, c.width, c.y + c.height, puzzle)) kg += zombieWeightKg(c.type);
  }
  for (const p of props) {
    if (!p.isGrounded || p.carrierId !== null) continue;
    if (restsOnScale(p.x, p.width, p.y + p.height, puzzle)) kg += p.weightKg;
  }
  for (const z of zombies) {
    if (z.isDead || !z.isGrounded) continue;
    if (restsOnScale(z.x, z.instanceWidth, z.y + z.instanceHeight, puzzle)) {
      kg += zombieWeightKg(z.type);
    }
  }
  for (const p of players) {
    if (p.isDead || !p.isGrounded || p.isClimbing) continue;
    const bottom: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT;
    if (restsOnScale(p.x, GAME_CONSTANTS.PLAYER_WIDTH, bottom, puzzle)) {
      kg += playerLoadKg(p.id, corpses, props);
    }
  }
  return kg;
}

/** The scale holds enough to keep the button up. */
export function isLoaded(state: SpringState): boolean {
  return state.scaleKg >= GAME_CONSTANTS.SPRING_SCALE_KG_NEEDED;
}

/** Every client, every tick: the cable pulls the button up while loaded, it sinks back otherwise. */
export function tickButton(state: SpringState): void {
  const step: number = isLoaded(state) ? 1 : -1;
  state.buttonTicks = Math.min(
    GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS,
    Math.max(0, state.buttonTicks + step),
  );
}

/**
 * An attacking player next to the fully raised button (within reach, level with it) and facing
 * it presses it: from the ground beside it or from the spring.
 */
export function buttonHitBy(
  player: Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>,
  puzzle: SpringPuzzleLayout,
  state: SpringState,
): boolean {
  if (!isButtonUp(state)) return false;
  if (!player.isAttacking || player.isDead || player.isDown) return false;
  const button: Box = buttonBox(puzzle);
  const width: number = GAME_CONSTANTS.PLAYER_WIDTH;
  const top: number = player.y;
  const bottom: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT;
  if (bottom <= button.y || top >= button.y + button.height) return false;
  const gap: number = Math.max(
    0,
    Math.max(button.x - (player.x + width), player.x - (button.x + button.width)),
  );
  if (gap > GAME_CONSTANTS.SPRING_HIT_REACH_PX) return false;
  const facing: number = player.facing === Direction.Right ? 1 : -1;
  const side: number = Math.sign(button.x + button.width / 2 - (player.x + width / 2));
  return side === 0 || side === facing;
}

/** A press on the button: starts the 3-2-1 unless it is still sunk or the spring is busy. */
export function pressButton(state: SpringState): boolean {
  if (isBusy(state) || !isButtonUp(state)) return false;
  state.countdownTicks = GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS;
  return true;
}

/** One host tick. Returns true on the tick the countdown runs out: the launch (counted here). */
export function tickSpring(state: SpringState): boolean {
  tickButton(state);
  if (state.bounceTicks > 0) state.bounceTicks--;
  if (state.countdownTicks <= 0) return false;
  state.countdownTicks--;
  if (state.countdownTicks > 0) return false;
  state.launches++;
  state.bounceTicks = GAME_CONSTANTS.SPRING_BOUNCE_TICKS;
  return true;
}

/** One client tick between snapshots: the countdown waits at its last tick for the host's launch. */
export function tickSpringClient(state: SpringState): void {
  tickButton(state);
  if (state.bounceTicks > 0) state.bounceTicks--;
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

/** Corpses lying on the spring (or piled on it): the launch throws them off. */
export function corpsesOnSpring(
  corpses: ZombieCorpse[],
  puzzle: SpringPuzzleLayout,
): ZombieCorpse[] {
  const [left, right]: [number, number] = springSpan(puzzle);
  const top: number = puzzle.spring.y;
  return corpses.filter((c: ZombieCorpse): boolean => {
    if (!c.isGrounded || c.carrierId !== null) return false;
    const cx: number = c.x + c.width / 2;
    const feet: number = c.y + c.height;
    return cx >= left && cx <= right && feet <= top + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE;
  });
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
 * The launch throws a corpse lying on the spring up and out over its open side (toward the screen
 * center): it clears the spring and lands up to SPRING_SCATTER_MAX_PX past it. `spread` and `pop`
 * (0..1, random in play) pick how far out and how high, so the bodies fan out in the air.
 */
export function scatterVelocity(
  corpse: ZombieCorpse,
  puzzle: SpringPuzzleLayout,
  spread: number,
  pop: number,
): { vx: number; vy: number } {
  const dir: number = -puzzle.side;
  const s: Platform = puzzle.spring;
  const toClear: number = dir === -1 ? corpse.x + corpse.width - s.x : s.x + s.width - corpse.x;
  const distance: number =
    Math.max(0, toClear) +
    GAME_CONSTANTS.LEVEL_TILE_PX +
    spread * GAME_CONSTANTS.SPRING_SCATTER_MAX_PX;
  const vy: number = -(SCATTER_POP_MIN + pop * (SCATTER_POP_MAX - SCATTER_POP_MIN));
  // Airborne until back at the spring top: slide vx * (1 - drag^T) / (1 - drag) in that time.
  const airTicks: number = (2 * -vy) / GAME_CONSTANTS.GRAVITY;
  const reach: number = (1 - Math.pow(CORPSE_AIR_DRAG, airTicks)) / (1 - CORPSE_AIR_DRAG);
  return { vx: (dir * distance) / reach, vy };
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

/** Where the scale's gauge needle points: 0 = empty, 1 = the needed weight or more. */
export function gaugeFraction(state: SpringState): number {
  return Math.min(1, state.scaleKg / GAME_CONSTANTS.SPRING_SCALE_KG_NEEDED);
}
