import { CharacterClass, CharacterState } from './character';
import { ZombieState } from './game-entities';

export enum MessageType {
  PlayerJoined = 'player-joined',
  PlayerLeft = 'player-left',
  PlayerInput = 'player-input',
  GameStateUpdate = 'game-state-update',
  ZombieSpawned = 'zombie-spawned',
  ZombieKilled = 'zombie-killed',
  DamageDealt = 'damage-dealt',
  LootDropped = 'loot-dropped',
  FloorStarted = 'floor-started',
  FloorCompleted = 'floor-completed',
  PlayerDied = 'player-died',
  PlayerRespawned = 'player-respawned',
  ChatMessage = 'chat-message',
}

export interface PlayerJoinedPayload {
  playerId: string;
  name: string;
  classId: CharacterClass;
}

export interface PlayerInputPayload {
  playerId: string;
  keys: InputKeys;
  attackSkillId?: string;
}

export interface InputKeys {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  attack: boolean;
  skill1: boolean;
  skill2: boolean;
  skill3: boolean;
  skill4: boolean;
  skill5: boolean;
  skill6: boolean;
  openStats: boolean;
  openSkills: boolean;
  useHpPotion: boolean;
  useMpPotion: boolean;
  openShop: boolean;
  openInventory: boolean;
  revive: boolean;
  quickSlot1: boolean;
  quickSlot2: boolean;
  quickSlot3: boolean;
  quickSlot4: boolean;
  quickSlot5: boolean;
  quickSlot6: boolean;
  quickSlot7: boolean;
  quickSlot8: boolean;
}

export interface GameStateUpdatePayload {
  players: CharacterState[];
  zombies: ZombieState[];
  floor: number;
}

export interface DamageDealtPayload {
  sourceId: string;
  targetId: string;
  damage: number;
  isCrit: boolean;
  x: number;
  y: number;
}

export interface FloorStartedPayload {
  floor: number;
}

export interface ChatMessagePayload {
  playerId: string;
  playerName: string;
  message: string;
}

export interface GameMessage<T = unknown> {
  type: MessageType;
  payload: T;
  timestamp: number;
}

export type GameAction = keyof InputKeys;

export type KeyBindings = Record<GameAction, string[]>;
