import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { LooseProp, ZombieCorpse } from '@shared/game-entities';

/**
 * Carrying rules (pure), the same for corpses and loose props. A player asks for things through
 * their own state (`carryingCorpseIds`, so guests send it with player-state); the host grants each
 * with its `carrierId`. Up to `CORPSE_CARRY_MAX` carried things stack on their carrier's head in
 * request order: no physics, not footholds, not food. Letting go tosses the whole stack forward
 * together, so it lands as a pile, and each one falls like any other corpse or prop.
 */

/** Something a player can carry overhead: a corpse or a loose prop. */
export type Carriable = ZombieCorpse | LooseProp;

type CarrierView = Pick<CharacterState, 'x' | 'y' | 'velocityX' | 'facing'>;

/** Hosts accept a request a little out of reach: the guest's position they see is ~50 ms old. */
const HOST_RANGE_SLACK: number = 2;

export function canCarry(player: Pick<CharacterState, 'isDead' | 'isDown'>): boolean {
  return !player.isDead && !player.isDown;
}

/** Things this player asked to carry, bottom of the stack first. */
export function carriedIds(player: Pick<CharacterState, 'carryingCorpseIds'>): string[] {
  return player.carryingCorpseIds ?? [];
}

export function isCarrying(player: Pick<CharacterState, 'carryingCorpseIds'>): boolean {
  return carriedIds(player).length > 0;
}

export function isCorpse(item: Carriable): item is ZombieCorpse {
  return 'spriteKey' in item;
}

/** Gap between a carried thing's box bottom and what holds it (a lying corpse's body is high in its box). */
function liftOf(item: Carriable): number {
  return isCorpse(item) ? GAME_CONSTANTS.CORPSE_CARRY_LIFT : 0;
}

/** How much higher the next thing in the stack rests than this one: a flat body, or the prop's height. */
function stackStepOf(item: Carriable): number {
  return isCorpse(item) ? GAME_CONSTANTS.CORPSE_CARRY_STACK_STEP : item.height;
}

function distanceTo(player: Pick<CharacterState, 'x' | 'y'>, item: Carriable): number {
  const px: number = player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
  const py: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
  const cx: number = item.x + item.width / 2;
  const cy: number = item.y + item.height / 2;
  return Math.hypot(cx - px, cy - py);
}

/** The nearest lying corpse or prop within reach that nobody carries, or null. */
export function nearestCarriable<T extends Carriable>(
  player: Pick<CharacterState, 'x' | 'y'>,
  items: T[],
): T | null {
  let best: T | null = null;
  let bestDist: number = GAME_CONSTANTS.CORPSE_CARRY_RANGE;
  for (const item of items) {
    if (!item.isGrounded || item.carrierId !== null) continue;
    const dist: number = distanceTo(player, item);
    if (dist <= bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Puts a carried thing on its carrier's head, centered, resting `restY` px above the head (on what
 * is lower in the stack). Returns where the next one up rests.
 */
export function holdOverhead(
  item: Carriable,
  carrier: Pick<CharacterState, 'x' | 'y'>,
  restY: number = 0,
): number {
  item.x = carrier.x + GAME_CONSTANTS.PLAYER_WIDTH / 2 - item.width / 2;
  item.y = carrier.y - restY - liftOf(item) - item.height;
  item.velocityX = 0;
  item.velocityY = 0;
  item.isGrounded = false;
  return restY + stackStepOf(item);
}

/** Lets go: the thing is tossed forward off its spot (`restY`) in the carrier's stack. */
export function toss(item: Carriable, carrier: CarrierView, restY: number = 0): number {
  const next: number = holdOverhead(item, carrier, restY);
  const dir: number = carrier.facing === Direction.Left ? -1 : 1;
  item.velocityX = dir * GAME_CONSTANTS.CORPSE_THROW_SPEED_X + carrier.velocityX / 2;
  item.velocityY = GAME_CONSTANTS.CORPSE_THROW_SPEED_Y;
  item.carrierId = null;
  return next;
}

/**
 * Host: settles who carries what this tick. Things whose carrier let go or went down are tossed
 * together (bottom one first, so the stack keeps its order and lands as a pile); a carrier who left
 * the game just drops theirs. Then requests are granted, first come first served, for lying
 * corpses and props within reach, up to `CORPSE_CARRY_MAX` per player.
 */
export function assignCarriers(items: Carriable[], players: CharacterState[]): void {
  const byId: Map<string, CharacterState> = new Map<string, CharacterState>(
    players.map((p: CharacterState): [string, CharacterState] => [p.id, p]),
  );
  const released: Map<CharacterState, Carriable[]> = new Map<CharacterState, Carriable[]>();
  for (const item of items) {
    if (item.carrierId === null) continue;
    const carrier: CharacterState | undefined = byId.get(item.carrierId);
    if (!carrier) {
      item.carrierId = null;
      item.isGrounded = false;
    } else if (!carriedIds(carrier).includes(item.id) || !canCarry(carrier)) {
      released.set(carrier, [...(released.get(carrier) ?? []), item]);
    }
  }
  for (const [carrier, stack] of released) {
    // Lowest on the head (largest box bottom) is the bottom of the stack.
    stack.sort((a: Carriable, b: Carriable): number => b.y + b.height - (a.y + a.height));
    let restY: number = 0;
    for (const item of stack) restY = toss(item, carrier, restY);
  }
  for (const p of players) {
    if (!canCarry(p)) continue;
    let held: number = items.filter((c: Carriable): boolean => c.carrierId === p.id).length;
    for (const id of carriedIds(p)) {
      if (held >= GAME_CONSTANTS.CORPSE_CARRY_MAX) break;
      const item: Carriable | undefined = items.find((c: Carriable): boolean => c.id === id);
      if (!item || item.carrierId !== null || !item.isGrounded) continue;
      if (distanceTo(p, item) > GAME_CONSTANTS.CORPSE_CARRY_RANGE * HOST_RANGE_SLACK) continue;
      item.carrierId = p.id;
      held++;
    }
  }
}

/**
 * Every client: carried things ride stacked on their carrier as this client sees them. A guest
 * passes itself as `guest`: its own pick-ups ride on it right away, while the host's grant is on
 * its way.
 */
export function holdCarried(
  items: Carriable[],
  players: CharacterState[],
  guest: CharacterState | null = null,
): void {
  for (const carrier of players) {
    let restY: number = 0;
    for (const id of carriedIds(carrier)) {
      const item: Carriable | undefined = items.find((c: Carriable): boolean => c.id === id);
      const held: boolean =
        !!item &&
        (item.carrierId === carrier.id || (carrier === guest && item.carrierId === null));
      // A carrier who already let go keeps it where it is until the host's toss arrives.
      if (item && held) restY = holdOverhead(item, carrier, restY);
    }
  }
}
