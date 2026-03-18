import {
  CharacterState,
  SkillDefinition,
} from '@shared/index';
import {
  DropType,
  WorldDrop,
  ZombieState,
  ZombieType,
} from '@shared/game-entities';
import { InputKeys } from '@shared/messages';
import { Particle } from './particle-types';
import { SpriteAnimator } from './sprite-animator';
import { ZombieSpriteAnimator } from './zombie-sprite-animator';
import { MapRenderer } from './map-renderer';
import { SpriteEffectSystem } from './sprite-effect-system';

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

export interface ZombieCorpse {
  id: string;
  type: ZombieType;
  x: number;
  y: number;
  width: number;
  height: number;
  spriteKey: string;
  facing: number;
  velocityX: number;
  velocityY: number;
  isGrounded: boolean;
  frozen: boolean;
  landProcessed: boolean;
  fadeTimer: number;
  maxFadeTimer: number;
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

export interface IGameEngine {
  readonly ctx: CanvasRenderingContext2D;
  readonly fixedDt: number;

  player: CharacterState | null;
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

  wave: number;
  zombiesKilledThisWave: number;
  zombiesToSpawnThisWave: number;
  zombiesSpawnedThisWave: number;
  spawnTimer: number;
  waveTransitionTimer: number;

  backgroundStars: BackgroundStar[];

  screenShakeFrames: number;
  screenShakeIntensity: number;
  screenFlashColor: string | null;
  screenFlashFrames: number;

  readonly spriteAnimator: SpriteAnimator;
  readonly zombieSpriteAnimator: ZombieSpriteAnimator;
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

  godMode: boolean;
  showCollisionBoxes: boolean;

  onPlayerUpdate: ((player: CharacterState) => void) | null;
  onZombiesUpdate: ((zombies: ZombieState[]) => void) | null;
  onWaveUpdate: ((wave: number, remaining: number) => void) | null;
  onXpGained: ((amount: number) => void) | null;
  onScoreUpdate: ((delta: number) => void) | null;
  onGameOver: (() => void) | null;
  onGoldPickup: ((amount: number) => void) | null;
  onPotionPickup: ((type: DropType) => void) | null;
  onUseHpPotion: (() => boolean) | null;
  onUseMpPotion: (() => boolean) | null;
  onOpenShop: (() => void) | null;
}
