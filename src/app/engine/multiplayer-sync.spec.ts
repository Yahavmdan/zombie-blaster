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
import { SpringState, ZombieCorpse, ZombieState, ZombieType } from '@shared/game-entities';
import {
  BoulderPuzzleLayout,
  DamageNumber,
  EntityInterpolation,
  IGameEngine,
  Platform,
  SpringPuzzleLayout,
} from './engine-types';
import { BoulderPuzzleSystem } from './boulder-puzzle-system';
import { SpringPuzzleSystem } from './spring-puzzle-system';
import { leverBox, springSpan } from './spring-puzzle';
import { exitPlatformY } from './level-generator';
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
    particles: [],
    damageNumbers: [],
    dropNotifications: [],
    DROP_NOTIFICATION_LIFE_TICKS: 250,
    worldDrops: [],
    platforms: [groundPlatform],
    ropes: [],
    keys: { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false, skill3: false, skill4: false, skill5: false, skill6: false, openStats: false, openSkills: false, useHpPotion: false, useMpPotion: false, openShop: false, openInventory: false, revive: false, carry: false, quickSlot1: false, quickSlot2: false, quickSlot3: false, quickSlot4: false, quickSlot5: false, quickSlot6: false, quickSlot7: false, quickSlot8: false },
    attackCooldown: 0,
    attackAnimTicks: 0,
    attackHitPending: false,
    attackHitDelay: 0,
    invincibilityFrames: 0,
    potionCooldown: 0,
    jumpHeld: false,
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
    dragonProjectileImg: new Image(),
    dragonImpactImg: new Image(),
    spitterProjectiles: [],
    poisonEffect: null,
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
    breakPuzzleWall: vi.fn(),
    breakPuzzleGate: vi.fn(),
    puzzleWall: vi.fn((): Platform | null => null),
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

  /** A player on the ground beside the lever (on the screen-center side), attacking, facing it. */
  function playerAtLever(e: GameEngine, id: string = 'player-1'): CharacterState {
    const puzzle: SpringPuzzleLayout = e.springPuzzle!;
    const lever: Box = leverBox(puzzle);
    const x: number =
      puzzle.side === 1 ? lever.x - GAME_CONSTANTS.PLAYER_WIDTH - 4 : lever.x + lever.width + 4;
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

  function charge(e: GameEngine, count: number): void {
    const [left, right]: [number, number] = springSpan(e.springPuzzle!);
    const top: number = e.springPuzzle!.spring.y;
    for (let i: number = 0; i < count; i++) {
      const cx: number = left + 20 + ((right - left - 40) * (i % 6)) / 6;
      e.zombieCorpses.push({
        id: `charge-${i}`,
        type: ZombieType.Walker,
        x: cx - 20,
        y: top - 30 - Math.floor(i / 6) * 5,
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
      });
    }
  }

  function hasEvent(e: GameEngine, type: VfxEventType): boolean {
    return e.pendingVfxEvents.some((evt: VfxEvent): boolean => evt.type === type);
  }

  beforeEach((): void => {
    engine = new GameEngine(createMockCanvas());
    engine.player = makePlayer();
    engine.setFloor(GAME_CONSTANTS.PUZZLE_SPRING_FLOOR);
  });

  it('floor 3: a solid spring stands under the whole exit, which hangs at the top for any party size', (): void => {
    const puzzle: SpringPuzzleLayout = engine.springPuzzle!;
    expect(engine.spring).toEqual({ launches: 0, countdownTicks: 0, bounceTicks: 0, wobbleTicks: 0 });
    const block: Platform[] = engine.platforms.filter(
      (p: Platform): boolean => p.puzzlePart === 'spring',
    );
    expect(block).toEqual([{ ...puzzle.spring, solid: true, puzzlePart: 'spring' }]);
    const [left, right]: [number, number] = springSpan(puzzle);
    expect(left).toBeLessThanOrEqual(engine.exitPlatform.x);
    expect(right).toBeGreaterThanOrEqual(engine.exitPlatform.x + engine.exitPlatform.width);
    expect(engine.exitPlatform.y).toBe(GAME_CONSTANTS.SPRING_LEDGE_Y);
    engine.remotePlayers = [makePlayer({ id: 'guest' })];
    engine.repositionExitPlatform();
    expect(engine.exitPlatform.y).toBe(GAME_CONSTANTS.SPRING_LEDGE_Y);
  });

  it('charged: a lever pull starts the 3-2-1, then the spring launches the player on it onto the exit', (): void => {
    const sys: SpringPuzzleSystem = systemFor(engine);
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    charge(engine, GAME_CONSTANTS.SPRING_CHARGE_CORPSES);
    engine.player = playerAtLever(engine);
    sys.update();
    expect(engine.spring!.countdownTicks).toBe(GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS);
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
    // The charge scatters through the air, out over the open side (it is spent).
    const out: number = -engine.springPuzzle!.side;
    for (const c of engine.zombieCorpses) {
      expect(c.isGrounded, `${c.id} thrown`).toBe(false);
      expect(c.velocityY).toBeLessThan(0);
      expect(Math.sign(c.velocityX)).toBe(out);
    }
  });

  it('not enough charge: the lever only jiggles and nobody flies', (): void => {
    const sys: SpringPuzzleSystem = systemFor(engine);
    charge(engine, GAME_CONSTANTS.SPRING_CHARGE_CORPSES - 1);
    engine.player = playerAtLever(engine);
    sys.update();
    expect(engine.spring!.countdownTicks).toBe(0);
    expect(engine.spring!.wobbleTicks).toBe(GAME_CONSTANTS.SPRING_WOBBLE_TICKS);
    expect(hasEvent(engine, VfxEventType.HitParticles)).toBe(true);
    for (let t: number = 0; t < 300; t++) sys.update();
    expect(engine.spring!.launches).toBe(0);
  });

  it('the host counts a lever pull by a guest; its own player off the spring stays put', (): void => {
    engine.isMultiplayerHost = true;
    const sys: SpringPuzzleSystem = systemFor(engine);
    charge(engine, GAME_CONSTANTS.SPRING_CHARGE_CORPSES);
    engine.remotePlayers = [playerAtLever(engine, 'guest')];
    for (let t: number = 0; t <= GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS; t++) sys.update();
    expect(engine.spring!.launches).toBe(1);
    expect(engine.player!.velocityY).toBe(0);
  });

  it('a client follows the synced spring: NaN ignored, clamped, and a fresh launch flings only a player on it', (): void => {
    engine.isMultiplayerClient = true;
    engine.player = playerOnSpring(engine);
    const bounce: number = GAME_CONSTANTS.SPRING_BOUNCE_TICKS;
    engine.applyRemoteSpring({
      launches: Number.NaN,
      countdownTicks: 0,
      bounceTicks: bounce,
      wobbleTicks: 0,
    });
    expect(engine.spring!.launches).toBe(0);
    engine.applyRemoteSpring({ launches: 0, countdownTicks: 9_999, bounceTicks: 0, wobbleTicks: 999 });
    expect(engine.spring!.countdownTicks).toBe(GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS);
    expect(engine.spring!.wobbleTicks).toBe(GAME_CONSTANTS.SPRING_WOBBLE_TICKS);
    // A launch it joined late (the bounce almost over) flings nobody.
    engine.applyRemoteSpring({ launches: 1, countdownTicks: 0, bounceTicks: 5, wobbleTicks: 0 });
    expect(engine.player.velocityY).toBe(0);
    const fresh: SpringState = { launches: 2, countdownTicks: 0, bounceTicks: bounce, wobbleTicks: 0 };
    engine.applyRemoteSpring(fresh);
    expect(engine.player.velocityY).toBe(-GAME_CONSTANTS.SPRING_LAUNCH_FORCE);
    engine.player = playerAtLever(engine);
    engine.applyRemoteSpring({ launches: 3, countdownTicks: 0, bounceTicks: bounce, wobbleTicks: 0 });
    expect(engine.player.velocityY, 'beside the spring: no launch').toBe(0);
  });

  it('replaying a launch shows the dust and the launch streak and shakes the screen', (): void => {
    engine.replayRemoteVfxEvents([
      { type: VfxEventType.SpringLaunch, playerId: 'host', x: 1174, y: 572 },
    ]);
    expect(engine.particles.length).toBeGreaterThan(0);
    expect(engine.screenShakeFrames).toBeGreaterThan(0);
  });

  it('the snapshot carries the spring', (): void => {
    engine.spring!.countdownTicks = 42;
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
