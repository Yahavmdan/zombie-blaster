import { CharacterState, GAME_CONSTANTS } from '@shared/index';
import { PlateState, ZombieCorpse, ZombieState } from '@shared/game-entities';
import { Box } from './boulder-puzzle';
import { PlatePuzzleLayout, Platform } from './engine-types';

/**
 * Floor-5 pressure-plate rules, free of engine state so the host system, the client, the
 * renderer and the tests all use the same math.
 *
 * The exit has a barred door. It slides open while the plate on a far ledge is weighed down
 * (lying corpses weigh 1 each, a standing player PLATE_PLAYER_WEIGHT) and shut when the weight
 * goes; only a fully open door lets players out. Zombies walking over the plate kick corpses off.
 */
export type DoorChange = 'open' | 'shut';

export const PLATE_FLOOR_HINT: string = 'Weigh down the plate to open the EXIT door';

/** Most weight the plate can report (every corpse and player on it), for clamping synced state. */
export const PLATE_MAX_WEIGHT: number = 999;

const WIDTH: number = GAME_CONSTANTS.PLATE_WIDTH_PX;

export function newPlateState(): PlateState {
  return { weight: 0, doorTicks: 0 };
}

/** The plate as drawn: a strip set into the top of its surface (inside its collision box). */
export function plateBox(puzzle: PlatePuzzleLayout): Box {
  return { x: puzzle.plateX, y: puzzle.plateY, width: WIDTH, height: 6 };
}

/** The plate is weighed down enough to hold the door open. */
export function isHeld(plate: PlateState): boolean {
  return plate.weight >= GAME_CONSTANTS.PLATE_WEIGHT_NEEDED;
}

/** The door is fully open: the exit lets players out. */
export function isDoorOpen(plate: PlateState): boolean {
  return plate.doorTicks >= GAME_CONSTANTS.PLATE_DOOR_TICKS;
}

function overPlate(x: number, width: number, puzzle: PlatePuzzleLayout): boolean {
  return x + width > puzzle.plateX && x < puzzle.plateX + WIDTH;
}

/** A lying corpse presses on the plate: over it, resting on it or on the pile on it. */
export function corpseOnPlate(corpse: ZombieCorpse, puzzle: PlatePuzzleLayout): boolean {
  if (!corpse.isGrounded || corpse.carrierId !== null) return false;
  const bottom: number = corpse.y + corpse.height;
  return (
    overPlate(corpse.x, corpse.width, puzzle) &&
    bottom <= puzzle.plateY + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
    bottom >= puzzle.plateY - GAME_CONSTANTS.PLATE_STACK_PX
  );
}

/** A player standing on the plate (or on the corpses on it). Downed players still weigh. */
export function playerOnPlate(
  player: Pick<CharacterState, 'x' | 'y' | 'isGrounded' | 'isDead'>,
  puzzle: PlatePuzzleLayout,
): boolean {
  if (player.isDead || !player.isGrounded) return false;
  const feet: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT;
  return (
    overPlate(player.x, GAME_CONSTANTS.PLAYER_WIDTH, puzzle) &&
    feet <= puzzle.plateY + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
    feet >= puzzle.plateY - GAME_CONSTANTS.PLATE_STACK_PX
  );
}

/** Everything pressing on the plate now. */
export function plateWeight(
  puzzle: PlatePuzzleLayout,
  corpses: ZombieCorpse[],
  players: Pick<CharacterState, 'x' | 'y' | 'isGrounded' | 'isDead'>[],
): number {
  const bodies: number = corpses.filter((c: ZombieCorpse): boolean =>
    corpseOnPlate(c, puzzle),
  ).length;
  const standing: number = players.filter(
    (p: Pick<CharacterState, 'x' | 'y' | 'isGrounded' | 'isDead'>): boolean =>
      playerOnPlate(p, puzzle),
  ).length;
  return bodies + standing * GAME_CONSTANTS.PLATE_PLAYER_WEIGHT;
}

/**
 * Host: weighs the plate. Returns 'open' when the weight just became enough, 'shut' when it just
 * stopped being enough, else null.
 */
export function weighPlate(plate: PlateState, weight: number): DoorChange | null {
  const was: boolean = isHeld(plate);
  plate.weight = weight;
  const now: boolean = isHeld(plate);
  if (now === was) return null;
  return now ? 'open' : 'shut';
}

/** Every client: the door slides toward open while the plate is held, toward shut otherwise. */
export function tickDoor(plate: PlateState): void {
  const step: number = isHeld(plate) ? 1 : -1;
  plate.doorTicks = Math.min(GAME_CONSTANTS.PLATE_DOOR_TICKS, Math.max(0, plate.doorTicks + step));
}

/** The barred door, standing centered on the exit (scenery: players walk in front of it). */
export function doorBox(exit: Platform): Box {
  const width: number = GAME_CONSTANTS.PLATE_DOOR_WIDTH_PX;
  const height: number = GAME_CONSTANTS.PLATE_DOOR_HEIGHT_PX;
  return { x: exit.x + (exit.width - width) / 2, y: exit.y - height, width, height };
}

/** What a zombie's kick needs to know about it. */
export type Kicker = Pick<
  ZombieState,
  'x' | 'y' | 'velocityX' | 'instanceWidth' | 'instanceHeight' | 'isDead' | 'isGrounded' | 'facing'
>;

/**
 * A zombie walking over the plate kicks the corpses on it that it touches: returns the kick
 * direction for each (away from the zombie), empty when it kicks nothing.
 */
export function kicksBy(
  zombie: Kicker,
  corpses: ZombieCorpse[],
  puzzle: PlatePuzzleLayout,
): Array<{ corpse: ZombieCorpse; dir: number }> {
  // Only a zombie on the move kicks (one standing still just stands there).
  if (zombie.isDead || !zombie.isGrounded || Math.abs(zombie.velocityX) < 0.1) return [];
  const feet: number = zombie.y + zombie.instanceHeight;
  const onPlateLevel: boolean =
    feet <= puzzle.plateY + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
    feet >= puzzle.plateY - GAME_CONSTANTS.PLATE_STACK_PX;
  if (!onPlateLevel || !overPlate(zombie.x, zombie.instanceWidth, puzzle)) return [];
  const zx: number = zombie.x + zombie.instanceWidth / 2;
  return corpses
    .filter(
      (c: ZombieCorpse): boolean =>
        corpseOnPlate(c, puzzle) &&
        c.x + c.width > zombie.x &&
        c.x < zombie.x + zombie.instanceWidth,
    )
    .map((c: ZombieCorpse): { corpse: ZombieCorpse; dir: number } => {
      const cx: number = c.x + c.width / 2;
      const dir: number = cx === zx ? (zombie.facing < 0 ? -1 : 1) : Math.sign(cx - zx);
      return { corpse: c, dir };
    });
}

/** Sends a corpse flying off the plate. */
export function kickCorpse(corpse: ZombieCorpse, dir: number): void {
  corpse.velocityX = dir * GAME_CONSTANTS.PLATE_KICK_SPEED_X;
  corpse.velocityY = GAME_CONSTANTS.PLATE_KICK_SPEED_Y;
  corpse.isGrounded = false;
}
