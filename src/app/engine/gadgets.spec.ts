import { describe, it, expect } from 'vitest';
import { CharacterState, Direction, GAME_CONSTANTS } from '@shared/index';
import { GadgetBody, GadgetState } from '@shared/game-entities';
import { Point } from './boulder-puzzle';
import {
  ButtonGadget,
  CrackWallGadget,
  DoorGadget,
  EXIT_TARGET,
  Gadget,
  LeverGadget,
  Platform,
  SlingshotGadget,
  SpringGadget,
} from './engine-types';
import {
  BoulderImpact,
  WeighedWorld,
  crackWallPieces,
  dotsAlong,
  doorSolid,
  exitLocked,
  flightPath,
  inputOn,
  launchVelocity,
  loadKg,
  newGadgetState,
  newGadgetStates,
  stepBoulder,
  swingHits,
  tickDoor,
  tickLauncher,
} from './gadgets';
import { GROUND_PLATFORM } from './level-generator';

const S: number = GAME_CONSTANTS.BOULDER_SIZE_PX;
const GROUND_Y: number = GAME_CONSTANTS.GROUND_Y;
const G: number = GAME_CONSTANTS.GRAVITY;

function body(x: number, y: number = GROUND_Y - S, vx: number = 0): GadgetBody {
  return { x, y, velocityX: vx, velocityY: 0, isGrounded: true, angle: 0 };
}

function run(
  b: GadgetBody,
  platforms: Platform[],
  ticks: number,
  breaks: boolean = false,
): BoulderImpact[] {
  const impacts: BoulderImpact[] = [];
  for (let t: number = 0; t < ticks; t++) {
    impacts.push(...stepBoulder(b, platforms, [], G, (): boolean => breaks));
  }
  return impacts;
}

function emptyWorld(overrides: Partial<WeighedWorld> = {}): WeighedWorld {
  return { corpses: [], props: [], zombies: [], players: [], boulders: [], ...overrides };
}

function standingPlayer(
  x: number,
  feetY: number,
): Pick<CharacterState, 'id' | 'x' | 'y' | 'isGrounded' | 'isDead' | 'isClimbing'> {
  return {
    id: 'p1',
    x,
    y: feetY - GAME_CONSTANTS.PLAYER_HEIGHT,
    isGrounded: true,
    isDead: false,
    isClimbing: false,
  };
}

const lever: LeverGadget = {
  id: 'g1',
  kind: 'lever',
  startsOn: false,
  x: 100,
  y: 588,
  width: 16,
  height: 32,
  targets: ['g3'],
};
const button: ButtonGadget = {
  id: 'g2',
  kind: 'button',
  x: 300,
  y: GROUND_Y,
  width: 48,
  height: 6,
  kg: 60,
  targets: ['g3', EXIT_TARGET],
};
const door: DoorGadget = {
  id: 'g3',
  kind: 'door',
  x: 600,
  y: 492,
  width: 32,
  height: 128,
  latch: false, exit: false,
};

describe('gadgets: boulder', () => {
  it('rolls on the ground, slowing down to a stop', () => {
    const b: GadgetBody = body(200, GROUND_Y - S, 5);
    run(b, [GROUND_PLATFORM], 400);
    expect(b.velocityX).toBe(0);
    expect(b.x).toBeGreaterThan(300);
    expect(b.y).toBe(GROUND_Y - S);
    expect(b.angle).toBeGreaterThan(0);
  });

  it('rolls off a ledge, falls and lands on the ground', () => {
    const ledge: Platform = { x: 0, y: 400, width: 300, height: 32 };
    const b: GadgetBody = body(240, 400 - S, 4);
    run(b, [GROUND_PLATFORM, ledge], 200);
    expect(b.isGrounded).toBe(true);
    expect(b.y).toBe(GROUND_Y - S);
    expect(b.x).toBeGreaterThan(300);
  });

  it('bounces off a solid it rolls into, breaking through when it breaks it', () => {
    const wall: Platform = { x: 400, y: 400, width: 64, height: 220, solid: true };
    const b: GadgetBody = body(300, GROUND_Y - S, 6);
    const hits: BoulderImpact[] = run(b, [GROUND_PLATFORM, wall], 60);
    expect(hits[0]).toMatchObject({ solid: wall });
    expect(hits[0].speed).toBeGreaterThan(GAME_CONSTANTS.GADGET_BOULDER_BREAK_SPEED);
    expect(b.x + S).toBeLessThanOrEqual(wall.x);
    const through: GadgetBody = body(300, GROUND_Y - S, 6);
    run(through, [GROUND_PLATFORM, wall], 60, true);
    expect(through.x).toBeGreaterThan(wall.x);
  });

  it('stays on the screen', () => {
    const b: GadgetBody = body(GAME_CONSTANTS.CANVAS_WIDTH - S - 2, GROUND_Y - S, 10);
    run(b, [GROUND_PLATFORM], 50);
    expect(b.x + S).toBeLessThanOrEqual(GAME_CONSTANTS.CANVAS_WIDTH);
  });

  it('thrown into the air it flies an arc and comes down', () => {
    const b: GadgetBody = { ...body(200), velocityX: 6, velocityY: -14, isGrounded: false };
    let peak: number = b.y;
    for (let t: number = 0; t < 200; t++) {
      stepBoulder(b, [GROUND_PLATFORM], [], G, (): boolean => false);
      peak = Math.min(peak, b.y);
    }
    expect(peak).toBeLessThan(GROUND_Y - S - 150);
    expect(b.isGrounded).toBe(true);
  });
});

describe('gadgets: weighing and signals', () => {
  it('a button weighs what rests on it: a player, a boulder, nothing beside it', () => {
    expect(loadKg(button, emptyWorld())).toBe(0);
    const on: WeighedWorld = emptyWorld({ players: [standingPlayer(310, GROUND_Y)] });
    expect(loadKg(button, on)).toBe(GAME_CONSTANTS.PLAYER_WEIGHT_KG);
    const beside: WeighedWorld = emptyWorld({ players: [standingPlayer(500, GROUND_Y)] });
    expect(loadKg(button, beside)).toBe(0);
    const rock: WeighedWorld = emptyWorld({
      boulders: [{ body: body(300), kg: GAME_CONSTANTS.GADGET_BOULDER_KG }],
    });
    expect(loadKg(button, rock)).toBe(GAME_CONSTANTS.GADGET_BOULDER_KG);
  });

  it('a target is on while any source wired to it is on; a wired exit is locked until its door opens', () => {
    const gadgets: Gadget[] = [lever, button, door];
    const states: GadgetState[] = newGadgetStates(gadgets);
    expect(states.map((s: GadgetState): string => s.id)).toEqual(['g1', 'g2', 'g3', EXIT_TARGET]);
    expect(inputOn(gadgets, states, 'g3')).toBe(false);
    states[0].on = true;
    expect(inputOn(gadgets, states, 'g3')).toBe(true);
    expect(inputOn(gadgets, states, EXIT_TARGET)).toBe(false);
    expect(exitLocked(states)).toBe(true);
    states[3].openTicks = GAME_CONSTANTS.GADGET_DOOR_TICKS;
    expect(exitLocked(states)).toBe(false);
  });

  it('a swing hits only when level with the box, in reach and facing it', () => {
    const band: { x: number; y: number; width: number; height: number } = {
      x: 500,
      y: 556,
      width: 64,
      height: 64,
    };
    const swinger: Pick<
      CharacterState,
      'x' | 'y' | 'facing' | 'isAttacking' | 'isDead' | 'isDown'
    > = {
      x: 460,
      y: GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
      facing: Direction.Right,
      isAttacking: true,
      isDead: false,
      isDown: false,
    };
    expect(swingHits(swinger, band, 24)).toBe(true);
    expect(swingHits({ ...swinger, facing: Direction.Left }, band, 24)).toBe(false);
    expect(swingHits({ ...swinger, y: 300 }, band, 24)).toBe(false);
    expect(swingHits({ ...swinger, isAttacking: false }, band, 24)).toBe(false);
  });
});

describe('gadgets: cracked wall, door, launchers', () => {
  it('a cracked wall is solid above, in and below its band; broken, the band is a hole', () => {
    const wall: CrackWallGadget = {
      id: 'g1',
      kind: 'crack-wall',
      x: 500,
      y: 428,
      width: 64,
      height: 192,
      crackTop: 492,
      crackBottom: 556,
    };
    expect(crackWallPieces(wall, false).map((b: { height: number }): number => b.height)).toEqual([
      64, 64, 64,
    ]);
    expect(crackWallPieces(wall, true)).toEqual([
      { x: 500, y: 428, width: 64, height: 64 },
      { x: 500, y: 556, width: 64, height: 64 },
    ]);
  });

  it('a door slides open while its input is on and shuts after; a latched one stays open', () => {
    const s: GadgetState = newGadgetState('g3', null);
    for (let t: number = 0; t < GAME_CONSTANTS.GADGET_DOOR_TICKS; t++) tickDoor(s, true, false);
    expect(doorSolid(door, s).height).toBe(GAME_CONSTANTS.GADGET_DOOR_LINTEL_PX);
    tickDoor(s, false, false);
    expect(s.openTicks).toBe(GAME_CONSTANTS.GADGET_DOOR_TICKS - 1);
    const latched: GadgetState = newGadgetState('g3', null);
    for (let t: number = 0; t < GAME_CONSTANTS.GADGET_DOOR_TICKS; t++)
      tickDoor(latched, true, true);
    tickDoor(latched, false, true);
    expect(latched.openTicks).toBe(GAME_CONSTANTS.GADGET_DOOR_TICKS);
    expect(doorSolid(door, newGadgetState('g3', null)).height).toBe(door.height);
  });

  it('a wired launcher fires once as its input comes on, not again while it settles', () => {
    const s: GadgetState = newGadgetState('g4', null);
    expect(tickLauncher(s, true, false, true)).toBe(false);
    expect(tickLauncher(s, true, true, true)).toBe(true);
    expect(tickLauncher(s, true, true, true)).toBe(false);
    expect(s.launches).toBe(1);
  });

  it('an unwired launcher fires once something rested on it for the wind-up', () => {
    const s: GadgetState = newGadgetState('g4', null);
    let fired: number = 0;
    for (let t: number = 0; t < GAME_CONSTANTS.GADGET_LAUNCH_WIND_TICKS; t++) {
      if (tickLauncher(s, false, false, true)) fired++;
    }
    expect(fired).toBe(1);
    expect(tickLauncher(newGadgetState('g5', null), false, false, false)).toBe(false);
  });

  it('a spring throws straight up, a slingshot along its angle', () => {
    const spring: SpringGadget = {
      id: 'g1',
      kind: 'spring',
      x: 0,
      y: 588,
      width: 64,
      height: 32,
      power: 18,
    };
    expect(launchVelocity(spring)).toEqual({ vx: 0, vy: -18 });
    const sling: SlingshotGadget = {
      id: 'g2',
      kind: 'slingshot',
      x: 0,
      y: 596,
      width: 64,
      height: 24,
      power: 10,
      angle: 180,
    };
    const v: { vx: number; vy: number } = launchVelocity(sling);
    expect(v.vx).toBeCloseTo(-10);
    expect(v.vy).toBeCloseTo(0);
  });

  it('the editor aim comes down at the floor; wire dots are evenly spaced', () => {
    const path: Point[] = flightPath({ x: 200, y: 500 }, 8, -12, 400, GROUND_Y);
    const end: Point = path[path.length - 1];
    expect(end.y + S / 2).toBeGreaterThanOrEqual(GROUND_Y);
    expect(end.x).toBeGreaterThan(400);
    const dots: Point[] = dotsAlong(
      [
        { x: 0, y: 0 },
        { x: 24, y: 0 },
        { x: 24, y: 24 },
      ],
      12,
    );
    expect(dots).toEqual([
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 24, y: 0 },
      { x: 24, y: 12 },
      { x: 24, y: 24 },
    ]);
  });
});
