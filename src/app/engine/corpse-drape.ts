import { GAME_CONSTANTS, ZOMBIE_TYPES } from '@shared/index';
import { ZombieCorpse, ZombieDefinition, ZombieType } from '@shared/game-entities';
import { CorpseSurface, corpseSurface } from './corpse-surface';

/**
 * Limp bodies on piles (drawing only). Physics holds a lying corpse up by a narrow foothold at its
 * feet, but its body stretches far behind them, so on a pile or a ledge edge the rest of it would
 * float. Each body is drawn in thin vertical strips; strips with nothing under them sag down onto
 * whatever is below (the ground, a platform, or a body lower in the pile, as that body is draped),
 * bending no steeper than `MAX_SLOPE` away from the feet. Every client drapes the corpses it sees
 * the same way, so all players see the same pile.
 */

/** Where a lying body sits in its sprite (fractions of the sprite width). */
export const BODY_SHIFT: number = 0.26;
export const BODY_HALF_SPAN: number = 0.27;
/** Width of the strips a body is bent in. */
export const DRAPE_STRIP_PX: number = 2;
/** A body lying on another is this thick (the pile's step per body). */
const BODY_THICKNESS_PX: number = GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_HEIGHT;
/** Steepest bend, in px dropped per px along the body... */
const MAX_SLOPE: number = 0.65;
/** ...reached gradually: a body curves over an edge, it doesn't fold at a hinge. */
const SLOPE_GAIN_PER_PX: number = 0.07;
/** A body bends down at most this far (fraction of the sprite width): it is only so long. */
const MAX_DROP_RATIO: number = 0.4;
/** Something this close above a body's underside still counts as under it. */
const SUPPORT_EPSILON_PX: number = 1;

/** A flat top bodies can rest on (the level's platforms and props). */
export interface DrapeSurface {
  x: number;
  y: number;
  width: number;
}

/**
 * How each strip of a lying body (from its left end) is moved: `drops` down below its feet, and
 * `shifts` sideways toward them (a bent body reaches less far than a straight one).
 */
export interface CorpseDrape {
  left: number;
  drops: number[];
  shifts: number[];
}

/** Drawn size (square) of a corpse's sprite. */
export function corpseRenderSize(corpse: ZombieCorpse): number {
  const def: ZombieDefinition = ZOMBIE_TYPES[corpse.type];
  const base: number =
    corpse.type === ZombieType.DragonBoss ? 260 : corpse.type === ZombieType.Boss ? 200 : 140;
  const scale: number = corpse.height / ((def.heightMin + def.heightMax) / 2);
  return Math.round(base * scale);
}

/** The sprite is mirrored for this corpse (the dragon's art faces the other way). */
export function corpseFlipX(corpse: ZombieCorpse): boolean {
  return corpse.type === ZombieType.DragonBoss ? corpse.facing > 0 : corpse.facing < 0;
}

/** The lying body's horizontal span: it stretches behind the feet (the box center). */
function bodySpan(corpse: ZombieCorpse): { left: number; right: number } {
  const size: number = corpseRenderSize(corpse);
  const middle: number =
    corpse.x + corpse.width / 2 - (corpseFlipX(corpse) ? 1 : -1) * size * BODY_SHIFT;
  return { left: middle - size * BODY_HALF_SPAN, right: middle + size * BODY_HALF_SPAN };
}

function stripAt(drape: CorpseDrape, x: number): number {
  const i: number = Math.floor((x - drape.left) / DRAPE_STRIP_PX);
  return Math.min(drape.drops.length - 1, Math.max(0, i));
}

/** How far the body is dropped at x (its end strips beyond its span). */
export function dropAt(drape: CorpseDrape, x: number): number {
  return drape.drops[stripAt(drape, x)];
}

/** How far the body at x is pulled sideways toward its feet. */
export function shiftAt(drape: CorpseDrape, x: number): number {
  return drape.shifts[stripAt(drape, x)];
}

/** The deepest sag of a drape. */
export function maxDrop(drape: CorpseDrape): number {
  return Math.max(0, ...drape.drops);
}

interface Placed {
  bottom: number;
  drape: CorpseDrape;
  right: number;
}

/** Drapes every lying corpse over what is under it; the lowest bodies first, so upper ones rest on them. */
export function drapeCorpses(
  corpses: ZombieCorpse[],
  surfaces: DrapeSurface[],
): Map<string, CorpseDrape> {
  const lying: ZombieCorpse[] = corpses
    .filter((c: ZombieCorpse): boolean => c.isGrounded && c.carrierId === null)
    .sort((a: ZombieCorpse, b: ZombieCorpse): number => b.y + b.height - (a.y + a.height));
  const placed: Placed[] = [];
  const drapes: Map<string, CorpseDrape> = new Map<string, CorpseDrape>();
  for (const corpse of lying) {
    const drape: CorpseDrape = drapeOne(corpse, placed, surfaces);
    const span: { left: number; right: number } = bodySpan(corpse);
    placed.push({ bottom: corpse.y + corpse.height, drape, right: span.right });
    drapes.set(corpse.id, drape);
  }
  return drapes;
}

function drapeOne(corpse: ZombieCorpse, below: Placed[], surfaces: DrapeSurface[]): CorpseDrape {
  const span: { left: number; right: number } = bodySpan(corpse);
  const bottom: number = corpse.y + corpse.height;
  const maxDropPx: number = corpseRenderSize(corpse) * MAX_DROP_RATIO;
  const count: number = Math.max(1, Math.ceil((span.right - span.left) / DRAPE_STRIP_PX));
  // Only what lies under this body's span can hold it up.
  const under: Placed[] = below.filter(
    (p: Placed): boolean => p.bottom > bottom && p.drape.left < span.right && p.right > span.left,
  );
  const ground: DrapeSurface[] = surfaces.filter(
    (s: DrapeSurface): boolean =>
      s.y >= bottom - SUPPORT_EPSILON_PX && s.x < span.right && s.x + s.width > span.left,
  );
  const gaps: number[] = Array.from({ length: count }, (_: unknown, i: number): number =>
    gapUnder(span.left + (i + 0.5) * DRAPE_STRIP_PX, bottom, under, ground, maxDropPx),
  );

  // The feet rest on the foothold physics gave them; from there the body bends down onto its gaps.
  const foot: CorpseSurface = corpseSurface(corpse);
  const footFirst: number = Math.floor((foot.x - span.left) / DRAPE_STRIP_PX);
  const footLast: number = Math.floor((foot.x + foot.width - span.left) / DRAPE_STRIP_PX);
  const drape: CorpseDrape = {
    left: span.left,
    drops: new Array<number>(count).fill(0),
    shifts: new Array<number>(count).fill(0),
  };
  bendAway(drape, gaps, Math.max(0, footLast + 1), 1);
  bendAway(drape, gaps, Math.min(count - 1, footFirst - 1), -1);
  return drape;
}

/** Lets the body curve down from strip `from` outward (`dir`), onto its gaps, steepening gradually. */
function bendAway(drape: CorpseDrape, gaps: number[], from: number, dir: number): void {
  const { drops, shifts }: CorpseDrape = drape;
  let slope: number = 0;
  for (let i: number = from; i >= 0 && i < drops.length; i += dir) {
    const inside: boolean = i - dir >= 0 && i - dir < drops.length;
    const prevDrop: number = inside ? drops[i - dir] : 0;
    const prevShift: number = inside ? shifts[i - dir] : 0;
    slope = Math.min(MAX_SLOPE, slope + SLOPE_GAIN_PER_PX * DRAPE_STRIP_PX);
    // Something higher under it lifts the body back up, but no steeper than it bends and never
    // above its feet (it may sink into a body there a little: piles overlap).
    const lowestRise: number = Math.max(0, prevDrop - MAX_SLOPE * DRAPE_STRIP_PX);
    drops[i] = Math.max(lowestRise, Math.min(gaps[i], prevDrop + slope * DRAPE_STRIP_PX));
    const step: number = (drops[i] - prevDrop) / DRAPE_STRIP_PX;
    // Resting on something again: the bend starts over, flat, from there.
    slope = Math.max(0, step);
    // Keep the body's length: a sloped strip covers less ground, so the rest moves in.
    shifts[i] = prevShift - dir * DRAPE_STRIP_PX * (1 - 1 / Math.hypot(1, step));
  }
}

/** Free fall below a body's underside at x, down to the first thing there (capped). */
function gapUnder(
  x: number,
  bottom: number,
  under: Placed[],
  ground: DrapeSurface[],
  maxDropPx: number,
): number {
  let top: number = bottom + maxDropPx;
  for (const s of ground) {
    if (x >= s.x && x < s.x + s.width) top = Math.min(top, s.y);
  }
  for (const p of under) {
    if (x < p.drape.left || x >= p.right) continue;
    const bodyTop: number = p.bottom + dropAt(p.drape, x) - BODY_THICKNESS_PX;
    if (bodyTop >= bottom - SUPPORT_EPSILON_PX) top = Math.min(top, bodyTop);
  }
  return Math.max(0, top - bottom);
}
