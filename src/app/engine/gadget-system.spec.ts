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
import { binPushDir, binSpeedScale, stateOf } from './gadgets';

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

  const bin: (id: string, x: number, kg?: number) => Gadget = (
    id: string,
    x: number,
    kg: number = GAME_CONSTANTS.GADGET_BIN_KG,
  ): Gadget => ({ id, kind: 'bin', kg, x, y: GROUND_Y - S, width: S, height: S });

  it('a player walking into a bin rolls it ahead, and it rolls on after they let go', () => {
    load([bin('g1', 400)]);
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const player: CharacterState = engine.player!;
    player.x = 400 - GAME_CONSTANTS.PLAYER_WIDTH - 2;
    player.y = GROUND_Y - PH;
    player.isGrounded = true;
    engine.keys.right = true;
    for (let i: number = 0; i < 60; i++) {
      physics.updatePlayer();
      engine.gadgetSystem.update();
    }
    const body: GadgetBody = state('g1').body!;
    expect(player.pushingGadgetId).toBe('g1');
    expect(body.x, 'it rolled ahead').toBeGreaterThan(450);
    expect(body.velocityX).toBeCloseTo(GAME_CONSTANTS.GADGET_BIN_PUSH_SPEED, 0);
    expect(player.x + GAME_CONSTANTS.PLAYER_WIDTH, 'never walks into it').toBeLessThanOrEqual(body.x + 1);
    engine.keys.right = false;
    for (let i: number = 0; i < 3; i++) physics.updatePlayer();
    expect(player.pushingGadgetId).toBeNull();
    const letGo: number = body.x;
    tick(200);
    expect(body.x - letGo, 'it rolled on').toBeGreaterThan(30);
    expect(body.velocityX).toBe(0);
  });

  it('a bin is solid while it rolls, and walking on top of it pushes nothing', () => {
    load([bin('g1', 400)]);
    state('g1').body!.velocityX = 2;
    tick(1);
    expect(
      engine.platforms.some(
        (p: Platform): boolean => p.gadgetId === 'g1' && p.solid === true && p.pushable === true,
      ),
    ).toBe(true);
    const on: Pick<CharacterState, 'x' | 'y' | 'isDead' | 'isDown' | 'pushingGadgetId'> = {
      x: 380,
      y: GROUND_Y - S - PH,
      isDead: false,
      isDown: false,
      pushingGadgetId: 'g1',
    };
    expect(binPushDir('g1', state('g1').body!, [on]), 'on top').toBe(0);
  });

  it('checks a push: a far player, a dead one or two pushing against each other move nothing', () => {
    load([bin('g1', 400)]);
    const body: GadgetBody = state('g1').body!;
    const beside: (x: number, overrides?: Partial<CharacterState>) => CharacterState = (
      x: number,
      overrides: Partial<CharacterState> = {},
    ): CharacterState => makePlayer({ x, y: GROUND_Y - PH, pushingGadgetId: 'g1', ...overrides });
    const w: number = GAME_CONSTANTS.PLAYER_WIDTH;
    expect(binPushDir('g1', body, [beside(400 - w)])).toBe(1);
    expect(binPushDir('g1', body, [beside(400 + S)])).toBe(-1);
    expect(binPushDir('g1', body, [beside(100)]), 'too far').toBe(0);
    expect(binPushDir('g1', body, [beside(400 - w, { isDead: true })]), 'dead').toBe(0);
    expect(binPushDir('g1', body, [beside(400 - w), beside(400 + S)]), 'both sides').toBe(0);
    expect(binPushDir('g2', body, [beside(400 - w)]), 'another bin').toBe(0);
  });

  it('a heavier bin rolls slower, weighs its kg, and stops dead against a wall', () => {
    expect(binSpeedScale(GAME_CONSTANTS.GADGET_BIN_KG * 2)).toBeCloseTo(0.5);
    load([
      bin('g1', 500, 80),
      { id: 'g2', kind: 'button', x: 500, y: GROUND_Y, width: 48, height: 6, kg: 80, targets: [] },
      bin('g3', GAME_CONSTANTS.CANVAS_WIDTH - S - 2),
    ]);
    tick(1);
    expect(state('g2').kg).toBe(80);
    expect(state('g2').on).toBe(true);
    const atWall: GadgetBody = state('g3').body!;
    atWall.velocityX = GAME_CONSTANTS.GADGET_BIN_PUSH_SPEED;
    tick(2);
    expect(atWall.x).toBe(GAME_CONSTANTS.CANVAS_WIDTH - S);
    expect(atWall.velocityX).toBe(0);
  });

  it('a swing or a blast moves a bin; a boulder or bin running into one hands it speed', () => {
    load([bin('g1', 300), bin('g2', 700)]);
    engine.player!.x = 300 - GAME_CONSTANTS.PLAYER_WIDTH - 4;
    engine.player!.isAttacking = true;
    tick(1);
    engine.player!.isAttacking = false;
    expect(state('g1').body!.velocityX).toBeGreaterThan(GAME_CONSTANTS.GADGET_BIN_PUSH_SPEED);
    tick(120);
    expect(state('g2').body!.x, 'the first bin hit the second').toBe(700);

    load([
      { id: 'g1', kind: 'boulder', kg: 600, x: 300, y: GROUND_Y - S, width: S, height: S },
      bin('g2', 400),
    ]);
    state('g1').body!.velocityX = 8;
    tick(30);
    expect(state('g2').body!.x, 'the boulder knocked it on').toBeGreaterThan(420);

    load([bin('g1', 500)]);
    engine.gadgetSystem.blast({ x: 480, y: GROUND_Y - 10 });
    expect(state('g1').body!.isGrounded).toBe(false);
    expect(state('g1').body!.velocityX).toBeGreaterThan(0);
    expect(engine.platforms.some((p: Platform): boolean => p.gadgetId === 'g1'), 'flying').toBe(false);
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

  const PW: number = GAME_CONSTANTS.PLAYER_WIDTH;
  const CAGE_Y: number = GROUND_Y - 120;

  const cage: (id: string, x: number, smashes?: boolean) => Gadget = (
    id: string,
    x: number,
    smashes: boolean = false,
  ): Gadget => ({
    id,
    kind: 'cage',
    content: 'loot',
    zombies: 1,
    gold: 250,
    smashes,
    x,
    y: CAGE_Y,
    width: 64,
    height: 64,
  });

  /** One swing (hit cooldown over): the player attacks for one tick. */
  function swing(): void {
    engine.player!.isAttacking = true;
    tick(1);
    engine.player!.isAttacking = false;
  }

  function solidOf(id: string): Platform {
    const solid: Platform | undefined = engine.platforms.find(
      (p: Platform): boolean => p.gadgetId === id,
    );
    expect(solid).toBeDefined();
    return solid!;
  }

  /** The player beside the cage at x, level with it and facing it. */
  function besideCage(x: number): void {
    const p: CharacterState = engine.player!;
    p.x = x - PW - 4;
    p.y = CAGE_Y + 8;
    p.facing = Direction.Right;
  }

  /** The player on top of the cage, just left of its cable and facing it. */
  function onCage(x: number): void {
    const p: CharacterState = engine.player!;
    p.x = x + 32 - PW - 4;
    p.y = CAGE_Y - PH;
    p.isGrounded = true;
    p.facing = Direction.Right;
  }

  it('a swing at the cage only sets it swinging: it stays up and its solid moves along', () => {
    load([cage('g1', 300)]);
    besideCage(300);
    swing();
    tick(20);
    expect(state('g1').dropped).toBe(false);
    expect(state('g1').swingAngle).toBeGreaterThan(0);
    expect(solidOf('g1').x).toBeGreaterThan(300);
    expect(solidOf('g1').y).toBeLessThan(CAGE_Y);
  });

  it('the cable is rigid: a swinging cage keeps its distance from the pivot and never sinks', () => {
    load([cage('g1', 300)]);
    besideCage(300);
    swing();
    engine.player!.x = 900;
    let widest: number = 0;
    for (let i: number = 0; i < 300; i++) {
      tick(1);
      const box: Platform = solidOf('g1');
      expect(Math.hypot(box.x - 300, box.y)).toBeCloseTo(CAGE_Y, 6);
      expect(box.y).toBeLessThanOrEqual(CAGE_Y);
      widest = Math.max(widest, Math.abs(box.x - 300));
    }
    expect(widest).toBeGreaterThan(10);
  });

  it('a cage is heavy: its weight eases a hit to a gentle swing', () => {
    load([cage('g1', 300)]);
    besideCage(300);
    swing();
    engine.player!.x = 900;
    let widest: number = 0;
    for (let i: number = 0; i < 300; i++) {
      tick(1);
      widest = Math.max(widest, Math.abs(solidOf('g1').x - 300));
    }
    expect(widest, 'px off its rest spot').toBeLessThan(50);
  });

  it('a swing wears off: the cage comes back to hang still where it was placed', () => {
    load([cage('g1', 300)]);
    besideCage(300);
    swing();
    engine.player!.x = 900;
    tick(5000);
    expect(state('g1')).toMatchObject({ swingAngle: 0, swingSpeed: 0, dropped: false });
    expect(solidOf('g1')).toMatchObject({ x: 300, y: CAGE_Y });
  });

  it('a hit on the cable cuts it; a smashing cage leaves no step and spills its loot', () => {
    load([cage('g1', 300, true)]);
    onCage(300);
    swing();
    expect(state('g1').dropped).toBe(true);
    tick(60);
    expect(state('g1')).toMatchObject({ landed: true, broken: true });
    expect(engine.platforms.some((q: Platform): boolean => q.gadgetId === 'g1')).toBe(false);
    expect(engine.worldDrops.some((d: WorldDrop): boolean => d.value === 250)).toBe(true);
    expect(events(VfxEventType.CageSmash).length).toBe(1);
  });

  it('a swing from beside the cage never reaches its cable', () => {
    load([cage('g1', 300)]);
    const p: CharacterState = engine.player!;
    p.x = 300 - PW - 4;
    p.y = CAGE_Y - PH + 4;
    p.facing = Direction.Right;
    swing();
    expect(state('g1').dropped).toBe(false);
  });

  it('a wired cage takes both: its wire drops it, and so does a hit on its cable', () => {
    const lever: Gadget = {
      id: 'g9',
      kind: 'lever',
      startsOn: false,
      x: 100,
      y: GROUND_Y - 32,
      width: 16,
      height: 32,
      targets: ['g1'],
    };
    load([cage('g1', 300), lever]);
    onCage(300);
    swing();
    expect(state('g1').dropped, 'cable').toBe(true);
    load([cage('g1', 300), lever]);
    engine.player!.x = 900;
    state('g9').on = true;
    tick(1);
    expect(state('g1').dropped, 'wire').toBe(true);
  });

  it('a cut cage flies on with its swing and lands off to that side', () => {
    load([cage('g1', 300)]);
    besideCage(300);
    swing();
    // Away from the cage while the hit cooldown runs, so nothing but the swing moves it.
    engine.player!.x = 900;
    tick(GAME_CONSTANTS.GADGET_HIT_COOLDOWN_TICKS);
    const hanging: GadgetState = state('g1');
    expect(hanging.swingSpeed).toBeGreaterThan(0);
    onCage(solidOf('g1').x);
    engine.player!.y = solidOf('g1').y - PH;
    swing();
    expect(hanging.dropped).toBe(true);
    expect(hanging.body!.velocityX).toBeGreaterThan(0);
    expect(hanging.swingAngle).toBe(0);
    const cut: number = hanging.body!.x;
    tick(120);
    expect(hanging.landed).toBe(true);
    expect(hanging.body!.x).toBeGreaterThan(cut);
    expect(hanging.body!.y + 64).toBe(GROUND_Y);
  });

  it('landing on a cage swings it the way the player was heading, once, and carries them along', () => {
    load([cage('g1', 300)]);
    const p: CharacterState = engine.player!;
    p.x = 330;
    p.y = 100;
    p.isGrounded = false;
    p.velocityX = -2;
    tick(1);
    expect(state('g1').swingSpeed, 'in the air: nothing').toBe(0);
    p.y = CAGE_Y - PH;
    p.isGrounded = true;
    tick(1);
    const kick: number = state('g1').swingSpeed;
    expect(kick).toBeLessThan(0);
    p.velocityX = 0;
    const x: number = p.x;
    tick(20);
    expect(Math.abs(state('g1').swingSpeed), 'no second kick').toBeLessThanOrEqual(
      Math.abs(kick) + 0.001,
    );
    expect(p.x, 'rode it left').toBeLessThan(x);
    expect(p.y + PH).toBeCloseTo(solidOf('g1').y, 5);
  });

  it('dropping straight down on a cage swings it toward the side it landed on', () => {
    load([cage('g1', 300)]);
    const p: CharacterState = engine.player!;
    p.x = 340;
    p.y = CAGE_Y - PH;
    p.isGrounded = true;
    tick(1);
    expect(state('g1').swingSpeed).toBeGreaterThan(0);
  });

  it('a rider walking on the cage pumps it, up to the widest swing and top speed', () => {
    load([cage('g1', 300)]);
    const p: CharacterState = engine.player!;
    p.x = 320;
    p.y = CAGE_Y - PH;
    p.isGrounded = true;
    tick(1);
    const still: number = state('g1').swingSpeed;
    p.velocityX = 3;
    tick(1);
    expect(state('g1').swingSpeed).toBeGreaterThan(still - 0.001);
    for (let i: number = 0; i < 2000; i++) {
      p.velocityX = state('g1').swingSpeed >= 0 ? 3 : -3;
      p.x = solidOf('g1').x + 20;
      p.y = solidOf('g1').y - PH;
      tick(1);
      expect(Math.abs(state('g1').swingAngle)).toBeLessThanOrEqual(GAME_CONSTANTS.GADGET_CAGE_MAX_SWING);
    }
    expect(state('g1').dropped).toBe(false);
  });

  it('a corpse and a zombie lying on a swinging cage go along with it', () => {
    load([cage('g1', 300)]);
    const zombie: ZombieState = makeZombie(310);
    zombie.y = CAGE_Y - zombie.instanceHeight;
    engine.zombies = [zombie];
    besideCage(300);
    swing();
    tick(20);
    expect(zombie.x).toBeGreaterThan(310);
    expect(zombie.y + zombie.instanceHeight).toBeCloseTo(solidOf('g1').y, 5);
  });

  it('a swinging cage that hits another sets it swinging; neither falls', () => {
    load([cage('g1', 300), cage('g2', 380)]);
    besideCage(300);
    swing();
    engine.pendingVfxEvents = [];
    tick(60);
    expect(state('g2').swingAngle, 'the one it hit swings').toBeGreaterThan(0);
    expect(state('g1').dropped).toBe(false);
    expect(state('g2').dropped).toBe(false);
    expect(events(VfxEventType.HitParticles).length, 'sparks every screen sees').toBeGreaterThan(0);
  });

  it('a chain of cages passes the swing down the line', () => {
    load([cage('g1', 300), cage('g2', 380), cage('g3', 460)]);
    besideCage(300);
    swing();
    tick(120);
    expect(Math.abs(state('g3').swingAngle) + Math.abs(state('g3').swingSpeed)).toBeGreaterThan(0);
  });

  it('a boulder running into a cage and a barrel blast only swing it', () => {
    load([
      cage('g1', 300),
      { id: 'g2', kind: 'boulder', kg: 600, x: 200, y: CAGE_Y, width: S, height: S },
    ]);
    const boulder: GadgetBody = state('g2').body!;
    boulder.x = 300 - S - 2;
    boulder.y = CAGE_Y + 4;
    boulder.velocityX = GAME_CONSTANTS.GADGET_BOULDER_MAX_SPEED;
    boulder.velocityY = 0;
    boulder.isGrounded = false;
    engine.player!.x = 900;
    tick(3);
    expect(state('g1').dropped).toBe(false);
    expect(state('g1').swingSpeed).toBeGreaterThan(0);
    load([cage('g1', 300)]);
    engine.gadgetSystem.blast({ x: 300, y: CAGE_Y + 32 });
    expect(state('g1').dropped).toBe(false);
    expect(state('g1').swingSpeed).toBeGreaterThan(0);
  });

  it('a cage swinging into a wall bounces back and never passes it', () => {
    load([
      cage('g1', 300),
      {
        id: 'g2',
        kind: 'door',
        latch: false,
        exit: false,
        x: 380,
        y: CAGE_Y - 40,
        width: 32,
        height: 160,
      },
      {
        id: 'g3',
        kind: 'lever',
        startsOn: false,
        x: 900,
        y: GROUND_Y - 32,
        width: 16,
        height: 32,
        targets: ['g2'],
      },
    ]);
    besideCage(300);
    swing();
    engine.player!.x = 900;
    for (let i: number = 0; i < 100; i++) {
      tick(1);
      expect(solidOf('g1').x + 64).toBeLessThanOrEqual(380.001);
    }
  });

  it('a client swings on between snapshots, rides along, and clamps a bad snapshot', () => {
    load([cage('g1', 300)]);
    engine.isMultiplayerClient = true;
    const p: CharacterState = engine.player!;
    p.x = 320;
    p.y = CAGE_Y - PH;
    p.isGrounded = true;
    const host: GadgetState = { ...state('g1'), swingAngle: 0.1, swingSpeed: 0.01 };
    engine.applyRemoteGadgets([host]);
    expect(solidOf('g1').x).toBeGreaterThan(300);
    expect(p.x, 'the snapshot carried the rider').toBeGreaterThan(320);
    const x: number = solidOf('g1').x;
    engine.gadgetSystem.tickClient();
    expect(solidOf('g1').x).toBeGreaterThan(x);
    expect(p.y + PH).toBeCloseTo(solidOf('g1').y, 5);
    engine.applyRemoteGadgets([{ ...host, swingAngle: 99, swingSpeed: Number.NaN }]);
    expect(state('g1').swingAngle).toBe(GAME_CONSTANTS.GADGET_CAGE_MAX_SWING);
    expect(Number.isFinite(state('g1').swingSpeed)).toBe(true);
    expect(state('g1').dropped).toBe(false);
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

  it('a shut exit door is a wall: the player is stopped at it and nobody leaves', () => {
    load([
      {
        id: 'g1',
        kind: 'lever',
        startsOn: false,
        x: 300,
        y: GROUND_Y - 32,
        width: 16,
        height: 32,
        targets: ['g2'],
      },
      {
        id: 'g2',
        kind: 'door',
        latch: false,
        exit: true,
        x: 600,
        y: GROUND_Y - 128,
        width: 32,
        height: 128,
      },
    ]);
    tick(5);
    expect(state('g2').openTicks).toBe(0);
    expect(engine.platforms.some((q: Platform): boolean => q.gadgetId === 'g2')).toBe(true);
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const p: CharacterState = engine.player!;
    p.x = 540;
    engine.keys = { ...engine.keys, right: true };
    let leftThrough: boolean = false;
    for (let t: number = 0; t < 120 && p.x < 680; t++) {
      physics.updatePlayer();
      leftThrough = leftThrough || engine.leavesThroughDoor(p);
    }
    expect(p.x + GAME_CONSTANTS.PLAYER_WIDTH, 'stopped at the shut door').toBeLessThanOrEqual(600);
    expect(leftThrough, 'a shut door lets nobody out').toBe(false);
  });

  it('jumping up through a platform passes through the props standing on it', () => {
    load([]);
    const ledge: Platform = { x: 300, y: GROUND_Y - 110, width: 200, height: 16 };
    const crate: Platform = { x: 380, y: ledge.y - 32, width: 48, height: 32, solid: true, propId: 'p1' };
    engine.platforms = [...engine.platforms, ledge, crate];
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const p: CharacterState = engine.player!;
    p.x = 390;
    p.y = GROUND_Y - PH;
    p.isGrounded = false;
    p.velocityY = GAME_CONSTANTS.PLAYER_JUMP_FORCE;
    engine.keys = { ...engine.keys, right: true };
    let top: number = p.y;
    for (let t: number = 0; t < 120; t++) {
      physics.updatePlayer();
      top = Math.min(top, p.y);
      if (p.isGrounded) break;
    }
    expect(top + PH, "rose past the crate's underside").toBeLessThan(ledge.y);
    expect(p.isGrounded).toBe(true);
    expect(p.y + PH, 'landed up on the ledge or the crate').toBeLessThanOrEqual(ledge.y);
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
