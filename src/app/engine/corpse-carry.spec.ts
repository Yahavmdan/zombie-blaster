import { describe, it, expect } from 'vitest';
import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse, ZombieType } from '@shared/game-entities';
import {
  assignCarriers,
  carryableCorpse,
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
