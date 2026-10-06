> **SUPERSEDED.** This describes the first, rail-based boulder design, which was replaced after playtesting
> (ledge + gate + chute + corpse climb). The current design is in the code and in
> `.claude/skills/stage-puzzle/SKILL.md`.

# Floor 2 Boulder Puzzle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On floor 2 the exit is a breakable side wall: players climb to a rail, hit a boulder so it rolls into the wall, and leave through the opening.

**Architecture:** The seeded level generator adds a `BoulderPuzzleLayout` (rail, wall, boulder travel range) on floor 2. Pure rules live in `boulder-puzzle.ts`; a host-only `BoulderPuzzleSystem` turns attacks into pushes, rolls the boulder, crushes zombies and breaks the wall. The host sends `BoulderState` in `game-sync`; clients apply it and replay a `wall-break` `VfxEvent`.

**Tech Stack:** Angular 21 + canvas engine (TypeScript), Vitest via `@angular/build:unit-test`, Playwright e2e, Node `ws` relay (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-06-boulder-puzzle-design.md`

## Global Constraints

- Explicit types on every `const`/`let`, parameter, return type, field and callback parameter (`.claude/rules/explicit-types.md`).
- No unused variables, imports or parameters. No new `console.*`.
- Shared types live in `shared/` (`BoulderState`, `VfxEventType.WallBreak`, `BOULDER_*` constants).
- Level art is drawn only from the layout physics collides with; `level-geometry.spec.ts` + `level-sync.spec.ts` must pass.
- Every visual effect other players should see pushes a `VfxEvent` next to the local call.
- Host authority: only the host (or solo) moves the boulder, crushes zombies and breaks the wall. Clients send nothing new.
- Floor 2 only (`GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR = 2`); every other floor is unchanged.
- The boulder never leaves the rail or the screen: its x is clamped between its stoppers, also on clients and after the wall breaks.
- Run `npx prettier --write` only on files this plan creates.
- `shared/` changes: run `npm run build` and `cd zombie-blaster-api && npm run build`.
- Commits: the user commits; each task ends with a staged checkpoint, commit only when the user says so.

## Review Focus

1. A synced boulder state with an absurd or non-finite x/velocity: the client clamps it onto the rail and ignores NaN (test in Task 4).
2. Corpses, drops or spawns pushed toward the standing wall: they stay outside the wall's box, never hidden inside it (tests in Task 2 + Task 4).
3. A guest whose first sync after a floor change already says `wallBroken`: the wall's collision and art disappear for them (test in Task 4).
4. A player attacking from the ground under the rail, or facing away: no push (test in Task 2).
5. Leaving floor 2: floor 3 has no puzzle, no wall, and the hanging exit is back on screen (test in Task 4).

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/game-constants.ts` | `PUZZLE_BOULDER_FLOOR`, `BOULDER_*` tuning |
| `shared/game-entities.ts` | `BoulderState` (synced) |
| `shared/multiplayer.ts` | `VfxEventType.WallBreak` |
| `src/app/engine/engine-types.ts` | `BoulderPuzzleLayout`, `Platform.breakable`, `IGameEngine` additions |
| `src/app/engine/level-generator.ts` | floor-2 layout + rules |
| `src/app/engine/boulder-puzzle.ts` (new) | pure rules: box, push direction, rolling, crush targets, keep-out-of-wall, opening check |
| `src/app/engine/boulder-puzzle-system.ts` (new) | host simulation + client extrapolation |
| `src/app/engine/game-engine.ts` | state, wiring, wall break, snapshot/apply, VFX replay |
| `src/app/engine/zombie-system.ts` | opening completes floor 2; spawns + corpses kept out of the wall |
| `src/app/engine/drop-system.ts` | drops kept out of the wall |
| `src/app/engine/vfx-system.ts` | `spawnWallBreak` |
| `src/app/engine/map-renderer.ts` | wall + rail tracks in the geometry layer |
| `src/app/engine/render-system.ts` | boulder, stoppers, opening sign; hide the parked exit |
| `src/app/components/game-canvas/game-canvas.component.ts` | `applyRemoteBoulder` passthrough |
| `src/app/pages/game/game.component.ts` | carry `boulder` in game-sync |
| `src/app/testing/e2e-api.ts`, `e2e-hooks.ts`, `geometry-report.ts` | probe `puzzle`; wall in the geometry check |
| `e2e/specs/solo/boulder-puzzle.spec.ts` (new), `e2e/specs/online/boulder-puzzle-coop.spec.ts` (new) | browser coverage |

---

### Task 1: Shared types, constants and the floor-2 layout

**Files:**
- Modify: `shared/game-constants.ts` (after `LEVEL_SAFE_SPOT_EXIT_GAP_PX`, line ~122)
- Modify: `shared/game-entities.ts` (append)
- Modify: `shared/multiplayer.ts:252-267` (`VfxEventType`)
- Modify: `src/app/engine/engine-types.ts:67-76` (`Platform`) and append `BoulderPuzzleLayout`
- Modify: `src/app/engine/level-generator.ts`
- Test: `src/app/engine/level-generator.spec.ts`

**Interfaces:**
- Produces: `BoulderState { x: number; velocityX: number; wallBroken: boolean }` (`@shared/game-entities`); `VfxEventType.WallBreak = 'wall-break'`; `GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR`, `BOULDER_SIZE_PX`, `BOULDER_PUSH_SPEED`, `BOULDER_FRICTION`, `BOULDER_MIN_SPEED`, `BOULDER_HIT_REACH_PX`, `BOULDER_HIT_COOLDOWN_TICKS`, `BOULDER_CRUSH_DAMAGE_PERCENT`, `BOULDER_RAIL_MIN_TILES`, `BOULDER_RAIL_MAX_TILES`, `BOULDER_WALL_TILES`, `BOULDER_BACK_ROOM_PX`, `BOULDER_START_OFFSET_PX`, `BOULDER_STOPPER_PX`, `BOULDER_OPENING_CLEAR_PX`; `BoulderPuzzleLayout` (engine-types); `Platform.breakable?: boolean`; `LevelLayout.boulderPuzzle?: BoulderPuzzleLayout`.

- [ ] **Step 1: Add the constants** (in `GAME_CONSTANTS`, after `LEVEL_SAFE_SPOT_EXIT_GAP_PX`)

```ts
  PUZZLE_BOULDER_FLOOR: 2, // Floor whose exit is a side wall broken by a boulder rolled along a rail (no hanging exit)
  BOULDER_SIZE_PX: 48, // Boulder diameter: its box is size x size, resting on the rail
  BOULDER_PUSH_SPEED: 9, // Speed (px/tick) one hit gives the boulder
  BOULDER_FRICTION: 0.985, // Share of its speed the rolling boulder keeps each tick (one hit carries it ~600 px)
  BOULDER_MIN_SPEED: 0.2, // Below this speed the boulder stops
  BOULDER_HIT_REACH_PX: 24, // Max gap between an attacking player's box and the boulder for the swing to push it
  BOULDER_HIT_COOLDOWN_TICKS: 36, // One push per swing (a held attack swings every 36 ticks)
  BOULDER_CRUSH_DAMAGE_PERCENT: 60, // A rolling boulder takes this share of a zombie's max HP, once per roll
  BOULDER_RAIL_MIN_TILES: 14, // Shortest rail, in tiles
  BOULDER_RAIL_MAX_TILES: 18, // Longest rail, in tiles (travel stays under one hit's ~600 px)
  BOULDER_WALL_TILES: 2, // Width of the breakable side wall (it spans the screen top to the ground)
  BOULDER_BACK_ROOM_PX: 64, // Rail behind the back stopper: room to stand behind the boulder
  BOULDER_START_OFFSET_PX: 64, // The boulder starts this far in front of its back stopper
  BOULDER_STOPPER_PX: 8, // Width of the wooden stoppers at both ends of the boulder's travel
  BOULDER_OPENING_CLEAR_PX: 96, // Props keep this far from the wall, so the way out stays open
```

- [ ] **Step 2: Add the shared types**

Append to `shared/game-entities.ts`:

```ts
/** Floor-2 boulder puzzle: the host simulates it and sends it with every game-sync. */
export interface BoulderState {
  /** Left edge of the boulder's box (it rests on the rail). */
  x: number;
  /** Rolling speed in px/tick: positive rolls right. */
  velocityX: number;
  /** True once the boulder smashed the side wall (permanent for the floor). */
  wallBroken: boolean;
}
```

In `shared/multiplayer.ts`, add to `VfxEventType` after `MagicTwinSpawn`:

```ts
  WallBreak = 'wall-break',
```

- [ ] **Step 3: Add the engine layout types** in `src/app/engine/engine-types.ts`

In `Platform`, after `safe?: boolean;`:

```ts
  /** The floor-2 puzzle wall: solid until the boulder breaks it, then removed. */
  breakable?: boolean;
```

After the `Rope` interface:

```ts
/** Floor-2 puzzle: a rail (also a platform) that leads to a breakable wall at a screen edge. */
export interface BoulderPuzzleLayout {
  /** The rail the boulder rolls on; the same box is in the layout's platforms. */
  rail: Platform;
  /** The wall at the screen edge: from the screen top to the ground. */
  wall: Platform;
  /** +1: the wall is right of the rail, -1: left of it. */
  wallDir: 1 | -1;
  /** Range of the boulder's left edge: between its two stoppers. */
  minBoulderX: number;
  maxBoulderX: number;
  boulderStartX: number;
}
```

- [ ] **Step 4: Write the failing generator tests** — append to `src/app/engine/level-generator.spec.ts` (add `BoulderPuzzleLayout` to the `./engine-types` import)

```ts
describe('boulder puzzle floor', () => {
  const PUZZLE_FLOOR: number = GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR;

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

  it('the rail touches the wall at the exit side, and one push from the back stopper reaches the wall', (): void => {
    const onePush: number = GAME_CONSTANTS.BOULDER_PUSH_SPEED / (1 - GAME_CONSTANTS.BOULDER_FRICTION);
    for (let seed: number = 1; seed <= 200; seed++) {
      const level: LevelLayout = generateLevel(seed, PUZZLE_FLOOR);
      const puzzle: BoulderPuzzleLayout = level.boulderPuzzle!;
      const exitOnRight: boolean = level.exitX > GAME_CONSTANTS.CANVAS_WIDTH / 2;
      expect(puzzle.wallDir, `seed ${seed}`).toBe(exitOnRight ? 1 : -1);
      expect(puzzle.maxBoulderX - puzzle.minBoulderX, `seed ${seed} travel`).toBeLessThan(onePush);
      expect(puzzle.boulderStartX).toBeGreaterThan(puzzle.minBoulderX);
      expect(puzzle.boulderStartX).toBeLessThan(puzzle.maxBoulderX);
    }
  });

  it('the rules catch a rail away from the wall, a missing ladder and a boulder that can leave the rail', (): void => {
    const level: LevelLayout = generateLevel(5, PUZZLE_FLOOR);
    const puzzle: BoulderPuzzleLayout = level.boulderPuzzle!;
    const has: (l: LevelLayout, text: string) => boolean = (l: LevelLayout, text: string): boolean =>
      levelViolations(l).some((v: string): boolean => v.includes(text));
    expect(levelViolations(level)).toEqual([]);
    const shifted: Platform = { ...puzzle.rail, x: puzzle.rail.x - puzzle.wallDir * 64 };
    expect(
      has(
        {
          ...level,
          platforms: level.platforms.map((p: Platform): Platform =>
            p.x === puzzle.rail.x && p.y === puzzle.rail.y ? shifted : p,
          ),
          boulderPuzzle: { ...puzzle, rail: shifted },
        },
        'rail: does not reach the wall',
      ),
    ).toBe(true);
    expect(
      has(
        { ...level, ropes: level.ropes.filter((r: Rope): boolean => r.topY !== puzzle.rail.y) },
        'rail: no ladder',
      ),
    ).toBe(true);
    expect(
      has(
        { ...level, boulderPuzzle: { ...puzzle, maxBoulderX: puzzle.rail.x + puzzle.rail.width } },
        'boulder: can leave the rail',
      ),
    ).toBe(true);
    expect(has({ ...level, boulderPuzzle: undefined }, 'puzzle floor without a boulder puzzle')).toBe(true);
  });
});
```

Also, in the existing test `'no platform is within double-jump reach of the exit'`, skip the puzzle floor (it has no hanging exit). Inside the `floor` loop, after `const level: LevelLayout = generateLevel(seed, floor);`:

```ts
        if (level.boulderPuzzle) continue;
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npm test -- --watch=false --include src/app/engine/level-generator.spec.ts`
Expected: FAIL (`boulderPuzzle` is undefined on floor 2; TypeScript may fail first on the missing property, which counts as failing).

- [ ] **Step 6: Implement the layout** in `src/app/engine/level-generator.ts`

Imports: `import { BoulderPuzzleLayout, Platform, Rope } from './engine-types';`

`LevelLayout` gains:

```ts
  /** Floor-2 puzzle (rail, breakable wall, boulder travel); the hanging exit is not used there. */
  boulderPuzzle?: BoulderPuzzleLayout;
```

Helper next to `platformGap`:

```ts
function sameBox(a: Platform, b: Platform): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width;
}
```

`PropContext` gains `boulderPuzzle?: BoulderPuzzleLayout;`. In `propProblems`, before `return out;`:

```ts
  const puzzle: BoulderPuzzleLayout | undefined = layout.boulderPuzzle;
  if (puzzle) {
    const onRail: boolean =
      bottom === puzzle.rail.y &&
      spanGap(left, right, puzzle.rail.x, puzzle.rail.x + puzzle.rail.width) === 0;
    if (onRail) out.push('on the rail');
    const fromWall: number = spanGap(left, right, puzzle.wall.x, puzzle.wall.x + puzzle.wall.width);
    if (fromWall < GAME_CONSTANTS.BOULDER_OPENING_CLEAR_PX) out.push('blocks the way out');
  }
```

`placeProps` takes the puzzle through its `layout` argument (type stays `Omit<PropContext, 'props'>`); in its surface list replace `...layout.platforms.filter((p: Platform): boolean => !p.safe)` with:

```ts
          ...layout.platforms.filter(
            (p: Platform): boolean =>
              !p.safe && !(layout.boulderPuzzle && sameBox(p, layout.boulderPuzzle.rail)),
          ),
```

New function after `placeSafeSpot`:

```ts
/**
 * Floor-2 puzzle: a solid wall at the exit's screen edge, a tier-3 rail running from it inward,
 * the boulder's travel between two stoppers (with room to stand behind it), and a ladder from the
 * rail in front of the boulder, so a player arriving there first pushes it the wrong way.
 */
function placeBoulderPuzzle(
  rand: Random,
  exitOnRight: boolean,
  platforms: Platform[],
): { puzzle: BoulderPuzzleLayout; ladder: Rope } {
  const tile: number = GAME_CONSTANTS.LEVEL_TILE_PX;
  const size: number = GAME_CONSTANTS.BOULDER_SIZE_PX;
  const stopper: number = GAME_CONSTANTS.BOULDER_STOPPER_PX;
  const backRoom: number = GAME_CONSTANTS.BOULDER_BACK_ROOM_PX;
  const wallWidth: number = GAME_CONSTANTS.BOULDER_WALL_TILES * tile;
  const railWidth: number =
    randomInt(rand, GAME_CONSTANTS.BOULDER_RAIL_MIN_TILES, GAME_CONSTANTS.BOULDER_RAIL_MAX_TILES) * tile;
  const wall: Platform = {
    x: exitOnRight ? GAME_CONSTANTS.CANVAS_WIDTH - wallWidth : 0,
    y: 0,
    width: wallWidth,
    height: GAME_CONSTANTS.GROUND_Y,
  };
  const rail: Platform = {
    x: exitOnRight ? wall.x - railWidth : wall.x + wallWidth,
    y: GAME_CONSTANTS.LEVEL_TIER_Y[2],
    width: railWidth,
    height: tile,
  };
  const minBoulderX: number = exitOnRight ? rail.x + backRoom + stopper : wall.x + wallWidth + stopper;
  const maxBoulderX: number = exitOnRight
    ? wall.x - stopper - size
    : rail.x + railWidth - backRoom - stopper - size;
  const boulderStartX: number = exitOnRight
    ? minBoulderX + GAME_CONSTANTS.BOULDER_START_OFFSET_PX
    : maxBoulderX - GAME_CONSTANTS.BOULDER_START_OFFSET_PX;
  const puzzle: BoulderPuzzleLayout = {
    rail,
    wall,
    wallDir: exitOnRight ? 1 : -1,
    minBoulderX,
    maxBoulderX,
    boulderStartX,
  };

  // Ladder between the boulder and the wall-side stopper.
  const margin: number = 32;
  const lo: number = exitOnRight ? boulderStartX + size + margin : minBoulderX + margin;
  const hi: number = exitOnRight ? maxBoulderX + size - margin : boulderStartX - margin;
  for (let attempt: number = 0; attempt < 30; attempt++) {
    const x: number = Math.round(randomInt(rand, lo, hi) / 16) * 16;
    const ladder: Rope = { x, topY: rail.y, bottomY: surfaceUnder(x, rail.y, platforms) };
    if (ropeLandsCleanly(ladder, platforms)) return { puzzle, ladder };
  }
  return { puzzle, ladder: ropeFrom(rand, rail, platforms) };
}
```

In `generateLevel`, after the tier-2 loop and before the `// Later floors always have at least one rope` block:

```ts
  let boulderPuzzle: BoulderPuzzleLayout | undefined;
  if (floor === GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR) {
    const placed: { puzzle: BoulderPuzzleLayout; ladder: Rope } = placeBoulderPuzzle(
      rand,
      exitOnRight,
      platforms,
    );
    boulderPuzzle = placed.puzzle;
    platforms.push(placed.puzzle.rail);
    ropes.push(placed.ladder);
  }
```

Guard the random tier 3 so it never shares the rail's tier: change `if (floor > 1 && tier2.length > 0 && rand() < 0.5) {` to `if (!boulderPuzzle && floor > 1 && tier2.length > 0 && rand() < 0.5) {`.

Replace the end of `generateLevel`:

```ts
  const props: Prop[] = placeProps(rand, { platforms, ropes, exitX, boulderPuzzle });
  return boulderPuzzle
    ? { seed, floor, platforms, ropes, exitX, props, boulderPuzzle }
    : { seed, floor, platforms, ropes, exitX, props };
```

(Keeping the key absent on normal floors keeps `toEqual`/JSON comparisons of other floors unchanged.)

New rules function before `levelViolations`:

```ts
/** Broken rules of the floor-2 puzzle. */
function boulderPuzzleProblems(layout: LevelLayout, puzzle: BoulderPuzzleLayout): string[] {
  const out: string[] = [];
  const { rail, wall }: { rail: Platform; wall: Platform } = puzzle;
  const size: number = GAME_CONSTANTS.BOULDER_SIZE_PX;
  const stopper: number = GAME_CONSTANTS.BOULDER_STOPPER_PX;
  if (wall.x !== 0 && wall.x + wall.width !== GAME_CONSTANTS.CANVAS_WIDTH) {
    out.push('wall: not at a screen edge');
  }
  if (wall.y !== 0 || wall.height !== GAME_CONSTANTS.GROUND_Y) {
    out.push('wall: does not span the screen top to the ground');
  }
  if (!layout.platforms.some((p: Platform): boolean => sameBox(p, rail))) out.push('rail: not a platform');
  if (rail.y !== GAME_CONSTANTS.LEVEL_TIER_Y[2]) out.push('rail: not on tier 3');
  if (rail.x < 0 || rail.x + rail.width > GAME_CONSTANTS.CANVAS_WIDTH) out.push('rail: off screen');
  const touches: boolean =
    puzzle.wallDir === 1 ? rail.x + rail.width === wall.x : rail.x === wall.x + wall.width;
  if (!touches) out.push('rail: does not reach the wall');
  if (puzzle.minBoulderX < rail.x || puzzle.maxBoulderX + size > rail.x + rail.width) {
    out.push('boulder: can leave the rail');
  }
  if (puzzle.boulderStartX < puzzle.minBoulderX || puzzle.boulderStartX > puzzle.maxBoulderX) {
    out.push('boulder: starts outside its stoppers');
  }
  const backRoom: number =
    puzzle.wallDir === 1
      ? puzzle.minBoulderX - stopper - rail.x
      : rail.x + rail.width - (puzzle.maxBoulderX + size + stopper);
  if (backRoom < 2 * GAME_CONSTANTS.LEVEL_TILE_PX) out.push('rail: no room behind the boulder');
  const hasLadder: boolean = layout.ropes.some(
    (r: Rope): boolean => r.topY === rail.y && r.x >= rail.x && r.x <= rail.x + rail.width,
  );
  if (!hasLadder) out.push('rail: no ladder');
  for (const p of layout.platforms) {
    if (p.x < wall.x + wall.width && p.x + p.width > wall.x) {
      out.push(`platform ${p.x},${p.y}: inside the wall`);
    }
  }
  for (const r of layout.ropes) {
    if (r.x >= wall.x - 16 && r.x <= wall.x + wall.width + 16) out.push(`rope at ${r.x}: inside the wall`);
  }
  return out;
}
```

In `levelViolations`:

1. At the top, after `const tiers ...`:

```ts
  const puzzle: BoulderPuzzleLayout | undefined = layout.boulderPuzzle;
  const puzzleFloor: boolean = layout.floor === GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR;
  if (puzzleFloor && !puzzle) out.push('puzzle floor without a boulder puzzle');
  if (!puzzleFloor && puzzle) out.push('boulder puzzle on a normal floor');
  if (puzzle) out.push(...boulderPuzzleProblems(layout, puzzle));
```

2. The platform exit-gap rule skips the rail (it runs to the wall by design). Change its condition to:

```ts
    if (
      tierIndex >= 0 &&
      !(puzzle && sameBox(p, puzzle.rail)) &&
      spanGap(p.x, p.x + p.width, exitLeft, exitRight) < exitGapFor(tierIndex)
    ) {
```

3. The rope "under the exit" rule only applies when there is a hanging exit. Change its `if` to start with `!puzzle &&`:

```ts
    if (
      !puzzle &&
      spanGap(r.x - 16, r.x + 16, exitLeft, exitRight) < GAME_CONSTANTS.LEVEL_EXIT_CLEARANCE_PX
    ) {
```

- [ ] **Step 7: Run the tests**

Run: `npm test -- --watch=false --include src/app/engine/level-generator.spec.ts`
Expected: PASS, including `'every generated floor obeys the layout rules'` over 200 seeds × 10 floors. If a seed breaks a puzzle rule, fix the generator (not the rule).

- [ ] **Step 8: Build both apps** (shared changed)

Run: `npm run build` then `cd zombie-blaster-api && npm run build`
Expected: both succeed.

- [ ] **Step 9: Checkpoint**

```bash
git add shared/game-constants.ts shared/game-entities.ts shared/multiplayer.ts src/app/engine/engine-types.ts src/app/engine/level-generator.ts src/app/engine/level-generator.spec.ts
```

---

### Task 2: Pure boulder rules

**Files:**
- Create: `src/app/engine/boulder-puzzle.ts`
- Test: `src/app/engine/boulder-puzzle.spec.ts`

**Interfaces:**
- Consumes: `BoulderPuzzleLayout`, `Platform` (engine-types), `BoulderState` (`@shared/game-entities`), `GAME_CONSTANTS`, `Direction`, `CharacterState`.
- Produces:
  - `interface Box { x: number; y: number; width: number; height: number }`
  - `boulderBox(boulder: BoulderState, puzzle: BoulderPuzzleLayout): Box`
  - `pushDirection(player: Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>, boulder: BoulderState, puzzle: BoulderPuzzleLayout): number` (1, -1 or 0)
  - `rollBoulder(boulder: BoulderState, puzzle: BoulderPuzzleLayout): boolean` (true = just hit the standing wall)
  - `interface CrushTarget { id: string; x: number; y: number; instanceWidth: number; instanceHeight: number; isDead: boolean }`
  - `crushTargets<T extends CrushTarget>(zombies: T[], box: Box, crushed: Set<string>): T[]`
  - `keepOutOfWall(x: number, width: number, wall: Platform | null): number`
  - `leavesThroughOpening(player: Pick<CharacterState, 'x' | 'y' | 'isGrounded'>, puzzle: BoulderPuzzleLayout, boulder: BoulderState): boolean`

- [ ] **Step 1: Write the failing tests** — `src/app/engine/boulder-puzzle.spec.ts`

```ts
import { describe, it, expect } from 'vitest';
import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { BoulderState } from '@shared/game-entities';
import { BoulderPuzzleLayout, Platform } from './engine-types';
import {
  Box,
  boulderBox,
  CrushTarget,
  crushTargets,
  keepOutOfWall,
  leavesThroughOpening,
  pushDirection,
  rollBoulder,
} from './boulder-puzzle';

const SIZE: number = GAME_CONSTANTS.BOULDER_SIZE_PX;
const PW: number = GAME_CONSTANTS.PLAYER_WIDTH;
const PH: number = GAME_CONSTANTS.PLAYER_HEIGHT;

/** Wall on the right: rail 640..1216 at y 330, wall 1216..1280. */
const PUZZLE: BoulderPuzzleLayout = {
  rail: { x: 640, y: 330, width: 576, height: 32 },
  wall: { x: 1216, y: 0, width: 64, height: GAME_CONSTANTS.GROUND_Y },
  wallDir: 1,
  minBoulderX: 712,
  maxBoulderX: 1160,
  boulderStartX: 776,
};

type Attacker = Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>;

function attacker(overrides: Partial<Attacker>): Attacker {
  return { x: 0, y: PUZZLE.rail.y - PH, facing: Direction.Right, isAttacking: true, isDead: false, isDown: false, ...overrides };
}

function boulderAt(x: number, velocityX: number = 0, wallBroken: boolean = false): BoulderState {
  return { x, velocityX, wallBroken };
}

describe('boulder rules', () => {
  it('the boulder box rests on the rail', (): void => {
    expect(boulderBox(boulderAt(800), PUZZLE)).toEqual({ x: 800, y: 330 - SIZE, width: SIZE, height: SIZE });
  });

  it('an attack from behind, facing the boulder, pushes it toward the wall', (): void => {
    const b: BoulderState = boulderAt(776);
    expect(pushDirection(attacker({ x: 776 - PW - 4, facing: Direction.Right }), b, PUZZLE)).toBe(1);
  });

  it('an attack from the wall side pushes it backward', (): void => {
    const b: BoulderState = boulderAt(776);
    expect(pushDirection(attacker({ x: 776 + SIZE + 4, facing: Direction.Left }), b, PUZZLE)).toBe(-1);
  });

  it('no push when facing away, too far, not attacking, downed, or on the ground under the rail', (): void => {
    const b: BoulderState = boulderAt(776);
    const behind: number = 776 - PW - 4;
    expect(pushDirection(attacker({ x: behind, facing: Direction.Left }), b, PUZZLE)).toBe(0);
    expect(pushDirection(attacker({ x: 776 - PW - 60 }), b, PUZZLE)).toBe(0);
    expect(pushDirection(attacker({ x: behind, isAttacking: false }), b, PUZZLE)).toBe(0);
    expect(pushDirection(attacker({ x: behind, isDown: true }), b, PUZZLE)).toBe(0);
    expect(pushDirection(attacker({ x: behind, isDead: true }), b, PUZZLE)).toBe(0);
    expect(
      pushDirection(attacker({ x: behind, y: GAME_CONSTANTS.GROUND_Y - PH }), b, PUZZLE),
    ).toBe(0);
  });

  it('a pushed boulder rolls, slows down and stops at the back stopper without leaving the rail', (): void => {
    const b: BoulderState = boulderAt(776, -GAME_CONSTANTS.BOULDER_PUSH_SPEED);
    for (let t: number = 0; t < 400; t++) expect(rollBoulder(b, PUZZLE)).toBe(false);
    expect(b.x).toBe(PUZZLE.minBoulderX);
    expect(b.velocityX).toBe(0);
  });

  it('rolling into the wall end reports the hit once, and stays on the rail', (): void => {
    const b: BoulderState = boulderAt(PUZZLE.minBoulderX, GAME_CONSTANTS.BOULDER_PUSH_SPEED);
    let hits: number = 0;
    for (let t: number = 0; t < 400; t++) if (rollBoulder(b, PUZZLE)) hits++;
    expect(hits).toBe(1);
    expect(b.x).toBe(PUZZLE.maxBoulderX);
    expect(b.velocityX).toBe(0);
  });

  it('no wall hit once the wall is broken; the wall-side stopper still holds it', (): void => {
    const b: BoulderState = boulderAt(1100, GAME_CONSTANTS.BOULDER_PUSH_SPEED, true);
    for (let t: number = 0; t < 100; t++) expect(rollBoulder(b, PUZZLE)).toBe(false);
    expect(b.x).toBe(PUZZLE.maxBoulderX);
  });

  it('mirrored puzzle (wall on the left): the wall end is minBoulderX', (): void => {
    const left: BoulderPuzzleLayout = {
      rail: { x: 64, y: 330, width: 576, height: 32 },
      wall: { x: 0, y: 0, width: 64, height: GAME_CONSTANTS.GROUND_Y },
      wallDir: -1,
      minBoulderX: 72,
      maxBoulderX: 520,
      boulderStartX: 456,
    };
    const b: BoulderState = boulderAt(left.maxBoulderX, -GAME_CONSTANTS.BOULDER_PUSH_SPEED);
    let hits: number = 0;
    for (let t: number = 0; t < 400; t++) if (rollBoulder(b, left)) hits++;
    expect(hits).toBe(1);
    expect(b.x).toBe(left.minBoulderX);
  });

  it('crushes each overlapping live zombie once per roll', (): void => {
    const box: Box = boulderBox(boulderAt(800), PUZZLE);
    const zombies: CrushTarget[] = [
      { id: 'a', x: 820, y: 290, instanceWidth: 30, instanceHeight: 40, isDead: false },
      { id: 'b', x: 1000, y: 290, instanceWidth: 30, instanceHeight: 40, isDead: false },
      { id: 'c', x: 810, y: 290, instanceWidth: 30, instanceHeight: 40, isDead: true },
      { id: 'd', x: 810, y: 580, instanceWidth: 30, instanceHeight: 40, isDead: false },
    ];
    const crushed: Set<string> = new Set<string>();
    expect(crushTargets(zombies, box, crushed).map((z: CrushTarget): string => z.id)).toEqual(['a']);
    crushed.add('a');
    expect(crushTargets(zombies, box, crushed)).toEqual([]);
  });

  it('keeps things out of a standing wall on either side', (): void => {
    const right: Platform = PUZZLE.wall;
    expect(keepOutOfWall(1230, 30, right)).toBe(1216 - 30);
    expect(keepOutOfWall(1100, 30, right)).toBe(1100);
    const left: Platform = { x: 0, y: 0, width: 64, height: GAME_CONSTANTS.GROUND_Y };
    expect(keepOutOfWall(10, 30, left)).toBe(64);
    expect(keepOutOfWall(10, 30, null)).toBe(10);
  });

  it('the opening only lets players out after the wall broke, on the ground', (): void => {
    const out: Pick<CharacterState, 'x' | 'y' | 'isGrounded'> = {
      x: 1240,
      y: GAME_CONSTANTS.GROUND_Y - PH,
      isGrounded: true,
    };
    expect(leavesThroughOpening(out, PUZZLE, boulderAt(1160, 0, false))).toBe(false);
    expect(leavesThroughOpening(out, PUZZLE, boulderAt(1160, 0, true))).toBe(true);
    expect(leavesThroughOpening({ ...out, isGrounded: false }, PUZZLE, boulderAt(1160, 0, true))).toBe(false);
    expect(leavesThroughOpening({ ...out, x: 1100 }, PUZZLE, boulderAt(1160, 0, true))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test -- --watch=false --include src/app/engine/boulder-puzzle.spec.ts`
Expected: FAIL, `Cannot find module './boulder-puzzle'`.

- [ ] **Step 3: Implement** `src/app/engine/boulder-puzzle.ts`

```ts
import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { BoulderState } from '@shared/game-entities';
import { BoulderPuzzleLayout, Platform } from './engine-types';

/**
 * Floor-2 boulder puzzle rules, free of engine state so the host system, the client and the tests
 * all use the same math. The boulder is not solid: players walk through it.
 */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CrushTarget {
  id: string;
  x: number;
  y: number;
  instanceWidth: number;
  instanceHeight: number;
  isDead: boolean;
}

export function boulderBox(boulder: BoulderState, puzzle: BoulderPuzzleLayout): Box {
  const size: number = GAME_CONSTANTS.BOULDER_SIZE_PX;
  return { x: boulder.x, y: puzzle.rail.y - size, width: size, height: size };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Which way an attacking player pushes the boulder: the way they face, when they are next to it
 * (within reach, level with it) and facing it. 0 = no push.
 */
export function pushDirection(
  player: Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>,
  boulder: BoulderState,
  puzzle: BoulderPuzzleLayout,
): number {
  if (!player.isAttacking || player.isDead || player.isDown) return 0;
  const box: Box = boulderBox(boulder, puzzle);
  const width: number = GAME_CONSTANTS.PLAYER_WIDTH;
  const height: number = GAME_CONSTANTS.PLAYER_HEIGHT;
  if (player.y + height <= box.y || player.y >= box.y + box.height) return 0;
  const gap: number = Math.max(0, Math.max(box.x - (player.x + width), player.x - (box.x + box.width)));
  if (gap > GAME_CONSTANTS.BOULDER_HIT_REACH_PX) return 0;
  const facing: number = player.facing === Direction.Right ? 1 : -1;
  const side: number = Math.sign(box.x + box.width / 2 - (player.x + width / 2));
  if (side !== 0 && side !== facing) return 0;
  return facing;
}

/**
 * One tick of rolling: moves, slows down, and stops at the stoppers (never off the rail).
 * Returns true when it just reached the wall end while rolling toward a still-standing wall.
 */
export function rollBoulder(boulder: BoulderState, puzzle: BoulderPuzzleLayout): boolean {
  if (boulder.velocityX === 0) return false;
  const dir: number = Math.sign(boulder.velocityX);
  boulder.x += boulder.velocityX;
  boulder.velocityX *= GAME_CONSTANTS.BOULDER_FRICTION;
  if (Math.abs(boulder.velocityX) < GAME_CONSTANTS.BOULDER_MIN_SPEED) boulder.velocityX = 0;
  const atMin: boolean = boulder.x <= puzzle.minBoulderX;
  const atMax: boolean = boulder.x >= puzzle.maxBoulderX;
  if (!atMin && !atMax) return false;
  boulder.x = atMin ? puzzle.minBoulderX : puzzle.maxBoulderX;
  boulder.velocityX = 0;
  const wallEnd: boolean = puzzle.wallDir === 1 ? atMax : atMin;
  return wallEnd && dir === puzzle.wallDir && !boulder.wallBroken;
}

/** Live zombies the boulder overlaps that it has not crushed yet this roll. */
export function crushTargets<T extends CrushTarget>(zombies: T[], box: Box, crushed: Set<string>): T[] {
  return zombies.filter(
    (z: T): boolean =>
      !z.isDead &&
      !crushed.has(z.id) &&
      overlaps(box, { x: z.x, y: z.y, width: z.instanceWidth, height: z.instanceHeight }),
  );
}

/** Moves a box (corpse, drop, spawn) out of the standing wall, to the wall's open side. */
export function keepOutOfWall(x: number, width: number, wall: Platform | null): number {
  if (!wall || x + width <= wall.x || x >= wall.x + wall.width) return x;
  return wall.x === 0 ? wall.width : wall.x - width;
}

/** A grounded player inside where the wall stood, after it broke, leaves the floor. */
export function leavesThroughOpening(
  player: Pick<CharacterState, 'x' | 'y' | 'isGrounded'>,
  puzzle: BoulderPuzzleLayout,
  boulder: BoulderState,
): boolean {
  if (!boulder.wallBroken || !player.isGrounded) return false;
  const wall: Platform = puzzle.wall;
  const inside: boolean = player.x + GAME_CONSTANTS.PLAYER_WIDTH > wall.x && player.x < wall.x + wall.width;
  return inside && player.y + GAME_CONSTANTS.PLAYER_HEIGHT >= GAME_CONSTANTS.GROUND_Y - 1;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- --watch=false --include src/app/engine/boulder-puzzle.spec.ts`
Expected: PASS. Then `npx prettier --write src/app/engine/boulder-puzzle.ts src/app/engine/boulder-puzzle.spec.ts`.

- [ ] **Step 5: Checkpoint**

```bash
git add src/app/engine/boulder-puzzle.ts src/app/engine/boulder-puzzle.spec.ts
```

---

### Task 3: Host simulation system and wall-break VFX

**Files:**
- Create: `src/app/engine/boulder-puzzle-system.ts`
- Modify: `src/app/engine/vfx-system.ts` (add `spawnWallBreak`)
- Modify: `src/app/engine/engine-types.ts` (`IGameEngine`)
- Modify: `src/app/engine/zombie-system.spec.ts:105` and `src/app/engine/multiplayer-sync.spec.ts:317` mock engines
- Test: added in Task 4 (needs the engine wiring)

**Interfaces:**
- Consumes: Task 2 functions; `CombatSystem.handleZombieDeath(z: ZombieState, awardRewards?: boolean)`; `VfxSystem.spawnDamageNumber/spawnHitParticles/addParticle/triggerScreenShake`.
- Produces:
  - `IGameEngine.boulder: BoulderState | null`, `IGameEngine.boulderPuzzle: BoulderPuzzleLayout | null`, `IGameEngine.breakPuzzleWall(): void`, `IGameEngine.puzzleWall(): Platform | null`
  - `class BoulderPuzzleSystem { constructor(e: IGameEngine, combat: CombatSystem, vfx: VfxSystem); update(): void; tickClient(): void }`
  - `VfxSystem.spawnWallBreak(cx: number, impactY: number): void`

- [ ] **Step 1: Extend `IGameEngine`** (in `engine-types.ts`, after `exitPlatform: Platform;`; add `BoulderState` to the `@shared/game-entities` import)

```ts
  /** Floor-2 puzzle layout and its boulder (null on other floors). */
  boulderPuzzle: BoulderPuzzleLayout | null;
  boulder: BoulderState | null;
```

and after `isInSafeSpot(...)`:

```ts
  /** Removes the puzzle wall (collision + art) for good on this floor. */
  breakPuzzleWall(): void;
  /** The puzzle wall while it still stands, else null. */
  puzzleWall(): Platform | null;
```

Update both mock engines (`makeMockEngine` in `zombie-system.spec.ts` and `multiplayer-sync.spec.ts`): add

```ts
    boulderPuzzle: null,
    boulder: null,
    breakPuzzleWall: vi.fn(),
    puzzleWall: vi.fn((): Platform | null => null),
```

- [ ] **Step 2: Add `spawnWallBreak`** to `VfxSystem` (after `spawnHitMark`; import `GAME_CONSTANTS` is already there — check, add if not)

```ts
  /** Stone debris down the whole wall, a dust cloud at the impact, and a heavy shake. */
  spawnWallBreak(cx: number, impactY: number): void {
    const stones: string[] = ['#6b6b78', '#8a8a96', '#4a4a55', '#a89c88'];
    for (let i: number = 0; i < 60; i++) {
      const life: number = 50 + Math.floor(Math.random() * 30);
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 64,
        y: Math.random() * GAME_CONSTANTS.GROUND_Y,
        vx: (Math.random() - 0.5) * 8,
        vy: -2 - Math.random() * 5,
        life,
        maxLife: life,
        color: stones[i % stones.length],
        size: 3 + Math.random() * 6,
        shape: ParticleShape.Square,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        fadeMode: FadeMode.Late,
        scaleOverLife: false,
      });
    }
    for (let i: number = 0; i < 24; i++) {
      const life: number = 40 + Math.floor(Math.random() * 20);
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 80,
        y: impactY - Math.random() * 40,
        vx: (Math.random() - 0.5) * 3,
        vy: -0.5 - Math.random(),
        life,
        maxLife: life,
        color: 'rgba(190, 180, 160, 0.7)',
        size: 10 + Math.random() * 14,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: true,
      });
    }
    this.triggerScreenShake(24, 10);
  }
```

(Import `ParticleShape, FadeMode` from `./particle-types` if `vfx-system.ts` doesn't already.)

- [ ] **Step 3: Write the system** — `src/app/engine/boulder-puzzle-system.ts`

```ts
import { CharacterState, GAME_CONSTANTS, VfxEventType } from '@shared/index';
import { BoulderState, ZombieState } from '@shared/game-entities';
import { BoulderPuzzleLayout, IGameEngine, Platform } from './engine-types';
import { CombatSystem } from './combat-system';
import { VfxSystem } from './vfx-system';
import { Box, boulderBox, crushTargets, pushDirection, rollBoulder } from './boulder-puzzle';

/**
 * Floor-2 boulder puzzle. The host (or solo) turns any player's attack next to the boulder into a
 * push, rolls it, crushes zombies in its path and breaks the wall. Clients only extrapolate the
 * synced roll between snapshots; the wall breaks for them when a snapshot says so.
 */
export class BoulderPuzzleSystem {
  private hitCooldown: number = 0;
  /** Zombies already crushed by the current roll (cleared on every push). */
  private readonly crushed: Set<string> = new Set<string>();

  constructor(
    private readonly e: IGameEngine,
    private readonly combat: CombatSystem,
    private readonly vfx: VfxSystem,
  ) {}

  update(): void {
    const puzzle: BoulderPuzzleLayout | null = this.e.boulderPuzzle;
    const boulder: BoulderState | null = this.e.boulder;
    if (!puzzle || !boulder) return;
    if (this.hitCooldown > 0) this.hitCooldown--;
    else this.applyHits(puzzle, boulder);
    if (rollBoulder(boulder, puzzle)) this.breakWall(puzzle);
    if (boulder.velocityX !== 0) this.crushZombies(puzzle, boulder);
  }

  tickClient(): void {
    const puzzle: BoulderPuzzleLayout | null = this.e.boulderPuzzle;
    const boulder: BoulderState | null = this.e.boulder;
    if (puzzle && boulder) rollBoulder(boulder, puzzle);
  }

  private applyHits(puzzle: BoulderPuzzleLayout, boulder: BoulderState): void {
    const players: CharacterState[] = [
      ...(this.e.player ? [this.e.player] : []),
      ...this.e.remotePlayers,
    ];
    for (const p of players) {
      const dir: number = pushDirection(p, boulder, puzzle);
      if (dir === 0) continue;
      boulder.velocityX = dir * GAME_CONSTANTS.BOULDER_PUSH_SPEED;
      this.hitCooldown = GAME_CONSTANTS.BOULDER_HIT_COOLDOWN_TICKS;
      this.crushed.clear();
      const box: Box = boulderBox(boulder, puzzle);
      const hitX: number = dir === 1 ? box.x : box.x + box.width;
      const hitY: number = box.y + box.height / 2;
      this.vfx.spawnHitParticles(hitX, hitY, '#c8b89a');
      this.e.pendingVfxEvents.push({
        type: VfxEventType.HitParticles,
        playerId: this.e.player?.id ?? '',
        x: hitX,
        y: hitY,
        color: '#c8b89a',
      });
      return;
    }
  }

  private breakWall(puzzle: BoulderPuzzleLayout): void {
    const wall: Platform = puzzle.wall;
    const cx: number = wall.x + wall.width / 2;
    this.e.breakPuzzleWall();
    this.vfx.spawnWallBreak(cx, puzzle.rail.y);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.WallBreak,
      playerId: this.e.player?.id ?? '',
      x: cx,
      y: puzzle.rail.y,
    });
  }

  private crushZombies(puzzle: BoulderPuzzleLayout, boulder: BoulderState): void {
    const dir: number = Math.sign(boulder.velocityX);
    const hit: ZombieState[] = crushTargets(this.e.zombies, boulderBox(boulder, puzzle), this.crushed);
    for (const z of hit) {
      this.crushed.add(z.id);
      const damage: number = Math.max(
        1,
        Math.ceil((z.maxHp * GAME_CONSTANTS.BOULDER_CRUSH_DAMAGE_PERCENT) / 100),
      );
      z.hp -= damage;
      if (!z.magnetPull) {
        z.velocityX = dir * GAME_CONSTANTS.KNOCKBACK_FORCE_ZOMBIE;
        z.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
        z.isGrounded = false;
        z.knockbackFrames = GAME_CONSTANTS.KNOCKBACK_ZOMBIE_FRAMES;
      }
      const cx: number = z.x + z.instanceWidth / 2;
      const cy: number = z.y + z.instanceHeight / 2;
      this.vfx.spawnHitParticles(cx, cy, '#c8b89a');
      this.vfx.spawnDamageNumber(cx, z.y - 10, damage, false, '#ffcc66');
      const playerId: string = this.e.player?.id ?? '';
      this.e.pendingVfxEvents.push(
        { type: VfxEventType.HitParticles, playerId, x: cx, y: cy, color: '#c8b89a' },
        { type: VfxEventType.DamageNumber, playerId, x: cx, y: z.y - 10, value: damage, isCrit: false, color: '#ffcc66' },
      );
      if (z.hp <= 0) this.combat.handleZombieDeath(z);
    }
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm test -- --watch=false --include src/app/engine/zombie-system.spec.ts`
Expected: PASS (mocks compile with the new `IGameEngine` members). `GameEngine` itself won't compile until Task 4, so run Task 4 before a full build.

- [ ] **Step 5: Checkpoint**

```bash
git add src/app/engine/boulder-puzzle-system.ts src/app/engine/vfx-system.ts src/app/engine/engine-types.ts src/app/engine/zombie-system.spec.ts src/app/engine/multiplayer-sync.spec.ts
```

---

### Task 4: Engine wiring, sync and keep-out rules

**Files:**
- Modify: `src/app/engine/game-engine.ts` (fields ~line 112, constructor ~205, `applyLevel` 243, `repositionExitPlatform` 269, `update` 427, `getStateSnapshot` 732, `replayRemoteVfxEvents` 900, new `applyRemoteBoulder`, `breakPuzzleWall`, `puzzleWall`)
- Modify: `src/app/engine/zombie-system.ts` (`pickSpawnSpot` 877, `updateZombieCorpses` ~1073, `checkFloorCompletion` 977)
- Modify: `src/app/engine/drop-system.ts` (drop loop ~133)
- Modify: `src/app/engine/map-renderer.ts` (`setLevel` signature only here; art in Task 5)
- Modify: `src/app/components/game-canvas/game-canvas.component.ts`, `src/app/pages/game/game.component.ts`
- Test: `src/app/engine/multiplayer-sync.spec.ts`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: `GameEngine.applyRemoteBoulder(state: BoulderState | null): void`; snapshot field `boulder: BoulderState | null`; `MapRenderer.setLevel(platforms: Platform[], ropes: Rope[], props: Prop[], puzzle: BoulderPuzzleLayout | null, wallStanding: boolean): void`; `GameCanvasComponent.applyRemoteBoulder(state: BoulderState | null): void`.

- [ ] **Step 1: Write the failing engine tests** — append to `src/app/engine/multiplayer-sync.spec.ts` (imports: `BoulderPuzzleSystem` from `./boulder-puzzle-system`, `BoulderState` from `@shared/game-entities`; `GameEngine`, `CombatSystem`, `PhysicsSystem`, `VfxSystem`, `DropSystem`, `VfxEventType`, `Direction`, `GAME_CONSTANTS` are already imported)

```ts
describe('Boulder puzzle (floor 2)', () => {
  let engine: GameEngine;

  function systemFor(e: GameEngine): BoulderPuzzleSystem {
    const physics: PhysicsSystem = new PhysicsSystem(e);
    const vfx: VfxSystem = new VfxSystem(e);
    const drops: DropSystem = new DropSystem(e, physics, vfx);
    return new BoulderPuzzleSystem(e, new CombatSystem(e, physics, vfx, drops), vfx);
  }

  /** x that puts a player right next to the boulder: behind it (away from the wall) or on the wall side. */
  function besideBoulder(e: GameEngine, side: 'behind' | 'wall-side'): { x: number; facing: Direction } {
    const dir: number = e.boulderPuzzle!.wallDir;
    const offset: number = side === 'behind' ? -dir : dir;
    const x: number = offset === 1
      ? e.boulder!.x + GAME_CONSTANTS.BOULDER_SIZE_PX + 4
      : e.boulder!.x - GAME_CONSTANTS.PLAYER_WIDTH - 4;
    return { x, facing: -offset === 1 ? Direction.Right : Direction.Left };
  }

  beforeEach(() => {
    engine = new GameEngine(createMockCanvas());
    engine.player = makePlayer();
    engine.setFloor(GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR);
  });

  it('floor 2 has a solid breakable wall, a boulder at its start, and no hanging exit on screen', () => {
    expect(engine.boulderPuzzle).not.toBeNull();
    expect(engine.boulder).toEqual({ x: engine.boulderPuzzle!.boulderStartX, velocityX: 0, wallBroken: false });
    expect(engine.platforms.filter((p: Platform): boolean => p.breakable === true)).toHaveLength(1);
    expect(engine.puzzleWall()).toEqual(engine.boulderPuzzle!.wall);
    expect(engine.exitPlatform.x + engine.exitPlatform.width).toBeLessThan(0);
  });

  it('a hit from behind rolls the boulder into the wall: wall gone, boulder at the wall stopper, WallBreak queued', () => {
    const sys: BoulderPuzzleSystem = systemFor(engine);
    const spot: { x: number; facing: Direction } = besideBoulder(engine, 'behind');
    engine.player = makePlayer({ x: spot.x, y: engine.boulderPuzzle!.rail.y - GAME_CONSTANTS.PLAYER_HEIGHT, facing: spot.facing, isAttacking: true });
    for (let t: number = 0; t < 300; t++) sys.update();
    const puzzle: NonNullable<GameEngine['boulderPuzzle']> = engine.boulderPuzzle!;
    expect(engine.boulder!.wallBroken).toBe(true);
    expect(engine.boulder!.x).toBe(puzzle.wallDir === 1 ? puzzle.maxBoulderX : puzzle.minBoulderX);
    expect(engine.platforms.some((p: Platform): boolean => p.breakable === true)).toBe(false);
    expect(engine.puzzleWall()).toBeNull();
    expect(engine.pendingVfxEvents.some((e: VfxEvent): boolean => e.type === VfxEventType.WallBreak)).toBe(true);
  });

  it('a hit from the wall side pushes it back to the back stopper; the wall stands', () => {
    const sys: BoulderPuzzleSystem = systemFor(engine);
    const spot: { x: number; facing: Direction } = besideBoulder(engine, 'wall-side');
    engine.player = makePlayer({ x: spot.x, y: engine.boulderPuzzle!.rail.y - GAME_CONSTANTS.PLAYER_HEIGHT, facing: spot.facing, isAttacking: true });
    for (let t: number = 0; t < 300; t++) sys.update();
    const puzzle: NonNullable<GameEngine['boulderPuzzle']> = engine.boulderPuzzle!;
    expect(engine.boulder!.x).toBe(puzzle.wallDir === 1 ? puzzle.minBoulderX : puzzle.maxBoulderX);
    expect(engine.boulder!.wallBroken).toBe(false);
    expect(engine.puzzleWall()).not.toBeNull();
  });

  it("the host pushes the boulder for a guest's attack", () => {
    engine.isMultiplayerHost = true;
    const sys: BoulderPuzzleSystem = systemFor(engine);
    const spot: { x: number; facing: Direction } = besideBoulder(engine, 'behind');
    engine.remotePlayers = [makePlayer({ id: 'guest', x: spot.x, y: engine.boulderPuzzle!.rail.y - GAME_CONSTANTS.PLAYER_HEIGHT, facing: spot.facing, isAttacking: true })];
    for (let t: number = 0; t < 300; t++) sys.update();
    expect(engine.boulder!.wallBroken).toBe(true);
  });

  it('a rolling boulder crushes a zombie in its path once', () => {
    const sys: BoulderPuzzleSystem = systemFor(engine);
    const puzzle: NonNullable<GameEngine['boulderPuzzle']> = engine.boulderPuzzle!;
    const ahead: number = engine.boulder!.x + puzzle.wallDir * 120;
    const zombie: ZombieState = makeZombie({ id: 'z-rail', x: ahead, y: puzzle.rail.y - 40, hp: 1000, maxHp: 1000, instanceWidth: 30, instanceHeight: 40 });
    engine.zombies = [zombie];
    engine.boulder!.velocityX = puzzle.wallDir * GAME_CONSTANTS.BOULDER_PUSH_SPEED;
    for (let t: number = 0; t < 40; t++) sys.update();
    expect(zombie.hp).toBe(1000 - Math.ceil(1000 * GAME_CONSTANTS.BOULDER_CRUSH_DAMAGE_PERCENT / 100));
  });

  it('a client applies the synced boulder: clamped onto the rail, NaN ignored, wall removed once broken', () => {
    engine.isMultiplayerClient = true;
    const puzzle: NonNullable<GameEngine['boulderPuzzle']> = engine.boulderPuzzle!;
    engine.applyRemoteBoulder({ x: 99_999, velocityX: 500, wallBroken: false });
    expect(engine.boulder!.x).toBe(puzzle.maxBoulderX);
    expect(Math.abs(engine.boulder!.velocityX)).toBeLessThanOrEqual(GAME_CONSTANTS.BOULDER_PUSH_SPEED);
    engine.applyRemoteBoulder({ x: Number.NaN, velocityX: 0, wallBroken: false });
    expect(engine.boulder!.x).toBe(puzzle.maxBoulderX);
    expect(engine.puzzleWall()).not.toBeNull();
    engine.applyRemoteBoulder({ x: puzzle.minBoulderX, velocityX: 0, wallBroken: true });
    expect(engine.puzzleWall()).toBeNull();
    expect(engine.platforms.some((p: Platform): boolean => p.breakable === true)).toBe(false);
  });

  it('replaying a WallBreak event spawns debris and shakes the screen', () => {
    engine.replayRemoteVfxEvents([{ type: VfxEventType.WallBreak, playerId: 'host', x: 1248, y: 330 }]);
    expect(engine.particles.length).toBeGreaterThan(0);
    expect(engine.screenShakeFrames).toBeGreaterThan(0);
  });

  it('the snapshot carries the boulder', () => {
    expect(engine.getStateSnapshot()!.boulder).toEqual(engine.boulder);
  });

  it('floor 3 has no puzzle, no wall, and the hanging exit is back on screen', () => {
    engine.breakPuzzleWall();
    engine.setFloor(GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR + 1);
    expect(engine.boulderPuzzle).toBeNull();
    expect(engine.boulder).toBeNull();
    expect(engine.puzzleWall()).toBeNull();
    expect(engine.exitPlatform.x).toBeGreaterThanOrEqual(0);
  });
});
```

Also add a corpse keep-out test to `src/app/engine/zombie-system.spec.ts` inside `describe('ZombieSystem — corpse falling physics', ...)` (follow how that block builds `engine` and `zombieSystem`):

```ts
  it('a corpse flung into the standing puzzle wall lands outside it', () => {
    const wall: Platform = { x: 1216, y: 0, width: 64, height: GAME_CONSTANTS.GROUND_Y, solid: true, breakable: true };
    engine.puzzleWall = vi.fn((): Platform | null => wall);
    engine.zombieCorpses = [makeCorpse({ x: 1180, y: 500, velocityX: 12 })];
    for (let t: number = 0; t < 120; t++) zombieSystem.updateZombieCorpses();
    const corpse: ZombieCorpse = engine.zombieCorpses[0];
    expect(corpse.x + corpse.width).toBeLessThanOrEqual(wall.x);
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- --watch=false --include src/app/engine/multiplayer-sync.spec.ts`
Expected: FAIL (compile errors: `boulderPuzzle`, `applyRemoteBoulder`, `breakPuzzleWall` missing on `GameEngine`).

- [ ] **Step 3: Wire the engine** (`game-engine.ts`)

Imports: add `BoulderState` to the `@shared/game-entities` import; `BoulderPuzzleLayout` to the `./engine-types` import; `import { BoulderPuzzleSystem } from './boulder-puzzle-system';`.

Module constant next to `INTERPOLATION_TICKS`:

```ts
/** On the puzzle floor the hanging exit is parked far off screen: nothing can touch or see it. */
const PARKED_EXIT_X: number = -10_000;
```

Fields after `exitPlatform`:

```ts
  boulderPuzzle: BoulderPuzzleLayout | null = null;
  boulder: BoulderState | null = null;
```

System field next to the others: `private readonly boulderPuzzleSystem: BoulderPuzzleSystem;` and in the constructor after `this.zombieSystem = ...`:

```ts
    this.boulderPuzzleSystem = new BoulderPuzzleSystem(this, this.combatSystem, this.vfxSystem);
```

Replace `applyLevel()`:

```ts
  applyLevel(): void {
    this.level = generateLevel(this.layoutSeed, this.floor);
    this.boulderPuzzle = this.level.boulderPuzzle ?? null;
    this.boulder = this.boulderPuzzle
      ? { x: this.boulderPuzzle.boulderStartX, velocityX: 0, wallBroken: false }
      : null;
    this.platforms = [
      { ...GROUND_PLATFORM },
      ...this.level.platforms.map((p: Platform): Platform => ({ ...p })),
      // Props are solid: you stand on their tops and bump into their sides.
      ...this.level.props.map(
        (p: Prop): Platform => ({ x: p.x, y: p.y, width: p.width, height: p.height, solid: true }),
      ),
      ...(this.boulderPuzzle ? [{ ...this.boulderPuzzle.wall, solid: true, breakable: true }] : []),
    ];
    this.ropes = this.level.ropes.map((r: Rope): Rope => ({ ...r }));
    this.mapRenderer.setLevel(this.level.platforms, this.level.ropes, this.level.props, this.boulderPuzzle, true);
    this.repositionExitPlatform();
  }

  breakPuzzleWall(): void {
    if (!this.boulderPuzzle || !this.boulder || this.boulder.wallBroken) return;
    this.boulder.wallBroken = true;
    this.platforms = this.platforms.filter((p: Platform): boolean => p.breakable !== true);
    this.mapRenderer.setLevel(this.level.platforms, this.level.ropes, this.level.props, this.boulderPuzzle, false);
  }

  puzzleWall(): Platform | null {
    return this.boulderPuzzle && this.boulder && !this.boulder.wallBroken ? this.boulderPuzzle.wall : null;
  }
```

In `repositionExitPlatform()`, replace the x line:

```ts
    this.exitPlatform.x = this.boulderPuzzle ? PARKED_EXIT_X : this.level.exitX;
```

In `update()`: inside `if (!this.isMultiplayerClient) {` after `this.zombieSystem.updateZombies();` add `this.boulderPuzzleSystem.update();`; inside the `else {` branch after `this.tickClientZombieVisuals();` add `this.boulderPuzzleSystem.tickClient();`.

`getStateSnapshot()`: add `boulder: BoulderState | null;` to the return type (after `layoutSeed: number;`) and to the returned object after `layoutSeed: this.layoutSeed,`:

```ts
      boulder: this.boulder ? { ...this.boulder } : null,
```

The probe wraps this method with its own `EngineSnapshot` type alias in `e2e-hooks.ts`; if that alias is written out by hand, add the same field there.

New method after `syncRemoteFloor`:

```ts
  /** Clients follow the host's boulder: always clamped onto the rail, and the wall breaks once. */
  applyRemoteBoulder(state: BoulderState | null): void {
    if (!this.isMultiplayerClient || !this.boulderPuzzle || !this.boulder || !state) return;
    if (!Number.isFinite(state.x) || !Number.isFinite(state.velocityX)) return;
    const puzzle: BoulderPuzzleLayout = this.boulderPuzzle;
    const maxSpeed: number = GAME_CONSTANTS.BOULDER_PUSH_SPEED;
    this.boulder.x = Math.min(puzzle.maxBoulderX, Math.max(puzzle.minBoulderX, state.x));
    this.boulder.velocityX = Math.min(maxSpeed, Math.max(-maxSpeed, state.velocityX));
    if (state.wallBroken === true) this.breakPuzzleWall();
  }
```

In `replayRemoteVfxEvents`, add a case after `MagicTwinSpawn`:

```ts
        case VfxEventType.WallBreak:
          this.vfxSystem.spawnWallBreak(evt.x, evt.y);
          break;
```

- [ ] **Step 4: Floor completion, spawns, corpses, drops**

`zombie-system.ts`: import `{ keepOutOfWall, leavesThroughOpening } from './boulder-puzzle'` and `BoulderPuzzleLayout` from `./engine-types`, `BoulderState` from `@shared/game-entities`.

In `checkFloorCompletion`, after `const exit: Platform = this.e.exitPlatform;`:

```ts
    const puzzle: BoulderPuzzleLayout | null = this.e.boulderPuzzle;
    const boulder: BoulderState | null = this.e.boulder;
```

and replace `if (onExitPlatform) {` with:

```ts
      const leaves: boolean = puzzle && boulder ? leavesThroughOpening(c, puzzle, boulder) : onExitPlatform;
      if (leaves) {
```

In `pickSpawnSpot`, replace the returned `x` with:

```ts
      x: keepOutOfWall(
        platMinX + Math.floor(Math.random() * (platMaxX - platMinX + 1)),
        width,
        this.e.puzzleWall(),
      ),
```

In `updateZombieCorpses`, right after the two screen-edge clamps (`if (corpse.x > maxCX) {...}`):

```ts
        const outside: number = keepOutOfWall(corpse.x, corpse.width, this.e.puzzleWall());
        if (outside !== corpse.x) {
          corpse.x = outside;
          corpse.velocityX = 0;
        }
```

`drop-system.ts`: import `keepOutOfWall` from `./boulder-puzzle`. In the drop loop, right before `drop.lifetime--;`:

```ts
      drop.x = keepOutOfWall(drop.x, size, this.e.puzzleWall());
```

- [ ] **Step 5: `MapRenderer.setLevel` signature** (art comes in Task 5)

```ts
  private puzzle: BoulderPuzzleLayout | null = null;
  private wallStanding: boolean = false;

  /** Sets the floor's platforms (ground excluded), ropes, props and puzzle, and redraws the geometry layer. */
  setLevel(
    platforms: Platform[],
    ropes: Rope[],
    props: Prop[],
    puzzle: BoulderPuzzleLayout | null,
    wallStanding: boolean,
  ): void {
    this.platforms = platforms.map((p: Platform): Platform => ({ ...p }));
    this.ropes = ropes.map((r: Rope): Rope => ({ ...r }));
    this.props = props.map((p: Prop): Prop => ({ ...p }));
    this.puzzle = puzzle;
    this.wallStanding = wallStanding;
    if (this.loaded) this.composeGeometry();
  }
```

(Import `BoulderPuzzleLayout` from `./engine-types`.)

- [ ] **Step 6: Carry the boulder through game-sync**

`game-canvas.component.ts`, next to `applyRemoteCorpses`:

```ts
  applyRemoteBoulder(state: BoulderState | null): void {
    this.engine?.applyRemoteBoulder(state);
  }
```

(import `BoulderState` from `@shared/game-entities`.)

`game.component.ts`:
- In the GameSync receive payload type (both copies on lines ~164-165), add `boulder?: BoulderState | null;`.
- After `this.gameCanvas()?.syncRemoteFloor(payload.floor);` add `this.gameCanvas()?.applyRemoteBoulder(payload.boulder ?? null);` (floor first: a new floor rebuilds the puzzle before the state lands on it).
- In the outgoing `snapshot` type (~line 285), add `boulder: BoulderState | null;` after `layoutSeed: number;`.
- Import `BoulderState` from `@shared/game-entities`.

Server: no change (`isStateSnapshotPayload` relays any object; `handleGameSync` only checks the sender is host).

- [ ] **Step 7: Run the unit suite**

Run: `npm test -- --watch=false`
Expected: all PASS.

- [ ] **Step 8: Build**

Run: `npm run build` then `cd zombie-blaster-api && npm run build`
Expected: both succeed.

- [ ] **Step 9: Checkpoint**

```bash
git add src/app/engine src/app/components/game-canvas/game-canvas.component.ts src/app/pages/game/game.component.ts
```

---

### Task 5: Art — wall, rail tracks, boulder, stoppers, opening sign

**Files:**
- Modify: `src/app/engine/map-renderer.ts` (`composeGeometry`, new `drawPuzzleWall`, `drawRailTracks`)
- Modify: `src/app/engine/render-system.ts` (render order line ~78, `renderExitPlatform` 1651, new `renderBoulderPuzzle`)
- Modify: `src/app/testing/geometry-report.ts`
- Test: `e2e/specs/solo/level-geometry.spec.ts` (existing, covers floor 2 already), `e2e/specs/online/level-sync.spec.ts`

**Interfaces:**
- Consumes: `MapRenderer.puzzle`/`wallStanding` (Task 4), `IGameEngine.boulderPuzzle/boulder/puzzleWall()`.
- Produces: `MapRenderer.drawPuzzleWall(ctx: CanvasRenderingContext2D, wall: Platform): void`, `MapRenderer.drawRailTracks(ctx: CanvasRenderingContext2D, rail: Platform): void`.

- [ ] **Step 1: Geometry-layer art** in `map-renderer.ts`

In `composeGeometry()`, after the platform loop:

```ts
    if (this.puzzle) {
      this.drawRailTracks(ctx, this.puzzle.rail);
      if (this.wallStanding) this.drawPuzzleWall(ctx, this.puzzle.wall);
    }
```

New methods (after `drawProp`):

```ts
  /** Steel rails and sleepers drawn inside the rail platform's tile row (its top edge is unchanged). */
  drawRailTracks(ctx: CanvasRenderingContext2D, rail: Platform): void {
    ctx.save();
    ctx.fillStyle = '#3b2a1c';
    for (let x: number = rail.x + 4; x < rail.x + rail.width - 4; x += 16) {
      ctx.fillRect(x, rail.y + 5, 8, 4);
    }
    ctx.fillStyle = '#9aa4ad';
    ctx.fillRect(rail.x, rail.y + 1, rail.width, 2);
    ctx.fillRect(rail.x, rail.y + 9, rail.width, 2);
    ctx.restore();
  }

  /** The cracked stone wall: tiles over its whole box, the open-side column using the edge tile. */
  drawPuzzleWall(ctx: CanvasRenderingContext2D, wall: Platform): void {
    const cols: number = Math.round(wall.width / TILE_SIZE);
    const rows: number = Math.ceil(wall.height / TILE_SIZE);
    const faceCol: number = wall.x === 0 ? cols - 1 : 0;
    const faceTile: number = wall.x === 0 ? GROUND_BLOCK.mr : GROUND_BLOCK.ml;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wall.x, wall.y, wall.width, wall.height);
    ctx.clip();
    for (let row: number = 0; row < rows; row++) {
      for (let col: number = 0; col < cols; col++) {
        const tileId: number = col === faceCol ? faceTile : GROUND_BLOCK.mc;
        this.drawTile(ctx, tileId, wall.x + col * TILE_SIZE, wall.y + row * TILE_SIZE);
      }
    }
    // Cracks: a hint that it can break.
    ctx.strokeStyle = 'rgba(10, 10, 15, 0.8)';
    ctx.lineWidth = 2;
    const faceX: number = wall.x === 0 ? wall.x + wall.width - 6 : wall.x + 6;
    const inward: number = wall.x === 0 ? -1 : 1;
    for (let y: number = 120; y < wall.height; y += 140) {
      ctx.beginPath();
      ctx.moveTo(faceX, y);
      ctx.lineTo(faceX + inward * 14, y + 22);
      ctx.lineTo(faceX + inward * 6, y + 44);
      ctx.lineTo(faceX + inward * 22, y + 70);
      ctx.stroke();
    }
    ctx.restore();
  }
```

- [ ] **Step 2: Per-frame art** in `render-system.ts`

At the start of `renderExitPlatform`: `if (this.e.boulderPuzzle) return;`

Add `this.renderBoulderPuzzle(ctx);` right after `this.renderSafeSpotMarker(ctx);` in `render()`.

New method next to `renderSafeSpotMarker` (import `BoulderPuzzleLayout` from `./engine-types` and `BoulderState` from `@shared/game-entities` if not present):

```ts
  /**
   * The boulder (rolling: it spins with distance), the wooden stoppers at both ends of its travel,
   * and an EXIT sign at the opening once the wall is gone. Drawn per frame; nothing here is walkable.
   */
  private renderBoulderPuzzle(ctx: CanvasRenderingContext2D): void {
    const puzzle: BoulderPuzzleLayout | null = this.e.boulderPuzzle;
    const boulder: BoulderState | null = this.e.boulder;
    if (!puzzle || !boulder) return;
    const size: number = GAME_CONSTANTS.BOULDER_SIZE_PX;
    const stopper: number = GAME_CONSTANTS.BOULDER_STOPPER_PX;
    const r: number = size / 2;
    const railY: number = puzzle.rail.y;

    ctx.save();
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(puzzle.minBoulderX - stopper, railY - 12, stopper, 12);
    ctx.fillRect(puzzle.maxBoulderX + size, railY - 12, stopper, 12);

    const cx: number = boulder.x + r;
    const cy: number = railY - r;
    ctx.translate(cx, cy);
    ctx.rotate(boulder.x / r);
    const stone: CanvasGradient = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
    stone.addColorStop(0, '#a3a0a8');
    stone.addColorStop(1, '#4d4a55');
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 20, 25, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.1);
    ctx.lineTo(-r * 0.1, r * 0.2);
    ctx.lineTo(r * 0.4, -r * 0.3);
    ctx.moveTo(-r * 0.1, r * 0.2);
    ctx.lineTo(0, r * 0.7);
    ctx.stroke();
    ctx.restore();

    if (boulder.wallBroken) {
      const wall: Platform = puzzle.wall;
      const t: number = performance.now() / 1000;
      const signX: number = wall.x + wall.width / 2;
      const signY: number = GAME_CONSTANTS.GROUND_Y - 70;
      ctx.save();
      ctx.globalAlpha = 0.6 + Math.sin(t * 2) * 0.2;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', signX, signY);
      ctx.fillStyle = '#44ddff';
      const dir: number = puzzle.wallDir;
      for (let i: number = 0; i < 3; i++) {
        const ax: number = signX - dir * 12 + dir * i * 12 + Math.sin(t * 3 + i) * 2;
        ctx.beginPath();
        ctx.moveTo(ax + dir * 8, signY + 18);
        ctx.lineTo(ax, signY + 10);
        ctx.lineTo(ax, signY + 26);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }
```

- [ ] **Step 3: Geometry report knows the puzzle** (`geometry-report.ts`)

- Only measure the hanging exit when there is no puzzle: wrap the exit `Measured` entry as `...(engine.boulderPuzzle ? [] : [ { object: `exit ...`, ... } ])`, and only draw the exit into `frame` when `!engine.boulderPuzzle`.
- Props loop: change the filter to `(p: Platform): boolean => p.solid === true && p.breakable !== true`.
- Add the wall as a prop-style object (art in every column of its box):

```ts
    ...(engine.puzzleWall()
      ? [
          {
            object: `wall ${engine.puzzleWall()!.x},${engine.puzzleWall()!.y}`,
            kind: 'prop' as const,
            x: engine.puzzleWall()!.x,
            y: engine.puzzleWall()!.y,
            width: engine.puzzleWall()!.width,
            height: engine.puzzleWall()!.height,
            draw: (ctx: CanvasRenderingContext2D): void => renderer.drawPuzzleWall(ctx, engine.puzzleWall()!),
          },
        ]
      : []),
```

(Assign `const wall: Platform | null = engine.puzzleWall();` once at the top and use `wall` instead of repeated calls.)

Rail tracks sit inside the rail platform's box, so they are neither stray pixels nor a new object.

- [ ] **Step 4: Run the geometry and sync e2e specs** (start the dev server per the `game-e2e` skill if the suite doesn't)

Run: `npx playwright test e2e/specs/solo/level-geometry.spec.ts e2e/specs/online/level-sync.spec.ts`
Expected: PASS for all floors 1-6 (floor 2 now checks rail + wall, no exit). Open the attached `floor 2` canvas screenshot and confirm: wall at the edge, tracks on the rail, boulder resting two tiles in from the back stopper.

- [ ] **Step 5: Checkpoint**

```bash
git add src/app/engine/map-renderer.ts src/app/engine/render-system.ts src/app/testing/geometry-report.ts
```

---

### Task 6: Probe + E2E coverage (solo and co-op)

**Files:**
- Modify: `src/app/testing/e2e-api.ts`, `src/app/testing/e2e-hooks.ts`, `e2e/support/probe.ts` (type re-export)
- Create: `e2e/specs/solo/boulder-puzzle.spec.ts`, `e2e/specs/online/boulder-puzzle-coop.spec.ts`

**Interfaces:**
- Produces: `E2eSnapshot.puzzle: E2eBoulderPuzzleView | null`.

- [ ] **Step 1: Probe type** — in `e2e-api.ts` before `E2eSnapshot`:

```ts
/** Floor-2 boulder puzzle (null on other floors). */
export interface E2eBoulderPuzzleView {
  rail: { x: number; y: number; width: number };
  wall: { x: number; y: number; width: number; height: number };
  /** +1: the wall is right of the rail, -1: left of it. */
  wallDir: number;
  minBoulderX: number;
  maxBoulderX: number;
  boulderStartX: number;
  boulderSize: number;
  boulder: { x: number; velocityX: number; wallBroken: boolean };
  /** The wall still blocks the way out (its collision exists). */
  wallStanding: boolean;
}
```

and in `E2eSnapshot` after `level: E2eLevelView;`:

```ts
  puzzle: E2eBoulderPuzzleView | null;
```

- [ ] **Step 2: Fill it** in `e2e-hooks.ts` `buildSnapshot`, after the `level` entry:

```ts
    puzzle:
      engine.boulderPuzzle && engine.boulder
        ? {
            rail: { x: engine.boulderPuzzle.rail.x, y: engine.boulderPuzzle.rail.y, width: engine.boulderPuzzle.rail.width },
            wall: { ...engine.boulderPuzzle.wall },
            wallDir: engine.boulderPuzzle.wallDir,
            minBoulderX: engine.boulderPuzzle.minBoulderX,
            maxBoulderX: engine.boulderPuzzle.maxBoulderX,
            boulderStartX: engine.boulderPuzzle.boulderStartX,
            boulderSize: GAME_CONSTANTS.BOULDER_SIZE_PX,
            boulder: { ...engine.boulder },
            wallStanding: engine.puzzleWall() !== null,
          }
        : null,
```

`wall: { ...wall }` copies `solid`/`breakable` only if present on the layout object; the layout wall has neither, so the view stays `{x, y, width, height}`.

Add `E2eBoulderPuzzleView` to the type re-export list in `e2e/support/probe.ts` (same place `E2eSnapshot` is re-exported).

- [ ] **Step 3: Solo spec** — `e2e/specs/solo/boulder-puzzle.spec.ts`

```ts
import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eBoulderPuzzleView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { WORLD } from '../../support/invariants';

const PUZZLE_FLOOR: number = 2;

async function puzzleFloor(p: GamePlayer): Promise<E2eBoulderPuzzleView> {
  await p.probe.setGodMode(true);
  await p.probe.setFloor(PUZZLE_FLOOR);
  const s: E2eSnapshot = await p.probe.waitFor(
    'the boulder puzzle floor',
    (st: E2eSnapshot): boolean => st.floor === PUZZLE_FLOOR && st.puzzle !== null,
  );
  return s.puzzle!;
}

/** Stands the player on the rail right next to the boulder, on one side, facing it. */
async function standBeside(
  p: GamePlayer,
  puzzle: E2eBoulderPuzzleView,
  side: 'behind' | 'wall-side',
): Promise<void> {
  const offset: number = side === 'behind' ? -puzzle.wallDir : puzzle.wallDir;
  const x: number =
    offset === 1
      ? puzzle.boulder.x + puzzle.boulderSize + 4
      : puzzle.boulder.x - WORLD.playerWidth - 4;
  await p.probe.teleport(x, puzzle.rail.y - WORLD.playerHeight);
  await p.wait(250);
  await p.face(-offset === 1 ? 'right' : 'left');
}

/** The end of the boulder's travel at the wall, and at the back stopper. */
function wallEnd(puzzle: E2eBoulderPuzzleView): number {
  return puzzle.wallDir === 1 ? puzzle.maxBoulderX : puzzle.minBoulderX;
}
function backEnd(puzzle: E2eBoulderPuzzleView): number {
  return puzzle.wallDir === 1 ? puzzle.minBoulderX : puzzle.maxBoulderX;
}

test.describe('boulder puzzle (floor 2)', { tag: '@solo' }, (): void => {
  test('floor 2 has no hanging exit: a wall closes the side, and walking into it goes nowhere', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    const puzzle: E2eBoulderPuzzleView = await puzzleFloor(p);
    const s0: E2eSnapshot = await p.probe.state();
    expect(s0.exit.x + s0.exit.width, 'the hanging exit is off screen').toBeLessThan(0);
    expect(puzzle.wallStanding).toBe(true);
    expect(puzzle.boulder.x).toBe(puzzle.boulderStartX);

    const towardWall: string = puzzle.wallDir === 1 ? KEYS.right : KEYS.left;
    const startX: number = puzzle.wallDir === 1 ? puzzle.wall.x - 200 : puzzle.wall.x + puzzle.wall.width + 200;
    await p.probe.teleport(startX, WORLD.groundY - WORLD.playerHeight);
    await p.wait(250);
    await p.hold(towardWall);
    await p.wait(1500);
    await p.release(towardWall);
    const s: E2eSnapshot = await p.probe.state();
    const overlapsWall: boolean =
      s.player!.x + WORLD.playerWidth > puzzle.wall.x + 1 &&
      s.player!.x < puzzle.wall.x + puzzle.wall.width - 1;
    expect(overlapsWall, 'the wall stops the player').toBe(false);
    expect(s.floor, 'still on the puzzle floor').toBe(PUZZLE_FLOOR);
  });

  test('a hit from the wall side pushes the boulder back to its stopper, and it never leaves the rail', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    const puzzle: E2eBoulderPuzzleView = await puzzleFloor(p);
    await standBeside(p, puzzle, 'wall-side');
    await p.attack();
    const s: E2eSnapshot = await p.probe.waitFor(
      'the boulder rolled back and stopped',
      (st: E2eSnapshot): boolean =>
        st.puzzle!.boulder.velocityX === 0 && st.puzzle!.boulder.x !== puzzle.boulderStartX,
      { timeoutMs: 10_000 },
    );
    expect(s.puzzle!.boulder.x, 'stopped at the back stopper').toBe(backEnd(puzzle));
    expect(s.puzzle!.wallStanding, 'the wall still stands').toBe(true);

    // Hit it again against the stopper: it stays on the rail.
    await standBeside(p, s.puzzle!, 'wall-side');
    await p.attack();
    await p.wait(1500);
    const again: E2eSnapshot = await p.probe.state();
    expect(again.puzzle!.boulder.x).toBe(backEnd(puzzle));
  });

  test('a hit from behind rolls the boulder into the wall; the wall breaks and the opening leads to floor 3', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    const puzzle: E2eBoulderPuzzleView = await puzzleFloor(p);
    await p.probe.clearVfxLog();
    await standBeside(p, puzzle, 'behind');
    await p.attack();
    const s: E2eSnapshot = await p.probe.waitFor(
      'the wall breaks',
      (st: E2eSnapshot): boolean => st.puzzle!.boulder.wallBroken && st.puzzle!.boulder.velocityX === 0,
      { timeoutMs: 10_000 },
    );
    expect(s.puzzle!.wallStanding, 'the wall collision is gone').toBe(false);
    expect(s.puzzle!.boulder.x, 'the boulder rests at the wall-side stopper, on the rail').toBe(wallEnd(puzzle));
    const log: E2eVfxLogEntry[] = await p.probe.vfxLog();
    expect(log.some((e: E2eVfxLogEntry): boolean => e.type === 'wall-break'), 'the break queued a wall-break effect').toBe(true);
    await p.attachCanvas(testInfo, 'wall broken');

    const towardWall: string = puzzle.wallDir === 1 ? KEYS.right : KEYS.left;
    await p.probe.teleport(WORLD.canvasWidth / 2, WORLD.groundY - WORLD.playerHeight);
    await p.wait(250);
    await p.hold(towardWall);
    await p.probe.waitFor('walked out to floor 3', (st: E2eSnapshot): boolean => st.floor === PUZZLE_FLOOR + 1, {
      timeoutMs: 15_000,
    });
    await p.release(towardWall);
  });
});
```

If `WORLD` has no `canvasWidth`, use the constant it does expose for the screen width (check `e2e/support/invariants.ts`) or `1280`. If a prop on the ground blocks the walk out, the third test's walk fails: `BOULDER_OPENING_CLEAR_PX` keeps the last 96 px free, so teleport to `wall.x ∓ 150` instead of the center if that happens.

- [ ] **Step 4: Online spec** — `e2e/specs/online/boulder-puzzle-coop.spec.ts`

```ts
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eBoulderPuzzleView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { WORLD } from '../../support/invariants';

const PUZZLE_FLOOR: number = 2;

test.describe('boulder puzzle in co-op', { tag: '@online' }, (): void => {
  test("a guest's hit rolls the boulder: both screens see the wall break, and the guest walks out", async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'boulder',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.setFloor(PUZZLE_FLOOR);
    const g0: E2eSnapshot = await guest.probe.waitFor(
      'guest on the puzzle floor',
      (s: E2eSnapshot): boolean => s.floor === PUZZLE_FLOOR && s.puzzle !== null,
    );
    const h0: E2eSnapshot = await host.probe.state();
    expect(g0.puzzle!.rail, 'same rail').toEqual(h0.puzzle!.rail);
    expect(g0.puzzle!.wall, 'same wall').toEqual(h0.puzzle!.wall);
    const puzzle: E2eBoulderPuzzleView = g0.puzzle!;

    await guest.probe.clearVfxLog();
    const behind: number =
      puzzle.wallDir === 1
        ? puzzle.boulder.x - WORLD.playerWidth - 4
        : puzzle.boulder.x + puzzle.boulderSize + 4;
    await guest.probe.teleport(behind, puzzle.rail.y - WORLD.playerHeight);
    await guest.wait(300);
    await guest.face(puzzle.wallDir === 1 ? 'right' : 'left');
    await guest.attack();

    const wallEnd: number = puzzle.wallDir === 1 ? puzzle.maxBoulderX : puzzle.minBoulderX;
    await host.probe.waitFor(
      "the host's simulation breaks the wall from the guest's hit",
      (s: E2eSnapshot): boolean => s.puzzle?.boulder.wallBroken === true,
      { timeoutMs: 10_000 },
    );
    const g1: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees the wall gone and the boulder at rest on the rail',
      (s: E2eSnapshot): boolean =>
        s.puzzle?.wallStanding === false && s.puzzle.boulder.velocityX === 0,
      { timeoutMs: 10_000 },
    );
    expect(g1.puzzle!.boulder.x).toBe(wallEnd);
    const log: E2eVfxLogEntry[] = await guest.probe.vfxLog();
    expect(
      log.some(
        (e: E2eVfxLogEntry): boolean =>
          e.direction === 'replayed' && e.type === 'wall-break' && (e.particlesAdded ?? 0) > 0,
      ),
      'the guest replayed the wall-break debris',
    ).toBe(true);

    const towardWall: string = puzzle.wallDir === 1 ? KEYS.right : KEYS.left;
    const nearWall: number =
      puzzle.wallDir === 1 ? puzzle.wall.x - 150 : puzzle.wall.x + puzzle.wall.width + 150;
    await guest.probe.teleport(nearWall, WORLD.groundY - WORLD.playerHeight);
    await guest.wait(250);
    await guest.hold(towardWall);
    await host.probe.waitFor('the guest walking out ends the floor', (s: E2eSnapshot): boolean => s.floor === PUZZLE_FLOOR + 1, {
      timeoutMs: 15_000,
    });
    await guest.probe.waitFor('the guest reaches floor 3', (s: E2eSnapshot): boolean => s.floor === PUZZLE_FLOOR + 1, {
      timeoutMs: 10_000,
    });
    await guest.release(towardWall);
  });
});
```

- [ ] **Step 5: Format, typecheck and run**

Run:
```bash
npx prettier --write e2e/specs/solo/boulder-puzzle.spec.ts e2e/specs/online/boulder-puzzle-coop.spec.ts
npm run e2e:typecheck
npx playwright test e2e/specs/solo/boulder-puzzle.spec.ts e2e/specs/online/boulder-puzzle-coop.spec.ts
```
Expected: typecheck clean; 4 tests PASS.

- [ ] **Step 6: Regression run of the affected suites**

Run: `npm run e2e:solo` and `npm run e2e:online`
Expected: PASS. Specs that walked floors with `goToFloorWhere` may now land on floor 2 and look for a hanging exit or a prop near it; if one fails because floor 2 has no hanging exit, make its `wanted` predicate add `s.puzzle === null`.

- [ ] **Step 7: Checkpoint**

```bash
git add src/app/testing e2e/support/probe.ts e2e/specs/solo/boulder-puzzle.spec.ts e2e/specs/online/boulder-puzzle-coop.spec.ts
```

---

### Task 7: Docs and Claude files

**Files:**
- Modify: `.claude/rules/engine-architecture.md`
- Modify: `.claude/skills/game-e2e/SKILL.md`

- [ ] **Step 1: Engine architecture rule** — add table rows:

```md
| `boulder-puzzle.ts` | Floor-2 puzzle rules (pure): push direction, rolling + stopper clamp, crush targets, keep-out-of-wall, leaving through the opening |
| `boulder-puzzle-system.ts` | Floor-2 puzzle simulation: host pushes/rolls/crushes/breaks the wall; clients extrapolate the synced roll |
```

Change the `level-generator.ts` row to mention "floor-2 boulder puzzle (rail, breakable wall, ladder)". Add to the dependency graph: `BoulderPuzzleSystem -> Combat, Vfx`. Under "Level geometry", add: "The floor-2 wall is a solid `breakable` platform drawn in the geometry layer from `BoulderPuzzleLayout.wall`; breaking it removes both. The hanging exit is parked off screen on that floor."

- [ ] **Step 2: game-e2e skill** — in the probe section, add `puzzle` (`E2eBoulderPuzzleView`: rail, wall, stoppers, boulder, `wallStanding`) and list the two new specs. Note: floor 2 has no hanging exit; floor walkers that need one filter `s.puzzle === null`.

- [ ] **Step 3: Final checks**

Run: `npm test -- --watch=false`, `npm run build`, `cd zombie-blaster-api && npm run build`
Expected: all green. Re-read every edited file against the hard rules (explicit types, no unused, no console, VFX events next to local effects).

- [ ] **Step 4: Checkpoint**

```bash
git add .claude/rules/engine-architecture.md .claude/skills/game-e2e/SKILL.md
```
