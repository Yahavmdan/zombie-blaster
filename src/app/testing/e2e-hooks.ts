import { CharacterState, SkillDefinition, VfxEvent } from '@shared/index';
import { ActiveSpecialEffect, WorldDrop, ZombieCorpse, ZombieState } from '@shared/game-entities';
import { ZombieAnimState } from '../engine/zombie-sprite-animator';
import { GameEngine } from '../engine/game-engine';
import { SpriteAnimator } from '../engine/sprite-animator';
import {
  E2eControls,
  E2eCorpseView,
  E2eDropView,
  E2eEngineControls,
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

function toPlayerView(p: CharacterState): E2ePlayerView {
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
    unallocatedStatPoints: p.unallocatedStatPoints,
    unallocatedSkillPoints: p.unallocatedSkillPoints,
    xp: p.xp,
    xpToNext: p.xpToNext,
    skillLevels: { ...p.skillLevels },
    gold: p.inventory.gold,
    potions: { ...p.inventory.potions },
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

function buildSnapshot(engine: GameEngine): E2eSnapshot {
  const player: CharacterState | null = engine.player;
  const remotePlayers: E2eRemotePlayerView[] = engine.remotePlayers.map(
    (rp: CharacterState): E2eRemotePlayerView => {
      const animator: SpriteAnimator | undefined = engine.remotePlayerAnimators.get(rp.id);
      return { ...toPlayerView(rp), animState: animator ? animator.getState() : null };
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
    player: player ? toPlayerView(player) : null,
    localAnimState: engine.spriteAnimator.getState(),
    remotePlayers,
    zombies: engine.zombies.map(toZombieView),
    corpses: engine.zombieCorpses.length,
    corpseViews: engine.zombieCorpses.map((c: ZombieCorpse): E2eCorpseView => {
      const anim: { state: ZombieAnimState; frame: number } | null =
        engine.zombieSpriteAnimator.getInstanceFrame(c.id);
      return {
        id: c.id,
        x: c.x,
        y: c.y,
        isGrounded: c.isGrounded,
        frozen: c.frozen,
        facing: c.facing,
        animState: anim ? anim.state : null,
        frame: anim ? anim.frame : null,
        lastFrame: engine.zombieSpriteAnimator.getFrameCount(c.spriteKey, ZombieAnimState.Dead) - 1,
      };
    }),
    worldDrops: engine.worldDrops.length,
    exit: { x: engine.exitPlatform.x, y: engine.exitPlatform.y, width: engine.exitPlatform.width },
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
