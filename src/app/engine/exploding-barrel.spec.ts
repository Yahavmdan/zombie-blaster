import { describe, expect, it } from 'vitest';
import { CharacterState, Direction, GAME_CONSTANTS, PROP_WEIGHT_KG } from '@shared/index';
import { LooseProp, ZombieCorpse, ZombieState, ZombieType } from '@shared/game-entities';
import {
  barrelHitBy,
  blastBarrels,
  blastCorpses,
  blastDamage,
  blastPlayerDamage,
  blastPlayers,
  blastZombies,
  chainFuse,
  flingCorpse,
  fuseSeconds,
  lightFuse,
  tickFuse,
} from './exploding-barrel';

const PW: number = GAME_CONSTANTS.PLAYER_WIDTH;
const PH: number = GAME_CONSTANTS.PLAYER_HEIGHT;
const GROUND: number = GAME_CONSTANTS.GROUND_Y;
const FUSE: number = GAME_CONSTANTS.BARREL_FUSE_TICKS;
const CHAIN: number = GAME_CONSTANTS.BARREL_CHAIN_FUSE_TICKS;
const RADIUS: number = GAME_CONSTANTS.BARREL_BLAST_RADIUS_PX;

type Attacker = Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>;
type BlastZombie = Pick<ZombieState, 'x' | 'y' | 'instanceWidth' | 'instanceHeight' | 'isDead'>;
type BlastPlayer = Pick<CharacterState, 'x' | 'y' | 'isDead' | 'isDown'>;

/** A barrel lying on the ground with its left side at x. */
function barrel(x: number, overrides: Partial<LooseProp> = {}): LooseProp {
  const width: number = 18;
  const height: number = 22;
  return {
    id: `barrel-${x}`,
    x,
    y: GROUND - height,
    width,
    height,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    carrierId: null,
    weightKg: PROP_WEIGHT_KG.barrel,
    fuseTicks: 0,
    exploded: false,
    angle: 0,
    spin: 0,
    ...overrides,
  };
}

/** A player standing on the ground, attacking, with its left side at x. */
function attacker(x: number, facing: Direction, overrides: Partial<Attacker> = {}): Attacker {
  return {
    x,
    y: GROUND - PH,
    facing,
    isAttacking: true,
    isDead: false,
    isDown: false,
    ...overrides,
  };
}

/** A 40x50 zombie standing on the ground, centered at cx. */
function zombieAt(cx: number, overrides: Partial<BlastZombie> = {}): BlastZombie {
  return {
    x: cx - 20,
    y: GROUND - 50,
    instanceWidth: 40,
    instanceHeight: 50,
    isDead: false,
    ...overrides,
  };
}

/** A player standing on the ground, centered at cx. */
function playerAt(cx: number, overrides: Partial<BlastPlayer> = {}): BlastPlayer {
  return { x: cx - PW / 2, y: GROUND - PH, isDead: false, isDown: false, ...overrides };
}

/** A 40x6 corpse lying on the ground, centered at cx. */
function corpseAt(cx: number, overrides: Partial<ZombieCorpse> = {}): ZombieCorpse {
  return {
    id: `corpse-${cx}`,
    type: ZombieType.Walker,
    x: cx - 20,
    y: GROUND - 6,
    width: 40,
    height: 6,
    spriteKey: 'walker',
    facing: 1,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    frozen: true,
    landProcessed: true,
    fadeTimer: 0,
    maxFadeTimer: 0,
    showBlood: false,
    carrierId: null,
    ...overrides,
  };
}

describe('exploding barrels', (): void => {
  it('an attack lights a barrel from beside it, facing it, within reach', (): void => {
    const b: LooseProp = barrel(500);
    expect(barrelHitBy(attacker(500 - PW - 2, Direction.Right), b)).toBe(true);
    expect(barrelHitBy(attacker(b.x + b.width + 2, Direction.Left), b)).toBe(true);
  });

  it('no light: facing away, out of reach, not attacking, down, or a different height', (): void => {
    const b: LooseProp = barrel(500);
    const left: number = 500 - PW - 2;
    expect(barrelHitBy(attacker(left, Direction.Left), b), 'facing away').toBe(false);
    expect(
      barrelHitBy(attacker(500 - PW - GAME_CONSTANTS.BARREL_HIT_REACH_PX - 1, Direction.Right), b),
      'out of reach',
    ).toBe(false);
    expect(barrelHitBy(attacker(left, Direction.Right, { isAttacking: false }), b)).toBe(false);
    expect(barrelHitBy(attacker(left, Direction.Right, { isDown: true }), b)).toBe(false);
    expect(barrelHitBy(attacker(left, Direction.Right, { isDead: true }), b)).toBe(false);
    expect(
      barrelHitBy(attacker(left, Direction.Right, { y: b.y - PH - 40 }), b),
      'on a ledge above it',
    ).toBe(false);
  });

  it('a lit or carried barrel is not lit again', (): void => {
    const left: Attacker = attacker(500 - PW - 2, Direction.Right);
    expect(barrelHitBy(left, barrel(500, { fuseTicks: 40 }))).toBe(false);
    expect(barrelHitBy(left, barrel(500, { carrierId: 'p2' }))).toBe(false);
  });

  it('the fuse burns 3 s, counting 3-2-1, then blows on its last tick', (): void => {
    const b: LooseProp = barrel(500);
    expect(FUSE).toBe(3 * GAME_CONSTANTS.TICK_RATE);
    expect(lightFuse(b)).toBe(true);
    expect(fuseSeconds(b)).toBe(3);
    expect(lightFuse(b), 'already burning').toBe(false);
    let blewAt: number = -1;
    for (let t: number = 1; t <= FUSE + 5 && blewAt < 0; t++) {
      if (tickFuse(b)) blewAt = t;
      if (t === FUSE - GAME_CONSTANTS.TICK_RATE) expect(fuseSeconds(b)).toBe(1);
    }
    expect(blewAt).toBe(FUSE);
    expect(tickFuse(b), 'an unlit barrel never blows').toBe(false);
  });

  it('a blast sets off nearby barrels soon, never later than their own fuse', (): void => {
    const unlit: LooseProp = barrel(500);
    chainFuse(unlit);
    expect(unlit.fuseTicks).toBe(CHAIN);
    const longFuse: LooseProp = barrel(500, { fuseTicks: 100 });
    chainFuse(longFuse);
    expect(longFuse.fuseTicks).toBe(CHAIN);
    const almost: LooseProp = barrel(500, { fuseTicks: 2 });
    chainFuse(almost);
    expect(almost.fuseTicks).toBe(2);
  });

  it('the blast reaches zombies and barrels whose center is within its radius', (): void => {
    const b: LooseProp = barrel(500);
    const cx: number = b.x + b.width / 2;
    const cy: number = b.y + b.height / 2;
    // The zombie's center sits 14 px above the barrel's (25 px vs 11 px half heights).
    const reach: number = Math.floor(Math.sqrt(RADIUS * RADIUS - 14 * 14));
    const near: BlastZombie = zombieAt(cx + reach);
    const far: BlastZombie = zombieAt(cx + reach + 2);
    const dead: BlastZombie = zombieAt(cx, { isDead: true });
    expect(cy - (GROUND - 25)).toBe(14);
    expect(blastZombies([near, far, dead], { x: cx, y: cy })).toEqual([near]);
    const close: LooseProp = barrel(500 + RADIUS - 1);
    const away: LooseProp = barrel(500 + RADIUS + 1);
    expect(blastBarrels([close, away], { x: cx, y: cy })).toEqual([close]);
  });

  it('the blast takes 60% of a zombie, only 10% of a boss', (): void => {
    expect(blastDamage({ type: ZombieType.Walker, maxHp: 100 })).toBe(60);
    expect(blastDamage({ type: ZombieType.Tank, maxHp: 333 })).toBe(200);
    expect(blastDamage({ type: ZombieType.Boss, maxHp: 1000 })).toBe(100);
    expect(blastDamage({ type: ZombieType.DragonBoss, maxHp: 5000 })).toBe(500);
    expect(blastDamage({ type: ZombieType.Walker, maxHp: 1 })).toBe(1);
  });

  it('the blast catches standing players in its radius, whoever lit it, and takes 25% of their max HP', (): void => {
    const b: LooseProp = barrel(500);
    const center: { x: number; y: number } = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const dy: number = center.y - (GROUND - PH / 2);
    const reach: number = Math.floor(Math.sqrt(RADIUS * RADIUS - dy * dy));
    const beside: BlastPlayer = playerAt(center.x - 20);
    const edge: BlastPlayer = playerAt(center.x + reach);
    const far: BlastPlayer = playerAt(center.x + reach + 2);
    const down: BlastPlayer = playerAt(center.x, { isDown: true });
    const dead: BlastPlayer = playerAt(center.x, { isDead: true });
    expect(blastPlayers([beside, edge, far, down, dead], center)).toEqual([beside, edge]);
    expect(GAME_CONSTANTS.BARREL_BLAST_PLAYER_DAMAGE_PERCENT).toBe(25);
    expect(blastPlayerDamage(400)).toBe(100);
    expect(blastPlayerDamage(101)).toBe(26);
    expect(blastPlayerDamage(1)).toBe(1);
  });

  it('the blast throws lying corpses up and away from the barrel, not carried ones', (): void => {
    const b: LooseProp = barrel(500);
    const center: { x: number; y: number } = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const left: ZombieCorpse = corpseAt(center.x - 40);
    const right: ZombieCorpse = corpseAt(center.x + 40);
    const far: ZombieCorpse = corpseAt(center.x + RADIUS + 10);
    const carried: ZombieCorpse = corpseAt(center.x, { carrierId: 'p1', isGrounded: false });
    const caught: ZombieCorpse[] = blastCorpses([left, right, far, carried], center);
    expect(caught).toEqual([left, right]);
    for (const c of caught) flingCorpse(c, center);
    expect(left.velocityX).toBe(-GAME_CONSTANTS.BARREL_BLAST_CORPSE_SPEED_X);
    expect(right.velocityX).toBe(GAME_CONSTANTS.BARREL_BLAST_CORPSE_SPEED_X);
    for (const c of caught) {
      expect(c.velocityY).toBe(GAME_CONSTANTS.BARREL_BLAST_CORPSE_SPEED_Y);
      expect(c.velocityY).toBeLessThan(0);
      expect(c.isGrounded).toBe(false);
    }
  });
});
