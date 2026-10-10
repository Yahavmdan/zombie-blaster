import {
  ActiveBuff,
  CHARACTER_CLASSES,
  CLASS_STAT_WEIGHTS,
  CharacterClass,
  CharacterDerived,
  CharacterState,
  CharacterStats,
  ClassStatWeights,
  GAME_CONSTANTS,
} from '@shared/index';

/**
 * Derived stats (max HP/MP, attack, crit, ...) from base + allocated stats, level and active buffs.
 * Pure: the GameStateService uses it for progression, the engine whenever a buff starts or ends.
 */

export function totalStats(
  baseStats: CharacterStats,
  allocatedStats: CharacterStats,
): CharacterStats {
  return {
    str: baseStats.str + allocatedStats.str,
    dex: baseStats.dex + allocatedStats.dex,
    int: baseStats.int + allocatedStats.int,
    luk: baseStats.luk + allocatedStats.luk,
  };
}

export function calculateDerived(
  baseStats: CharacterStats,
  allocatedStats: CharacterStats,
  classId: CharacterClass,
  level: number = 1,
): CharacterDerived {
  const w: ClassStatWeights = CLASS_STAT_WEIGHTS[classId];
  const total: CharacterStats = totalStats(baseStats, allocatedStats);

  const primaryValue: number = total[w.primaryStat];
  const secondaryValue: number = total[w.secondaryStat];

  return {
    maxHp:
      GAME_CONSTANTS.PLAYER_BASE_HP +
      total.str * w.hpPerStr +
      (level - 1) * GAME_CONSTANTS.PLAYER_HP_PER_LEVEL,
    maxMp:
      GAME_CONSTANTS.PLAYER_BASE_MP +
      total.int * w.mpPerInt +
      (level - 1) * GAME_CONSTANTS.PLAYER_MP_PER_LEVEL,
    attack: Math.floor(primaryValue * w.attackFromPrimary + secondaryValue * w.attackFromSecondary),
    defense: Math.floor(total.str * w.defenseFromStr + total.dex * w.defenseFromDex),
    speed: GAME_CONSTANTS.PLAYER_MOVE_SPEED + total.dex * GAME_CONSTANTS.PLAYER_SPEED_PER_DEX,
    critRate: Math.min(total.luk * w.critFromLuk, GAME_CONSTANTS.PLAYER_CRIT_RATE_CAP),
    critDamage: GAME_CONSTANTS.PLAYER_CRIT_DAMAGE_BASE + total.luk * w.critDmgFromLuk,
  };
}

export function calculateDerivedWithBuffs(
  baseStats: CharacterStats,
  allocatedStats: CharacterStats,
  classId: CharacterClass,
  activeBuffs: ActiveBuff[],
  level: number = 1,
): CharacterDerived {
  const derived: CharacterDerived = calculateDerived(baseStats, allocatedStats, classId, level);

  for (const buff of activeBuffs) {
    if (buff.remainingMs <= 0) continue;

    const target: string = buff.stat;
    if (target === 'allDamagePercent') {
      derived.attack = Math.floor(derived.attack * (1 + buff.value / 100));
    } else if (target === 'maxHpMaxMpPercent') {
      derived.maxHp = Math.floor(derived.maxHp * (1 + buff.value / 100));
      derived.maxMp = Math.floor(derived.maxMp * (1 + buff.value / 100));
    } else if (target in derived) {
      (derived as unknown as Record<string, number>)[target] += buff.value;
    }
  }

  derived.critRate = Math.min(derived.critRate, GAME_CONSTANTS.PLAYER_CRIT_RATE_CAP);

  return derived;
}

/** Recomputes the player's derived stats from its current buffs; HP and MP never exceed the new maximums. */
export function refreshDerivedStats(p: CharacterState): void {
  p.derived = calculateDerivedWithBuffs(
    CHARACTER_CLASSES[p.classId].baseStats,
    p.allocatedStats,
    p.classId,
    p.activeBuffs,
    p.level,
  );
  p.hp = Math.min(p.hp, p.derived.maxHp);
  p.mp = Math.min(p.mp, p.derived.maxMp);
}
