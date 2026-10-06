import { describe, it, expect } from 'vitest';
import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { BoulderState } from '@shared/game-entities';
import { BoulderPuzzleLayout, Platform } from './engine-types';
import {
  Box,
  BoulderPath,
  boulderBox,
  boulderPath,
  CrushTarget,
  crushTargets,
  debrisBox,
  floorHint,
  gateBox,
  gateHitBy,
  keepOutOfWall,
  leavesThroughOpening,
  pointAlong,
  rollBoulder,
} from './boulder-puzzle';

const R: number = GAME_CONSTANTS.BOULDER_SIZE_PX / 2;
const PW: number = GAME_CONSTANTS.PLAYER_WIDTH;
const PH: number = GAME_CONSTANTS.PLAYER_HEIGHT;
const LEDGE_W: number = GAME_CONSTANTS.EXIT_PLATFORM_WIDTH;
const GATE_W: number = GAME_CONSTANTS.BOULDER_GATE_WIDTH_PX;
const HITS: number = GAME_CONSTANTS.BOULDER_GATE_HITS;
const LEDGE_Y: number = 298;

/** Wall on the right (1216..1280); the ledge 736..928 hangs at y 298; the chute spans 928..1216. */
const PUZZLE: BoulderPuzzleLayout = {
  wall: { x: 1216, y: 0, width: 64, height: GAME_CONSTANTS.GROUND_Y },
  wallDir: 1,
  ledgeX: 736,
};

/** Mirror: wall on the left (0..64); the ledge 352..544; the chute spans 64..352. */
const LEFT: BoulderPuzzleLayout = {
  wall: { x: 0, y: 0, width: 64, height: GAME_CONSTANTS.GROUND_Y },
  wallDir: -1,
  ledgeX: 352,
};

type Attacker = Pick<CharacterState, 'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'>;

function attacker(overrides: Partial<Attacker>): Attacker {
  return {
    x: 0,
    y: LEDGE_Y - PH,
    facing: Direction.Right,
    isAttacking: true,
    isDead: false,
    isDown: false,
    ...overrides,
  };
}

function boulder(overrides: Partial<BoulderState> = {}): BoulderState {
  return { gateHits: 0, progress: 0, speed: 0, wallBroken: false, ...overrides };
}

describe('boulder puzzle rules', () => {
  it('the gate stands on the downhill edge of the ledge; the boulder rests against it', (): void => {
    const gate: Box = gateBox(PUZZLE, LEDGE_Y);
    expect(gate.x + gate.width).toBe(PUZZLE.ledgeX + LEDGE_W);
    expect(gate.y + gate.height).toBe(LEDGE_Y);
    const path: BoulderPath = boulderPath(PUZZLE, LEDGE_Y);
    expect(path.start).toEqual({ x: gate.x - R, y: LEDGE_Y - R });
    const rest: Box = boulderBox(boulder(), path)!;
    expect(rest.x + rest.width).toBe(gate.x);
    expect(rest.y + rest.height).toBe(LEDGE_Y);

    const leftGate: Box = gateBox(LEFT, LEDGE_Y);
    expect(leftGate.x).toBe(LEFT.ledgeX);
    expect(boulderPath(LEFT, LEDGE_Y).start.x).toBe(LEFT.ledgeX + GATE_W + R);
  });

  it('the path runs off the ledge and down to the wall face, above head height', (): void => {
    const path: BoulderPath = boulderPath(PUZZLE, LEDGE_Y);
    expect(path.edge).toEqual({ x: PUZZLE.ledgeX + LEDGE_W, y: LEDGE_Y - R });
    expect(path.end.x + R).toBe(PUZZLE.wall.x);
    expect(path.end.y + R).toBe(
      GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.BOULDER_CHUTE_END_CLEARANCE_PX,
    );
    expect(pointAlong(path, 0)).toEqual(path.start);
    expect(pointAlong(path, path.length)).toEqual(path.end);
    const leftPath: BoulderPath = boulderPath(LEFT, LEDGE_Y);
    expect(leftPath.end.x - R).toBe(LEFT.wall.x + LEFT.wall.width);
  });

  it('an attack next to the gate, facing it, hits it', (): void => {
    const gate: Box = gateBox(PUZZLE, LEDGE_Y);
    expect(
      gateHitBy(attacker({ x: gate.x - PW - 4, facing: Direction.Right }), PUZZLE, LEDGE_Y),
    ).toBe(true);
    const leftGate: Box = gateBox(LEFT, LEDGE_Y);
    expect(
      gateHitBy(
        attacker({ x: leftGate.x + leftGate.width + 4, facing: Direction.Left }),
        LEFT,
        LEDGE_Y,
      ),
    ).toBe(true);
  });

  it('no gate hit when facing away, too far, not attacking, downed, dead, or below the ledge', (): void => {
    const near: number = gateBox(PUZZLE, LEDGE_Y).x - PW - 4;
    expect(gateHitBy(attacker({ x: near, facing: Direction.Left }), PUZZLE, LEDGE_Y)).toBe(false);
    expect(
      gateHitBy(attacker({ x: near - GAME_CONSTANTS.BOULDER_SIZE_PX - 60 }), PUZZLE, LEDGE_Y),
    ).toBe(false);
    expect(gateHitBy(attacker({ x: near, isAttacking: false }), PUZZLE, LEDGE_Y)).toBe(false);
    expect(gateHitBy(attacker({ x: near, isDown: true }), PUZZLE, LEDGE_Y)).toBe(false);
    expect(gateHitBy(attacker({ x: near, isDead: true }), PUZZLE, LEDGE_Y)).toBe(false);
    expect(gateHitBy(attacker({ x: near, y: GAME_CONSTANTS.GROUND_Y - PH }), PUZZLE, LEDGE_Y)).toBe(
      false,
    );
  });

  it('the boulder stays put while the gate holds', (): void => {
    const path: BoulderPath = boulderPath(PUZZLE, LEDGE_Y);
    const b: BoulderState = boulder({ gateHits: HITS - 1 });
    for (let t: number = 0; t < 100; t++) expect(rollBoulder(b, path)).toBe(false);
    expect(b.progress).toBe(0);
  });

  it('once the gate breaks it rolls, speeds up, and reports reaching the wall until the host breaks it', (): void => {
    const path: BoulderPath = boulderPath(PUZZLE, LEDGE_Y);
    const b: BoulderState = boulder({ gateHits: HITS });
    rollBoulder(b, path);
    const firstSpeed: number = b.speed;
    rollBoulder(b, path);
    expect(b.speed).toBeGreaterThan(firstSpeed);
    let hits: number = 0;
    // The host breaks the wall on the first report; until then it keeps reporting.
    for (let t: number = 0; t < 400; t++) {
      if (rollBoulder(b, path)) {
        hits++;
        b.wallBroken = true;
      }
    }
    expect(hits).toBe(1);
    expect(b.progress).toBe(path.length);
    expect(b.speed).toBeLessThanOrEqual(GAME_CONSTANTS.BOULDER_MAX_SPEED);
  });

  it('a shattered boulder (wall broken) has no box and never rolls', (): void => {
    const path: BoulderPath = boulderPath(PUZZLE, LEDGE_Y);
    const b: BoulderState = boulder({ gateHits: HITS, progress: path.length, wallBroken: true });
    expect(boulderBox(b, path)).toBeNull();
    expect(rollBoulder(b, path)).toBe(false);
  });

  it('crushes each overlapping live zombie once per roll', (): void => {
    const box: Box = { x: 800, y: 250, width: 48, height: 48 };
    const zombies: CrushTarget[] = [
      { id: 'a', x: 820, y: 260, instanceWidth: 30, instanceHeight: 40, isDead: false },
      { id: 'b', x: 1000, y: 260, instanceWidth: 30, instanceHeight: 40, isDead: false },
      { id: 'c', x: 810, y: 260, instanceWidth: 30, instanceHeight: 40, isDead: true },
    ];
    const crushed: Set<string> = new Set<string>();
    expect(crushTargets(zombies, box, crushed).map((z: CrushTarget): string => z.id)).toEqual([
      'a',
    ]);
    crushed.add('a');
    expect(crushTargets(zombies, box, crushed)).toEqual([]);
  });

  it('wall debris lands on the ground in front of the wall face', (): void => {
    const right: Box = debrisBox(PUZZLE);
    expect(right.x + right.width).toBe(PUZZLE.wall.x);
    expect(right.y + right.height).toBe(GAME_CONSTANTS.GROUND_Y);
    const left: Box = debrisBox(LEFT);
    expect(left.x).toBe(LEFT.wall.x + LEFT.wall.width);
  });

  it('keeps things out of a standing wall on either side', (): void => {
    expect(keepOutOfWall(1230, 30, PUZZLE.wall)).toBe(1216 - 30);
    expect(keepOutOfWall(1100, 30, PUZZLE.wall)).toBe(1100);
    const left: Platform = LEFT.wall;
    expect(keepOutOfWall(10, 30, left)).toBe(64);
    expect(keepOutOfWall(10, 30, null)).toBe(10);
  });

  it('the opening lets grounded players out once the wall broke, also standing on bodies', (): void => {
    const out: Pick<CharacterState, 'x' | 'isGrounded'> = { x: 1240, isGrounded: true };
    expect(leavesThroughOpening(out, PUZZLE, boulder({ wallBroken: false }))).toBe(false);
    expect(leavesThroughOpening(out, PUZZLE, boulder({ wallBroken: true }))).toBe(true);
    expect(
      leavesThroughOpening({ ...out, isGrounded: false }, PUZZLE, boulder({ wallBroken: true })),
    ).toBe(false);
    expect(leavesThroughOpening({ ...out, x: 1100 }, PUZZLE, boulder({ wallBroken: true }))).toBe(
      false,
    );
  });

  it('the floor hint points at the boulder on the puzzle floor only', (): void => {
    expect(floorHint(PUZZLE)).toContain('boulder');
    expect(floorHint(null)).toBe('Find a way up to the EXIT');
  });
});

describe('boulder puzzle review fixes (v2)', () => {
  it('a path that shrinks under a rolling boulder (a player left) still ends at the wall', (): void => {
    const long: BoulderPath = boulderPath(PUZZLE, LEDGE_Y - 64);
    const short: BoulderPath = boulderPath(PUZZLE, LEDGE_Y);
    const b: BoulderState = boulder({ gateHits: HITS, progress: long.length - 2, speed: 10 });
    expect(b.progress).toBeGreaterThan(short.length);
    expect(rollBoulder(b, short), 'reaching the wall is reported').toBe(true);
    expect(b.progress).toBe(short.length);
  });

  it('a player poking up through the ledge from below cannot hit the gate', (): void => {
    const gate: Box = gateBox(PUZZLE, LEDGE_Y);
    const below: Attacker = attacker({ x: gate.x - PW - 4, y: LEDGE_Y - PH + 30 });
    expect(gateHitBy(below, PUZZLE, LEDGE_Y)).toBe(false);
  });

  it('swinging at the boulder (resting against the gate) hits the gate behind it', (): void => {
    const rest: Box = boulderBox(boulder(), boulderPath(PUZZLE, LEDGE_Y))!;
    const atBoulder: Attacker = attacker({ x: rest.x - PW - 4, facing: Direction.Right });
    expect(gateHitBy(atBoulder, PUZZLE, LEDGE_Y)).toBe(true);
    const leftRest: Box = boulderBox(boulder(), boulderPath(LEFT, LEDGE_Y))!;
    expect(
      gateHitBy(
        attacker({ x: leftRest.x + leftRest.width + 4, facing: Direction.Left }),
        LEFT,
        LEDGE_Y,
      ),
    ).toBe(true);
  });
});
