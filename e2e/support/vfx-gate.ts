import { E2eVfxLogEntry } from './probe';
import { GamePlayer } from './game-player';

/**
 * The multiplayer VFX gate (see .claude/skills/multiplayer-vfx-sync): every local effect
 * must also queue a VfxEvent for other players. Events leave the queue as `sent`
 * (multiplayer snapshot) or `discarded` (single player), and the probe logs both, so
 * "events queued by an action" = those log entries that appear while it runs.
 */
export async function vfxQueuedBy(
  player: GamePlayer,
  action: () => Promise<void>,
  settleMs: number = 400,
): Promise<E2eVfxLogEntry[]> {
  const mark: number = lastSeq(await player.probe.vfxLog());
  await action();
  await player.wait(Math.max(settleMs, 100));
  return (await player.probe.vfxLog()).filter(
    (e: E2eVfxLogEntry): boolean => e.seq > mark && e.direction !== 'replayed',
  );
}

export function lastSeq(log: E2eVfxLogEntry[]): number {
  return log.reduce((max: number, e: E2eVfxLogEntry): number => Math.max(max, e.seq), 0);
}

export function typesOf(events: E2eVfxLogEntry[]): string[] {
  return [...new Set<string>(events.map((e: E2eVfxLogEntry): string => e.type))].sort();
}
