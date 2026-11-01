import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import { Platform } from './engine-types';
import { SpawnSpan, spawnSpans, zoneFreeSpot } from './spawn-zones';
import { DESIGNED_LEVELS } from './designed-levels';
import { LevelLayout } from './level-generator';

const GROUND_Y: number = GAME_CONSTANTS.GROUND_Y;
const W: number = GAME_CONSTANTS.CANVAS_WIDTH;
const GROUND: Platform = { x: -100, y: GROUND_Y, width: W + 200, height: 100 };
const LEDGE: Platform = { x: 200, y: 400, width: 160, height: 32 };

describe('no-spawn zones', () => {
  it('without zones every surface is free edge to edge (on screen)', () => {
    expect(spawnSpans([GROUND, LEDGE], [], 40, 50)).toEqual([
      { surface: 0, y: GROUND_Y, min: 0, max: W - 40 },
      { surface: 1, y: 400, min: 200, max: 320 },
    ]);
  });

  it('cuts out every left edge that would put the body in a zone at its height', () => {
    const zone: Platform = { x: 300, y: GROUND_Y - 100, width: 100, height: 100 };
    expect(spawnSpans([GROUND, LEDGE], [zone], 40, 50)).toEqual([
      { surface: 0, y: GROUND_Y, min: 0, max: 260 },
      { surface: 0, y: GROUND_Y, min: 400, max: W - 40 },
      // The zone is far below the ledge: the ledge is untouched.
      { surface: 1, y: 400, min: 200, max: 320 },
    ]);
  });

  it('a zone above head height or below the feet leaves the surface free', () => {
    const above: Platform = { x: 0, y: GROUND_Y - 200, width: W, height: 100 };
    const below: Platform = { x: 0, y: GROUND_Y, width: W, height: 50 };
    expect(spawnSpans([GROUND], [above, below], 40, 50)).toHaveLength(1);
  });

  it('a covered surface gives nothing; overlapping zones merge', () => {
    const covering: Platform = { x: 150, y: 300, width: 300, height: 150 };
    expect(spawnSpans([LEDGE], [covering], 40, 50)).toEqual([]);
    const a: Platform = { x: 100, y: GROUND_Y - 60, width: 200, height: 60 };
    const b: Platform = { x: 250, y: GROUND_Y - 60, width: 200, height: 60 };
    expect(spawnSpans([GROUND], [b, a], 40, 50)).toEqual([
      { surface: 0, y: GROUND_Y, min: 0, max: 60 },
      { surface: 0, y: GROUND_Y, min: 450, max: W - 40 },
    ]);
  });

  it('picks a surface evenly, then a spot on its free stretches, never in a zone', () => {
    const zone: Platform = { x: 300, y: GROUND_Y - 100, width: 600, height: 100 };
    const spans: SpawnSpan[] = spawnSpans([GROUND, LEDGE], [zone], 40, 50);
    let seed: number = 1;
    const rand: () => number = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    let onLedge: number = 0;
    for (let i: number = 0; i < 2000; i++) {
      const spot: { x: number; y: number } = zoneFreeSpot(spans, rand)!;
      if (spot.y === 400) {
        onLedge++;
        expect(spot.x).toBeGreaterThanOrEqual(200);
        expect(spot.x).toBeLessThanOrEqual(320);
      } else {
        expect(spot.x + 40 <= 300 || spot.x >= 900).toBe(true);
      }
    }
    expect(onLedge).toBeGreaterThan(800);
    expect(onLedge).toBeLessThan(1200);
    expect(zoneFreeSpot([], rand)).toBeNull();
  });
});

describe('floor 1 no-spawn zones', () => {
  it('no zombie rises on the button ledge; the rest of the floor still spawns', () => {
    const floor1: LevelLayout = DESIGNED_LEVELS[1];
    const surfaces: Platform[] = [
      GROUND,
      ...floor1.platforms.filter((p: Platform): boolean => !p.safe),
    ];
    const spans: SpawnSpan[] = spawnSpans(surfaces, floor1.noSpawn ?? [], 40, 50);
    expect(spans.some((s: SpawnSpan): boolean => s.y === 508)).toBe(false);
    expect(spans.some((s: SpawnSpan): boolean => s.y === GROUND_Y)).toBe(true);
  });
});
