/**
 * Contract between the running game and the Playwright suite in `e2e/`.
 *
 * The game exposes `window.__zbE2e` in dev builds only (see `e2e-hooks.ts`).
 * Keep this file import-free: the e2e suite imports it type-only from outside
 * the Angular project.
 */

export type E2eRole = 'solo' | 'host' | 'client';

export interface E2ePlayerView {
  id: string;
  name: string;
  classId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  level: number;
  isGrounded: boolean;
  isAttacking: boolean;
  isClimbing: boolean;
  isDoubleJumping: boolean;
  isDead: boolean;
  isDown: boolean;
  /** Ticks left before a downed player dies. */
  downTimer: number;
  unallocatedStatPoints: number;
  unallocatedSkillPoints: number;
  xp: number;
  xpToNext: number;
  skillLevels: Record<string, number>;
  gold: number;
  potions: Record<string, number>;
}

export interface E2eRemotePlayerView extends E2ePlayerView {
  /** Sprite animation state this client renders for the remote player (`idle`, `attack`, ...). */
  animState: string | null;
}

export interface E2eZombieView {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  isDead: boolean;
  spawnTimer: number;
  /** 1 = facing right, -1 = facing left. */
  facing: number;
  /** True during the attack animation (the hit lands mid-animation). */
  isAttacking: boolean;
  /** True while telegraphing a melee swing (wind-up before the attack animation). */
  windingUp: boolean;
  /** Monster-magnet drag: null when not pulled, 0 while bracing, then 0..1 along the drag. */
  magnetPull: number | null;
  /** Ticks until this zombie can start its next attack. */
  attackCooldown: number;
}

export interface E2eCorpseView {
  id: string;
  x: number;
  y: number;
  isGrounded: boolean;
  frozen: boolean;
  /** Walkable foothold on top of this corpse. */
  footX: number;
  footWidth: number;
  footY: number;
  facing: number;
  /** Sprite animation this client renders for the corpse (`dead` once it falls). */
  animState: string | null;
  frame: number | null;
  /** Last frame of the death animation = fully lying down. */
  lastFrame: number;
}

/** Corpses piled up under the exit: ordinary corpses, nothing holds or arranges them. */
export interface E2eExitPile {
  /** The exit's span: grounded corpses whose foothold overlaps it make up the pile. */
  columnLeft: number;
  columnRight: number;
  centerX: number;
  /** Ground under the exit. */
  baseY: number;
  /** Highest corpse foothold in the column (baseY when there is none). */
  topY: number;
  /** A foothold at or above this line puts the exit within one jump. */
  reachY: number;
  bodies: number;
  reachable: boolean;
}

export interface E2eDropView {
  id: string;
  type: string;
  x: number;
  y: number;
  value: number;
}

export interface E2eSkillView {
  id: string;
  name: string;
  /** Skill key slot: 1..6 maps to keys `1`..`6`. */
  slot: number;
  type: string;
  mechanic: string;
  animationKey: string;
  level: number;
  cooldownTicks: number;
}

export interface E2eVfxCounts {
  particles: number;
  damageNumbers: number;
  hitMarks: number;
  dragonImpacts: number;
  playerProjectiles: number;
  spriteEffects: string[];
  screenShakeFrames: number;
  screenFlashFrames: number;
}

export interface E2ePendingQueues {
  vfxEvents: number;
  pullEvents: number;
  remoteAttacks: number;
  reviveTargets: number;
  specialDropActivations: number;
}

export interface E2eVfxEventView {
  type: string;
  playerId: string;
  x: number;
  y: number;
  animationKey?: string;
}

export interface E2eVfxLogEntry {
  seq: number;
  at: number;
  /**
   * `sent`: drained into a multiplayer sync snapshot. `replayed`: received from another player
   * and replayed. `discarded`: queued in single player, where nobody receives it.
   */
  direction: 'sent' | 'replayed' | 'discarded';
  type: string;
  playerId: string;
  animationKey?: string;
  /** Replay only: true when the event came from this client and was skipped. */
  skippedOwn?: boolean;
  particlesAdded?: number;
  damageNumbersAdded?: number;
  hitMarksAdded?: number;
  spriteEffectsAdded?: number;
}

export interface E2eLevelView {
  seed: number;
  /** Platforms above the ground (the ground is always y = GROUND_Y, full width). */
  platforms: Array<{ x: number; y: number; width: number; height: number }>;
  ropes: Array<{ x: number; topY: number; bottomY: number }>;
  /** Solid props (stand on top, blocked at the sides); their boxes are their visible art. */
  props: Array<{ kind: string; x: number; y: number; width: number; height: number }>;
  /** The floor's safe spot (also listed in `platforms`); its ladder is in `ropes`. */
  safeSpot: { x: number; y: number; width: number } | null;
}

/** Where one collision object's art was actually drawn, measured from rendered pixels. */
export interface E2eGeometryCheck {
  object: string;
  kind: 'ground' | 'platform' | 'exit' | 'rope' | 'prop';
  expectedTop: number;
  /** First pixel row (scanning around expectedTop) where the art covers most of the object. */
  drawnTop: number | null;
  expectedLeft: number;
  expectedRight: number;
  /** Outermost drawn columns along the object's surface row (platforms) or span (ropes). */
  drawnLeft: number | null;
  drawnRight: number | null;
  /** Ropes only: last drawn row. */
  expectedBottom: number | null;
  drawnBottom: number | null;
  /** Fraction of the object (columns for surfaces, rows for ropes) that has art. */
  coverage: number;
  /** Fraction of the object's art (drawn alone) that also appears in the real frame. */
  presentInFrame: number;
}

export interface E2eGeometryReport {
  ready: boolean;
  checks: E2eGeometryCheck[];
  /** Opaque geometry-layer pixels that belong to no collision object (art with nothing to stand on). */
  strayPixels: number;
  strayExample: string | null;
}

export interface E2eSnapshot {
  at: number;
  role: E2eRole;
  floor: number;
  floorTransitionTimer: number;
  godMode: boolean;
  player: E2ePlayerView | null;
  localAnimState: string;
  remotePlayers: E2eRemotePlayerView[];
  zombies: E2eZombieView[];
  corpses: number;
  corpseViews: E2eCorpseView[];
  worldDrops: number;
  /** Floor exit: stand on it (grounded) to finish the floor. */
  exit: { x: number; y: number; width: number };
  /** Corpses piled up under the exit. */
  exitPile: E2eExitPile;
  /** Players (local and remote, by id) resting on the safe spot: out of every attack's reach. */
  restingPlayerIds: string[];
  /** The live collision geometry of this floor (what physics uses). */
  level: E2eLevelView;
  drops: E2eDropView[];
  /** Ticks until the potion keys work again. */
  potionCooldownTicks: number;
  /** Ticks of post-hit invincibility left for the local player. */
  invincibilityFrames: number;
  vfx: E2eVfxCounts;
  pending: E2ePendingQueues;
  usableSkills: E2eSkillView[];
  activeSpecialEffects: string[];
  hasPendingSpecialDrop: boolean;
}

export interface E2eControls {
  setGodMode(enabled: boolean): void;
  /** Host/solo only: jumps the simulation to a floor. */
  setFloor(floor: number): void;
  levelUp(times: number): void;
  maxAllSkills(): void;
  maxOutPlayer(): void;
  selectClass(classId: string): void;
  activateSpecialDrop(type: string): void;
  isGameOver(): boolean;
}

export interface E2eEngineControls {
  /** Moves the local player (client-owned state, safe in multiplayer). */
  teleport(x: number, y: number): void;
  peekPendingVfx(): E2eVfxEventView[];
  /** Solo/host setup only: pin the run's layout seed (the current floor is rebuilt from it). */
  setLayoutSeed(seed: number): void;
  /** Measures the drawn level art against the collision geometry (see E2eGeometryReport). */
  geometryReport(): E2eGeometryReport;
  /** Solo/host setup only: drops N corpses from above x; they fall and pile up by the normal corpse physics. */
  dropCorpses(centerX: number, count: number): void;
}

export interface ZbE2eApi {
  version: 1;
  ready(): boolean;
  getState(): E2eSnapshot | null;
  getVfxLog(): E2eVfxLogEntry[];
  clearVfxLog(): void;
  engine: E2eEngineControls | null;
  controls: E2eControls | null;
}

declare global {
  interface Window {
    __zbE2e?: ZbE2eApi;
  }
}
