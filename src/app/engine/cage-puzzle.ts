import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { CagePuzzleState, CageState } from '@shared/game-entities';
import { Box, Point } from './boulder-puzzle';
import { CagePuzzleLayout, HangingCage, Platform } from './engine-types';

/**
 * Floor-4 hanging-cage rules, free of engine state so the host system, the client, the renderer
 * and the tests all use the same math.
 *
 * 4-5 covered cages hang on chains: the exit cage (index 0) under the exit, the others
 * mid-screen. Every chain runs from a cleat on a ledge up into the ceiling band, tangles with the
 * others there and comes down to its cage, so nobody knows which cleat drops which cage, nor
 * what a cage hides. Hitting a cleat snaps its chain: the exit cage falls and stands under the
 * exit as a step (fewer corpses to pile) and spills its content on top; any other cage smashes
 * where it lands and spills its content there. The exit's height follows the party size, so
 * everything about the exit cage takes the exit platform.
 */
export type CleatHit = 'hit' | 'snap';

/** The exit cage's index in the layout and the synced state. */
export const EXIT_CAGE: number = 0;

export const CAGE_FLOOR_HINT: string = 'Tangled chains: drop the cage under the EXIT. Mind what the others hide';

const WIDTH: number = GAME_CONSTANTS.CAGE_WIDTH_PX;
const HEIGHT: number = GAME_CONSTANTS.CAGE_HEIGHT_PX;
/** Top of the exit cage standing on the ground. */
const GROUND_TOP: number = GAME_CONSTANTS.GROUND_Y - HEIGHT;

export function newCageState(puzzle: CagePuzzleLayout): CagePuzzleState {
  return {
    cages: puzzle.cages.map((): CageState => ({ cleatHits: 0, fallTicks: 0, landed: false })),
  };
}

export function isCut(cage: CageState): boolean {
  return cage.cleatHits >= GAME_CONSTANTS.CAGE_CLEAT_HITS;
}

/** Where a cage hangs: the exit cage centered under the exit, any other where it was placed. */
export function hangBox(puzzle: CagePuzzleLayout, i: number, exit: Platform): Box {
  const hang: Platform | null = puzzle.cages[i].hang;
  if (!hang) return exitCageHangBox(exit);
  return { x: hang.x, y: hang.y, width: hang.width, height: hang.height };
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

/** Top of the cage once it landed (on the ground, or on the platform under it). */
export function landTop(puzzle: CagePuzzleLayout, i: number, exit: Platform): number {
  return puzzle.cages[i].landY - hangBox(puzzle, i, exit).height;
}

/** Longest a cage can fall (from the screen top to the ground), for clamping synced state. */
export const CAGE_MAX_FALL_TICKS: number = Math.ceil(
  Math.sqrt((2 * GAME_CONSTANTS.GROUND_Y) / GAME_CONSTANTS.GRAVITY),
);

/** Distance (px) a cage falls in `ticks` ticks from rest. */
export function fallDistance(ticks: number): number {
  return 0.5 * GAME_CONSTANTS.GRAVITY * ticks * ticks;
}

/** The cage's box as drawn now (hanging, falling, landed); null once a mid-screen cage smashed. */
export function cageBox(
  puzzle: CagePuzzleLayout,
  i: number,
  cage: CageState,
  exit: Platform,
): Box | null {
  const hang: Box = hangBox(puzzle, i, exit);
  const top: number = landTop(puzzle, i, exit);
  if (cage.landed) return i === EXIT_CAGE ? { ...hang, y: top } : null;
  return { ...hang, y: Math.min(top, hang.y + fallDistance(cage.fallTicks)) };
}

/** The cage's collision: while it hangs, and the exit cage once it landed; none while falling. */
export function cageSolid(
  puzzle: CagePuzzleLayout,
  i: number,
  cage: CageState,
  exit: Platform,
): Box | null {
  if (!isCut(cage)) return hangBox(puzzle, i, exit);
  if (i === EXIT_CAGE && cage.landed) return exitCageGroundBox(exit);
  return null;
}

/** The cleat tying a cage's chain, standing on its surface. */
export function cleatBox(puzzle: CagePuzzleLayout, i: number): Box {
  const cage: HangingCage = puzzle.cages[i];
  const width: number = GAME_CONSTANTS.CAGE_CLEAT_WIDTH_PX;
  const height: number = GAME_CONSTANTS.CAGE_CLEAT_HEIGHT_PX;
  return { x: cage.cleatX - width / 2, y: cage.cleatY - height, width, height };
}

/**
 * An attacking player up on the cleat's surface (standing or hopping), within reach of it and
 * facing it, hits it. Never from below through the ledge.
 */
export function cleatHitBy(
  player: Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>,
  puzzle: CagePuzzleLayout,
  i: number,
): boolean {
  if (!player.isAttacking || player.isDead || player.isDown) return false;
  const cleat: Box = cleatBox(puzzle, i);
  const width: number = GAME_CONSTANTS.PLAYER_WIDTH;
  const feet: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT;
  const surface: number = puzzle.cages[i].cleatY;
  if (feet > surface + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE || feet <= cleat.y) return false;
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

/** One host tick of a snapped cage falling from `hangY` to `top`. Returns true on the tick it lands. */
export function tickCage(cage: CageState, hangY: number, top: number): boolean {
  if (!isCut(cage) || cage.landed) return false;
  cage.fallTicks++;
  if (hangY + fallDistance(cage.fallTicks) < top) return false;
  cage.landed = true;
  return true;
}

/** One client tick between snapshots: it falls on, but only the host says it landed. */
export function tickCageClient(cage: CageState, hangY: number, top: number): void {
  if (!isCut(cage) || cage.landed) return;
  if (hangY + fallDistance(cage.fallTicks + 1) < top) cage.fallTicks++;
}

/**
 * The chain from its cleat's top straight up into the ceiling band, through its kinks (where it
 * tangles with the others), and down to the cage's hook (the top middle of where it hangs).
 */
export function chainPath(puzzle: CagePuzzleLayout, i: number, exit: Platform): Point[] {
  const cage: HangingCage = puzzle.cages[i];
  const cleat: Box = cleatBox(puzzle, i);
  const hang: Box = hangBox(puzzle, i, exit);
  const hookX: number = hang.x + hang.width / 2;
  const first: Point = cage.kinks[0];
  const last: Point = cage.kinks[cage.kinks.length - 1];
  return [
    { x: cage.cleatX, y: cleat.y },
    { x: cage.cleatX, y: first.y },
    ...cage.kinks.map((k: Point): Point => ({ ...k })),
    { x: hookX, y: last.y },
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

/**
 * Where a landed cage's content spills: spread across its width, standing on `surfaceY` (what it
 * landed on, or the exit cage's own top).
 */
export function releaseSpots(box: Box, surfaceY: number, count: number): Point[] {
  return Array.from(
    { length: count },
    (_: unknown, i: number): Point => ({
      x: box.x + ((i + 0.5) * box.width) / count,
      y: surfaceY,
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
