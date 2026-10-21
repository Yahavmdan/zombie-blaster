import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS, ZombieState, ZombieType } from '@shared/index';
import { knockZombie, tickKnockTilt } from './zombie-knock';

function zombie(): ZombieState {
  return {
    id: 'z',
    type: ZombieType.Walker,
    hp: 100,
    maxHp: 100,
    x: 500,
    y: 400,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    isDead: false,
    target: null,
    knockbackFrames: 0,
    jumpCooldown: 0,
    attackCooldown: 0,
    attackAnimTimer: 0,
    attackHasHit: false,
    attackHesitation: 0,
    hesitationRange: 0,
    facing: -1,
    instanceSpeed: 1,
    instanceDamageMin: 10,
    instanceDamageMax: 15,
    instanceKnockbackForce: 5,
    instanceXpReward: 10,
    instanceWidth: 40,
    instanceHeight: 50,
    orbitOffset: 0,
    platformDropTimer: 0,
    spawnTimer: 0,
    reactionDelay: 0,
    eatingTargetId: null,
    eatingTimer: 0,
    magnetPull: null,
    stunTicks: 0,
    angle: 0,
    spin: 0,
  };
}

/** Knocks a fresh zombie right and flies it for `ticks` ticks; returns it and the most it tilted. */
function knockAndFly(ticks: number): { z: ZombieState; most: number } {
  const z: ZombieState = zombie();
  knockZombie(z, 1, 8, -5, 10);
  let most: number = 0;
  for (let t: number = 0; t < ticks; t++) {
    tickKnockTilt(z);
    most = Math.max(most, Math.abs(z.angle));
  }
  return { z, most };
}

describe('knocked zombies (different every time)', (): void => {
  it('each knock pushes and pops a little differently, always within the spreads', (): void => {
    const pushes: Set<number> = new Set<number>();
    const pops: Set<number> = new Set<number>();
    for (let i: number = 0; i < 40; i++) {
      const z: ZombieState = zombie();
      knockZombie(z, -1, 8, -5, 10);
      pushes.add(z.velocityX);
      pops.add(z.velocityY);
      expect(z.velocityX).toBeLessThanOrEqual(-8 * (1 - GAME_CONSTANTS.ZOMBIE_KNOCK_PUSH_SPREAD));
      expect(z.velocityX).toBeGreaterThanOrEqual(
        -8 * (1 + GAME_CONSTANTS.ZOMBIE_KNOCK_PUSH_SPREAD),
      );
      expect(z.velocityY).toBeLessThanOrEqual(-5 * (1 - GAME_CONSTANTS.ZOMBIE_KNOCK_UP_SPREAD));
      expect(z.velocityY).toBeGreaterThanOrEqual(-5 * (1 + GAME_CONSTANTS.ZOMBIE_KNOCK_UP_SPREAD));
      expect(z.isGrounded).toBe(false);
      expect(z.knockbackFrames).toBe(10);
    }
    expect(pushes.size, 'no two pushes alike').toBeGreaterThan(30);
    expect(pops.size).toBeGreaterThan(30);
  });

  it('it tilts a different amount each time, mostly with the push, never past the max', (): void => {
    const peaks: number[] = [];
    let withPush: number = 0;
    let swept: number = 0;
    for (let i: number = 0; i < 200; i++) {
      const { z, most }: { z: ZombieState; most: number } = knockAndFly(30);
      peaks.push(most);
      if (z.angle > 0) withPush++;
      else swept++;
      expect(most).toBeLessThan(
        GAME_CONSTANTS.ZOMBIE_KNOCK_MAX_TILT + GAME_CONSTANTS.ZOMBIE_KNOCK_SPIN_MAX,
      );
    }
    expect(Math.min(...peaks)).toBeLessThan(0.35);
    expect(Math.max(...peaks)).toBeGreaterThan(0.6);
    expect(withPush, 'mostly leaning with the push').toBeGreaterThan(swept);
    expect(swept, 'sometimes swept off its feet backwards').toBeGreaterThan(20);
  });

  it('once landed it stands back up and stops turning', (): void => {
    const { z }: { z: ZombieState; most: number } = knockAndFly(15);
    expect(z.angle).not.toBe(0);
    z.isGrounded = true;
    for (let t: number = 0; t < 20; t++) tickKnockTilt(z);
    expect(z.angle).toBe(0);
    expect(z.spin).toBe(0);
  });

  it('a zombie nobody knocked never tilts, in the air or not', (): void => {
    const z: ZombieState = zombie();
    z.isGrounded = false;
    for (let t: number = 0; t < 20; t++) tickKnockTilt(z);
    expect(z.angle).toBe(0);
  });
});
