import {
  CharacterState,
  Direction,
  SkillDefinition,
  VfxEvent,
} from '@shared/index';
import {
  ActiveSpecialEffect,
  BoulderState,
  CagePuzzleState,
  PlateState,
  SpringState,
  DropType,
  LooseProp,
  PendingSpecialDropConfirm,
  SpecialDropType,
  WorldDrop,
  ZombieCorpse,
  ZombieState,
  ZombieType,
} from '@shared/game-entities';
import { CarryPose } from './corpse-carry';
import { CorpseDrape } from './corpse-drape';
import { InputKeys } from '@shared/messages';
import { PixelIconId } from '@shared/pixel-icon';
import { Particle } from './particle-types';
import { SpriteAnimator } from './sprite-animator';
import { ZombieSpriteAnimator } from './zombie-sprite-animator';
import { MapRenderer } from './map-renderer';
import { SpriteEffectSystem } from './sprite-effect-system';
import { LightningStrike } from './storm';

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
  icon: PixelIconId;
  life: number;
  maxLife: number;
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  /** A prop: besides standing on its top, its sides block anyone walking into it. */
  solid?: boolean;
  /** The floor's safe spot: zombies never stand on it and can't hurt anyone resting on it. */
  safe?: boolean;
  /**
   * A floor-2 puzzle solid, removed when it breaks: the side `wall` (broken by the boulder) or the
   * `gate` holding the boulder on its ledge (broken by players' hits). The floor-3 `spring` is a
   * solid puzzle part that stays for the whole floor. The floor-4 `cage` (the exit cage: hanging,
   * then standing on the ground) and each `hanging-cage` (mid-screen) go when their chain snaps.
   */
  puzzlePart?: 'wall' | 'gate' | 'spring' | 'cage' | 'hanging-cage';
  /** A loose prop's box: it follows the prop, and is gone while the prop is carried or in the air. */
  propId?: string;
}

export interface Rope {
  x: number;
  topY: number;
  bottomY: number;
}

/**
 * Floor-2 puzzle: the boulder rests on a high ledge (the exit platform's spot, climbed by the
 * corpse pile) behind a small gate; a chute runs from the ledge down to a breakable wall at a
 * screen edge. The ledge height follows the exit's rules, so the chute is derived per frame.
 */
export interface BoulderPuzzleLayout {
  /** The wall at the screen edge: from the screen top to the ground. */
  wall: Platform;
  /** +1: the wall is right of the ledge, -1: left of it (the boulder rolls this way). */
  wallDir: 1 | -1;
  /** Left edge of the ledge (it is EXIT_PLATFORM_WIDTH wide, like the exit). */
  ledgeX: number;
}


/**
 * Floor-3 puzzle: a big spring (a solid block one hop high) at the screen edge straight under the
 * exit, which hangs at the very top. A scale's pan is set into the ground on the far side; a cable
 * runs from it along the ceiling to the spring's button. Enough kg on the scale slowly pulls the
 * button up; a hit on the raised button starts a 3-2-1, then the spring launches everyone on it.
 */
export interface SpringPuzzleLayout {
  /** The spring's solid box: its top plate is walkable, it spans the exit from the screen edge. */
  spring: Platform;
  /** +1: the spring is at the right screen edge (the button on its left), -1: at the left edge. */
  side: 1 | -1;
  /** Left edge of the scale's pan (SPRING_SCALE_WIDTH_PX wide, its top flush with the ground). */
  scaleX: number;
}

/** What a floor-4 cage hides under its cover until it lands. */
export type CageContent = 'zombies' | 'loot' | 'empty';

/** One floor-4 cage on its chain. */
export interface HangingCage {
  /** Where it hangs (solid: you can stand on it); null for the exit cage, which hangs under the exit and moves with it. */
  hang: Platform | null;
  /** Top of what it lands on: the ground, or (a mid-screen cage) the highest platform under it. */
  landY: number;
  /** Hidden until it lands: zombies spill out, loot pops out, or nothing. */
  content: CageContent;
  /** The cleat tying its chain: center x, and the surface it stands on (a ledge or the ground). */
  cleatX: number;
  cleatY: number;
  /** Points its chain winds through in the ceiling band, between its cleat and its cage (the tangle). */
  kinks: Array<{ x: number; y: number }>;
}

/**
 * Floor-4 puzzle: 4-5 covered cages hang on chains. cages[0] is the exit cage, hanging under the
 * exit (derived from the exit platform, which moves with the party size); the rest hang
 * mid-screen. Every chain runs up from a cleat on a ledge, tangles with the others through the
 * ceiling band, and comes down to its cage: nobody can tell which cleat drops which cage, nor
 * what each cage hides. Hit a cleat to snap its chain. The exit cage lands under the exit as a
 * solid step (and spills its content on top); the others smash where they land.
 */
export interface CagePuzzleLayout {
  cages: HangingCage[];
}

/**
 * Floor-5 puzzle: the exit has a barred door that is open only while a pressure plate is weighed
 * down. The plate is set into the top of a high ledge on the far side from the exit (the ground
 * there when no ledge fits): carry corpses onto it, or have a friend stand on it.
 */
export interface PlatePuzzleLayout {
  /** Left edge of the plate (PLATE_WIDTH_PX wide). */
  plateX: number;
  /** Top of the surface the plate is set into (things standing on the plate have their feet here). */
  plateY: number;
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

/** Remaining ticks of each status tint on a player's sprite (0 = off). */
export interface PlayerTint {
  hurtTicks: number;
  poisonTicks: number;
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

/**
 * A barrel blast playing out on this screen (drawn by RenderSystem): white-hot core, fireball,
 * shockwave and glow over BARREL_BLAST_FX_TICKS, then a scorch mark fading over BARREL_SCORCH_TICKS.
 */
export interface BarrelBlastFx {
  x: number;
  y: number;
  /** The surface under it (where the scorch mark lies), or null when it blew up in the air. */
  groundY: number | null;
  age: number;
}

export interface HitMark {
  x: number;
  y: number;
  frame: number;
  tickCounter: number;
}

export interface PlayerProjectile {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  damage: number;
  isCrit: boolean;
  damageColor: string;
  particleColor: string;
  lifetime: number;
  rotation: number;
  size: number;
  delay: number;
  targetZombieId: string | null;
}

export interface LevelUpNotification {
  life: number;
  maxLife: number;
  oldLevel: number;
  newLevel: number;
}

export interface EntityInterpolation {
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  targetVelocityX: number;
  targetVelocityY: number;
  syncAge: number;
}

export interface IGameEngine {
  readonly ctx: CanvasRenderingContext2D;
  readonly fixedDt: number;

  player: CharacterState | null;
  levelUpNotification: LevelUpNotification | null;
  remotePlayers: CharacterState[];
  zombies: ZombieState[];
  zombieCorpses: ZombieCorpse[];
  /** The floor's pickable props (barrels, boxes): lying ones are solid platforms (`Platform.propId`). */
  looseProps: LooseProp[];
  /** How each carried corpse sways on its carrier this tick (drawing only). */
  readonly carryPoses: Map<string, CarryPose>;
  /** How each lying corpse's body sags onto what is under it (drawing only). */
  corpseDrapes: Map<string, CorpseDrape>;
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
  jumpBufferTicks: number;
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
  /** Ticks until the next Eater comes for the lying corpses (counts only while enough lie uneaten). */
  eaterSpawnTimer: number;
  floorTransitionTimer: number;
  exitPlatform: Platform;
  /** Floor-2 puzzle layout and its boulder (null on other floors). */
  boulderPuzzle: BoulderPuzzleLayout | null;
  boulder: BoulderState | null;
  /** Floor-3 puzzle layout and its spring (null on other floors). */
  springPuzzle: SpringPuzzleLayout | null;
  spring: SpringState | null;
  /** Floor-4 puzzle layout and its two cages (null on other floors). */
  cagePuzzle: CagePuzzleLayout | null;
  cages: CagePuzzleState | null;
  /** Floor-5 puzzle layout and its plate and exit door (null on other floors). */
  platePuzzle: PlatePuzzleLayout | null;
  plate: PlateState | null;

  backgroundStars: BackgroundStar[];

  screenShakeFrames: number;
  screenShakeIntensity: number;
  screenFlashColor: string | null;
  screenFlashFrames: number;
  /** The strike lighting the sky right now (null between strikes). Drawn by MapRenderer. */
  lightning: LightningStrike | null;
  /** Host/solo only: ms until the next strike. */
  lightningTimerMs: number;

  readonly spriteAnimator: SpriteAnimator;
  readonly zombieSpriteAnimator: ZombieSpriteAnimator;
  remotePlayerAnimators: Map<string, SpriteAnimator>;
  readonly mapRenderer: MapRenderer;
  readonly spriteEffectSystem: SpriteEffectSystem;
  readonly SPRITE_RENDER_SIZE: number;

  dragonProjectiles: DragonProjectile[];
  dragonImpacts: DragonImpact[];
  barrelBlasts: BarrelBlastFx[];
  readonly dragonProjectileImg: HTMLImageElement;
  readonly dragonImpactImg: HTMLImageElement;

  spitterProjectiles: SpitterProjectile[];
  poisonEffect: PoisonEffect | null;
  /** Status tints by player id (local and remote), drawn in the shape of the sprite. */
  playerTints: Map<string, PlayerTint>;
  readonly DRAGON_PROJ_FRAME_W: number;
  readonly DRAGON_PROJ_FRAME_H: number;
  readonly DRAGON_PROJ_FRAMES: number;
  readonly DRAGON_IMPACT_FRAME_W: number;
  readonly DRAGON_IMPACT_FRAME_H: number;
  readonly DRAGON_IMPACT_FRAMES: number;

  hitMarks: HitMark[];
  playerProjectiles: PlayerProjectile[];
  readonly HIT_MARK_TICKS_PER_FRAME: number;
  readonly HIT_MARK_RENDER_SIZE: number;

  doubleJumpUsed: boolean;
  doubleJumpAnimTicks: number;

  dashPhase: DashPhaseState | null;

  reviveTargetId: string | null;
  /** Key the carry prompt shows (the player's binding). */
  carryKeyLabel: string;
  /** Keys shown in the special-drop prompt (follow rebinding). */
  dropPromptKeyLabels: { confirm: string; decline: string };
  reviveProgressTicks: number;

  activeSpecialEffects: ActiveSpecialEffect[];
  pendingSpecialDropConfirm: PendingSpecialDropConfirm | null;

  godMode: boolean;
  showCollisionBoxes: boolean;
  isMultiplayerHost: boolean;
  isMultiplayerClient: boolean;
  /** The local player is away from the keyboard (online): frozen, sent as `player.isAfk`. */
  isLocalAfk: boolean;
  pendingLocalKills: Set<string>;
  pendingRemoteAttacks: Array<{ targetPlayerId: string; damage: number; knockbackDir: number; isPoisonAttack: boolean }>;
  pendingReviveTargetIds: string[];
  pendingSpecialDropActivations: SpecialDropType[];
  pendingVfxEvents: VfxEvent[];
  pendingPullEvents: Array<{ playerX: number; playerY: number; pullRange: number; skillColor: string }>;

  zombieInterpolation: Map<string, EntityInterpolation>;
  remotePlayerInterpolation: Map<string, EntityInterpolation>;

  repositionExitPlatform(): void;
  /** Builds the current floor's layout (collision + drawn map) from the shared seed. */
  applyLevel(): void;
  /** Brief freeze-frame when the local player's hit lands (solo only). */
  requestHitStop(ticks: number): void;
  /** A player whose top-left corner is at (x, y) rests on the floor's safe spot (out of every attack's reach). */
  isInSafeSpot(x: number, y: number): boolean;
  /** Out of every attack's reach: resting on the safe spot, or away from the keyboard. */
  isOutOfReach(p: CharacterState): boolean;
  /** Removes the gate holding the boulder (its collision) for good on this floor. */
  breakPuzzleGate(): void;
  /** Removes the puzzle wall (collision + art) for good on this floor. */
  breakPuzzleWall(): void;
  /** The puzzle wall while it still stands, else null. */
  puzzleWall(): Platform | null;
  /** Puts the floor-4 cages' collision where their state says (hanging, gone while falling, landed). */
  placeCages(): void;

  onPlayerUpdate: ((player: CharacterState) => void) | null;
  onZombiesUpdate: ((zombies: ZombieState[]) => void) | null;
  onFloorUpdate: ((floor: number) => void) | null;
  onFloorComplete: (() => void) | null;
  onXpGained: ((amount: number) => void) | null;
  onScoreUpdate: ((delta: number) => void) | null;
  onGameOver: (() => void) | null;
  onGoldPickup: ((amount: number) => void) | null;
  onPotionPickup: ((type: DropType) => void) | null;
  onSpecialDropPickup: ((type: SpecialDropType) => void) | null;
  onUseHpPotion: (() => boolean) | null;
  onUseMpPotion: (() => boolean) | null;
  onOpenShop: (() => void) | null;
  onZombieDamaged: ((events: Array<{ zombieId: string; damage: number; killed: boolean }>) => void) | null;
  onRemotePlayerDamaged: ((targetPlayerId: string, damage: number, zombieX: number, zombieY: number, knockbackDir: number, isPoisonAttack: boolean) => void) | null;
  onPlayerRevived: ((targetPlayerId: string) => void) | null;
  onPlayerDowned: (() => void) | null;
  onPlayerDownExpired: (() => void) | null;
}
