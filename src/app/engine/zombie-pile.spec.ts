import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import { PileSpot, ZombiePile, isPileCorpse, newZombiePile, pileSpots } from './zombie-pile';

const BODY_HEIGHT: number = 40;
const GROUND_Y: number = GAME_CONSTANTS.GROUND_Y;

function pile(bodies: number): ZombiePile {
  return { ...newZombiePile(200, GROUND_Y), bodies };
}

describe('zombie pile', () => {
  it('a new pile stands on the surface with the default bodies', (): void => {
    const p: ZombiePile = newZombiePile(200, GROUND_Y);
    expect(p.y + p.height).toBe(GROUND_Y);
    expect(p.bodies).toBe(GAME_CONSTANTS.ZOMBIE_PILE_BODIES);
  });

  it('gives one spot per body, every one inside the width', (): void => {
    const p: ZombiePile = pile(GAME_CONSTANTS.ZOMBIE_PILE_MAX_BODIES);
    const spots: PileSpot[] = pileSpots(p, BODY_HEIGHT);
    expect(spots).toHaveLength(GAME_CONSTANTS.ZOMBIE_PILE_MAX_BODIES);
    for (const s of spots) {
      expect(s.centerX).toBeGreaterThan(p.x);
      expect(s.centerX).toBeLessThan(p.x + p.width);
    }
  });

  it('the bottom row starts on the surface, each row narrower and a body higher', (): void => {
    const spots: PileSpot[] = pileSpots(pile(GAME_CONSTANTS.ZOMBIE_PILE_BODIES), BODY_HEIGHT);
    const count: (top: number) => number = (top: number): number =>
      spots.filter((s: PileSpot): boolean => s.top === top).length;
    const first: number = GROUND_Y - BODY_HEIGHT;
    expect(spots[0].top).toBe(first);
    expect(count(first - BODY_HEIGHT)).toBe(count(first) - 1);
  });

  it('a very narrow pile is still a stack', (): void => {
    const narrow: ZombiePile = { ...pile(3), width: 1 };
    const tops: number[] = pileSpots(narrow, BODY_HEIGHT).map((s: PileSpot): number => s.top);
    expect(new Set<number>(tops).size).toBe(3);
  });

  it('tells its corpses from the slain', (): void => {
    expect(isPileCorpse('pile-corpse-1')).toBe(true);
    expect(isPileCorpse('dropped-corpse-1')).toBe(false);
  });
});
