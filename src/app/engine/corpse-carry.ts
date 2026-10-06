import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse } from '@shared/game-entities';

/**
 * Corpse carrying rules (pure). A player asks for a corpse through their own state
 * (`carryingCorpseId`, so guests send it with player-state); the host grants it with
 * `ZombieCorpse.carrierId`. A carried corpse rides on its carrier's head: no physics, not a
 * foothold, not food. Letting go tosses it forward and it falls like any other corpse.
 */

type CarrierView = Pick<CharacterState, 'x' | 'y' | 'velocityX' | 'facing'>;

/** Hosts accept a request a little out of reach: the guest's position they see is ~50 ms old. */
const HOST_RANGE_SLACK: number = 2;

export function canCarry(player: Pick<CharacterState, 'isDead' | 'isDown'>): boolean {
  return !player.isDead && !player.isDown;
}

function distanceToCorpse(player: Pick<CharacterState, 'x' | 'y'>, corpse: ZombieCorpse): number {
  const px: number = player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
  const py: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
  const cx: number = corpse.x + corpse.width / 2;
  const cy: number = corpse.y + corpse.height / 2;
  return Math.hypot(cx - px, cy - py);
}

/** The nearest lying corpse within reach that nobody carries, or null. */
export function carryableCorpse(
  player: Pick<CharacterState, 'x' | 'y'>,
  corpses: ZombieCorpse[],
): ZombieCorpse | null {
  let best: ZombieCorpse | null = null;
  let bestDist: number = GAME_CONSTANTS.CORPSE_CARRY_RANGE;
  for (const corpse of corpses) {
    if (!corpse.isGrounded || corpse.carrierId !== null) continue;
    const dist: number = distanceToCorpse(player, corpse);
    if (dist <= bestDist) {
      best = corpse;
      bestDist = dist;
    }
  }
  return best;
}

/** Puts a carried corpse on its carrier's head, centered. */
export function holdOverhead(corpse: ZombieCorpse, carrier: Pick<CharacterState, 'x' | 'y'>): void {
  corpse.x = carrier.x + GAME_CONSTANTS.PLAYER_WIDTH / 2 - corpse.width / 2;
  corpse.y = carrier.y - GAME_CONSTANTS.CORPSE_CARRY_LIFT - corpse.height;
  corpse.velocityX = 0;
  corpse.velocityY = 0;
  corpse.isGrounded = false;
}

/** Lets go: the corpse is tossed forward off the carrier's head. */
export function tossCorpse(corpse: ZombieCorpse, carrier: CarrierView): void {
  holdOverhead(corpse, carrier);
  const dir: number = carrier.facing === Direction.Left ? -1 : 1;
  corpse.velocityX = dir * GAME_CONSTANTS.CORPSE_THROW_SPEED_X + carrier.velocityX / 2;
  corpse.velocityY = GAME_CONSTANTS.CORPSE_THROW_SPEED_Y;
  corpse.carrierId = null;
}

/**
 * Host: settles who carries what this tick. Corpses whose carrier let go or went down are
 * tossed; a carrier who left the game just drops theirs. Then requests are granted, first come
 * first served, for lying corpses within reach.
 */
export function assignCarriers(corpses: ZombieCorpse[], players: CharacterState[]): void {
  const byId: Map<string, CharacterState> = new Map<string, CharacterState>(
    players.map((p: CharacterState): [string, CharacterState] => [p.id, p]),
  );
  for (const corpse of corpses) {
    if (corpse.carrierId === null) continue;
    const carrier: CharacterState | undefined = byId.get(corpse.carrierId);
    if (!carrier) {
      corpse.carrierId = null;
      corpse.isGrounded = false;
    } else if (carrier.carryingCorpseId !== corpse.id || !canCarry(carrier)) {
      tossCorpse(corpse, carrier);
    }
  }
  for (const p of players) {
    if (!p.carryingCorpseId || !canCarry(p)) continue;
    if (corpses.some((c: ZombieCorpse): boolean => c.carrierId === p.id)) continue;
    const corpse: ZombieCorpse | undefined = corpses.find(
      (c: ZombieCorpse): boolean => c.id === p.carryingCorpseId,
    );
    if (!corpse || corpse.carrierId !== null || !corpse.isGrounded) continue;
    if (distanceToCorpse(p, corpse) > GAME_CONSTANTS.CORPSE_CARRY_RANGE * HOST_RANGE_SLACK)
      continue;
    corpse.carrierId = p.id;
  }
}

/** Every client: carried corpses ride on their carrier as this client sees them. */
export function holdCarriedCorpses(corpses: ZombieCorpse[], players: CharacterState[]): void {
  for (const corpse of corpses) {
    if (corpse.carrierId === null) continue;
    const carrier: CharacterState | undefined = players.find(
      (p: CharacterState): boolean => p.id === corpse.carrierId,
    );
    // A carrier who already let go keeps the corpse where it is until the host's toss arrives.
    if (carrier && carrier.carryingCorpseId === corpse.id) holdOverhead(corpse, carrier);
  }
}
