import { CharacterClass } from '../../shared/character.js';
import { GAME_CONSTANTS, getSkillTree } from '../../shared/game-constants.js';
import { normalizeSkillBar } from '../../shared/skill-tree.js';
import type { ClassSkillTree, TreeSkill } from '../../shared/skill-tree.js';
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  KickPlayerPayload,
  LobbyChatPayload,
  ReconnectPayload,
  RevivePlayerPayload,
  SetAfkPayload,
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
  damagePerHit: number;
  zombieEffects: number;
  effectForce: number;
} = {
  roomName: 40,
  playerName: 24,
  chatMessage: 200,
  id: 64,
  damageEvents: 64,
  // A maxed character's biggest crit with every multiplier is a few tens of thousands.
  damagePerHit: 1_000_000,
  zombieEffects: 64,
  // The host clamps forces and stuns again (SKILL_MAX_REMOTE_*); this only rejects garbage.
  effectForce: 100,
};

const ZOMBIE_EFFECT_KINDS: Set<string> = new Set<string>(['launch', 'knockdown', 'knockback', 'stun']);

const CLASS_IDS: Set<string> = new Set<string>(Object.values(CharacterClass));

export type UnknownRecord = Record<string, unknown>;

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
    isText(p['roomName'], LIMITS.roomName, false) &&
    isText(p['playerName'], LIMITS.playerName, false) &&
    isClassId(p['classId'])
  );
}

export function isJoinRoomPayload(p: unknown): p is JoinRoomPayload {
  return isObject(p) && isId(p['roomId']) && isText(p['playerName'], LIMITS.playerName, false) && isClassId(p['classId']);
}

/** toggle-ready, start-game: anything that names a room. */
export function isRoomIdPayload(p: unknown): p is StartGamePayload {
  return isObject(p) && isId(p['roomId']);
}

export function isKickPlayerPayload(p: unknown): p is KickPlayerPayload {
  return isObject(p) && isId(p['roomId']) && isId(p['playerId']);
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
      isObject(e) &&
      isId(e['zombieId']) &&
      isFiniteNumber(e['damage']) &&
      e['damage'] >= 0 &&
      e['damage'] <= LIMITS.damagePerHit &&
      typeof e['killed'] === 'boolean',
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

export function isSetAfkPayload(p: unknown): p is SetAfkPayload {
  return isObject(p) && typeof p['afk'] === 'boolean';
}

/** A guest's zombie pushes, launches and stuns for the host (absent is fine). */
function isZombieEffectList(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > LIMITS.zombieEffects) return false;
  return value.every(
    (e: unknown): boolean =>
      isObject(e) &&
      isId(e['zombieId']) &&
      typeof e['kind'] === 'string' &&
      ZOMBIE_EFFECT_KINDS.has(e['kind']) &&
      isFiniteNumber(e['dir']) &&
      isFiniteNumber(e['force']) &&
      e['force'] >= 0 &&
      e['force'] <= LIMITS.effectForce &&
      isFiniteNumber(e['stunMs']) &&
      e['stunMs'] >= 0 &&
      e['stunMs'] <= GAME_CONSTANTS.SKILL_MAX_REMOTE_STUN_MS,
  );
}

/** game-sync and player-state are relayed as-is; they need to be objects carrying a player (and sane effects). */
export function isStateSnapshotPayload(p: unknown): p is UnknownRecord {
  return isObject(p) && isObject(p['player']) && isZombieEffectList(p['zombieEffects']);
}

/**
 * Skill-tree classes: a relayed player owns only real skills of its class's tree, each unlocked by a
 * parent it owns, and no more than its level allows; its skill bar holds only those. Anything else is
 * dropped before the relay.
 */
export function sanitizeTreeSkills(player: UnknownRecord, classId: CharacterClass): void {
  const tree: ClassSkillTree | null = getSkillTree(classId);
  if (!tree) return;
  const claimed: unknown = player['skillLevels'];
  const levels: UnknownRecord = isObject(claimed) ? claimed : {};
  const level: number = isFiniteNumber(player['level']) ? player['level'] : 1;
  const points: number = GAME_CONSTANTS.TREE_STARTING_SKILL_POINTS + GAME_CONSTANTS.TREE_SKILL_POINTS_PER_LEVEL * (level - 1);
  const owned: Record<string, number> = {};
  let count: number = 0;
  const byTier: TreeSkill[] = [...tree.skills].sort((a: TreeSkill, b: TreeSkill): number => a.tier - b.tier);
  for (const skill of byTier) {
    if (levels[skill.id] !== 1) continue;
    if (count >= points) break;
    if (level < GAME_CONSTANTS.SKILL_TIER_LEVELS[skill.tier - 1]) continue;
    if (skill.parents.length > 0 && !skill.parents.some((id: string): boolean => owned[id] === 1)) continue;
    owned[skill.id] = 1;
    count++;
  }
  player['skillLevels'] = owned;
  // The skill bar names only skills it can own, each once, in the right number of slots.
  const bar: unknown = player['skillBar'];
  player['skillBar'] = normalizeSkillBar(tree, owned, Array.isArray(bar) ? bar : null, GAME_CONSTANTS.TREE_SKILL_BAR_SLOTS);
}
