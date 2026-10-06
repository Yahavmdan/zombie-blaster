import { describe, it, expect } from 'vitest';
import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { SpringState, ZombieCorpse, ZombieType } from '@shared/game-entities';
import { SpringPuzzleLayout } from './engine-types';
import { Box } from './boulder-puzzle';
import {
  SPRING_FLOOR_HINT,
  chargeCorpses,
  countdownSeconds,
  flingIfOnSpring,
  freshLaunch,
  isBusy,
  leverBox,
  leverHitBy,
  onSpring,
  plateOffset,
  pullLever,
  springSpan,
  tickSpring,
  tickSpringClient,
} from './spring-puzzle';

const PW: number = GAME_CONSTANTS.PLAYER_WIDTH;
const PH: number = GAME_CONSTANTS.PLAYER_HEIGHT;
const GROUND: number = GAME_CONSTANTS.GROUND_Y;
const TOP: number = GROUND - GAME_CONSTANTS.SPRING_HEIGHT_PX;
const NEEDED: number = GAME_CONSTANTS.SPRING_CHARGE_CORPSES;
const COUNT: number = GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS;

/** Exit on the right (1068..1260): the spring spans 1068..1280, the lever stands left of it. */
const RIGHT: SpringPuzzleLayout = {
  spring: { x: 1068, y: TOP, width: 212, height: GAME_CONSTANTS.SPRING_HEIGHT_PX },
  side: 1,
};

/** Mirror: exit on the left (20..212): the spring spans 0..212, the lever right of it. */
const LEFT: SpringPuzzleLayout = {
  spring: { x: 0, y: TOP, width: 212, height: GAME_CONSTANTS.SPRING_HEIGHT_PX },
  side: -1,
};

type Attacker = Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>;

function attacker(overrides: Partial<Attacker>): Attacker {
  return {
    x: 0,
    y: GROUND - PH,
    facing: Direction.Right,
    isAttacking: true,
    isDead: false,
    isDown: false,
    ...overrides,
  };
}

function corpse(cx: number, feetY: number, overrides: Partial<ZombieCorpse> = {}): ZombieCorpse {
  const width: number = 40;
  const height: number = 30;
  return {
    id: `c-${cx}-${feetY}`,
    type: ZombieType.Walker,
    x: cx - width / 2,
    y: feetY - height,
    width,
    height,
    spriteKey: 'walker',
    facing: 1,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    frozen: false,
    landProcessed: true,
    fadeTimer: 0,
    maxFadeTimer: 1,
    showBlood: false,
    ...overrides,
  };
}

function state(overrides: Partial<SpringState> = {}): SpringState {
  return { launches: 0, countdownTicks: 0, bounceTicks: 0, wobbleTicks: 0, ...overrides };
}

function standingPlayer(x: number, feet: number = TOP): CharacterState {
  return {
    x,
    y: feet - PH,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    isDead: false,
    isDown: false,
    isClimbing: false,
  } as CharacterState;
}

describe('spring puzzle geometry', (): void => {
  it('the spring spans the exit from the screen edge; the lever stands on the ground at its open side', (): void => {
    expect(springSpan(RIGHT)).toEqual([1068, 1280]);
    const right: Box = leverBox(RIGHT);
    expect(right.x + right.width + GAME_CONSTANTS.SPRING_LEVER_GAP_PX).toBe(1068);
    expect(right.y + right.height).toBe(GROUND);
    const left: Box = leverBox(LEFT);
    expect(left.x).toBe(212 + GAME_CONSTANTS.SPRING_LEVER_GAP_PX);
  });
});

describe('spring charge', (): void => {
  it('counts grounded corpses on the spring and piled on it, not beside it, below it or in the air', (): void => {
    const corpses: ZombieCorpse[] = [
      corpse(1100, TOP),
      corpse(1200, TOP - 120),
      corpse(1270, TOP - 300),
      corpse(1000, GROUND),
      corpse(1150, TOP, { isGrounded: false }),
    ];
    expect(chargeCorpses(corpses, RIGHT)).toHaveLength(3);
    expect(chargeCorpses([corpse(100, TOP), corpse(300, GROUND)], LEFT)).toHaveLength(1);
  });
});

describe('spring lever', (): void => {
  const lever: Box = leverBox(RIGHT);

  it('a swing facing the lever pulls it from the ground or from the spring top', (): void => {
    const fromCenter: number = lever.x - PW - 4;
    expect(leverHitBy(attacker({ x: fromCenter, facing: Direction.Right }), RIGHT)).toBe(true);
    const fromSpring: number = lever.x + lever.width + 4;
    expect(
      leverHitBy(attacker({ x: fromSpring, y: TOP - PH, facing: Direction.Left }), RIGHT),
    ).toBe(true);
  });

  it('not facing it, out of reach, high above it, not attacking or downed: no pull', (): void => {
    const x: number = lever.x - PW - 4;
    expect(leverHitBy(attacker({ x, facing: Direction.Left }), RIGHT)).toBe(false);
    const far: number = lever.x - PW - GAME_CONSTANTS.SPRING_HIT_REACH_PX - 1;
    expect(leverHitBy(attacker({ x: far }), RIGHT)).toBe(false);
    expect(leverHitBy(attacker({ x, y: lever.y - PH - 10 }), RIGHT)).toBe(false);
    expect(leverHitBy(attacker({ x, isAttacking: false }), RIGHT)).toBe(false);
    expect(leverHitBy(attacker({ x, isDown: true }), RIGHT)).toBe(false);
  });

  it('without a full charge the lever jiggles; with one it starts the 3-2-1; a busy spring ignores pulls', (): void => {
    const s: SpringState = state();
    expect(pullLever(s, NEEDED - 1)).toBe('wobble');
    expect(isBusy(s)).toBe(true);
    expect(pullLever(s, NEEDED)).toBeNull();
    for (let i: number = 0; i < GAME_CONSTANTS.SPRING_WOBBLE_TICKS; i++) tickSpring(s);
    expect(pullLever(s, NEEDED)).toBe('countdown');
    expect(countdownSeconds(s)).toBe(3);
    expect(pullLever(s, NEEDED + 5)).toBeNull();
  });

  it('the countdown runs out into exactly one launch, then the spring bounces and is ready again (still charged)', (): void => {
    const s: SpringState = state({ countdownTicks: COUNT });
    let launches: number = 0;
    for (let i: number = 0; i < COUNT - 1; i++) if (tickSpring(s)) launches++;
    expect(launches).toBe(0);
    expect(countdownSeconds(s)).toBe(1);
    expect(tickSpring(s)).toBe(true);
    expect(s.launches).toBe(1);
    expect(freshLaunch(s)).toBe(true);
    for (let i: number = 0; i < GAME_CONSTANTS.SPRING_FLING_WINDOW_TICKS; i++) tickSpring(s);
    expect(freshLaunch(s)).toBe(false);
    for (let i: number = 0; i < GAME_CONSTANTS.SPRING_BOUNCE_TICKS; i++) tickSpring(s);
    expect(isBusy(s)).toBe(false);
    expect(pullLever(s, NEEDED)).toBe('countdown');
  });

  it("a client's countdown waits at its last tick for the host's launch", (): void => {
    const s: SpringState = state({ countdownTicks: 3 });
    for (let i: number = 0; i < 10; i++) tickSpringClient(s);
    expect(s.countdownTicks).toBe(1);
    expect(s.launches).toBe(0);
  });
});

describe('spring launch', (): void => {
  it('launches a player on the spring straight up, high enough to land on the exit', (): void => {
    const p: CharacterState = { ...standingPlayer(1150), velocityX: 3 };
    expect(flingIfOnSpring(p, RIGHT)).toBe(true);
    expect(p.isGrounded).toBe(false);
    expect(p.velocityX, 'walking speed is dropped: straight up').toBe(0);
    let vy: number = p.velocityY;
    let feet: number = TOP;
    while (vy < 0) {
      vy += GAME_CONSTANTS.GRAVITY;
      feet += vy;
    }
    expect(feet).toBeLessThan(GAME_CONSTANTS.SPRING_LEDGE_Y - 40);
    expect(onSpring(standingPlayer(100), LEFT)).toBe(true);
  });

  it('players on corpses piled on the spring fly too; nobody beside it, mid-air or downed does', (): void => {
    expect(onSpring(standingPlayer(1150, TOP - 60), RIGHT)).toBe(true);
    expect(onSpring(standingPlayer(1000, GROUND), RIGHT)).toBe(false);
    expect(onSpring({ ...standingPlayer(1150), isGrounded: false }, RIGHT)).toBe(false);
    expect(onSpring({ ...standingPlayer(1150), isDown: true }, RIGHT)).toBe(false);
    const p: CharacterState = standingPlayer(300, GROUND);
    expect(flingIfOnSpring(p, LEFT)).toBe(false);
    expect(p.velocityY).toBe(0);
  });

  it('the plate rests level, sinks as it winds up and shoots up on release', (): void => {
    expect(plateOffset(state())).toBe(0);
    expect(plateOffset(state({ countdownTicks: 10 }))).toBeGreaterThan(0);
    expect(plateOffset(state({ bounceTicks: GAME_CONSTANTS.SPRING_BOUNCE_TICKS }))).toBeLessThan(0);
  });

  it('the floor hint names the spring and its lever', (): void => {
    expect(SPRING_FLOOR_HINT).toContain('spring');
    expect(SPRING_FLOOR_HINT).toContain('lever');
  });
});
