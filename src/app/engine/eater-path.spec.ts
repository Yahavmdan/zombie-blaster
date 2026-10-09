import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import { Platform } from './engine-types';
import { EaterStep, Feet, eaterJumpReach, eaterStep } from './eater-path';

const GROUND: Platform = {
  x: -100,
  y: GAME_CONSTANTS.GROUND_Y,
  width: GAME_CONSTANTS.CANVAS_WIDTH + 200,
  height: 100,
};
const TIER: readonly number[] = GAME_CONSTANTS.LEVEL_TIER_Y;
const LOW: Platform = { x: 600, y: TIER[0], width: 200, height: 32 };
const HIGH: Platform = { x: 900, y: TIER[1], width: 200, height: 32 };
const HALF: number = 15;
const G: number = GAME_CONSTANTS.GRAVITY;
const REACH: number = eaterJumpReach(G);

function onGround(x: number): Feet {
  return { x, y: GAME_CONSTANTS.GROUND_Y };
}

describe('eater path', (): void => {
  it('one jump clears a tier gap, unlike a regular zombie jump', (): void => {
    const tierGap: number = TIER[0] - TIER[1];
    const zombieJumpHeight: number =
      GAME_CONSTANTS.ZOMBIE_JUMP_FORCE ** 2 / (2 * GAME_CONSTANTS.GRAVITY);
    expect(REACH).toBeGreaterThanOrEqual(tierGap);
    expect(REACH).toBeGreaterThanOrEqual(GAME_CONSTANTS.GROUND_Y - TIER[0]);
    expect(zombieJumpHeight).toBeLessThan(tierGap);
  });

  it('runs straight to a goal on its own level', (): void => {
    const step: EaterStep = eaterStep(onGround(100), HALF, onGround(500), [GROUND, LOW], G);
    expect(step).toEqual({ aimX: 500, jump: false, jumpVx: 0, drop: false });
  });

  it('gets under the ledge a goal lies on, then jumps up through it', (): void => {
    const goal: Feet = { x: 700, y: LOW.y };
    const far: EaterStep = eaterStep(onGround(100), HALF, goal, [GROUND, LOW], G);
    expect(far.aimX).toBe(LOW.x + HALF + 2);
    expect(far.jump).toBe(false);
    const under: EaterStep = eaterStep(onGround(far.aimX), HALF, goal, [GROUND, LOW], G);
    expect(under.jump).toBe(true);
  });

  it('climbs a goal two ledges up ledge by ledge', (): void => {
    const goal: Feet = { x: 1000, y: HIGH.y };
    const fromGround: EaterStep = eaterStep(onGround(100), HALF, goal, [GROUND, LOW, HIGH], G);
    expect(fromGround.aimX, 'first onto the low ledge').toBeLessThanOrEqual(LOW.x + LOW.width);
    expect(fromGround.aimX).toBeGreaterThanOrEqual(LOW.x);
    const fromLow: EaterStep = eaterStep({ x: 700, y: LOW.y }, HALF, goal, [GROUND, LOW, HIGH], G);
    expect(fromLow.aimX, 'then to the end of the low ledge facing the high one').toBe(
      LOW.x + LOW.width - HALF,
    );
    expect(fromLow.jump).toBe(false);
    const leap: EaterStep = eaterStep(
      { x: fromLow.aimX, y: LOW.y },
      HALF,
      goal,
      [GROUND, LOW, HIGH],
      G,
    );
    expect(leap.jump, 'and leaps across').toBe(true);
    expect(leap.jumpVx).toBeGreaterThan(0);
    expect(leap.jumpVx).toBeLessThanOrEqual(GAME_CONSTANTS.ZOMBIE_EATER_LEAP_MAX_SPEED);
  });

  it('drops down to a goal below its platform', (): void => {
    const step: EaterStep = eaterStep({ x: 700, y: LOW.y }, HALF, onGround(300), [GROUND, LOW], G);
    expect(step).toEqual({ aimX: 300, jump: false, jumpVx: 0, drop: true });
  });

  it('never climbs by the safe spot or a solid prop', (): void => {
    const safe: Platform = { ...LOW, safe: true };
    const prop: Platform = { ...LOW, x: 300, solid: true };
    const step: EaterStep = eaterStep(
      onGround(100),
      HALF,
      { x: 700, y: LOW.y },
      [GROUND, safe, prop],
      G,
    );
    expect(step.aimX, 'no ledge to use: it heads for the goal').toBe(700);
  });
});
