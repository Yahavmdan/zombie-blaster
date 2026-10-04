import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS } from '@shared/index';
import {
  exitPlatformY,
  generateLevel,
  LevelLayout,
  levelViolations,
  Prop,
  PROP_ART,
  PropArt,
} from './level-generator';
import { pushOutOfSolids } from './solid-blocks';
import { Platform } from './engine-types';

describe('level generator', () => {
  it('every generated floor obeys the layout rules (tiles, exit clearance, reachability)', (): void => {
    const broken: string[] = [];
    for (let seed: number = 1; seed <= 200; seed++) {
      for (let floor: number = 1; floor <= 10; floor++) {
        for (const v of levelViolations(generateLevel(seed, floor))) {
          broken.push(`seed ${seed} floor ${floor}: ${v}`);
        }
      }
    }
    expect(broken.slice(0, 10)).toEqual([]);
  });

  it('is deterministic: the same seed and floor always build the same level (host == clients)', (): void => {
    expect(generateLevel(42, 3)).toEqual(generateLevel(42, 3));
  });

  it('floors differ from each other', (): void => {
    const shapes: Set<string> = new Set<string>();
    for (let floor: number = 1; floor <= 8; floor++) {
      const level: LevelLayout = generateLevel(7, floor);
      shapes.add(JSON.stringify([level.platforms, level.ropes, level.exitX]));
    }
    expect(shapes.size).toBeGreaterThanOrEqual(6);
  });

  it('later floors always have a rope; every floor has platforms to use', (): void => {
    for (let seed: number = 1; seed <= 100; seed++) {
      expect(generateLevel(seed, 1).platforms.length).toBeGreaterThan(0);
      for (let floor: number = 2; floor <= 6; floor++) {
        expect(
          generateLevel(seed, floor).ropes.length,
          `seed ${seed} floor ${floor}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('no platform is within double-jump reach of the exit', (): void => {
    const doubleJumpPx: number = 206;
    for (let seed: number = 1; seed <= 200; seed++) {
      for (let floor: number = 1; floor <= 6; floor++) {
        const level: LevelLayout = generateLevel(seed, floor);
        const exitY: number = exitPlatformY(floor, 0);
        for (const p of level.platforms) {
          const gap: number = Math.max(
            0,
            Math.max(
              level.exitX - (p.x + p.width),
              p.x - (level.exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH),
            ),
          );
          const closeEnoughToJump: boolean = gap < GAME_CONSTANTS.LEVEL_TIER2_EXIT_GAP_PX;
          if (closeEnoughToJump) {
            expect(
              p.y - exitY,
              `seed ${seed} floor ${floor} platform ${p.x},${p.y}`,
            ).toBeGreaterThan(doubleJumpPx);
          }
        }
      }
    }
  });

  it('platforms are whole tiles, so the drawn tiles are exactly the collision box', (): void => {
    const level: LevelLayout = generateLevel(99, 4);
    for (const p of level.platforms as Platform[]) {
      expect(p.width % GAME_CONSTANTS.LEVEL_TILE_PX).toBe(0);
      expect(p.height).toBe(GAME_CONSTANTS.LEVEL_TILE_PX);
    }
    expect(GAME_CONSTANTS.EXIT_PLATFORM_WIDTH % GAME_CONSTANTS.LEVEL_TILE_PX).toBe(0);
  });
});

describe('map props', () => {
  it('every floor has props, and each prop box is exactly its visible art', (): void => {
    for (let seed: number = 1; seed <= 100; seed++) {
      for (let floor: number = 1; floor <= 5; floor++) {
        const level: LevelLayout = generateLevel(seed, floor);
        expect(level.props.length, `seed ${seed} floor ${floor}`).toBeGreaterThan(0);
        for (const prop of level.props) {
          const art: PropArt = PROP_ART[prop.kind];
          expect(prop.width).toBe(art.right - art.left + 1);
          expect(prop.height).toBe(art.bottom - art.top + 1);
        }
      }
    }
  });

  it('props sometimes stack (boxes on boxes)', (): void => {
    let stacks: number = 0;
    for (let seed: number = 1; seed <= 200; seed++) {
      const level: LevelLayout = generateLevel(seed, 2);
      stacks += level.props.filter((p: Prop): boolean =>
        level.props.some((q: Prop): boolean => q !== p && q.y === p.y + p.height),
      ).length;
    }
    expect(stacks).toBeGreaterThan(0);
  });

  it('solid props block sideways movement but can be stood on', (): void => {
    const box: Platform = { x: 100, y: 600, width: 28, height: 20, solid: true };
    const walkingInto: { x: number; blocked: boolean } = pushOutOfSolids(80, 572, 32, 48, 66, [
      box,
    ]);
    expect(walkingInto).toEqual({ x: 68, blocked: true });
    const fromRight: { x: number; blocked: boolean } = pushOutOfSolids(120, 572, 32, 48, 130, [
      box,
    ]);
    expect(fromRight).toEqual({ x: 128, blocked: true });
    const onTop: { x: number; blocked: boolean } = pushOutOfSolids(100, 552, 32, 48, 96, [box]);
    expect(onTop.blocked).toBe(false);
    const notSolid: { x: number; blocked: boolean } = pushOutOfSolids(80, 572, 32, 48, 66, [
      { ...box, solid: false },
    ]);
    expect(notSolid.blocked).toBe(false);
  });
});
