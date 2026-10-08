import { describe, it, expect } from 'vitest';
import { CharacterState, GAME_CONSTANTS } from '@shared/index';
import { PlateState, ZombieCorpse, ZombieType } from '@shared/game-entities';
import { Box } from './boulder-puzzle';
import { PlatePuzzleLayout, Platform } from './engine-types';
import {
  Kicker,
  PLATE_FLOOR_HINT,
  corpseOnPlate,
  doorBox,
  isDoorOpen,
  isHeld,
  kickCorpse,
  kicksBy,
  newPlateState,
  plateBox,
  plateWeight,
  playerOnPlate,
  tickDoor,
  weighPlate,
} from './plate-puzzle';

type Stander = Pick<CharacterState, 'x' | 'y' | 'isGrounded' | 'isDead'>;

const LEDGE_Y: number = 330;
const PUZZLE: PlatePuzzleLayout = { plateX: 960, plateY: LEDGE_Y };
const CENTER: number = PUZZLE.plateX + GAME_CONSTANTS.PLATE_WIDTH_PX / 2;
const NEEDED: number = GAME_CONSTANTS.PLATE_WEIGHT_NEEDED;
const DOOR_TICKS: number = GAME_CONSTANTS.PLATE_DOOR_TICKS;

/** A corpse lying on the ledge, centered at cx. */
function corpse(id: string, cx: number, overrides: Partial<ZombieCorpse> = {}): ZombieCorpse {
  const width: number = 30;
  const height: number = 41;
  return {
    id,
    type: ZombieType.Walker,
    x: cx - width / 2,
    y: LEDGE_Y - height,
    width,
    height,
    spriteKey: 'walker',
    facing: 1,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    frozen: true,
    landProcessed: true,
    fadeTimer: 1,
    maxFadeTimer: 1,
    showBlood: false,
    carrierId: null,
    ...overrides,
  };
}

/** A player standing on the ledge, centered at cx. */
function stander(cx: number, overrides: Partial<Stander> = {}): Stander {
  return {
    x: cx - GAME_CONSTANTS.PLAYER_WIDTH / 2,
    y: LEDGE_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
    isGrounded: true,
    isDead: false,
    ...overrides,
  };
}

/** A zombie walking on the ledge, centered at cx. */
function zombie(cx: number, overrides: Partial<Kicker> = {}): Kicker {
  const width: number = 34;
  const height: number = 50;
  return {
    x: cx - width / 2,
    y: LEDGE_Y - height,
    instanceWidth: width,
    instanceHeight: height,
    isDead: false,
    isGrounded: true,
    facing: 1,
    velocityX: 1,
    ...overrides,
  };
}

describe('pressure plate (floor 5)', (): void => {
  it('the plate is a strip set into the top of its ledge', (): void => {
    const box: Box = plateBox(PUZZLE);
    expect(box.x).toBe(PUZZLE.plateX);
    expect(box.y, 'inside the ledge, not sticking up').toBe(LEDGE_Y);
    expect(box.width).toBe(GAME_CONSTANTS.PLATE_WIDTH_PX);
    expect(box.height).toBeLessThan(GAME_CONSTANTS.LEVEL_TILE_PX);
  });

  it('a lying corpse on the plate (or on the pile on it) presses on it; carried, falling, aside or far above do not', (): void => {
    expect(corpseOnPlate(corpse('a', CENTER), PUZZLE)).toBe(true);
    expect(corpseOnPlate(corpse('a', PUZZLE.plateX - 10), PUZZLE), 'overlapping its edge').toBe(
      true,
    );
    expect(corpseOnPlate(corpse('a', PUZZLE.plateX - 40), PUZZLE), 'beside it').toBe(false);
    expect(
      corpseOnPlate(corpse('a', CENTER, { y: LEDGE_Y - 41 - 10 }), PUZZLE),
      'on the pile',
    ).toBe(true);
    expect(corpseOnPlate(corpse('a', CENTER, { carrierId: 'p1' }), PUZZLE), 'carried').toBe(false);
    expect(corpseOnPlate(corpse('a', CENTER, { isGrounded: false }), PUZZLE), 'falling').toBe(
      false,
    );
    const above: ZombieCorpse = corpse('a', CENTER, { y: LEDGE_Y - 41 - 100 });
    expect(corpseOnPlate(above, PUZZLE), 'on a ledge above').toBe(false);
    const below: ZombieCorpse = corpse('a', CENTER, { y: LEDGE_Y + 100 - 41 });
    expect(corpseOnPlate(below, PUZZLE), 'on the ground under the ledge').toBe(false);
  });

  it('a standing player presses on it; dead, jumping or beside it do not', (): void => {
    expect(playerOnPlate(stander(CENTER), PUZZLE)).toBe(true);
    expect(playerOnPlate(stander(CENTER, { isGrounded: false }), PUZZLE)).toBe(false);
    expect(playerOnPlate(stander(CENTER, { isDead: true }), PUZZLE)).toBe(false);
    expect(playerOnPlate(stander(PUZZLE.plateX - 30), PUZZLE)).toBe(false);
  });

  it('weight: a corpse weighs 1, a player PLATE_PLAYER_WEIGHT; one player alone holds the door', (): void => {
    const corpses: ZombieCorpse[] = [
      corpse('a', CENTER - 30),
      corpse('b', CENTER),
      corpse('c', 100),
    ];
    expect(plateWeight(PUZZLE, corpses, [])).toBe(2);
    expect(plateWeight(PUZZLE, corpses, [stander(CENTER)])).toBe(
      2 + GAME_CONSTANTS.PLATE_PLAYER_WEIGHT,
    );
    expect(GAME_CONSTANTS.PLATE_PLAYER_WEIGHT).toBeGreaterThanOrEqual(NEEDED);
    expect(NEEDED, 'solo needs several carried corpses').toBe(3);
  });

  it('weighing reports the door opening and shutting once each', (): void => {
    const plate: PlateState = newPlateState();
    expect(weighPlate(plate, NEEDED - 1)).toBeNull();
    expect(weighPlate(plate, NEEDED)).toBe('open');
    expect(isHeld(plate)).toBe(true);
    expect(weighPlate(plate, NEEDED + 2)).toBeNull();
    expect(weighPlate(plate, 0)).toBe('shut');
    expect(weighPlate(plate, 0)).toBeNull();
  });

  it('the door slides open while held, shut otherwise; only fully open lets players out', (): void => {
    const plate: PlateState = { weight: NEEDED, doorTicks: 0 };
    for (let i: number = 0; i < DOOR_TICKS - 1; i++) tickDoor(plate);
    expect(isDoorOpen(plate)).toBe(false);
    tickDoor(plate);
    expect(isDoorOpen(plate)).toBe(true);
    tickDoor(plate);
    expect(plate.doorTicks, 'stays open').toBe(DOOR_TICKS);
    plate.weight = NEEDED - 1;
    tickDoor(plate);
    expect(isDoorOpen(plate), 'starts closing at once').toBe(false);
    for (let i: number = 0; i < DOOR_TICKS + 5; i++) tickDoor(plate);
    expect(plate.doorTicks).toBe(0);
  });

  it('the door stands centered on the exit', (): void => {
    const exit: Platform = { x: 20, y: 262, width: 192, height: 32 };
    const door: Box = doorBox(exit);
    expect(door.y + door.height, 'on the exit').toBe(exit.y);
    expect(door.x + door.width / 2).toBe(exit.x + exit.width / 2);
  });

  it('a zombie walking over the plate kicks the corpses it touches away from itself (not one standing still)', (): void => {
    const left: ZombieCorpse = corpse('l', CENTER - 10);
    const right: ZombieCorpse = corpse('r', CENTER + 10);
    const far: ZombieCorpse = corpse('f', CENTER + 45);
    const kicks: Array<{ corpse: ZombieCorpse; dir: number }> = kicksBy(
      zombie(CENTER),
      [left, right, far],
      PUZZLE,
    );
    expect(
      kicks.map((k: { corpse: ZombieCorpse; dir: number }): string => `${k.corpse.id}${k.dir}`),
    ).toEqual(['l-1', 'r1']);
    expect(kicksBy(zombie(CENTER, { isDead: true }), [left], PUZZLE)).toEqual([]);
    expect(kicksBy(zombie(CENTER, { isGrounded: false }), [left], PUZZLE)).toEqual([]);
    expect(kicksBy(zombie(CENTER, { velocityX: 0 }), [left], PUZZLE), 'standing still').toEqual([]);
    expect(
      kicksBy(zombie(CENTER, { y: LEDGE_Y + 100 - 50 }), [left], PUZZLE),
      'under the ledge',
    ).toEqual([]);
    expect(
      kicksBy(zombie(PUZZLE.plateX - 60), [corpse('x', PUZZLE.plateX - 60)], PUZZLE),
      'off the plate',
    ).toEqual([]);

    kickCorpse(left, -1);
    expect(left.isGrounded).toBe(false);
    expect(left.velocityX).toBe(-GAME_CONSTANTS.PLATE_KICK_SPEED_X);
    expect(left.velocityY).toBeLessThan(0);
  });

  it('a kick sends the corpse clear of the plate (corpse air drag 0.92, gravity)', (): void => {
    const c: ZombieCorpse = corpse('k', CENTER);
    kickCorpse(c, 1);
    let x: number = c.x;
    let vx: number = c.velocityX;
    let vy: number = c.velocityY;
    let y: number = 0;
    while (y <= 0) {
      x += vx;
      vx *= 0.92;
      vy += GAME_CONSTANTS.GRAVITY;
      y += vy;
    }
    expect(x, 'flies past the plate edge before it comes down').toBeGreaterThan(
      PUZZLE.plateX + GAME_CONSTANTS.PLATE_WIDTH_PX,
    );
  });

  it('has a floor hint', (): void => {
    expect(PLATE_FLOOR_HINT).toContain('plate');
    expect(PLATE_FLOOR_HINT).toContain('EXIT');
  });
});
