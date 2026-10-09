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
      expect(drop - before).toBeLessThanOrEqual(DRAPE_STRIP_PX * 0.8 + 1e-9);
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
});
