import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { CagePuzzleState, CageState } from '@shared/game-entities';
import { Box, Point } from './boulder-puzzle';
import { CagePuzzleLayout, Platform } from './engine-types';

/**
 * Floor-4 hanging-cage rules, free of engine state so the host system, the client, the renderer
 * and the tests all use the same math.
 *
 * Two cages hang on chains: the empty exit cage under the exit, the zombie cage mid-screen. Both
 * chains run from cleats on a ledge up to the ceiling and over to their cages. Hitting a
 * cleat snaps its chain: the exit cage falls and stands under the exit as a step (fewer corpses
 * to pile), the zombie cage smashes on the ground and lets its zombies loose. The exit's height
 * follows the party size, so everything about the exit cage takes the exit platform.
 */
export type CageId = keyof CagePuzzleState;
export type CleatHit = 'hit' | 'snap';

export const CAGE_IDS: CageId[] = ['exitCage', 'zombieCage'];

export const CAGE_FLOOR_HINT: string = 'Follow the chains: drop the empty cage under the EXIT';

const WIDTH: number = GAME_CONSTANTS.CAGE_WIDTH_PX;
const HEIGHT: number = GAME_CONSTANTS.CAGE_HEIGHT_PX;
/** Top of a cage standing on the ground. */
const GROUND_TOP: number = GAME_CONSTANTS.GROUND_Y - HEIGHT;

export function newCageState(): CagePuzzleState {
  return {
    exitCage: { cleatHits: 0, fallTicks: 0, landed: false },
    zombieCage: { cleatHits: 0, fallTicks: 0, landed: false },
  };
}

export function isCut(cage: CageState): boolean {
  return cage.cleatHits >= GAME_CONSTANTS.CAGE_CLEAT_HITS;
}

/** Where a cage hangs: the exit cage centered under the exit, the zombie cage where it was placed. */
export function hangBox(puzzle: CagePuzzleLayout, id: CageId, exit: Platform): Box {
  if (id === 'zombieCage') {
    const z: Platform = puzzle.zombieCage;
    return { x: z.x, y: z.y, width: z.width, height: z.height };
  }
  return exitCageHangBox(exit);
}

/** The exit cage hanging centered under the exit. */
export function exitCageHangBox(exit: Platform): Box {
  return {
    x: exit.x + (exit.width - WIDTH) / 2,
    y: exit.y + exit.height + GAME_CONSTANTS.CAGE_HANG_GAP_PX,
    width: WIDTH,
    height: HEIGHT,
  };
}

/** The exit cage standing on the ground under the exit. */
export function exitCageGroundBox(exit: Platform): Box {
  return { ...exitCageHangBox(exit), y: GROUND_TOP };
}

/** Longest a cage can fall (from the screen top to the ground), for clamping synced state. */
export const CAGE_MAX_FALL_TICKS: number = Math.ceil(
  Math.sqrt((2 * GAME_CONSTANTS.GROUND_Y) / GAME_CONSTANTS.GRAVITY),
);

/** Distance (px) a cage falls in `ticks` ticks from rest. */
export function fallDistance(ticks: number): number {
  return 0.5 * GAME_CONSTANTS.GRAVITY * ticks * ticks;
}

/** The cage's box as drawn now (hanging, falling, landed); null once the zombie cage smashed. */
export function cageBox(
  puzzle: CagePuzzleLayout,
  id: CageId,
  cage: CageState,
  exit: Platform,
): Box | null {
  const hang: Box = hangBox(puzzle, id, exit);
  if (cage.landed) return id === 'zombieCage' ? null : { ...hang, y: GROUND_TOP };
  return { ...hang, y: Math.min(GROUND_TOP, hang.y + fallDistance(cage.fallTicks)) };
}

/** The cage's collision: while it hangs, and the exit cage once it landed; none while falling. */
export function cageSolid(
  puzzle: CagePuzzleLayout,
  id: CageId,
  cage: CageState,
  exit: Platform,
): Box | null {
  if (!isCut(cage)) return hangBox(puzzle, id, exit);
  if (id === 'exitCage' && cage.landed) return exitCageGroundBox(exit);
  return null;
}

export function cleatX(puzzle: CagePuzzleLayout, id: CageId): number {
  return id === 'exitCage' ? puzzle.exitCleatX : puzzle.zombieCleatX;
}

/** The cleat tying a cage's chain, standing on its ledge. */
export function cleatBox(puzzle: CagePuzzleLayout, id: CageId): Box {
  const width: number = GAME_CONSTANTS.CAGE_CLEAT_WIDTH_PX;
  const height: number = GAME_CONSTANTS.CAGE_CLEAT_HEIGHT_PX;
  return {
    x: cleatX(puzzle, id) - width / 2,
    y: puzzle.cleatY - height,
    width,
    height,
  };
}

/**
 * An attacking player up on the cleat's ledge (standing or hopping), within reach of it and
 * facing it, hits it. Never from below through the ledge.
 */
export function cleatHitBy(
  player: Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>,
  puzzle: CagePuzzleLayout,
  id: CageId,
): boolean {
  if (!player.isAttacking || player.isDead || player.isDown) return false;
  const cleat: Box = cleatBox(puzzle, id);
  const width: number = GAME_CONSTANTS.PLAYER_WIDTH;
  const feet: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT;
  if (feet > puzzle.cleatY + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE || feet <= cleat.y) return false;
  const gap: number = Math.max(
    0,
    Math.max(cleat.x - (player.x + width), player.x - (cleat.x + cleat.width)),
  );
  if (gap > GAME_CONSTANTS.CAGE_HIT_REACH_PX) return false;
  const facing: number = player.facing === Direction.Right ? 1 : -1;
  const side: number = Math.sign(cleat.x + cleat.width / 2 - (player.x + width / 2));
  return side === 0 || side === facing;
}

/** One swing on a cleat: counts until the chain snaps (null once it has). */
export function hitCleat(cage: CageState): CleatHit | null {
  if (isCut(cage)) return null;
  cage.cleatHits++;
  return isCut(cage) ? 'snap' : 'hit';
}

/** One host tick of a snapped cage falling. Returns true on the tick it hits the ground. */
export function tickCage(cage: CageState, hangY: number): boolean {
  if (!isCut(cage) || cage.landed) return false;
  cage.fallTicks++;
  if (hangY + fallDistance(cage.fallTicks) < GROUND_TOP) return false;
  cage.landed = true;
  return true;
}

/** One client tick between snapshots: it falls on, but only the host says it landed. */
export function tickCageClient(cage: CageState, hangY: number): void {
  if (!isCut(cage) || cage.landed) return;
  if (hangY + fallDistance(cage.fallTicks + 1) < GROUND_TOP) cage.fallTicks++;
}

/**
 * The chain from its cleat's top straight up to its ceiling row, along the row, and down to the
 * cage's hook (the top middle of where it hangs).
 */
export function chainPath(puzzle: CagePuzzleLayout, id: CageId, exit: Platform): Point[] {
  const cleat: Box = cleatBox(puzzle, id);
  const x: number = cleatX(puzzle, id);
  const rowY: number = id === 'exitCage' ? puzzle.exitChainY : puzzle.zombieChainY;
  const hang: Box = hangBox(puzzle, id, exit);
  const hookX: number = hang.x + hang.width / 2;
  return [
    { x, y: cleat.y },
    { x, y: rowY },
    { x: hookX, y: rowY },
    { x: hookX, y: hang.y },
  ];
}

/**
 * Where something (top-left y, size) ends up when the exit cage lands in its column (its center
 * over the cage). Anything resting under the exit (on the ground or the pile there) rides up by the
 * cage's height, so the pile ends up on the cage; anything in the air inside the cage is put on
 * top. Anything else stays.
 */
export function yAfterCageLands(
  x: number,
  y: number,
  width: number,
  height: number,
  grounded: boolean,
  cage: Box,
  exit: Platform,
): number {
  const cx: number = x + width / 2;
  if (cx < cage.x || cx > cage.x + cage.width) return y;
  const feet: number = y + height;
  if (grounded) return feet > exit.y + exit.height ? y - cage.height : y;
  return feet > cage.y && y < cage.y + cage.height ? cage.y - height : y;
}

/** Where the zombie cage's zombies spill out: spread across its width, on the ground. */
export function releaseSpots(puzzle: CagePuzzleLayout, count: number): Point[] {
  const z: Platform = puzzle.zombieCage;
  return Array.from(
    { length: count },
    (_: unknown, i: number): Point => ({
      x: z.x + ((i + 0.5) * z.width) / count,
      y: GAME_CONSTANTS.GROUND_Y,
    }),
  );
}

/** A player in the landed exit cage's column rides up onto it (each client lifts its own player). */
export function liftOntoLandedCage(
  player: Pick<CharacterState, 'x' | 'y' | 'isGrounded'>,
  exit: Platform,
): void {
  player.y = yAfterCageLands(
    player.x,
    player.y,
    GAME_CONSTANTS.PLAYER_WIDTH,
    GAME_CONSTANTS.PLAYER_HEIGHT,
    player.isGrounded,
    exitCageGroundBox(exit),
    exit,
  );
}
