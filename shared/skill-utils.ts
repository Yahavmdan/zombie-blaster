import { SkillDefinition } from './skill';

export function getSkillDamageMultiplier(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  return skill.scaling.baseDamage + skill.scaling.damagePerLevel * (level - 1);
}

export function getSkillMpCost(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  return Math.max(1, Math.floor(skill.scaling.baseMpCost + skill.scaling.mpCostPerLevel * (level - 1)));
}

export function getSkillCooldown(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  return Math.max(200, skill.scaling.baseCooldown - skill.scaling.cooldownReductionPerLevel * (level - 1));
}

export function getSkillRange(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  return skill.scaling.baseRange + skill.scaling.rangePerLevel * (level - 1);
}

export function getBuffEffectValue(skill: SkillDefinition, level: number): number {
  if (level <= 0 || !skill.buffEffect) return 0;
  return skill.buffEffect.baseValue + skill.buffEffect.valuePerLevel * (level - 1);
}

export function getBuffDurationMs(skill: SkillDefinition, level: number): number {
  if (level <= 0 || !skill.buffDuration) return 0;
  return skill.buffDuration.baseDurationMs + skill.buffDuration.durationPerLevelMs * (level - 1);
}
