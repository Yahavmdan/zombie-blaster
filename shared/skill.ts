import { CharacterClass, CharacterDerived } from './character';

export enum SkillType {
  Active = 'active',
  Buff = 'buff',
}

export interface SkillScaling {
  baseDamage: number;
  damagePerLevel: number;
  baseMpCost: number;
  mpCostPerLevel: number;
  baseCooldown: number;
  cooldownReductionPerLevel: number;
  baseRange: number;
  rangePerLevel: number;
}

export interface BuffEffect {
  stat: keyof CharacterDerived | 'allDamagePercent';
  baseValue: number;
  valuePerLevel: number;
}

export interface BuffDuration {
  baseDurationMs: number;
  durationPerLevelMs: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  classId: CharacterClass;
  type: SkillType;
  description: string;
  maxLevel: number;
  requiredCharacterLevel: number;
  icon: string;
  color: string;
  scaling: SkillScaling;
  buffEffect: BuffEffect | null;
  buffDuration: BuffDuration | null;
  hitCount: number;
  aoeRadius: number;
  animationKey: string;
}
