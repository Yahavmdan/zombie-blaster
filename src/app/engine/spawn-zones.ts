import { GAME_CONSTANTS } from '@shared/index';
import { Platform } from './engine-types';

/** Where a zombie's left edge may go on one surface (its feet on `y`), `min`..`max` inclusive. */
export interface SpawnSpan {
  /** Index of the surface in the list given to `spawnSpans`. */
  surface: number;
  y: number;
  min: number;
  max: number;
}

/**
 * The stretches of each surface where a body `width` x `height` standing on it overlaps no zone
 * (and stays on screen). A surface fully covered gives none.
 */
export function spawnSpans(
  surfaces: readonly Platform[],
  zones: readonly Platform[],
  width: number,
  height: number,
): SpawnSpan[] {
  const spans: SpawnSpan[] = [];
  surfaces.forEach((s: Platform, surface: number): void => {
    const min: number = Math.max(0, s.x);
    const max: number = Math.min(GAME_CONSTANTS.CANVAS_WIDTH - width, s.x + s.width - width);
    if (max < min) return;
    const top: number = s.y - height;
    // Left edges that would put the body into a zone at this height, as open intervals.
    const blocked: [number, number][] = zones
      .filter((z: Platform): boolean => z.y < s.y && z.y + z.height > top)
      .map((z: Platform): [number, number] => [z.x - width, z.x + z.width])
      .sort((a: [number, number], b: [number, number]): number => a[0] - b[0]);
    let from: number = min;
    for (const [lo, hi] of blocked) {
      if (hi <= from) continue;
      if (lo >= from) {
        const to: number = Math.min(max, lo);
        if (to >= from) spans.push({ surface, y: s.y, min: from, max: to });
      }
      from = Math.max(from, hi);
      if (from > max) return;
    }
    spans.push({ surface, y: s.y, min: from, max });
  });
  return spans;
}

/**
 * A spawn spot from the spans: a surface picked evenly among those with room (as before zones
 * existed), then a spot along its free stretches. `rand` gives numbers in [0, 1). Null when no
 * span is left.
 */
export function zoneFreeSpot(
  spans: readonly SpawnSpan[],
  rand: () => number,
): { x: number; y: number } | null {
  if (spans.length === 0) return null;
  const surfaces: number[] = [...new Set(spans.map((s: SpawnSpan): number => s.surface))];
  const surface: number = surfaces[Math.floor(rand() * surfaces.length)];
  const own: SpawnSpan[] = spans.filter((s: SpawnSpan): boolean => s.surface === surface);
  const room: number = own.reduce((sum: number, s: SpawnSpan): number => sum + s.max - s.min, 0);
  let at: number = rand() * room;
  for (const s of own) {
    const length: number = s.max - s.min;
    if (at <= length) return { x: s.min + at, y: s.y };
    at -= length;
  }
  const last: SpawnSpan = own[own.length - 1];
  return { x: last.max, y: last.y };
}
