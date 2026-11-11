import { beforeAll, describe, it, expect, vi } from 'vitest';
import { DESIGNED_LEVELS } from './designed-levels';
import { GameEngine } from './game-engine';
import { LevelLayout } from './level-generator';
import { FloorVerdict, describeAction, describeMove, solveFloor } from '../testing/floor-solver';

/**
 * Every designed floor can be finished by a player who just started (no skills, no double jump),
 * and nothing they do can lock them out of the exit. Required for every new floor JSON
 * (stage-puzzle skill, "Designed layouts"). The solver: src/app/testing/floor-solver.ts.
 */

function createMockCanvas(): HTMLCanvasElement {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  const noop: () => void = vi.fn();
  const ctx: Record<string, unknown> = {
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    strokeText: noop,
    measureText: vi.fn().mockReturnValue({ width: 10 }),
    drawImage: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    rect: noop,
    clip: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    setTransform: noop,
    createLinearGradient: vi.fn().mockReturnValue({ addColorStop: noop }),
    createRadialGradient: vi.fn().mockReturnValue({ addColorStop: noop }),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    canvas,
  };
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return canvas;
}

const FLOORS: number[] = Object.keys(DESIGNED_LEVELS).map(Number);
/** A floor's whole search runs the real engine thousands of ticks per state. */
const SOLVE_TIMEOUT_MS: number = 300_000;
/**
 * Floors whose puzzle a new player can walk around today (a bug to fix in the floor, not here):
 * floor 4: ride spring g15 up onto the top of slope g1, then jump over the far door g8.
 */
const KNOWN_SKIPS: ReadonlySet<number> = new Set<number>([4]);

function solution(v: FloorVerdict): string {
  const steps: string[] = v.solution.map((a: FloorVerdict['solution'][number]): string =>
    describeAction(a),
  );
  const route: string[] = v.exitRoute.map((m: FloorVerdict['exitRoute'][number]): string =>
    describeMove(m),
  );
  return `moves: ${steps.join(' > ') || 'none'}; then: ${route.join(' > ')}`;
}

for (const floor of FLOORS) {
  describe(`designed floor ${floor}, played by a new player (no skills, no double jump)`, (): void => {
    let verdict: FloorVerdict;

    beforeAll((): void => {
      verdict = solveFloor(new GameEngine(createMockCanvas()), floor);
    }, SOLVE_TIMEOUT_MS);

    it('can be finished', (): void => {
      expect(verdict.solvable, `floor ${floor}: no way from the start to the exit`).toBe(true);
    });

    it('has no soft lock: no move leaves the exit out of reach', (): void => {
      expect(
        verdict.softLocks,
        `floor ${floor}: after these moves the exit can't be reached`,
      ).toEqual([]);
    });

    (KNOWN_SKIPS.has(floor) ? it.fails : it)(
      'needs its puzzle: the exit is out of reach at the start',
      (): void => {
        expect(verdict.skippable, `floor ${floor} skipped: ${solution(verdict)}`).toBe(false);
      },
    );
  });
}

/**
 * A made-up floor with a soft lock: a boulder on a ledge holds the button that keeps the exit door
 * open, and no zombie rises anywhere. Swinging the boulder off the ledge shuts the door for good
 * (nothing else weighs enough, and a swing can't lift the boulder back up).
 */
const SOFT_LOCK_FLOOR: LevelLayout = {
  seed: 1,
  floor: 1,
  platforms: [{ x: 200, y: 520, width: 200, height: 32 }],
  ropes: [],
  exitX: 20,
  exitY: 100,
  exitHidden: true,
  props: [],
  walls: [],
  gadgets: [
    { id: 'g1', kind: 'button', kg: 500, targets: ['g2'], x: 300, y: 520, width: 48, height: 6 },
    { id: 'g2', kind: 'door', latch: false, exit: true, x: 1100, y: 492, width: 64, height: 128 },
    { id: 'g3', kind: 'boulder', kg: 600, x: 300, y: 472, width: 48, height: 48 },
  ],
  noSpawn: [{ x: 0, y: 0, width: 1280, height: 620 }],
};

describe('the floor solver', (): void => {
  it(
    'finds a soft lock: knocking the boulder off the button ledge shuts the exit door for good',
    (): void => {
      const engine: GameEngine = new GameEngine(createMockCanvas());
      engine.useCustomLevel(SOFT_LOCK_FLOOR);
      const verdict: FloorVerdict = solveFloor(engine, SOFT_LOCK_FLOOR.floor);
      expect(verdict.solvable).toBe(true);
      expect(verdict.softLocks.length).toBeGreaterThan(0);
      expect(verdict.softLocks.join('\n')).toContain('g3');
    },
    SOLVE_TIMEOUT_MS,
  );
});
