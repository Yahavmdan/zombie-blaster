import { ActiveBuff, CharacterState, ClassSkillTree, GAME_CONSTANTS, ZOMBIE_TYPES, SkillDefinition, TreeSkill, VfxEvent, getSkillTree, isZombieWindingUp, ownsTreeSkill } from '@shared/index';
import { ActiveSpecialEffect, DropType, SpecialDropType, BoulderState, CagePuzzleState, CageState, GadgetState, LooseProp, PlateState, SpringState, WorldDrop, ZombieCorpse, ZombieState, ZombieType } from '@shared/game-entities';
import { AcidPuddle, BoulderPuzzleLayout, CagePuzzleLayout, Platform, PlatePuzzleLayout, PlayerTint, Rope, SpitterProjectile, SpringPuzzleLayout } from '../engine/engine-types';
import { EXIT_CAGE, cageBox, cageSolid, cleatBox, isCut } from '../engine/cage-puzzle';
import { doorBox, isDoorOpen, isHeld, plateBox } from '../engine/plate-puzzle';
import { buttonBox, scaleBox } from '../engine/spring-puzzle';
import { measureLevelGeometry } from './geometry-report';
import { BoulderPath, boulderBox, boulderPath, gateBox } from '../engine/boulder-puzzle';
import { LevelLayout, pickableProps, Prop } from '../engine/level-generator';
import { parseLayout } from '../engine/level-editor';
import { Gadget } from '../engine/engine-types';
import { isSource, stateOf } from '../engine/gadgets';
import { isResting } from '../engine/prop-tumble';
import { CorpseSurface, corpseSurface } from '../engine/corpse-surface';
import { CorpseDrape, maxDrop } from '../engine/corpse-drape';
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
  E2eGadgetView,
  E2eCorpseView,
  E2eDropView,
  E2eSpitGlobView,
  E2eExitPile,
  E2eEngineControls,
  E2eGeometryReport,
  E2eLevelView,
  E2ePlayerView,
  E2eRemotePlayerView,
  E2eRole,
  E2eSkillView,
  E2eTreeSkillView,
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
    critRate: p.derived.critRate,
    level: p.level,
    isGrounded: p.isGrounded,
    isAttacking: p.isAttacking,
    isClimbing: p.isClimbing,
    isDoubleJumping: p.isDoubleJumping,
    isDead: p.isDead,
    isDown: p.isDown,
    isAfk: p === engine.player ? engine.isLocalAfk : p.isAfk === true,
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
    skillBar: [...(p.skillBar ?? [])],
    skillCharge: typeof p.skillCharge === 'number' ? p.skillCharge : null,
  };
}

function toZombieView(z: ZombieState, engine: GameEngine): E2eZombieView {
  const anim: { state: ZombieAnimState; frame: number } | null = engine.zombieSpriteAnimator.getInstanceFrame(z.id);
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
    eating: z.eatingTimer > 0,
    mealId: z.eatingTargetId,
    animState: anim ? anim.state : null,
    animFrame: anim ? anim.frame : null,
    stunTicks: z.stunTicks,
    ticksToHit: z.attackAnimTimer > 0 && !z.attackHasHit ? z.attackAnimTimer - ZOMBIE_TYPES[z.type].attackHitTick : null,
    knockbackFrames: z.knockbackFrames,
    angle: z.angle,
    isGrounded: z.isGrounded,
    velocityY: z.velocityY,
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

function drapeOf(engine: GameEngine, id: string): number | null {
  const drape: CorpseDrape | undefined = engine.corpseDrapes.get(id);
  return drape ? maxDrop(drape) : null;
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

/** Every layout prop where it is now: pickable ones as the game state has them. */
function propViews(engine: GameEngine): E2eLevelView['props'] {
  const pickable: Map<string, Prop> = pickableProps(engine.level);
  return engine.level.props.map((p: Prop): E2eLevelView['props'][number] => {
    const id: string | undefined = [...pickable].find(
      ([, q]: [string, Prop]): boolean => q === p,
    )?.[0];
    const loose: LooseProp | undefined = engine.looseProps.find(
      (q: LooseProp): boolean => q.id === id,
    );
    return {
      id: id ?? null,
      kind: p.kind,
      x: loose?.x ?? p.x,
      y: loose?.y ?? p.y,
      width: p.width,
      height: p.height,
      pickable: loose !== undefined,
      isGrounded: loose?.isGrounded ?? true,
      carrierId: loose?.carrierId ?? null,
      fuseTicks: loose?.fuseTicks ?? 0,
      // Every pickable prop stays in the game state for the floor unless it blew up.
      exploded: id !== undefined && loose === undefined,
      angle: loose?.angle ?? 0,
      resting: loose ? isResting(loose) : true,
    };
  });
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
    button: buttonBox(puzzle),
    buttonTicks: spring.buttonTicks,
    buttonRiseTicks: GAME_CONSTANTS.SPRING_BUTTON_RISE_TICKS,
    scale: scaleBox(puzzle),
    scaleKg: spring.scaleKg,
    scaleKgNeeded: GAME_CONSTANTS.SPRING_SCALE_KG_NEEDED,
    launches: spring.launches,
    countdownTicks: spring.countdownTicks,
    bounceTicks: spring.bounceTicks,
  };
}

function cagesView(engine: GameEngine): E2eCagePuzzleView | null {
  const puzzle: CagePuzzleLayout | null = engine.cagePuzzle;
  const cages: CagePuzzleState | null = engine.cages;
  if (!puzzle || !cages) return null;
  const exit: Platform = engine.exitPlatform;
  return {
    cages: cages.cages.map(
      (cage: CageState, i: number): E2eCageView => ({
        exit: i === EXIT_CAGE,
        content: puzzle.cages[i].content,
        box: cageBox(puzzle, i, cage, exit),
        solid: cageSolid(puzzle, i, cage, exit),
        landY: puzzle.cages[i].landY,
        cleat: cleatBox(puzzle, i),
        cleatHits: cage.cleatHits,
        cut: isCut(cage),
        fallTicks: cage.fallTicks,
        landed: cage.landed,
      }),
    ),
    hitsNeeded: GAME_CONSTANTS.CAGE_CLEAT_HITS,
    zombiesPerCage: GAME_CONSTANTS.CAGE_ZOMBIES,
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

  const tree: ClassSkillTree | null = player ? getSkillTree(player.classId) : null;
  const treeSkills: E2eTreeSkillView[] = (tree?.skills ?? []).map(
    (s: TreeSkill): E2eTreeSkillView => ({
      id: s.id,
      name: s.name,
      owned: player ? ownsTreeSkill(player.skillLevels, s.id) : false,
      barSlot: player?.skillBar?.indexOf(s.id) ?? -1,
      mechanic: s.mechanic,
      combo: s.combo,
      cooldownTicks: engine.skillCooldowns.get(s.id) ?? 0,
    }),
  );

  return {
    at: performance.now(),
    role: resolveRole(engine),
    afk: engine.isLocalAfk,
    floor: engine.floor,
    floorTransitionTimer: engine.floorTransitionTimer,
    godMode: engine.godMode,
    ticks: engine.simTicks,
    player: player ? toPlayerView(player, engine) : null,
    localAnimState: engine.spriteAnimator.getState(),
    remotePlayers,
    zombies: engine.zombies.map((z: ZombieState): E2eZombieView => toZombieView(z, engine)),
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
        angle: c.angle,
        animState: anim ? anim.state : null,
        frame: anim ? anim.frame : null,
        lastFrame: engine.zombieSpriteAnimator.getFrameCount(c.spriteKey, ZombieAnimState.Dead) - 1,
        carryPose: engine.carryPoses.get(c.id) ?? null,
        drape: drapeOf(engine, c.id),
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
      props: propViews(engine),
      safeSpot: safeSpotView(engine),
      walls: (engine.level.walls ?? []).map(
        (w: Platform): { x: number; y: number; width: number; height: number } => ({
          x: w.x,
          y: w.y,
          width: w.width,
          height: w.height,
        }),
      ),
    },
    puzzle: puzzleView(engine),
    spring: springView(engine),
    cages: cagesView(engine),
    plate: plateView(engine),
    gadgets: engine.gadgets.map((g: Gadget): E2eGadgetView => {
      const s: GadgetState | undefined = stateOf(engine.gadgetStates, g.id);
      return {
        id: g.id,
        kind: g.kind,
        box: { x: g.x, y: g.y, width: g.width, height: g.height },
        on: s?.on ?? false,
        kg: s?.kg ?? 0,
        hits: s?.hits ?? 0,
        broken: s?.broken ?? false,
        openTicks: s?.openTicks ?? 0,
        launches: s?.launches ?? 0,
        dropped: s?.dropped ?? false,
        landed: s?.landed ?? false,
        body: s?.body
          ? {
              x: s.body.x,
              y: s.body.y,
              vx: s.body.velocityX,
              vy: s.body.velocityY,
              grounded: s.body.isGrounded,
            }
          : null,
        targets: isSource(g) ? [...g.targets] : [],
      };
    }),
    exitLocked: engine.isExitLocked(),
    drops: engine.worldDrops.map(
      (d: WorldDrop): E2eDropView => ({ id: d.id, type: d.type, x: d.x, y: d.y, value: d.value }),
    ),
    zombieProjectiles: {
      spitter: engine.spitterProjectiles.length,
      dragon: engine.dragonProjectiles.length,
    },
    spitGlobs: engine.spitterProjectiles.map(
      (p: SpitterProjectile): E2eSpitGlobView => ({
        vx: p.velocityX,
        vy: p.velocityY,
        ticksFlown: GAME_CONSTANTS.SPITTER_PROJECTILE_LIFETIME - p.lifetime,
      }),
    ),
    acidPuddles: engine.acidPuddles.map((p: AcidPuddle): { x: number; y: number; width: number } => ({ x: p.x, y: p.y, width: p.width })),
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
      lightning: engine.lightning ? { ...engine.lightning } : null,
    },
    pending: {
      vfxEvents: engine.pendingVfxEvents.length,
      pullEvents: engine.pendingPullEvents.length,
      remoteAttacks: engine.pendingRemoteAttacks.length,
      reviveTargets: engine.pendingReviveTargetIds.length,
      specialDropActivations: engine.pendingSpecialDropActivations.length,
    },
    usableSkills,
    treeSkills,
    buffs: (player?.activeBuffs ?? []).map((b: ActiveBuff): { skillId: string; stat: string; value: number; remainingMs: number } => ({
      skillId: b.skillId, stat: b.stat, value: b.value, remainingMs: b.remainingMs,
    })),
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
  strikeLightningNow(): void {
    const engine: GameEngine | null = currentEngine;
    if (!engine || engine.isMultiplayerClient) return;
    engine.lightningTimerMs = 0;
  },
  spawnDrop(type: string, x: number, y: number, specialType: string | null): void {
    const engine: GameEngine | null = currentEngine;
    if (!engine) return;
    const special: boolean = type === DropType.Special;
    engine.worldDrops.push({
      id: `e2e-drop-${Date.now()}`,
      type: type as DropType,
      specialType: special ? (specialType as SpecialDropType) : undefined,
      x,
      y,
      velocityY: 0,
      value: type === DropType.Gold ? 10 : 0,
      lifetime: special ? GAME_CONSTANTS.SPECIAL_DROP_LIFETIME : GAME_CONSTANTS.DROP_LIFETIME,
      isGrounded: false,
    });
  },
  knockOut(): void {
    const engine: GameEngine | null = currentEngine;
    const p: CharacterState | null = engine?.player ?? null;
    if (!engine || !p) return;
    engine.godMode = false;
    engine.invincibilityFrames = 0;
    engine.applyIncomingZombieDamage(p.hp, 0, false);
  },
  setVitals(hp: number, mp: number): void {
    const engine: GameEngine | null = currentEngine;
    const p: CharacterState | null = engine?.player ?? null;
    if (!engine || !p) return;
    p.hp = Math.max(1, Math.min(hp, p.derived.maxHp));
    p.mp = Math.max(0, Math.min(mp, p.derived.maxMp));
    // The app's copy follows, as after a hit (potions check it before they heal).
    engine.onPlayerUpdate?.(p);
  },
  spawnRolledZombies(count: number): void {
    const engine: GameEngine | null = currentEngine;
    if (!engine || engine.isMultiplayerClient) return;
    for (let i: number = 0; i < count; i++) {
      engine.spawnRolledZombie();
    }
  },
  spawnZombieAt(x: number, type?: string): void {
    const engine: GameEngine | null = currentEngine;
    if (!engine || engine.isMultiplayerClient) return;
    const kind: ZombieType | null = (Object.values(ZombieType) as string[]).includes(type ?? '') ? (type as ZombieType) : null;
    engine.spawnZombieAt(x, kind);
  },
  clearZombies(): void {
    const engine: GameEngine | null = currentEngine;
    if (!engine || engine.isMultiplayerClient) return;
    for (const z of engine.zombies) z.isDead = true;
    engine.zombies = [];
  },
  dropCorpses(centerX: number, count: number): void {
    currentEngine?.dropCorpses(centerX, count);
  },
  clearPickables(from: number, to: number): void {
    const engine: GameEngine | null = currentEngine;
    if (!engine || engine.isMultiplayerClient) return;
    engine.clearLooseProps(
      engine.looseProps
        .filter((p: LooseProp): boolean => p.x < to && p.x + p.width > from)
        .map((p: LooseProp): string => p.id),
    );
  },
  dropProp(id: string, x: number, y: number): void {
    currentEngine?.dropLooseProp(id, x, y);
  },
  setLayoutSeed(seed: number): void {
    const engine: GameEngine | null = currentEngine;
    if (!engine || engine.isMultiplayerClient) return;
    engine.layoutSeed = seed;
    engine.applyLevel();
  },
  loadLayout(json: string): string | null {
    const engine: GameEngine | null = currentEngine;
    if (!engine) return 'No engine';
    const parsed: LevelLayout | { error: string } = parseLayout(json);
    if ('error' in parsed) return parsed.error;
    engine.useCustomLevel({ ...parsed, floor: engine.floor });
    return null;
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
        color: evt.color,
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
          color: evt.color,
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
        color: evt.color,
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
