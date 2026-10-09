import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GAME_CONSTANTS,
  ZOMBIE_TYPES,
  CharacterState,
  CharacterClass,
  Direction,
  VfxEvent,
  VfxEventType,
} from '@shared/index';
import { ZombieCorpse, ZombieState, ZombieType } from '@shared/game-entities';
import { EntityInterpolation, IGameEngine, Platform, PlayerTint } from './engine-types';
import { PhysicsSystem } from './physics-system';
import { VfxSystem } from './vfx-system';
import { CombatSystem } from './combat-system';
import { DropSystem } from './drop-system';
import { ProjectileSystem } from './projectile-system';
import { restsOnSafeSpot } from './safe-spot';
import { corpseSurface } from './corpse-surface';
import { CarryPose } from './corpse-carry';
import { CorpseDrape } from './corpse-drape';
import { ZombieSystem } from './zombie-system';
import { SpriteAnimator } from './sprite-animator';
import { ZombieAnimState } from './zombie-sprite-animator';
import { advanceMagnetPull, pullZombiesToward } from './magnet-pull';

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
    x: 400 + GAME_CONSTANTS.PLAYER_WIDTH + 5,
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
      getSpriteKey: vi.fn().mockReturnValue('walker'),
      getAnchor: vi.fn().mockReturnValue({ anchorX: 0.5, anchorY: 1.0 }),
      tick: vi.fn(),
      setState: vi.fn(),
      setStateReversed: vi.fn(),
      setStateAtFrame: vi.fn(),
      setFinalFrame: vi.fn(),
      removeInstance: vi.fn(),
      getFrameCount: vi.fn().mockReturnValue(5),
      load: vi.fn(),
      isLoaded: vi.fn().mockReturnValue(false),
      draw: vi.fn(),
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

function makeCorpse(overrides: Partial<ZombieCorpse> = {}): ZombieCorpse {
  return {
    id: 'corpse-1',
    type: ZombieType.Walker,
    x: 400,
    y: 200,
    width: 40,
    height: 50,
    spriteKey: 'walker',
    facing: 1,
    velocityX: 0,
    velocityY: 0,
    isGrounded: false,
    frozen: false,
    landProcessed: false,
    fadeTimer: 999_999,
    maxFadeTimer: 999_999,
    showBlood: false,
    carrierId: null,
    ...overrides,
  };
}

describe('ZombieSystem — corpse falling physics', () => {
  let engine: IGameEngine;
  let zombieSystem: ZombieSystem;

  beforeEach(() => {
    const player: CharacterState = makePlayer();
    engine = makeMockEngine(player, []);

    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const vfx: VfxSystem = new VfxSystem(engine);
    const dropSystemStub = { rollDrops: vi.fn() } as never;
    const combat: CombatSystem = new CombatSystem(engine, physics, vfx, dropSystemStub);
    const projectileSystem: ProjectileSystem = new ProjectileSystem(engine, physics, vfx);
    const dropSystem: DropSystem = new DropSystem(engine, physics, vfx);
    zombieSystem = new ZombieSystem(engine, physics, combat, projectileSystem, dropSystem);
  });

  it('airborne corpse should fall and land on the ground platform', () => {
    const corpse: ZombieCorpse = makeCorpse({
      id: 'fall-1',
      y: 200,
      isGrounded: false,
      velocityY: 0,
    });
    engine.zombieCorpses = [corpse];

    const maxTicks: number = 300;
    for (let tick: number = 0; tick < maxTicks; tick++) {
      zombieSystem.updateZombieCorpses();
      if (corpse.isGrounded) break;
    }

    expect(corpse.isGrounded).toBe(true);
    expect(corpse.y + corpse.height).toBeCloseTo(GAME_CONSTANTS.GROUND_Y, 0);
  });

  it('a corpse flung into the standing puzzle wall lands outside it', (): void => {
    const wall: Platform = { x: 1216, y: 0, width: 64, height: GAME_CONSTANTS.GROUND_Y, solid: true, puzzlePart: 'wall' };
    engine.puzzleWall = vi.fn((): Platform | null => wall);
    engine.zombieCorpses = [makeCorpse({ x: 1180, y: 500, velocityX: 12 })];
    for (let t: number = 0; t < 120; t++) zombieSystem.updateZombieCorpses();
    const corpse: ZombieCorpse = engine.zombieCorpses[0];
    expect(corpse.x + corpse.width).toBeLessThanOrEqual(wall.x);
  });

  it('grounded corpse with no platform or corpse beneath it should un-ground and fall', () => {
    const floatingCorpse: ZombieCorpse = makeCorpse({
      id: 'floating-1',
      y: 100,
      isGrounded: true,
      velocityY: 0,
    });
    engine.zombieCorpses = [floatingCorpse];

    zombieSystem.updateZombieCorpses();

    expect(floatingCorpse.isGrounded).toBe(false);
  });

  it('floating corpse should eventually reach the ground after re-validation', () => {
    const floatingCorpse: ZombieCorpse = makeCorpse({
      id: 'floating-2',
      y: 100,
      isGrounded: true,
      velocityY: 0,
    });
    engine.zombieCorpses = [floatingCorpse];

    const maxTicks: number = 300;
    for (let tick: number = 0; tick < maxTicks; tick++) {
      zombieSystem.updateZombieCorpses();
      if (floatingCorpse.isGrounded && floatingCorpse.y + floatingCorpse.height >= GAME_CONSTANTS.GROUND_Y - 1) break;
    }

    expect(floatingCorpse.isGrounded).toBe(true);
    expect(floatingCorpse.y + floatingCorpse.height).toBeCloseTo(GAME_CONSTANTS.GROUND_Y, 0);
  });

  it('airborne corpse should land on a grounded corpse below it', () => {
    const bottomCorpse: ZombieCorpse = makeCorpse({
      id: 'bottom-1',
      x: 400,
      y: GAME_CONSTANTS.GROUND_Y - 50,
      isGrounded: true,
      velocityY: 0,
    });
    const topCorpse: ZombieCorpse = makeCorpse({
      id: 'top-1',
      x: 400,
      y: 200,
      isGrounded: false,
      velocityY: 0,
    });
    engine.zombieCorpses = [bottomCorpse, topCorpse];

    const maxTicks: number = 300;
    for (let tick: number = 0; tick < maxTicks; tick++) {
      zombieSystem.updateZombieCorpses();
      if (topCorpse.isGrounded) break;
    }

    expect(topCorpse.isGrounded).toBe(true);
    expect(topCorpse.y).toBeLessThan(bottomCorpse.y);
  });
});

describe('ZombieSystem — hesitation attack timing', () => {
  let engine: IGameEngine;
  let zombieSystem: ZombieSystem;
  let player: CharacterState;
  let zombie: ZombieState;

  beforeEach(() => {
    player = makePlayer();
    zombie = makeZombie();
    engine = makeMockEngine(player, [zombie]);

    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const vfx: VfxSystem = new VfxSystem(engine);
    const dropSystemStub = { rollDrops: vi.fn() } as never;
    const combat: CombatSystem = new CombatSystem(engine, physics, vfx, dropSystemStub);
    const projectileSystem: ProjectileSystem = new ProjectileSystem(engine, physics, vfx);
    const dropSystem: DropSystem = new DropSystem(engine, physics, vfx);
    zombieSystem = new ZombieSystem(engine, physics, combat, projectileSystem, dropSystem);
  });

  it('zombie standing next to player should attack within 5 seconds (250 ticks)', () => {
    const maxTicks: number = GAME_CONSTANTS.TICK_RATE * 5;
    let attacked: boolean = false;

    for (let tick: number = 0; tick < maxTicks; tick++) {
      zombieSystem.updateZombies();
      if (zombie.attackAnimTimer > 0) {
        attacked = true;
        break;
      }
    }

    expect(attacked).toBe(true);
  });

  it('zombie hesitation should count down every tick while in range, not only on AI updates', () => {
    const initialHesitation: number = zombie.attackHesitation;
    zombie.reactionDelay = 100;

    zombieSystem.updateZombies();

    const afterOneTick: number = zombie.attackHesitation;
    expect(afterOneTick).toBeLessThan(initialHesitation);
  });
});

describe('ZombieSystem — safe spot', () => {
  const safeSpot: Platform = { x: 800, y: 230, width: 160, height: 32, safe: true };
  const restingY: number = safeSpot.y - GAME_CONSTANTS.PLAYER_HEIGHT;
  let engine: IGameEngine;
  let zombieSystem: ZombieSystem;
  let player: CharacterState;

  beforeEach((): void => {
    player = makePlayer({ x: 100 });
    engine = makeMockEngine(player, []);
    engine.platforms = [...engine.platforms, safeSpot];
    engine.isInSafeSpot = (x: number, y: number): boolean => restsOnSafeSpot(engine.platforms, x, y);
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const vfx: VfxSystem = new VfxSystem(engine);
    const combat: CombatSystem = new CombatSystem(engine, physics, vfx, { rollDrops: vi.fn() } as never);
    zombieSystem = new ZombieSystem(
      engine, physics, combat, new ProjectileSystem(engine, physics, vfx), new DropSystem(engine, physics, vfx),
    );
  });

  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('a player resting on the safe spot is no target; back on the ground they are', (): void => {
    player.x = safeSpot.x + 40;
    player.y = restingY;
    expect(zombieSystem['getAllTargets']()).toHaveLength(0);
    player.y = GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT;
    expect(zombieSystem['getAllTargets']()).toHaveLength(1);
  });

  it('zombies never land on the safe spot: they fall through it', (): void => {
    const zombie: ZombieState = makeZombie({ x: safeSpot.x + 40, isGrounded: false, velocityY: 2, reactionDelay: 1_000 });
    zombie.y = safeSpot.y - zombie.instanceHeight - 2;
    engine.zombies = [zombie];
    for (let tick: number = 0; tick < 120 && !(zombie.isGrounded && zombie.y > safeSpot.y); tick++) {
      zombieSystem.updateZombies();
    }
    expect(zombie.y + zombie.instanceHeight).toBeCloseTo(GAME_CONSTANTS.GROUND_Y, 0);
  });

  it('zombies never rise on the safe spot', (): void => {
    for (let i: number = 0; i < 300; i++) {
      const spot: { x: number; y: number } = zombieSystem['pickSpawnSpot'](30, 40);
      expect(spot.y).not.toBe(safeSpot.y - 40);
    }
  });

  it('with everyone resting, zombies shamble around instead of freezing', (): void => {
    player.x = safeSpot.x + 40;
    player.y = restingY;
    // attackCooldown: skip the idle swing (it stops the zombie for a moment).
    const zombie: ZombieState = makeZombie({ x: 300, velocityX: 0, isGrounded: true, attackCooldown: 50 });
    engine.zombies = [zombie];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    zombieSystem['updateZombieAI'](zombie, ZOMBIE_TYPES[ZombieType.Walker]);
    expect(zombie.velocityX).not.toBe(0);
  });
});

describe('CombatSystem — kills and XP', () => {
  let engine: IGameEngine;
  let combat: CombatSystem;

  beforeEach((): void => {
    engine = makeMockEngine(makePlayer(), []);
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    combat = new CombatSystem(engine, physics, new VfxSystem(engine), { rollDrops: vi.fn() } as never);
  });

  it('kill XP grows with the floor', (): void => {
    const gained: number[] = [];
    engine.onXpGained = (xp: number): void => {
      gained.push(xp);
    };
    engine.floor = 1;
    combat.handleZombieDeath(makeZombie({ id: 'a', instanceXpReward: 10 }));
    engine.floor = 6;
    combat.handleZombieDeath(makeZombie({ id: 'b', instanceXpReward: 10 }));
    expect(gained[0]).toBe(10);
    expect(gained[1]).toBe(Math.floor(10 * (1 + 5 * GAME_CONSTANTS.ZOMBIE_XP_SCALE_PER_WAVE)));
  });

  it('a zombie slain under the exit leaves an ordinary corpse: it keeps its fling and a narrow foothold', (): void => {
    engine.exitPlatform = { x: 1068, y: 310, width: GAME_CONSTANTS.EXIT_PLATFORM_WIDTH, height: 32 };
    combat.handleZombieDeath(makeZombie({ x: 1150, isGrounded: false, velocityX: 4, velocityY: -2 }));
    const corpse: ZombieCorpse = engine.zombieCorpses[engine.zombieCorpses.length - 1];
    expect(Math.abs(corpse.velocityX - 4)).toBeLessThanOrEqual(GAME_CONSTANTS.ZOMBIE_CORPSE_DEATH_SCATTER);
    expect(corpseSurface(corpse).width).toBeCloseTo(corpse.width * GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_WIDTH_RATIO);
    expect(corpse.frozen).toBe(false);
  });
});

describe('monster magnet drag', () => {
  const casterX: number = 100;
  const casterY: number = GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT;

  // Land exactly on the caster (no random spread) so gaps are measurable.
  beforeEach((): void => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('does not teleport: a far zombie braces, then closes the gap a little more every tick', (): void => {
    const z: ZombieState = makeZombie({ x: 600 });
    pullZombiesToward([z], casterX, casterY, 1000);
    expect(z.magnetPull).not.toBeNull();
    expect(z.x).toBe(600);

    let ticks: number = 0;
    while (advanceMagnetPull(z) && z.x === 600 && ticks < 100) ticks++;
    expect(ticks, 'braces for a moment before it is torn loose').toBeGreaterThan(0);

    const gaps: number[] = [];
    while (z.magnetPull && ticks < 200) {
      advanceMagnetPull(z);
      gaps.push(Math.abs(z.x - casterX));
      ticks++;
    }
    expect(gaps.length, 'the drag takes several ticks').toBeGreaterThan(5);
    for (let i: number = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThanOrEqual(gaps[i - 1] + 1e-9);
    const firstStep: number = 600 - casterX - gaps[0];
    const lastStep: number = gaps[gaps.length - 2] - gaps[gaps.length - 1];
    expect(lastStep, 'accelerates into the caster').toBeGreaterThan(firstStep);
    expect(z.x, 'lands at the caster spot').toBeCloseTo(casterX, 5);
    expect(z.y + z.instanceHeight).toBeCloseTo(GAME_CONSTANTS.GROUND_Y, 5);
    expect(z.magnetPull).toBeNull();
  });

  it('lifts the zombie off its feet mid-drag', (): void => {
    const z: ZombieState = makeZombie({ x: 600 });
    pullZombiesToward([z], casterX, casterY, 1000);
    let highest: number = z.y;
    while (advanceMagnetPull(z)) highest = Math.min(highest, z.y);
    expect(highest).toBeLessThan(GAME_CONSTANTS.GROUND_Y - z.instanceHeight - 5);
  });

  it('bosses resist, and zombies out of range are left alone', (): void => {
    const boss: ZombieState = makeZombie({ id: 'boss', type: ZombieType.Boss, x: 300 });
    const far: ZombieState = makeZombie({ id: 'far', x: 1200 });
    pullZombiesToward([boss, far], casterX, casterY, 500);
    expect(boss.magnetPull).toBeNull();
    expect(far.magnetPull).toBeNull();
  });
});

describe('Eater zombie', (): void => {
  let engine: IGameEngine;
  let zombieSystem: ZombieSystem;
  let player: CharacterState;

  function lyingCorpse(id: string, x: number): ZombieCorpse {
    return makeCorpse({ id, x, y: GAME_CONSTANTS.GROUND_Y - 50, isGrounded: true, landProcessed: true });
  }

  function makeEater(overrides: Partial<ZombieState> = {}): ZombieState {
    return makeZombie({ id: 'eater-1', type: ZombieType.Eater, attackHesitation: 0, instanceWidth: 30, instanceHeight: 40, y: GAME_CONSTANTS.GROUND_Y - 40, ...overrides });
  }

  function eatersIn(e: IGameEngine): ZombieState[] {
    return e.zombies.filter((z: ZombieState): boolean => z.type === ZombieType.Eater);
  }

  beforeEach((): void => {
    player = makePlayer({ x: 100, y: GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT });
    engine = makeMockEngine(player, []);
    // The exit (and the pile under it) far left, out of the way of these tests' corpses.
    engine.exitPlatform = { x: 0, y: 130, width: 60, height: 20 };
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const vfx: VfxSystem = new VfxSystem(engine);
    const combat: CombatSystem = new CombatSystem(engine, physics, vfx, { rollDrops: vi.fn() } as never);
    zombieSystem = new ZombieSystem(
      engine, physics, combat, new ProjectileSystem(engine, physics, vfx), new DropSystem(engine, physics, vfx),
    );
  });

  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('never comes with the regular spawns, on any floor', (): void => {
    const floors: number[] = [1, 5, 12];
    for (const floor of floors) {
      engine.floor = floor;
      for (let i: number = 0; i < 200; i++) {
        engine.zombies = [];
        engine.spawnTimer = 1;
        zombieSystem.updateSpawning();
        expect(eatersIn(engine)).toHaveLength(0);
      }
    }
  });

  it('lying corpses draw one from floor 1, close enough to smell them', (): void => {
    engine.floor = 1;
    engine.zombieCorpses = [lyingCorpse('a', 900), lyingCorpse('b', 950), lyingCorpse('c', 1000)];
    engine.eaterSpawnTimer = 1;
    zombieSystem.updateSpawning();
    const eaters: ZombieState[] = eatersIn(engine);
    expect(eaters).toHaveLength(1);
    expect(engine.eaterSpawnTimer).toBeGreaterThanOrEqual(GAME_CONSTANTS.ZOMBIE_EATER_SPAWN_DELAY_MIN_TICKS);
  });

  it('too few corpses draw none, however long they lie', (): void => {
    engine.zombieCorpses = [lyingCorpse('a', 900), lyingCorpse('b', 950)];
    for (let i: number = 0; i < GAME_CONSTANTS.ZOMBIE_EATER_SPAWN_DELAY_MAX_TICKS * 2; i++) zombieSystem.updateSpawning();
    expect(eatersIn(engine)).toHaveLength(0);
  });

  it('at most ZOMBIE_EATER_MAX_ALIVE per player come at once', (): void => {
    engine.zombieCorpses = [0, 1, 2, 3, 4, 5].map((i: number): ZombieCorpse => lyingCorpse(`c${i}`, 700 + i * 60));
    for (let i: number = 0; i < GAME_CONSTANTS.ZOMBIE_EATER_SPAWN_DELAY_MAX_TICKS * 6; i++) zombieSystem.updateSpawning();
    expect(eatersIn(engine)).toHaveLength(GAME_CONSTANTS.ZOMBIE_EATER_MAX_ALIVE);
  });

  it('eats a corpse in 2 seconds, then it is gone, even while slow to react', (): void => {
    const corpse: ZombieCorpse = lyingCorpse('meal', 1000);
    engine.zombieCorpses = [corpse];
    const eater: ZombieState = makeEater({
      x: 1000, eatingTargetId: 'meal', eatingTimer: GAME_CONSTANTS.ZOMBIE_EATER_EATING_TICKS, reactionDelay: 1000,
    });
    engine.zombies = [eater];
    expect(GAME_CONSTANTS.ZOMBIE_EATER_EATING_TICKS).toBe(2 * GAME_CONSTANTS.TICK_RATE);
    for (let i: number = 0; i < GAME_CONSTANTS.ZOMBIE_EATER_EATING_TICKS - 1; i++) zombieSystem.updateZombies();
    expect(engine.zombieCorpses).toHaveLength(1);
    expect(eater.velocityX).toBe(0);
    zombieSystem.updateZombies();
    expect(engine.zombieCorpses).toHaveLength(0);
    expect(eater.eatingTimer).toBe(0);
  });

  it('stops eating when a player carries the corpse off', (): void => {
    const corpse: ZombieCorpse = lyingCorpse('meal', 1000);
    engine.zombieCorpses = [corpse];
    const eater: ZombieState = makeEater({ x: 1000, eatingTargetId: 'meal', eatingTimer: GAME_CONSTANTS.ZOMBIE_EATER_EATING_TICKS });
    engine.zombies = [eater];
    zombieSystem.updateZombies();
    corpse.carrierId = player.id;
    zombieSystem.updateZombies();
    expect(eater.eatingTimer).toBe(0);
    expect(engine.zombieCorpses).toHaveLength(1);
  });

  it('with corpses around, rarely bites a player in reach: only when the per-tick roll hits', (): void => {
    engine.zombieCorpses = [lyingCorpse('meal', 1100)];
    // Slow to react: it stays beside the player instead of running to the corpse.
    const eater: ZombieState = makeEater({ x: player.x + GAME_CONSTANTS.PLAYER_WIDTH + 5, reactionDelay: 100_000 });
    engine.zombies = [eater];
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (let i: number = 0; i < GAME_CONSTANTS.TICK_RATE * 10; i++) zombieSystem.updateZombies();
    expect(eater.attackAnimTimer).toBe(0);

    vi.spyOn(Math, 'random').mockReturnValue(GAME_CONSTANTS.ZOMBIE_EATER_ATTACK_CHANCE / 2);
    zombieSystem.updateZombies();
    expect(eater.attackAnimTimer).toBeGreaterThan(0);
    expect(eater.facing).toBe(-1);
  });

  it('never bites while eating', (): void => {
    engine.zombieCorpses = [lyingCorpse('meal', player.x + 40)];
    const eater: ZombieState = makeEater({
      x: player.x + GAME_CONSTANTS.PLAYER_WIDTH + 5, eatingTargetId: 'meal', eatingTimer: GAME_CONSTANTS.ZOMBIE_EATER_EATING_TICKS,
    });
    engine.zombies = [eater];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    for (let i: number = 0; i < GAME_CONSTANTS.ZOMBIE_EATER_EATING_TICKS - 1; i++) {
      zombieSystem.updateZombies();
      expect(eater.attackAnimTimer).toBe(0);
    }
  });

  it('smells a corpse across the whole screen and runs to it, steering every tick', (): void => {
    engine.zombieCorpses = [lyingCorpse('far', GAME_CONSTANTS.CANVAS_WIDTH - 60)];
    const eater: ZombieState = makeEater({ x: 20 });
    engine.zombies = [eater];
    zombieSystem.updateZombies();
    expect(eater.velocityX).toBeCloseTo(eater.instanceSpeed * GAME_CONSTANTS.ZOMBIE_EATER_RUN_SPEED_MULT);
    expect(eater.reactionDelay).toBe(0);
  });

  describe('reaching corpses on ledges', (): void => {
    const low: Platform = { x: 600, y: GAME_CONSTANTS.LEVEL_TIER_Y[0], width: 200, height: 32 };
    const high: Platform = { x: 900, y: GAME_CONSTANTS.LEVEL_TIER_Y[1], width: 200, height: 32 };

    function corpseOn(id: string, ledge: Platform, x: number): ZombieCorpse {
      return makeCorpse({ id, x, y: ledge.y - 50, isGrounded: true, landProcessed: true });
    }

    function runUntilEaten(eater: ZombieState, maxTicks: number): number {
      for (let tick: number = 1; tick <= maxTicks; tick++) {
        zombieSystem.updateZombies();
        if (engine.zombieCorpses.length === 0) return tick;
      }
      expect.fail(`still not eaten after ${maxTicks} ticks; eater at ${eater.x}, ${eater.y}`);
      return maxTicks;
    }

    it('jumps up onto the ledge a corpse lies on and eats it', (): void => {
      engine.platforms = [...engine.platforms, low];
      engine.zombieCorpses = [corpseOn('up', low, 700)];
      const eater: ZombieState = makeEater({ x: 200 });
      engine.zombies = [eater];
      runUntilEaten(eater, 600);
      // On the ledge (or on the corpse's foothold, a few px above it).
      expect(eater.y + eater.instanceHeight, 'it is up on the ledge').toBeLessThanOrEqual(low.y);
      expect(eater.y + eater.instanceHeight).toBeGreaterThan(low.y - 10);
    });

    it('climbs two ledges up, one at a time', (): void => {
      engine.platforms = [...engine.platforms, low, high];
      engine.zombieCorpses = [corpseOn('top', high, 1000)];
      const eater: ZombieState = makeEater({ x: 200 });
      engine.zombies = [eater];
      runUntilEaten(eater, 900);
      expect(eater.y + eater.instanceHeight).toBeLessThanOrEqual(high.y);
      expect(eater.y + eater.instanceHeight).toBeGreaterThan(high.y - 10);
    });

    it('hops a crate in its way on the ground', (): void => {
      const crate: Platform = { x: 450, y: GAME_CONSTANTS.GROUND_Y - 22, width: 30, height: 22, solid: true };
      engine.platforms = [...engine.platforms, crate];
      engine.zombieCorpses = [lyingCorpse('past', 700)];
      const eater: ZombieState = makeEater({ x: 200 });
      engine.zombies = [eater];
      runUntilEaten(eater, 600);
    });

    it('two Eaters go for two different corpses', (): void => {
      engine.zombieCorpses = [lyingCorpse('a', 700), lyingCorpse('b', 1000)];
      const first: ZombieState = makeEater({ id: 'eater-1', x: 500 });
      const second: ZombieState = makeEater({ id: 'eater-2', x: 520 });
      engine.zombies = [first, second];
      zombieSystem.updateZombies();
      expect(first.eatingTargetId).not.toBeNull();
      expect(second.eatingTargetId).not.toBeNull();
      expect(first.eatingTargetId).not.toBe(second.eatingTargetId);
    });
  });

  describe('playtest bugs (round 4)', (): void => {
    const safeSpot: Platform = { x: 900, y: 230, width: 160, height: 32, safe: true };

    it('leaves corpses on the safe spot alone: no meal up there', (): void => {
      engine.platforms = [...engine.platforms, safeSpot];
      engine.zombieCorpses = [0, 1, 2].map((i: number): ZombieCorpse => makeCorpse({ id: `up${i}`, x: 920 + i * 30, y: safeSpot.y - 50, isGrounded: true }));
      const eater: ZombieState = makeEater({ x: 300 });
      engine.zombies = [eater];
      zombieSystem.updateZombies();
      expect(eater.eatingTargetId).toBeNull();
    });

    it('leaves the pile under the exit alone, and it draws no Eater', (): void => {
      engine.exitPlatform = { x: 600, y: 130, width: 200, height: 20 };
      engine.zombieCorpses = [0, 1, 2, 3].map((i: number): ZombieCorpse => lyingCorpse(`exit${i}`, 620 + i * 40));
      const eater: ZombieState = makeEater({ x: 200 });
      engine.zombies = [eater];
      zombieSystem.updateZombies();
      expect(eater.eatingTargetId).toBeNull();
      engine.zombies = [];
      for (let i: number = 0; i < GAME_CONSTANTS.ZOMBIE_EATER_SPAWN_DELAY_MAX_TICKS * 2; i++) zombieSystem.updateSpawning();
      expect(eatersIn(engine)).toHaveLength(0);
    });

    it('a pile of three still draws an Eater (buried bodies count as food, just later)', (): void => {
      const step: number = GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_HEIGHT;
      engine.zombieCorpses = [0, 1, 2].map((i: number): ZombieCorpse =>
        makeCorpse({ id: `p${i}`, x: 1000, y: GAME_CONSTANTS.GROUND_Y - 50 - i * step, isGrounded: true }));
      engine.eaterSpawnTimer = 1;
      zombieSystem.updateSpawning();
      expect(eatersIn(engine)).toHaveLength(1);
    });

    it('eats a pile from the top, not the corpse buried under it', (): void => {
      const bottom: ZombieCorpse = lyingCorpse('bottom', 1000);
      const top: ZombieCorpse = makeCorpse({ id: 'top', x: 1000, y: bottom.y - GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_HEIGHT, isGrounded: true });
      engine.zombieCorpses = [bottom, top];
      const eater: ZombieState = makeEater({ x: 1000 });
      engine.zombies = [eater];
      zombieSystem.updateZombies();
      expect(eater.eatingTargetId).toBe('top');
    });

    it('never rides on another zombie: an Eater falling onto one lands on the ground', (): void => {
      const walker: ZombieState = makeZombie({ id: 'walker', x: 600, reactionDelay: 100_000 });
      const eater: ZombieState = makeEater({ x: 600, y: walker.y - 60, isGrounded: false, reactionDelay: 100_000 });
      engine.zombies = [walker, eater];
      for (let i: number = 0; i < 60; i++) zombieSystem.updateZombies();
      expect(eater.y + eater.instanceHeight).toBe(GAME_CONSTANTS.GROUND_Y);
    });
  });

  describe('hungry (no corpse on the floor)', (): void => {
    function walkerNextTo(eater: ZombieState, hp: number): ZombieState {
      return makeZombie({ id: 'walker', x: eater.x + eater.instanceWidth + 5, hp, maxHp: hp, reactionDelay: 100_000 });
    }

    it('runs at the nearest zombie or player', (): void => {
      const eater: ZombieState = makeEater({ x: 900 });
      const walker: ZombieState = makeZombie({ id: 'walker', x: 600, reactionDelay: 100_000 });
      engine.zombies = [eater, walker];
      zombieSystem.updateZombies();
      expect(eater.velocityX).toBeCloseTo(-eater.instanceSpeed * GAME_CONSTANTS.ZOMBIE_EATER_RUN_SPEED_MULT);
      expect(eater.facing).toBe(-1);
    });

    it('attacks a zombie in reach without the rare roll, and the bite hurts it for every player to see', (): void => {
      const eater: ZombieState = makeEater({ x: 900, facing: 1 });
      const walker: ZombieState = walkerNextTo(eater, 100);
      engine.zombies = [eater, walker];
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      zombieSystem.updateZombies();
      expect(eater.attackAnimTimer, 'starts its attack (wind-up) at once').toBeGreaterThan(0);
      for (let i: number = 0; i < GAME_CONSTANTS.ZOMBIE_ATTACK_WINDUP_TICKS + ZOMBIE_TYPES[ZombieType.Eater].attackAnimTicks && walker.hp === 100; i++) {
        zombieSystem.updateZombies();
      }
      expect(walker.hp).toBeLessThan(100);
      expect(walker.velocityX, 'knocked away from the Eater').toBeGreaterThan(0);
      expect(walker.knockbackFrames, 'knocked away').toBeGreaterThan(0);
      const bite: string[] = engine.pendingVfxEvents
        .filter((evt: VfxEvent): boolean => evt.color === GAME_CONSTANTS.ZOMBIE_EATER_BITE_COLOR)
        .map((evt: VfxEvent): string => evt.type);
      expect(bite).toEqual(expect.arrayContaining([VfxEventType.HitParticles, VfxEventType.DamageNumber]));
      expect(engine.pendingVfxEvents.some((evt: VfxEvent): boolean => evt.type === VfxEventType.HitMark)).toBe(true);
    });

    it('a zombie it kills leaves a corpse: its next meal', (): void => {
      const eater: ZombieState = makeEater({ x: 900, facing: 1 });
      const walker: ZombieState = walkerNextTo(eater, 1);
      engine.zombies = [eater, walker];
      for (let i: number = 0; i < GAME_CONSTANTS.ZOMBIE_ATTACK_WINDUP_TICKS + ZOMBIE_TYPES[ZombieType.Eater].attackAnimTicks + 2; i++) {
        zombieSystem.updateZombies();
      }
      expect(walker.isDead).toBe(true);
      expect(engine.zombieCorpses.map((c: ZombieCorpse): string => c.id)).toEqual(['walker']);
    });

    it('goes for a player when one is nearest', (): void => {
      const eater: ZombieState = makeEater({ x: player.x + GAME_CONSTANTS.PLAYER_WIDTH + 5 });
      engine.zombies = [eater];
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      zombieSystem.updateZombies();
      expect(eater.attackAnimTimer).toBeGreaterThan(0);
      expect(eater.facing).toBe(-1);
    });
  });
});
