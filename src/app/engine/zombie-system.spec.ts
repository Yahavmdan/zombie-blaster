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
import { ZombieSystem } from './zombie-system';
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
    inventory: { gold: 0, hpPotions: 0, mpPotions: 0 },
    x: 400,
    y: GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    isDead: false,
    isAttacking: false,
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
    zombies,
    zombieCorpses: [],
    particles: [],
    damageNumbers: [],
    dropNotifications: [],
    DROP_NOTIFICATION_LIFE_TICKS: 250,
    worldDrops: [],
    platforms: [groundPlatform],
    ropes: [],
    keys: { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false, skill3: false, skill4: false, skill5: false, skill6: false, openStats: false, openSkills: false, useHpPotion: false, useMpPotion: false, openShop: false },
    attackCooldown: 0,
    attackAnimTicks: 0,
    attackHitPending: false,
    attackHitDelay: 0,
    invincibilityFrames: 0,
    potionCooldown: 0,
    jumpHeld: false,
    ropeJumpCooldown: 0,
    platformDropTimer: 0,
    playerUsableSkills: [],
    skillCooldowns: new Map(),
    passiveRecoveryTimers: new Map(),
    playerStandingStillTicks: 0,
    playerStunTicks: 0,
    wave: 1,
    zombiesKilledThisWave: 0,
    zombiesToSpawnThisWave: 5,
    zombiesSpawnedThisWave: 1,
    spawnTimer: 999,
    waveTransitionTimer: 0,
    backgroundStars: [],
    screenShakeFrames: 0,
    screenShakeIntensity: 0,
    screenFlashColor: null,
    screenFlashFrames: 0,
    spriteAnimator: { setState: vi.fn(), tick: vi.fn(), restart: vi.fn(), load: vi.fn(), isLoaded: vi.fn().mockReturnValue(false), draw: vi.fn() } as never,
    zombieSpriteAnimator: {
      getSpriteKey: vi.fn().mockReturnValue('walker'),
      tick: vi.fn(),
      setState: vi.fn(),
      setStateReversed: vi.fn(),
      removeInstance: vi.fn(),
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
    HIT_MARK_TICKS_PER_FRAME: 3,
    HIT_MARK_RENDER_SIZE: 55,
    godMode: false,
    onPlayerUpdate: null,
    onZombiesUpdate: null,
    onWaveUpdate: null,
    onXpGained: null,
    onScoreUpdate: null,
    onGameOver: null,
    onGoldPickup: null,
    onPotionPickup: null,
    onUseHpPotion: null,
    onUseMpPotion: null,
    onOpenShop: null,
  };
}

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
    const dropSystem = { rollDrops: vi.fn() } as never;
    const combat: CombatSystem = new CombatSystem(engine, physics, vfx, dropSystem);
    const projectileSystem: ProjectileSystem = new ProjectileSystem(engine, physics, vfx);
    zombieSystem = new ZombieSystem(engine, physics, vfx, combat, projectileSystem);
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
