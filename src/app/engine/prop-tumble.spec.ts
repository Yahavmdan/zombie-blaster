import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import { LooseProp } from '@shared/game-entities';
import {
  bottomOf,
  centerX,
  centerY,
  isResting,
  settleUpright,
  Span,
  startTip,
  supportSpan,
  tickTip,
  Tip,
  tipSide,
  TumbleSurface,
  turnedHalfHeight,
  wrapAngle,
} from './prop-tumble';

const LEDGE: TumbleSurface = { x: 100, width: 200, y: 500, tolerance: 6 };

/** A prop lying upright with its bottom on y, its left side at x. */
function prop(x: number, y: number, width: number, height: number): LooseProp {
  return {
    id: 'p',
    x,
    y: y - height,
    width,
    height,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    carrierId: null,
    weightKg: 35,
    fuseTicks: 0,
    exploded: false,
    angle: 0,
    spin: 0,
  };
}

describe('prop tumbling', (): void => {
  it('a turned box reaches further down (a round barrel never does)', (): void => {
    const rail: LooseProp = prop(0, 500, 200, 16);
    expect(turnedHalfHeight(rail, false)).toBe(8);
    rail.angle = Math.PI / 2;
    expect(turnedHalfHeight(rail, false)).toBeCloseTo(100);
    expect(turnedHalfHeight(rail, true)).toBe(8);
  });

  it('only an upright, still prop lying on something rests', (): void => {
    const box: LooseProp = prop(0, 500, 28, 22);
    expect(isResting(box)).toBe(true);
    expect(isResting({ ...box, angle: 0.1 })).toBe(false);
    expect(isResting({ ...box, velocityX: 2 })).toBe(false);
    expect(isResting({ ...box, isGrounded: false })).toBe(false);
    expect(isResting({ ...box, carrierId: 'x' })).toBe(false);
  });

  it('a prop whose middle is over the ledge is balanced; one hanging past it tips that way', (): void => {
    const inside: LooseProp = prop(150, 500, 200, 16);
    expect(tipSide(inside, supportSpan(inside, [LEDGE], 500, false)!)).toBe(0);
    const overRight: LooseProp = prop(220, 500, 200, 16);
    expect(tipSide(overRight, supportSpan(overRight, [LEDGE], 500, false)!)).toBe(1);
    const overLeft: LooseProp = prop(-20, 500, 200, 16);
    expect(tipSide(overLeft, supportSpan(overLeft, [LEDGE], 500, false)!)).toBe(-1);
    expect(supportSpan(prop(400, 500, 50, 16), [LEDGE], 500, false)).toBeNull();
  });

  it('a rail hanging over an edge tips off it: it turns that way, swings down past the edge and falls off', (): void => {
    const rail: LooseProp = prop(220, 500, 200, 16);
    const span: Span = supportSpan(rail, [LEDGE], 500, false)!;
    const startY: number = centerY(rail);
    const tip: Tip = startTip(rail, span, 1, 500);
    expect(rail.isGrounded).toBe(false);
    let ticks: number = 0;
    while (!tickTip(rail, tip)) {
      ticks++;
      expect(ticks, 'falls off within 3 s').toBeLessThan(150);
    }
    expect(rail.angle).toBeGreaterThan(0);
    expect(centerX(rail)).toBeGreaterThan(300);
    expect(centerY(rail)).toBeGreaterThan(startY);
    expect(rail.velocityX).toBeGreaterThan(0);
  });

  it('the first tick of a tip keeps the prop where it was (it turns around the edge it rests on)', (): void => {
    const box: LooseProp = prop(290, 500, 28, 22);
    const before: { x: number; y: number } = { x: centerX(box), y: centerY(box) };
    const tip: Tip = startTip(box, supportSpan(box, [LEDGE], 500, false)!, 1, 500);
    tickTip(box, tip);
    expect(Math.abs(centerX(box) - before.x)).toBeLessThan(2);
    expect(Math.abs(centerY(box) - before.y)).toBeLessThan(2);
  });

  it('a prop on its side turns back upright with its lowest point kept on the surface', (): void => {
    const box: LooseProp = prop(150, 500, 28, 22);
    box.angle = 1.1;
    box.y = 500 - turnedHalfHeight(box, false) - box.height / 2;
    for (let i: number = 0; i < 40 && box.angle !== 0; i++) {
      settleUpright(box, false);
      expect(bottomOf(box, false)).toBeCloseTo(500);
    }
    expect(box.angle).toBe(0);
    expect(box.y + box.height).toBeCloseTo(500);
  });

  it('wraps angles to one turn, so a prop that spun many times settles the short way', (): void => {
    expect(wrapAngle(Math.PI * 4 + 0.5)).toBeCloseTo(0.5);
    expect(wrapAngle(-Math.PI * 2 - 0.5)).toBeCloseTo(-0.5);
    expect(Math.abs(wrapAngle(Math.PI * 3))).toBeCloseTo(Math.PI);
  });

  it('tunables live in game constants', (): void => {
    expect(GAME_CONSTANTS.PROP_TIP_RELEASE_ANGLE).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.PROP_ROLL_FRICTION).toBeGreaterThan(GAME_CONSTANTS.PROP_SLIDE_FRICTION);
  });
});
