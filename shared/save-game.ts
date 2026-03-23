import { CharacterClass, CharacterStats } from './character';
import { PlayerInventory, QuickSlotEntry } from './game-entities';
import { KeyBindings } from './messages';

export const MAX_SAVE_SLOTS: number = 5;

export interface SaveGameData {
  saveName: string;
  timestamp: number;
  floor: number;
  score: number;
  classId: CharacterClass;
  playerName: string;
  level: number;
  xp: number;
  xpToNext: number;
  allocatedStats: CharacterStats;
  unallocatedStatPoints: number;
  unallocatedSkillPoints: number;
  skillLevels: Record<string, number>;
  inventory: PlayerInventory;
  quickSlots: Record<string, QuickSlotEntry | null>;
  keyBindings?: KeyBindings;
}

export interface SaveGameSlot {
  key: string;
  data: SaveGameData;
}
