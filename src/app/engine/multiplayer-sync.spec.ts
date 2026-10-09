import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GAME_CONSTANTS,
  ZOMBIE_TYPES,
  CharacterState,
  CharacterClass,
  Direction,
  VfxEvent,
  VfxEventType,
} from '@shared/index';
import { CagePuzzleState, CageState, DropType, LooseProp, PlateState, SpringState, WorldDrop, ZombieCorpse, ZombieState, ZombieType } from '@shared/game-entities';
import {
  BarrelBlastFx,
  BoulderPuzzleLayout,
  CagePuzzleLayout,
  HangingCage,
  DamageNumber,
  EntityInterpolation,
  IGameEngine,
  Platform,
  PlatePuzzleLayout,
  PlayerTint,
  SpringPuzzleLayout,
} from './engine-types';
import { BoulderPuzzleSystem } from './boulder-puzzle-system';
import { SpringPuzzleSystem } from './spring-puzzle-system';
import { CagePuzzleSystem } from './cage-puzzle-system';
import { PlatePuzzleSystem } from './plate-puzzle-system';
import { EXIT_CAGE, cleatBox, exitCageGroundBox, hangBox, landTop } from './cage-puzzle';
import { ZombieSystem } from './zombie-system';
import { CarryPose } from './corpse-carry';
import { CorpseDrape } from './corpse-drape';
import { buttonBox, newSpringState, scaleBox, springSpan } from './spring-puzzle';
import { exitPlatformY, isExplosive, pickableProps, Prop } from './level-generator';
import { LoosePropSystem } from './loose-prop-system';
import { ExplodingBarrelSystem } from './exploding-barrel-system';
import { Box, BoulderPath, boulderPath, gateBox, pointAlong } from './boulder-puzzle';
import { PhysicsSystem } from './physics-system';
import { VfxSystem } from './vfx-system';
import { CombatSystem } from './combat-system';
import { DropSystem } from './drop-system';
import { ProjectileSystem } from './projectile-system';
import { SpriteAnimator } from './sprite-animator';
import { ZombieAnimState } from './zombie-sprite-animator';
import { GameEngine } from './game-engine';

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
    x: 400,
    y: GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
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

function makeZombie(overrides: Partial<ZombieState> = {}): ZombieState {
  const def = ZOMBIE_TYPES[ZombieType.Walker];
  return {
    id: 'zombie-1',
    type: ZombieType.Walker,
    hp: 100,
    maxHp: 100,
    x: 500,
    y: GAME_CONSTANTS.GROUND_Y - 50,
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
    ...overrides,
  };
}

function createMockCanvas(): HTMLCanvasElement {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  const ctx: Record<string, unknown> = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 10 }),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    imageSmoothingEnabled: true,
    canvas,
  };
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return canvas;
}

describe('Damage numbers synced via VfxEvents (not HP-delta fallback)', () => {
  let engine: GameEngine;

  beforeEach(() => {
    const canvas: HTMLCanvasElement = createMockCanvas();
    engine = new GameEngine(canvas);
    engine.isMultiplayerClient = true;
    engine.player = makePlayer();
  });

  it('applyRemoteZombies should NOT spawn damage numbers from HP deltas', () => {
    const zombie: ZombieState = makeZombie({ id: 'z1', hp: 100 });
    engine.applyRemoteZombies([{ ...zombie }]);

    const damagedZombie: ZombieState = { ...zombie, hp: 70 };
    engine.applyRemoteZombies([damagedZombie]);

    expect(engine.damageNumbers.length).toBe(0);
  });

  it('applyRemoteZombies should NOT spawn hit marks from HP deltas', () => {
    const zombie: ZombieState = makeZombie({ id: 'z1', hp: 100 });
    engine.applyRemoteZombies([{ ...zombie }]);

    const damagedZombie: ZombieState = { ...zombie, hp: 70 };
    engine.applyRemoteZombies([damagedZombie]);

    expect(engine.hitMarks.length).toBe(0);
  });

  it('replayRemoteVfxEvents should spawn crit damage number with correct isCrit and color', () => {
    const events: VfxEvent[] = [{
      type: VfxEventType.DamageNumber,
      playerId: 'remote-player',
      x: 500,
      y: 400,
      value: 150,
      isCrit: true,
      color: '#ffaa00',
    }];

    engine.replayRemoteVfxEvents(events);

    expect(engine.damageNumbers.length).toBe(1);
    const dn: DamageNumber = engine.damageNumbers[0];
    expect(dn.value).toBe(150);
    expect(dn.isCrit).toBe(true);
    expect(dn.color).toBe('#ffaa00');
  });

  it('replayRemoteVfxEvents should spawn non-crit damage number correctly', () => {
    const events: VfxEvent[] = [{
      type: VfxEventType.DamageNumber,
      playerId: 'remote-player',
      x: 500,
      y: 400,
      value: 42,
      isCrit: false,
      color: '#ffffff',
    }];

    engine.replayRemoteVfxEvents(events);

    expect(engine.damageNumbers.length).toBe(1);
    const dn: DamageNumber = engine.damageNumbers[0];
    expect(dn.value).toBe(42);
    expect(dn.isCrit).toBe(false);
    expect(dn.color).toBe('#ffffff');
  });

  it('replayRemoteVfxEvents should skip events from own player', () => {
    const events: VfxEvent[] = [{
      type: VfxEventType.DamageNumber,
      playerId: 'player-1',
      x: 500,
      y: 400,
      value: 100,
      isCrit: true,
      color: '#ffaa00',
    }];

    engine.replayRemoteVfxEvents(events);

    expect(engine.damageNumbers.length).toBe(0);
  });

  it('replayRemoteVfxEvents should replay hit marks from remote events', () => {
    const events: VfxEvent[] = [{
      type: VfxEventType.HitMark,
      playerId: 'remote-player',
      x: 500,
      y: 400,
    }];

    engine.replayRemoteVfxEvents(events);

    expect(engine.hitMarks.length).toBe(1);
  });
});

describe('Lightning: the host strikes, every guest draws the same bolt', () => {
  let engine: GameEngine;
  let vfx: VfxSystem;

  beforeEach(() => {
    engine = new GameEngine(createMockCanvas());
    engine.player = makePlayer();
    vfx = new VfxSystem(engine);
  });

  it('the host strikes when its timer runs out and queues the Lightning event', () => {
    engine.isMultiplayerHost = true;
    engine.lightningTimerMs = 0;

    vfx.updateLightning(true);

    expect(engine.lightning).not.toBeNull();
    expect(engine.screenShakeFrames).toBe(GAME_CONSTANTS.LIGHTNING_SHAKE_FRAMES);
    const sent: VfxEvent[] = engine.pendingVfxEvents.filter(
      (e: VfxEvent): boolean => e.type === VfxEventType.Lightning,
    );
    expect(sent.length).toBe(1);
    expect(sent[0].x).toBe(engine.lightning!.x);
    expect(sent[0].value).toBe(engine.lightning!.seed);
    expect(engine.lightningTimerMs).toBeGreaterThanOrEqual(GAME_CONSTANTS.LIGHTNING_MIN_INTERVAL_MS);
    expect(engine.lightningTimerMs).toBeLessThanOrEqual(GAME_CONSTANTS.LIGHTNING_MAX_INTERVAL_MS);
  });

  it('a guest never strikes on its own; it replays the host strike and lets it fade', () => {
    engine.isMultiplayerClient = true;
    engine.lightningTimerMs = 0;
    vfx.updateLightning(false);
    expect(engine.lightning).toBeNull();
    expect(engine.pendingVfxEvents.length).toBe(0);

    engine.replayRemoteVfxEvents([
      { type: VfxEventType.Lightning, playerId: 'host', x: 420, y: 100, value: 777 },
    ]);
    expect(engine.lightning).toEqual({ x: 420, seed: 777, ageMs: 0 });
    expect(engine.screenShakeFrames).toBe(GAME_CONSTANTS.LIGHTNING_SHAKE_FRAMES);

    const ticks: number = Math.ceil(GAME_CONSTANTS.LIGHTNING_DURATION_MS / (1000 / GAME_CONSTANTS.TICK_RATE));
    for (let i: number = 0; i < ticks; i++) vfx.updateLightning(false);
    expect(engine.lightning).toBeNull();
  });
});

describe('Combat system pushes VfxEvents with crit info for zombie damage', () => {
  let engine: IGameEngine;
  let combat: CombatSystem;

  beforeEach(() => {
    const player: CharacterState = makePlayer({ derived: { maxHp: 200, maxMp: 50, attack: 20, defense: 5, speed: 3, critRate: 100, critDamage: 200 } });
    const zombie: ZombieState = makeZombie({
      id: 'z1',
      hp: 9999,
      x: player.x + GAME_CONSTANTS.PLAYER_WIDTH + 2,
      y: player.y,
    });
    engine = makeMockEngine(player, [zombie]);

    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const vfx: VfxSystem = new VfxSystem(engine);
    const dropSystem: DropSystem = new DropSystem(engine, physics, vfx);
    combat = new CombatSystem(engine, physics, vfx, dropSystem);
  });

  it('should push DamageNumber VfxEvent with isCrit=true when basic attack crits', () => {
    combat.performAttack();
    engine.attackHitDelay = 0;
    combat.updateAttackTiming();

    const dmgEvents: VfxEvent[] = engine.pendingVfxEvents.filter(
      (e: VfxEvent) => e.type === VfxEventType.DamageNumber,
    );
    expect(dmgEvents.length).toBeGreaterThan(0);

    const critEvent: VfxEvent | undefined = dmgEvents.find((e: VfxEvent) => e.isCrit === true);
    expect(critEvent).toBeDefined();
    expect(critEvent!.color).toBe('#ffaa00');
  });

  it('should push HitParticles and HitMark VfxEvents for basic attack', () => {
    combat.performAttack();
    engine.attackHitDelay = 0;
    combat.updateAttackTiming();

    const hitParticles: VfxEvent[] = engine.pendingVfxEvents.filter(
      (e: VfxEvent) => e.type === VfxEventType.HitParticles,
    );
    const hitMarks: VfxEvent[] = engine.pendingVfxEvents.filter(
      (e: VfxEvent) => e.type === VfxEventType.HitMark,
    );

    expect(hitParticles.length).toBeGreaterThan(0);
    expect(hitMarks.length).toBeGreaterThan(0);
  });

  it('should push DamageNumber VfxEvent with isCrit=false when attack does not crit', () => {
    engine.player!.derived.critRate = 0;

    combat.performAttack();
    engine.attackHitDelay = 0;
    combat.updateAttackTiming();

    const dmgEvents: VfxEvent[] = engine.pendingVfxEvents.filter(
      (e: VfxEvent) => e.type === VfxEventType.DamageNumber,
    );
    expect(dmgEvents.length).toBeGreaterThan(0);

    const nonCritEvent: VfxEvent | undefined = dmgEvents.find((e: VfxEvent) => e.isCrit === false);
    expect(nonCritEvent).toBeDefined();
    expect(nonCritEvent!.color).toBe('#ffffff');
  });
});

function makeMockEngine(player: CharacterState, zombies: ZombieState[]): IGameEngine {
  const groundPlatform: Platform = {
    x: -100,
    y: GAME_CONSTANTS.GROUND_Y,
    width: GAME_CONSTANTS.CANVAS_WIDTH + 200,
    height: 100,
  };

  return {
    ctx: {} as CanvasRenderingContext2D,
    fixedDt: 1000 / GAME_CONSTANTS.TICK_RATE,
    player,
    levelUpNotification: null,
    zombies,
    zombieCorpses: [],
    looseProps: [],
    carryPoses: new Map<string, CarryPose>(),
    corpseDrapes: new Map<string, CorpseDrape>(),
    particles: [],
    damageNumbers: [],
    dropNotifications: [],
    DROP_NOTIFICATION_LIFE_TICKS: 250,
    worldDrops: [],
    platforms: [groundPlatform],
    ropes: [],
    keys: { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false, skill3: false, skill4: false, skill5: false, skill6: false, openStats: false, openSkills: false, useHpPotion: false, useMpPotion: false, openShop: false, openInventory: false, revive: false, carry: false, quickSlot1: false, quickSlot2: false, quickSlot3: false, quickSlot4: false, quickSlot5: false, quickSlot6: false, quickSlot7: false, quickSlot8: false, quickSlot9: false, quickSlot10: false, quickSlot11: false, quickSlot12: false },
    attackCooldown: 0,
    attackAnimTicks: 0,
    attackHitPending: false,
    attackHitDelay: 0,
    invincibilityFrames: 0,
    potionCooldown: 0,
    jumpBufferTicks: 0,
    ropeJumpCooldown: 0,
    platformDropTimer: 0,
    playerUsableSkills: [],
    skillCooldowns: new Map(),
    passiveRecoveryTimers: new Map(),
    playerStandingStillTicks: 0,
    playerStunTicks: 0,
    autoPotionCooldown: 0,
    floor: 1,
    spawnTimer: 999,
    eaterSpawnTimer: 999,
    floorTransitionTimer: 0,
    exitPlatform: {
      x: (GAME_CONSTANTS.CANVAS_WIDTH - 250) / 2,
      y: 130,
      width: 250,
      height: 20,
    },
    backgroundStars: [],
    screenShakeFrames: 0,
    screenShakeIntensity: 0,
    screenFlashColor: null,
    screenFlashFrames: 0,
    lightning: null,
    lightningTimerMs: 0,
    spriteAnimator: { setState: vi.fn(), tick: vi.fn(), restart: vi.fn(), load: vi.fn(), isLoaded: vi.fn().mockReturnValue(false), draw: vi.fn() } as never,
    zombieSpriteAnimator: {
      getSpriteKey: vi.fn().mockReturnValue('zombie_1'),
      getAnchor: vi.fn().mockReturnValue({ anchorX: 0.5, anchorY: 1.0 }),
      tick: vi.fn(),
      setState: vi.fn(),
      setStateReversed: vi.fn(),
      setStateAtFrame: vi.fn(),
      setFinalFrame: vi.fn(),
      removeInstance: vi.fn(),
      load: vi.fn(),
      isLoaded: vi.fn().mockReturnValue(false),
      draw: vi.fn(),
      getFrameCount: vi.fn().mockReturnValue(5),
    } as never,
    mapRenderer: { load: vi.fn(), isLoaded: vi.fn().mockReturnValue(false), render: vi.fn() } as never,
    spriteEffectSystem: { load: vi.fn(), isLoaded: vi.fn().mockReturnValue(false), spawn: vi.fn(), tick: vi.fn(), render: vi.fn() } as never,
    SPRITE_RENDER_SIZE: 96,
    dragonProjectiles: [],
    dragonImpacts: [],
    barrelBlasts: [],
    dragonProjectileImg: new Image(),
    dragonImpactImg: new Image(),
    spitterProjectiles: [],
    poisonEffect: null,
    playerTints: new Map<string, PlayerTint>(),
    DRAGON_PROJ_FRAME_W: 105,
    DRAGON_PROJ_FRAME_H: 118,
    DRAGON_PROJ_FRAMES: 3,
    DRAGON_IMPACT_FRAME_W: 85,
    DRAGON_IMPACT_FRAME_H: 131,
    DRAGON_IMPACT_FRAMES: 4,
    hitMarks: [],
    playerProjectiles: [],
    HIT_MARK_TICKS_PER_FRAME: 3,
    HIT_MARK_RENDER_SIZE: 55,
    doubleJumpUsed: false,
    doubleJumpAnimTicks: 0,
    dashPhase: null,
    reviveTargetId: null,
    carryKeyLabel: 'E',
    reviveProgressTicks: 0,
    activeSpecialEffects: [],
    pendingSpecialDropConfirm: null,
    godMode: false,
    showCollisionBoxes: false,
    isMultiplayerHost: false,
    isMultiplayerClient: false,
    pendingLocalKills: new Set<string>(),
    pendingRemoteAttacks: [],
    pendingReviveTargetIds: [],
    pendingSpecialDropActivations: [],
    pendingVfxEvents: [],
    pendingPullEvents: [],
    remotePlayers: [],
    remotePlayerAnimators: new Map<string, SpriteAnimator>(),
    zombieInterpolation: new Map<string, EntityInterpolation>(),
    remotePlayerInterpolation: new Map<string, EntityInterpolation>(),
    repositionExitPlatform: vi.fn(),
    applyLevel: vi.fn(),
    requestHitStop: vi.fn(),
    isInSafeSpot: vi.fn((): boolean => false),
    boulderPuzzle: null,
    boulder: null,
    springPuzzle: null,
    spring: null,
    cagePuzzle: null,
    cages: null,
    platePuzzle: null,
    plate: null,
    breakPuzzleWall: vi.fn(),
    breakPuzzleGate: vi.fn(),
    puzzleWall: vi.fn((): Platform | null => null),
    placeCages: vi.fn(),
    onPlayerUpdate: null,
    onZombiesUpdate: null,
    onFloorUpdate: null,
    onFloorComplete: null,
    onXpGained: null,
    onScoreUpdate: null,
    onGameOver: null,
    onGoldPickup: null,
    onPotionPickup: null,
    onSpecialDropPickup: null,
    onUseHpPotion: null,
    onUseMpPotion: null,
    onOpenShop: null,
    onZombieDamaged: null,
    onRemotePlayerDamaged: null,
    onPlayerRevived: null,
    onPlayerDowned: null,
    onPlayerDownExpired: null,
  };
}

describe('Bug 2: corpse animation on non-host when killing non-grounded zombie', () => {
  let engine: IGameEngine;
  let combat: CombatSystem;

  beforeEach(() => {
    const player: CharacterState = makePlayer();
    engine = makeMockEngine(player, []);
    engine.isMultiplayerClient = true;

    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const vfx: VfxSystem = new VfxSystem(engine);
    const dropSystem = { rollDrops: vi.fn() } as never;
    combat = new CombatSystem(engine, physics, vfx, dropSystem);
  });

  it('should set corpse animation to Dead (not Hurt) on multiplayer client even when zombie is airborne', () => {
    const zombie: ZombieState = makeZombie({
      id: 'z-air',
      hp: 0,
      isGrounded: false,
      velocityY: -5,
    });
    engine.zombies = [zombie];

    combat.handleZombieDeath(zombie, false);

    const setStateCalls: Array<[string, ZombieAnimState]> = (
      engine.zombieSpriteAnimator.setState as ReturnType<typeof vi.fn>
    ).mock.calls as Array<[string, ZombieAnimState]>;

    const lastCall: [string, ZombieAnimState] | undefined = setStateCalls.find(
      (call: [string, ZombieAnimState]) => call[0] === 'z-air',
    );

    expect(lastCall).toBeDefined();
    expect(lastCall![1]).toBe(ZombieAnimState.Dead);
  });

  it('should still use Hurt animation on host for airborne zombie kills', () => {
    engine.isMultiplayerClient = false;
    engine.isMultiplayerHost = true;

    const zombie: ZombieState = makeZombie({
      id: 'z-air-host',
      hp: 0,
      isGrounded: false,
      velocityY: -5,
    });
    engine.zombies = [zombie];

    combat.handleZombieDeath(zombie, false);

    const setStateCalls: Array<[string, ZombieAnimState]> = (
      engine.zombieSpriteAnimator.setState as ReturnType<typeof vi.fn>
    ).mock.calls as Array<[string, ZombieAnimState]>;

    const call: [string, ZombieAnimState] | undefined = setStateCalls.find(
      (c: [string, ZombieAnimState]) => c[0] === 'z-air-host',
    );

    expect(call).toBeDefined();
    expect(call![1]).toBe(ZombieAnimState.Hurt);
  });
});

describe('Boulder puzzle (floor 2)', (): void => {
  let engine: GameEngine;

  function systemFor(e: GameEngine): BoulderPuzzleSystem {
    const physics: PhysicsSystem = new PhysicsSystem(e);
    const vfx: VfxSystem = new VfxSystem(e);
    const drops: DropSystem = new DropSystem(e, physics, vfx);
    return new BoulderPuzzleSystem(e, new CombatSystem(e, physics, vfx, drops), vfx);
  }

  /** A player on the ledge right next to the gate, attacking, facing it (or away). */
  function playerAtGate(e: GameEngine, facingGate: boolean, id: string = 'player-1'): CharacterState {
    const puzzle: BoulderPuzzleLayout = e.boulderPuzzle!;
    const gate: Box = gateBox(puzzle, e.exitPlatform.y);
    const x: number =
      puzzle.wallDir === 1 ? gate.x - GAME_CONSTANTS.PLAYER_WIDTH - 4 : gate.x + gate.width + 4;
    const toward: Direction = puzzle.wallDir === 1 ? Direction.Right : Direction.Left;
    const away: Direction = toward === Direction.Right ? Direction.Left : Direction.Right;
    return makePlayer({
      id,
      x,
      y: e.exitPlatform.y - GAME_CONSTANTS.PLAYER_HEIGHT,
      facing: facingGate ? toward : away,
      isAttacking: true,
    });
  }

  function hasEvent(e: GameEngine, type: VfxEventType): boolean {
    return e.pendingVfxEvents.some((evt: VfxEvent): boolean => evt.type === type);
  }

  beforeEach((): void => {
    engine = new GameEngine(createMockCanvas());
    engine.player = makePlayer();
    engine.setFloor(GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR);
  });

  it('floor 2: the exit platform is the boulder ledge, the wall is solid and breakable, the boulder waits', (): void => {
    const puzzle: BoulderPuzzleLayout = engine.boulderPuzzle!;
    expect(engine.exitPlatform.x).toBe(puzzle.ledgeX);
    expect(engine.boulder).toEqual({ gateHits: 0, progress: 0, speed: 0, wallBroken: false });
    expect(engine.platforms.filter((p: Platform): boolean => p.puzzlePart === 'wall')).toHaveLength(1);
    expect(engine.puzzleWall()).toEqual(puzzle.wall);
  });

  it('three hits break the gate, the boulder rolls down and breaks the wall', (): void => {
    const sys: BoulderPuzzleSystem = systemFor(engine);
    engine.player = playerAtGate(engine, true);
    const swing: number = GAME_CONSTANTS.BOULDER_HIT_COOLDOWN_TICKS + 1;
    for (let t: number = 0; t < swing * (GAME_CONSTANTS.BOULDER_GATE_HITS - 1); t++) sys.update();
    expect(engine.boulder!.gateHits).toBe(GAME_CONSTANTS.BOULDER_GATE_HITS - 1);
    expect(engine.boulder!.progress).toBe(0);
    for (let t: number = 0; t < 300; t++) sys.update();
    expect(hasEvent(engine, VfxEventType.GateBreak)).toBe(true);
    expect(engine.boulder!.wallBroken).toBe(true);
    expect(engine.puzzleWall()).toBeNull();
    expect(engine.platforms.some((p: Platform): boolean => p.puzzlePart === 'wall')).toBe(false);
    expect(hasEvent(engine, VfxEventType.WallBreak)).toBe(true);
  });

  it('the gate is a solid block on the ledge edge, follows the ledge height, and is gone once broken', (): void => {
    const gateSolid: () => Platform | undefined = (): Platform | undefined =>
      engine.platforms.find((p: Platform): boolean => p.puzzlePart === 'gate');
    const expected: Box = gateBox(engine.boulderPuzzle!, engine.exitPlatform.y);
    expect(gateSolid()).toEqual({ ...expected, solid: true, puzzlePart: 'gate' });
    engine.remotePlayers = [makePlayer({ id: 'guest' })];
    engine.repositionExitPlatform();
    expect(gateSolid()!.y).toBe(gateBox(engine.boulderPuzzle!, engine.exitPlatform.y).y);
    expect(gateSolid()!.y).toBeLessThan(expected.y);
    engine.breakPuzzleGate();
    expect(gateSolid()).toBeUndefined();
    engine.repositionExitPlatform();
    expect(gateSolid(), 'a broken gate stays broken when the ledge moves').toBeUndefined();
  });

  it('attacking while facing away from the gate does nothing', (): void => {
    const sys: BoulderPuzzleSystem = systemFor(engine);
    engine.player = playerAtGate(engine, false);
    for (let t: number = 0; t < 300; t++) sys.update();
    expect(engine.boulder!.gateHits).toBe(0);
  });

  it("the host counts a guest's hits on the gate", (): void => {
    engine.isMultiplayerHost = true;
    const sys: BoulderPuzzleSystem = systemFor(engine);
    engine.remotePlayers = [playerAtGate(engine, true, 'guest')];
    for (let t: number = 0; t < 300; t++) sys.update();
    expect(engine.boulder!.wallBroken).toBe(true);
  });

  it('the rolling boulder crushes a zombie in the chute once; the falling wall crushes one in front of it', (): void => {
    const sys: BoulderPuzzleSystem = systemFor(engine);
    const puzzle: BoulderPuzzleLayout = engine.boulderPuzzle!;
    const path: BoulderPath = boulderPath(puzzle, engine.exitPlatform.y);
    const mid: { x: number; y: number } = pointAlong(path, path.length / 2);
    const inChute: ZombieState = makeZombie({
      id: 'z-chute',
      x: mid.x - 15,
      y: mid.y - 20,
      hp: 1000,
      maxHp: 1000,
      instanceWidth: 30,
      instanceHeight: 40,
    });
    const wallFace: number = puzzle.wallDir === 1 ? puzzle.wall.x - 40 : puzzle.wall.x + puzzle.wall.width + 10;
    const byWall: ZombieState = makeZombie({
      id: 'z-wall',
      x: wallFace,
      y: GAME_CONSTANTS.GROUND_Y - 40,
      hp: 1000,
      maxHp: 1000,
      instanceWidth: 30,
      instanceHeight: 40,
    });
    engine.zombies = [inChute, byWall];
    engine.boulder!.gateHits = GAME_CONSTANTS.BOULDER_GATE_HITS;
    for (let t: number = 0; t < 300; t++) sys.update();
    const crushHp: number = 1000 - Math.ceil((1000 * GAME_CONSTANTS.BOULDER_CRUSH_DAMAGE_PERCENT) / 100);
    expect(inChute.hp).toBe(crushHp);
    expect(byWall.hp).toBe(crushHp);
  });

  it('a client applies the synced boulder: NaN ignored, clamped onto its path, wall removed once broken', (): void => {
    engine.isMultiplayerClient = true;
    const path: BoulderPath = boulderPath(engine.boulderPuzzle!, engine.exitPlatform.y);
    engine.applyRemoteBoulder({ gateHits: 99, progress: 99_999, speed: 500, wallBroken: false });
    expect(engine.boulder!.gateHits).toBe(GAME_CONSTANTS.BOULDER_GATE_HITS);
    expect(engine.boulder!.progress).toBe(path.length);
    expect(engine.boulder!.speed).toBe(GAME_CONSTANTS.BOULDER_MAX_SPEED);
    engine.applyRemoteBoulder({ gateHits: 0, progress: Number.NaN, speed: 0, wallBroken: true });
    expect(engine.boulder!.progress).toBe(path.length);
    expect(engine.puzzleWall()).not.toBeNull();
    engine.applyRemoteBoulder({ gateHits: 3, progress: path.length, speed: 0, wallBroken: true });
    expect(engine.puzzleWall()).toBeNull();
    expect(engine.platforms.some((p: Platform): boolean => p.puzzlePart === 'wall')).toBe(false);
  });

  it('replaying the gate and wall breaks spawns debris and shakes the screen', (): void => {
    engine.replayRemoteVfxEvents([{ type: VfxEventType.GateBreak, playerId: 'host', x: 900, y: 280 }]);
    expect(engine.particles.length).toBeGreaterThan(0);
    const afterGate: number = engine.particles.length;
    engine.replayRemoteVfxEvents([{ type: VfxEventType.WallBreak, playerId: 'host', x: 1248, y: 560 }]);
    expect(engine.particles.length).toBeGreaterThan(afterGate);
    expect(engine.screenShakeFrames).toBeGreaterThan(0);
  });

  it('the snapshot carries the boulder', (): void => {
    expect(engine.getStateSnapshot()!.boulder).toEqual(engine.boulder);
  });

  it('floor 3 has no boulder puzzle, no wall, and the exit hangs at a screen edge again', (): void => {
    engine.breakPuzzleWall();
    engine.setFloor(GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR + 1);
    expect(engine.boulderPuzzle).toBeNull();
    expect(engine.boulder).toBeNull();
    expect(engine.puzzleWall()).toBeNull();
    const exitCenter: number = engine.exitPlatform.x + engine.exitPlatform.width / 2;
    expect(Math.abs(exitCenter - GAME_CONSTANTS.CANVAS_WIDTH / 2)).toBeGreaterThan(400);
  });
});

describe('Spring puzzle (floor 3)', (): void => {
  let engine: GameEngine;

  function systemFor(e: GameEngine): SpringPuzzleSystem {
    return new SpringPuzzleSystem(e, new VfxSystem(e));
  }

  /** A player on the ground beside the button (on the screen-center side), attacking, facing it. */
  function playerAtButton(e: GameEngine, id: string = 'player-1'): CharacterState {
    const puzzle: SpringPuzzleLayout = e.springPuzzle!;
    const button: Box = buttonBox(puzzle);
    const x: number =
      puzzle.side === 1 ? button.x - GAME_CONSTANTS.PLAYER_WIDTH - 4 : button.x + button.width + 4;
    return makePlayer({
      id,
      x,
      y: GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
      facing: puzzle.side === 1 ? Direction.Right : Direction.Left,
      isAttacking: true,
      isGrounded: true,
    });
  }

  /** A player standing on the spring's plate, above the middle of the exit. */
  function playerOnSpring(e: GameEngine, id: string = 'player-1'): CharacterState {
    const exit: Platform = e.exitPlatform;
    return makePlayer({
      id,
      x: exit.x + exit.width / 2 - GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: e.springPuzzle!.spring.y - GAME_CONSTANTS.PLAYER_HEIGHT,
      isGrounded: true,
    });
  }

  function lyingCorpse(id: string, cx: number, feetY: number): ZombieCorpse {
    return {
      id,
      type: ZombieType.Walker,
      x: cx - 20,
      y: feetY - 30,
      width: 40,
      height: 30,
      spriteKey: 'walker',
      facing: 1,
      velocityX: 0,
      velocityY: 0,
      isGrounded: true,
      frozen: false,
      landProcessed: true,
      fadeTimer: 999,
      maxFadeTimer: 999,
      showBlood: false,
      carrierId: null,
    };
  }

  /** Walker corpses lying on the scale's pan, a few deep. */
  function loadScale(e: GameEngine, count: number): void {
    const pan: Box = scaleBox(e.springPuzzle!);
    for (let i: number = 0; i < count; i++) {
      const cx: number = pan.x + 24 + ((pan.width - 48) * (i % 4)) / 3;
      const feet: number = GAME_CONSTANTS.GROUND_Y - Math.floor(i / 4) * 5;
      e.zombieCorpses.push(lyingCorpse(`load-${i}`, cx, feet));
    }
  }

  const WALKER_KG: number = ZOMBIE_TYPES[ZombieType.Walker].weightKg;
  /** Walker corpses enough to hold the button up. */
  const ENOUGH: number = Math.ceil(GAME_CONSTANTS.SPRING_SCALE_KG_NEEDED / WALKER_KG);

  function hasEvent(e: GameEngine, type: VfxEventType): boolean {
    return e.pendingVfxEvents.some((evt: VfxEvent): boolean => evt.type === type);
  }

  beforeEach((): void => {
    engine = new GameEngine(createMockCanvas());
    engine.player = makePlayer();
    engine.setFloor(GAME_CONSTANTS.PUZZLE_SPRING_FLOOR);
  });

  it('floor 3: a solid spring under the whole exit (at the top for any party size), the scale on the far side', (): void => {
    const puzzle: SpringPuzzleLayout = engine.springPuzzle!;
    expect(engine.spring).toEqual(newSpringState());
    const block: Platform[] = engine.platforms.filter(
      (p: Platform): boolean => p.puzzlePart === 'spring',
    );
    expect(block).toEqual([{ ...puzzle.spring, solid: true, puzzlePart: 'spring' }]);
    const [left, right]: [number, number] = springSpan(puzzle);
    expect(left).toBeLessThanOrEqual(engine.exitPlatform.x);
    expect(right).toBeGreaterThanOrEqual(engine.exitPlatform.x + engine.exitPlatform.width);
    const panCenter: number = puzzle.scaleX + GAME_CONSTANTS.SPRING_SCALE_WIDTH_PX / 2;
    const half: number = GAME_CONSTANTS.CANVAS_WIDTH / 2;
    expect(Math.sign(panCenter - half), 'scale on the far half').toBe(-puzzle.side);
    expect(engine.exitPlatform.y).toBe(GAME_CONSTANTS.SPRING_LEDGE_Y);
    engine.remotePlayers = [makePlayer({ id: 'guest' })];
    engine.repositionExitPlatform();
    expect(engine.exitPlatform.y).toBe(GAME_CONSTANTS.SPRING_LEDGE_Y);
  });

  it('loaded: the cable raises the button, a hit starts the 3-2-1, the spring launches the player onto the exit', (): void => {
    const sys: SpringPuzzleSystem = systemFor(engine);
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    loadScale(engine, ENOUGH);
    const onSpring: ZombieCorpse = lyingCorpse(
      'on-spring',
      engine.exitPlatform.x + engine.exitPlatform.width / 2,
      engine.springPuzzle!.spring.y,
    );
    engine.zombieCorpses.push(onSpring);
    engine.player = playerAtButton(engine);
    sys.update();
    expect(engine.spring!.scaleKg).toBeGreaterThanOrEqual(GAME_CONSTANTS.SPRING_SCALE_KG_NEEDED);
    expect(engine.spring!.countdownTicks, 'the button is still sunk').toBe(0);
    for (let t: number = 0; t < GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS; t++) sys.update();
    expect(engine.spring!.buttonTicks).toBe(GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS);
    expect(engine.spring!.countdownTicks).toBeGreaterThan(0);
    expect(hasEvent(engine, VfxEventType.HitParticles)).toBe(true);
    expect(engine.spring!.launches).toBe(0);
    // Hop on (still walking when it fires: the launch is straight up all the same).
    const player: CharacterState = { ...playerOnSpring(engine), velocityX: 2 };
    engine.player = player;
    for (
      let t: number = 0;
      t < GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS && engine.spring!.launches === 0;
      t++
    ) {
      sys.update();
    }
    expect(engine.spring!.launches).toBe(1);
    expect(hasEvent(engine, VfxEventType.SpringLaunch)).toBe(true);
    expect(player.velocityY).toBe(-GAME_CONSTANTS.SPRING_LAUNCH_FORCE);
    expect(player.velocityX).toBe(0);
    let peakFeet: number = player.y + GAME_CONSTANTS.PLAYER_HEIGHT;
    for (let t: number = 0; t < 200; t++) {
      physics.updatePlayer();
      peakFeet = Math.min(peakFeet, player.y + GAME_CONSTANTS.PLAYER_HEIGHT);
      if (t > 5 && player.isGrounded) break;
    }
    expect(peakFeet, 'rose above the exit').toBeLessThan(engine.exitPlatform.y);
    expect(player.y + GAME_CONSTANTS.PLAYER_HEIGHT, 'landed on the exit').toBe(
      engine.exitPlatform.y,
    );
    // The corpse on the spring flew off, out over the open side; the scale's load stays put.
    expect(onSpring.isGrounded).toBe(false);
    expect(onSpring.velocityY).toBeLessThan(0);
    expect(Math.sign(onSpring.velocityX)).toBe(-engine.springPuzzle!.side);
    const load: ZombieCorpse[] = engine.zombieCorpses.filter(
      (c: ZombieCorpse): boolean => c.id.startsWith('load-'),
    );
    expect(load.every((c: ZombieCorpse): boolean => c.isGrounded)).toBe(true);
  });

  it('too light: the button never rises, hits do nothing and nobody flies', (): void => {
    const sys: SpringPuzzleSystem = systemFor(engine);
    loadScale(engine, ENOUGH - 1);
    engine.player = playerAtButton(engine);
    for (let t: number = 0; t < GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS + 300; t++) sys.update();
    expect(engine.spring!.scaleKg).toBeLessThan(GAME_CONSTANTS.SPRING_SCALE_KG_NEEDED);
    expect(engine.spring!.buttonTicks).toBe(0);
    expect(engine.spring!.countdownTicks).toBe(0);
    expect(engine.spring!.launches).toBe(0);
    expect(hasEvent(engine, VfxEventType.HitParticles)).toBe(false);
  });

  it('the weight leaving the scale lets the button sink back', (): void => {
    const sys: SpringPuzzleSystem = systemFor(engine);
    loadScale(engine, ENOUGH);
    for (let t: number = 0; t < GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS; t++) sys.update();
    expect(engine.spring!.buttonTicks).toBe(GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS);
    engine.zombieCorpses = [];
    for (let t: number = 0; t < GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS; t++) sys.update();
    expect(engine.spring!.scaleKg).toBe(0);
    expect(engine.spring!.buttonTicks).toBe(0);
  });

  it("the host weighs a guest on the scale with what they carry, and counts another guest's press", (): void => {
    engine.isMultiplayerHost = true;
    const sys: SpringPuzzleSystem = systemFor(engine);
    loadScale(engine, ENOUGH - 2);
    const pan: Box = scaleBox(engine.springPuzzle!);
    const onScale: CharacterState = makePlayer({
      id: 'heavy-guest',
      x: pan.x + pan.width / 2 - GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
      isGrounded: true,
    });
    engine.zombieCorpses.push({ ...lyingCorpse('carried', 0, 0), carrierId: 'heavy-guest' });
    engine.remotePlayers = [onScale, playerAtButton(engine, 'guest')];
    sys.update();
    expect(engine.spring!.scaleKg).toBe(
      (ENOUGH - 1) * WALKER_KG + GAME_CONSTANTS.PLAYER_WEIGHT_KG,
    );
    for (
      let t: number = 0;
      t <= GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS + GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS;
      t++
    ) {
      sys.update();
    }
    expect(engine.spring!.launches).toBe(1);
    expect(engine.player!.velocityY, 'its own player off the spring stays put').toBe(0);
  });

  it('a client follows the synced spring: NaN ignored, clamped, and a fresh launch flings only a player on it', (): void => {
    engine.isMultiplayerClient = true;
    engine.player = playerOnSpring(engine);
    const bounce: number = GAME_CONSTANTS.SPRING_BOUNCE_TICKS;
    engine.applyRemoteSpring({ ...newSpringState(), launches: Number.NaN, bounceTicks: bounce });
    expect(engine.spring!.launches).toBe(0);
    engine.applyRemoteSpring({ ...newSpringState(), scaleKg: Number.POSITIVE_INFINITY });
    expect(engine.spring!.scaleKg).toBe(0);
    engine.applyRemoteSpring({
      ...newSpringState(),
      countdownTicks: 9_999,
      scaleKg: -50,
      buttonTicks: 9_999,
    });
    expect(engine.spring!.countdownTicks).toBe(GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS);
    expect(engine.spring!.scaleKg).toBe(0);
    expect(engine.spring!.buttonTicks).toBe(GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS);
    engine.applyRemoteSpring({ ...newSpringState(), scaleKg: 1234.4 });
    expect(engine.spring!.scaleKg).toBe(1234);
    // A launch it joined late (the bounce almost over) flings nobody.
    engine.applyRemoteSpring({ ...newSpringState(), launches: 1, bounceTicks: 5 });
    expect(engine.player.velocityY).toBe(0);
    engine.applyRemoteSpring({ ...newSpringState(), launches: 2, bounceTicks: bounce });
    expect(engine.player.velocityY).toBe(-GAME_CONSTANTS.SPRING_LAUNCH_FORCE);
    engine.player = playerAtButton(engine);
    engine.applyRemoteSpring({ ...newSpringState(), launches: 3, bounceTicks: bounce });
    expect(engine.player.velocityY, 'beside the spring: no launch').toBe(0);
  });

  it('replaying a launch shows the dust and the launch streak and shakes the screen', (): void => {
    engine.replayRemoteVfxEvents([
      { type: VfxEventType.SpringLaunch, playerId: 'host', x: 1174, y: 572 },
    ]);
    expect(engine.particles.length).toBeGreaterThan(0);
    expect(engine.screenShakeFrames).toBeGreaterThan(0);
  });

  it('the snapshot carries the spring with its scale and button', (): void => {
    engine.spring!.countdownTicks = 42;
    engine.spring!.scaleKg = 640;
    engine.spring!.buttonTicks = 17;
    expect(engine.getStateSnapshot()!.spring).toEqual(engine.spring);
  });

  it('floor 4 has no spring and the exit height follows the normal rules again', (): void => {
    engine.setFloor(GAME_CONSTANTS.PUZZLE_SPRING_FLOOR + 1);
    expect(engine.springPuzzle).toBeNull();
    expect(engine.spring).toBeNull();
    expect(engine.platforms.some((p: Platform): boolean => p.puzzlePart === 'spring')).toBe(false);
    expect(engine.exitPlatform.y).toBe(exitPlatformY(GAME_CONSTANTS.PUZZLE_SPRING_FLOOR + 1, 0));
  });
});

describe('Cage puzzle (floor 4)', (): void => {
  let engine: GameEngine;

  function systemFor(e: GameEngine): CagePuzzleSystem {
    const physics: PhysicsSystem = new PhysicsSystem(e);
    const vfx: VfxSystem = new VfxSystem(e);
    const drops: DropSystem = new DropSystem(e, physics, vfx);
    const combat: CombatSystem = new CombatSystem(e, physics, vfx, drops);
    const projectiles: ProjectileSystem = new ProjectileSystem(e, physics, vfx);
    return new CagePuzzleSystem(e, vfx, new ZombieSystem(e, physics, combat, projectiles, drops), drops);
  }

  /** A player on the surface left of a cage's cleat, facing it, attacking. */
  function playerAtCleat(e: GameEngine, i: number, playerId: string = 'player-1'): CharacterState {
    const cleat: Box = cleatBox(e.cagePuzzle!, i);
    return makePlayer({
      id: playerId,
      x: cleat.x - GAME_CONSTANTS.PLAYER_WIDTH - 4,
      y: e.cagePuzzle!.cages[i].cleatY - GAME_CONSTANTS.PLAYER_HEIGHT,
      facing: Direction.Right,
      isAttacking: true,
      isGrounded: true,
    });
  }

  /** Swings until the cage's chain snaps (one hit per cooldown). */
  function snap(sys: CagePuzzleSystem): void {
    const swing: number = GAME_CONSTANTS.CAGE_HIT_COOLDOWN_TICKS + 1;
    for (let t: number = 0; t < swing * (GAME_CONSTANTS.CAGE_CLEAT_HITS - 1) + 1; t++) sys.update();
  }

  /** Snaps cage i's chain and lets it land. */
  function drop(sys: CagePuzzleSystem, i: number): void {
    engine.player = playerAtCleat(engine, i);
    snap(sys);
    engine.player = makePlayer({ x: 1240 });
    for (let t: number = 0; t < 100 && !engine.cages!.cages[i].landed; t++) sys.update();
  }

  function cagePlatforms(e: GameEngine, part: 'cage' | 'hanging-cage'): Platform[] {
    return e.platforms.filter((p: Platform): boolean => p.puzzlePart === part);
  }

  function smashEvent(e: GameEngine): VfxEvent | undefined {
    return e.pendingVfxEvents.find((evt: VfxEvent): boolean => evt.type === VfxEventType.CageSmash);
  }

  function hasEvent(e: GameEngine, type: VfxEventType): boolean {
    return e.pendingVfxEvents.some((evt: VfxEvent): boolean => evt.type === type);
  }

  function corpseAt(id: string, cx: number, bottom: number): ZombieCorpse {
    return {
      id,
      type: ZombieType.Walker,
      x: cx - 20,
      y: bottom - 30,
      width: 40,
      height: 30,
      spriteKey: 'walker',
      facing: 1,
      velocityX: 0,
      velocityY: 0,
      isGrounded: true,
      frozen: false,
      landProcessed: true,
      fadeTimer: 999,
      maxFadeTimer: 999,
      showBlood: false,
      carrierId: null,
    };
  }

  function fresh(): CageState {
    return { cleatHits: 0, fallTicks: 0, landed: false };
  }

  beforeEach((): void => {
    engine = new GameEngine(createMockCanvas());
    engine.player = makePlayer();
    engine.setFloor(GAME_CONSTANTS.PUZZLE_CAGE_FLOOR);
  });

  it('floor 4: 4-5 cages hang solid; the exit cage hangs under the exit and moves with it', (): void => {
    const puzzle: CagePuzzleLayout = engine.cagePuzzle!;
    const count: number = puzzle.cages.length;
    expect(count).toBeGreaterThanOrEqual(GAME_CONSTANTS.CAGE_COUNT_MIN);
    expect(count).toBeLessThanOrEqual(GAME_CONSTANTS.CAGE_COUNT_MAX);
    expect(engine.cages).toEqual({ cages: puzzle.cages.map(fresh) });
    expect(engine.exitPlatform.y).toBe(exitPlatformY(GAME_CONSTANTS.PUZZLE_CAGE_FLOOR, 0));
    expect(cagePlatforms(engine, 'cage')).toEqual([
      { ...hangBox(puzzle, EXIT_CAGE, engine.exitPlatform), solid: true, puzzlePart: 'cage' },
    ]);
    expect(cagePlatforms(engine, 'hanging-cage')).toEqual(
      puzzle.cages
        .slice(1)
        .map((c: HangingCage): Platform => ({ ...c.hang!, solid: true, puzzlePart: 'hanging-cage' })),
    );
    engine.remotePlayers = [makePlayer({ id: 'guest' })];
    engine.repositionExitPlatform();
    expect(cagePlatforms(engine, 'cage')[0].y).toBe(
      engine.exitPlatform.y + engine.exitPlatform.height + GAME_CONSTANTS.CAGE_HANG_GAP_PX,
    );
  });

  it('three hits on the exit cage cleat drop it under the exit: the pile and the player ride up onto it', (): void => {
    engine.cagePuzzle!.cages[EXIT_CAGE].content = 'empty';
    const sys: CagePuzzleSystem = systemFor(engine);
    const exit: Platform = engine.exitPlatform;
    const ground: Box = exitCageGroundBox(exit);
    const cx: number = ground.x + ground.width / 2;
    engine.zombieCorpses = [
      corpseAt('under', cx, GAME_CONSTANTS.GROUND_Y),
      corpseAt('stacked', cx, GAME_CONSTANTS.GROUND_Y - 5),
      corpseAt('beside', ground.x + ground.width + 60, GAME_CONSTANTS.GROUND_Y),
    ];
    engine.player = playerAtCleat(engine, EXIT_CAGE);
    snap(sys);
    const cage: CageState = engine.cages!.cages[EXIT_CAGE];
    expect(cage.cleatHits).toBe(GAME_CONSTANTS.CAGE_CLEAT_HITS);
    expect(cage.landed).toBe(false);
    expect(hasEvent(engine, VfxEventType.HitParticles)).toBe(true);
    expect(cagePlatforms(engine, 'cage'), 'no collision while it falls').toEqual([]);
    // A player waiting under the exit when it comes down.
    const waiting: CharacterState = makePlayer({
      x: cx - GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
      isGrounded: true,
    });
    engine.player = waiting;
    for (let t: number = 0; t < 100 && !cage.landed; t++) sys.update();
    expect(cage.landed).toBe(true);
    expect(hasEvent(engine, VfxEventType.CageLand)).toBe(true);
    expect(cagePlatforms(engine, 'cage')).toEqual([{ ...ground, solid: true, puzzlePart: 'cage' }]);
    expect(cagePlatforms(engine, 'hanging-cage'), 'the others still hang').toHaveLength(
      engine.cagePuzzle!.cages.length - 1,
    );
    const byId: (id: string) => ZombieCorpse = (id: string): ZombieCorpse =>
      engine.zombieCorpses.find((c: ZombieCorpse): boolean => c.id === id)!;
    expect(byId('under').y + byId('under').height).toBe(ground.y);
    expect(byId('stacked').y + byId('stacked').height).toBe(ground.y - 5);
    expect(byId('beside').y + byId('beside').height).toBe(GAME_CONSTANTS.GROUND_Y);
    expect(waiting.y + GAME_CONSTANTS.PLAYER_HEIGHT).toBe(ground.y);
    expect(engine.zombies.length, 'it was empty').toBe(0);
    expect(engine.worldDrops.length).toBe(0);
  });

  it('an exit cage hiding zombies still stands as a step; they climb out on top of it', (): void => {
    engine.cagePuzzle!.cages[EXIT_CAGE].content = 'zombies';
    drop(systemFor(engine), EXIT_CAGE);
    const ground: Box = exitCageGroundBox(engine.exitPlatform);
    expect(cagePlatforms(engine, 'cage')).toEqual([{ ...ground, solid: true, puzzlePart: 'cage' }]);
    expect(engine.zombies.length).toBe(GAME_CONSTANTS.CAGE_ZOMBIES);
    for (const z of engine.zombies) expect(z.y + z.instanceHeight).toBe(ground.y);
  });

  it('a mid cage hiding zombies smashes where it lands and lets them loose there (once)', (): void => {
    const puzzle: CagePuzzleLayout = engine.cagePuzzle!;
    puzzle.cages[1].content = 'zombies';
    const sys: CagePuzzleSystem = systemFor(engine);
    drop(sys, 1);
    expect(engine.cages!.cages[1].landed).toBe(true);
    expect(cagePlatforms(engine, 'hanging-cage')).toHaveLength(puzzle.cages.length - 2);
    expect(smashEvent(engine)?.value, 'with gore').toBe(1);
    expect(engine.zombies.length).toBe(GAME_CONSTANTS.CAGE_ZOMBIES);
    const hang: Platform = puzzle.cages[1].hang!;
    for (const z of engine.zombies) {
      expect(z.y + z.instanceHeight).toBe(puzzle.cages[1].landY);
      expect(Math.abs(z.x + z.instanceWidth / 2 - (hang.x + hang.width / 2))).toBeLessThan(hang.width);
      expect([ZombieType.Boss, ZombieType.DragonBoss]).not.toContain(z.type);
    }
    expect(engine.cages!.cages[EXIT_CAGE].cleatHits, 'the exit cage still hangs').toBe(0);
    for (let t: number = 0; t < 100; t++) sys.update();
    expect(engine.zombies.length, 'released once').toBe(GAME_CONSTANTS.CAGE_ZOMBIES);
  });

  it('a loot cage pops gold and potions; an empty one only smashes', (): void => {
    const puzzle: CagePuzzleLayout = engine.cagePuzzle!;
    puzzle.cages[1].content = 'loot';
    puzzle.cages[2].content = 'empty';
    const sys: CagePuzzleSystem = systemFor(engine);
    drop(sys, 1);
    expect(engine.worldDrops.map((d: WorldDrop): DropType => d.type).sort()).toEqual(
      [DropType.Gold, DropType.HpPotion, DropType.MpPotion].sort(),
    );
    const top: number = landTop(puzzle, 1, engine.exitPlatform);
    for (const d of engine.worldDrops) expect(d.y).toBeGreaterThan(top);
    expect(engine.zombies.length).toBe(0);
    engine.pendingVfxEvents.length = 0;
    engine.worldDrops = [];
    drop(sys, 2);
    expect(smashEvent(engine)?.value, 'no gore').toBe(0);
    expect(engine.worldDrops.length).toBe(0);
    expect(engine.zombies.length).toBe(0);
  });

  it("the host counts a guest's swings at a cleat", (): void => {
    engine.isMultiplayerHost = true;
    const sys: CagePuzzleSystem = systemFor(engine);
    engine.remotePlayers = [playerAtCleat(engine, 2, 'guest')];
    snap(sys);
    expect(engine.cages!.cages[2].cleatHits).toBe(GAME_CONSTANTS.CAGE_CLEAT_HITS);
    expect(engine.cages!.cages[1].cleatHits, 'only that cleat').toBe(0);
  });

  it('a client follows the synced cages: NaN ignored, clamped, snaps and landings one-way, and lifts its own player', (): void => {
    engine.isMultiplayerClient = true;
    const ground: Box = exitCageGroundBox(engine.exitPlatform);
    engine.player = makePlayer({
      x: ground.x + ground.width / 2 - GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
      isGrounded: true,
    });
    const n: number = engine.cagePuzzle!.cages.length;
    const withExit: (exit: CageState) => CagePuzzleState = (exit: CageState): CagePuzzleState => ({
      cages: [exit, ...Array.from({ length: n - 1 }, fresh)],
    });
    const exitCage: () => CageState = (): CageState => engine.cages!.cages[EXIT_CAGE];
    engine.applyRemoteCages(withExit({ cleatHits: Number.NaN, fallTicks: 0, landed: false }));
    expect(exitCage().cleatHits).toBe(0);
    engine.applyRemoteCages(withExit({ cleatHits: 1, fallTicks: 0, landed: false }));
    expect(exitCage().cleatHits).toBe(1);
    engine.applyRemoteCages(withExit({ cleatHits: 99, fallTicks: 9_999, landed: false }));
    expect(exitCage().cleatHits).toBe(GAME_CONSTANTS.CAGE_CLEAT_HITS);
    expect(exitCage().fallTicks).toBeLessThan(100);
    expect(cagePlatforms(engine, 'cage'), 'falling: no collision').toEqual([]);
    engine.applyRemoteCages(withExit({ cleatHits: 1, fallTicks: 0, landed: false }));
    expect(exitCage().cleatHits, 'a snapped chain stays snapped').toBe(GAME_CONSTANTS.CAGE_CLEAT_HITS);
    const landed: CagePuzzleState = withExit({
      cleatHits: GAME_CONSTANTS.CAGE_CLEAT_HITS,
      fallTicks: 20,
      landed: true,
    });
    engine.applyRemoteCages(landed);
    expect(exitCage().landed).toBe(true);
    expect(cagePlatforms(engine, 'cage')).toEqual([{ ...ground, solid: true, puzzlePart: 'cage' }]);
    expect(engine.player.y + GAME_CONSTANTS.PLAYER_HEIGHT, 'its own player rode up').toBe(ground.y);
    engine.applyRemoteCages(landed);
    expect(engine.player.y + GAME_CONSTANTS.PLAYER_HEIGHT, 'lifted once').toBe(ground.y);
    engine.applyRemoteCages(
      withExit({ cleatHits: GAME_CONSTANTS.CAGE_CLEAT_HITS, fallTicks: 20, landed: false }),
    );
    expect(exitCage().landed, 'landing is one-way').toBe(true);
    engine.applyRemoteCages({ cages: [null, 7] } as unknown as CagePuzzleState);
    engine.applyRemoteCages({ cages: 'x' } as unknown as CagePuzzleState);
    expect(engine.cages!.cages[1]).toEqual(fresh());
  });

  it('a client lets a snapped cage fall between snapshots but never lands it', (): void => {
    engine.isMultiplayerClient = true;
    const sys: CagePuzzleSystem = systemFor(engine);
    const n: number = engine.cagePuzzle!.cages.length;
    engine.applyRemoteCages({
      cages: [
        fresh(),
        { cleatHits: GAME_CONSTANTS.CAGE_CLEAT_HITS, fallTicks: 0, landed: false },
        ...Array.from({ length: n - 2 }, fresh),
      ],
    });
    for (let t: number = 0; t < 200; t++) sys.tickClient();
    expect(engine.cages!.cages[1].fallTicks).toBeGreaterThan(0);
    expect(engine.cages!.cages[1].landed).toBe(false);
    expect(engine.zombies.length).toBe(0);
  });

  it('replaying a landing and a smash shows dust and debris and shakes the screen', (): void => {
    engine.replayRemoteVfxEvents([
      { type: VfxEventType.CageLand, playerId: 'host', x: 116, y: GAME_CONSTANTS.GROUND_Y },
    ]);
    expect(engine.particles.length).toBeGreaterThan(0);
    expect(engine.screenShakeFrames).toBeGreaterThan(0);
    const before: number = engine.particles.length;
    engine.replayRemoteVfxEvents([
      { type: VfxEventType.CageSmash, playerId: 'host', x: 600, y: 572, value: 1 },
    ]);
    expect(engine.particles.length).toBeGreaterThan(before);
  });

  it('the snapshot carries the cages', (): void => {
    engine.cages!.cages[1].cleatHits = 2;
    expect(engine.getStateSnapshot()!.cages).toEqual(engine.cages);
  });

  it('floor 5 has no cages', (): void => {
    engine.setFloor(GAME_CONSTANTS.PUZZLE_CAGE_FLOOR + 1);
    expect(engine.cagePuzzle).toBeNull();
    expect(engine.cages).toBeNull();
    expect(
      engine.platforms.some(
        (p: Platform): boolean => p.puzzlePart === 'cage' || p.puzzlePart === 'hanging-cage',
      ),
    ).toBe(false);
  });
});

describe('Pressure plate puzzle (floor 5)', (): void => {
  let engine: GameEngine;
  const NEEDED: number = GAME_CONSTANTS.PLATE_WEIGHT_NEEDED;

  interface PlateSystems {
    plate: PlatePuzzleSystem;
    zombies: ZombieSystem;
  }

  function systems(e: GameEngine): PlateSystems {
    const physics: PhysicsSystem = new PhysicsSystem(e);
    const vfx: VfxSystem = new VfxSystem(e);
    const drops: DropSystem = new DropSystem(e, physics, vfx);
    const combat: CombatSystem = new CombatSystem(e, physics, vfx, drops);
    const projectiles: ProjectileSystem = new ProjectileSystem(e, physics, vfx);
    return {
      plate: new PlatePuzzleSystem(e, vfx),
      zombies: new ZombieSystem(e, physics, combat, projectiles, drops),
    };
  }

  function plateCenter(e: GameEngine): number {
    return e.platePuzzle!.plateX + GAME_CONSTANTS.PLATE_WIDTH_PX / 2;
  }

  function corpseOnPlate(e: GameEngine, id: string, dx: number): ZombieCorpse {
    const puzzle: PlatePuzzleLayout = e.platePuzzle!;
    return {
      id,
      type: ZombieType.Walker,
      x: plateCenter(e) + dx - 15,
      y: puzzle.plateY - 30,
      width: 30,
      height: 30,
      spriteKey: 'walker',
      facing: 1,
      velocityX: 0,
      velocityY: 0,
      isGrounded: true,
      frozen: false,
      landProcessed: true,
      fadeTimer: 999,
      maxFadeTimer: 999,
      showBlood: false,
      carrierId: null,
    };
  }

  function standingOnPlate(e: GameEngine, id: string): CharacterState {
    return makePlayer({
      id,
      x: plateCenter(e) - GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: e.platePuzzle!.plateY - GAME_CONSTANTS.PLAYER_HEIGHT,
      isGrounded: true,
    });
  }

  function standingOnExit(e: GameEngine): CharacterState {
    return makePlayer({
      x: e.exitPlatform.x + 40,
      y: e.exitPlatform.y - GAME_CONSTANTS.PLAYER_HEIGHT,
      isGrounded: true,
    });
  }

  function hasEvent(e: GameEngine, type: VfxEventType): boolean {
    return e.pendingVfxEvents.some((evt: VfxEvent): boolean => evt.type === type);
  }

  beforeEach((): void => {
    engine = new GameEngine(createMockCanvas());
    engine.player = makePlayer();
    engine.setFloor(GAME_CONSTANTS.PUZZLE_PLATE_FLOOR);
  });

  it('floor 5 has a plate, a shut door, and the normal exit height', (): void => {
    expect(engine.platePuzzle).not.toBeNull();
    expect(engine.plate).toEqual({ weight: 0, doorTicks: 0 });
    expect(engine.exitPlatform.y).toBe(exitPlatformY(GAME_CONSTANTS.PUZZLE_PLATE_FLOOR, 0));
  });

  it('solo: three corpses on the plate open the door; the exit lets the player out only once it is fully open', (): void => {
    const sys: PlateSystems = systems(engine);
    engine.player = standingOnExit(engine);
    sys.plate.update();
    sys.zombies.checkFloorCompletion();
    expect(engine.floor, 'the door is shut').toBe(GAME_CONSTANTS.PUZZLE_PLATE_FLOOR);

    engine.zombieCorpses = [corpseOnPlate(engine, 'a', -30), corpseOnPlate(engine, 'b', 0)];
    sys.plate.update();
    expect(engine.plate!.weight).toBe(2);
    expect(hasEvent(engine, VfxEventType.DoorOpen)).toBe(false);
    engine.zombieCorpses.push(corpseOnPlate(engine, 'c', 30));
    sys.plate.update();
    expect(engine.plate!.weight).toBe(NEEDED);
    expect(hasEvent(engine, VfxEventType.DoorOpen)).toBe(true);
    sys.zombies.checkFloorCompletion();
    expect(engine.floor, 'still sliding open').toBe(GAME_CONSTANTS.PUZZLE_PLATE_FLOOR);
    for (let t: number = 0; t < GAME_CONSTANTS.PLATE_DOOR_TICKS; t++) sys.plate.update();
    expect(engine.plate!.doorTicks).toBe(GAME_CONSTANTS.PLATE_DOOR_TICKS);
    sys.zombies.checkFloorCompletion();
    expect(engine.floor).toBe(GAME_CONSTANTS.PUZZLE_PLATE_FLOOR + 1);
  });

  it('taking the weight off slams the door shut again', (): void => {
    const sys: PlateSystems = systems(engine);
    engine.zombieCorpses = [0, 1, 2].map(
      (i: number): ZombieCorpse => corpseOnPlate(engine, `c${i}`, i * 20 - 20),
    );
    for (let t: number = 0; t <= GAME_CONSTANTS.PLATE_DOOR_TICKS; t++) sys.plate.update();
    engine.pendingVfxEvents.length = 0;
    engine.zombieCorpses[0].carrierId = 'player-1';
    sys.plate.update();
    expect(engine.plate!.weight).toBe(NEEDED - 1);
    expect(hasEvent(engine, VfxEventType.DoorShut)).toBe(true);
    for (let t: number = 0; t < GAME_CONSTANTS.PLATE_DOOR_TICKS; t++) sys.plate.update();
    expect(engine.plate!.doorTicks).toBe(0);
  });

  it('the host weighs a guest standing on the plate, and its own step onto the exit then lets everyone out', (): void => {
    engine.isMultiplayerHost = true;
    const sys: PlateSystems = systems(engine);
    engine.remotePlayers = [standingOnPlate(engine, 'guest')];
    engine.repositionExitPlatform();
    engine.player = standingOnExit(engine);
    for (let t: number = 0; t <= GAME_CONSTANTS.PLATE_DOOR_TICKS; t++) sys.plate.update();
    expect(engine.plate!.weight).toBe(GAME_CONSTANTS.PLATE_PLAYER_WEIGHT);
    sys.zombies.checkFloorCompletion();
    expect(engine.floor).toBe(GAME_CONSTANTS.PUZZLE_PLATE_FLOOR + 1);
  });

  it('a zombie walking over the plate kicks a corpse off it (once per cooldown) and everyone sees the dust', (): void => {
    const sys: PlateSystems = systems(engine);
    const c: ZombieCorpse = corpseOnPlate(engine, 'a', 8);
    const d: ZombieCorpse = corpseOnPlate(engine, 'b', -8);
    engine.zombieCorpses = [c, d];
    engine.zombies = [
      makeZombie({
        x: plateCenter(engine) - 17,
        y: engine.platePuzzle!.plateY - 50,
        velocityX: 1,
        instanceWidth: 34,
        instanceHeight: 50,
        isGrounded: true,
      }),
    ];
    sys.plate.update();
    expect(c.isGrounded).toBe(false);
    expect(c.velocityX).toBeGreaterThan(0);
    expect(d.isGrounded, 'one kick at a time').toBe(true);
    expect(hasEvent(engine, VfxEventType.HitParticles)).toBe(true);
    sys.plate.update();
    expect(d.isGrounded, 'cooling down').toBe(true);
  });

  it('a client follows the synced plate (bad values ignored, clamped) and slides the door itself', (): void => {
    engine.isMultiplayerClient = true;
    const sys: PlateSystems = systems(engine);
    engine.applyRemotePlate({ weight: Number.NaN, doorTicks: 5 });
    expect(engine.plate).toEqual({ weight: 0, doorTicks: 0 });
    engine.applyRemotePlate({ weight: 1e9, doorTicks: -4 });
    expect(engine.plate!.weight).toBeLessThan(1000);
    expect(engine.plate!.doorTicks).toBe(0);
    engine.applyRemotePlate({ weight: NEEDED, doorTicks: 99 });
    expect(engine.plate!.doorTicks).toBe(GAME_CONSTANTS.PLATE_DOOR_TICKS);
    engine.applyRemotePlate({ weight: 0, doorTicks: 3 });
    sys.plate.tickClient();
    expect(engine.plate!.doorTicks, 'slides shut between snapshots').toBe(2);
    engine.applyRemotePlate(null);
    engine.applyRemotePlate({ weight: '3' } as unknown as PlateState);
    expect(engine.plate!.weight).toBe(0);
  });

  it('replaying the door opening and shutting shows sparks and dust', (): void => {
    engine.replayRemoteVfxEvents([{ type: VfxEventType.DoorOpen, playerId: 'host', x: 116, y: 230 }]);
    const afterOpen: number = engine.particles.length;
    expect(afterOpen).toBeGreaterThan(0);
    engine.replayRemoteVfxEvents([{ type: VfxEventType.DoorShut, playerId: 'host', x: 116, y: 230 }]);
    expect(engine.particles.length).toBeGreaterThan(afterOpen);
    expect(engine.screenShakeFrames).toBeGreaterThan(0);
  });

  it('the snapshot carries the plate', (): void => {
    engine.plate!.weight = 2;
    engine.plate!.doorTicks = 4;
    expect(engine.getStateSnapshot()!.plate).toEqual({ weight: 2, doorTicks: 4 });
  });

  it('other floors have no plate', (): void => {
    engine.setFloor(GAME_CONSTANTS.PUZZLE_PLATE_FLOOR + 1);
    expect(engine.platePuzzle).toBeNull();
    expect(engine.plate).toBeNull();
    expect(engine.getStateSnapshot()!.plate).toBeNull();
  });
});

describe('Player status tints (hurt red, poison green) synced via VfxEvents', (): void => {
  let engine: GameEngine;

  beforeEach((): void => {
    engine = new GameEngine(createMockCanvas());
    engine.isMultiplayerClient = true;
    engine.player = makePlayer();
  });

  it('a hit tints the local player red and queues PlayerHurt for the others', (): void => {
    engine.applyIncomingZombieDamage(5, 1, false);

    expect(engine.playerTints.get('player-1')?.hurtTicks).toBe(GAME_CONSTANTS.PLAYER_HURT_TINT_TICKS);
    expect(engine.playerTints.get('player-1')?.poisonTicks).toBe(0);
    const hurt: VfxEvent | undefined = engine.pendingVfxEvents.find(
      (e: VfxEvent): boolean => e.type === VfxEventType.PlayerHurt,
    );
    expect(hurt?.playerId).toBe('player-1');
  });

  it('a poison hit tints the local player green for the whole poison', (): void => {
    engine.applyIncomingZombieDamage(5, 1, true);

    expect(engine.playerTints.get('player-1')?.poisonTicks).toBe(GAME_CONSTANTS.SPITTER_POISON_DURATION_TICKS);
  });

  it('replays PlayerHurt and PoisonTrigger as tints on the remote player, never on itself', (): void => {
    engine.replayRemoteVfxEvents([
      { type: VfxEventType.PlayerHurt, playerId: 'remote-player', x: 500, y: 400 },
      { type: VfxEventType.PoisonTrigger, playerId: 'remote-player', x: 500, y: 400 },
      { type: VfxEventType.PlayerHurt, playerId: 'player-1', x: 500, y: 400 },
    ]);

    expect(engine.playerTints.get('remote-player')).toEqual({
      hurtTicks: GAME_CONSTANTS.PLAYER_HURT_TINT_TICKS,
      poisonTicks: GAME_CONSTANTS.SPITTER_POISON_DURATION_TICKS,
    });
    expect(engine.playerTints.has('player-1')).toBe(false);
  });

  it('tints wear off and are dropped when both run out', (): void => {
    const vfx: VfxSystem = new VfxSystem(engine);
    vfx.tintPlayerHurt('remote-player');
    for (let t: number = 0; t < GAME_CONSTANTS.PLAYER_HURT_TINT_TICKS - 1; t++) vfx.updatePlayerTints();
    expect(engine.playerTints.get('remote-player')?.hurtTicks).toBe(1);
    vfx.updatePlayerTints();
    expect(engine.playerTints.has('remote-player')).toBe(false);
  });
});

describe('Exploding barrels', (): void => {
  const FUSE: number = GAME_CONSTANTS.BARREL_FUSE_TICKS;
  const CHAIN: number = GAME_CONSTANTS.BARREL_CHAIN_FUSE_TICKS;
  const GROUND: number = GAME_CONSTANTS.GROUND_Y;
  let engine: GameEngine;
  let props: LoosePropSystem;
  let barrels: ExplodingBarrelSystem;

  function barrelIds(e: GameEngine): string[] {
    return [...pickableProps(e.level)]
      .filter(([, p]: [string, Prop]): boolean => isExplosive(p.kind))
      .map(([id]: [string, Prop]): string => id);
  }

  /** Pins the first layout with at least `n` barrels and returns their ids. */
  function layoutWithBarrels(e: GameEngine, n: number): string[] {
    for (let seed: number = 1; seed < 500; seed++) {
      e.layoutSeed = seed;
      e.applyLevel();
      const ids: string[] = barrelIds(e);
      if (ids.length >= n) return ids;
    }
    throw new Error(`no layout with ${n} barrels`);
  }

  function propById(e: GameEngine, id: string): LooseProp | undefined {
    return e.looseProps.find((p: LooseProp): boolean => p.id === id);
  }

  /** Setup: the barrel lies on the ground with its left side at x. */
  function placeOnGround(b: LooseProp, x: number): void {
    b.x = x;
    b.y = GROUND - b.height;
    b.isGrounded = true;
  }

  function queued(type: VfxEventType): VfxEvent[] {
    return engine.pendingVfxEvents.filter((evt: VfxEvent): boolean => evt.type === type);
  }

  /** A host (solo) engine on a layout with `n` barrels, and the barrel systems on it. */
  function hostWithBarrels(n: number): string[] {
    const ids: string[] = layoutWithBarrels(engine, n);
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const vfx: VfxSystem = new VfxSystem(engine);
    const drops: DropSystem = new DropSystem(engine, physics, vfx);
    const combat: CombatSystem = new CombatSystem(engine, physics, vfx, drops);
    props = new LoosePropSystem(engine, drops);
    props.reset(engine.level);
    barrels = new ExplodingBarrelSystem(engine, props, combat, vfx);
    return ids;
  }

  beforeEach((): void => {
    engine = new GameEngine(createMockCanvas());
    engine.pendingVfxEvents = [];
  });

  it('a hit lights the fuse; 3 s later the barrel blows up and hurts the zombies around it', (): void => {
    const [id]: string[] = hostWithBarrels(1);
    const b: LooseProp = propById(engine, id)!;
    placeOnGround(b, 600);
    engine.looseProps = [b];
    engine.player = makePlayer({
      x: 600 - GAME_CONSTANTS.PLAYER_WIDTH - 2,
      y: GROUND - GAME_CONSTANTS.PLAYER_HEIGHT,
      facing: Direction.Right,
      isAttacking: true,
    });
    const near: ZombieState = makeZombie({ id: 'near', x: 640, y: GROUND - 50 });
    const far: ZombieState = makeZombie({ id: 'far', x: 900, y: GROUND - 50 });
    engine.zombies = [near, far];

    barrels.update();
    expect(b.fuseTicks, 'lit and burning').toBe(FUSE - 1);
    expect(queued(VfxEventType.HitParticles).length, 'sparks as it catches').toBe(1);
    expect(props.moved().find((p: LooseProp): boolean => p.id === id)?.fuseTicks).toBe(FUSE - 1);

    // The player keeps swinging: the fuse burns on, it is never lit again.
    for (let t: number = 0; t < FUSE - 2; t++) barrels.update();
    expect(b.fuseTicks).toBe(1);
    expect(propById(engine, id)).toBeDefined();
    expect(near.hp).toBe(100);

    barrels.update();
    expect(propById(engine, id), 'gone from the world').toBeUndefined();
    props.placeSolids();
    expect(engine.platforms.some((p: Platform): boolean => p.propId === id), 'no collision left').toBe(false);
    const blast: VfxEvent[] = queued(VfxEventType.BarrelBlast);
    expect(blast.length).toBe(1);
    expect(blast[0].x).toBe(b.x + b.width / 2);
    expect(blast[0].playerId).toBe(engine.player.id);
    expect(near.hp, '60% of its max HP').toBe(40);
    expect(near.velocityX, 'thrown away from the barrel').toBeGreaterThan(0);
    expect(near.isGrounded).toBe(false);
    expect(far.hp, 'out of the blast').toBe(100);
    expect(queued(VfxEventType.DamageNumber).map((evt: VfxEvent): number => evt.value!)).toEqual([60]);
    expect(engine.particles.length).toBeGreaterThan(0);
    expect(engine.screenShakeFrames).toBeGreaterThan(0);
    expect(props.moved().find((p: LooseProp): boolean => p.id === id)?.exploded, 'synced as gone').toBe(true);
    expect(blast[0].targetY, 'lay on the ground: a scorch mark there').toBe(GROUND);
    expect(engine.barrelBlasts).toEqual([{ x: blast[0].x, y: blast[0].y, groundY: GROUND, age: 0 }]);
  });

  it('10 s after the blast the barrel is back on its spawn spot, once nobody stands there', (): void => {
    const [id]: string[] = hostWithBarrels(1);
    const spawn: Prop = pickableProps(engine.level).get(id)!;
    const b: LooseProp = propById(engine, id)!;
    engine.looseProps = [b];
    engine.zombies = [];
    b.fuseTicks = 1;
    barrels.update();
    expect(propById(engine, id)).toBeUndefined();

    // Someone stands on the spot when it is due: it waits for them to step off.
    engine.player = makePlayer({ x: spawn.x, y: spawn.y + spawn.height - GAME_CONSTANTS.PLAYER_HEIGHT });
    for (let t: number = 0; t < GAME_CONSTANTS.BARREL_RESPAWN_TICKS + 5; t++) barrels.update();
    expect(propById(engine, id), 'blocked by the player').toBeUndefined();
    expect(queued(VfxEventType.BarrelRespawn)).toEqual([]);

    engine.player.x = spawn.x + 200;
    barrels.update();
    const back: LooseProp | undefined = propById(engine, id);
    expect(back).toMatchObject({ x: spawn.x, y: spawn.y, fuseTicks: 0, exploded: false, isGrounded: true });
    props.placeSolids();
    expect(engine.platforms.some((p: Platform): boolean => p.propId === id), 'solid again').toBe(true);
    expect(props.moved().some((p: LooseProp): boolean => p.id === id), 'no longer synced as gone').toBe(false);
    const respawn: VfxEvent[] = queued(VfxEventType.BarrelRespawn);
    expect(respawn.length).toBe(1);
    expect(respawn[0].y).toBe(spawn.y + spawn.height);

    // Clients rebuild it from their own layout once the host stops sending it as gone.
    const client: GameEngine = new GameEngine(createMockCanvas());
    client.isMultiplayerClient = true;
    client.layoutSeed = engine.layoutSeed;
    client.applyLevel();
    client.applyRemoteProps([{ ...b, exploded: true }]);
    expect(propById(client, id)).toBeUndefined();
    client.applyRemoteProps(props.moved());
    expect(propById(client, id)).toMatchObject({ x: spawn.x, y: spawn.y });
  });

  it('it comes back exactly BARREL_RESPAWN_TICKS after the blast', (): void => {
    const [id]: string[] = hostWithBarrels(1);
    engine.looseProps = [propById(engine, id)!];
    engine.zombies = [];
    engine.looseProps[0].fuseTicks = 1;
    barrels.update();
    for (let t: number = 1; t < GAME_CONSTANTS.BARREL_RESPAWN_TICKS; t++) {
      barrels.update();
      expect(propById(engine, id), `${t} ticks after the blast`).toBeUndefined();
    }
    barrels.update();
    expect(propById(engine, id), '10 s after the blast').toBeDefined();
  });

  it('a blast plays out and its scorch mark fades, then it is dropped', (): void => {
    const vfx: VfxSystem = new VfxSystem(engine);
    vfx.spawnBarrelBlast(600, 600, GROUND);
    vfx.spawnBarrelBlast(300, 300, null);
    expect(engine.barrelBlasts.length).toBe(2);
    for (let t: number = 0; t < GAME_CONSTANTS.BARREL_SCORCH_TICKS - 1; t++) vfx.updateBarrelBlasts();
    expect(engine.barrelBlasts.length).toBe(2);
    vfx.updateBarrelBlasts();
    expect(engine.barrelBlasts).toEqual([]);
  });

  it('a blast sets off the barrels next to it', (): void => {
    const [a, b]: string[] = hostWithBarrels(2);
    const first: LooseProp = propById(engine, a)!;
    const second: LooseProp = propById(engine, b)!;
    placeOnGround(first, 600);
    placeOnGround(second, 660);
    engine.looseProps = [first, second];
    first.fuseTicks = 1;
    engine.zombies = [];
    barrels.update();
    expect(propById(engine, a)).toBeUndefined();
    expect(second.fuseTicks).toBe(CHAIN);
    for (let t: number = 0; t < CHAIN; t++) barrels.update();
    expect(propById(engine, b)).toBeUndefined();
    expect(queued(VfxEventType.BarrelBlast).length).toBe(2);
  });

  it("clients take the host's fuse (clamped) and drop the barrels that blew up", (): void => {
    const [id]: string[] = hostWithBarrels(1);
    const client: GameEngine = new GameEngine(createMockCanvas());
    client.isMultiplayerClient = true;
    client.layoutSeed = engine.layoutSeed;
    client.applyLevel();
    const lit: LooseProp = { ...propById(engine, id)!, fuseTicks: 90 };

    client.applyRemoteProps([lit]);
    expect(propById(client, id)?.fuseTicks).toBe(90);
    client.applyRemoteProps([{ ...lit, fuseTicks: 1e9 }]);
    expect(propById(client, id)?.fuseTicks).toBe(FUSE);
    client.applyRemoteProps([{ ...lit, fuseTicks: 'soon' as unknown as number }]);
    expect(propById(client, id)?.fuseTicks).toBe(0);
    client.applyRemoteProps([]);
    expect(propById(client, id)?.fuseTicks, 'back on its spawn spot, unlit').toBe(0);

    client.applyRemoteProps([{ ...lit, exploded: true }]);
    expect(propById(client, id)).toBeUndefined();
    expect(client.platforms.some((p: Platform): boolean => p.propId === id)).toBe(false);
  });

  it('replaying a blast shows the explosion and shakes the screen', (): void => {
    engine.isMultiplayerClient = true;
    engine.player = makePlayer();
    engine.replayRemoteVfxEvents([
      { type: VfxEventType.BarrelBlast, playerId: 'host', x: 600, y: 560, targetY: GROUND },
      { type: VfxEventType.BarrelBlast, playerId: 'host', x: 300, y: 300 },
    ]);
    expect(engine.particles.length).toBeGreaterThan(0);
    expect(engine.screenShakeFrames).toBeGreaterThan(0);
    expect(engine.barrelBlasts.map((b: BarrelBlastFx): number | null => b.groundY)).toEqual([GROUND, null]);
    const before: number = engine.particles.length;
    engine.replayRemoteVfxEvents([{ type: VfxEventType.BarrelRespawn, playerId: 'host', x: 600, y: GROUND }]);
    expect(engine.particles.length, 'dust as the barrel drops back in').toBeGreaterThan(before);
  });
});
