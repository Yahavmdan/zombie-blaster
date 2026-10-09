import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import { ZombieCorpse, ZombieType } from '@shared/game-entities';
import {
  BODY_HALF_SPAN,
  BODY_SHIFT,
  CorpseDrape,
  DRAPE_STRIP_PX,
  DrapeSurface,
  corpseRenderSize,
  drapeCorpses,
  dropAt,
  maxDrop,
  shiftAt,
} from './corpse-drape';

const GROUND_Y: number = GAME_CONSTANTS.GROUND_Y;
const GROUND: DrapeSurface = { x: 0, y: GROUND_Y, width: GAME_CONSTANTS.CANVAS_WIDTH };
const STEP: number = GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_HEIGHT;
/** Steepest a body bends (MAX_SLOPE in corpse-drape.ts). */
const MAX_BEND_SLOPE: number = 0.65;

/** A lying walker whose feet (box center) are at cx and underside at bottom; facing -1 = body to the left (mirrored sprite). */
function corpse(id: string, cx: number, bottom: number, facing: number = -1): ZombieCorpse {
  const width: number = 30;
  const height: number = 41;
  return {
    id,
    type: ZombieType.Walker,
    x: cx - width / 2,
    y: bottom - height,
    width,
    height,
    spriteKey: 'walker',
    facing,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    frozen: true,
    landProcessed: true,
    fadeTimer: 1,
    maxFadeTimer: 1,
    showBlood: false,
    carrierId: null,
  };
}

/** The far end of a body lying to the left of its feet. */
function headX(c: ZombieCorpse): number {
  const size: number = corpseRenderSize(c);
  return c.x + c.width / 2 - size * (BODY_SHIFT + BODY_HALF_SPAN) + DRAPE_STRIP_PX;
}

function drapeOf(corpses: ZombieCorpse[], surfaces: DrapeSurface[], id: string): CorpseDrape {
  return drapeCorpses(corpses, surfaces).get(id)!;
}

describe('draping corpses', (): void => {
  it('a body lying flat on the ground stays straight', (): void => {
    const c: ZombieCorpse = corpse('a', 400, GROUND_Y);
    const drape: CorpseDrape = drapeOf([c], [GROUND], 'a');
    expect(maxDrop(drape)).toBe(0);
    expect(drape.shifts.every((s: number): boolean => s === 0)).toBe(true);
  });

  it('a body hanging off a ledge curves down past the edge, never steeper than it can bend', (): void => {
    const ledge: DrapeSurface = { x: 380, y: 400, width: 200 };
    const c: ZombieCorpse = corpse('a', 400, 400);
    const drape: CorpseDrape = drapeOf([c], [ledge, GROUND], 'a');
    expect(dropAt(drape, 390), 'still on the ledge').toBe(0);
    expect(dropAt(drape, headX(c)), 'the far end hangs').toBeGreaterThan(20);
    // From the feet outward (leftward) the body only goes down, a little steeper each strip at most.
    for (let x: number = 378; x > headX(c); x -= DRAPE_STRIP_PX) {
      const drop: number = dropAt(drape, x);
      const before: number = dropAt(drape, x + DRAPE_STRIP_PX);
      expect(drop).toBeGreaterThanOrEqual(before);
      expect(drop - before).toBeLessThanOrEqual(DRAPE_STRIP_PX * MAX_BEND_SLOPE + 1e-9);
    }
    expect(
      shiftAt(drape, headX(c)),
      'bent, it reaches less far: pulled toward the feet',
    ).toBeGreaterThan(1);
  });

  it('a body on top of a pile sags onto the ground beside it, and stops there', (): void => {
    const bottomBody: ZombieCorpse = corpse('low', 400, GROUND_Y);
    // Resting on the lower body's foothold, but facing the other way: its body reaches over bare ground.
    const top: ZombieCorpse = corpse('top', 400, GROUND_Y - STEP, 1);
    const drape: CorpseDrape = drapeOf([top, bottomBody], [GROUND], 'top');
    const size: number = corpseRenderSize(top);
    const farEnd: number = 400 + size * (BODY_SHIFT + BODY_HALF_SPAN) - DRAPE_STRIP_PX;
    expect(dropAt(drape, farEnd), 'down on the ground, no deeper').toBeCloseTo(STEP, 5);
  });

  it('an upper body rests on the lower body as that one is draped, not on air', (): void => {
    const ledge: DrapeSurface = { x: 380, y: 400, width: 200 };
    const low: ZombieCorpse = corpse('low', 400, 400);
    const high: ZombieCorpse = corpse('high', 400, 400 - STEP);
    const drapes: Map<string, CorpseDrape> = drapeCorpses([high, low], [ledge, GROUND]);
    const lowDrape: CorpseDrape = drapes.get('low')!;
    const highDrape: CorpseDrape = drapes.get('high')!;
    for (let x: number = 378; x > headX(low); x -= DRAPE_STRIP_PX) {
      const lowTop: number = 400 + dropAt(lowDrape, x) - STEP;
      const highUnderside: number = 400 - STEP + dropAt(highDrape, x);
      expect(highUnderside, `never sinks into the body below at x=${x}`).toBeLessThanOrEqual(
        lowTop + 1e-9,
      );
    }
    expect(dropAt(highDrape, headX(high)), 'it follows the lower body down').toBeGreaterThan(10);
  });

  it('carried and falling corpses are not draped', (): void => {
    const carried: ZombieCorpse = { ...corpse('c', 400, 300), carrierId: 'p', isGrounded: false };
    const falling: ZombieCorpse = { ...corpse('f', 500, 300), isGrounded: false };
    const drapes: Map<string, CorpseDrape> = drapeCorpses([carried, falling], [GROUND]);
    expect(drapes.size).toBe(0);
  });

  it('random piles: no strip rises above the feet or jumps steeper than a body bends', (): void => {
    let seed: number = 7;
    const random: () => number = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const ledges: DrapeSurface[] = [
      GROUND,
      { x: 300, y: 530, width: 160 },
      { x: 600, y: 430, width: 96 },
    ];
    for (let round: number = 0; round < 40; round++) {
      // Bodies stacked the way physics piles them: each on a foothold of one below, or on a ledge.
      const pile: ZombieCorpse[] = [];
      for (let n: number = 0; n < 25; n++) {
        const cx: number = 250 + random() * 500;
        const onLedge: DrapeSurface | undefined = ledges
          .filter((l: DrapeSurface): boolean => cx >= l.x && cx < l.x + l.width)
          .sort((a: DrapeSurface, b: DrapeSurface): number => a.y - b.y)[0];
        const below: ZombieCorpse[] = pile.filter(
          (c: ZombieCorpse): boolean => Math.abs(c.x + c.width / 2 - cx) < 8,
        );
        const top: number = Math.min(
          onLedge ? onLedge.y : GROUND_Y,
          ...below.map((c: ZombieCorpse): number => c.y + c.height - STEP),
        );
        pile.push(corpse(`c${n}`, cx, top, random() < 0.5 ? -1 : 1));
      }
      for (const [id, drape] of drapeCorpses(pile, ledges)) {
        drape.drops.forEach((drop: number, i: number): void => {
          expect(drop, `${id} strip ${i} never above its feet`).toBeGreaterThanOrEqual(0);
          if (i > 0) {
            expect(
              Math.abs(drop - drape.drops[i - 1]),
              `${id} strip ${i}: no jump between neighbours`,
            ).toBeLessThanOrEqual(DRAPE_STRIP_PX * MAX_BEND_SLOPE + 1e-9);
          }
        });
      }
    }
  });
});
