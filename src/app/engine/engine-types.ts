import {
  CharacterState,
  Direction,
  SkillDefinition,
} from '@shared/index';
import {
  DropType,
  WorldDrop,
  ZombieCorpse,
  ZombieState,
  ZombieType,
} from '@shared/game-entities';
import { InputKeys } from '@shared/messages';
import { Particle } from './particle-types';
import { SpriteAnimator } from './sprite-animator';
import { ZombieSpriteAnimator } from './zombie-sprite-animator';
import { MapRenderer } from './map-renderer';
import { SpriteEffectSystem } from './sprite-effect-system';

export type DashPhase = 'vanishing' | 'swishing' | 'appearing';

export interface DashPhaseState {
  startX: number;
  endX: number;
  playerY: number;
  startCX: number;
  endCX: number;
  playerCY: number;
  facing: Direction;
  dir: number;
  phase: DashPhase;
  ticksInPhase: number;
  vanishTicks: number;
  swishTicks: number;
  appearTicks: number;
  skill: SkillDefinition;
  skillLevel: number;
  hitZombies: ZombieState[];
  damageMultiplier: number;
  damageApplied: boolean;
}

export interface DamageNumber {
  x: number;
  y: number;
  value: number;
  isCrit: boolean;
  life: number;
  color: string;
  vx: number;
  scale: number;
}

export interface DropNotification {
  type: DropType;
  label: string;
  color: string;
  icon: string;
  life: number;
  maxLife: number;
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rope {
  x: number;
  topY: number;
  bottomY: number;
}

export interface BackgroundStar {
  x: number;
  y: number;
  size: number;
  brightness: number;
}

export interface DragonProjectile {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  damage: number;
  lifetime: number;
  frame: number;
  tickCounter: number;
}

export interface SpitterProjectile {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  damage: number;
  lifetime: number;
  trail: { x: number; y: number; life: number }[];
}

export interface PoisonEffect {
  remainingTicks: number;
  tickInterval: number;
  tickTimer: number;
  damagePerTick: number;
}

export interface DragonImpact {
  x: number;
  y: number;
  frame: number;
  tickCounter: number;
}

export interface HitMark {
  x: number;
  y: number;
  frame: number;
  tickCounter: number;
}

export interface LevelUpNotification {
  life: number;
  maxLife: number;
  oldLevel: number;
  newLevel: number;
}

export interface IGameEngine {
  readonly ctx: CanvasRenderingContext2D;
  readonly fixedDt: number;

  player: CharacterState | null;
  levelUpNotification: LevelUpNotification | null;
  remotePlayers: CharacterState[];
  zombies: ZombieState[];
  zombieCorpses: ZombieCorpse[];
  particles: Particle[];
  damageNumbers: DamageNumber[];
  dropNotifications: DropNotification[];
  readonly DROP_NOTIFICATION_LIFE_TICKS: number;
  worldDrops: WorldDrop[];
  platforms: Platform[];
  ropes: Rope[];
  keys: InputKeys;

  attackCooldown: number;
  attackAnimTicks: number;
  attackHitPending: boolean;
  attackHitDelay: number;
  invincibilityFrames: number;
  potionCooldown: number;
  jumpHeld: boolean;
  ropeJumpCooldown: number;
  platformDropTimer: number;

  playerUsableSkills: SkillDefinition[];
  skillCooldowns: Map<string, number>;
  passiveRecoveryTimers: Map<string, number>;
  playerStandingStillTicks: number;
  playerStunTicks: number;
  autoPotionCooldown: number;

  floor: number;
  spawnTimer: number;
  floorTransitionTimer: number;
  exitPlatform: Platform;

  backgroundStars: BackgroundStar[];

  screenShakeFrames: number;
  screenShakeIntensity: number;
  screenFlashColor: string | null;
  screenFlashFrames: number;

  readonly spriteAnimator: SpriteAnimator;
  readonly zombieSpriteAnimator: ZombieSpriteAnimator;
  remotePlayerAnimators: Map<string, SpriteAnimator>;
  readonly mapRenderer: MapRenderer;
  readonly spriteEffectSystem: SpriteEffectSystem;
  readonly SPRITE_RENDER_SIZE: number;

  dragonProjectiles: DragonProjectile[];
  dragonImpacts: DragonImpact[];
  readonly dragonProjectileImg: HTMLImageElement;
  readonly dragonImpactImg: HTMLImageElement;

  spitterProjectiles: SpitterProjectile[];
  poisonEffect: PoisonEffect | null;
  readonly DRAGON_PROJ_FRAME_W: number;
  readonly DRAGON_PROJ_FRAME_H: number;
  readonly DRAGON_PROJ_FRAMES: number;
  readonly DRAGON_IMPACT_FRAME_W: number;
  readonly DRAGON_IMPACT_FRAME_H: number;
  readonly DRAGON_IMPACT_FRAMES: number;

  hitMarks: HitMark[];
  readonly HIT_MARK_TICKS_PER_FRAME: number;
  readonly HIT_MARK_RENDER_SIZE: number;

  dashPhase: DashPhaseState | null;

  reviveTargetId: string | null;
  reviveProgressTicks: number;

  godMode: boolean;
  showCollisionBoxes: boolean;
  isMultiplayerHost: boolean;
  isMultiplayerClient: boolean;
  pendingLocalKills: Set<string>;
  pendingRemoteAttacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }>;
  pendingReviveTargetIds: string[];

  onPlayerUpdate: ((player: CharacterState) => void) | null;
  onZombiesUpdate: ((zombies: ZombieState[]) => void) | null;
  onFloorUpdate: ((floor: number) => void) | null;
  onFloorComplete: (() => void) | null;
  onXpGained: ((amount: number) => void) | null;
  onScoreUpdate: ((delta: number) => void) | null;
  onGameOver: (() => void) | null;
  onGoldPickup: ((amount: number) => void) | null;
  onPotionPickup: ((type: DropType) => void) | null;
  onUseHpPotion: (() => boolean) | null;
  onUseMpPotion: (() => boolean) | null;
  onOpenShop: (() => void) | null;
  onZombieDamaged: ((events: Array<{ zombieId: string; damage: number; killed: boolean }>) => void) | null;
  onRemotePlayerDamaged: ((targetPlayerId: string, damage: number, zombieX: number, zombieY: number, knockbackDir: number, isPoisonAttack: boolean) => void) | null;
  onPlayerRevived: ((targetPlayerId: string) => void) | null;
  onPlayerDowned: (() => void) | null;
  onPlayerDownExpired: (() => void) | null;
}
