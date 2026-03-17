import { PlayerInventory } from './game-entities';

export enum CharacterClass {
  Warrior = 'warrior',
  Ranger = 'ranger',
  Mage = 'mage',
  Assassin = 'assassin',
  Priest = 'priest',
}

export interface CharacterStats {
  str: number;
  dex: number;
  int: number;
  luk: number;
}

export interface CharacterDerived {
  maxHp: number;
  maxMp: number;
  attack: number;
  defense: number;
  speed: number;
  critRate: number;
  critDamage: number;
}

export interface CharacterClassDefinition {
  id: CharacterClass;
  name: string;
  description: string;
  baseStats: CharacterStats;
  color: string;
  icon: string;
}

export interface ActiveBuff {
  skillId: string;
  remainingMs: number;
  totalDurationMs: number;
  stat: keyof CharacterDerived | 'allDamagePercent' | 'knockbackResist' | 'maxHpMaxMpPercent';
  value: number;
}

export interface CharacterState {
  id: string;
  name: string;
  classId: CharacterClass;
  level: number;
  xp: number;
  xpToNext: number;
  stats: CharacterStats;
  derived: CharacterDerived;
  hp: number;
  mp: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: Direction;
  isGrounded: boolean;
  isAttacking: boolean;
  isClimbing: boolean;
  isDead: boolean;
  unallocatedStatPoints: number;
  unallocatedSkillPoints: number;
  allocatedStats: CharacterStats;
  skillLevels: Record<string, number>;
  activeBuffs: ActiveBuff[];
  inventory: PlayerInventory;
}

export enum Direction {
  Left = 'left',
  Right = 'right',
}
