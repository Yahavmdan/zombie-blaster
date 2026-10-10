import { CharacterState, GAME_CONSTANTS } from '@shared/index';

/**
 * Co-op: a player who bled out (or is still down) when the team reaches a new floor is back on
 * their feet there, with part of their HP. Returns whether anything changed (the caller reports it).
 */
export function respawnForNewFloor(p: CharacterState | null): boolean {
  if (!p || !(p.isDead || p.isDown)) return false;
  p.isDead = false;
  p.isDown = false;
  p.downTimer = 0;
  p.hp = Math.max(1, Math.floor((p.derived.maxHp * GAME_CONSTANTS.FLOOR_RESPAWN_HP_PERCENT) / 100));
  return true;
}
