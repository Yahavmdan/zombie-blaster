import { GamePlayer } from './game-player';
import { E2eCorpseView, E2eSnapshot } from './probe';
import { WORLD } from './invariants';
import { GROUND, LevelPlatform, levelPlatforms } from './navigation';

/** A map prop as the probe sees it (pickable ones where they are now). */
export type LevelProp = E2eSnapshot['level']['props'][number];

/** Props this low (or lower) are stepped over (PROP_STEP_UP_PX). */
export const STEP_UP_PX: number = 26;

export function findProp(s: E2eSnapshot, id: string): LevelProp | undefined {
  return s.level.props.find((q: LevelProp): boolean => q.id === id);
}

export function propCenterX(q: LevelProp): number {
  return q.x + q.width / 2;
}

function spanOverlaps(a: LevelProp, left: number, right: number): boolean {
  return a.x < right && a.x + a.width > left;
}

/** Something stands on top of this prop. */
export function hasPropOnTop(s: E2eSnapshot, q: LevelProp): boolean {
  return s.level.props.some(
    (o: LevelProp): boolean =>
      o !== q && o.y + o.height === q.y && spanOverlaps(o, q.x, q.x + q.width),
  );
}

/** No other prop within `left` px before it and `right` px after it. */
export function clearAround(s: E2eSnapshot, q: LevelProp, left: number, right: number): boolean {
  return !s.level.props.some(
    (o: LevelProp): boolean => o !== q && spanOverlaps(o, q.x - left, q.x + q.width + right),
  );
}

/** Barrels blow up a few seconds after a hit (boxes don't). */
export function isBarrel(q: LevelProp): boolean {
  return q.kind.startsWith('barrel');
}

/** A rail with middle pieces: wider than carry reach from its center, so it is grabbed from an end. */
export function isLongRail(q: LevelProp): boolean {
  return q.kind === 'rail' && q.width > 100;
}

/** A kind of pickable prop the carry specs run with. */
export interface CarryCase {
  name: string;
  accept: (q: LevelProp) => boolean;
}

/** Barrels and boxes, and a long rail (grabbed from beside its end, far from its center). */
export const CARRY_CASES: CarryCase[] = [
  { name: 'a barrel or box', accept: (q: LevelProp): boolean => q.kind !== 'rail' },
  { name: 'a long rail', accept: isLongRail },
];

/**
 * A lone pickable prop (of the accepted kinds) lying on open ground, with room to walk up from
 * the left and throw right.
 */
export function pickableOnGround(
  s: E2eSnapshot,
  accept: (q: LevelProp) => boolean = (): boolean => true,
): LevelProp | undefined {
  return s.level.props.find(
    (q: LevelProp): boolean =>
      accept(q) &&
      q.pickable &&
      q.resting &&
      q.carrierId === null &&
      q.y + q.height === WORLD.groundY &&
      q.x > 150 &&
      q.x + q.width < WORLD.width - 250 &&
      clearAround(s, q, 110, 160),
  );
}

/** A rail to drop hanging off a ledge's right end (most of it past the edge), and where. */
export interface Overhang {
  rail: LevelProp;
  ledge: { x: number; y: number; width: number };
  dropX: number;
  dropY: number;
}

/** Share of the rail dropped over the ledge: its middle hangs past the edge, so it tips off. */
const OVERHANG_ON_LEDGE: number = 0.3;

/**
 * A resting rail and a ledge whose right end has nothing on it and room on screen past it, for a
 * rail dropped hanging off the edge; undefined when the layout has none.
 */
export function overhangSetup(s: E2eSnapshot): Overhang | undefined {
  const rail: LevelProp | undefined = s.level.props.find(
    (q: LevelProp): boolean => q.kind === 'rail' && q.pickable && q.resting,
  );
  if (!rail) return undefined;
  const onLedge: number = Math.round(rail.width * OVERHANG_ON_LEDGE);
  const ledge: { x: number; y: number; width: number } | undefined = s.level.platforms.find(
    (p: { x: number; y: number; width: number }): boolean => {
      const edge: number = p.x + p.width;
      return (
        p.y < WORLD.groundY - 60 &&
        p.y !== s.level.safeSpot?.y &&
        p.width >= onLedge + 32 &&
        edge + rail.width - onLedge < WORLD.width - 10 &&
        !s.level.props.some(
          (q: LevelProp): boolean =>
            q !== rail && q.y + q.height === p.y && q.x + q.width > edge - onLedge - 10 && q.x < edge,
        )
      );
    },
  );
  if (!ledge) return undefined;
  return {
    rail,
    ledge,
    dropX: ledge.x + ledge.width - onLedge,
    dropY: ledge.y - rail.height - 10,
  };
}

/** Corpses dropped this far right of a barrel's center land beside it, in its blast. */
export const CORPSE_DROP_DX: number = 60;

/**
 * A lone barrel on open ground with no ledge over the spot CORPSE_DROP_DX right of it, so corpses
 * dropped there land on the ground in its blast (not on a ledge above it).
 */
export function barrelWithOpenSkyBeside(s: E2eSnapshot): LevelProp | undefined {
  const barrel: LevelProp | undefined = pickableOnGround(s, isBarrel);
  if (!barrel) return undefined;
  const dropX: number = propCenterX(barrel) + CORPSE_DROP_DX;
  const covered: boolean = levelPlatforms(s).some(
    (p: LevelPlatform): boolean => p !== GROUND && p.x < dropX + 40 && p.x + p.width > dropX - 40,
  );
  return covered ? undefined : barrel;
}

/** Setup: the player stands on the ground right beside the prop's left side (within carry reach). */
export async function standLeftOf(p: GamePlayer, q: LevelProp): Promise<void> {
  await p.face('right');
  await p.probe.teleport(q.x - WORLD.playerWidth - 1, WORLD.groundY - WORLD.playerHeight);
  await p.probe.waitFor(
    'standing on the ground beside the prop',
    (s: E2eSnapshot): boolean =>
      s.player!.isGrounded && s.player!.y + WORLD.playerHeight === WORLD.groundY,
  );
  await p.wait(200);
}

/**
 * Setup: the host drops `count` corpses from above x; returns them (as the host sees them) once
 * the host and every observer see them all lying still.
 */
export async function dropLyingCorpses(
  host: GamePlayer,
  observers: GamePlayer[],
  x: number,
  count: number,
): Promise<E2eCorpseView[]> {
  const known: Set<string> = new Set<string>(
    (await host.probe.state()).corpseViews.map((c: E2eCorpseView): string => c.id),
  );
  await host.probe.dropCorpses(x, count);
  const fresh: (s: E2eSnapshot) => E2eCorpseView[] = (s: E2eSnapshot): E2eCorpseView[] =>
    s.corpseViews.filter((c: E2eCorpseView): boolean => !known.has(c.id));
  const lying: (s: E2eSnapshot) => boolean = (s: E2eSnapshot): boolean =>
    fresh(s).length === count && fresh(s).every((c: E2eCorpseView): boolean => c.isGrounded);
  const dropped: E2eSnapshot = await host.probe.waitFor(`${count} dropped corpses lie still`, lying, {
    timeoutMs: 10_000,
  });
  for (const p of observers) {
    await p.probe.waitFor(`${count} dropped corpses lie still (observer)`, lying, { timeoutMs: 10_000 });
  }
  return fresh(dropped);
}

/** No pickable prop lies between these x, at any height (so E there only ever picks up corpses). */
export function noPickableBetween(s: E2eSnapshot, from: number, to: number): boolean {
  return !s.level.props.some((q: LevelProp): boolean => q.pickable && spanOverlaps(q, from, to));
}

/**
 * Setup: the host takes every barrel, box and rail between these x off the floor (every floor has
 * 5-10 barrels, so no layout leaves a wide span empty), so the carry key there finds only
 * corpses, and waits until every observer sees them gone.
 */
export async function clearPickablesBetween(
  host: GamePlayer,
  observers: GamePlayer[],
  from: number,
  to: number,
): Promise<void> {
  await host.probe.clearPickables(from, to);
  for (const p of [host, ...observers]) {
    await p.probe.waitFor(
      `no barrel or box between x ${from} and ${to}`,
      (s: E2eSnapshot): boolean => noPickableBetween(s, from, to),
      { timeoutMs: 5_000 },
    );
  }
}
