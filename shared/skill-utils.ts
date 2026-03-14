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

export function getPassiveBonusValue(skill: SkillDefinition, level: number): number {
  if (level <= 0 || !skill.passiveBonus) return 0;
  return skill.passiveBonus.baseValue + skill.passiveBonus.valuePerLevel * (level - 1);
}
