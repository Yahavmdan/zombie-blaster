import { describe, it, expect } from 'vitest';
import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { CagePuzzleState, CageState } from '@shared/game-entities';
import { Box, Point } from './boulder-puzzle';
import { CagePuzzleLayout, Platform } from './engine-types';
import { exitPlatformY } from './level-generator';
import {
  CAGE_FLOOR_HINT,
  CageId,
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
const PUZZLE: CagePuzzleLayout = {
  zombieCage: { x: 512, y: GAME_CONSTANTS.CAGE_ZOMBIE_TOP_Y, width: 128, height: H },
  cleatY: LEDGE_Y,
  exitCleatX: 1000,
  zombieCleatX: 1072,
  exitChainY: 128,
  zombieChainY: 112,
};
const EXIT: Platform = { x: 20, y: 274, width: 192, height: 32 };

function cut(): CageState {
  return { cleatHits: GAME_CONSTANTS.CAGE_CLEAT_HITS, fallTicks: 0, landed: false };
}

/** A player on the ledge beside a cleat, attacking it. */
function swingerAt(id: CageId, side: 'left' | 'right', patch: Partial<Swinger> = {}): Swinger {
  const cleat: Box = cleatBox(PUZZLE, id);
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
  it('the exit cage hangs centered under the exit and lands on the ground under it', (): void => {
    const hang: Box = hangBox(PUZZLE, 'exitCage', EXIT);
    expect(hang.x + hang.width / 2).toBe(EXIT.x + EXIT.width / 2);
    expect(hang.y).toBe(EXIT.y + EXIT.height + GAME_CONSTANTS.CAGE_HANG_GAP_PX);
    const ground: Box = exitCageGroundBox(EXIT);
    expect(ground.y + ground.height).toBe(GROUND_Y);
    expect(ground.x).toBe(hang.x);
    expect(hangBox(PUZZLE, 'zombieCage', EXIT)).toEqual(PUZZLE.zombieCage);
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

  it('a cage hangs until its chain snaps, falls, and the zombie cage is gone once it landed', (): void => {
    const state: CagePuzzleState = newCageState();
    expect(cageBox(PUZZLE, 'exitCage', state.exitCage, EXIT)).toEqual(
      hangBox(PUZZLE, 'exitCage', EXIT),
    );
    const falling: CageState = { ...cut(), fallTicks: 10 };
    const box: Box = cageBox(PUZZLE, 'zombieCage', falling, EXIT)!;
    expect(box.y).toBe(PUZZLE.zombieCage.y + fallDistance(10));
    expect(cageBox(PUZZLE, 'zombieCage', { ...cut(), fallTicks: 999 }, EXIT)!.y).toBe(GROUND_Y - H);
    expect(cageBox(PUZZLE, 'zombieCage', { ...cut(), landed: true }, EXIT)).toBeNull();
    expect(cageBox(PUZZLE, 'exitCage', { ...cut(), landed: true }, EXIT)).toEqual(
      exitCageGroundBox(EXIT),
    );
  });

  it('collision: while hanging, none while falling, the exit cage on the ground once landed', (): void => {
    const hanging: CageState = newCageState().exitCage;
    expect(cageSolid(PUZZLE, 'exitCage', hanging, EXIT)).toEqual(hangBox(PUZZLE, 'exitCage', EXIT));
    expect(cageSolid(PUZZLE, 'zombieCage', hanging, EXIT)).toEqual(PUZZLE.zombieCage);
    expect(cageSolid(PUZZLE, 'exitCage', { ...cut(), fallTicks: 5 }, EXIT)).toBeNull();
    expect(cageSolid(PUZZLE, 'exitCage', { ...cut(), landed: true }, EXIT)).toEqual(
      exitCageGroundBox(EXIT),
    );
    expect(cageSolid(PUZZLE, 'zombieCage', { ...cut(), landed: true }, EXIT)).toBeNull();
  });

  it('cleats stand on their ledge; a swing hits the one you face within reach, from up on the ledge only', (): void => {
    const cleat: Box = cleatBox(PUZZLE, 'exitCage');
    expect(cleat.y + cleat.height).toBe(LEDGE_Y);
    expect(cleat.x + cleat.width / 2).toBe(PUZZLE.exitCleatX);
    expect(cleatHitBy(swingerAt('exitCage', 'left'), PUZZLE, 'exitCage')).toBe(true);
    expect(cleatHitBy(swingerAt('exitCage', 'right'), PUZZLE, 'exitCage')).toBe(true);
    expect(cleatHitBy(swingerAt('exitCage', 'left'), PUZZLE, 'zombieCage'), 'the other cleat').toBe(
      false,
    );
    const away: Swinger = swingerAt('exitCage', 'left', { facing: Direction.Left });
    expect(cleatHitBy(away, PUZZLE, 'exitCage'), 'facing away').toBe(false);
    const far: Swinger = swingerAt('exitCage', 'left', { x: cleat.x - 100 });
    expect(cleatHitBy(far, PUZZLE, 'exitCage'), 'out of reach').toBe(false);
    const below: Swinger = swingerAt('exitCage', 'left', { y: LEDGE_Y + 20 });
    expect(cleatHitBy(below, PUZZLE, 'exitCage'), 'from the ladder below').toBe(false);
    const hopping: Swinger = swingerAt('exitCage', 'left', {
      y: LEDGE_Y - GAME_CONSTANTS.PLAYER_HEIGHT - 10,
    });
    expect(cleatHitBy(hopping, PUZZLE, 'exitCage'), 'hopping beside it').toBe(true);
    expect(
      cleatHitBy(swingerAt('exitCage', 'left', { isAttacking: false }), PUZZLE, 'exitCage'),
    ).toBe(false);
    expect(cleatHitBy(swingerAt('exitCage', 'left', { isDown: true }), PUZZLE, 'exitCage')).toBe(
      false,
    );
  });

  it('the chain snaps on the last hit, once', (): void => {
    const cage: CageState = newCageState().exitCage;
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
    const hanging: CageState = newCageState().zombieCage;
    expect(tickCage(hanging, PUZZLE.zombieCage.y)).toBe(false);
    expect(hanging.fallTicks).toBe(0);
    const host: CageState = cut();
    let landings: number = 0;
    for (let t: number = 0; t < 200; t++) if (tickCage(host, PUZZLE.zombieCage.y)) landings++;
    expect(landings).toBe(1);
    expect(host.landed).toBe(true);
    expect(PUZZLE.zombieCage.y + fallDistance(host.fallTicks)).toBeGreaterThanOrEqual(GROUND_Y - H);
    const client: CageState = cut();
    for (let t: number = 0; t < 200; t++) tickCageClient(client, PUZZLE.zombieCage.y);
    expect(client.landed).toBe(false);
    expect(PUZZLE.zombieCage.y + fallDistance(client.fallTicks)).toBeLessThan(GROUND_Y - H);
    expect(client.fallTicks).toBe(host.fallTicks - 1);
  });

  it('each chain runs from its cleat up to its ceiling row, along it and down to its cage', (): void => {
    for (const id of ['exitCage', 'zombieCage'] as CageId[]) {
      const path: Point[] = chainPath(PUZZLE, id, EXIT);
      const cleat: Box = cleatBox(PUZZLE, id);
      const hang: Box = hangBox(PUZZLE, id, EXIT);
      const row: number = id === 'exitCage' ? PUZZLE.exitChainY : PUZZLE.zombieChainY;
      expect(path).toEqual([
        { x: cleat.x + cleat.width / 2, y: cleat.y },
        { x: cleat.x + cleat.width / 2, y: row },
        { x: hang.x + hang.width / 2, y: row },
        { x: hang.x + hang.width / 2, y: hang.y },
      ]);
    }
  });

  it('the landing exit cage lifts what rests under the exit onto it and puts what is inside it on top', (): void => {
    const box: Box = exitCageGroundBox(EXIT);
    const cx: number = box.x + box.width / 2;
    const w: number = 40;
    const h: number = 30;
    expect(yAfterCageLands(cx - w / 2, GROUND_Y - h, w, h, true, box, EXIT), 'on the ground').toBe(
      GROUND_Y - h - H,
    );
    expect(
      yAfterCageLands(cx - w / 2, GROUND_Y - h - 25, w, h, true, box, EXIT),
      'up the pile',
    ).toBe(GROUND_Y - h - 25 - H);
    expect(
      yAfterCageLands(box.x + box.width + 30, GROUND_Y - h, w, h, true, box, EXIT),
      'beside',
    ).toBe(GROUND_Y - h);
    expect(yAfterCageLands(cx - w / 2, box.y + 20, w, h, false, box, EXIT), 'falling inside').toBe(
      box.y - h,
    );
    expect(yAfterCageLands(cx - w / 2, box.y - 200, w, h, false, box, EXIT), 'falling above').toBe(
      box.y - 200,
    );
    expect(yAfterCageLands(cx - w / 2, EXIT.y - h, w, h, true, box, EXIT), 'on the exit').toBe(
      EXIT.y - h,
    );
    const player: Pick<CharacterState, 'x' | 'y' | 'isGrounded'> = {
      x: cx - GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
      isGrounded: true,
    };
    liftOntoLandedCage(player, EXIT);
    expect(player.y + GAME_CONSTANTS.PLAYER_HEIGHT).toBe(box.y);
  });

  it('the zombie cage lets its zombies loose across its width, on the ground', (): void => {
    const spots: Point[] = releaseSpots(PUZZLE, GAME_CONSTANTS.CAGE_ZOMBIES);
    expect(spots.length).toBe(GAME_CONSTANTS.CAGE_ZOMBIES);
    for (const s of spots) {
      expect(s.y).toBe(GROUND_Y);
      expect(s.x).toBeGreaterThan(PUZZLE.zombieCage.x);
      expect(s.x).toBeLessThan(PUZZLE.zombieCage.x + PUZZLE.zombieCage.width);
    }
  });

  it('the floor hint points at the chains and the exit', (): void => {
    expect(CAGE_FLOOR_HINT).toContain('chains');
    expect(CAGE_FLOOR_HINT).toContain('EXIT');
  });
});
