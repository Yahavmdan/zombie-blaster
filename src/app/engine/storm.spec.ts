import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import {
  BoltPath,
  BoltPoint,
  lightningBolt,
  lightningBoltAlpha,
  lightningFlash,
  lightningLandingY,
  lightningStrikeX,
  nextLightningDelayMs,
} from './storm';
import { seededRandom } from './level-generator';

describe('lightning bolt', () => {
  it('is the same bolt for the same strike on every client', () => {
    const a: BoltPath[] = lightningBolt(640, 12345, 420);
    const b: BoltPath[] = lightningBolt(640, 12345, 420);
    expect(a).toEqual(b);
    expect(lightningBolt(640, 54321, 420)).not.toEqual(a);
  });

  it('runs from the cloud base down to the landing point, with forks inside it', () => {
    for (let seed: number = 1; seed < 200; seed++) {
      const x: number = lightningStrikeX(seededRandom(seed));
      const bottom: number = lightningLandingY(250 + (seed % 200));
      const paths: BoltPath[] = lightningBolt(x, seed, bottom);
      const main: BoltPoint[] = paths[0].points;
      expect(main[0].y).toBe(GAME_CONSTANTS.LIGHTNING_TOP_Y);
      expect(main[main.length - 1]).toEqual({ x: Math.round(x), y: bottom });
      expect(paths.length).toBeGreaterThan(1);
      expect(paths.length).toBeLessThanOrEqual(1 + GAME_CONSTANTS.LIGHTNING_MAX_BRANCHES);
      for (const path of paths) {
        for (const p of path.points) {
          expect(p.y).toBeGreaterThanOrEqual(GAME_CONSTANTS.LIGHTNING_TOP_Y);
          expect(p.y).toBeLessThanOrEqual(bottom);
        }
      }
    }
  });

  it('reaches at least the minimum length, even onto the tallest stack', () => {
    const min: number = GAME_CONSTANTS.LIGHTNING_TOP_Y + GAME_CONSTANTS.LIGHTNING_MIN_LENGTH_PX;
    expect(lightningLandingY(0)).toBe(min);
    expect(lightningLandingY(min + 40)).toBe(min + 40);
  });
});

describe('lightning flash', () => {
  it('peaks, dips, strikes back, then fades out by the end', () => {
    expect(lightningFlash(0)).toBe(1);
    expect(lightningFlash(80)).toBeLessThan(lightningFlash(140));
    expect(lightningFlash(400)).toBeLessThan(lightningFlash(200));
    expect(lightningFlash(GAME_CONSTANTS.LIGHTNING_DURATION_MS)).toBe(0);
    expect(lightningFlash(-1)).toBe(0);
  });

  it('shows the bolt only during the strokes', () => {
    expect(lightningBoltAlpha(10)).toBe(1);
    expect(lightningBoltAlpha(GAME_CONSTANTS.LIGHTNING_DURATION_MS - 1)).toBe(0);
  });
});

describe('lightning timing', () => {
  it('waits between the min and max interval and lands off the screen edges', () => {
    for (let seed: number = 1; seed < 500; seed++) {
      const delay: number = nextLightningDelayMs(seededRandom(seed));
      expect(delay).toBeGreaterThanOrEqual(GAME_CONSTANTS.LIGHTNING_MIN_INTERVAL_MS);
      expect(delay).toBeLessThanOrEqual(GAME_CONSTANTS.LIGHTNING_MAX_INTERVAL_MS);
      const x: number = lightningStrikeX(seededRandom(seed * 7));
      expect(x).toBeGreaterThanOrEqual(GAME_CONSTANTS.LIGHTNING_EDGE_MARGIN_PX);
      expect(x).toBeLessThanOrEqual(
        GAME_CONSTANTS.CANVAS_WIDTH - GAME_CONSTANTS.LIGHTNING_EDGE_MARGIN_PX,
      );
    }
  });
});
