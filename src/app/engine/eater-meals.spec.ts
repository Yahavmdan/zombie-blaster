import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse, ZombieType } from '@shared/game-entities';
import { Platform } from './engine-types';
import { MealContext, isEaterMeal } from './eater-meals';

const GROUND_Y: number = GAME_CONSTANTS.GROUND_Y;
const H: number = 50;

function corpse(id: string, x: number, bottom: number = GROUND_Y): ZombieCorpse {
  return {
    id,
    type: ZombieType.Walker,
    x,
    y: bottom - H,
    width: 40,
    height: H,
    spriteKey: 'zombie_1',
    facing: 1,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    frozen: false,
    landProcessed: true,
    fadeTimer: 1,
    maxFadeTimer: 1,
    showBlood: false,
    carrierId: null,
  };
}

function ctx(corpses: ZombieCorpse[], overrides: Partial<MealContext> = {}): MealContext {
  return {
    corpses,
    platforms: [],
    exitPlatform: { x: 0, y: 130, width: 60, height: 20 },
    springPuzzle: null,
    platePuzzle: null,
    ...overrides,
  };
}

describe('eater meals', (): void => {
  it('a corpse lying in the open is a meal; a carried or falling one is not', (): void => {
    const lying: ZombieCorpse = corpse('a', 400);
    expect(isEaterMeal(lying, ctx([lying]))).toBe(true);
    expect(isEaterMeal({ ...lying, carrierId: 'p1' }, ctx([lying]))).toBe(false);
    expect(isEaterMeal({ ...lying, isGrounded: false }, ctx([lying]))).toBe(false);
  });

  it('never on the safe spot', (): void => {
    const spot: Platform = { x: 900, y: 230, width: 160, height: 32, safe: true };
    const up: ZombieCorpse = corpse('up', 950, spot.y);
    const below: ZombieCorpse = corpse('below', 950);
    const hanging: ZombieCorpse = corpse('hanging', spot.x + spot.width - 15, spot.y);
    expect(
      isEaterMeal(hanging, ctx([hanging], { platforms: [spot] })),
      'hanging over its end',
    ).toBe(false);
    expect(isEaterMeal(up, ctx([up, below], { platforms: [spot] }))).toBe(false);
    expect(isEaterMeal(below, ctx([up, below], { platforms: [spot] }))).toBe(true);
  });

  it('never in the pile under the exit', (): void => {
    const exitPlatform: Platform = { x: 500, y: 300, width: 200, height: 20 };
    const under: ZombieCorpse = corpse('under', 560);
    const beside: ZombieCorpse = corpse('beside', 800);
    expect(isEaterMeal(under, ctx([under, beside], { exitPlatform }))).toBe(false);
    expect(isEaterMeal(beside, ctx([under, beside], { exitPlatform }))).toBe(true);
  });

  it('never on the floor-3 scale or the floor-5 plate', (): void => {
    const onScale: ZombieCorpse = corpse('scale', 300);
    expect(
      isEaterMeal(
        onScale,
        ctx([onScale], {
          springPuzzle: {
            spring: { x: 1200, y: 400, width: 80, height: 220 },
            side: 1,
            scaleX: 280,
          },
        }),
      ),
    ).toBe(false);
    const onPlate: ZombieCorpse = corpse('plate', 300, 530);
    expect(
      isEaterMeal(onPlate, ctx([onPlate], { platePuzzle: { plateX: 290, plateY: 530 } })),
    ).toBe(false);
  });

  it('eats a pile from the top: a buried corpse waits, a neighbour on the same floor does not count', (): void => {
    const bottom: ZombieCorpse = corpse('bottom', 400);
    const top: ZombieCorpse = corpse(
      'top',
      402,
      GROUND_Y - GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_HEIGHT,
    );
    const neighbour: ZombieCorpse = corpse('neighbour', 420);
    const all: ZombieCorpse[] = [bottom, top, neighbour];
    expect(isEaterMeal(bottom, ctx(all))).toBe(false);
    expect(isEaterMeal(top, ctx(all))).toBe(true);
    expect(isEaterMeal(neighbour, ctx([bottom, neighbour]))).toBe(true);
  });
});
