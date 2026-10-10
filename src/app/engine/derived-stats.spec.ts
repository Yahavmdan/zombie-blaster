import { describe, expect, it } from 'vitest';
import { CharacterClass, CharacterState } from '@shared/index';
import { refreshDerivedStats } from './derived-stats';

function warrior(): CharacterState {
  return {
    id: 'p1',
    name: 'Test',
    classId: CharacterClass.Warrior,
    level: 10,
    xp: 0,
    xpToNext: 100,
    stats: { str: 0, dex: 0, int: 0, luk: 0 },
    derived: { maxHp: 0, maxMp: 0, attack: 0, defense: 0, speed: 0, critRate: 0, critDamage: 0 },
    hp: 1,
    mp: 1,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    facing: 'right' as CharacterState['facing'],
    isGrounded: true,
    isAttacking: false,
    isDoubleJumping: false,
    isClimbing: false,
    isDead: false,
    isDown: false,
    downTimer: 0,
    unallocatedStatPoints: 0,
    unallocatedSkillPoints: 0,
    allocatedStats: { str: 10, dex: 0, int: 0, luk: 5 },
    skillLevels: {},
    activeBuffs: [],
    inventory: { potions: {}, gold: 0, autoPotionHpId: null, autoPotionMpId: null },
  };
}

describe('refreshDerivedStats', (): void => {
  it('applies a running max HP/MP buff and clamps HP/MP when it ends', (): void => {
    const p: CharacterState = warrior();
    refreshDerivedStats(p);
    const baseMaxHp: number = p.derived.maxHp;
    const baseMaxMp: number = p.derived.maxMp;

    p.activeBuffs = [
      {
        skillId: 'warrior-hyper-body',
        remainingMs: 5_000,
        totalDurationMs: 5_000,
        stat: 'maxHpMaxMpPercent',
        value: 60,
      },
    ];
    refreshDerivedStats(p);
    expect(p.derived.maxHp).toBe(Math.floor(baseMaxHp * 1.6));
    expect(p.derived.maxMp).toBe(Math.floor(baseMaxMp * 1.6));

    p.hp = p.derived.maxHp;
    p.mp = p.derived.maxMp;
    p.activeBuffs = [];
    refreshDerivedStats(p);
    expect(p.derived.maxHp).toBe(baseMaxHp);
    expect(p.hp).toBe(baseMaxHp);
    expect(p.mp).toBe(baseMaxMp);
  });

  it('adds a crit-rate buff on top of the luck-based crit rate', (): void => {
    const p: CharacterState = warrior();
    refreshDerivedStats(p);
    const base: number = p.derived.critRate;
    p.activeBuffs = [
      {
        skillId: 'assassin-claw-mastery',
        remainingMs: 5_000,
        totalDurationMs: 5_000,
        stat: 'critRate',
        value: 10,
      },
    ];
    refreshDerivedStats(p);
    expect(p.derived.critRate).toBeGreaterThan(base);
  });
});
