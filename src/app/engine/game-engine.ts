import {
  ActiveBuff,
  CharacterState,
  GAME_CONSTANTS,
  SPECIAL_DROP_DEFINITIONS,
  getUsableSkills,
  SkillDefinition,
  VfxEvent,
  VfxEventType,
} from '@shared/index';
import {
  ActiveSpecialEffect,
  BoulderState,
  CagePuzzleState,
  PlateState,
  CageState,
  SpringState,
  DropType,
  PendingSpecialDropConfirm,
  SpecialDropDefinition,
  SpecialDropType,
  WorldDrop,
  LooseProp,
  ZombieCorpse,
  ZombieState,
} from '@shared/game-entities';
import { InputKeys } from '@shared/messages';
import { Particle, ParticleShape, FadeMode } from './particle-types';
import { SpriteAnimator, PlayerAnimState, classToSpriteSet } from './sprite-animator';
import { ZombieSpriteAnimator, ZombieAnimState, zombieAnimState } from './zombie-sprite-animator';
import { MapRenderer } from './map-renderer';
import { SpriteEffectSystem } from './sprite-effect-system';
import { LightningStrike, nextLightningDelayMs } from './storm';
import {
  BackgroundStar,
  BoulderPuzzleLayout,
  CagePuzzleLayout,
  PlatePuzzleLayout,
  SpringPuzzleLayout,
  DamageNumber,
  DragonImpact,
  BarrelBlastFx,
  DragonProjectile,
  DropNotification,
  EntityInterpolation,
  HitMark,
  IGameEngine,
  DashPhaseState,
  LevelUpNotification,
  Platform,
  PlayerProjectile,
  PlayerTint,
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
import { BoulderPuzzleSystem } from './boulder-puzzle-system';
import { Box, boulderPath, gateBox, gateBroken } from './boulder-puzzle';
import { SpringPuzzleSystem } from './spring-puzzle-system';
import { CagePuzzleSystem } from './cage-puzzle-system';
import { PlatePuzzleSystem } from './plate-puzzle-system';
import { PLATE_MAX_WEIGHT, newPlateState } from './plate-puzzle';
import {
  EXIT_CAGE,
  CAGE_MAX_FALL_TICKS,
  cageSolid,
  isCut,
  liftOntoLandedCage,
  newCageState,
} from './cage-puzzle';
import { CorpseCarrySystem } from './corpse-carry-system';
import { LoosePropSystem } from './loose-prop-system';
import { ExplodingBarrelSystem } from './exploding-barrel-system';
import { CarryPose } from './corpse-carry';
import { CorpseDrape } from './corpse-drape';
import { SCALE_MAX_KG, flingIfOnSpring, freshLaunch, newSpringState } from './spring-puzzle';
import { pullZombiesToward } from './magnet-pull';
import {
  exitPlatformY,
  generateLevel,
  GROUND_PLATFORM,
  isPickable,
  LevelLayout,
  Prop,
} from './level-generator';
import { RenderSystem } from './render-system';
import { restsOnSafeSpot } from './safe-spot';
import { WorkerInterval } from './worker-interval';
import { refreshDerivedStats } from './derived-stats';
import { respawnForNewFloor } from './floor-respawn';

export type { Particle };
export { ParticleShape, FadeMode };

const INTERPOLATION_TICKS: number = 3;
const MAX_EXTRAPOLATION_TICKS: number = 2;
/** Most time one frame catches up on (~12 ticks): a long stall resumes instead of replaying every tick at once. */
const MAX_CATCH_UP_MS: number = 250;

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
  private backgroundTicker: WorkerInterval | null = null;
  readonly fixedDt: number = 1000 / GAME_CONSTANTS.TICK_RATE;

  player: CharacterState | null = null;
  levelUpNotification: LevelUpNotification | null = null;
  remotePlayers: CharacterState[] = [];
  zombies: ZombieState[] = [];
  zombieCorpses: ZombieCorpse[] = [];
  looseProps: LooseProp[] = [];
  readonly carryPoses: Map<string, CarryPose> = new Map<string, CarryPose>();
  corpseDrapes: Map<string, CorpseDrape> = new Map<string, CorpseDrape>();
  particles: Particle[] = [];
  damageNumbers: DamageNumber[] = [];
  dropNotifications: DropNotification[] = [];
  readonly DROP_NOTIFICATION_LIFE_TICKS: number = 250;
  worldDrops: WorldDrop[] = [];
  platforms: Platform[] = [];
  ropes: Rope[] = [];
  /** Seed for this run's floor layouts: the host picks it, clients adopt it from game-sync. */
  layoutSeed: number = Math.floor(Math.random() * 0x7fffffff);
  level: LevelLayout = generateLevel(this.layoutSeed, 1);
  keys: InputKeys = { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false, skill3: false, skill4: false, skill5: false, skill6: false, skill7: false, openStats: false, openSkills: false, useHpPotion: false, useMpPotion: false, openShop: false, openInventory: false, revive: false, carry: false, confirmDrop: false, declineDrop: false, quickSlot1: false, quickSlot2: false, quickSlot3: false, quickSlot4: false, quickSlot5: false, quickSlot6: false, quickSlot7: false, quickSlot8: false, quickSlot9: false, quickSlot10: false, quickSlot11: false, quickSlot12: false };
  attackCooldown: number = 0;
  attackAnimTicks: number = 0;
  attackHitPending: boolean = false;
  attackHitDelay: number = 0;
  invincibilityFrames: number = 0;
  potionCooldown: number = 0;
  jumpBufferTicks: number = 0;
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
  eaterSpawnTimer: number = 0;
  floorTransitionTimer: number = 0;
  exitPlatform: Platform = { x: 0, y: 0, width: 0, height: 0 };
  boulderPuzzle: BoulderPuzzleLayout | null = null;
  boulder: BoulderState | null = null;
  springPuzzle: SpringPuzzleLayout | null = null;
  spring: SpringState | null = null;
  cagePuzzle: CagePuzzleLayout | null = null;
  cages: CagePuzzleState | null = null;
  platePuzzle: PlatePuzzleLayout | null = null;
  plate: PlateState | null = null;

  backgroundStars: BackgroundStar[] = [];

  screenShakeFrames: number = 0;
  screenShakeIntensity: number = 0;
  screenFlashColor: string | null = null;
  screenFlashFrames: number = 0;
  lightning: LightningStrike | null = null;
  lightningTimerMs: number = nextLightningDelayMs(Math.random);

  readonly spriteAnimator: SpriteAnimator = new SpriteAnimator();
  readonly zombieSpriteAnimator: ZombieSpriteAnimator = new ZombieSpriteAnimator();
  readonly mapRenderer: MapRenderer = new MapRenderer();
  readonly spriteEffectSystem: SpriteEffectSystem = new SpriteEffectSystem();
  readonly SPRITE_RENDER_SIZE: number = 96;

  dragonProjectiles: DragonProjectile[] = [];
  dragonImpacts: DragonImpact[] = [];
  barrelBlasts: BarrelBlastFx[] = [];
  readonly dragonProjectileImg: HTMLImageElement = new Image();
  readonly dragonImpactImg: HTMLImageElement = new Image();

  spitterProjectiles: SpitterProjectile[] = [];
  poisonEffect: PoisonEffect | null = null;
  playerTints: Map<string, PlayerTint> = new Map<string, PlayerTint>();
  readonly DRAGON_PROJ_FRAME_W: number = 105;
  readonly DRAGON_PROJ_FRAME_H: number = 118;
  readonly DRAGON_PROJ_FRAMES: number = 3;
  readonly DRAGON_IMPACT_FRAME_W: number = 85;
  readonly DRAGON_IMPACT_FRAME_H: number = 131;
  readonly DRAGON_IMPACT_FRAMES: number = 4;

  hitMarks: HitMark[] = [];
  playerProjectiles: PlayerProjectile[] = [];
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
  onSpecialDropPickup: ((type: SpecialDropType) => void) | null = null;
  onUseHpPotion: (() => boolean) | null = null;
  onUseMpPotion: (() => boolean) | null = null;
  onOpenShop: (() => void) | null = null;
  onZombieDamaged: ((events: Array<{ zombieId: string; damage: number; killed: boolean }>) => void) | null = null;
  onRemotePlayerDamaged: ((targetPlayerId: string, damage: number, zombieX: number, zombieY: number, knockbackDir: number, isPoisonAttack: boolean) => void) | null = null;
  onPlayerRevived: ((targetPlayerId: string) => void) | null = null;
  onPlayerDowned: (() => void) | null = null;
  onPlayerDownExpired: (() => void) | null = null;
  doubleJumpUsed: boolean = false;
  doubleJumpAnimTicks: number = 0;

  dashPhase: DashPhaseState | null = null;

  reviveTargetId: string | null = null;
  carryKeyLabel: string = 'E';
  dropPromptKeyLabels: { confirm: string; decline: string } = { confirm: 'Y', decline: 'N' };
  reviveProgressTicks: number = 0;

  activeSpecialEffects: ActiveSpecialEffect[] = [];
  pendingSpecialDropConfirm: PendingSpecialDropConfirm | null = null;

  godMode: boolean = false;
  showCollisionBoxes: boolean = false;
  isMultiplayerHost: boolean = false;
  isMultiplayerClient: boolean = false;
  pendingLocalKills: Set<string> = new Set<string>();
  pendingRemoteAttacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }> = [];
  pendingReviveTargetIds: string[] = [];
  pendingSpecialDropActivations: SpecialDropType[] = [];
  pendingVfxEvents: VfxEvent[] = [];
  pendingPullEvents: Array<{ playerX: number; playerY: number; pullRange: number; skillColor: string }> = [];
  remotePlayerAnimators: Map<string, SpriteAnimator> = new Map<string, SpriteAnimator>();
  zombieInterpolation: Map<string, EntityInterpolation> = new Map<string, EntityInterpolation>();
  remotePlayerInterpolation: Map<string, EntityInterpolation> = new Map<string, EntityInterpolation>();
  private previousZombieStates: Map<string, boolean> = new Map<string, boolean>();
  private previousZombieHp: Map<string, number> = new Map<string, number>();

  private hitStopTicks: number = 0;
  private hitStopCooldown: number = 0;

  private readonly physicsSystem: PhysicsSystem;
  private readonly vfxSystem: VfxSystem;
  private readonly dropSystem: DropSystem;
  private readonly combatSystem: CombatSystem;
  private readonly projectileSystem: ProjectileSystem;
  private readonly zombieSystem: ZombieSystem;
  private readonly boulderPuzzleSystem: BoulderPuzzleSystem;
  private readonly springPuzzleSystem: SpringPuzzleSystem;
  private readonly cagePuzzleSystem: CagePuzzleSystem;
  private readonly platePuzzleSystem: PlatePuzzleSystem;
  private readonly corpseCarrySystem: CorpseCarrySystem;
  private readonly loosePropSystem: LoosePropSystem;
  private readonly explodingBarrelSystem: ExplodingBarrelSystem;
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
    this.zombieSystem = new ZombieSystem(this, this.physicsSystem, this.combatSystem, this.projectileSystem, this.dropSystem);
    this.boulderPuzzleSystem = new BoulderPuzzleSystem(this, this.combatSystem, this.vfxSystem);
    this.springPuzzleSystem = new SpringPuzzleSystem(this, this.vfxSystem);
    this.cagePuzzleSystem = new CagePuzzleSystem(this, this.vfxSystem, this.zombieSystem, this.dropSystem);
    this.platePuzzleSystem = new PlatePuzzleSystem(this, this.vfxSystem);
    this.corpseCarrySystem = new CorpseCarrySystem(this);
    this.loosePropSystem = new LoosePropSystem(this, this.dropSystem);
    this.explodingBarrelSystem = new ExplodingBarrelSystem(
      this,
      this.loosePropSystem,
      this.combatSystem,
      this.vfxSystem,
    );
    this.renderSystem = new RenderSystem(this);

    this.initExitPlatform();
    this.applyLevel();
    this.initStars();
    this.spriteAnimator.load();
    this.zombieSpriteAnimator.load();
    this.mapRenderer.load();
    this.spriteEffectSystem.load();
    this.dragonProjectileImg.src = 'sprites/zombies/dragon_boss/AttackEffect2.png';
    this.dragonImpactImg.src = 'sprites/zombies/dragon_boss/AttackEffect1.png';
  }


  private initExitPlatform(): void {
    this.exitPlatform = {
      x: 0,
      y: GAME_CONSTANTS.EXIT_PLATFORM_Y,
      width: GAME_CONSTANTS.EXIT_PLATFORM_WIDTH,
      height: GAME_CONSTANTS.EXIT_PLATFORM_HEIGHT,
    };
  }

  /**
   * Builds the current floor's layout from the shared seed: collision (platforms, ropes) and the
   * drawn map come from the same data, so what players see is exactly what they stand on.
   */
  applyLevel(): void {
    this.level = generateLevel(this.layoutSeed, this.floor);
    this.boulderPuzzle = this.level.boulderPuzzle ?? null;
    this.boulder = this.boulderPuzzle
      ? { gateHits: 0, progress: 0, speed: 0, wallBroken: false }
      : null;
    this.springPuzzle = this.level.springPuzzle ?? null;
    this.spring = this.springPuzzle ? newSpringState() : null;
    this.cagePuzzle = this.level.cagePuzzle ?? null;
    this.cages = this.cagePuzzle ? newCageState(this.cagePuzzle) : null;
    this.platePuzzle = this.level.platePuzzle ?? null;
    this.plate = this.platePuzzle ? newPlateState() : null;
    this.platforms = [
      { ...GROUND_PLATFORM },
      ...this.level.platforms.map((p: Platform): Platform => ({ ...p })),
      // Props are solid: you stand on their tops and step over (or bump into) their sides. The
      // pickable ones are placed wherever they lie (LoosePropSystem).
      ...this.fixedProps().map(
        (p: Prop): Platform => ({ x: p.x, y: p.y, width: p.width, height: p.height, solid: true }),
      ),
      // The puzzle wall is solid too, until the boulder breaks it (the gate: placeGate).
      ...(this.boulderPuzzle
        ? [{ ...this.boulderPuzzle.wall, solid: true, puzzlePart: 'wall' as const }]
        : []),
      // The spring: solid like a prop, you hop onto its plate (drawn per frame, it bounces).
      ...(this.springPuzzle
        ? [{ ...this.springPuzzle.spring, solid: true, puzzlePart: 'spring' as const }]
        : []),
    ];
    this.ropes = this.level.ropes.map((r: Rope): Rope => ({ ...r }));
    this.mapRenderer.setLevel(this.level.platforms, this.level.ropes, this.fixedProps(), this.boulderPuzzle, true);
    this.loosePropSystem.reset(this.level);
    this.repositionExitPlatform();
  }

  /** The layout's props that never move (rails, lockers): part of the drawn geometry layer. */
  private fixedProps(): Prop[] {
    return this.level.props.filter((p: Prop): boolean => !isPickable(p));
  }

  /** The gate is a solid block on the ledge's edge: it moves with the ledge until it breaks. */
  private placeGate(): void {
    this.platforms = this.platforms.filter((p: Platform): boolean => p.puzzlePart !== 'gate');
    if (!this.boulderPuzzle || !this.boulder || gateBroken(this.boulder)) return;
    const gate: Box = gateBox(this.boulderPuzzle, this.exitPlatform.y);
    this.platforms.push({ ...gate, solid: true, puzzlePart: 'gate' });
  }

  breakPuzzleGate(): void {
    if (!this.boulder) return;
    this.boulder.gateHits = Math.max(this.boulder.gateHits, GAME_CONSTANTS.BOULDER_GATE_HITS);
    this.placeGate();
  }

  breakPuzzleWall(): void {
    if (!this.boulderPuzzle || !this.boulder || this.boulder.wallBroken) return;
    this.boulder.wallBroken = true;
    this.platforms = this.platforms.filter((p: Platform): boolean => p.puzzlePart !== 'wall');
    this.mapRenderer.setLevel(this.level.platforms, this.level.ropes, this.fixedProps(), this.boulderPuzzle, false);
  }

  puzzleWall(): Platform | null {
    return this.boulderPuzzle && this.boulder && !this.boulder.wallBroken ? this.boulderPuzzle.wall : null;
  }

  /**
   * The floor-4 cages are solid while they hang (the exit cage moves with the exit) and the exit
   * cage once it landed; a falling cage has no collision.
   */
  placeCages(): void {
    this.platforms = this.platforms.filter(
      (p: Platform): boolean => p.puzzlePart !== 'cage' && p.puzzlePart !== 'hanging-cage',
    );
    if (!this.cagePuzzle || !this.cages) return;
    const puzzle: CagePuzzleLayout = this.cagePuzzle;
    this.cages.cages.forEach((cage: CageState, i: number): void => {
      const box: Box | null = cageSolid(puzzle, i, cage, this.exitPlatform);
      if (box) {
        this.platforms.push({
          ...box,
          solid: true,
          puzzlePart: i === EXIT_CAGE ? 'cage' : 'hanging-cage',
        });
      }
    });
  }

  /** Clients follow the host's layout seed (sent with every game-sync). */
  syncLayoutSeed(seed: number): void {
    if (!this.isMultiplayerClient || seed === this.layoutSeed) return;
    this.layoutSeed = seed;
    this.applyLevel();
  }

  /**
   * The exit hangs where the layout put it (a screen edge; mid-screen as the boulder ledge on the
   * puzzle floor), out of jump reach: players slay zombies under it and climb the pile of the
   * dead. It sits higher on later floors and with more players. On the spring floor it hangs at
   * the very top, where no pile reaches: the spring launches players up to it.
   */
  repositionExitPlatform(): void {
    this.exitPlatform.x = this.level.exitX;
    this.exitPlatform.y = this.springPuzzle
      ? GAME_CONSTANTS.SPRING_LEDGE_Y
      : exitPlatformY(this.floor, this.remotePlayers.length);
    this.placeGate();
    this.placeCages();
  }

  isInSafeSpot(x: number, y: number): boolean {
    return restsOnSafeSpot(this.platforms, x, y);
  }

  requestHitStop(ticks: number): void {
    // Freezing the host's simulation would stutter every other player: solo only.
    if (this.isMultiplayerHost || this.isMultiplayerClient) return;
    if (this.hitStopCooldown > 0) return;
    this.hitStopTicks = Math.max(this.hitStopTicks, ticks);
    this.hitStopCooldown = ticks + GAME_CONSTANTS.HITSTOP_COOLDOWN_TICKS;
  }


  private initStars(): void {
    for (let i: number = 0; i < GAME_CONSTANTS.BACKGROUND_STAR_COUNT; i++) {
      this.backgroundStars.push({
        x: Math.random() * GAME_CONSTANTS.CANVAS_WIDTH,
        y: Math.random() * (GAME_CONSTANTS.GROUND_Y - 50),
        size: Math.random() * 2 + 0.5 ,
        brightness: Math.random() * 0.5 + 0.3,
      });
    }
  }

  start(player: CharacterState): void {
    this.player = { ...player };
    this.spriteAnimator.load(classToSpriteSet(player.classId));
    this.zombies = [];
    this.zombieCorpses = [];
    this.particles = [];
    this.damageNumbers = [];
    this.dropNotifications = [];
    this.worldDrops = [];
    this.dragonProjectiles = [];
    this.dragonImpacts = [];
    this.barrelBlasts = [];
    this.spitterProjectiles = [];
    this.poisonEffect = null;
    this.playerTints.clear();
    this.hitMarks = [];
    this.playerProjectiles = [];
    this.activeSpecialEffects = [];
    this.pendingVfxEvents = [];
    this.pendingPullEvents = [];
    this.reviveTargetId = null;
    this.reviveProgressTicks = 0;
    this.pendingReviveTargetIds.length = 0;
    this.floor = 1;
    this.playerUsableSkills = getUsableSkills(player.classId, player.skillLevels);
    this.skillCooldowns.clear();
    this.passiveRecoveryTimers.clear();
    this.playerStandingStillTicks = 0;
    this.playerStunTicks = 0;
    this.autoPotionCooldown = 0;
    this.doubleJumpUsed = false;
    this.doubleJumpAnimTicks = 0;
    // "Try again" reuses this engine: nothing from the run that ended may carry over.
    this.pendingSpecialDropConfirm = null;
    this.pendingSpecialDropActivations = [];
    this.dashPhase = null;
    this.floorTransitionTimer = 0;
    this.levelUpNotification = null;
    this.attackCooldown = 0;
    this.attackAnimTicks = 0;
    this.attackHitPending = false;
    this.invincibilityFrames = 0;
    this.potionCooldown = 0;
    this.jumpBufferTicks = 0;
    this.ropeJumpCooldown = 0;
    this.platformDropTimer = 0;
    this.zombieSystem.startFloor();
    this.lastTimestamp = performance.now();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.onVisibilityChange();
    this.loop(this.lastTimestamp);
  }

  stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.backgroundTicker?.stop();
    this.backgroundTicker = null;
  }

  /**
   * A background tab gets no animation frames. Online, the world must not stop for the others
   * (the host runs it), so a worker timer ticks the game while the tab is hidden. Solo pauses.
   */
  private readonly onVisibilityChange = (): void => {
    const online: boolean = this.isMultiplayerHost || this.isMultiplayerClient;
    if (document.hidden && online && !this.backgroundTicker) {
      this.backgroundTicker = new WorkerInterval(this.fixedDt, (): void => this.advance(performance.now()));
    } else if (!document.hidden && this.backgroundTicker) {
      this.backgroundTicker.stop();
      this.backgroundTicker = null;
    }
  };

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

  /** One regular spawn now (the floor's type roll, at most one boss at a time); e2e probe setup. */
  spawnRolledZombie(): void {
    this.zombieSystem.spawnRolledZombie();
  }

  setKeys(keys: InputKeys): void {
    if (keys.jump && !this.keys.jump) {
      this.jumpBufferTicks = GAME_CONSTANTS.JUMP_BUFFER_TICKS;
    }
    this.keys = keys;
  }

  /** A potion from a quick slot: the same cooldown and alive/not-down rule as the potion keys. */
  drinkQuickSlotPotion(drink: () => boolean): boolean {
    const p: CharacterState | null = this.player;
    if (!p || p.isDead || p.isDown || this.potionCooldown > 0) return false;
    if (!drink()) return false;
    this.potionCooldown = GAME_CONSTANTS.POTION_USE_COOLDOWN_TICKS;
    return true;
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
    this.player.allocatedStats = { ...player.allocatedStats };
    this.player.unallocatedStatPoints = player.unallocatedStatPoints;
    this.player.unallocatedSkillPoints = player.unallocatedSkillPoints;
    this.player.skillLevels = { ...player.skillLevels };
    this.player.inventory = { ...player.inventory };
    this.player.hp = Math.max(this.player.hp, player.hp);
    this.player.mp = Math.max(this.player.mp, player.mp);
    // Buffs live here (they tick every frame); the app's copy may be a few frames old.
    // Derived stats follow the new progression with the buffs still running.
    refreshDerivedStats(this.player);
    if (leveled) {
      this.player.hp = this.player.derived.maxHp;
      this.player.mp = this.player.derived.maxMp;
      this.vfxSystem.spawnLevelUpEffect();
      const LEVEL_UP_LIFE_TICKS: number = 120;
      this.levelUpNotification = {
        life: LEVEL_UP_LIFE_TICKS,
        maxLife: LEVEL_UP_LIFE_TICKS,
        oldLevel: prevCharLevel,
        newLevel: player.level,
      };

      this.pendingVfxEvents.push({
        type: VfxEventType.LevelUp,
        playerId: this.player.id,
        x: this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
        y: this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      });
    }
    this.playerUsableSkills = getUsableSkills(this.player.classId, this.player.skillLevels);
  }

  private loop(timestamp: number): void {
    this.advance(timestamp);
    this.renderSystem.render();
    this.animationFrameId = requestAnimationFrame((t: number) => this.loop(t));
  }

  /** Runs the fixed ticks due by `now` (frame time or the background worker's tick). */
  private advance(now: number): void {
    const dt: number = Math.min(Math.max(now - this.lastTimestamp, 0), MAX_CATCH_UP_MS);
    this.lastTimestamp = now;
    this.accumulator += dt;

    while (this.accumulator >= this.fixedDt) {
      this.update();
      this.accumulator -= this.fixedDt;
    }
  }

  private update(): void {
    if (!this.player) return;

    if (this.hitStopCooldown > 0) this.hitStopCooldown--;
    if (this.hitStopTicks > 0) {
      this.hitStopTicks--;
      return;
    }

    this.renderSystem.updatePlayerAnimState();
    this.spriteAnimator.tick();

    const isMultiplayer: boolean = this.isMultiplayerHost || this.isMultiplayerClient;

    if (this.player.isDead) {
      if (!isMultiplayer) return;
    } else {
      this.updateDownedState();
    }

    const playerCanAct: boolean = !this.player.isDown && !this.player.isDead;

    if (playerCanAct) {
      this.updateReviveChannel();
      this.combatSystem.updateAttackTiming();
      this.updatePlayerActions();
    } else {
      this.physicsSystem.updateDownedBody();
    }

    this.combatSystem.updatePlayerProjectiles();

    this.tickEntityInterpolation();

    if (!this.isMultiplayerClient) {
      this.zombieSystem.updateZombies();
      this.boulderPuzzleSystem.update();
      this.springPuzzleSystem.update();
      this.cagePuzzleSystem.update();
      this.platePuzzleSystem.update();
      this.explodingBarrelSystem.update();
      this.projectileSystem.updateDragonProjectiles();
      this.projectileSystem.updateSpitterProjectiles();
      this.projectileSystem.updatePoisonEffect();
      this.zombieSystem.updateSpawning();
    } else {
      this.tickClientZombieVisuals();
      this.boulderPuzzleSystem.tickClient();
      this.springPuzzleSystem.tickClient();
      this.cagePuzzleSystem.tickClient();
      this.platePuzzleSystem.tickClient();
      this.projectileSystem.tickClientProjectileVisuals();
      this.projectileSystem.updatePoisonEffect();
      if (this.floorTransitionTimer > 0) this.floorTransitionTimer--;
    }

    this.tickRemotePlayerAnimations();

    this.vfxSystem.updateDragonImpacts();
    this.vfxSystem.updateBarrelBlasts();
    this.vfxSystem.updateHitMarks();
    this.vfxSystem.updatePlayerTints();
    // The host's sky decides when lightning strikes; guests see it through the Lightning event.
    this.vfxSystem.updateLightning(!this.isMultiplayerClient);
    this.corpseCarrySystem.update();
    this.loosePropSystem.update();
    this.zombieSystem.updateZombieCorpses();

    this.dropSystem.updateDrops();
    this.dropSystem.updateSpecialEffects();
    this.dropSystem.updatePendingSpecialDrop();
    if (playerCanAct) {
      this.dropSystem.updatePotionUse();
    }
    this.vfxSystem.updateParticles();
    this.vfxSystem.updateDamageNumbers();
    this.vfxSystem.updateDropNotifications();
    this.combatSystem.updateSkillCooldowns();
    this.combatSystem.updateDashPhase();
    this.spriteEffectSystem.tick();
    if (playerCanAct) {
      this.combatSystem.updateActiveBuffs();
      this.combatSystem.updatePassiveSkills();
      this.combatSystem.updateAutoPotion();
    }

    if (!this.isMultiplayerClient) {
      this.zombieSystem.checkFloorCompletion();
    }

    if (this.invincibilityFrames > 0) this.invincibilityFrames--;
    if (this.ropeJumpCooldown > 0) this.ropeJumpCooldown--;
    if (this.platformDropTimer > 0) this.platformDropTimer--;
    if (this.jumpBufferTicks > 0) this.jumpBufferTicks--;
    if (this.playerStunTicks > 0) this.playerStunTicks--;
    if (this.doubleJumpAnimTicks > 0) {
      this.doubleJumpAnimTicks--;
      if (this.doubleJumpAnimTicks <= 0 && this.player) {
        this.player.isDoubleJumping = false;
      }
    }
    if (this.levelUpNotification) {
      this.levelUpNotification.life--;
      if (this.levelUpNotification.life <= 0) this.levelUpNotification = null;
    }

    if (!isMultiplayer) {
      this.discardOutboundEvents();
    } else if (this.pendingVfxEvents.length > GAME_CONSTANTS.MAX_PENDING_VFX_EVENTS) {
      this.pendingVfxEvents.splice(0, this.pendingVfxEvents.length - GAME_CONSTANTS.MAX_PENDING_VFX_EVENTS);
    }
  }

  /** Single player has nobody to send to: drop what the systems queued for other players. */
  discardOutboundEvents(): void {
    this.pendingVfxEvents.length = 0;
    this.pendingPullEvents.length = 0;
    this.pendingRemoteAttacks.length = 0;
    this.pendingReviveTargetIds.length = 0;
    this.pendingSpecialDropActivations.length = 0;
  }

  private updateDownedState(): void {
    const p: CharacterState | null = this.player;
    if (!p || !p.isDown) return;

    // A teammate channeling a revive on us pauses the bleed-out.
    const beingRevived: boolean = this.remotePlayers.some(
      (rp: CharacterState): boolean => rp.revivingPlayerId === p.id && !rp.isDown && !rp.isDead,
    );
    if (!beingRevived) p.downTimer--;
    // No sliding while down; gravity still pulls the body to the ground (updateDownedBody).
    p.velocityX = 0;

    if (p.downTimer <= 0) {
      p.isDown = false;
      p.isDead = true;
      this.onPlayerUpdate?.(p);
      this.onPlayerDownExpired?.();
    }
  }

  private updateReviveChannel(): void {
    const p: CharacterState | null = this.player;
    if (!p || p.isDead || p.isDown) return;

    const isMultiplayer: boolean = this.isMultiplayerHost || this.isMultiplayerClient;
    if (!isMultiplayer) return;

    p.revivingPlayerId = this.keys.revive ? this.reviveTargetId : null;
    if (!this.keys.revive) {
      if (this.reviveTargetId !== null) {
        this.reviveTargetId = null;
        this.reviveProgressTicks = 0;
      }
      return;
    }

    const playerCX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const playerCY: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;

    let nearestDownId: string | null = null;
    let nearestDist: number = Infinity;

    for (const rp of this.remotePlayers) {
      if (!rp.isDown) continue;
      const rpCX: number = rp.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
      const rpCY: number = rp.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
      const dist: number = Math.sqrt((rpCX - playerCX) ** 2 + (rpCY - playerCY) ** 2);
      if (dist <= GAME_CONSTANTS.REVIVE_RANGE && dist < nearestDist) {
        nearestDist = dist;
        nearestDownId = rp.id;
      }
    }

    if (nearestDownId === null) {
      this.reviveTargetId = null;
      this.reviveProgressTicks = 0;
      return;
    }

    if (this.reviveTargetId !== nearestDownId) {
      this.reviveTargetId = nearestDownId;
      this.reviveProgressTicks = 0;
    }

    this.reviveProgressTicks++;

    if (this.reviveProgressTicks >= GAME_CONSTANTS.REVIVE_CHANNEL_TICKS) {
      this.pendingReviveTargetIds.push(nearestDownId);
      this.onPlayerRevived?.(nearestDownId);
      this.reviveTargetId = null;
      this.reviveProgressTicks = 0;
    }
  }

  activateSpecialEffect(type: SpecialDropType): void {
    const def: SpecialDropDefinition | undefined = this.applySpecialEffectState(type);
    if (!def) return;

    if (this.isMultiplayerClient) {
      this.pendingSpecialDropActivations.push(type);
    }

    if (this.player) {
      const cx: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
      const cy: number = this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
      this.vfxSystem.spawnBuffActivationParticles(cx, cy, def.color);
      this.vfxSystem.triggerScreenFlash(def.color, 8);
      this.vfxSystem.triggerScreenShake(6, 4);
    }
  }

  /**
   * Host applying a special drop another player picked up. The picker already
   * broadcast the pickup VFX at their own position, so only the state changes here.
   */
  applyRemoteSpecialEffect(type: SpecialDropType): void {
    this.applySpecialEffectState(type);
  }

  private applySpecialEffectState(type: SpecialDropType): SpecialDropDefinition | undefined {
    const def: SpecialDropDefinition | undefined = SPECIAL_DROP_DEFINITIONS.find(
      (d: SpecialDropDefinition): boolean => d.type === type,
    );
    if (!def) return undefined;

    const existing: ActiveSpecialEffect | undefined = this.activeSpecialEffects.find(
      (eff: ActiveSpecialEffect): boolean => eff.type === type,
    );
    if (existing) {
      existing.remainingTicks = def.durationTicks;
      existing.totalTicks = def.durationTicks;
    } else {
      this.activeSpecialEffects.push({
        type,
        remainingTicks: def.durationTicks,
        totalTicks: def.durationTicks,
      });
    }
    return def;
  }

  confirmPendingDrop(): void {
    if (!this.pendingSpecialDropConfirm) return;
    this.dropSystem.confirmPendingDrop();
  }

  declinePendingDrop(): void {
    if (!this.pendingSpecialDropConfirm) return;
    this.dropSystem.declinePendingDrop();
  }

  hasPendingSpecialDrop(): boolean {
    return this.pendingSpecialDropConfirm !== null;
  }

  applyRevive(): void {
    const p: CharacterState | null = this.player;
    if (!p || !p.isDown) return;

    p.isDown = false;
    p.downTimer = 0;
    p.hp = Math.max(1, Math.floor(p.derived.maxHp * GAME_CONSTANTS.REVIVE_HP_PERCENT / 100));
    this.invincibilityFrames = GAME_CONSTANTS.INVINCIBILITY_FRAMES * 2;

    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const cy: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    this.vfxSystem.spawnBuffActivationParticles(cx, cy, '#44ff88');
    this.vfxSystem.spawnDamageNumber(cx, p.y - 10, p.hp, false, '#44ff44');

    this.pendingVfxEvents.push({
      type: VfxEventType.BuffActivation,
      playerId: p.id,
      x: cx,
      y: cy,
      color: '#44ff88',
    });
    this.pendingVfxEvents.push({
      type: VfxEventType.DamageNumber,
      playerId: p.id,
      x: cx,
      y: p.y - 10,
      value: p.hp,
      isCrit: false,
      color: '#44ff44',
    });

    this.onPlayerUpdate?.(p);
  }

  private updatePlayerActions(): void {
    if (!this.player) return;

    this.physicsSystem.updatePlayer();

    if (this.playerStunTicks > 0) return;

    // Hands full: no attacks or skills while carrying corpses (attack throws them instead).
    if (this.corpseCarrySystem.handleInput()) return;

    // Weapons down on the safe spot: zombies can't reach you there, so you can't hit them either.
    const resting: boolean = this.isInSafeSpot(this.player.x, this.player.y);
    if (this.keys.attack && this.attackCooldown <= 0 && !resting) {
      this.combatSystem.performAttack();
      let cooldownTicks: number = GAME_CONSTANTS.PLAYER_ATTACK_COOLDOWN_TICKS;
      const atkSpeedBuff: ActiveBuff | undefined = this.player!.activeBuffs.find(
        (b: ActiveBuff): boolean => b.stat === 'attackSpeed' && b.remainingMs > 0,
      );
      if (atkSpeedBuff) {
        cooldownTicks = Math.max(6, Math.floor(cooldownTicks * (1 - atkSpeedBuff.value / 100)));
      }
      this.attackCooldown = cooldownTicks;
    }
    if (this.attackCooldown > 0) this.attackCooldown--;

    if (this.keys.skill1) this.combatSystem.tryPerformSkill(0);
    if (this.keys.skill2) this.combatSystem.tryPerformSkill(1);
    if (this.keys.skill3) this.combatSystem.tryPerformSkill(2);
    if (this.keys.skill4) this.combatSystem.tryPerformSkill(3);
    if (this.keys.skill5) this.combatSystem.tryPerformSkill(4);
    if (this.keys.skill6) this.combatSystem.tryPerformSkill(5);
    if (this.keys.skill7) this.combatSystem.tryPerformSkill(6);
  }

  getStateSnapshot(): { player: CharacterState; zombies: ZombieState[]; corpses: ZombieCorpse[]; props: LooseProp[]; floor: number; layoutSeed: number; boulder: BoulderState | null; spring: SpringState | null; cages: CagePuzzleState | null; plate: PlateState | null; attacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }>; revives: string[]; specialDropActivations: SpecialDropType[]; activeSpecialEffects: ActiveSpecialEffect[]; vfxEvents: VfxEvent[]; pullEvents: Array<{ playerX: number; playerY: number; pullRange: number; skillColor: string }>; spitterProjectiles: SpitterProjectile[]; dragonProjectiles: DragonProjectile[] } | null {
    if (!this.player) return null;
    const attacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }> = [...this.pendingRemoteAttacks];
    this.pendingRemoteAttacks.length = 0;
    const revives: string[] = [...this.pendingReviveTargetIds];
    this.pendingReviveTargetIds.length = 0;
    const specialDropActivations: SpecialDropType[] = [...this.pendingSpecialDropActivations];
    this.pendingSpecialDropActivations.length = 0;
    const vfxEvents: VfxEvent[] = [...this.pendingVfxEvents];
    this.pendingVfxEvents.length = 0;
    const pullEvents: Array<{ playerX: number; playerY: number; pullRange: number; skillColor: string }> = [...this.pendingPullEvents];
    this.pendingPullEvents.length = 0;
    return {
      player: { ...this.player },
      zombies: this.zombies
        .filter((z: ZombieState) => !z.isDead)
        .map((z: ZombieState): ZombieState => ({ ...z })),
      corpses: this.zombieCorpses.map((c: ZombieCorpse): ZombieCorpse => ({ ...c })),
      props: this.loosePropSystem.moved(),
      floor: this.floor,
      layoutSeed: this.layoutSeed,
      boulder: this.boulder ? { ...this.boulder } : null,
      spring: this.spring ? { ...this.spring } : null,
      cages: this.cages
        ? { cages: this.cages.cages.map((c: CageState): CageState => ({ ...c })) }
        : null,
      plate: this.plate ? { ...this.plate } : null,
      attacks,
      revives,
      specialDropActivations,
      activeSpecialEffects: this.activeSpecialEffects.map(
        (eff: ActiveSpecialEffect): ActiveSpecialEffect => ({ ...eff }),
      ),
      vfxEvents,
      pullEvents,
      spitterProjectiles: this.spitterProjectiles.map(
        (p: SpitterProjectile): SpitterProjectile => ({ ...p, trail: p.trail.map((t: { x: number; y: number; life: number }) => ({ ...t })) }),
      ),
      dragonProjectiles: this.dragonProjectiles.map(
        (p: DragonProjectile): DragonProjectile => ({ ...p }),
      ),
    };
  }

  applyRemoteZombies(zombies: ZombieState[]): void {
    if (!this.isMultiplayerClient) return;

    const visualPositions: Map<string, { x: number; y: number }> = new Map<string, { x: number; y: number }>();
    for (const z of this.zombies) {
      visualPositions.set(z.id, { x: z.x, y: z.y });
    }

    const currentIds: Set<string> = new Set<string>(zombies.map((z: ZombieState) => z.id));

    for (const [prevId] of this.previousZombieStates) {
      if (!currentIds.has(prevId) && !this.pendingLocalKills.has(prevId)) {
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
          this.zombieSpriteAnimator.setState(z.id, zombieAnimState(z));
        }
      } else if (!z.isDead && z.spawnTimer <= 0) {
        this.zombieSpriteAnimator.setState(z.id, zombieAnimState(z));
      }

      if (!z.isDead) {
        this.previousZombieHp.set(z.id, z.hp);
      } else {
        this.previousZombieHp.delete(z.id);
      }
    }

    const lockedTargets: Set<string> = new Set<string>();
    for (const proj of this.playerProjectiles) {
      if (proj.targetZombieId) {
        lockedTargets.add(proj.targetZombieId);
      }
    }
    this.zombies = zombies.filter(
      (z: ZombieState): boolean => (!z.isDead || lockedTargets.has(z.id)) && !this.pendingLocalKills.has(z.id),
    );

    for (const killId of this.pendingLocalKills) {
      if (!currentIds.has(killId)) {
        this.pendingLocalKills.delete(killId);
      }
    }

    this.previousZombieStates = new Map<string, boolean>(
      zombies.map((z: ZombieState): [string, boolean] => [z.id, z.isDead]),
    );

    const liveZombieIds: Set<string> = new Set<string>(this.zombies.map((z: ZombieState) => z.id));
    for (const [id] of this.zombieInterpolation) {
      if (!liveZombieIds.has(id)) {
        this.zombieInterpolation.delete(id);
      }
    }

    for (const z of this.zombies) {
      const visual: { x: number; y: number } | undefined = visualPositions.get(z.id);
      if (visual) {
        this.zombieInterpolation.set(z.id, {
          prevX: visual.x,
          prevY: visual.y,
          targetX: z.x,
          targetY: z.y,
          targetVelocityX: z.velocityX,
          targetVelocityY: z.velocityY,
          syncAge: 0,
        });
        z.x = visual.x;
        z.y = visual.y;
      } else {
        this.zombieInterpolation.set(z.id, {
          prevX: z.x,
          prevY: z.y,
          targetX: z.x,
          targetY: z.y,
          targetVelocityX: z.velocityX,
          targetVelocityY: z.velocityY,
          syncAge: INTERPOLATION_TICKS,
        });
      }
    }
  }

  syncRemoteFloor(floor: number): void {
    if (!this.isMultiplayerClient) return;
    if (floor === this.floor) return;
    this.floor = floor;
    this.floorTransitionTimer = GAME_CONSTANTS.FLOOR_TRANSITION_TICKS;
    this.applyLevel();

    if (this.player) {
      this.player.x = GAME_CONSTANTS.CANVAS_WIDTH / 2 - GAME_CONSTANTS.PLAYER_WIDTH / 2;
      this.player.y = GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT;
      this.player.velocityX = 0;
      this.player.velocityY = 0;
      this.player.isGrounded = true;
      if (respawnForNewFloor(this.player)) this.onPlayerUpdate?.(this.player);
    }
  }

  /** Clients follow the host's boulder: clamped onto its path, and the wall breaks once. */
  applyRemoteBoulder(state: BoulderState | null): void {
    if (!this.isMultiplayerClient || !this.boulderPuzzle || !this.boulder || !state) return;
    const numbers: number[] = [state.gateHits, state.progress, state.speed];
    if (!numbers.every((n: number): boolean => Number.isFinite(n))) return;
    const pathLength: number = boulderPath(this.boulderPuzzle, this.exitPlatform.y).length;
    const clamp: (n: number, max: number) => number = (n: number, max: number): number =>
      Math.min(max, Math.max(0, n));
    this.boulder.gateHits = clamp(Math.round(state.gateHits), GAME_CONSTANTS.BOULDER_GATE_HITS);
    this.boulder.progress = clamp(state.progress, pathLength);
    this.boulder.speed = clamp(state.speed, GAME_CONSTANTS.BOULDER_MAX_SPEED);
    this.placeGate();
    if (state.wallBroken === true) this.breakPuzzleWall();
  }

  /**
   * Clients follow the host's spring (counts and timers clamped). A launch the client just saw
   * happen launches its own player if it stands on the spring: guests own their player state.
   */
  applyRemoteSpring(state: SpringState | null): void {
    if (!this.isMultiplayerClient || !this.springPuzzle || !this.spring || !state) return;
    const numbers: number[] = [
      state.launches,
      state.countdownTicks,
      state.bounceTicks,
      state.scaleKg,
      state.buttonTicks,
    ];
    if (!numbers.every((n: number): boolean => Number.isFinite(n))) return;
    const clamp: (n: number, max: number) => number = (n: number, max: number): number =>
      Math.min(max, Math.max(0, Math.round(n)));
    const launches: number = clamp(state.launches, Number.MAX_SAFE_INTEGER);
    const launched: boolean = launches > this.spring.launches;
    this.spring.launches = launches;
    this.spring.countdownTicks = clamp(state.countdownTicks, GAME_CONSTANTS.SPRING_COUNTDOWN_TICKS);
    this.spring.bounceTicks = clamp(state.bounceTicks, GAME_CONSTANTS.SPRING_BOUNCE_TICKS);
    this.spring.scaleKg = clamp(state.scaleKg, SCALE_MAX_KG);
    this.spring.buttonTicks = clamp(state.buttonTicks, GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS);
    if (launched && freshLaunch(this.spring) && this.player) {
      flingIfOnSpring(this.player, this.springPuzzle);
    }
  }

  /**
   * Clients follow the host's cages: hits and fall clamped, a snapped chain and a landing are
   * one-way. When the exit cage lands, the client lifts its own player out of its column onto it
   * (guests own their player state).
   */
  applyRemoteCages(state: CagePuzzleState | null): void {
    if (!this.isMultiplayerClient || !this.cagePuzzle || !this.cages || !state) return;
    const remotes: unknown = state.cages;
    if (!Array.isArray(remotes)) return;
    this.cages.cages.forEach((local: CageState, i: number): void => {
      const remote: CageState | undefined = remotes[i] as CageState | undefined;
      if (!remote || !Number.isFinite(remote.cleatHits) || !Number.isFinite(remote.fallTicks)) return;
      const hits: number = Math.min(
        GAME_CONSTANTS.CAGE_CLEAT_HITS,
        Math.max(0, Math.round(remote.cleatHits)),
      );
      local.cleatHits = isCut(local) ? GAME_CONSTANTS.CAGE_CLEAT_HITS : hits;
      const fall: number = Math.min(CAGE_MAX_FALL_TICKS, Math.max(0, Math.round(remote.fallTicks)));
      local.fallTicks = isCut(local) ? fall : 0;
      const landing: boolean = remote.landed === true && isCut(local) && !local.landed;
      if (landing) local.landed = true;
      if (landing && i === EXIT_CAGE && this.player) {
        liftOntoLandedCage(this.player, this.exitPlatform);
      }
    });
    this.placeCages();
  }

  /** Clients follow the host's plate: weight and door clamped (the door then slides on its own). */
  applyRemotePlate(state: PlateState | null): void {
    if (!this.isMultiplayerClient || !this.plate || !state) return;
    if (!Number.isFinite(state.weight) || !Number.isFinite(state.doorTicks)) return;
    this.plate.weight = Math.min(PLATE_MAX_WEIGHT, Math.max(0, Math.round(state.weight)));
    this.plate.doorTicks = Math.min(
      GAME_CONSTANTS.PLATE_DOOR_TICKS,
      Math.max(0, Math.round(state.doorTicks)),
    );
  }

  applyRemoteProjectiles(spitterProjectiles: SpitterProjectile[], dragonProjectiles: DragonProjectile[]): void {
    if (!this.isMultiplayerClient) return;
    this.spitterProjectiles = spitterProjectiles;
    this.dragonProjectiles = dragonProjectiles;
  }

  applyRemoteSpecialEffects(effects: ActiveSpecialEffect[]): void {
    if (!this.isMultiplayerClient) return;
    this.activeSpecialEffects = effects;
  }

  replayRemoteVfxEvents(events: VfxEvent[]): void {
    const myId: string = this.player?.id ?? '';
    for (const evt of events) {
      if (evt.playerId === myId) continue;
      const particlesBefore: number = this.particles.length;

      switch (evt.type) {
        case VfxEventType.SkillAnimation:
          this.vfxSystem.triggerSkillAnimation(
            evt.animationKey!, evt.x, evt.y, evt.facing!, evt.level!,
          );
          break;
        case VfxEventType.LevelUp:
          this.vfxSystem.spawnLevelUpEffectAt(evt.x, evt.y);
          break;
        case VfxEventType.BuffActivation:
          this.vfxSystem.spawnBuffActivationParticles(evt.x, evt.y, evt.color!);
          break;
        case VfxEventType.ScreenShake:
          this.vfxSystem.triggerScreenShake(evt.frames!, evt.intensity!);
          break;
        case VfxEventType.ScreenFlash:
          this.vfxSystem.triggerScreenFlash(evt.color!, evt.frames!);
          break;
        case VfxEventType.DashPortal:
          this.vfxSystem.spawnPortalVortex(evt.x, evt.y, evt.inward!);
          break;
        case VfxEventType.DamageNumber:
          this.vfxSystem.spawnDamageNumber(evt.x, evt.y, evt.value!, evt.isCrit!, evt.color!);
          break;
        case VfxEventType.HitParticles:
          this.vfxSystem.spawnHitParticles(evt.x, evt.y, evt.color!);
          break;
        case VfxEventType.HitMark:
          this.vfxSystem.spawnHitMark(evt.x, evt.y);
          break;
        case VfxEventType.DashTrail:
          this.vfxSystem.spawnDashTrailBurst(evt.x, evt.endX!, evt.y, evt.dir!);
          break;
        case VfxEventType.DragonImpact:
          this.dragonImpacts.push({ x: evt.x, y: evt.y, frame: 0, tickCounter: 0 });
          break;
        case VfxEventType.PoisonTrigger:
          this.vfxSystem.spawnPoisonBubblesAt(evt.x, evt.y);
          this.vfxSystem.tintPlayerPoisoned(evt.playerId);
          break;
        case VfxEventType.PlayerHurt:
          this.vfxSystem.tintPlayerHurt(evt.playerId);
          break;
        case VfxEventType.ThrowingStar:
          this.vfxSystem.spawnThrowingStarTrail(evt.x, evt.y, evt.targetX!, evt.targetY!, evt.color!);
          break;
        case VfxEventType.MagicTwinSpawn:
          this.vfxSystem.spawnBuffActivationParticles(evt.x, evt.y, evt.color!);
          break;
        case VfxEventType.WallBreak:
          this.vfxSystem.spawnWallBreak(evt.x, evt.y);
          break;
        case VfxEventType.GateBreak:
          this.vfxSystem.spawnGateBreak(evt.x, evt.y);
          break;
        case VfxEventType.SpringLaunch:
          this.vfxSystem.spawnSpringLaunch(evt.x, evt.y);
          break;
        case VfxEventType.CageLand:
          this.vfxSystem.spawnCageLand(evt.x, evt.y);
          break;
        case VfxEventType.CageSmash:
          this.vfxSystem.spawnCageSmash(evt.x, evt.y, evt.value === 1);
          break;
        case VfxEventType.DoorOpen:
          this.vfxSystem.spawnDoorOpen(evt.x, evt.y);
          break;
        case VfxEventType.BarrelBlast:
          this.vfxSystem.spawnBarrelBlast(
            evt.x,
            evt.y,
            Number.isFinite(evt.targetY) ? evt.targetY! : null,
          );
          break;
        case VfxEventType.BarrelRespawn:
          this.vfxSystem.spawnBarrelRespawn(evt.x, evt.y);
          break;
        case VfxEventType.DoorShut:
          this.vfxSystem.spawnDoorShut(evt.x, evt.y);
          break;
        case VfxEventType.Lightning:
          this.vfxSystem.strikeLightning(evt.x, evt.value!);
          break;
      }
      // Other players' effects render a bit softer so your own read first.
      for (let i: number = particlesBefore; i < this.particles.length; i++) {
        this.particles[i].alphaScale = GAME_CONSTANTS.ALLY_VFX_ALPHA;
      }
    }
  }

  applyIncomingZombieDamage(damage: number, knockbackDir: number, isPoisonAttack: boolean): void {
    const p: CharacterState | null = this.player;
    if (!p || p.isDead || p.isDown) return;
    if (this.godMode) return;
    if (this.invincibilityFrames > 0) return;
    // The host aimed at where it last saw us; we already made it up to the safe spot.
    if (this.isInSafeSpot(p.x, p.y)) return;
    // Same rules as a hit on the host's own player: no hit mid-dash or in Dark Sight.
    if (this.combatSystem.dodgesZombieHits()) return;

    p.hp -= damage;
    this.invincibilityFrames = GAME_CONSTANTS.INVINCIBILITY_FRAMES;
    this.vfxSystem.flashPlayerHurt(p);

    this.combatSystem.interruptReviveChannel();

    if (!this.combatSystem.resistsKnockback(p)) {
      p.velocityX = knockbackDir * GAME_CONSTANTS.KNOCKBACK_FORCE_PLAYER;
      p.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
      p.isGrounded = false;
      if (p.isClimbing) {
        p.isClimbing = false;
      }
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

    this.pendingVfxEvents.push({
      type: VfxEventType.HitParticles,
      playerId: p.id,
      x: p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      color: '#ffffff',
    });
    this.pendingVfxEvents.push({
      type: VfxEventType.DamageNumber,
      playerId: p.id,
      x: p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: p.y - 10,
      value: damage,
      isCrit: false,
      color: '#ff4444',
    });

    if (isPoisonAttack) {
      const damagePerTick: number = GAME_CONSTANTS.SPITTER_POISON_DAMAGE_PER_TICK +
        Math.floor(this.floor * GAME_CONSTANTS.SPITTER_POISON_DAMAGE_WAVE_SCALE);
      this.poisonEffect = {
        remainingTicks: GAME_CONSTANTS.SPITTER_POISON_DURATION_TICKS,
        tickInterval: GAME_CONSTANTS.SPITTER_POISON_TICK_INTERVAL,
        tickTimer: GAME_CONSTANTS.SPITTER_POISON_TICK_INTERVAL,
        damagePerTick,
      };
      this.vfxSystem.tintPlayerPoisoned(p.id);
      this.pendingVfxEvents.push({
        type: VfxEventType.PoisonTrigger,
        playerId: p.id,
        x: p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
        y: p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      });
    }

    if (p.hp <= 0) {
      p.hp = 0;
      const isMultiplayer: boolean = this.isMultiplayerHost || this.isMultiplayerClient;
      if (isMultiplayer) {
        p.isDown = true;
        p.downTimer = GAME_CONSTANTS.REVIVE_WINDOW_TICKS;
        this.onPlayerUpdate?.(p);
        this.onPlayerDowned?.();
      } else {
        p.isDead = true;
        this.onPlayerUpdate?.(p);
        this.onGameOver?.();
      }
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

      // No hit VFX here: the attacker already broadcast its own
      // hit-particles / damage-number / hit-mark events to every player.
      z.hp -= evt.damage;

      if (z.hp <= 0) {
        this.combatSystem.handleZombieDeath(z, false);
      }
    }

    this.combatSystem.filterDeadZombies();
  }

  applyRemotePull(evt: { playerX: number; playerY: number; pullRange: number; skillColor: string }): void {
    if (!this.isMultiplayerHost) return;

    pullZombiesToward(this.zombies, evt.playerX, evt.playerY, evt.pullRange);
  }

  setRemotePlayers(players: CharacterState[]): void {
    const playerCountChanged: boolean = players.length !== this.remotePlayers.length;
    const visualPositions: Map<string, { x: number; y: number }> = new Map<string, { x: number; y: number }>();
    for (const rp of this.remotePlayers) {
      visualPositions.set(rp.id, { x: rp.x, y: rp.y });
    }

    const currentIds: Set<string> = new Set<string>(
      players.map((p: CharacterState) => p.id),
    );
    for (const [id] of this.remotePlayerAnimators) {
      if (!currentIds.has(id)) {
        this.remotePlayerAnimators.delete(id);
        this.remotePlayerInterpolation.delete(id);
      }
    }
    this.remotePlayers = players;
    // The exit sits higher with more players; every client derives it the same way.
    if (playerCountChanged) this.repositionExitPlatform();

    for (const rp of this.remotePlayers) {
      const visual: { x: number; y: number } | undefined = visualPositions.get(rp.id);
      if (visual) {
        this.remotePlayerInterpolation.set(rp.id, {
          prevX: visual.x,
          prevY: visual.y,
          targetX: rp.x,
          targetY: rp.y,
          targetVelocityX: rp.velocityX,
          targetVelocityY: rp.velocityY,
          syncAge: 0,
        });
        rp.x = visual.x;
        rp.y = visual.y;
      } else {
        this.remotePlayerInterpolation.set(rp.id, {
          prevX: rp.x,
          prevY: rp.y,
          targetX: rp.x,
          targetY: rp.y,
          targetVelocityX: rp.velocityX,
          targetVelocityY: rp.velocityY,
          syncAge: INTERPOLATION_TICKS,
        });
      }
    }
  }

  /**
   * Host (or solo): takes these pickable props off the floor for good, synced like a blown-up
   * barrel that never comes back. For test setup that needs room with no prop in carry reach.
   */
  clearLooseProps(ids: string[]): void {
    if (this.isMultiplayerClient) return;
    for (const id of ids) this.loosePropSystem.remove(id, false);
  }

  /** Client: the host's moved props (the rest lie on their spawn spots); lying ones are solid. */
  applyRemoteProps(moved: LooseProp[]): void {
    if (!this.isMultiplayerClient) return;
    this.loosePropSystem.applyRemote(moved);
    this.corpseCarrySystem.holdCarried();
    this.loosePropSystem.placeSolids();
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
      if (c.frozen) {
        // The host froze this corpse in its final pose; show the same pose here.
        this.zombieSpriteAnimator.setFinalFrame(c.id, c.spriteKey, ZombieAnimState.Dead);
      } else {
        this.zombieSpriteAnimator.setState(c.id, ZombieAnimState.Dead);
      }
    }
    for (const c of pendingLocalCorpses) {
      this.zombieSpriteAnimator.setState(c.id, ZombieAnimState.Dead);
    }

    this.zombieCorpses = [...corpses, ...pendingLocalCorpses];
    this.corpseCarrySystem.holdCarried();
  }

  private tickEntityInterpolation(): void {
    if (this.isMultiplayerClient) {
      for (const z of this.zombies) {
        const interp: EntityInterpolation | undefined = this.zombieInterpolation.get(z.id);
        if (!interp) continue;

        interp.syncAge++;
        const t: number = Math.min(interp.syncAge / INTERPOLATION_TICKS, 1.0);

        if (t < 1.0) {
          z.x = interp.prevX + (interp.targetX - interp.prevX) * t;
          z.y = interp.prevY + (interp.targetY - interp.prevY) * t;
        } else {
          const extraTicks: number = Math.min(interp.syncAge - INTERPOLATION_TICKS, MAX_EXTRAPOLATION_TICKS);
          z.x = interp.targetX + interp.targetVelocityX * extraTicks;
          z.y = interp.targetY + interp.targetVelocityY * extraTicks;
        }
      }
    }

    const isMultiplayer: boolean = this.isMultiplayerHost || this.isMultiplayerClient;
    if (isMultiplayer) {
      for (const rp of this.remotePlayers) {
        const interp: EntityInterpolation | undefined = this.remotePlayerInterpolation.get(rp.id);
        if (!interp) continue;

        interp.syncAge++;
        const t: number = Math.min(interp.syncAge / INTERPOLATION_TICKS, 1.0);

        if (t < 1.0) {
          rp.x = interp.prevX + (interp.targetX - interp.prevX) * t;
          rp.y = interp.prevY + (interp.targetY - interp.prevY) * t;
        } else {
          const extraTicks: number = Math.min(interp.syncAge - INTERPOLATION_TICKS, MAX_EXTRAPOLATION_TICKS);
          rp.x = interp.targetX + interp.targetVelocityX * extraTicks;
          rp.y = interp.targetY + interp.targetVelocityY * extraTicks;
        }
      }
    }
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
        animator.load(classToSpriteSet(rp.classId));
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
    if (p.isDead || p.isDown) return PlayerAnimState.Death;
    if (p.isAttacking) return PlayerAnimState.Attack;
    if (p.isClimbing) return PlayerAnimState.Climb;
    if (p.isDoubleJumping && !p.isGrounded) return PlayerAnimState.DoubleJump;
    if (!p.isGrounded) return PlayerAnimState.Jump;
    if (Math.abs(p.velocityX) > 0.3) return PlayerAnimState.Run;
    return PlayerAnimState.Idle;
  }

}
