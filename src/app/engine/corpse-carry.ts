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

/**
 * How a carried corpse sways on its carrier (drawing only: its box stays where `holdOverhead`
 * puts it). Every client works it out from the carrier it sees, so all players see the same sway.
 */
export interface CarryPose {
  /** Vertical shift in px (negative = up). */
  bob: number;
  /** How far the body's ends hang below its middle on the head, in px (negative = ends up). */
  sag: number;
  /** Rotation about the head in radians (positive = clockwise). */
  tilt: number;
}

type SwayView = Pick<CharacterState, 'x' | 'velocityX' | 'velocityY' | 'isGrounded'>;

/** Where a corpse starts when picked up: flat, so it visibly flops into its droop. */
export const REST_POSE: CarryPose = { bob: 0, sag: 0, tilt: 0 };

/** Ground walked per footfall (each footfall bounces the load once). */
const STRIDE_PX: number = 44;
/** Walking speed (px/tick) at which the sway is at full strength. */
const FULL_SWAY_SPEED: number = 2;
const STEP_BOB_PX: number = 2.5;
/** A limp body droops over the head this much even when standing still. */
const REST_SAG_PX: number = 3;
/** Footfalls fling the ends: they lag behind the bounce by this much either way. */
const STEP_SAG_PX: number = 1.5;
/** The load shifts side to side with each step. */
const STEP_ROCK_RAD: number = 0.035;
/** Each body higher up the stack follows the one below it a little late... */
const LEVEL_LAG_RAD: number = 0.35;
/** ...and swings a little wider. */
const LEVEL_SWAY_GAIN: number = 0.2;
/** In the air the load lags the jump: pressed down on the way up, floating on the way down. */
const AIR_BOB_PER_SPEED: number = 0.5;
const AIR_BOB_MAX_PX: number = 3;
const AIR_SAG_PER_SPEED: number = 0.35;
const AIR_SAG_MIN_PX: number = -2;
const AIR_SAG_MAX_PX: number = 3;
/** Share of the way to the target pose covered each tick (bodies have weight; they settle). */
const POSE_EASE: number = 0.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The pose the carrier's motion pushes a corpse toward; `level` 0 is the bottom of the stack. */
export function carrySway(carrier: SwayView, level: number): CarryPose {
  const gain: number = 1 + level * LEVEL_SWAY_GAIN;
  if (!carrier.isGrounded) {
    // velocityY is negative going up.
    return {
      bob: clamp(-carrier.velocityY * AIR_BOB_PER_SPEED, -AIR_BOB_MAX_PX, AIR_BOB_MAX_PX) * gain,
      sag:
        REST_SAG_PX +
        clamp(-carrier.velocityY * AIR_SAG_PER_SPEED, AIR_SAG_MIN_PX, AIR_SAG_MAX_PX) * gain,
      tilt: 0,
    };
  }
  // The stride phase follows the ground covered, so the bounce stops when the carrier does.
  const strength: number = Math.min(1, Math.abs(carrier.velocityX) / FULL_SWAY_SPEED) * gain;
  const phase: number = (carrier.x / STRIDE_PX) * Math.PI - level * LEVEL_LAG_RAD;
  return {
    bob: -STEP_BOB_PX * Math.abs(Math.sin(phase)) * strength,
    // sin(2φ) has the sign of the bounce's slope: rising, the ends hang back down.
    sag: REST_SAG_PX + STEP_SAG_PX * Math.sin(2 * phase) * strength,
    tilt: STEP_ROCK_RAD * Math.sin(phase) * strength,
  };
}

/** One tick of a corpse settling toward the pose its carrier pushes it to. */
export function easeCarryPose(current: CarryPose, target: CarryPose): CarryPose {
  return {
    bob: current.bob + (target.bob - current.bob) * POSE_EASE,
    sag: current.sag + (target.sag - current.sag) * POSE_EASE,
    tilt: current.tilt + (target.tilt - current.tilt) * POSE_EASE,
  };
}

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
