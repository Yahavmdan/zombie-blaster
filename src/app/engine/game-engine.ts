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
  ZombieCorpse,
  ZombieState,
} from '@shared/game-entities';
import { InputKeys } from '@shared/messages';
import { Particle, ParticleShape, FadeMode } from './particle-types';
import { SpriteAnimator, PlayerAnimState } from './sprite-animator';
import { ZombieSpriteAnimator, ZombieAnimState } from './zombie-sprite-animator';
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
  LevelUpNotification,
  Platform,
  PoisonEffect,
  Rope,
  SpitterProjectile,
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
  levelUpNotification: LevelUpNotification | null = null;
  remotePlayers: CharacterState[] = [];
  zombies: ZombieState[] = [];
  zombieCorpses: ZombieCorpse[] = [];
  particles: Particle[] = [];
  damageNumbers: DamageNumber[] = [];
  dropNotifications: DropNotification[] = [];
  readonly DROP_NOTIFICATION_LIFE_TICKS: number = 250;
  worldDrops: WorldDrop[] = [];
  platforms: Platform[] = [];
  ropes: Rope[] = [];
  keys: InputKeys = { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false, skill3: false, skill4: false, skill5: false, skill6: false, openStats: false, openSkills: false, useHpPotion: false, useMpPotion: false, openShop: false, openInventory: false, quickSlot1: false, quickSlot2: false, quickSlot3: false, quickSlot4: false, quickSlot5: false, quickSlot6: false, quickSlot7: false, quickSlot8: false };
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

  floor: number = 1;
  spawnTimer: number = 0;
  floorTransitionTimer: number = 0;
  exitPlatform: Platform = { x: 0, y: 0, width: 0, height: 0 };

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
  onFloorUpdate: ((floor: number) => void) | null = null;
  onFloorComplete: (() => void) | null = null;
  onXpGained: ((amount: number) => void) | null = null;
  onScoreUpdate: ((delta: number) => void) | null = null;
  onGameOver: (() => void) | null = null;
  onGoldPickup: ((amount: number) => void) | null = null;
  onPotionPickup: ((type: DropType) => void) | null = null;
  onUseHpPotion: (() => boolean) | null = null;
  onUseMpPotion: (() => boolean) | null = null;
  onOpenShop: (() => void) | null = null;
  onZombieDamaged: ((events: Array<{ zombieId: string; damage: number; killed: boolean }>) => void) | null = null;
  onRemotePlayerDamaged: ((targetPlayerId: string, damage: number, zombieX: number, zombieY: number, knockbackDir: number, isPoisonAttack: boolean) => void) | null = null;
  dashPhase: DashPhaseState | null = null;

  godMode: boolean = false;
  showCollisionBoxes: boolean = false;
  isMultiplayerHost: boolean = false;
  isMultiplayerClient: boolean = false;
  pendingLocalKills: Set<string> = new Set<string>();
  pendingRemoteAttacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }> = [];
  remotePlayerAnimators: Map<string, SpriteAnimator> = new Map<string, SpriteAnimator>();
  private previousZombieStates: Map<string, boolean> = new Map<string, boolean>();
  private previousZombieHp: Map<string, number> = new Map<string, number>();

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
    this.zombieSystem = new ZombieSystem(this, this.physicsSystem, this.combatSystem, this.projectileSystem);
    this.renderSystem = new RenderSystem(this);

    this.initPlatforms();
    this.initExitPlatform();
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

  private initExitPlatform(): void {
    const exitX: number = (GAME_CONSTANTS.CANVAS_WIDTH - GAME_CONSTANTS.EXIT_PLATFORM_WIDTH) / 2;
    this.exitPlatform = {
      x: exitX,
      y: GAME_CONSTANTS.EXIT_PLATFORM_Y,
      width: GAME_CONSTANTS.EXIT_PLATFORM_WIDTH,
      height: GAME_CONSTANTS.EXIT_PLATFORM_HEIGHT,
    };
  }

  private initRopes(): void {
    this.ropes = [
      { x: 190, topY: 330, bottomY: 530 },
      { x: 910, topY: 340, bottomY: 530 },
      { x: 560, topY: 430, bottomY: GAME_CONSTANTS.GROUND_Y },
      // { x: 640, topY: GAME_CONSTANTS.EXIT_PLATFORM_Y, bottomY: 430 },
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
    this.floor = 1;
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
    this.zombieSystem.startFloor();
    this.lastTimestamp = performance.now();
    this.loop(this.lastTimestamp);
  }

  stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  setFloor(floor: number): void {
    for (const z of this.zombies) {
      z.isDead = true;
    }
    this.zombies = [];
    for (const corpse of this.zombieCorpses) {
      this.zombieSpriteAnimator.removeInstance(corpse.id);
    }
    this.zombieCorpses = [];
    this.floor = floor;
    this.zombieSystem.startFloor();
  }

  setKeys(keys: InputKeys): void {
    this.keys = keys;
  }

  syncProgression(player: CharacterState): void {
    if (!this.player) return;
    const prevCharLevel: number = this.player.level;
    const leveled: boolean = player.level > prevCharLevel;
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
    this.player.hp = Math.max(this.player.hp, player.hp);
    this.player.mp = Math.max(this.player.mp, player.mp);
    if (leveled) {
      this.player.hp = player.hp;
      this.player.mp = player.mp;
      this.vfxSystem.spawnLevelUpEffect();
      const LEVEL_UP_LIFE_TICKS: number = 120;
      this.levelUpNotification = {
        life: LEVEL_UP_LIFE_TICKS,
        maxLife: LEVEL_UP_LIFE_TICKS,
        oldLevel: prevCharLevel,
        newLevel: player.level,
      };
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

    if (!this.isMultiplayerClient) {
      this.zombieSystem.updateZombies();
      this.projectileSystem.updateDragonProjectiles();
      this.projectileSystem.updateSpitterProjectiles();
      this.projectileSystem.updatePoisonEffect();
      this.zombieSystem.updateSpawning();
    } else {
      this.tickClientZombieVisuals();
      if (this.floorTransitionTimer > 0) this.floorTransitionTimer--;
    }

    this.tickRemotePlayerAnimations();

    this.vfxSystem.updateDragonImpacts();
    this.vfxSystem.updateHitMarks();
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

    if (!this.isMultiplayerClient) {
      this.zombieSystem.checkFloorCompletion();
    }

    if (this.invincibilityFrames > 0) this.invincibilityFrames--;
    if (this.ropeJumpCooldown > 0) this.ropeJumpCooldown--;
    if (this.platformDropTimer > 0) this.platformDropTimer--;
    if (this.playerStunTicks > 0) this.playerStunTicks--;
    if (this.levelUpNotification) {
      this.levelUpNotification.life--;
      if (this.levelUpNotification.life <= 0) this.levelUpNotification = null;
    }
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

  getStateSnapshot(): { player: CharacterState; zombies: ZombieState[]; corpses: ZombieCorpse[]; floor: number; attacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }> } | null {
    if (!this.player) return null;
    const attacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }> = [...this.pendingRemoteAttacks];
    this.pendingRemoteAttacks.length = 0;
    return {
      player: { ...this.player },
      zombies: this.zombies
        .filter((z: ZombieState) => !z.isDead)
        .map((z: ZombieState): ZombieState => ({ ...z })),
      corpses: this.zombieCorpses.map((c: ZombieCorpse): ZombieCorpse => ({ ...c })),
      floor: this.floor,
      attacks,
    };
  }

  applyRemoteZombies(zombies: ZombieState[]): void {
    if (!this.isMultiplayerClient) return;

    const currentIds: Set<string> = new Set<string>(zombies.map((z: ZombieState) => z.id));

    for (const [prevId, wasDead] of this.previousZombieStates) {
      if (!currentIds.has(prevId) && !this.pendingLocalKills.has(prevId)) {
        if (!wasDead) {
          const oldZ: ZombieState | undefined = this.zombies.find((z: ZombieState) => z.id === prevId);
          if (oldZ) {
            const cx: number = oldZ.x + oldZ.instanceWidth / 2;
            const cy: number = oldZ.y + oldZ.instanceHeight / 2;
            this.vfxSystem.spawnHitParticles(cx, cy, '#ff4444');
            this.vfxSystem.spawnHitMark(cx, cy);
            const lastHp: number | undefined = this.previousZombieHp.get(prevId);
            if (lastHp !== undefined && lastHp > 0) {
              this.vfxSystem.spawnDamageNumber(cx, oldZ.y - 10, lastHp, false, '#ff6666');
            }
          }
        }
        this.zombieSpriteAnimator.removeInstance(prevId);
        this.previousZombieHp.delete(prevId);
      }
    }

    for (const z of zombies) {
      if (this.pendingLocalKills.has(z.id)) continue;

      const wasPreviouslyKnown: boolean = this.previousZombieStates.has(z.id);

      if (!wasPreviouslyKnown && !z.isDead) {
        const spriteKey: string = this.zombieSpriteAnimator.getSpriteKey(z.type);
        if (z.spawnTimer > 0) {
          this.zombieSpriteAnimator.setStateReversed(
            z.id, ZombieAnimState.Dead, spriteKey, z.spawnTimer,
          );
        } else {
          this.zombieSpriteAnimator.setState(z.id, this.deriveZombieAnimState(z));
        }
      } else if (!z.isDead && z.spawnTimer <= 0) {
        this.zombieSpriteAnimator.setState(z.id, this.deriveZombieAnimState(z));
      }

      if (!z.isDead) {
        const prevHp: number | undefined = this.previousZombieHp.get(z.id);
        if (prevHp !== undefined && z.hp < prevHp) {
          const delta: number = prevHp - z.hp;
          const cx: number = z.x + z.instanceWidth / 2;
          const cy: number = z.y + z.instanceHeight / 2;
          this.vfxSystem.spawnDamageNumber(cx, z.y - 10, delta, false, '#aaccff');
          this.vfxSystem.spawnHitParticles(cx, cy, '#6699cc');
          this.vfxSystem.spawnHitMark(cx, cy);
        }
        this.previousZombieHp.set(z.id, z.hp);
      } else {
        this.previousZombieHp.delete(z.id);
      }
    }

    this.zombies = zombies.filter((z: ZombieState) => !z.isDead && !this.pendingLocalKills.has(z.id));

    for (const killId of this.pendingLocalKills) {
      if (!currentIds.has(killId)) {
        this.pendingLocalKills.delete(killId);
      }
    }

    this.previousZombieStates = new Map<string, boolean>(
      zombies.map((z: ZombieState): [string, boolean] => [z.id, z.isDead]),
    );
  }

  syncRemoteFloor(floor: number): void {
    if (!this.isMultiplayerClient) return;
    if (floor === this.floor) return;
    this.floor = floor;
    this.floorTransitionTimer = GAME_CONSTANTS.FLOOR_TRANSITION_TICKS;

    if (this.player) {
      this.player.x = GAME_CONSTANTS.CANVAS_WIDTH / 2 - GAME_CONSTANTS.PLAYER_WIDTH / 2;
      this.player.y = GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT;
      this.player.velocityX = 0;
      this.player.velocityY = 0;
      this.player.isGrounded = true;
    }
  }

  applyIncomingZombieDamage(damage: number, knockbackDir: number, isPoisonAttack: boolean): void {
    const p: CharacterState | null = this.player;
    if (!p || p.isDead) return;
    if (this.godMode) return;
    if (this.invincibilityFrames > 0) return;

    p.hp -= damage;
    this.invincibilityFrames = GAME_CONSTANTS.INVINCIBILITY_FRAMES;

    p.velocityX = knockbackDir * GAME_CONSTANTS.KNOCKBACK_FORCE_PLAYER;
    p.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
    p.isGrounded = false;
    if (p.isClimbing) {
      p.isClimbing = false;
    }

    this.vfxSystem.spawnHitParticles(
      p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
      p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      '#ffffff',
    );
    this.vfxSystem.spawnDamageNumber(
      p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
      p.y - 10,
      damage,
      false,
      '#ff4444',
    );

    if (isPoisonAttack) {
      const damagePerTick: number = GAME_CONSTANTS.SPITTER_POISON_DAMAGE_PER_TICK +
        Math.floor(this.floor * GAME_CONSTANTS.SPITTER_POISON_DAMAGE_WAVE_SCALE);
      this.poisonEffect = {
        remainingTicks: GAME_CONSTANTS.SPITTER_POISON_DURATION_TICKS,
        tickInterval: GAME_CONSTANTS.SPITTER_POISON_TICK_INTERVAL,
        tickTimer: GAME_CONSTANTS.SPITTER_POISON_TICK_INTERVAL,
        damagePerTick,
      };
    }

    if (p.hp <= 0) {
      p.hp = 0;
      p.isDead = true;
      this.onPlayerUpdate?.(p);
      this.onGameOver?.();
      return;
    }
    this.onPlayerUpdate?.(p);
  }

  applyRemoteDamage(events: Array<{ zombieId: string; damage: number; killed: boolean }>): void {
    if (!this.isMultiplayerHost) return;

    for (const evt of events) {
      const z: ZombieState | undefined = this.zombies.find(
        (zombie: ZombieState) => zombie.id === evt.zombieId,
      );
      if (!z || z.isDead) continue;

      z.hp -= evt.damage;

      const cx: number = z.x + z.instanceWidth / 2;
      const cy: number = z.y + z.instanceHeight / 2;
      this.vfxSystem.spawnDamageNumber(cx, z.y - 10, evt.damage, false, '#aaccff');
      this.vfxSystem.spawnHitParticles(cx, cy, '#6699cc');
      this.vfxSystem.spawnHitMark(cx, cy);

      if (z.hp <= 0) {
        this.combatSystem.handleZombieDeath(z, false);
      }
    }

    this.zombies = this.zombies.filter((z: ZombieState) => !z.isDead);
  }

  setRemotePlayers(players: CharacterState[]): void {
    const currentIds: Set<string> = new Set<string>(
      players.map((p: CharacterState) => p.id),
    );
    for (const [id] of this.remotePlayerAnimators) {
      if (!currentIds.has(id)) {
        this.remotePlayerAnimators.delete(id);
      }
    }
    this.remotePlayers = players;
  }

  applyRemoteCorpses(corpses: ZombieCorpse[]): void {
    if (!this.isMultiplayerClient) return;

    const syncedIds: Set<string> = new Set<string>(
      corpses.map((c: ZombieCorpse) => c.id),
    );

    const pendingLocalCorpses: ZombieCorpse[] = this.zombieCorpses.filter(
      (c: ZombieCorpse) => this.pendingLocalKills.has(c.id) && !syncedIds.has(c.id),
    );

    const allNewIds: Set<string> = new Set<string>([
      ...corpses.map((c: ZombieCorpse) => c.id),
      ...pendingLocalCorpses.map((c: ZombieCorpse) => c.id),
    ]);

    for (const existing of this.zombieCorpses) {
      if (!allNewIds.has(existing.id)) {
        this.zombieSpriteAnimator.removeInstance(existing.id);
      }
    }

    for (const c of corpses) {
      this.zombieSpriteAnimator.setState(c.id, ZombieAnimState.Dead);
    }
    for (const c of pendingLocalCorpses) {
      this.zombieSpriteAnimator.setState(c.id, ZombieAnimState.Dead);
    }

    this.zombieCorpses = [...corpses, ...pendingLocalCorpses];
  }

  private tickClientZombieVisuals(): void {
    for (const z of this.zombies) {
      if (z.isDead) continue;
      const spriteKey: string = this.zombieSpriteAnimator.getSpriteKey(z.type);
      this.zombieSpriteAnimator.tick(z.id, spriteKey);
    }
  }

  private tickRemotePlayerAnimations(): void {
    for (const rp of this.remotePlayers) {
      if (rp.isDead) continue;
      let animator: SpriteAnimator | undefined = this.remotePlayerAnimators.get(rp.id);
      if (!animator) {
        animator = new SpriteAnimator();
        animator.load();
        this.remotePlayerAnimators.set(rp.id, animator);
      }
      const state: PlayerAnimState = this.deriveRemotePlayerAnimState(rp);
      animator.setState(state);
      if (state === PlayerAnimState.Attack && animator.isAnimationFinished()) {
        animator.restart();
      }
      animator.tick();
    }
  }

  private deriveRemotePlayerAnimState(p: CharacterState): PlayerAnimState {
    if (p.isDead) return PlayerAnimState.Death;
    if (p.isAttacking) return PlayerAnimState.Attack;
    if (p.isClimbing) return PlayerAnimState.Climb;
    if (!p.isGrounded) return PlayerAnimState.Jump;
    if (Math.abs(p.velocityX) > 0.3) return PlayerAnimState.Run;
    return PlayerAnimState.Idle;
  }

  private deriveZombieAnimState(z: ZombieState): ZombieAnimState {
    if (z.isDead) return ZombieAnimState.Dead;
    if (z.attackAnimTimer > 0) return ZombieAnimState.Attack;
    if (z.knockbackFrames > 0) return ZombieAnimState.Hurt;
    if (Math.abs(z.velocityX) > 0.1) return ZombieAnimState.Walk;
    return ZombieAnimState.Idle;
  }
}
