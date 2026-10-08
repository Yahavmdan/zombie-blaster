import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse } from '@shared/game-entities';

/**
 * Corpse carrying rules (pure). A player asks for corpses through their own state
 * (`carryingCorpseIds`, so guests send it with player-state); the host grants each with
 * `ZombieCorpse.carrierId`. Up to `CORPSE_CARRY_MAX` carried corpses stack on their carrier's head
 * in request order: no physics, not footholds, not food. Letting go tosses the whole stack forward
 * together, so it lands as a pile, and each body falls like any other corpse.
 */

type CarrierView = Pick<CharacterState, 'x' | 'y' | 'velocityX' | 'facing'>;

/** Hosts accept a request a little out of reach: the guest's position they see is ~50 ms old. */
const HOST_RANGE_SLACK: number = 2;

export function canCarry(player: Pick<CharacterState, 'isDead' | 'isDown'>): boolean {
  return !player.isDead && !player.isDown;
}

/** Corpses this player asked to carry, bottom of the stack first. */
export function carriedIds(player: Pick<CharacterState, 'carryingCorpseIds'>): string[] {
  return player.carryingCorpseIds ?? [];
}

export function isCarrying(player: Pick<CharacterState, 'carryingCorpseIds'>): boolean {
  return carriedIds(player).length > 0;
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

/** Puts a carried corpse on its carrier's head, centered; `level` 0 is the bottom of the stack. */
export function holdOverhead(
  corpse: ZombieCorpse,
  carrier: Pick<CharacterState, 'x' | 'y'>,
  level: number = 0,
): void {
  corpse.x = carrier.x + GAME_CONSTANTS.PLAYER_WIDTH / 2 - corpse.width / 2;
  corpse.y =
    carrier.y -
    GAME_CONSTANTS.CORPSE_CARRY_LIFT -
    level * GAME_CONSTANTS.CORPSE_CARRY_STACK_STEP -
    corpse.height;
  corpse.velocityX = 0;
  corpse.velocityY = 0;
  corpse.isGrounded = false;
}

/** Lets go: the corpse is tossed forward off its spot in the carrier's stack. */
export function tossCorpse(corpse: ZombieCorpse, carrier: CarrierView, level: number = 0): void {
  holdOverhead(corpse, carrier, level);
  const dir: number = carrier.facing === Direction.Left ? -1 : 1;
  corpse.velocityX = dir * GAME_CONSTANTS.CORPSE_THROW_SPEED_X + carrier.velocityX / 2;
  corpse.velocityY = GAME_CONSTANTS.CORPSE_THROW_SPEED_Y;
  corpse.carrierId = null;
}

/**
 * Host: settles who carries what this tick. Corpses whose carrier let go or went down are
 * tossed together (bottom one first, so the stack keeps its order and lands as a pile); a carrier
 * who left the game just drops theirs. Then requests are granted, first come first served, for
 * lying corpses within reach, up to `CORPSE_CARRY_MAX` per player.
 */
export function assignCarriers(corpses: ZombieCorpse[], players: CharacterState[]): void {
  const byId: Map<string, CharacterState> = new Map<string, CharacterState>(
    players.map((p: CharacterState): [string, CharacterState] => [p.id, p]),
  );
  const released: Map<CharacterState, ZombieCorpse[]> = new Map<CharacterState, ZombieCorpse[]>();
  for (const corpse of corpses) {
    if (corpse.carrierId === null) continue;
    const carrier: CharacterState | undefined = byId.get(corpse.carrierId);
    if (!carrier) {
      corpse.carrierId = null;
      corpse.isGrounded = false;
    } else if (!carriedIds(carrier).includes(corpse.id) || !canCarry(carrier)) {
      released.set(carrier, [...(released.get(carrier) ?? []), corpse]);
    }
  }
  for (const [carrier, stack] of released) {
    // Lowest on the head (largest y) is the bottom of the stack.
    stack.sort((a: ZombieCorpse, b: ZombieCorpse): number => b.y - a.y);
    stack.forEach((corpse: ZombieCorpse, level: number): void =>
      tossCorpse(corpse, carrier, level),
    );
  }
  for (const p of players) {
    if (!canCarry(p)) continue;
    let held: number = corpses.filter((c: ZombieCorpse): boolean => c.carrierId === p.id).length;
    for (const id of carriedIds(p)) {
      if (held >= GAME_CONSTANTS.CORPSE_CARRY_MAX) break;
      const corpse: ZombieCorpse | undefined = corpses.find(
        (c: ZombieCorpse): boolean => c.id === id,
      );
      if (!corpse || corpse.carrierId !== null || !corpse.isGrounded) continue;
      if (distanceToCorpse(p, corpse) > GAME_CONSTANTS.CORPSE_CARRY_RANGE * HOST_RANGE_SLACK)
        continue;
      corpse.carrierId = p.id;
      held++;
    }
  }
}

/** Every client: carried corpses ride stacked on their carrier as this client sees them. */
export function holdCarriedCorpses(corpses: ZombieCorpse[], players: CharacterState[]): void {
  for (const corpse of corpses) {
    if (corpse.carrierId === null) continue;
    const carrier: CharacterState | undefined = players.find(
      (p: CharacterState): boolean => p.id === corpse.carrierId,
    );
    // A carrier who already let go keeps the corpse where it is until the host's toss arrives.
    const level: number = carrier ? carriedIds(carrier).indexOf(corpse.id) : -1;
    if (carrier && level >= 0) holdOverhead(corpse, carrier, level);
  }
}
