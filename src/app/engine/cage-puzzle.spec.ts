import { describe, it, expect } from 'vitest';
import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { CagePuzzleState, CageState } from '@shared/game-entities';
import { Box, Point } from './boulder-puzzle';
import { CagePuzzleLayout, HangingCage, Platform } from './engine-types';
import { exitPlatformY } from './level-generator';
import {
  CAGE_FLOOR_HINT,
  EXIT_CAGE,
  cageBox,
  cageSolid,
  chainPath,
  cleatBox,
  cleatHitBy,
  exitCageGroundBox,
  fallDistance,
  hangBox,
  hitCleat,
  isCut,
  landTop,
  liftOntoLandedCage,
  newCageState,
  releaseSpots,
  tickCage,
  tickCageClient,
  yAfterCageLands,
} from './cage-puzzle';

type Swinger = Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>;

const LEDGE_Y: number = 430;
const GROUND_Y: number = GAME_CONSTANTS.GROUND_Y;
const H: number = GAME_CONSTANTS.CAGE_HEIGHT_PX;
const MID: number = GAME_CONSTANTS.CAGE_MID_SIZE_PX;
const KINKS: Point[] = [
  { x: 900, y: 60 },
  { x: 300, y: 120 },
  { x: 700, y: 80 },
];
/** The exit cage, a mid cage over the ground, one landing on a ledge; their cleats side by side. */
const PUZZLE: CagePuzzleLayout = {
  cages: [
    { hang: null, landY: GROUND_Y, content: 'empty', cleatX: 1000, cleatY: LEDGE_Y, kinks: KINKS },
    {
      hang: { x: 512, y: GAME_CONSTANTS.CAGE_MID_TOP_Y, width: MID, height: MID },
      landY: GROUND_Y,
      content: 'zombies',
      cleatX: 1000 + GAME_CONSTANTS.CAGE_CLEAT_SPACING_PX,
      cleatY: LEDGE_Y,
      kinks: KINKS,
    },
    {
      hang: { x: 704, y: GAME_CONSTANTS.CAGE_MID_TOP_Y, width: MID, height: MID },
      landY: 330,
      content: 'loot',
      cleatX: 1000 + 2 * GAME_CONSTANTS.CAGE_CLEAT_SPACING_PX,
      cleatY: LEDGE_Y,
      kinks: KINKS,
    },
  ],
};
const EXIT: Platform = { x: 20, y: 274, width: 192, height: 32 };

function cut(): CageState {
  return { cleatHits: GAME_CONSTANTS.CAGE_CLEAT_HITS, fallTicks: 0, landed: false };
}

/** A player on the ledge beside a cleat, facing and attacking it. */
function swingerAt(i: number, side: 'left' | 'right', patch: Partial<Swinger> = {}): Swinger {
  const cleat: Box = cleatBox(PUZZLE, i);
  return {
    x: side === 'left' ? cleat.x - GAME_CONSTANTS.PLAYER_WIDTH - 4 : cleat.x + cleat.width + 4,
    y: LEDGE_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
    facing: side === 'left' ? Direction.Right : Direction.Left,
    isAttacking: true,
    isDead: false,
    isDown: false,
    ...patch,
  };
}

describe('cage puzzle rules', (): void => {
  it('the exit cage hangs centered under the exit and lands on the ground under it; the others hang where placed', (): void => {
    const hang: Box = hangBox(PUZZLE, EXIT_CAGE, EXIT);
    expect(hang.x + hang.width / 2).toBe(EXIT.x + EXIT.width / 2);
    expect(hang.y).toBe(EXIT.y + EXIT.height + GAME_CONSTANTS.CAGE_HANG_GAP_PX);
    const ground: Box = exitCageGroundBox(EXIT);
    expect(ground.y + ground.height).toBe(GROUND_Y);
    expect(ground.x).toBe(hang.x);
    expect(landTop(PUZZLE, EXIT_CAGE, EXIT)).toBe(ground.y);
    expect(hangBox(PUZZLE, 1, EXIT)).toEqual(PUZZLE.cages[1].hang);
    expect(landTop(PUZZLE, 2, EXIT), 'on its ledge').toBe(330 - MID);
  });

  it('the landed exit cage is a real step but its top stays out of double-jump reach of the exit', (): void => {
    const doubleJumpPx: number = 206;
    for (let extra: number = 0; extra <= 3; extra++) {
      const exitY: number = exitPlatformY(GAME_CONSTANTS.PUZZLE_CAGE_FLOOR, extra);
      const top: number = exitCageGroundBox({ ...EXIT, y: exitY }).y;
      expect(top - exitY, `${extra + 1} players`).toBeGreaterThan(doubleJumpPx);
    }
    expect(GROUND_Y - exitCageGroundBox(EXIT).y).toBe(H);
  });

  it('one fresh state per cage', (): void => {
    expect(newCageState(PUZZLE)).toEqual({
      cages: PUZZLE.cages.map((): CageState => ({ cleatHits: 0, fallTicks: 0, landed: false })),
    });
  });

  it('a cage hangs until its chain snaps, falls onto what is under it, and a mid cage is gone once it landed', (): void => {
    const state: CagePuzzleState = newCageState(PUZZLE);
    expect(cageBox(PUZZLE, EXIT_CAGE, state.cages[0], EXIT)).toEqual(hangBox(PUZZLE, EXIT_CAGE, EXIT));
    const box: Box = cageBox(PUZZLE, 1, { ...cut(), fallTicks: 10 }, EXIT)!;
    expect(box.y).toBe(GAME_CONSTANTS.CAGE_MID_TOP_Y + fallDistance(10));
    expect(cageBox(PUZZLE, 1, { ...cut(), fallTicks: 999 }, EXIT)!.y).toBe(GROUND_Y - MID);
    expect(cageBox(PUZZLE, 2, { ...cut(), fallTicks: 999 }, EXIT)!.y, 'stops on its ledge').toBe(330 - MID);
    expect(cageBox(PUZZLE, 1, { ...cut(), landed: true }, EXIT)).toBeNull();
    expect(cageBox(PUZZLE, EXIT_CAGE, { ...cut(), landed: true }, EXIT)).toEqual(exitCageGroundBox(EXIT));
  });

  it('collision: while hanging, none while falling, the exit cage on the ground once landed', (): void => {
    const hanging: CageState = newCageState(PUZZLE).cages[0];
    expect(cageSolid(PUZZLE, EXIT_CAGE, hanging, EXIT)).toEqual(hangBox(PUZZLE, EXIT_CAGE, EXIT));
    expect(cageSolid(PUZZLE, 1, hanging, EXIT)).toEqual(PUZZLE.cages[1].hang);
    expect(cageSolid(PUZZLE, EXIT_CAGE, { ...cut(), fallTicks: 5 }, EXIT)).toBeNull();
    expect(cageSolid(PUZZLE, EXIT_CAGE, { ...cut(), landed: true }, EXIT)).toEqual(exitCageGroundBox(EXIT));
    expect(cageSolid(PUZZLE, 1, { ...cut(), landed: true }, EXIT)).toBeNull();
  });

  it('cleats stand on their surface; a swing hits only the one you face within reach, from up on the ledge', (): void => {
    const cleat: Box = cleatBox(PUZZLE, EXIT_CAGE);
    expect(cleat.y + cleat.height).toBe(LEDGE_Y);
    expect(cleat.x + cleat.width / 2).toBe(PUZZLE.cages[0].cleatX);
    expect(cleatHitBy(swingerAt(0, 'left'), PUZZLE, 0)).toBe(true);
    expect(cleatHitBy(swingerAt(0, 'right'), PUZZLE, 0)).toBe(true);
    // Standing between two neighbouring cleats, only the one faced is hit.
    expect(cleatHitBy(swingerAt(0, 'right'), PUZZLE, 1), 'the cleat behind').toBe(false);
    expect(cleatHitBy(swingerAt(1, 'left'), PUZZLE, 0), 'the cleat behind').toBe(false);
    expect(cleatHitBy(swingerAt(1, 'left'), PUZZLE, 2), 'the cleat after the faced one').toBe(false);
    const away: Swinger = swingerAt(0, 'left', { facing: Direction.Left });
    expect(cleatHitBy(away, PUZZLE, 0), 'facing away').toBe(false);
    const far: Swinger = swingerAt(0, 'left', { x: cleat.x - 100 });
    expect(cleatHitBy(far, PUZZLE, 0), 'out of reach').toBe(false);
    const below: Swinger = swingerAt(0, 'left', { y: LEDGE_Y + 20 });
    expect(cleatHitBy(below, PUZZLE, 0), 'from below').toBe(false);
    const hopping: Swinger = swingerAt(0, 'left', { y: LEDGE_Y - GAME_CONSTANTS.PLAYER_HEIGHT - 10 });
    expect(cleatHitBy(hopping, PUZZLE, 0), 'hopping beside it').toBe(true);
    expect(cleatHitBy(swingerAt(0, 'left', { isAttacking: false }), PUZZLE, 0)).toBe(false);
    expect(cleatHitBy(swingerAt(0, 'left', { isDown: true }), PUZZLE, 0)).toBe(false);
  });

  it('the chain snaps on the last hit, once', (): void => {
    const cage: CageState = newCageState(PUZZLE).cages[0];
    const hits: Array<string | null> = [];
    for (let i: number = 0; i < GAME_CONSTANTS.CAGE_CLEAT_HITS + 1; i++) hits.push(hitCleat(cage));
    expect(hits).toEqual([
      ...Array.from({ length: GAME_CONSTANTS.CAGE_CLEAT_HITS - 1 }, (): string => 'hit'),
      'snap',
      null,
    ]);
    expect(isCut(cage)).toBe(true);
    expect(cage.cleatHits).toBe(GAME_CONSTANTS.CAGE_CLEAT_HITS);
  });

  it('a snapped cage falls and lands once; clients let it fall but never land it', (): void => {
    const hangY: number = GAME_CONSTANTS.CAGE_MID_TOP_Y;
    const top: number = landTop(PUZZLE, 2, EXIT);
    const hanging: CageState = newCageState(PUZZLE).cages[2];
    expect(tickCage(hanging, hangY, top)).toBe(false);
    expect(hanging.fallTicks).toBe(0);
    const host: CageState = cut();
    let landings: number = 0;
    for (let t: number = 0; t < 200; t++) if (tickCage(host, hangY, top)) landings++;
    expect(landings).toBe(1);
    expect(host.landed).toBe(true);
    expect(hangY + fallDistance(host.fallTicks)).toBeGreaterThanOrEqual(top);
    const client: CageState = cut();
    for (let t: number = 0; t < 200; t++) tickCageClient(client, hangY, top);
    expect(client.landed).toBe(false);
    expect(hangY + fallDistance(client.fallTicks)).toBeLessThan(top);
    expect(client.fallTicks).toBe(host.fallTicks - 1);
  });

  it('each chain runs from its cleat up into the band, through its kinks, and down to its cage', (): void => {
    PUZZLE.cages.forEach((c: HangingCage, i: number): void => {
      const path: Point[] = chainPath(PUZZLE, i, EXIT);
      const cleat: Box = cleatBox(PUZZLE, i);
      const hang: Box = hangBox(PUZZLE, i, EXIT);
      expect(path).toEqual([
        { x: c.cleatX, y: cleat.y },
        { x: c.cleatX, y: KINKS[0].y },
        ...KINKS,
        { x: hang.x + hang.width / 2, y: KINKS[2].y },
        { x: hang.x + hang.width / 2, y: hang.y },
      ]);
    });
  });

  it('the landing exit cage lifts what rests under the exit onto it and puts what is inside it on top', (): void => {
    const box: Box = exitCageGroundBox(EXIT);
    const cx: number = box.x + box.width / 2;
    const w: number = 40;
    const h: number = 30;
    expect(yAfterCageLands(cx - w / 2, GROUND_Y - h, w, h, true, box, EXIT), 'on the ground').toBe(GROUND_Y - h - H);
    expect(yAfterCageLands(cx - w / 2, GROUND_Y - h - 25, w, h, true, box, EXIT), 'up the pile').toBe(
      GROUND_Y - h - 25 - H,
    );
    expect(yAfterCageLands(box.x + box.width + 30, GROUND_Y - h, w, h, true, box, EXIT), 'beside').toBe(GROUND_Y - h);
    expect(yAfterCageLands(cx - w / 2, box.y + 20, w, h, false, box, EXIT), 'falling inside').toBe(box.y - h);
    expect(yAfterCageLands(cx - w / 2, box.y - 200, w, h, false, box, EXIT), 'falling above').toBe(box.y - 200);
    expect(yAfterCageLands(cx - w / 2, EXIT.y - h, w, h, true, box, EXIT), 'on the exit').toBe(EXIT.y - h);
    const player: Pick<CharacterState, 'x' | 'y' | 'isGrounded'> = {
      x: cx - GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
      isGrounded: true,
    };
    liftOntoLandedCage(player, EXIT);
    expect(player.y + GAME_CONSTANTS.PLAYER_HEIGHT).toBe(box.y);
  });

  it('a landed cage spills its content across its width, on the surface given', (): void => {
    const box: Box = { x: 512, y: 234, width: MID, height: MID };
    const spots: Point[] = releaseSpots(box, 330, GAME_CONSTANTS.CAGE_ZOMBIES);
    expect(spots.length).toBe(GAME_CONSTANTS.CAGE_ZOMBIES);
    for (const s of spots) {
      expect(s.y).toBe(330);
      expect(s.x).toBeGreaterThan(box.x);
      expect(s.x).toBeLessThan(box.x + box.width);
    }
  });

  it('the floor hint points at the chains and the exit', (): void => {
    expect(CAGE_FLOOR_HINT).toContain('chains');
    expect(CAGE_FLOOR_HINT).toContain('EXIT');
  });
});
