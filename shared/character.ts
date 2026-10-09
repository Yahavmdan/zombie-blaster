import { PlayerInventory } from './game-entities';
import { PixelIconId } from './pixel-icon';

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
  icon: PixelIconId;
}

export type BuffStat = keyof CharacterDerived | 'allDamagePercent' | 'knockbackResist' | 'maxHpMaxMpPercent' | 'attackSpeed' | 'twinMimicPercent' | 'darkSight' | 'darkSightSpeedPenalty';

export interface ActiveBuff {
  skillId: string;
  remainingMs: number;
  totalDurationMs: number;
  stat: BuffStat;
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
  isDoubleJumping: boolean;
  isClimbing: boolean;
  isDead: boolean;
  isDown: boolean;
  /** Id of the downed teammate this player is channeling a revive on (pauses their bleed-out). */
  revivingPlayerId?: string | null;
  /** Corpses and loose props (ids) this player wants to carry, bottom of the stack first: their request, confirmed by the host through `ZombieCorpse.carrierId` / `LooseProp.carrierId`. */
  carryingCorpseIds?: string[];
  downTimer: number;
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
