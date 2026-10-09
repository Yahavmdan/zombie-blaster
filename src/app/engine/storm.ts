import { GAME_CONSTANTS } from '@shared/index';
import { Random, seededRandom } from './level-generator';

/** A strike on screen: the host picks `x` and `seed`, every client draws the same bolt from them. */
export interface LightningStrike {
  x: number;
  seed: number;
  ageMs: number;
}

export interface BoltPoint {
  x: number;
  y: number;
}

/** One stroke of a bolt: the main channel is `width` 3, forks are thinner. */
export interface BoltPath {
  points: BoltPoint[];
  width: number;
}

/** First stroke, dark gap, return stroke, then the sky fades back. */
const FIRST_STROKE_MS: number = 50;
const GAP_END_MS: number = 110;
const RETURN_STROKE_END_MS: number = 170;
const GAP_FLASH: number = 0.35;
const RETURN_FLASH: number = 0.9;
/** The bolt itself is gone once the afterglow is this far along. */
const BOLT_VISIBLE_MS: number = 300;
const MAIN_WIDTH: number = 3;
const BRANCH_WIDTH: number = 1;

/** How bright the sky is `ageMs` into a strike (0 = no light, 1 = peak). */
export function lightningFlash(ageMs: number): number {
  const duration: number = GAME_CONSTANTS.LIGHTNING_DURATION_MS;
  if (ageMs < 0 || ageMs >= duration) return 0;
  if (ageMs < FIRST_STROKE_MS) return 1;
  if (ageMs < GAP_END_MS) return GAP_FLASH;
  if (ageMs < RETURN_STROKE_END_MS) return RETURN_FLASH;
  const fade: number = 1 - (ageMs - RETURN_STROKE_END_MS) / (duration - RETURN_STROKE_END_MS);
  return RETURN_FLASH * fade * fade;
}

/** Opacity of the bolt itself: it flickers with the strokes and vanishes before the afterglow. */
export function lightningBoltAlpha(ageMs: number): number {
  if (ageMs >= BOLT_VISIBLE_MS) return 0;
  return Math.min(1, lightningFlash(ageMs) * 1.4);
}

/** Where the host lets the next bolt land (kept off the screen edges). */
export function lightningStrikeX(rand: Random): number {
  const margin: number = GAME_CONSTANTS.LIGHTNING_EDGE_MARGIN_PX;
  return Math.round(margin + rand() * (GAME_CONSTANTS.CANVAS_WIDTH - margin * 2));
}

/** Ms until the host's next strike. */
export function nextLightningDelayMs(rand: Random): number {
  const min: number = GAME_CONSTANTS.LIGHTNING_MIN_INTERVAL_MS;
  const max: number = GAME_CONSTANTS.LIGHTNING_MAX_INTERVAL_MS;
  return Math.round(min + rand() * (max - min));
}

/** Where a bolt at `x` ends: on the skyline's top there (`skylineTop`), never shorter than the minimum. */
export function lightningLandingY(skylineTop: number): number {
  return Math.max(
    skylineTop,
    GAME_CONSTANTS.LIGHTNING_TOP_Y + GAME_CONSTANTS.LIGHTNING_MIN_LENGTH_PX,
  );
}

/**
 * The bolt for a strike: a jagged main channel from the cloud base down to (`x`, `bottom`), plus a
 * few thin forks. Same `x`, `seed` and `bottom` give the same bolt on every client.
 */
export function lightningBolt(x: number, seed: number, bottom: number): BoltPath[] {
  const rand: Random = seededRandom(seed);
  const top: number = GAME_CONSTANTS.LIGHTNING_TOP_Y;
  const step: number = GAME_CONSTANTS.LIGHTNING_SEGMENT_PX;
  const jitter: number = GAME_CONSTANTS.LIGHTNING_JITTER_PX;

  const startX: number = x + (rand() - 0.5) * jitter * 4;
  const main: BoltPoint[] = [{ x: Math.round(startX), y: top }];
  const steps: number = Math.ceil((bottom - top) / step);
  for (let i: number = 1; i <= steps; i++) {
    const t: number = i / steps;
    const y: number = Math.min(bottom, top + i * step);
    // Drift toward the landing point, kinked sideways at every step; the last point lands on x.
    const towardX: number = startX + (x - startX) * t;
    const kink: number = i === steps ? 0 : (rand() - 0.5) * 2 * jitter;
    main.push({ x: Math.round(towardX + kink), y });
  }
  const paths: BoltPath[] = [{ points: main, width: MAIN_WIDTH }];

  const branches: number = 1 + Math.floor(rand() * GAME_CONSTANTS.LIGHTNING_MAX_BRANCHES);
  for (let b: number = 0; b < branches; b++) {
    // Forks leave the upper two thirds of the channel and reach down and away from it.
    const fromIndex: number =
      1 + Math.floor(rand() * Math.max(1, Math.floor(main.length * 0.66) - 1));
    const dir: number = rand() < 0.5 ? -1 : 1;
    const length: number = 3 + Math.floor(rand() * 4);
    const fork: BoltPoint[] = [{ ...main[fromIndex] }];
    for (let i: number = 1; i <= length; i++) {
      const prev: BoltPoint = fork[i - 1];
      const y: number = Math.min(bottom, prev.y + step * (0.6 + rand() * 0.5));
      fork.push({ x: Math.round(prev.x + dir * (6 + rand() * jitter)), y: Math.round(y) });
    }
    paths.push({ points: fork, width: BRANCH_WIDTH });
  }
  return paths;
}
