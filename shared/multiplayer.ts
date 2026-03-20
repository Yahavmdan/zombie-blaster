import { CharacterClass, CharacterState } from './character';

export enum GameMode {
  SinglePlayer = 'single-player',
  Multiplayer = 'multiplayer',
}

export const MAX_PLAYERS_PER_ROOM: number = 6;

export enum RoomStatus {
  Waiting = 'waiting',
  InGame = 'in-game',
  Finished = 'finished',
}

export interface RoomPlayer {
  id: string;
  name: string;
  classId: CharacterClass;
  isHost: boolean;
  isReady: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  hostName: string;
  players: RoomPlayer[];
  maxPlayers: number;
  status: RoomStatus;
  createdAt: number;
}

export enum ServerMessageType {
  RoomCreated = 'room-created',
  RoomJoined = 'room-joined',
  RoomLeft = 'room-left',
  RoomUpdated = 'room-updated',
  RoomList = 'room-list',
  GameStarted = 'game-started',
  GameStateUpdate = 'game-state-update',
  GameSync = 'game-sync',
  PlayerStateBroadcast = 'player-state-broadcast',
  PlayerInput = 'player-input',
  Error = 'error',
  PlayerKicked = 'player-kicked',
  ChatMessage = 'chat-message',
  Pong = 'pong',
  ZombieDamage = 'zombie-damage',
  ZombieAttackPlayer = 'zombie-attack-player',
  PlayerLeft = 'player-left',
}

export enum ClientMessageType {
  CreateRoom = 'create-room',
  JoinRoom = 'join-room',
  LeaveRoom = 'leave-room',
  ListRooms = 'list-rooms',
  ToggleReady = 'toggle-ready',
  StartGame = 'start-game',
  PlayerInput = 'player-input',
  GameSync = 'game-sync',
  PlayerState = 'player-state',
  KickPlayer = 'kick-player',
  ChatMessage = 'chat-message',
  Ping = 'ping',
  ZombieDamage = 'zombie-damage',
  ZombieAttackPlayer = 'zombie-attack-player',
}

export interface CreateRoomPayload {
  roomName: string;
  playerName: string;
  classId: CharacterClass;
}

export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
  classId: CharacterClass;
}

export interface LeaveRoomPayload {
  roomId: string;
}

export interface ToggleReadyPayload {
  roomId: string;
}

export interface StartGamePayload {
  roomId: string;
}

export interface KickPlayerPayload {
  roomId: string;
  playerId: string;
}

export interface LobbyPlayerInputPayload {
  roomId: string;
  keys: import('./messages').InputKeys;
  attackSkillId?: string;
}

export interface LobbyChatPayload {
  roomId: string;
  message: string;
}

export interface ServerMessage<T = unknown> {
  type: ServerMessageType;
  payload: T;
  timestamp: number;
}

export interface ClientMessage<T = unknown> {
  type: ClientMessageType;
  payload: T;
  timestamp: number;
}

export interface RoomCreatedPayload {
  room: RoomInfo;
  playerId: string;
}

export interface RoomJoinedPayload {
  room: RoomInfo;
  playerId: string;
}

export interface RoomUpdatedPayload {
  room: RoomInfo;
}

export interface RoomListPayload {
  rooms: RoomInfo[];
}

export interface GameStartedPayload {
  roomId: string;
  players: CharacterState[];
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ChatBroadcastPayload {
  playerId: string;
  playerName: string;
  message: string;
}

export interface MultiplayerSyncPayload {
  roomId: string;
  hostId: string;
  players: CharacterState[];
  zombies: import('./game-entities').ZombieState[];
  floor: number;
}

export interface PlayerStateBroadcast {
  playerId: string;
  player: CharacterState;
}

export interface RemoteInputPayload {
  roomId: string;
  playerId: string;
  keys: import('./messages').InputKeys;
  attackSkillId?: string;
}

export interface PlayerLeftPayload {
  playerId: string;
}

export interface ZombieDamageEvent {
  zombieId: string;
  damage: number;
  killed: boolean;
}

export interface ZombieDamagePayload {
  roomId: string;
  events: ZombieDamageEvent[];
}

export interface RemoteZombieDamagePayload {
  playerId: string;
  events: ZombieDamageEvent[];
}

export interface ZombieAttackPlayerPayload {
  targetPlayerId: string;
  damage: number;
  zombieX: number;
  zombieY: number;
  knockbackDir: number;
  isPoisonAttack: boolean;
}
