import { BuffStat, CharacterClass } from './character';

export enum SkillType {
  Active = 'active',
  Buff = 'buff',
  Passive = 'passive',
}

export type PassiveCondition = 'always' | 'standingStill';
export type PassiveEffectType = 'hpRecovery' | 'mpRecovery' | 'autoPotion';

export interface PassiveEffect {
  type: PassiveEffectType;
  intervalMs: number;
  condition: PassiveCondition;
  hpThresholdPercent?: number;
  mpThresholdPercent?: number;
}

export type SkillMechanic = 'damage' | 'pull' | 'dash' | 'doubleJump';

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
  stat: BuffStat;
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
  secondaryBuffEffect: BuffEffect | null;
  passiveEffect: PassiveEffect | null;
  mechanic: SkillMechanic;
  maxTargets: number;
  hpCostIsPercent: boolean;
  minHpPercent: number;
}
