import { describe, it, expect } from 'vitest';
import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse, ZombieType } from '@shared/game-entities';
import {
  assignCarriers,
  carryableCorpse,
  CarryPose,
  carrySway,
  easeCarryPose,
  holdCarriedCorpses,
  holdOverhead,
  tossCorpse,
} from './corpse-carry';

const PW: number = GAME_CONSTANTS.PLAYER_WIDTH;
const PH: number = GAME_CONSTANTS.PLAYER_HEIGHT;
const GROUND: number = GAME_CONSTANTS.GROUND_Y;
const RANGE: number = GAME_CONSTANTS.CORPSE_CARRY_RANGE;

function corpse(id: string, cx: number, overrides: Partial<ZombieCorpse> = {}): ZombieCorpse {
  const width: number = 30;
  const height: number = 41;
  return {
    id,
    type: ZombieType.Walker,
    x: cx - width / 2,
    y: GROUND - height,
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

/** A player standing on the ground, centered at cx. */
function player(id: string, cx: number, overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id,
    x: cx - PW / 2,
    y: GROUND - PH,
    velocityX: 0,
    velocityY: 0,
    facing: Direction.Right,
    isDead: false,
    isDown: false,
    carryingCorpseIds: [],
    ...overrides,
  } as CharacterState;
}

describe('carryableCorpse', (): void => {
  it('picks the nearest lying corpse within reach', (): void => {
    const near: ZombieCorpse = corpse('near', 120);
    const far: ZombieCorpse = corpse('far', 140);
    expect(carryableCorpse(player('p', 100), [far, near])?.id).toBe('near');
  });

  it('ignores corpses out of reach, falling or already carried', (): void => {
    const p: CharacterState = player('p', 100);
    expect(carryableCorpse(p, [corpse('out', 100 + RANGE + 30)])).toBeNull();
    expect(carryableCorpse(p, [corpse('falling', 110, { isGrounded: false })])).toBeNull();
    expect(carryableCorpse(p, [corpse('taken', 110, { carrierId: 'other' })])).toBeNull();
  });
});

describe('holding and tossing', (): void => {
  it("a carried corpse sits centered on the carrier's head, out of physics", (): void => {
    const c: ZombieCorpse = corpse('c', 300);
    const p: CharacterState = player('p', 100);
    holdOverhead(c, p);
    expect(c.x + c.width / 2).toBe(p.x + PW / 2);
    expect(c.y + c.height).toBe(p.y - GAME_CONSTANTS.CORPSE_CARRY_LIFT);
    expect(c.isGrounded).toBe(false);
  });

  it('tossing throws it forward and up, in the facing direction', (): void => {
    const right: ZombieCorpse = corpse('r', 100, { carrierId: 'p' });
    tossCorpse(right, player('p', 100));
    expect(right.carrierId).toBeNull();
    expect(right.velocityX).toBeGreaterThan(0);
    expect(right.velocityY).toBeLessThan(0);

    const left: ZombieCorpse = corpse('l', 100, { carrierId: 'p' });
    tossCorpse(left, player('p', 100, { facing: Direction.Left }));
    expect(left.velocityX).toBeLessThan(0);
  });
});

describe('assignCarriers (host)', (): void => {
  it('grants a request for a lying corpse in reach', (): void => {
    const c: ZombieCorpse = corpse('c', 110);
    assignCarriers([c], [player('p', 100, { carryingCorpseIds: ['c'] })]);
    expect(c.carrierId).toBe('p');
  });

  it('first come, first served: a corpse has one carrier', (): void => {
    const c: ZombieCorpse = corpse('c', 110);
    const a: CharacterState = player('a', 100, { carryingCorpseIds: ['c'] });
    const b: CharacterState = player('b', 120, { carryingCorpseIds: ['c'] });
    assignCarriers([c], [a, b]);
    expect(c.carrierId).toBe('a');
    assignCarriers([c], [a, b]);
    expect(c.carrierId).toBe('a');
  });

  it('refuses requests far out of reach (beyond the guest-lag slack) and for falling corpses', (): void => {
    const far: ZombieCorpse = corpse('far', 100 + RANGE * 3);
    const falling: ZombieCorpse = corpse('falling', 110, { isGrounded: false });
    assignCarriers([far], [player('p', 100, { carryingCorpseIds: ['far'] })]);
    assignCarriers([falling], [player('p', 100, { carryingCorpseIds: ['falling'] })]);
    expect(far.carrierId).toBeNull();
    expect(falling.carrierId).toBeNull();
  });

  it('a carrier who lets go tosses the corpse', (): void => {
    const c: ZombieCorpse = corpse('c', 100, { carrierId: 'p', isGrounded: false });
    assignCarriers([c], [player('p', 100, { carryingCorpseIds: [] })]);
    expect(c.carrierId).toBeNull();
    expect(c.velocityY).toBeLessThan(0);
  });

  it('a carrier who goes down drops it, even while still asking for it', (): void => {
    const c: ZombieCorpse = corpse('c', 100, { carrierId: 'p', isGrounded: false });
    assignCarriers([c], [player('p', 100, { carryingCorpseIds: ['c'], isDown: true })]);
    expect(c.carrierId).toBeNull();
  });

  it('a carrier who left the game drops it where it is', (): void => {
    const c: ZombieCorpse = corpse('c', 100, { carrierId: 'gone', isGrounded: false });
    assignCarriers([c], []);
    expect(c.carrierId).toBeNull();
    expect(c.isGrounded).toBe(false);
  });

  it('switching requests tosses the old corpse and takes the new one', (): void => {
    const old: ZombieCorpse = corpse('old', 100, { carrierId: 'p', isGrounded: false });
    const next: ZombieCorpse = corpse('next', 110);
    assignCarriers([old, next], [player('p', 100, { carryingCorpseIds: ['next'] })]);
    expect(old.carrierId).toBeNull();
    expect(next.carrierId).toBe('p');
  });
});

describe('holdCarriedCorpses (every client)', (): void => {
  it('moves carried corpses with their carriers, but not one whose carrier already let go', (): void => {
    const held: ZombieCorpse = corpse('held', 500, { carrierId: 'a' });
    const released: ZombieCorpse = corpse('released', 500, { carrierId: 'b' });
    const a: CharacterState = player('a', 100, { carryingCorpseIds: ['held'] });
    const b: CharacterState = player('b', 200, { carryingCorpseIds: [] });
    holdCarriedCorpses([held, released], [a, b]);
    expect(held.x + held.width / 2).toBe(100);
    expect(released.x + released.width / 2).toBe(500);
  });
});

describe('carrying a stack', (): void => {
  const STEP: number = GAME_CONSTANTS.CORPSE_CARRY_STACK_STEP;

  it(`grants up to ${GAME_CONSTANTS.CORPSE_CARRY_MAX} corpses per player, in request order`, (): void => {
    const corpses: ZombieCorpse[] = ['a', 'b', 'c', 'd'].map(
      (id: string, i: number): ZombieCorpse => corpse(id, 100 + i * 5),
    );
    assignCarriers(corpses, [player('p', 100, { carryingCorpseIds: ['a', 'b', 'c', 'd'] })]);
    expect(corpses.map((c: ZombieCorpse): string | null => c.carrierId)).toEqual([
      'p',
      'p',
      'p',
      null,
    ]);
  });

  it('adds a pick-up on top of the corpses already carried', (): void => {
    const held: ZombieCorpse = corpse('held', 100, { carrierId: 'p', isGrounded: false });
    const next: ZombieCorpse = corpse('next', 110);
    assignCarriers([held, next], [player('p', 100, { carryingCorpseIds: ['held', 'next'] })]);
    expect(held.carrierId).toBe('p');
    expect(next.carrierId).toBe('p');
  });

  it('stacks carried corpses on the head, bottom first, one step apart', (): void => {
    const bottom: ZombieCorpse = corpse('bottom', 300, { carrierId: 'p' });
    const top: ZombieCorpse = corpse('top', 400, { carrierId: 'p' });
    const p: CharacterState = player('p', 100, { carryingCorpseIds: ['bottom', 'top'] });
    holdCarriedCorpses([top, bottom], [p]);
    expect(bottom.y + bottom.height).toBe(p.y - GAME_CONSTANTS.CORPSE_CARRY_LIFT);
    expect(top.y + top.height).toBe(p.y - GAME_CONSTANTS.CORPSE_CARRY_LIFT - STEP);
    expect(top.x + top.width / 2).toBe(100);
  });

  it('letting go tosses the whole stack together, keeping its order so it lands as a pile', (): void => {
    const p: CharacterState = player('p', 100, { carryingCorpseIds: ['a', 'b', 'c'] });
    const stack: ZombieCorpse[] = ['a', 'b', 'c'].map(
      (id: string): ZombieCorpse => corpse(id, 100, { carrierId: 'p' }),
    );
    holdCarriedCorpses(stack, [p]);
    p.carryingCorpseIds = [];
    assignCarriers([stack[2], stack[0], stack[1]], [p]);
    for (const [level, c] of stack.entries()) {
      expect(c.carrierId).toBeNull();
      expect(c.velocityX).toBe(stack[0].velocityX);
      expect(c.velocityY).toBe(stack[0].velocityY);
      expect(c.x).toBe(stack[0].x);
      expect(c.y + c.height).toBe(p.y - GAME_CONSTANTS.CORPSE_CARRY_LIFT - level * STEP);
    }
  });

  it('a carrier who goes down drops the whole stack', (): void => {
    const stack: ZombieCorpse[] = ['a', 'b'].map(
      (id: string): ZombieCorpse => corpse(id, 100, { carrierId: 'p', isGrounded: false }),
    );
    assignCarriers(stack, [player('p', 100, { carryingCorpseIds: ['a', 'b'], isDown: true })]);
    expect(stack.every((c: ZombieCorpse): boolean => c.carrierId === null)).toBe(true);
  });
});

describe('carried corpses sway', (): void => {
  /** A carrier on the ground at x walking at vx (px/tick). */
  function walker(x: number, vx: number): CharacterState {
    return player('p', x + PW / 2, { velocityX: vx, isGrounded: true });
  }

  /** Poses over one full stride (two footfalls), sampled every pixel walked. */
  function stride(level: number): CarryPose[] {
    return Array.from({ length: 88 }, (_: unknown, x: number): CarryPose => carrySway(walker(x, 2.25), level));
  }

  it('standing still, the body just droops over the head', (): void => {
    const pose: CarryPose = carrySway(walker(137, 0), 0);
    expect(pose.bob).toBeCloseTo(0, 5);
    expect(pose.tilt).toBeCloseTo(0, 5);
    expect(pose.sag).toBeGreaterThan(0);
  });

  it('walking bounces it up on every footfall and rocks it side to side', (): void => {
    const poses: CarryPose[] = stride(0);
    const bobs: number[] = poses.map((p: CarryPose): number => p.bob);
    expect(Math.max(...bobs)).toBeLessThanOrEqual(0);
    expect(Math.min(...bobs)).toBeLessThan(-2);
    const tilts: number[] = poses.map((p: CarryPose): number => p.tilt);
    expect(Math.min(...tilts)).toBeLessThan(-0.02);
    expect(Math.max(...tilts)).toBeGreaterThan(0.02);
    const sags: number[] = poses.map((p: CarryPose): number => p.sag);
    expect(Math.max(...sags) - Math.min(...sags), 'the ends swing').toBeGreaterThan(2);
  });

  it('a body higher up the stack follows a little late and a little wider', (): void => {
    const bottom: CarryPose[] = stride(0);
    const top: CarryPose[] = stride(2);
    expect(bottom[0].bob).toBeCloseTo(0, 5);
    expect(top[0].bob).toBeLessThan(-0.5);
    const lowest: (poses: CarryPose[]) => number = (poses: CarryPose[]): number =>
      Math.min(...poses.map((p: CarryPose): number => p.bob));
    expect(lowest(top)).toBeLessThan(lowest(bottom));
  });

  it('in the air it lags the jump: pressed down going up, floating coming down', (): void => {
    const rising: CarryPose = carrySway({ x: 0, velocityX: 0, velocityY: -8, isGrounded: false }, 0);
    const falling: CarryPose = carrySway({ x: 0, velocityX: 0, velocityY: 8, isGrounded: false }, 0);
    const rest: CarryPose = carrySway(walker(0, 0), 0);
    expect(rising.bob).toBeGreaterThan(0);
    expect(rising.sag).toBeGreaterThan(rest.sag);
    expect(falling.bob).toBeLessThan(0);
    expect(falling.sag).toBeLessThan(rest.sag);
  });

  it('a body eases into its pose instead of snapping', (): void => {
    const target: CarryPose = { bob: -2, sag: 4, tilt: 0.03 };
    let pose: CarryPose = { bob: 0, sag: 0, tilt: 0 };
    pose = easeCarryPose(pose, target);
    expect(pose.bob).toBeLessThan(0);
    expect(pose.bob).toBeGreaterThan(-2);
    for (let i: number = 0; i < 40; i++) pose = easeCarryPose(pose, target);
    expect(pose.bob).toBeCloseTo(-2, 3);
    expect(pose.sag).toBeCloseTo(4, 3);
    expect(pose.tilt).toBeCloseTo(0.03, 3);
  });
});