import {
  CharacterState,
  GAME_CONSTANTS,
  SKILLS,
  SkillDefinition,
  SkillType,
} from '@shared/index';
import {
  DropType,
  WorldDrop,
  ZombieState,
} from '@shared/game-entities';
import { InputKeys } from '@shared/messages';
import { Particle, ParticleShape, FadeMode } from './particle-types';
import { SpriteAnimator } from './sprite-animator';
import { ZombieSpriteAnimator } from './zombie-sprite-animator';
import { MapRenderer } from './map-renderer';
import { SpriteEffectSystem } from './sprite-effect-system';
import {
  BackgroundStar,
  DamageNumber,
  DragonImpact,
  DragonProjectile,
  DropNotification,
  HitMark,
  IGameEngine,
  DashPhaseState,
  Platform,
  PoisonEffect,
  Rope,
  SpitterProjectile,
  ZombieCorpse,
} from './engine-types';
import { PhysicsSystem } from './physics-system';
import { VfxSystem } from './vfx-system';
import { DropSystem } from './drop-system';
import { CombatSystem } from './combat-system';
import { ProjectileSystem } from './projectile-system';
import { ZombieSystem } from './zombie-system';
import { RenderSystem } from './render-system';

export type { Particle };
export { ParticleShape, FadeMode };

export type {
  DamageNumber,
  DropNotification,
  Platform,
  Rope,
  BackgroundStar,
} from './engine-types';

export class GameEngine implements IGameEngine {
  readonly ctx: CanvasRenderingContext2D;
  private animationFrameId: number = 0;
  private lastTimestamp: number = 0;
  private accumulator: number = 0;
  readonly fixedDt: number = 1000 / GAME_CONSTANTS.TICK_RATE;

  player: CharacterState | null = null;
  zombies: ZombieState[] = [];
  zombieCorpses: ZombieCorpse[] = [];
  particles: Particle[] = [];
  damageNumbers: DamageNumber[] = [];
  dropNotifications: DropNotification[] = [];
  readonly DROP_NOTIFICATION_LIFE_TICKS: number = 250;
  worldDrops: WorldDrop[] = [];
  platforms: Platform[] = [];
  ropes: Rope[] = [];
  keys: InputKeys = { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false, skill3: false, skill4: false, skill5: false, skill6: false, openStats: false, openSkills: false, useHpPotion: false, useMpPotion: false, openShop: false };
  attackCooldown: number = 0;
  attackAnimTicks: number = 0;
  attackHitPending: boolean = false;
  attackHitDelay: number = 0;
  invincibilityFrames: number = 0;
  potionCooldown: number = 0;
  jumpHeld: boolean = false;
  ropeJumpCooldown: number = 0;
  platformDropTimer: number = 0;

  playerUsableSkills: SkillDefinition[] = [];
  skillCooldowns: Map<string, number> = new Map();
  passiveRecoveryTimers: Map<string, number> = new Map();
  playerStandingStillTicks: number = 0;
  playerStunTicks: number = 0;
  autoPotionCooldown: number = 0;

  wave: number = 1;
  zombiesKilledThisWave: number = 0;
  zombiesToSpawnThisWave: number = 0;
  zombiesSpawnedThisWave: number = 0;
  spawnTimer: number = 0;
  waveTransitionTimer: number = 0;

  backgroundStars: BackgroundStar[] = [];

  screenShakeFrames: number = 0;
  screenShakeIntensity: number = 0;
  screenFlashColor: string | null = null;
  screenFlashFrames: number = 0;

  readonly spriteAnimator: SpriteAnimator = new SpriteAnimator();
  readonly zombieSpriteAnimator: ZombieSpriteAnimator = new ZombieSpriteAnimator();
  readonly mapRenderer: MapRenderer = new MapRenderer();
  readonly spriteEffectSystem: SpriteEffectSystem = new SpriteEffectSystem();
  readonly SPRITE_RENDER_SIZE: number = 96;

  dragonProjectiles: DragonProjectile[] = [];
  dragonImpacts: DragonImpact[] = [];
  readonly dragonProjectileImg: HTMLImageElement = new Image();
  readonly dragonImpactImg: HTMLImageElement = new Image();

  spitterProjectiles: SpitterProjectile[] = [];
  poisonEffect: PoisonEffect | null = null;
  readonly DRAGON_PROJ_FRAME_W: number = 105;
  readonly DRAGON_PROJ_FRAME_H: number = 118;
  readonly DRAGON_PROJ_FRAMES: number = 3;
  readonly DRAGON_IMPACT_FRAME_W: number = 85;
  readonly DRAGON_IMPACT_FRAME_H: number = 131;
  readonly DRAGON_IMPACT_FRAMES: number = 4;

  hitMarks: HitMark[] = [];
  readonly HIT_MARK_TICKS_PER_FRAME: number = 3;
  readonly HIT_MARK_RENDER_SIZE: number = 55;

  onPlayerUpdate: ((player: CharacterState) => void) | null = null;
  onZombiesUpdate: ((zombies: ZombieState[]) => void) | null = null;
  onWaveUpdate: ((wave: number, remaining: number) => void) | null = null;
  onXpGained: ((amount: number) => void) | null = null;
  onScoreUpdate: ((delta: number) => void) | null = null;
  onGameOver: (() => void) | null = null;
  onGoldPickup: ((amount: number) => void) | null = null;
  onPotionPickup: ((type: DropType) => void) | null = null;
  onUseHpPotion: (() => boolean) | null = null;
  onUseMpPotion: (() => boolean) | null = null;
  onOpenShop: (() => void) | null = null;
  dashPhase: DashPhaseState | null = null;

  godMode: boolean = false;
  showCollisionBoxes: boolean = false;

  private readonly physicsSystem: PhysicsSystem;
  private readonly vfxSystem: VfxSystem;
  private readonly dropSystem: DropSystem;
  private readonly combatSystem: CombatSystem;
  private readonly projectileSystem: ProjectileSystem;
  private readonly zombieSystem: ZombieSystem;
  private readonly renderSystem: RenderSystem;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.canvas.width = GAME_CONSTANTS.CANVAS_WIDTH;
    this.canvas.height = GAME_CONSTANTS.CANVAS_HEIGHT;

    this.physicsSystem = new PhysicsSystem(this);
    this.vfxSystem = new VfxSystem(this);
    this.dropSystem = new DropSystem(this, this.physicsSystem, this.vfxSystem);
    this.combatSystem = new CombatSystem(this, this.physicsSystem, this.vfxSystem, this.dropSystem);
    this.projectileSystem = new ProjectileSystem(this, this.physicsSystem, this.vfxSystem);
    this.zombieSystem = new ZombieSystem(this, this.physicsSystem, this.vfxSystem, this.combatSystem, this.projectileSystem);
    this.renderSystem = new RenderSystem(this);

    this.initPlatforms();
    this.initRopes();
    this.initStars();
    this.spriteAnimator.load();
    this.zombieSpriteAnimator.load();
    this.mapRenderer.load();
    this.spriteEffectSystem.load();
    this.dragonProjectileImg.src = 'sprites/zombies/dragon_boss/AttackEffect2.png';
    this.dragonImpactImg.src = 'sprites/zombies/dragon_boss/AttackEffect1.png';
  }

  private initPlatforms(): void {
    this.platforms = [
      { x: -100, y: GAME_CONSTANTS.GROUND_Y, width: GAME_CONSTANTS.CANVAS_WIDTH + 200, height: 100 },
      { x: 80, y: 530, width: 220, height: 20 },
      { x: 800, y: 530, width: 220, height: 20 },
      { x: 420, y: 430, width: 280, height: 20 },
      { x: 150, y: 330, width: 200, height: 20 },
      { x: 820, y: 340, width: 200, height: 20 },
    ];
  }

  private initRopes(): void {
    this.ropes = [
      { x: 190, topY: 330, bottomY: 530 },
      { x: 910, topY: 340, bottomY: 530 },
      { x: 560, topY: 430, bottomY: GAME_CONSTANTS.GROUND_Y },
    ];
  }

  private initStars(): void {
    for (let i: number = 0; i < GAME_CONSTANTS.BACKGROUND_STAR_COUNT; i++) {
      this.backgroundStars.push({
        x: Math.random() * GAME_CONSTANTS.CANVAS_WIDTH,
        y: Math.random() * (GAME_CONSTANTS.GROUND_Y - 50),
        size: Math.random() * 2 + 0.5,
        brightness: Math.random() * 0.5 + 0.3,
      });
    }
  }

  start(player: CharacterState): void {
    this.player = { ...player };
    this.zombies = [];
    this.zombieCorpses = [];
    this.particles = [];
    this.damageNumbers = [];
    this.dropNotifications = [];
    this.worldDrops = [];
    this.dragonProjectiles = [];
    this.dragonImpacts = [];
    this.spitterProjectiles = [];
    this.poisonEffect = null;
    this.hitMarks = [];
    this.wave = 1;
    this.zombiesKilledThisWave = 0;
    this.playerUsableSkills = SKILLS.filter(
      (s: SkillDefinition) =>
        s.classId === player.classId &&
        (s.type === SkillType.Active || s.type === SkillType.Buff) &&
        (player.skillLevels[s.id] ?? 0) > 0,
    ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel)
     .slice(0, 6);
    this.skillCooldowns.clear();
    this.passiveRecoveryTimers.clear();
    this.playerStandingStillTicks = 0;
    this.playerStunTicks = 0;
    this.autoPotionCooldown = 0;
    this.zombieSystem.startWave();
    this.lastTimestamp = performance.now();
    this.loop(this.lastTimestamp);
  }

  stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  setWave(wave: number): void {
    for (const z of this.zombies) {
      z.isDead = true;
    }
    this.zombies = [];
    for (const corpse of this.zombieCorpses) {
      this.zombieSpriteAnimator.removeInstance(corpse.id);
    }
    this.zombieCorpses = [];
    this.wave = wave;
    this.zombieSystem.startWave();
  }

  setKeys(keys: InputKeys): void {
    this.keys = keys;
  }

  syncProgression(player: CharacterState): void {
    if (!this.player) return;
    const leveled: boolean = player.level > this.player.level;
    this.player.classId = player.classId;
    this.player.level = player.level;
    this.player.xp = player.xp;
    this.player.xpToNext = player.xpToNext;
    this.player.stats = { ...player.stats };
    this.player.derived = { ...player.derived };
    this.player.allocatedStats = { ...player.allocatedStats };
    this.player.unallocatedStatPoints = player.unallocatedStatPoints;
    this.player.unallocatedSkillPoints = player.unallocatedSkillPoints;
    this.player.skillLevels = { ...player.skillLevels };
    this.player.activeBuffs = [...player.activeBuffs];
    this.player.inventory = { ...player.inventory };
    if (leveled) {
      this.player.hp = player.hp;
      this.player.mp = player.mp;
      this.vfxSystem.spawnLevelUpEffect();
    }
    this.playerUsableSkills = SKILLS.filter(
      (s: SkillDefinition) =>
        s.classId === this.player!.classId &&
        (s.type === SkillType.Active || s.type === SkillType.Buff) &&
        (this.player!.skillLevels[s.id] ?? 0) > 0,
    ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel)
     .slice(0, 6);
  }

  private loop(timestamp: number): void {
    const dt: number = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    this.accumulator += dt;

    while (this.accumulator >= this.fixedDt) {
      this.update();
      this.accumulator -= this.fixedDt;
    }

    this.renderSystem.render();
    this.animationFrameId = requestAnimationFrame((t: number) => this.loop(t));
  }

  private update(): void {
    if (!this.player) return;

    this.renderSystem.updatePlayerAnimState();
    this.spriteAnimator.tick();

    if (this.player.isDead) return;

    this.combatSystem.updateAttackTiming();
    this.updatePlayerActions();
    this.zombieSystem.updateZombies();
    this.projectileSystem.updateDragonProjectiles();
    this.projectileSystem.updateSpitterProjectiles();
    this.projectileSystem.updatePoisonEffect();
    this.vfxSystem.updateDragonImpacts();
    this.vfxSystem.updateHitMarks();
    this.zombieSystem.updateSpawning();
    this.zombieSystem.updateZombieCorpses();
    this.dropSystem.updateDrops();
    this.dropSystem.updatePotionUse();
    this.vfxSystem.updateParticles();
    this.vfxSystem.updateDamageNumbers();
    this.vfxSystem.updateDropNotifications();
    this.combatSystem.updateSkillCooldowns();
    this.combatSystem.updateDashPhase();
    this.spriteEffectSystem.tick();
    this.combatSystem.updateActiveBuffs();
    this.combatSystem.updatePassiveSkills();
    this.combatSystem.updateAutoPotion();
    this.zombieSystem.checkWaveCompletion();

    if (this.invincibilityFrames > 0) this.invincibilityFrames--;
    if (this.ropeJumpCooldown > 0) this.ropeJumpCooldown--;
    if (this.platformDropTimer > 0) this.platformDropTimer--;
    if (this.playerStunTicks > 0) this.playerStunTicks--;
  }

  private updatePlayerActions(): void {
    if (!this.player) return;

    this.physicsSystem.updatePlayer();

    if (this.playerStunTicks > 0) return;

    if (this.keys.attack && this.attackCooldown <= 0) {
      this.combatSystem.performAttack();
      this.attackCooldown = GAME_CONSTANTS.PLAYER_ATTACK_COOLDOWN_TICKS;
    }
    if (this.attackCooldown > 0) this.attackCooldown--;

    if (this.keys.skill1) this.combatSystem.tryPerformSkill(0);
    if (this.keys.skill2) this.combatSystem.tryPerformSkill(1);
    if (this.keys.skill3) this.combatSystem.tryPerformSkill(2);
    if (this.keys.skill4) this.combatSystem.tryPerformSkill(3);
    if (this.keys.skill5) this.combatSystem.tryPerformSkill(4);
    if (this.keys.skill6) this.combatSystem.tryPerformSkill(5);
  }
}
