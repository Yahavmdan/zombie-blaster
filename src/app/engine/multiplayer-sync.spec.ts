import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GAME_CONSTANTS,
  ZOMBIE_TYPES,
  CharacterState,
  CharacterClass,
  Direction,
} from '@shared/index';
import { ZombieState, ZombieType } from '@shared/game-entities';
import { IGameEngine, Platform } from './engine-types';
import { PhysicsSystem } from './physics-system';
import { VfxSystem } from './vfx-system';
import { CombatSystem } from './combat-system';
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

describe('Bug 1: non-host should see host damage on zombies', () => {
  let engine: GameEngine;

  beforeEach(() => {
    const canvas: HTMLCanvasElement = createMockCanvas();
    engine = new GameEngine(canvas);
    engine.isMultiplayerClient = true;
    engine.player = makePlayer();
  });

  it('should show damage number when zombie disappears from sync (killed by host)', () => {
    const zombie: ZombieState = makeZombie({ id: 'z1', hp: 30 });

    engine.applyRemoteZombies([{ ...zombie }]);
    expect(engine.damageNumbers.length).toBe(0);

    engine.applyRemoteZombies([]);

    const killDamageNumber: boolean = engine.damageNumbers.some(
      (dn: { value: number }) => dn.value === 30,
    );
    expect(killDamageNumber).toBe(true);
  });

  it('should spawn hit mark when HP delta detected in applyRemoteZombies', () => {
    const zombie: ZombieState = makeZombie({ id: 'z1', hp: 100 });

    engine.applyRemoteZombies([{ ...zombie }]);
    expect(engine.hitMarks.length).toBe(0);

    const damagedZombie: ZombieState = { ...zombie, hp: 70 };
    engine.applyRemoteZombies([damagedZombie]);

    expect(engine.hitMarks.length).toBeGreaterThan(0);
  });

  it('should spawn damage number when HP delta detected', () => {
    const zombie: ZombieState = makeZombie({ id: 'z1', hp: 100 });

    engine.applyRemoteZombies([{ ...zombie }]);

    const damagedZombie: ZombieState = { ...zombie, hp: 70 };
    engine.applyRemoteZombies([damagedZombie]);

    const deltaDamageNumber: boolean = engine.damageNumbers.some(
      (dn: { value: number }) => dn.value === 30,
    );
    expect(deltaDamageNumber).toBe(true);
  });

  it('should spawn hit mark when zombie disappears from sync', () => {
    const zombie: ZombieState = makeZombie({ id: 'z1', hp: 50 });

    engine.applyRemoteZombies([{ ...zombie }]);

    engine.applyRemoteZombies([]);

    expect(engine.hitMarks.length).toBeGreaterThan(0);
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
    exitRope: null,
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
    HIT_MARK_TICKS_PER_FRAME: 3,
    HIT_MARK_RENDER_SIZE: 55,
    doubleJumpUsed: false,
    doubleJumpAnimTicks: 0,
    dashPhase: null,
    reviveTargetId: null,
    reviveProgressTicks: 0,
    activeSpecialEffects: [],
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
    repositionExitPlatform: vi.fn(),
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
