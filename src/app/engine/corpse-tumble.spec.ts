import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS, ZombieType } from '@shared/index';
import { ZombieCorpse } from '@shared/game-entities';
import { corpseAtRest, deathSpin, flyCorpse, landCorpse, slideCorpse } from './corpse-tumble';

function corpse(overrides: Partial<ZombieCorpse> = {}): ZombieCorpse {
  return {
    id: 'c',
    type: ZombieType.Walker,
    x: 400,
    y: 300,
    width: 30,
    height: 41,
    spriteKey: 'walker',
    facing: 1,
    velocityX: 0,
    velocityY: 0,
    isGrounded: false,
    frozen: false,
    landProcessed: false,
    fadeTimer: 100,
    maxFadeTimer: 100,
    showBlood: false,
    carrierId: null,
    angle: 0,
    spin: 0,
    ...overrides,
  };
}

describe('corpse tumbling', (): void => {
  it('a blasted body tilts the way it flies but never past CORPSE_MAX_TILT (no cartwheels)', (): void => {
    const c: ZombieCorpse = corpse({ velocityX: 8, spin: GAME_CONSTANTS.CORPSE_BLAST_SPIN });
    let most: number = 0;
    for (let t: number = 0; t < 120; t++) {
      flyCorpse(c);
      most = Math.max(most, c.angle);
    }
    expect(most).toBeGreaterThan(GAME_CONSTANTS.CORPSE_MAX_TILT - GAME_CONSTANTS.CORPSE_BLAST_SPIN);
    expect(most).toBeLessThan(GAME_CONSTANTS.CORPSE_MAX_TILT + GAME_CONSTANTS.CORPSE_BLAST_SPIN);
    expect(c.velocityX, 'air drag slowed it').toBe(0);
  });

  it('a hard landing bounces it back up, a soft one keeps it down sliding on', (): void => {
    const hard: ZombieCorpse = corpse({ velocityX: 5, velocityY: 20, spin: 0.1 });
    expect(landCorpse(hard, 600)).toBe(false);
    expect(hard.velocityY).toBeCloseTo(-20 * GAME_CONSTANTS.CORPSE_BOUNCE);
    expect(hard.y + hard.height).toBe(600);
    expect(hard.isGrounded).toBe(false);
    expect(hard.spin).toBeCloseTo(0.05);

    const soft: ZombieCorpse = corpse({ velocityX: 5, velocityY: 3, spin: 0.1, angle: 0.4 });
    expect(landCorpse(soft, 600)).toBe(true);
    expect(soft.isGrounded).toBe(true);
    expect(soft.velocityY).toBe(0);
    expect(soft.spin).toBe(0);
    expect(soft.velocityX).toBeCloseTo(5 * GAME_CONSTANTS.CORPSE_LAND_KEEP_SPEED);
  });

  it('a landed body slides on, slowing, and flops back flat until it is at rest', (): void => {
    const c: ZombieCorpse = corpse({ isGrounded: true, velocityX: 3, angle: -0.7 });
    const startX: number = c.x;
    let ticks: number = 0;
    while (!corpseAtRest(c) && ticks < 200) {
      slideCorpse(c);
      ticks++;
    }
    expect(corpseAtRest(c)).toBe(true);
    expect(c.angle).toBe(0);
    expect(c.x - startX, 'slid forward a little').toBeGreaterThan(5);
    expect(c.x - startX).toBeLessThan(3 / (1 - GAME_CONSTANTS.CORPSE_SLIDE_FRICTION) + 1);
  });

  it('a zombie killed flying keeps tumbling the way it was knocked', (): void => {
    expect(deathSpin(6)).toBeGreaterThan(0);
    expect(deathSpin(-6)).toBeLessThan(0);
    expect(deathSpin(0)).toBe(0);
  });
});
