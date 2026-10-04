import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GAME_CONSTANTS,
  ZOMBIE_TYPES,
  CharacterState,
  CharacterClass,
  Direction,
} from '@shared/index';
import { ZombieCorpse, ZombieState, ZombieType } from '@shared/game-entities';
import { EntityInterpolation, IGameEngine, Platform, ExitStackState } from './engine-types';
import { PhysicsSystem } from './physics-system';
import { VfxSystem } from './vfx-system';
import { CombatSystem } from './combat-system';
import { DropSystem } from './drop-system';
import { ProjectileSystem } from './projectile-system';
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
    particles: [],
    damageNumbers: [],
    dropNotifications: [],
    DROP_NOTIFICATION_LIFE_TICKS: 250,
    worldDrops: [],
    platforms: [groundPlatform],
    ropes: [],
    keys: { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false, skill3: false, skill4: false, skill5: false, skill6: false, openStats: false, openSkills: false, useHpPotion: false, useMpPotion: false, openShop: false, openInventory: false, revive: false, quickSlot1: false, quickSlot2: false, quickSlot3: false, quickSlot4: false, quickSlot5: false, quickSlot6: false, quickSlot7: false, quickSlot8: false },
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
    spawnExitStackEffect: vi.fn(),
    requestHitStop: vi.fn(),
    incomingDamageScale: vi.fn((): number => 1),
    isOnExitStack: vi.fn((): boolean => false),
    getExitStack: vi.fn((): ExitStackState => ({
      columnLeft: -1, columnRight: -1, centerX: -1, baseY: 0, topY: 0, reachY: 0,
      step: 22, steps: 0, stepsNeeded: 0, progress: 0, reachable: false,
    })),
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
    anchored: false,
    platformHeight: GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_HEIGHT,
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

describe('ZombieSystem — exit beacon', () => {
  const stackAt: (reachable: boolean) => ExitStackState = (reachable: boolean): ExitStackState => ({
    columnLeft: 1080, columnRight: 1240, centerX: 1160, baseY: GAME_CONSTANTS.GROUND_Y, topY: GAME_CONSTANTS.GROUND_Y,
    reachY: 230, step: 44, steps: reachable ? 9 : 2, stepsNeeded: 9, progress: reachable ? 1 : 0.2, reachable,
  });
  let engine: IGameEngine;
  let zombieSystem: ZombieSystem;
  let zombie: ZombieState;

  beforeEach((): void => {
    zombie = makeZombie({ x: 300 });
    engine = makeMockEngine(makePlayer(), [zombie]);
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    const vfx: VfxSystem = new VfxSystem(engine);
    const combat: CombatSystem = new CombatSystem(engine, physics, vfx, { rollDrops: vi.fn() } as never);
    zombieSystem = new ZombieSystem(
      engine, physics, combat, new ProjectileSystem(engine, physics, vfx), new DropSystem(engine, physics, vfx),
    );
  });

  it('wandering zombies drift toward the beam while the stack is unfinished', (): void => {
    engine.getExitStack = vi.fn((): ExitStackState => stackAt(false));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(zombieSystem['pickWanderDirection'](zombie, -1)).toBe(1);
    vi.restoreAllMocks();
  });

  it('the beacon goes quiet once the stack is finished', (): void => {
    engine.getExitStack = vi.fn((): ExitStackState => stackAt(true));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(zombieSystem['pickWanderDirection'](zombie, -1)).toBe(-1);
    vi.restoreAllMocks();
  });

  it('while unfinished, spawns can rise on the ground beside (never inside) the beam', (): void => {
    engine.getExitStack = vi.fn((): ExitStackState => stackAt(false));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const spot: { x: number; y: number } = zombieSystem['pickSpawnSpot'](30, 40);
    vi.restoreAllMocks();
    expect(spot.y).toBe(GAME_CONSTANTS.GROUND_Y - 40);
    const centerX: number = spot.x + 15;
    expect(centerX < 1080 || centerX > 1240, 'outside the beam').toBe(true);
    expect(spot.x).toBeGreaterThanOrEqual(0);
    expect(spot.x + 30).toBeLessThanOrEqual(GAME_CONSTANTS.CANVAS_WIDTH);
  });

  it('once the stack is finished, spawns use the normal platforms', (): void => {
    engine.getExitStack = vi.fn((): ExitStackState => stackAt(true));
    const platform: Platform = { x: 100, y: 300, width: 200, height: 20 };
    engine.platforms = [platform];
    const spot: { x: number; y: number } = zombieSystem['pickSpawnSpot'](30, 40);
    expect(spot.y).toBe(260);
    expect(spot.x).toBeGreaterThanOrEqual(100);
  });
});

describe('CombatSystem — kills, XP and the exit beam', () => {
  const beamStack: ExitStackState = {
    columnLeft: 1080, columnRight: 1240, centerX: 1160, baseY: GAME_CONSTANTS.GROUND_Y, topY: GAME_CONSTANTS.GROUND_Y,
    reachY: 230, step: 44, steps: 0, stepsNeeded: 9, progress: 0, reachable: false,
  };
  let engine: IGameEngine;
  let combat: CombatSystem;

  beforeEach((): void => {
    engine = makeMockEngine(makePlayer(), []);
    engine.getExitStack = vi.fn((): ExitStackState => beamStack);
    const physics: PhysicsSystem = new PhysicsSystem(engine);
    combat = new CombatSystem(engine, physics, new VfxSystem(engine), { rollDrops: vi.fn() } as never);
  });

  const lastCorpse: () => ZombieCorpse = (): ZombieCorpse => engine.zombieCorpses[engine.zombieCorpses.length - 1];

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

  it('a zombie slain outside the beam by a player outside it does not join the stack', (): void => {
    combat.handleZombieDeath(makeZombie({ x: 300 }), true, makePlayer({ x: 400 }));
    expect(lastCorpse().anchored).toBe(false);
  });

  it('a kill made by a player standing in the beam joins the stack, wherever the zombie was', (): void => {
    combat.handleZombieDeath(makeZombie({ x: 600 }), true, makePlayer({ x: 1150 }));
    expect(lastCorpse().anchored).toBe(true);
  });

  it('a downed player in the beam does not claim kills', (): void => {
    combat.handleZombieDeath(makeZombie({ x: 600 }), true, makePlayer({ x: 1150, isDown: true }));
    expect(lastCorpse().anchored).toBe(false);
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
