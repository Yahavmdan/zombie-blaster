import { CharacterClass, CharacterDerived } from './character';

export enum SkillType {
  Active = 'active',
  Buff = 'buff',
  Passive = 'passive',
}

export type PassiveCondition = 'always' | 'standingStill';
export type PassiveEffectType = 'hpRecovery' | 'mpRecovery';

export interface PassiveEffect {
  type: PassiveEffectType;
  intervalMs: number;
  condition: PassiveCondition;
}

export type SkillMechanic = 'damage' | 'pull' | 'dash';

export interface SkillLevelData {
  mpCost: number;
  hpCost: number;
  damage: number;
  range?: number;
  stunDurationMs?: number;
}

export interface SkillPrerequisite {
  skillId: string;
  level: number;
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
  stat: keyof CharacterDerived | 'allDamagePercent' | 'knockbackResist' | 'maxHpMaxMpPercent';
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
  levelData: SkillLevelData[] | null;
  prerequisite: SkillPrerequisite | null;
  buffEffect: BuffEffect | null;
  buffDuration: BuffDuration | null;
  hitCount: number;
  aoeRadius: number;
  animationKey: string;
  passiveEffect: PassiveEffect | null;
  mechanic: SkillMechanic;
  maxTargets: number;
  hpCostIsPercent: boolean;
  minHpPercent: number;
}
