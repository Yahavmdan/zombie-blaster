import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CharacterClass,
  CharacterState,
  Direction,
  GAME_CONSTANTS,
  VfxEvent,
  VfxEventType,
  ZOMBIE_TYPES,
} from '@shared/index';
import { GadgetBody, GadgetState, WorldDrop, ZombieState, ZombieType } from '@shared/game-entities';
import { PhysicsSystem } from './physics-system';
import { GameEngine } from './game-engine';
import { EXIT_TARGET, Gadget, Platform } from './engine-types';
import { LevelLayout } from './level-generator';
import { stateOf } from './gadgets';

const GROUND_Y: number = GAME_CONSTANTS.GROUND_Y;
const S: number = GAME_CONSTANTS.BOULDER_SIZE_PX;
const PH: number = GAME_CONSTANTS.PLAYER_HEIGHT;

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
    rect: noop,
    clip: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    setTransform: noop,
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    canvas,
  };
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return canvas;
}

function makePlayer(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: 'player-1',
    name: 'Test',
    classId: CharacterClass.Warrior,
    level: 1,
    xp: 0,
    xpToNext: 100,
    hp: 200,
    mp: 50,
    stats: { str: 10, dex: 5, int: 5, luk: 5 },
    derived: {
      maxHp: 200,
      maxMp: 50,
      attack: 20,
      defense: 5,
      speed: 3,
      critRate: 5,
      critDamage: 150,
    },
    allocatedStats: { str: 0, dex: 0, int: 0, luk: 0 },
    unallocatedStatPoints: 0,
    unallocatedSkillPoints: 0,
    skillLevels: {},
    activeBuffs: [],
    inventory: { potions: {}, gold: 0, autoPotionHpId: null, autoPotionMpId: null },
    x: 100,
    y: GROUND_Y - PH,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    isDead: false,
    isDown: false,
    downTimer: 0,
    isAttacking: false,
    isDoubleJumping: false,
    isClimbing: false,
    facing: Direction.Right,
    ...overrides,
  };
}

function makeZombie(x: number): ZombieState {
  const def: (typeof ZOMBIE_TYPES)[ZombieType.Walker] = ZOMBIE_TYPES[ZombieType.Walker];
  return {
    id: `zombie-${x}`,
    type: ZombieType.Walker,
    hp: 100,
    maxHp: 100,
    x,
    y: GROUND_Y - 50,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    isDead: false,
    target: null,
    knockbackFrames: 0,
    jumpCooldown: 0,
    attackCooldown: 0,
    attackAnimTimer: 0,
    attackHasHit: false,
    attackHesitation: def.hesitationMin,
    hesitationRange: 0,
    facing: -1,
    instanceSpeed: 1,
    instanceDamageMin: 10,
    instanceDamageMax: 15,
    instanceKnockbackForce: 5,
    instanceXpReward: 10,
    instanceWidth: 40,
    instanceHeight: 50,
    orbitOffset: 0,
    platformDropTimer: 0,
    spawnTimer: 0,
    reactionDelay: 0,
    eatingTargetId: null,
    eatingTimer: 0,
    magnetPull: null,
    stunTicks: 0,
    angle: 0,
    spin: 0,
  };
}

/** An empty room on floor 1 with these gadgets; the exit hangs at the left edge. */
function room(gadgets: Gadget[]): LevelLayout {
  return {
    seed: 1,
    floor: 1,
    platforms: [],
    ropes: [],
    exitX: 20,
    exitY: 300,
    props: [],
    walls: [],
    gadgets,
  };
}

const crackWall: Gadget = {
  id: 'g2',
  kind: 'crack-wall',
  x: 700,
  y: GROUND_Y - 192,
  width: 64,
  height: 192,
  crackTop: GROUND_Y - 64,
  crackBottom: GROUND_Y,
};

/** Floor 1 is designed in the level editor (`DESIGNED_LEVELS`); floor 6 is generated and has no puzzle. */
const GENERATED_FLOOR: number = 6;

describe('GadgetSystem on a real engine', () => {
  let engine: GameEngine;

  beforeEach((): void => {
    engine = new GameEngine(createMockCanvas());
    engine.player = makePlayer();
    engine.zombies = [];
  });

  function load(gadgets: Gadget[]): void {
    engine.useCustomLevel(room(gadgets));
  }

  function tick(n: number): void {
    for (let i: number = 0; i < n; i++) engine.gadgetSystem.update();
  }

  function state(id: string): GadgetState {
    const s: GadgetState | undefined = stateOf(engine.gadgetStates, id);
    expect(s).toBeDefined();
    return s!;
  }

  function events(type: VfxEventType): VfxEvent[] {
    return engine.pendingVfxEvents.filter((e: VfxEvent): boolean => e.type === type);
  }

  it('a still boulder is solid; a swing rolls it away and it crushes the zombie in its way', () => {
    load([{ id: 'g1', kind: 'boulder', kg: 600, x: 200, y: GROUND_Y - S, width: S, height: S }]);
    expect(
      engine.platforms.some((p: Platform): boolean => p.gadgetId === 'g1' && p.solid === true),
    ).toBe(true);
    const zombie: ZombieState = makeZombie(330);
    engine.zombies = [zombie];
    engine.player!.x = 200 - GAME_CONSTANTS.PLAYER_WIDTH - 4;
    engine.player!.isAttacking = true;
    tick(1);
    engine.player!.isAttacking = false;
    const body: GadgetBody = state('g1').body!;
    expect(body.velocityX).toBeGreaterThan(0);
    expect(engine.platforms.some((p: Platform): boolean => p.gadgetId === 'g1')).toBe(false);
    tick(60);
    expect(zombie.hp).toBeLessThanOrEqual(0);
    expect(zombie.isDead).toBe(true);
  });

  it('a heavier boulder rolls slower off the same swing and weighs its own kg', () => {
    const swingAt: (kg: number) => number = (kg: number): number => {
      load([
        { id: 'g1', kind: 'boulder', kg, x: 200, y: GROUND_Y - S, width: S, height: S },
        { id: 'g2', kind: 'button', x: 500, y: GROUND_Y, width: 48, height: 6, kg: 1, targets: [] },
      ]);
      engine.player!.x = 200 - GAME_CONSTANTS.PLAYER_WIDTH - 4;
      engine.player!.isAttacking = true;
      tick(1);
      engine.player!.isAttacking = false;
      return state('g1').body!.velocityX;
    };
    const usual: number = swingAt(GAME_CONSTANTS.GADGET_BOULDER_KG);
    expect(swingAt(GAME_CONSTANTS.GADGET_BOULDER_KG * 2)).toBeCloseTo(usual / 2);
    load([
      { id: 'g1', kind: 'boulder', kg: 1500, x: 500, y: GROUND_Y - S, width: S, height: S },
      {
        id: 'g2',
        kind: 'button',
        x: 500,
        y: GROUND_Y,
        width: 48,
        height: 6,
        kg: 1000,
        targets: [],
      },
    ]);
    tick(1);
    expect(state('g2')).toMatchObject({ kg: 1500, on: true });
  });

  it('a lever set to start on is on when the floor starts', () => {
    load([
      {
        id: 'g1',
        kind: 'lever',
        startsOn: true,
        x: 300,
        y: GROUND_Y - 32,
        width: 16,
        height: 32,
        targets: [],
      },
    ]);
    expect(state('g1').on).toBe(true);
  });

  it('a fast boulder breaks a crack band and rolls on through the hole', () => {
    load([
      { id: 'g1', kind: 'boulder', kg: 600, x: 500, y: GROUND_Y - S, width: S, height: S },
      crackWall,
    ]);
    state('g1').body!.velocityX = 10;
    tick(80);
    expect(state('g2').broken).toBe(true);
    expect(state('g1').body!.x).toBeGreaterThan(crackWall.x + crackWall.width);
    expect(events(VfxEventType.CrackBreak).length).toBe(1);
    // The wall above the hole still stands.
    const pieces: Platform[] = engine.platforms.filter(
      (p: Platform): boolean => p.gadgetId === 'g2',
    );
    expect(pieces).toEqual([
      {
        x: 700,
        y: GROUND_Y - 192,
        width: 64,
        height: 128,
        solid: true,
        puzzlePart: 'gadget',
        gadgetId: 'g2',
      },
    ]);
  });

  it('swings break a crack band only there: above it they do nothing', () => {
    load([crackWall]);
    const p: CharacterState = engine.player!;
    p.x = crackWall.x - GAME_CONSTANTS.PLAYER_WIDTH - 4;
    p.y = crackWall.y - PH - 10;
    p.isAttacking = true;
    tick(GAME_CONSTANTS.GADGET_HIT_COOLDOWN_TICKS * 3);
    expect(state('g2').hits).toBe(0);
    p.y = GROUND_Y - PH;
    tick(GAME_CONSTANTS.GADGET_HIT_COOLDOWN_TICKS * GAME_CONSTANTS.GADGET_CRACK_HITS);
    expect(state('g2').broken).toBe(true);
  });

  it('a barrel blast breaks a band in reach and throws a boulder', () => {
    load([
      crackWall,
      { id: 'g1', kind: 'boulder', kg: 600, x: 560, y: GROUND_Y - S, width: S, height: S },
    ]);
    engine.gadgetSystem.blast({ x: 660, y: GROUND_Y - 30 });
    expect(state('g2').broken).toBe(true);
    const body: GadgetBody = state('g1').body!;
    expect(body.velocityX).toBeLessThan(0);
    expect(body.isGrounded).toBe(false);
  });

  it('a lever wired to a door: a swing flips it and the door slides open, its solid shrinking', () => {
    load([
      {
        id: 'g1',
        kind: 'lever',
        startsOn: false,
        x: 300,
        y: GROUND_Y - 32,
        width: 16,
        height: 32,
        targets: ['g3'],
      },
      {
        id: 'g3',
        kind: 'door',
        x: 600,
        y: GROUND_Y - 128,
        width: 32,
        height: 128,
        latch: false,
        exit: false,
      },
    ]);
    const doorHeight: () => number = (): number =>
      engine.platforms.find((p: Platform): boolean => p.gadgetId === 'g3')!.height;
    expect(doorHeight()).toBe(128);
    const p: CharacterState = engine.player!;
    p.x = 300 - GAME_CONSTANTS.PLAYER_WIDTH - 4;
    p.isAttacking = true;
    tick(1);
    p.isAttacking = false;
    expect(state('g1').on).toBe(true);
    tick(GAME_CONSTANTS.GADGET_DOOR_TICKS);
    expect(doorHeight()).toBe(GAME_CONSTANTS.GADGET_DOOR_LINTEL_PX);
  });

  it('a button the player stands on opens the wired exit; stepping off locks it again', () => {
    load([
      {
        id: 'g1',
        kind: 'button',
        x: 400,
        y: GROUND_Y,
        width: 48,
        height: 6,
        kg: 60,
        targets: [EXIT_TARGET],
      },
    ]);
    expect(engine.isExitLocked()).toBe(true);
    engine.player!.x = 410;
    tick(GAME_CONSTANTS.GADGET_DOOR_TICKS + 1);
    expect(state('g1').kg).toBe(GAME_CONSTANTS.PLAYER_WEIGHT_KG);
    expect(engine.isExitLocked()).toBe(false);
    engine.player!.x = 100;
    tick(2);
    expect(engine.isExitLocked()).toBe(true);
  });

  it('an unwired spring throws the player standing on it after its wind-up', () => {
    load([
      { id: 'g1', kind: 'spring', x: 380, y: GROUND_Y - 32, width: 64, height: 32, power: 18 },
    ]);
    const p: CharacterState = engine.player!;
    p.x = 396;
    p.y = GROUND_Y - 32 - PH;
    tick(GAME_CONSTANTS.GADGET_LAUNCH_WIND_TICKS - 1);
    expect(p.velocityY).toBe(0);
    tick(1);
    expect(p.velocityY).toBe(-18);
    expect(p.isGrounded).toBe(false);
    expect(events(VfxEventType.GadgetLaunch).length).toBe(1);
  });

  it('a slingshot wired to a lever throws a boulder resting on it along its angle', () => {
    load([
      {
        id: 'g1',
        kind: 'lever',
        startsOn: false,
        x: 100,
        y: GROUND_Y - 32,
        width: 16,
        height: 32,
        targets: ['g2'],
      },
      {
        id: 'g2',
        kind: 'slingshot',
        x: 400,
        y: GROUND_Y - 24,
        width: 64,
        height: 24,
        power: 12,
        angle: 45,
      },
      { id: 'g3', kind: 'boulder', kg: 600, x: 408, y: GROUND_Y - 24 - S, width: S, height: S },
    ]);
    tick(GAME_CONSTANTS.GADGET_LAUNCH_WIND_TICKS + 5);
    // Wired: it waits for the signal, whatever rests on it.
    expect(state('g2').launches).toBe(0);
    state('g1').on = true;
    tick(1);
    const body: GadgetBody = state('g3').body!;
    expect(state('g2').launches).toBe(1);
    expect(body.velocityX).toBeGreaterThan(7);
    expect(body.velocityY).toBeLessThan(-7);
  });

  it('a client follows the host: numbers clamped, a broken band stays broken, a fresh launch throws its own player', () => {
    const gadgets: Gadget[] = [
      crackWall,
      { id: 'g1', kind: 'spring', x: 380, y: GROUND_Y - 32, width: 64, height: 32, power: 18 },
    ];
    engine.isMultiplayerClient = true;
    load(gadgets);
    const p: CharacterState = engine.player!;
    p.x = 396;
    p.y = GROUND_Y - 32 - PH;
    const host: GadgetState[] = engine.gadgetSystem.snapshot();
    host[0].broken = true;
    host[0].hits = 9999;
    host[1].launches = 1;
    host[1].bounceTicks = GAME_CONSTANTS.GADGET_LAUNCH_BOUNCE_TICKS;
    engine.applyRemoteGadgets(host);
    expect(state('g2')).toMatchObject({ broken: true, hits: GAME_CONSTANTS.GADGET_CRACK_HITS });
    expect(p.velocityY).toBe(-18);
    engine.applyRemoteGadgets([{ ...host[0], broken: false, kg: Number.NaN }]);
    expect(state('g2').broken).toBe(true);
    expect(Number.isFinite(state('g2').kg)).toBe(true);
    engine.applyRemoteGadgets('nonsense' as unknown as GadgetState[]);
  });

  it('a player walks up a slope and back down it, standing on its surface', () => {
    load([
      {
        id: 'g1',
        kind: 'slope',
        risesRight: true,
        x: 400,
        y: GROUND_Y - 96,
        width: 192,
        height: 96,
      },
    ]);
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const p: CharacterState = engine.player!;
    p.x = 340;
    engine.keys = { ...engine.keys, right: true };
    let top: number = p.y;
    for (let t: number = 0; t < 120 && p.x < 560; t++) {
      physics.updatePlayer();
      top = Math.min(top, p.y);
    }
    expect(p.isGrounded).toBe(true);
    expect(top + PH, 'walked up the slope').toBeLessThan(GROUND_Y - 60);
    engine.keys = { ...engine.keys, right: false, left: true };
    for (let t: number = 0; t < 200 && p.x > 360; t++) physics.updatePlayer();
    expect(p.y + PH, 'back down on the ground').toBe(GROUND_Y);
  });

  it('a boulder left on a slope rolls down it and on along the ground', () => {
    load([
      {
        id: 'g1',
        kind: 'slope',
        risesRight: false,
        x: 400,
        y: GROUND_Y - 96,
        width: 192,
        height: 96,
      },
      { id: 'g2', kind: 'boulder', kg: 600, x: 404, y: GROUND_Y - 96 - S + 2, width: S, height: S },
    ]);
    tick(200);
    const body: GadgetBody = state('g2').body!;
    expect(body.x, 'rolled down past the slope').toBeGreaterThan(600);
    expect(body.y + S).toBe(GROUND_Y);
  });

  it('a cage wired to a lever drops, crushes what is under it, lands as a step and lets out its zombies', () => {
    load([
      {
        id: 'g1',
        kind: 'lever',
        startsOn: false,
        x: 100,
        y: GROUND_Y - 32,
        width: 16,
        height: 32,
        targets: ['g2'],
      },
      {
        id: 'g2',
        kind: 'cage',
        content: 'zombies',
        zombies: 3,
        gold: 0,
        smashes: false,
        x: 700,
        y: 200,
        width: 64,
        height: 64,
      },
    ]);
    expect(
      engine.platforms.some((p: Platform): boolean => p.gadgetId === 'g2' && p.y === 200),
    ).toBe(true);
    const under: ZombieState = makeZombie(712);
    engine.zombies = [under];
    state('g1').on = true;
    tick(80);
    expect(state('g2')).toMatchObject({ dropped: true, landed: true, broken: false });
    expect(under.hp, 'crushed').toBeLessThanOrEqual(0);
    const step: Platform | undefined = engine.platforms.find(
      (p: Platform): boolean => p.gadgetId === 'g2',
    );
    expect(step).toMatchObject({ y: GROUND_Y - 64, height: 64 });
    expect(
      engine.zombies.filter((z: ZombieState): boolean => !z.isDead).length,
      'its 3 zombies',
    ).toBe(3);
    expect(events(VfxEventType.CageLand).length).toBe(1);
  });

  it('an unwired cage drops at a swing; a smashing one leaves no step and spills its loot', () => {
    load([
      {
        id: 'g1',
        kind: 'cage',
        content: 'loot',
        zombies: 1,
        gold: 250,
        smashes: true,
        x: 300,
        y: GROUND_Y - 120,
        width: 64,
        height: 64,
      },
    ]);
    const p: CharacterState = engine.player!;
    p.x = 300 - GAME_CONSTANTS.PLAYER_WIDTH - 4;
    p.y = GROUND_Y - 120 + 8;
    p.isAttacking = true;
    tick(1);
    p.isAttacking = false;
    expect(state('g1').dropped).toBe(true);
    tick(60);
    expect(state('g1')).toMatchObject({ landed: true, broken: true });
    expect(engine.platforms.some((q: Platform): boolean => q.gadgetId === 'g1')).toBe(false);
    expect(engine.worldDrops.some((d: WorldDrop): boolean => d.value === 250)).toBe(true);
    expect(events(VfxEventType.CageSmash).length).toBe(1);
  });

  it('an unwired exit door stands open: standing in it leaves the floor; a plain door does not', () => {
    load([
      {
        id: 'g1',
        kind: 'door',
        latch: false,
        exit: true,
        x: 600,
        y: GROUND_Y - 128,
        width: 32,
        height: 128,
      },
      {
        id: 'g2',
        kind: 'door',
        latch: false,
        exit: false,
        x: 900,
        y: GROUND_Y - 128,
        width: 32,
        height: 128,
      },
    ]);
    tick(GAME_CONSTANTS.GADGET_DOOR_TICKS);
    const p: CharacterState = engine.player!;
    p.x = 600;
    expect(engine.leavesThroughDoor(p)).toBe(true);
    p.x = 900;
    expect(engine.leavesThroughDoor(p)).toBe(false);
  });

  it('a hidden hanging exit is out of reach', () => {
    engine.useCustomLevel({ ...room([]), exitHidden: true });
    expect(engine.exitPlatform.y + engine.exitPlatform.height).toBeLessThan(0);
    engine.useCustomLevel(room([]));
    expect(engine.exitPlatform.y).toBe(300);
  });

  it('the host sends the gadgets with every snapshot; generated floors have none', () => {
    load([crackWall]);
    expect(engine.getStateSnapshot()?.gadgets.map((s: GadgetState): string => s.id)).toEqual([
      'g2',
    ]);
    engine.floor = GENERATED_FLOOR;
    engine.useCustomLevel(null);
    expect(engine.gadgets).toEqual([]);
    expect(engine.getStateSnapshot()?.gadgets).toEqual([]);
  });
});
