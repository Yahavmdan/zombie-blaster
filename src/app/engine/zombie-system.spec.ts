import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GAME_CONSTANTS,
  ZOMBIE_TYPES,
  CharacterState,
  CharacterClass,
  Direction,
} from '@shared/index';
import { ZombieCorpse, ZombieState, ZombieType } from '@shared/game-entities';
import { EntityInterpolation, IGameEngine, Platform } from './engine-types';
import { PhysicsSystem } from './physics-system';
import { VfxSystem } from './vfx-system';
import { CombatSystem } from './combat-system';
import { DropSystem } from './drop-system';
import { ProjectileSystem } from './projectile-system';
import { ZombieSystem } from './zombie-system';
import { SpriteAnimator } from './sprite-animator';
import { ZombieAnimState } from './zombie-sprite-animator';

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
    exitRope: null,
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
