import { describe, expect, it } from 'vitest';
import { GAME_CONSTANTS } from '@shared/game-constants';
import { ZombieState, ZombieType } from '@shared/game-entities';
import { Platform } from './engine-types';
import {
  Point,
  SPIT_FRAME,
  SpitSurface,
  Velocity,
  aimSpit,
  puddleX,
  spitSurfaceHit,
  spitterMouth,
} from './spitter-spit';
import { ZombieAnimState } from './zombie-sprite-animator';

const GRAVITY: number = GAME_CONSTANTS.SPITTER_PROJECTILE_GRAVITY;
const SPEED: number = GAME_CONSTANTS.SPITTER_PROJECTILE_SPEED;
const GROUND: number = GAME_CONSTANTS.GROUND_Y;

/** Flies a shot the way ProjectileSystem does: move, then gravity. Returns where it is after `ticks`. */
function fly(from: Point, v: Velocity, ticks: number): Point {
  let x: number = from.x;
  let y: number = from.y;
  let vy: number = v.vy;
  for (let t: number = 0; t < ticks; t++) {
    x += v.vx;
    y += vy;
    vy += GRAVITY;
  }
  return { x, y };
}

function spitter(facing: number): ZombieState {
  return {
    type: ZombieType.Spitter,
    x: 300,
    y: GROUND - 40,
    instanceWidth: 30,
    instanceHeight: 40,
    facing,
  } as ZombieState;
}

describe('aimSpit', (): void => {
  it('lobs the glob so the arc comes down on the target', (): void => {
    const from: Point = { x: 100, y: 500 };
    const to: Point = { x: 360, y: 560 };
    const v: Velocity = aimSpit(from, to, SPEED, GRAVITY);
    const ticks: number = Math.round(260 / SPEED);

    const end: Point = fly(from, v, ticks);
    expect(end.x).toBeCloseTo(to.x, 6);
    expect(end.y).toBeCloseTo(to.y, 6);
    expect(v.vy, 'thrown up first').toBeLessThan(0);
  });

  it('aims left as well, and at a target above', (): void => {
    const from: Point = { x: 600, y: 500 };
    const to: Point = { x: 400, y: 420 };
    const v: Velocity = aimSpit(from, to, SPEED, GRAVITY);
    expect(v.vx).toBeLessThan(0);
    const end: Point = fly(from, v, Math.round(200 / SPEED));
    expect(end.y).toBeCloseTo(to.y, 6);
  });
});

describe('spitSurfaceHit', (): void => {
  const ledge: Platform = { x: 200, y: 430, width: 200, height: 16 };

  it('splats on a platform it falls onto, inside its span', (): void => {
    expect(spitSurfaceHit(300, 425, 433, [ledge], null)).toEqual({ y: 430, minX: 200, maxX: 400 });
    expect(spitSurfaceHit(450, 425, 433, [ledge], null), 'beside the ledge').toBeNull();
  });

  it('flies up through platforms and over the one its spitter stood on', (): void => {
    expect(spitSurfaceHit(300, 433, 425, [ledge], null)).toBeNull();
    expect(spitSurfaceHit(300, 425, 433, [ledge], 430)).toBeNull();
  });

  it('always splats on the ground', (): void => {
    const hit: SpitSurface | null = spitSurfaceHit(900, GROUND - 3, GROUND + 4, [], GROUND);
    expect(hit?.y).toBe(GROUND);
  });
});

describe('puddleX', (): void => {
  it('keeps the puddle on its surface', (): void => {
    const surface: SpitSurface = { y: 430, minX: 200, maxX: 400 };
    expect(puddleX(202, 20, surface)).toBe(210);
    expect(puddleX(399, 20, surface)).toBe(390);
    expect(puddleX(300, 20, surface)).toBe(300);
    expect(puddleX(300, 500, surface), 'wider than the ledge: centred').toBe(300);
  });
});

describe('spitterMouth', (): void => {
  it('is on the head, in front of the body, mirrored when facing left', (): void => {
    const right: Point = spitterMouth(spitter(1), ZombieAnimState.Attack, SPIT_FRAME)!;
    const left: Point = spitterMouth(spitter(-1), ZombieAnimState.Attack, SPIT_FRAME)!;
    const centre: number = 300 + 15;

    expect(right.x).toBeGreaterThan(centre);
    expect(left.x).toBeLessThan(centre);
    expect(right.y).toBe(left.y);
    expect(right.y, 'head height').toBeLessThan(GROUND - 30);
  });

  it('has no mouth on the frames lying dead', (): void => {
    expect(spitterMouth(spitter(1), ZombieAnimState.Dead, 4)).toBeNull();
  });

  it('spits on the frame that shows the spray (the hit tick)', (): void => {
    expect(SPIT_FRAME).toBe(2);
  });
});
