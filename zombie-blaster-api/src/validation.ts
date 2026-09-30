import { CharacterClass } from '../../shared/character.js';
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  KickPlayerPayload,
  LobbyPlayerInputPayload,
  LobbyChatPayload,
  ReconnectPayload,
  RevivePlayerPayload,
  StartGamePayload,
  ZombieAttackPlayerPayload,
  ZombieDamagePayload,
} from '../../shared/multiplayer.js';

/**
 * Shape checks for every client message. The server never trusts the client:
 * a payload that fails its check is answered with an error and not handled.
 */

export const LIMITS: {
  roomName: number;
  playerName: number;
  chatMessage: number;
  id: number;
  damageEvents: number;
} = {
  roomName: 40,
  playerName: 24,
  chatMessage: 200,
  id: 64,
  damageEvents: 64,
};

const CLASS_IDS: Set<string> = new Set<string>(Object.values(CharacterClass));

type UnknownRecord = Record<string, unknown>;

export function isObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= LIMITS.id;
}

function isText(value: unknown, maxLength: number, allowEmpty: boolean): value is string {
  return typeof value === 'string' && value.length <= maxLength && (allowEmpty || value.trim().length > 0);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isClassId(value: unknown): value is CharacterClass {
  return typeof value === 'string' && CLASS_IDS.has(value);
}

export function isClientMessage(value: unknown): value is { type: string; payload: unknown } {
  return isObject(value) && typeof value['type'] === 'string';
}

export function isCreateRoomPayload(p: unknown): p is CreateRoomPayload {
  return (
    isObject(p) &&
    isText(p['roomName'], LIMITS.roomName, true) &&
    isText(p['playerName'], LIMITS.playerName, false) &&
    isClassId(p['classId'])
  );
}

export function isJoinRoomPayload(p: unknown): p is JoinRoomPayload {
  return isObject(p) && isId(p['roomId']) && isText(p['playerName'], LIMITS.playerName, false) && isClassId(p['classId']);
}

/** toggle-ready, start-game, leave-room, player-input: anything that names a room. */
export function isRoomIdPayload(p: unknown): p is StartGamePayload {
  return isObject(p) && isId(p['roomId']);
}

export function isKickPlayerPayload(p: unknown): p is KickPlayerPayload {
  return isObject(p) && isId(p['roomId']) && isId(p['playerId']);
}

/** Keys are relayed to other players as-is; only the envelope is checked. */
export function isPlayerInputPayload(p: unknown): p is LobbyPlayerInputPayload {
  return (
    isObject(p) &&
    isId(p['roomId']) &&
    isObject(p['keys']) &&
    (p['attackSkillId'] === undefined || isId(p['attackSkillId']))
  );
}

export function isChatPayload(p: unknown): p is LobbyChatPayload {
  return isObject(p) && isId(p['roomId']) && isText(p['message'], LIMITS.chatMessage, false);
}

export function isZombieDamagePayload(p: unknown): p is Pick<ZombieDamagePayload, 'events'> {
  if (!isObject(p) || !Array.isArray(p['events'])) return false;
  const events: unknown[] = p['events'];
  if (events.length === 0 || events.length > LIMITS.damageEvents) return false;
  return events.every(
    (e: unknown): boolean =>
      isObject(e) && isId(e['zombieId']) && isFiniteNumber(e['damage']) && e['damage'] >= 0 && typeof e['killed'] === 'boolean',
  );
}

export function isZombieAttackPlayerPayload(p: unknown): p is ZombieAttackPlayerPayload {
  return (
    isObject(p) &&
    isId(p['targetPlayerId']) &&
    isFiniteNumber(p['damage']) &&
    p['damage'] >= 0 &&
    isFiniteNumber(p['zombieX']) &&
    isFiniteNumber(p['zombieY']) &&
    isFiniteNumber(p['knockbackDir']) &&
    typeof p['isPoisonAttack'] === 'boolean'
  );
}

export function isRevivePlayerPayload(p: unknown): p is Pick<RevivePlayerPayload, 'targetPlayerId'> {
  return isObject(p) && isId(p['targetPlayerId']);
}

export function isReconnectPayload(p: unknown): p is ReconnectPayload {
  return isObject(p) && isId(p['reconnectToken']) && isText(p['playerName'], LIMITS.playerName, false) && isClassId(p['classId']);
}

/** game-sync and player-state are relayed as-is; they only need to be objects carrying a player. */
export function isStateSnapshotPayload(p: unknown): p is UnknownRecord {
  return isObject(p) && isObject(p['player']);
}
