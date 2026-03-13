import { CharacterClass } from './character';

export interface SkillDefinition {
  id: string;
  name: string;
  classId: CharacterClass;
  description: string;
  mpCost: number;
  cooldown: number;
  damage: number;
  range: number;
  unlockLevel: number;
  icon: string;
}
