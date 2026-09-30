import { E2eCorpseView, E2eSnapshot, E2eZombieView } from './probe';
import { GamePlayer } from './game-player';

/**
 * Compares what two players see of the same world. Used by visual-consistency tests and by
 * the demo's periodic side-by-side checks. Each difference is one readable line.
 */

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map<string, T>(items.map((item: T): [string, T] => [item.id, item]));
}

/**
 * Corpses both players have seen lying on the ground since `settled` must look the same
 * (same animation frame, same facing) and be fully fallen (last death frame).
 */
export function corpseDifferences(
  a: E2eSnapshot,
  b: E2eSnapshot,
  settled: Set<string>,
  labels: [string, string],
): string[] {
  const out: string[] = [];
  const bById: Map<string, E2eCorpseView> = byId<E2eCorpseView>(b.corpseViews);
  for (const ca of a.corpseViews) {
    if (!settled.has(ca.id)) continue;
    const cb: E2eCorpseView | undefined = bById.get(ca.id);
    if (!cb) continue;
    const tag: string = `corpse ${ca.id.slice(0, 6)}`;
    for (const [label, c] of [
      [labels[0], ca],
      [labels[1], cb],
    ] as Array<[string, E2eCorpseView]>) {
      if (c.frame !== c.lastFrame)
        out.push(`${tag}: ${label} shows death frame ${c.frame}/${c.lastFrame} (not lying down)`);
    }
    if (ca.frame !== cb.frame)
      out.push(`${tag}: frame ${labels[0]}=${ca.frame} vs ${labels[1]}=${cb.frame}`);
    if (ca.facing !== cb.facing)
      out.push(`${tag}: facing ${labels[0]}=${ca.facing} vs ${labels[1]}=${cb.facing}`);
  }
  return out;
}

/** Ids of corpses that are grounded in both snapshots (candidates to be settled a moment later). */
export function groundedInBoth(a: E2eSnapshot, b: E2eSnapshot): Set<string> {
  const bById: Map<string, E2eCorpseView> = byId<E2eCorpseView>(b.corpseViews);
  return new Set<string>(
    a.corpseViews
      .filter((c: E2eCorpseView): boolean => c.isGrounded && bById.get(c.id)?.isGrounded === true)
      .map((c: E2eCorpseView): string => c.id),
  );
}

/** Broad world differences worth flagging during long runs. */
export function worldDifferences(
  a: E2eSnapshot,
  b: E2eSnapshot,
  settled: Set<string>,
  labels: [string, string],
): string[] {
  const out: string[] = [];
  if (a.floor !== b.floor) out.push(`floor ${labels[0]}=${a.floor} vs ${labels[1]}=${b.floor}`);
  const aZ: Map<string, E2eZombieView> = byId<E2eZombieView>(
    a.zombies.filter((z: E2eZombieView): boolean => !z.isDead),
  );
  const bZ: Map<string, E2eZombieView> = byId<E2eZombieView>(
    b.zombies.filter((z: E2eZombieView): boolean => !z.isDead),
  );
  const onlyA: number = [...aZ.keys()].filter((id: string): boolean => !bZ.has(id)).length;
  const onlyB: number = [...bZ.keys()].filter((id: string): boolean => !aZ.has(id)).length;
  if (onlyA + onlyB > 3)
    out.push(`zombies only on ${labels[0]}: ${onlyA}, only on ${labels[1]}: ${onlyB}`);
  const corpseGap: number = Math.abs(a.corpseViews.length - b.corpseViews.length);
  if (corpseGap > 3)
    out.push(
      `corpse count ${labels[0]}=${a.corpseViews.length} vs ${labels[1]}=${b.corpseViews.length}`,
    );
  out.push(...corpseDifferences(a, b, settled, labels));
  return out;
}

/** Saves both players' canvases (same moment, best effort) for a human or Claude to look at. */
export async function captureSideBySide(
  players: GamePlayer[],
  dir: string,
  label: string,
): Promise<string[]> {
  return Promise.all(
    players.map(async (p: GamePlayer): Promise<string> => {
      const path: string = `${dir}/${label}-${p.name}.png`;
      await p.page.locator('canvas').first().screenshot({ path });
      return path;
    }),
  );
}
