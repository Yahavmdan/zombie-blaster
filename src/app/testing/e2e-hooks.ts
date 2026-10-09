import { CharacterState, GAME_CONSTANTS, SkillDefinition, VfxEvent, isZombieWindingUp } from '@shared/index';
import { ActiveSpecialEffect, BoulderState, CagePuzzleState, CageState, PlateState, SpringState, WorldDrop, ZombieCorpse, ZombieState, ZombieType } from '@shared/game-entities';
import { BoulderPuzzleLayout, CagePuzzleLayout, Platform, PlatePuzzleLayout, PlayerTint, Rope, SpringPuzzleLayout } from '../engine/engine-types';
import { CageId, cageBox, cageSolid, cleatBox, isCut } from '../engine/cage-puzzle';
import { doorBox, isDoorOpen, isHeld, plateBox } from '../engine/plate-puzzle';
import { chargeCorpses, leverBox } from '../engine/spring-puzzle';
import { measureLevelGeometry } from './geometry-report';
import { BoulderPath, boulderBox, boulderPath, gateBox } from '../engine/boulder-puzzle';
import { Prop } from '../engine/level-generator';
import { CorpseSurface, corpseSurface } from '../engine/corpse-surface';
import { magnetPullProgress } from '../engine/magnet-pull';
import { ZombieAnimState } from '../engine/zombie-sprite-animator';
import { GameEngine } from '../engine/game-engine';
import { SpriteAnimator } from '../engine/sprite-animator';
import {
  E2eBoulderPuzzleView,
  E2eCagePuzzleView,
  E2eCageView,
  E2ePlateView,
  E2eSpringView,
  E2eControls,
  E2eCorpseView,
  E2eDropView,
  E2eExitPile,
  E2eEngineControls,
  E2eGeometryReport,
  E2ePlayerView,
  E2eRemotePlayerView,
  E2eRole,
  E2eSkillView,
  E2eSnapshot,
  E2eVfxEventView,
  E2eVfxLogEntry,
  E2eZombieView,
  ZbE2eApi,
} from './e2e-api';

/**
 * Dev-build-only probe for the Playwright suite (`e2e/`).
 * Read-mostly: it snapshots engine state and records VFX sent/replayed over the network.
 * Never call these from production code paths; callers gate on `isDevMode()`.
 */

type EngineSnapshot = ReturnType<GameEngine['getStateSnapshot']>;

interface VfxCounters {
  particles: number;
  damageNumbers: number;
  hitMarks: number;
  spriteEffects: number;
}

const MAX_VFX_LOG_ENTRIES: number = 2000;

let currentEngine: GameEngine | null = null;
let currentControls: E2eControls | null = null;
let vfxLog: E2eVfxLogEntry[] = [];
let vfxSeq: number = 0;

function pushLog(entry: Omit<E2eVfxLogEntry, 'seq' | 'at'>): void {
  vfxSeq++;
  vfxLog.push({ ...entry, seq: vfxSeq, at: performance.now() });
  if (vfxLog.length > MAX_VFX_LOG_ENTRIES) {
    vfxLog = vfxLog.slice(vfxLog.length - MAX_VFX_LOG_ENTRIES);
  }
}

function readCounters(engine: GameEngine): VfxCounters {
  return {
    particles: engine.particles.length,
    damageNumbers: engine.damageNumbers.length,
    hitMarks: engine.hitMarks.length,
    spriteEffects: engine.spriteEffectSystem.getActiveEffectIds().length,
  };
}

function toPlayerView(p: CharacterState, engine: GameEngine): E2ePlayerView {
  const tint: PlayerTint | undefined = engine.playerTints.get(p.id);
  return {
    id: p.id,
    name: p.name,
    classId: p.classId,
    x: p.x,
    y: p.y,
    velocityX: p.velocityX,
    velocityY: p.velocityY,
    facing: p.facing,
    hp: p.hp,
    maxHp: p.derived.maxHp,
    mp: p.mp,
    maxMp: p.derived.maxMp,
    level: p.level,
    isGrounded: p.isGrounded,
    isAttacking: p.isAttacking,
    isClimbing: p.isClimbing,
    isDoubleJumping: p.isDoubleJumping,
    isDead: p.isDead,
    isDown: p.isDown,
    downTimer: p.downTimer,
    unallocatedStatPoints: p.unallocatedStatPoints,
    unallocatedSkillPoints: p.unallocatedSkillPoints,
    xp: p.xp,
    xpToNext: p.xpToNext,
    skillLevels: { ...p.skillLevels },
    gold: p.inventory.gold,
    potions: { ...p.inventory.potions },
    carryingCorpseIds: [...(p.carryingCorpseIds ?? [])],
    tint: { hurtTicks: tint?.hurtTicks ?? 0, poisonTicks: tint?.poisonTicks ?? 0 },
  };
}

function toZombieView(z: ZombieState): E2eZombieView {
  return {
    id: z.id,
    type: z.type,
    x: z.x,
    y: z.y,
    width: z.instanceWidth,
    height: z.instanceHeight,
    hp: z.hp,
    maxHp: z.maxHp,
    isDead: z.isDead,
    spawnTimer: z.spawnTimer,
    facing: z.facing,
    isAttacking: z.attackAnimTimer > 0,
    windingUp: isZombieWindingUp(z),
    magnetPull: magnetPullProgress(z),
    attackCooldown: z.attackCooldown,
  };
}

function toVfxEventView(evt: VfxEvent): E2eVfxEventView {
  return {
    type: evt.type,
    playerId: evt.playerId,
    x: evt.x,
    y: evt.y,
    animationKey: evt.animationKey,
  };
}

function resolveRole(engine: GameEngine): E2eRole {
  if (engine.isMultiplayerHost) return 'host';
  if (engine.isMultiplayerClient) return 'client';
  return 'solo';
}

/** The pile under the exit, measured from the ordinary corpses lying there. */
function exitPile(engine: GameEngine): E2eExitPile {
  const exit: Platform = engine.exitPlatform;
  const columnLeft: number = exit.x;
  const columnRight: number = exit.x + exit.width;
  // The pile stands on the ground, or on a puzzle block standing on it under the exit (the landed cage).
  const blocks: Platform[] = engine.platforms.filter(
    (p: Platform): boolean =>
      p.puzzlePart !== undefined &&
      p.y + p.height === GAME_CONSTANTS.GROUND_Y &&
      p.x + p.width > columnLeft &&
      p.x < columnRight,
  );
  const baseY: number = Math.min(GAME_CONSTANTS.GROUND_Y, ...blocks.map((p: Platform): number => p.y));
  const footholds: CorpseSurface[] = engine.zombieCorpses
    .filter((c: ZombieCorpse): boolean => c.isGrounded)
    .map(corpseSurface)
    .filter((f: CorpseSurface): boolean => f.x + f.width > columnLeft && f.x < columnRight);
  const topY: number = Math.min(baseY, ...footholds.map((f: CorpseSurface): number => f.y));
  const reachY: number = exit.y + GAME_CONSTANTS.EXIT_REACH_PX;
  return {
    columnLeft,
    columnRight,
    centerX: (columnLeft + columnRight) / 2,
    baseY,
    topY,
    reachY,
    bodies: footholds.length,
    reachable: topY <= reachY,
  };
}

function safeSpotView(engine: GameEngine): { x: number; y: number; width: number } | null {
  const spot: Platform | undefined = engine.platforms.find((p: Platform): boolean => p.safe === true);
  return spot ? { x: spot.x, y: spot.y, width: spot.width } : null;
}

function puzzleView(engine: GameEngine): E2eBoulderPuzzleView | null {
  const puzzle: BoulderPuzzleLayout | null = engine.boulderPuzzle;
  const boulder: BoulderState | null = engine.boulder;
  if (!puzzle || !boulder) return null;
  const ledge: Platform = engine.exitPlatform;
  const path: BoulderPath = boulderPath(puzzle, ledge.y);
  return {
    wall: { x: puzzle.wall.x, y: puzzle.wall.y, width: puzzle.wall.width, height: puzzle.wall.height },
    wallDir: puzzle.wallDir,
    ledge: { x: ledge.x, y: ledge.y, width: ledge.width },
    gate: gateBox(puzzle, ledge.y),
    gateHits: boulder.gateHits,
    gateHitsNeeded: GAME_CONSTANTS.BOULDER_GATE_HITS,
    boulder: boulderBox(boulder, path),
    progress: boulder.progress,
    pathLength: path.length,
    speed: boulder.speed,
    wallBroken: boulder.wallBroken,
    wallStanding: engine.puzzleWall() !== null,
  };
}

function springView(engine: GameEngine): E2eSpringView | null {
  const puzzle: SpringPuzzleLayout | null = engine.springPuzzle;
  const spring: SpringState | null = engine.spring;
  if (!puzzle || !spring) return null;
  const block: Platform = puzzle.spring;
  return {
    spring: { x: block.x, y: block.y, width: block.width, height: block.height },
    side: puzzle.side,
    lever: leverBox(puzzle),
    charge: chargeCorpses(engine.zombieCorpses, puzzle).length,
    chargeNeeded: GAME_CONSTANTS.SPRING_CHARGE_CORPSES,
    launches: spring.launches,
    countdownTicks: spring.countdownTicks,
    bounceTicks: spring.bounceTicks,
    wobbleTicks: spring.wobbleTicks,
  };
}

function cagesView(engine: GameEngine): E2eCagePuzzleView | null {
  const puzzle: CagePuzzleLayout | null = engine.cagePuzzle;
  const cages: CagePuzzleState | null = engine.cages;
  if (!puzzle || !cages) return null;
  const view: (id: CageId) => E2eCageView = (id: CageId): E2eCageView => {
    const cage: CageState = cages[id];
    return {
      box: cageBox(puzzle, id, cage, engine.exitPlatform),
      solid: cageSolid(puzzle, id, cage, engine.exitPlatform),
      cleat: cleatBox(puzzle, id),
      cleatHits: cage.cleatHits,
      cut: isCut(cage),
      fallTicks: cage.fallTicks,
      landed: cage.landed,
    };
  };
  return {
    exitCage: view('exitCage'),
    zombieCage: view('zombieCage'),
    hitsNeeded: GAME_CONSTANTS.CAGE_CLEAT_HITS,
    zombiesReleased: GAME_CONSTANTS.CAGE_ZOMBIES,
  };
}

function plateView(engine: GameEngine): E2ePlateView | null {
  const puzzle: PlatePuzzleLayout | null = engine.platePuzzle;
  const plate: PlateState | null = engine.plate;
  if (!puzzle || !plate) return null;
  return {
    box: plateBox(puzzle),
    weight: plate.weight,
    needed: GAME_CONSTANTS.PLATE_WEIGHT_NEEDED,
    playerWeight: GAME_CONSTANTS.PLATE_PLAYER_WEIGHT,
    held: isHeld(plate),
    doorTicks: plate.doorTicks,
    doorOpen: isDoorOpen(plate),
    door: doorBox(engine.exitPlatform),
  };
}

function buildSnapshot(engine: GameEngine): E2eSnapshot {
  const player: CharacterState | null = engine.player;
  const remotePlayers: E2eRemotePlayerView[] = engine.remotePlayers.map(
    (rp: CharacterState): E2eRemotePlayerView => {
      const animator: SpriteAnimator | undefined = engine.remotePlayerAnimators.get(rp.id);
      return { ...toPlayerView(rp, engine), animState: animator ? animator.getState() : null };
    },
  );
  const usableSkills: E2eSkillView[] = engine.playerUsableSkills.map(
    (s: SkillDefinition, index: number): E2eSkillView => ({
      id: s.id,
      name: s.name,
      slot: index + 1,
      type: s.type,
      mechanic: s.mechanic,
      animationKey: s.animationKey,
      level: player?.skillLevels[s.id] ?? 0,
      cooldownTicks: engine.skillCooldowns.get(s.id) ?? 0,
    }),
  );

  return {
    at: performance.now(),
    role: resolveRole(engine),
    floor: engine.floor,
    floorTransitionTimer: engine.floorTransitionTimer,
    godMode: engine.godMode,
    player: player ? toPlayerView(player, engine) : null,
    localAnimState: engine.spriteAnimator.getState(),
    remotePlayers,
    zombies: engine.zombies.map(toZombieView),
    corpses: engine.zombieCorpses.length,
    corpseViews: engine.zombieCorpses.map((c: ZombieCorpse): E2eCorpseView => {
      const foothold: CorpseSurface = corpseSurface(c);
      const anim: { state: ZombieAnimState; frame: number } | null =
        engine.zombieSpriteAnimator.getInstanceFrame(c.id);
      return {
        id: c.id,
        x: c.x,
        y: c.y,
        isGrounded: c.isGrounded,
        frozen: c.frozen,
        carrierId: c.carrierId,
        footX: foothold.x,
        footWidth: foothold.width,
        footY: foothold.y,
        facing: c.facing,
        animState: anim ? anim.state : null,
        frame: anim ? anim.frame : null,
        lastFrame: engine.zombieSpriteAnimator.getFrameCount(c.spriteKey, ZombieAnimState.Dead) - 1,
        carryPose: engine.carryPoses.get(c.id) ?? null,
      };
    }),
    worldDrops: engine.worldDrops.length,
    exit: { x: engine.exitPlatform.x, y: engine.exitPlatform.y, width: engine.exitPlatform.width },
    exitPile: exitPile(engine),
    restingPlayerIds: [...(player ? [player] : []), ...engine.remotePlayers]
      .filter((pl: CharacterState): boolean => engine.isInSafeSpot(pl.x, pl.y))
      .map((pl: CharacterState): string => pl.id),
    level: {
      seed: engine.layoutSeed,
      platforms: engine.platforms
        .filter((p: Platform): boolean => p.y !== GAME_CONSTANTS.GROUND_Y && !p.solid)
        .map((p: Platform): { x: number; y: number; width: number; height: number } => ({
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
        })),
      ropes: engine.ropes.map((r: Rope): { x: number; topY: number; bottomY: number } => ({
        x: r.x,
        topY: r.topY,
        bottomY: r.bottomY,
      })),
      props: engine.level.props.map(
        (p: Prop): { kind: string; x: number; y: number; width: number; height: number } => ({
          kind: p.kind,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
        }),
      ),
      safeSpot: safeSpotView(engine),
    },
    puzzle: puzzleView(engine),
    spring: springView(engine),
    cages: cagesView(engine),
    plate: plateView(engine),
    drops: engine.worldDrops.map(
      (d: WorldDrop): E2eDropView => ({ id: d.id, type: d.type, x: d.x, y: d.y, value: d.value }),
    ),
    potionCooldownTicks: engine.potionCooldown,
    invincibilityFrames: engine.invincibilityFrames,
    vfx: {
      particles: engine.particles.length,
      damageNumbers: engine.damageNumbers.length,
      hitMarks: engine.hitMarks.length,
      dragonImpacts: engine.dragonImpacts.length,
      playerProjectiles: engine.playerProjectiles.length,
      spriteEffects: engine.spriteEffectSystem.getActiveEffectIds(),
      screenShakeFrames: engine.screenShakeFrames,
      screenFlashFrames: engine.screenFlashFrames,
    },
    pending: {
      vfxEvents: engine.pendingVfxEvents.length,
      pullEvents: engine.pendingPullEvents.length,
      remoteAttacks: engine.pendingRemoteAttacks.length,
      reviveTargets: engine.pendingReviveTargetIds.length,
      specialDropActivations: engine.pendingSpecialDropActivations.length,
    },
    usableSkills,
    activeSpecialEffects: engine.activeSpecialEffects.map(
      (e: ActiveSpecialEffect): string => e.type,
    ),
    hasPendingSpecialDrop: engine.hasPendingSpecialDrop(),
  };
}

const engineControls: E2eEngineControls = {
  teleport(x: number, y: number): void {
    const p: CharacterState | null = currentEngine?.player ?? null;
    if (!p) return;
    p.x = x;
    p.y = y;
    p.velocityX = 0;
    p.velocityY = 0;
  },
  dropCorpses(centerX: number, count: number): void {
    const engine: GameEngine | null = currentEngine;
    if (!engine || engine.isMultiplayerClient) return;
    const width: number = 30;
    const height: number = 41;
    const spriteKey: string = engine.zombieSpriteAnimator.getSpriteKey(ZombieType.Walker);
    for (let i: number = 0; i < count; i++) {
      const id: string = `e2e-corpse-${Date.now()}-${i}`;
      // Staggered above the screen top, a little scattered: they land one by one, like the slain.
      const jitter: number = (Math.random() - 0.5) * 24;
      engine.zombieCorpses.push({
        id,
        type: ZombieType.Walker,
        x: centerX - width / 2 + jitter,
        y: -height - i * 60,
        width,
        height,
        spriteKey,
        facing: Math.random() < 0.5 ? -1 : 1,
        velocityX: 0,
        velocityY: 0,
        isGrounded: false,
        frozen: false,
        landProcessed: false,
        fadeTimer: GAME_CONSTANTS.ZOMBIE_CORPSE_LINGER_TICKS,
        maxFadeTimer: GAME_CONSTANTS.ZOMBIE_CORPSE_LINGER_TICKS,
        showBlood: false,
        carrierId: null,
      });
      engine.zombieSpriteAnimator.setState(id, ZombieAnimState.Dead);
    }
  },
  setLayoutSeed(seed: number): void {
    const engine: GameEngine | null = currentEngine;
    if (!engine || engine.isMultiplayerClient) return;
    engine.layoutSeed = seed;
    engine.applyLevel();
  },
  geometryReport(): E2eGeometryReport {
    return currentEngine
      ? measureLevelGeometry(currentEngine)
      : { ready: false, checks: [], strayPixels: 0, strayExample: null };
  },
  peekPendingVfx(): E2eVfxEventView[] {
    return currentEngine ? currentEngine.pendingVfxEvents.map(toVfxEventView) : [];
  },
};

function ensureApi(): void {
  if (window.__zbE2e) return;
  const api: ZbE2eApi = {
    version: 1,
    ready(): boolean {
      return currentEngine !== null && currentEngine.player !== null && currentControls !== null;
    },
    getState(): E2eSnapshot | null {
      return currentEngine ? buildSnapshot(currentEngine) : null;
    },
    getVfxLog(): E2eVfxLogEntry[] {
      return [...vfxLog];
    },
    clearVfxLog(): void {
      vfxLog = [];
    },
    get engine(): E2eEngineControls | null {
      return currentEngine ? engineControls : null;
    },
    get controls(): E2eControls | null {
      return currentControls;
    },
  };
  window.__zbE2e = api;
}

export function attachEngineProbe(engine: GameEngine): () => void {
  currentEngine = engine;
  vfxLog = [];

  const originalReplay: (events: VfxEvent[]) => void = engine.replayRemoteVfxEvents.bind(engine);
  const originalSnapshot: () => EngineSnapshot = engine.getStateSnapshot.bind(engine);
  const originalDiscard: () => void = engine.discardOutboundEvents.bind(engine);

  engine.replayRemoteVfxEvents = (events: VfxEvent[]): void => {
    const myId: string = engine.player?.id ?? '';
    for (const evt of events) {
      const before: VfxCounters = readCounters(engine);
      originalReplay([evt]);
      const after: VfxCounters = readCounters(engine);
      pushLog({
        direction: 'replayed',
        type: evt.type,
        playerId: evt.playerId,
        animationKey: evt.animationKey,
        skippedOwn: evt.playerId === myId,
        particlesAdded: after.particles - before.particles,
        damageNumbersAdded: after.damageNumbers - before.damageNumbers,
        hitMarksAdded: after.hitMarks - before.hitMarks,
        spriteEffectsAdded: after.spriteEffects - before.spriteEffects,
      });
    }
  };

  engine.getStateSnapshot = (): EngineSnapshot => {
    const snapshot: EngineSnapshot = originalSnapshot();
    if (snapshot) {
      for (const evt of snapshot.vfxEvents) {
        pushLog({
          direction: 'sent',
          type: evt.type,
          playerId: evt.playerId,
          animationKey: evt.animationKey,
        });
      }
    }
    return snapshot;
  };

  engine.discardOutboundEvents = (): void => {
    for (const evt of engine.pendingVfxEvents) {
      pushLog({
        direction: 'discarded',
        type: evt.type,
        playerId: evt.playerId,
        animationKey: evt.animationKey,
      });
    }
    originalDiscard();
  };

  ensureApi();

  return (): void => {
    engine.replayRemoteVfxEvents = originalReplay;
    engine.getStateSnapshot = originalSnapshot;
    engine.discardOutboundEvents = originalDiscard;
    if (currentEngine === engine) {
      currentEngine = null;
    }
  };
}

export function attachGameControls(controls: E2eControls): () => void {
  currentControls = controls;
  ensureApi();
  return (): void => {
    if (currentControls === controls) {
      currentControls = null;
    }
  };
}
