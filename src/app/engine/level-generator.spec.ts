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
import { chuteSpan } from './boulder-puzzle';
import { BoulderPuzzleLayout, CagePuzzleLayout, Platform, Rope, SpringPuzzleLayout } from './engine-types';
import { springSpan } from './spring-puzzle';

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

  it('every floor has one safe spot: high, far from the exit, with its own ladder', (): void => {
    for (let seed: number = 1; seed <= 200; seed++) {
      for (let floor: number = 1; floor <= 8; floor++) {
        const level: LevelLayout = generateLevel(seed, floor);
        const spots: Platform[] = level.platforms.filter((p: Platform): boolean => p.safe === true);
        expect(spots.length, `seed ${seed} floor ${floor}`).toBe(1);
        const spot: Platform = spots[0];
        expect(spot.y, 'above every tier').toBeLessThan(Math.min(...GAME_CONSTANTS.LEVEL_TIER_Y));
        const exitCx: number = level.exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH / 2;
        const spotCx: number = spot.x + spot.width / 2;
        expect(Math.sign(spotCx - GAME_CONSTANTS.CANVAS_WIDTH / 2), 'opposite half from the exit').toBe(
          -Math.sign(exitCx - GAME_CONSTANTS.CANVAS_WIDTH / 2),
        );
        const ladder: Rope | undefined = level.ropes.find(
          (r: Rope): boolean => r.topY === spot.y && r.x >= spot.x && r.x <= spot.x + spot.width,
        );
        expect(ladder, `seed ${seed} floor ${floor}: ladder`).toBeDefined();
        expect(ladder!.bottomY, 'the ladder reaches down to a lower surface').toBeGreaterThan(spot.y);
      }
    }
  });

  it('the safe spot rules catch a missing ladder and a spot next to the exit', (): void => {
    const level: LevelLayout = generateLevel(3, 2);
    const spot: Platform = level.platforms.find((p: Platform): boolean => p.safe === true)!;
    const noLadder: LevelLayout = {
      ...level,
      ropes: level.ropes.filter((r: Rope): boolean => r.topY !== spot.y),
    };
    expect(levelViolations(noLadder).some((v: string): boolean => v.includes('no ladder'))).toBe(true);
    const byExit: LevelLayout = {
      ...level,
      platforms: level.platforms.map(
        (p: Platform): Platform => (p.safe ? { ...p, x: level.exitX } : p),
      ),
    };
    expect(
      levelViolations(byExit).some((v: string): boolean => v.includes('safe spot') && v.includes('exit')),
    ).toBe(true);
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

  it('a solid at a screen edge always pushes back onto the screen (a dash ending inside the puzzle wall)', (): void => {
    const rightWall: Platform = { x: 1216, y: 0, width: 64, height: GAME_CONSTANTS.GROUND_Y, solid: true };
    expect(pushOutOfSolids(1248, 572, 32, 48, 1248, [rightWall])).toEqual({ x: 1184, blocked: true });
    const leftWall: Platform = { x: 0, y: 0, width: 64, height: GAME_CONSTANTS.GROUND_Y, solid: true };
    expect(pushOutOfSolids(0, 572, 32, 48, 0, [leftWall])).toEqual({ x: 64, blocked: true });
  });
});

describe('boulder puzzle floor', (): void => {
  const PUZZLE_FLOOR: number = GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR;
  const LEDGE_W: number = GAME_CONSTANTS.EXIT_PLATFORM_WIDTH;

  it('only the puzzle floor has a boulder puzzle', (): void => {
    for (let seed: number = 1; seed <= 200; seed++) {
      for (let floor: number = 1; floor <= 6; floor++) {
        const level: LevelLayout = generateLevel(seed, floor);
        expect(level.boulderPuzzle !== undefined, `seed ${seed} floor ${floor}`).toBe(
          floor === PUZZLE_FLOOR,
        );
      }
    }
  });

  it('the boulder ledge is the exit spot (climbed by the corpse pile); the chute runs clear to the wall', (): void => {
    for (let seed: number = 1; seed <= 200; seed++) {
      const level: LevelLayout = generateLevel(seed, PUZZLE_FLOOR);
      const puzzle: BoulderPuzzleLayout = level.boulderPuzzle!;
      expect(level.exitX, `seed ${seed}: the ledge hangs where the exit would`).toBe(puzzle.ledgeX);
      const [from, to]: [number, number] = chuteSpan(puzzle);
      expect(to - from, `seed ${seed} chute span`).toBeGreaterThanOrEqual(
        GAME_CONSTANTS.BOULDER_CHUTE_MIN_SPAN_PX,
      );
      expect(to - from).toBeLessThanOrEqual(GAME_CONSTANTS.BOULDER_CHUTE_MAX_SPAN_PX);
      for (const p of level.platforms) {
        expect(p.x + p.width <= from || p.x >= to, `seed ${seed} platform ${p.x},${p.y} under the chute`).toBe(
          true,
        );
      }
      const spot: Platform = level.platforms.find((p: Platform): boolean => p.safe === true)!;
      const gap: number = Math.max(spot.x - (puzzle.ledgeX + LEDGE_W), puzzle.ledgeX - (spot.x + spot.width));
      expect(gap, `seed ${seed}: the safe spot keeps away from the ledge`).toBeGreaterThanOrEqual(
        GAME_CONSTANTS.BOULDER_SAFE_SPOT_GAP_PX,
      );
    }
  });

  it('the rules catch a platform under the chute, a wall off the edge and a missing puzzle', (): void => {
    const level: LevelLayout = generateLevel(5, PUZZLE_FLOOR);
    const puzzle: BoulderPuzzleLayout = level.boulderPuzzle!;
    const has: (l: LevelLayout, text: string) => boolean = (l: LevelLayout, text: string): boolean =>
      levelViolations(l).some((v: string): boolean => v.includes(text));
    expect(levelViolations(level)).toEqual([]);
    const [from]: [number, number] = chuteSpan(puzzle);
    const underChute: Platform = { x: from + 32, y: 530, width: 96, height: 32 };
    expect(has({ ...level, platforms: [...level.platforms, underChute] }, 'under the chute')).toBe(
      true,
    );
    expect(
      has(
        { ...level, boulderPuzzle: { ...puzzle, wall: { ...puzzle.wall, x: puzzle.wall.x - 32 } } },
        'wall: not at a screen edge',
      ),
    ).toBe(true);
    expect(has({ ...level, boulderPuzzle: undefined }, 'puzzle floor without a boulder puzzle')).toBe(
      true,
    );
  });
});

describe('spring puzzle floor', (): void => {
  const SPRING_FLOOR: number = GAME_CONSTANTS.PUZZLE_SPRING_FLOOR;

  it('only the spring floor has a spring', (): void => {
    for (let seed: number = 1; seed <= 200; seed++) {
      for (let floor: number = 1; floor <= 6; floor++) {
        const level: LevelLayout = generateLevel(seed, floor);
        expect(level.springPuzzle !== undefined, `seed ${seed} floor ${floor}`).toBe(
          floor === SPRING_FLOOR,
        );
      }
    }
  });

  it('the spring stands at the screen edge under the whole exit; nothing hangs over or crowds it', (): void => {
    for (let seed: number = 1; seed <= 200; seed++) {
      const level: LevelLayout = generateLevel(seed, SPRING_FLOOR);
      const puzzle: SpringPuzzleLayout = level.springPuzzle!;
      const [left, right]: [number, number] = springSpan(puzzle);
      expect(left === 0 || right === GAME_CONSTANTS.CANVAS_WIDTH, `seed ${seed} at an edge`).toBe(true);
      expect(left).toBeLessThanOrEqual(level.exitX);
      expect(right).toBeGreaterThanOrEqual(level.exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH);
      const from: number = left - GAME_CONSTANTS.SPRING_CLEAR_PX;
      const to: number = right + GAME_CONSTANTS.SPRING_CLEAR_PX;
      for (const p of level.platforms) {
        expect(p.x + p.width <= from || p.x >= to, `seed ${seed} platform ${p.x},${p.y}`).toBe(true);
      }
      for (const prop of level.props) {
        expect(prop.x + prop.width <= from || prop.x >= to, `seed ${seed} prop ${prop.x}`).toBe(true);
      }
    }
  });

  it('the rules catch a platform over the spring, a prop by its lever, a moved spring and a missing one', (): void => {
    const level: LevelLayout = generateLevel(5, SPRING_FLOOR);
    const puzzle: SpringPuzzleLayout = level.springPuzzle!;
    const has: (l: LevelLayout, text: string) => boolean = (l: LevelLayout, text: string): boolean =>
      levelViolations(l).some((v: string): boolean => v.includes(text));
    expect(levelViolations(level)).toEqual([]);
    const over: Platform = { x: puzzle.spring.x + 32, y: 430, width: 96, height: 32 };
    expect(has({ ...level, platforms: [...level.platforms, over] }, 'over the spring')).toBe(true);
    const nearX: number =
      puzzle.side === 1 ? puzzle.spring.x - 40 : puzzle.spring.x + puzzle.spring.width + 12;
    const byLever: Prop = { kind: 'box1', x: nearX, y: GAME_CONSTANTS.GROUND_Y - 22, width: 28, height: 22 };
    expect(has({ ...level, props: [...level.props, byLever] }, 'crowds the spring')).toBe(true);
    const moved: SpringPuzzleLayout = { ...puzzle, spring: { ...puzzle.spring, x: puzzle.spring.x + 32 } };
    expect(has({ ...level, springPuzzle: moved }, 'spring: not')).toBe(true);
    expect(has({ ...level, springPuzzle: undefined }, 'spring floor without a spring')).toBe(true);
    expect(has({ ...generateLevel(5, 4), springPuzzle: puzzle }, 'spring on another floor')).toBe(true);
  });
});

describe('cage puzzle floor', (): void => {
  const CAGE_FLOOR: number = GAME_CONSTANTS.PUZZLE_CAGE_FLOOR;

  it('only the cage floor has cages', (): void => {
    for (let seed: number = 1; seed <= 200; seed++) {
      for (let floor: number = 1; floor <= 6; floor++) {
        const level: LevelLayout = generateLevel(seed, floor);
        expect(level.cagePuzzle !== undefined, `seed ${seed} floor ${floor}`).toBe(floor === CAGE_FLOOR);
      }
    }
  });

  it('the zombie cage hangs mid-screen over open ground; both cleats stand at the ends of a high regular ledge', (): void => {
    const crossings: Set<string> = new Set<string>();
    let openSky: number = 0;
    for (let seed: number = 1; seed <= 200; seed++) {
      const level: LevelLayout = generateLevel(seed, CAGE_FLOOR);
      const puzzle: CagePuzzleLayout = level.cagePuzzle!;
      const cage: Platform = puzzle.zombieCage;
      expect(cage.x).toBeGreaterThanOrEqual(GAME_CONSTANTS.CAGE_ZOMBIE_MIN_X);
      expect(cage.x).toBeLessThanOrEqual(GAME_CONSTANTS.CAGE_ZOMBIE_MAX_X);
      const from: number = cage.x - GAME_CONSTANTS.CAGE_CLEAR_PX;
      const to: number = cage.x + cage.width + GAME_CONSTANTS.CAGE_CLEAR_PX;
      for (const p of level.platforms) {
        expect(p.x + p.width <= from || p.x >= to, `seed ${seed} platform ${p.x},${p.y}`).toBe(true);
      }
      const xs: number[] = [puzzle.exitCleatX, puzzle.zombieCleatX].sort(
        (a: number, b: number): number => a - b,
      );
      const ledge: Platform | undefined = level.platforms.find(
        (p: Platform): boolean =>
          p.y === puzzle.cleatY &&
          xs[0] === p.x + GAME_CONSTANTS.CAGE_CLEAT_INSET_PX &&
          xs[1] === p.x + p.width - GAME_CONSTANTS.CAGE_CLEAT_INSET_PX,
      );
      expect(ledge, `seed ${seed}: the cleats stand at a ledge's ends`).toBeDefined();
      expect(ledge!.safe, 'never the safe spot (no swinging there)').toBeFalsy();
      const above: boolean = level.platforms.some(
        (q: Platform): boolean =>
          q.y < ledge!.y && xs.some((x: number): boolean => x + 10 > q.x && x - 10 < q.x + q.width),
      );
      if (!above) openSky++;
      crossings.add(`${puzzle.exitCleatX === xs[0]} ${puzzle.exitChainY < puzzle.zombieChainY}`);
    }
    expect(openSky, 'the chains nearly always run up through open sky').toBeGreaterThan(190);
    expect(crossings.size, 'cleat order and chain rows vary').toBe(4);
  });

  it('the rules catch a platform under the zombie cage, a moved cleat, a stray cage and a missing one', (): void => {
    const level: LevelLayout = generateLevel(5, CAGE_FLOOR);
    const puzzle: CagePuzzleLayout = level.cagePuzzle!;
    const has: (l: LevelLayout, text: string) => boolean = (l: LevelLayout, text: string): boolean =>
      levelViolations(l).some((v: string): boolean => v.includes(text));
    expect(levelViolations(level)).toEqual([]);
    const under: Platform = { x: puzzle.zombieCage.x, y: 430, width: 96, height: 32 };
    expect(has({ ...level, platforms: [...level.platforms, under] }, 'under the zombie cage')).toBe(true);
    expect(has({ ...level, cagePuzzle: { ...puzzle, exitCleatX: puzzle.exitCleatX + 8 } }, 'cleats')).toBe(true);
    expect(has({ ...level, cagePuzzle: { ...puzzle, zombieChainY: 300 } }, 'chains')).toBe(true);
    expect(has({ ...level, cagePuzzle: { ...puzzle, cleatY: GAME_CONSTANTS.LEVEL_SAFE_SPOT_Y } }, 'cleats')).toBe(true);
    const byCleat: Prop = {
      kind: 'box1',
      x: puzzle.exitCleatX + 10,
      y: puzzle.cleatY - 22,
      width: 28,
      height: 22,
    };
    expect(has({ ...level, props: [...level.props, byCleat] }, 'crowds a cleat')).toBe(true);
    const off: CagePuzzleLayout = { ...puzzle, zombieCage: { ...puzzle.zombieCage, x: 32 } };
    expect(has({ ...level, cagePuzzle: off }, 'zombie cage: not mid-screen')).toBe(true);
    expect(has({ ...level, cagePuzzle: undefined }, 'cage floor without cages')).toBe(true);
    expect(has({ ...generateLevel(5, 5), cagePuzzle: puzzle }, 'cages on another floor')).toBe(true);
  });
});
