import { SkillDefinition } from './skill';

export function getSkillDamageMultiplier(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  if (skill.levelData && level <= skill.levelData.length) {
    return skill.levelData[level - 1].damage;
  }
  return skill.scaling.baseDamage + skill.scaling.damagePerLevel * (level - 1);
}

export function getSkillMpCost(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  if (skill.levelData && level <= skill.levelData.length) {
    return skill.levelData[level - 1].mpCost;
  }
  return Math.max(1, Math.floor(skill.scaling.baseMpCost + skill.scaling.mpCostPerLevel * (level - 1)));
}

export function getSkillHpCost(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  if (skill.levelData && level <= skill.levelData.length) {
    return skill.levelData[level - 1].hpCost;
  }
  return 0;
}

export function getSkillCooldown(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  return Math.max(200, skill.scaling.baseCooldown - skill.scaling.cooldownReductionPerLevel * (level - 1));
}

export function getSkillRange(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  if (skill.levelData && level <= skill.levelData.length && skill.levelData[level - 1].range !== undefined) {
    return skill.levelData[level - 1].range!;
  }
  return skill.scaling.baseRange + skill.scaling.rangePerLevel * (level - 1);
}

export function getBuffEffectValue(skill: SkillDefinition, level: number): number {
  if (level <= 0 || !skill.buffEffect) return 0;
  if (skill.levelData && level <= skill.levelData.length) {
    return skill.levelData[level - 1].damage;
  }
  return skill.buffEffect.baseValue + skill.buffEffect.valuePerLevel * (level - 1);
}

export function getBuffDurationMs(skill: SkillDefinition, level: number): number {
  if (level <= 0 || !skill.buffDuration) return 0;
  return skill.buffDuration.baseDurationMs + skill.buffDuration.durationPerLevelMs * (level - 1);
}

export function getSkillStunDurationMs(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  if (skill.levelData && level <= skill.levelData.length) {
    return skill.levelData[level - 1].stunDurationMs ?? 0;
  }
  return 0;
}

export function getPassiveEffectValue(skill: SkillDefinition, level: number): number {
  if (level <= 0 || !skill.passiveEffect) return 0;
  if (skill.levelData && level <= skill.levelData.length) {
    return skill.levelData[level - 1].damage;
  }
  return skill.scaling.baseDamage + skill.scaling.damagePerLevel * (level - 1);
}

export function getSecondaryBuffEffectValue(skill: SkillDefinition, level: number): number {
  if (level <= 0 || !skill.secondaryBuffEffect) return 0;
  return skill.secondaryBuffEffect.baseValue + skill.secondaryBuffEffect.valuePerLevel * (level - 1);
}

export function getAutoPotionSuccessChance(skill: SkillDefinition, level: number): number {
  if (level <= 0 || !skill.passiveEffect || skill.passiveEffect.type !== 'autoPotion') return 0;
  if (skill.levelData && level <= skill.levelData.length) {
    return skill.levelData[level - 1].damage;
  }
  return skill.scaling.baseDamage + skill.scaling.damagePerLevel * (level - 1);
}
