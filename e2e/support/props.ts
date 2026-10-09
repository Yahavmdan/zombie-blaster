import { GamePlayer } from './game-player';
import { E2eSnapshot } from './probe';
import { WORLD } from './invariants';
import { layoutWhere } from './navigation';

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

/** A lone pickable prop lying on open ground, with room to walk up from the left and throw right. */
export function pickableOnGround(s: E2eSnapshot): LevelProp | undefined {
  return s.level.props.find(
    (q: LevelProp): boolean =>
      q.pickable &&
      q.isGrounded &&
      q.carrierId === null &&
      q.y + q.height === WORLD.groundY &&
      q.x > 150 &&
      q.x + q.width < WORLD.width - 250 &&
      clearAround(s, q, 110, 160),
  );
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

/** No pickable prop lies between these x (so E there only ever picks up corpses). */
export function noPickableBetween(s: E2eSnapshot, from: number, to: number): boolean {
  return !s.level.props.some((q: LevelProp): boolean => q.pickable && spanOverlaps(q, from, to));
}

/**
 * Setup: pins a layout (via the host) with no barrel or box between these x, so the carry key
 * there finds only corpses, and waits until every observer plays on it.
 */
export async function layoutWithoutPickables(
  host: GamePlayer,
  observers: GamePlayer[],
  from: number,
  to: number,
): Promise<void> {
  const s0: E2eSnapshot = await layoutWhere(
    host,
    `no pickable prop between x ${from} and ${to}`,
    (s: E2eSnapshot): boolean => noPickableBetween(s, from, to),
  );
  for (const o of observers) {
    await o.probe.waitFor(
      "the host's layout",
      (s: E2eSnapshot): boolean => s.level.seed === s0.level.seed,
      { timeoutMs: 5_000 },
    );
  }
}
