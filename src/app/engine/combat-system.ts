import {
  ActiveBuff,
  CharacterState,
  Direction,
  GAME_CONSTANTS,
  SKILLS,
  SkillDefinition,
  SkillType,
  VfxEventType,
  getSkillDamageMultiplier,
  getSkillMpCost,
  getSkillHpCost,
  getSkillCooldown,
  getSkillRange,
  getSkillStunDurationMs,
  getBuffEffectValue,
  getBuffDurationMs,
  getPassiveEffectValue,
  getAutoPotionSuccessChance,
  PassiveEffect,
  getPotionRestoreAmount,
  resolveAutoPotionId,
} from '@shared/index';
import { ZombieState, ZombieType } from '@shared/game-entities';
import { ZombieCorpse } from '@shared/game-entities';
import { DashPhaseState, IGameEngine } from './engine-types';
import { Particle, ParticleShape, FadeMode } from './particle-types';
import { PhysicsSystem } from './physics-system';
import { VfxSystem } from './vfx-system';
import { DropSystem } from './drop-system';
import { ZombieAnimState } from './zombie-sprite-animator';

export class CombatSystem {
  private clientDamageEvents: Array<{ zombieId: string; damage: number; killed: boolean }> = [];

  constructor(
    private readonly e: IGameEngine,
    private readonly physics: PhysicsSystem,
    private readonly vfx: VfxSystem,
    private readonly drops: DropSystem,
  ) {}

  updateAttackTiming(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    if (this.e.attackHitPending) {
      this.e.attackHitDelay--;
      if (this.e.attackHitDelay <= 0) {
        this.e.attackHitPending = false;
        this.resolveAttackHit();
      }
    }

    if (this.e.attackAnimTicks > 0) {
      this.e.attackAnimTicks--;
      if (this.e.attackAnimTicks <= 0) {
        p.isAttacking = false;
      }
    }
  }

  performAttack(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    p.isAttacking = true;
    this.e.attackAnimTicks = Math.ceil(GAME_CONSTANTS.PLAYER_ATTACK_ANIM_MS / this.e.fixedDt);
    this.e.attackHitDelay = Math.ceil(GAME_CONSTANTS.PLAYER_ATTACK_HIT_DELAY_MS / this.e.fixedDt);
    this.e.attackHitPending = true;
    this.e.spriteAnimator.restart();
  }

  private resolveAttackHit(): void {
    const p: CharacterState | null = this.e.player;
    if (!p || p.isDead) return;

    const attackRange: number = GAME_CONSTANTS.PLAYER_BASE_ATTACK_RANGE;
    const attackW: number = GAME_CONSTANTS.PLAYER_WIDTH + attackRange;
    const attackX: number = p.facing === Direction.Right
      ? p.x
      : p.x - attackRange;

    const playerCx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    let closest: ZombieState | null = null;
    let closestDist: number = Infinity;

    for (const z of this.e.zombies) {
      if (z.isDead || z.spawnTimer > 0) continue;
      if (this.physics.rectsOverlap(attackX, p.y, attackW, GAME_CONSTANTS.PLAYER_HEIGHT, z.x, z.y, z.instanceWidth, z.instanceHeight)) {
        const dist: number = Math.abs((z.x + z.instanceWidth / 2) - playerCx);
        if (dist < closestDist) {
          closestDist = dist;
          closest = z;
        }
      }
    }

    if (closest) {
      const isCrit: boolean = Math.random() * 100 < p.derived.critRate;
      const specialDmgMult: number = this.drops.getEffectiveDamageMultiplier();
      let damage: number = Math.max(1, Math.floor((p.derived.attack + Math.floor(Math.random() * 5)) * specialDmgMult));
      if (isCrit) damage = Math.max(1, Math.floor(damage * p.derived.critDamage / 100));

      closest.hp -= damage;
      this.collectDamageEvent(closest.id, damage, closest.hp <= 0);
      this.applyZombieKnockback(closest);
      this.vfx.spawnHitParticles(closest.x + closest.instanceWidth / 2, closest.y + closest.instanceHeight / 2, '#ff4444');
      this.vfx.spawnDamageNumber(closest.x + closest.instanceWidth / 2, closest.y - 10, damage, isCrit, isCrit ? '#ffaa00' : '#ffffff');
      this.vfx.spawnHitMark(closest.x + closest.instanceWidth / 2, closest.y + closest.instanceHeight / 2);

      if (closest.hp <= 0) {
        this.handleZombieDeath(closest);
      }
    }

    this.e.zombies = this.e.zombies.filter((z: ZombieState) => !z.isDead);
    this.e.onZombiesUpdate?.(this.e.zombies);
    this.flushDamageEvents();
  }

  tryPerformSkill(slotIndex: number): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    if (this.e.playerStunTicks > 0) return;

    const skill: SkillDefinition | undefined = this.e.playerUsableSkills[slotIndex];
    if (!skill) return;

    const skillLevel: number = p.skillLevels[skill.id] ?? 0;
    if (skillLevel <= 0) return;

    const remaining: number = this.e.skillCooldowns.get(skill.id) ?? 0;
    if (remaining > 0) return;

    const mpCost: number = getSkillMpCost(skill, skillLevel);
    const hpCostRaw: number = getSkillHpCost(skill, skillLevel);
    const cooldownMs: number = getSkillCooldown(skill, skillLevel);

    const hpCost: number = skill.hpCostIsPercent
      ? Math.floor(p.derived.maxHp * (hpCostRaw / 100))
      : hpCostRaw;

    if (!this.e.godMode) {
      if (skill.minHpPercent > 0) {
        const hpPercent: number = (p.hp / p.derived.maxHp) * 100;
        if (hpPercent <= skill.minHpPercent) return;
      }
      if (p.mp < mpCost) return;
      if (hpCost > 0 && p.hp <= hpCost) return;
      p.mp -= mpCost;
      if (hpCost > 0) p.hp -= hpCost;
    }
    this.e.skillCooldowns.set(skill.id, Math.floor(cooldownMs / this.e.fixedDt));

    const playerCX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const playerCY: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;

    if (skill.type === SkillType.Buff) {
      this.vfx.triggerSkillAnimation(skill.animationKey, playerCX, playerCY, p.facing, skillLevel);
      this.pushSkillAnimationEvent(skill.animationKey, playerCX, playerCY, p.facing, skillLevel);
      this.activateBuff(skill, skillLevel);
      this.e.onPlayerUpdate?.(p);
      return;
    }

    if (skill.mechanic === 'pull') {
      this.performPullSkill(skill, skillLevel, playerCX, playerCY);
      return;
    }

    if (skill.mechanic === 'dash') {
      this.performDashSkill(skill, skillLevel, playerCX, playerCY);
      return;
    }

    if (skill.mechanic === 'doubleJump') {
      this.performDoubleJump(skill, skillLevel, playerCX, playerCY);
      return;
    }

    const damageMultiplier: number = getSkillDamageMultiplier(skill, skillLevel);
    const range: number = getSkillRange(skill, skillLevel);

    const isHeal: boolean = damageMultiplier < 0;
    if (isHeal) {
      this.vfx.triggerSkillAnimation(skill.animationKey, playerCX, playerCY, p.facing, skillLevel);
      this.pushSkillAnimationEvent(skill.animationKey, playerCX, playerCY, p.facing, skillLevel);
      const healAmount: number = Math.floor(Math.abs(damageMultiplier) * p.derived.attack);
      p.hp = Math.min(p.hp + healAmount, p.derived.maxHp);
      this.vfx.spawnDamageNumber(playerCX, p.y - 10, healAmount, false, '#44ff44');
      this.e.pendingVfxEvents.push({
        type: VfxEventType.DamageNumber,
        playerId: p.id,
        x: playerCX,
        y: p.y - 10,
        value: healAmount,
        isCrit: false,
        color: '#44ff44',
      });
      this.e.onPlayerUpdate?.(p);
      return;
    }

    p.isAttacking = true;
    setTimeout((): void => {
      if (this.e.player) this.e.player.isAttacking = false;
    }, GAME_CONSTANTS.PLAYER_SKILL_ANIM_MS);

    const attackX: number = p.facing === Direction.Right
      ? p.x
      : p.x - range;

    const attackCenterX: number = p.facing === Direction.Right
      ? p.x + GAME_CONSTANTS.PLAYER_WIDTH + range / 2
      : p.x - range / 2;
    const attackCenterY: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    this.vfx.triggerSkillAnimation(skill.animationKey, attackCenterX, attackCenterY, p.facing, skillLevel);
    this.pushSkillAnimationEvent(skill.animationKey, attackCenterX, attackCenterY, p.facing, skillLevel);
    const attackW: number = GAME_CONSTANTS.PLAYER_WIDTH + range;
    const attackH: number = range > 100 ? GAME_CONSTANTS.PLAYER_HEIGHT * 2 : GAME_CONSTANTS.PLAYER_HEIGHT;
    const attackY: number = range > 100 ? p.y - GAME_CONSTANTS.PLAYER_HEIGHT / 2 : p.y;

    const skillColor: string = skill.color;
    const isSingleTarget: boolean = skill.aoeRadius <= 0;

    if (isSingleTarget) {
      const playerCx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
      let closest: ZombieState | null = null;
      let closestDist: number = Infinity;

      for (const z of this.e.zombies) {
        if (z.isDead || z.spawnTimer > 0) continue;
        if (this.physics.rectsOverlap(attackX, attackY, attackW, attackH, z.x, z.y, z.instanceWidth, z.instanceHeight)) {
          const dist: number = Math.abs((z.x + z.instanceWidth / 2) - playerCx);
          if (dist < closestDist) {
            closestDist = dist;
            closest = z;
          }
        }
      }

      if (closest) {
        this.applySkillDamageToZombie(closest, damageMultiplier, skillColor);
      }
    } else {
      let hitCount: number = 0;
      const targetCap: number = skill.maxTargets > 0 ? skill.maxTargets : Infinity;
      for (const z of this.e.zombies) {
        if (z.isDead || z.spawnTimer > 0) continue;
        if (hitCount >= targetCap) break;
        if (this.physics.rectsOverlap(attackX, attackY, attackW, attackH, z.x, z.y, z.instanceWidth, z.instanceHeight)) {
          this.applySkillDamageToZombie(z, damageMultiplier, skillColor);
          hitCount++;
        }
      }
    }

    const stunMs: number = getSkillStunDurationMs(skill, skillLevel);
    if (stunMs > 0) {
      this.e.playerStunTicks = Math.floor(stunMs / this.e.fixedDt);
    }

    this.e.zombies = this.e.zombies.filter((z: ZombieState) => !z.isDead);
    this.e.onZombiesUpdate?.(this.e.zombies);
    this.flushDamageEvents();
  }

  private applySkillDamageToZombie(z: ZombieState, damageMultiplier: number, skillColor: string): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    const isCrit: boolean = Math.random() * 100 < p.derived.critRate;
    const specialDmgMult: number = this.drops.getEffectiveDamageMultiplier();
    let damage: number = Math.max(1, Math.floor(p.derived.attack * damageMultiplier * specialDmgMult) + Math.floor(Math.random() * 5));
    if (isCrit) damage = Math.max(1, Math.floor(damage * p.derived.critDamage / 100));

    z.hp -= damage;
    this.collectDamageEvent(z.id, damage, z.hp <= 0);
    this.applyZombieKnockback(z);
    this.vfx.spawnHitParticles(z.x + z.instanceWidth / 2, z.y + z.instanceHeight / 2, skillColor);
    this.vfx.spawnDamageNumber(z.x + z.instanceWidth / 2, z.y - 10, damage, isCrit, isCrit ? '#ffaa00' : skillColor);
    this.vfx.spawnHitMark(z.x + z.instanceWidth / 2, z.y + z.instanceHeight / 2);

    if (z.hp <= 0) {
      this.handleZombieDeath(z);
    }
  }

  private performPullSkill(skill: SkillDefinition, skillLevel: number, playerCX: number, playerCY: number): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    const rangePercent: number = getSkillRange(skill, skillLevel);
    const pullRange: number = rangePercent * 4;

    this.vfx.triggerSkillAnimation(skill.animationKey, playerCX, playerCY, p.facing, skillLevel);
    this.pushSkillAnimationEvent(skill.animationKey, playerCX, playerCY, p.facing, skillLevel);

    const spreadHalf: number = GAME_CONSTANTS.PLAYER_WIDTH * 2;
    let pulledCount: number = 0;

    for (const z of this.e.zombies) {
      if (z.isDead || z.spawnTimer > 0) continue;
      if (z.type === ZombieType.Boss || z.type === ZombieType.DragonBoss) continue;

      const zCX: number = z.x + z.instanceWidth / 2;
      const zCY: number = z.y + z.instanceHeight / 2;
      const dist: number = Math.sqrt((zCX - playerCX) ** 2 + (zCY - playerCY) ** 2);

      if (dist <= pullRange) {
        const offsetX: number = (Math.random() - 0.5) * spreadHalf * 2;
        z.x = p.x + offsetX;
        z.y = p.y + GAME_CONSTANTS.PLAYER_HEIGHT - z.instanceHeight;
        z.velocityX = 0;
        z.velocityY = 0;
        z.knockbackFrames = 0;

        this.vfx.spawnHitParticles(z.x + z.instanceWidth / 2, z.y + z.instanceHeight / 2, skill.color);
        pulledCount++;
      }
    }

    if (pulledCount > 0) {
      this.e.onZombiesUpdate?.(this.e.zombies);
    }

    if (this.e.isMultiplayerClient) {
      this.e.pendingPullEvents.push({
        playerX: p.x,
        playerY: p.y,
        pullRange,
        skillColor: skill.color,
      });
    }

    this.e.onPlayerUpdate?.(p);
  }

  private performDashSkill(skill: SkillDefinition, skillLevel: number, playerCX: number, playerCY: number): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    if (this.e.dashPhase) return;

    const range: number = getSkillRange(skill, skillLevel);
    const damageMultiplier: number = getSkillDamageMultiplier(skill, skillLevel);
    const dir: number = p.facing === Direction.Right ? 1 : -1;

    const startX: number = p.x;
    const endX: number = Math.max(0, Math.min(
      startX + dir * range,
      GAME_CONSTANTS.CANVAS_WIDTH - GAME_CONSTANTS.PLAYER_WIDTH,
    ));

    const corridorLeft: number = Math.min(startX, endX);
    const corridorRight: number = Math.max(startX, endX) + GAME_CONSTANTS.PLAYER_WIDTH;
    const corridorTop: number = p.y;
    const corridorHeight: number = GAME_CONSTANTS.PLAYER_HEIGHT;

    const maxTargets: number = 10;
    let hitCount: number = 0;
    const hitZombies: ZombieState[] = [];

    for (const z of this.e.zombies) {
      if (z.isDead || z.spawnTimer > 0) continue;
      if (hitCount >= maxTargets) break;
      if (this.physics.rectsOverlap(
        corridorLeft, corridorTop, corridorRight - corridorLeft, corridorHeight,
        z.x, z.y, z.instanceWidth, z.instanceHeight,
      )) {
        hitZombies.push(z);
        hitCount++;
      }
    }

    const endCX: number = endX + GAME_CONSTANTS.PLAYER_WIDTH / 2;

    const dashState: DashPhaseState = {
      startX,
      endX,
      playerY: p.y,
      startCX: playerCX,
      endCX,
      playerCY,
      facing: p.facing,
      dir,
      phase: 'vanishing',
      ticksInPhase: 0,
      vanishTicks: 14,
      swishTicks: 10,
      appearTicks: 14,
      skill,
      skillLevel,
      hitZombies,
      damageMultiplier,
      damageApplied: false,
    };

    this.e.dashPhase = dashState;

    this.vfx.spawnPortalVortex(playerCX, playerCY, true);
    this.vfx.triggerScreenShake(6, 5);
    this.vfx.triggerScreenFlash('#9944ff', 5);

    this.e.pendingVfxEvents.push({
      type: VfxEventType.DashPortal,
      playerId: p.id,
      x: playerCX,
      y: playerCY,
      inward: true,
    });
    this.e.pendingVfxEvents.push({
      type: VfxEventType.ScreenShake,
      playerId: p.id,
      x: 0,
      y: 0,
      frames: 6,
      intensity: 5,
    });
    this.e.pendingVfxEvents.push({
      type: VfxEventType.ScreenFlash,
      playerId: p.id,
      x: 0,
      y: 0,
      color: '#9944ff',
      frames: 5,
    });

    p.isAttacking = true;
    p.velocityX = 0;
  }

  private performDoubleJump(skill: SkillDefinition, skillLevel: number, playerCX: number, playerCY: number): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    if (p.isGrounded || p.isClimbing) return;
    if (this.e.doubleJumpUsed) return;

    const forceMultiplier: number = getSkillDamageMultiplier(skill, skillLevel);
    const dir: number = p.facing === Direction.Right ? 1 : -1;
    p.velocityY = GAME_CONSTANTS.DOUBLE_JUMP_FORCE * forceMultiplier;
    p.velocityX = dir * GAME_CONSTANTS.DOUBLE_JUMP_HORIZONTAL_BURST * forceMultiplier;

    this.e.doubleJumpUsed = true;
    this.e.doubleJumpAnimTicks = GAME_CONSTANTS.DOUBLE_JUMP_ANIM_TICKS;
    p.isDoubleJumping = true;

    this.vfx.triggerSkillAnimation(skill.animationKey, playerCX, playerCY, p.facing, skillLevel);
    this.pushSkillAnimationEvent(skill.animationKey, playerCX, playerCY, p.facing, skillLevel);

    this.e.onPlayerUpdate?.(p);
  }

  updateDashPhase(): void {
    const dash: DashPhaseState | null = this.e.dashPhase;
    if (!dash) return;
    const p: CharacterState | null = this.e.player;
    if (!p) { this.e.dashPhase = null; return; }

    dash.ticksInPhase++;

    if (dash.phase === 'vanishing') {
      this.spawnVanishTickParticles(dash);
      if (dash.ticksInPhase >= dash.vanishTicks) {
        dash.phase = 'swishing';
        dash.ticksInPhase = 0;
        this.spawnSwishBurst(dash);
        const dashPlayer: CharacterState | null = this.e.player;
        if (dashPlayer) {
          this.e.pendingVfxEvents.push({
            type: VfxEventType.DashTrail,
            playerId: dashPlayer.id,
            x: dash.startCX,
            y: dash.playerCY,
            endX: dash.endCX,
            dir: dash.dir,
          });
        }
      }
      return;
    }

    if (dash.phase === 'swishing') {
      this.spawnSwishTickParticles(dash);
      if (dash.ticksInPhase >= dash.swishTicks) {
        dash.phase = 'appearing';
        dash.ticksInPhase = 0;
        p.x = dash.endX;
        p.velocityX = dash.dir * GAME_CONSTANTS.PLAYER_MOVE_SPEED * 2;
        this.applyDashDamage(dash);
        this.vfx.spawnPortalVortex(dash.endCX, dash.playerCY, false);
        this.vfx.triggerScreenShake(8, 6);
        this.vfx.triggerScreenFlash('#ff6622', 5);

        this.e.pendingVfxEvents.push({
          type: VfxEventType.DashPortal,
          playerId: p.id,
          x: dash.endCX,
          y: dash.playerCY,
          inward: false,
        });
        this.e.pendingVfxEvents.push({
          type: VfxEventType.ScreenShake,
          playerId: p.id,
          x: 0,
          y: 0,
          frames: 8,
          intensity: 6,
        });
        this.e.pendingVfxEvents.push({
          type: VfxEventType.ScreenFlash,
          playerId: p.id,
          x: 0,
          y: 0,
          color: '#ff6622',
          frames: 5,
        });
      }
      return;
    }

    if (dash.phase === 'appearing') {
      this.spawnAppearTickParticles(dash);
      if (dash.ticksInPhase >= dash.appearTicks) {
        this.e.dashPhase = null;
        p.isAttacking = false;
        this.e.onPlayerUpdate?.(p);
      }
    }
  }

  private pushSkillAnimationEvent(animationKey: string, x: number, y: number, facing: Direction, level: number): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    this.e.pendingVfxEvents.push({
      type: VfxEventType.SkillAnimation,
      playerId: p.id,
      x,
      y,
      animationKey,
      facing,
      level,
    });
  }

  private spawnVanishTickParticles(dash: DashPhaseState): void {
    const progress: number = dash.ticksInPhase / dash.vanishTicks;
    const swirlCount: number = 4;
    const baseAngle: number = dash.ticksInPhase * 0.8;
    for (let i: number = 0; i < swirlCount; i++) {
      const angle: number = baseAngle + (i / swirlCount) * Math.PI * 2;
      const radius: number = 40 * (1 - progress * 0.8);
      const particle: Particle = {
        x: dash.startCX + Math.cos(angle) * radius,
        y: dash.playerCY + Math.sin(angle) * radius * 0.6,
        vx: -Math.cos(angle) * (2 + progress * 3),
        vy: -Math.sin(angle) * (2 + progress * 3),
        life: 14 - Math.floor(progress * 6),
        maxLife: 16,
        color: progress > 0.6 ? '#ffffff' : '#bb66ff',
        size: 4 + (1 - progress) * 4,
        shape: ParticleShape.Star,
        rotation: angle,
        rotationSpeed: 0.3,
        fadeMode: FadeMode.Quick,
        scaleOverLife: true,
      };
      this.vfx.addParticle(particle);
    }
    if (progress > 0.3) {
      const sparkCount: number = 2;
      for (let i: number = 0; i < sparkCount; i++) {
        const particle: Particle = {
          x: dash.startCX + (Math.random() - 0.5) * 20 * (1 - progress),
          y: dash.playerCY + (Math.random() - 0.5) * 40 * (1 - progress),
          vx: (Math.random() - 0.5) * 1.5,
          vy: -(2 + Math.random() * 3),
          life: 10,
          maxLife: 12,
          color: '#ffddff',
          size: 2 + Math.random() * 2,
          shape: ParticleShape.Circle,
          rotation: 0,
          rotationSpeed: 0,
          fadeMode: FadeMode.Quick,
          scaleOverLife: false,
        };
        this.vfx.addParticle(particle);
      }
    }
  }

  private spawnSwishBurst(dash: DashPhaseState): void {
    const pathLen: number = Math.abs(dash.endCX - dash.startCX);
    const cometCount: number = 16;
    for (let i: number = 0; i < cometCount; i++) {
      const t: number = i / cometCount;
      const x: number = dash.startCX + (dash.endCX - dash.startCX) * t;
      const particle: Particle = {
        x,
        y: dash.playerCY + (Math.random() - 0.5) * 8,
        vx: dash.dir * (14 + Math.random() * 6),
        vy: (Math.random() - 0.5) * 1.2,
        life: 16 + Math.floor(t * 6),
        maxLife: 22,
        color: '#ffffff',
        size: 7 + Math.random() * 4,
        shape: ParticleShape.Line,
        rotation: dash.dir > 0 ? 0 : Math.PI,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: true,
      };
      this.vfx.addParticle(particle);
    }
    const ringSegments: number = Math.max(3, Math.floor(pathLen / 80));
    for (let s: number = 0; s < ringSegments; s++) {
      const t: number = (s + 0.5) / ringSegments;
      const rx: number = dash.startCX + (dash.endCX - dash.startCX) * t;
      const expandCount: number = 8;
      for (let i: number = 0; i < expandCount; i++) {
        const angle: number = (i / expandCount) * Math.PI * 2;
        const particle: Particle = {
          x: rx,
          y: dash.playerCY,
          vx: Math.cos(angle) * 2.5,
          vy: Math.sin(angle) * 2.5,
          life: 12 + Math.floor(Math.random() * 6),
          maxLife: 18,
          color: s % 2 === 0 ? '#ff8844' : '#bb66ff',
          size: 4 + Math.random() * 3,
          shape: ParticleShape.Ring,
          rotation: 0,
          rotationSpeed: 0,
          fadeMode: FadeMode.Quick,
          scaleOverLife: true,
        };
        this.vfx.addParticle(particle);
      }
    }
  }

  private spawnSwishTickParticles(dash: DashPhaseState): void {
    const progress: number = dash.ticksInPhase / dash.swishTicks;
    const pathLength: number = dash.endCX - dash.startCX;
    const headX: number = dash.startCX + pathLength * progress;
    const cometParticles: number = 3;
    for (let i: number = 0; i < cometParticles; i++) {
      const particle: Particle = {
        x: headX + (Math.random() - 0.5) * 12,
        y: dash.playerCY + (Math.random() - 0.5) * 16,
        vx: dash.dir * (6 + Math.random() * 4),
        vy: (Math.random() - 0.5) * 3,
        life: 8 + Math.floor(Math.random() * 5),
        maxLife: 13,
        color: '#ffcc44',
        size: 5 + Math.random() * 4,
        shape: ParticleShape.Star,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.4,
        fadeMode: FadeMode.Quick,
        scaleOverLife: true,
      };
      this.vfx.addParticle(particle);
    }
    const trailCount: number = 4;
    for (let i: number = 0; i < trailCount; i++) {
      const trailT: number = Math.max(0, progress - 0.1 - Math.random() * 0.3);
      const tx: number = dash.startCX + pathLength * trailT;
      const particle: Particle = {
        x: tx + (Math.random() - 0.5) * 20,
        y: dash.playerCY + (Math.random() - 0.5) * 24,
        vx: dash.dir * (2 + Math.random() * 2),
        vy: -(1 + Math.random() * 2),
        life: 10 + Math.floor(Math.random() * 6),
        maxLife: 16,
        color: i % 2 === 0 ? '#ff6622' : '#bb44ff',
        size: 3 + Math.random() * 3,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Late,
        scaleOverLife: true,
      };
      this.vfx.addParticle(particle);
    }
    const speedLineCount: number = 3;
    for (let i: number = 0; i < speedLineCount; i++) {
      const lx: number = headX - dash.dir * (20 + Math.random() * 50);
      const particle: Particle = {
        x: lx,
        y: dash.playerCY + (Math.random() - 0.5) * 40,
        vx: dash.dir * (10 + Math.random() * 8),
        vy: 0,
        life: 6 + Math.floor(Math.random() * 4),
        maxLife: 10,
        color: '#ffffff',
        size: 2 + Math.random() * 2,
        shape: ParticleShape.Line,
        rotation: dash.dir > 0 ? 0 : Math.PI,
        rotationSpeed: 0,
        fadeMode: FadeMode.Quick,
        scaleOverLife: false,
      };
      this.vfx.addParticle(particle);
    }
  }

  private spawnAppearTickParticles(dash: DashPhaseState): void {
    const progress: number = dash.ticksInPhase / dash.appearTicks;
    if (dash.ticksInPhase <= 3) {
      const burstCount: number = 6;
      for (let i: number = 0; i < burstCount; i++) {
        const angle: number = (i / burstCount) * Math.PI * 2 + dash.ticksInPhase * 0.5;
        const speed: number = 3 + Math.random() * 4;
        const particle: Particle = {
          x: dash.endCX,
          y: dash.playerCY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 16 + Math.floor(Math.random() * 8),
          maxLife: 24,
          color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ff8844' : '#ffcc44',
          size: 5 + Math.random() * 5,
          shape: ParticleShape.Star,
          rotation: angle,
          rotationSpeed: -0.2,
          fadeMode: FadeMode.Late,
          scaleOverLife: true,
        };
        this.vfx.addParticle(particle);
      }
    }
    const sparkCount: number = 2;
    for (let i: number = 0; i < sparkCount; i++) {
      const angle: number = Math.random() * Math.PI * 2;
      const radius: number = 10 + 30 * progress;
      const particle: Particle = {
        x: dash.endCX + Math.cos(angle) * radius,
        y: dash.playerCY + Math.sin(angle) * radius,
        vx: Math.cos(angle) * 1.2,
        vy: Math.sin(angle) * 1.2 - 1.5,
        life: 8 + Math.floor(Math.random() * 4),
        maxLife: 12,
        color: progress < 0.4 ? '#ffaa44' : '#bb66ff',
        size: 2 + Math.random() * 3,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Quick,
        scaleOverLife: true,
      };
      this.vfx.addParticle(particle);
    }
  }

  private applyDashDamage(dash: DashPhaseState): void {
    const p: CharacterState | null = this.e.player;
    if (!p || dash.damageApplied) return;
    dash.damageApplied = true;

    for (const z of dash.hitZombies) {
      if (z.isDead) continue;
      const isCrit: boolean = Math.random() * 100 < p.derived.critRate;
      const specialDmgMult: number = this.drops.getEffectiveDamageMultiplier();
      let damage: number = Math.max(1, Math.floor(p.derived.attack * dash.damageMultiplier * specialDmgMult) + Math.floor(Math.random() * 5));
      if (isCrit) damage = Math.max(1, Math.floor(damage * p.derived.critDamage / 100));

      z.hp -= damage;
      this.collectDamageEvent(z.id, damage, z.hp <= 0);
      z.velocityX = dash.dir * z.instanceKnockbackForce * 1.5;
      z.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
      z.isGrounded = false;
      z.knockbackFrames = GAME_CONSTANTS.KNOCKBACK_ZOMBIE_FRAMES * 2;

      this.vfx.spawnHitParticles(z.x + z.instanceWidth / 2, z.y + z.instanceHeight / 2, dash.skill.color);
      this.vfx.spawnDamageNumber(z.x + z.instanceWidth / 2, z.y - z.instanceHeight / 2, damage, isCrit, isCrit ? '#ffaa00' : dash.skill.color);
      this.vfx.spawnHitMark(z.x + z.instanceWidth / 2, z.y + z.instanceHeight / 2);

      if (z.hp <= 0) {
        this.handleZombieDeath(z);
      }
    }

    this.e.zombies = this.e.zombies.filter((z: ZombieState) => !z.isDead);
    this.e.onZombiesUpdate?.(this.e.zombies);
    this.flushDamageEvents();
  }

  private activateBuff(skill: SkillDefinition, level: number): void {
    const p: CharacterState | null = this.e.player;
    if (!p || !skill.buffEffect || !skill.buffDuration) return;

    const durationMs: number = getBuffDurationMs(skill, level);
    const effectValue: number = getBuffEffectValue(skill, level);

    const existingIdx: number = p.activeBuffs.findIndex(
      (b: ActiveBuff) => b.skillId === skill.id,
    );

    const newBuff: ActiveBuff = {
      skillId: skill.id,
      remainingMs: durationMs,
      totalDurationMs: durationMs,
      stat: skill.buffEffect.stat,
      value: effectValue,
    };

    if (existingIdx >= 0) {
      p.activeBuffs[existingIdx] = newBuff;
    } else {
      p.activeBuffs.push(newBuff);
    }

    const playerCX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const buffCY: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    this.vfx.spawnBuffActivationParticles(playerCX, buffCY, skill.color);

    this.e.pendingVfxEvents.push({
      type: VfxEventType.BuffActivation,
      playerId: p.id,
      x: playerCX,
      y: buffCY,
      color: skill.color,
    });
  }

  updateActiveBuffs(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    const beforeCount: number = p.activeBuffs.length;

    for (const buff of p.activeBuffs) {
      buff.remainingMs -= this.e.fixedDt;
    }

    p.activeBuffs = p.activeBuffs.filter(
      (b: ActiveBuff) => b.remainingMs > 0,
    );

    if (p.activeBuffs.length !== beforeCount) {
      this.e.onPlayerUpdate?.(p);
    }
  }

  updatePassiveSkills(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    const isStandingStill: boolean =
      p.isGrounded &&
      !p.isClimbing &&
      Math.abs(p.velocityX) < GAME_CONSTANTS.PLAYER_MIN_VELOCITY;

    if (isStandingStill) {
      this.e.playerStandingStillTicks++;
    } else {
      this.e.playerStandingStillTicks = 0;
      this.e.passiveRecoveryTimers.clear();
    }

    const passiveSkills: SkillDefinition[] = SKILLS.filter(
      (s: SkillDefinition) =>
        s.classId === p.classId &&
        s.type === SkillType.Passive &&
        s.passiveEffect !== null &&
        (p.skillLevels[s.id] ?? 0) > 0,
    );

    for (const skill of passiveSkills) {
      const passive: PassiveEffect = skill.passiveEffect!;
      if (passive.type === 'autoPotion') continue;
      if (passive.condition === 'standingStill' && !isStandingStill) continue;

      const intervalTicks: number = Math.floor(passive.intervalMs / this.e.fixedDt);
      const elapsed: number = (this.e.passiveRecoveryTimers.get(skill.id) ?? 0) + 1;

      if (elapsed >= intervalTicks) {
        this.e.passiveRecoveryTimers.set(skill.id, 0);
        const level: number = p.skillLevels[skill.id] ?? 0;
        const value: number = getPassiveEffectValue(skill, level);

        if (passive.type === 'hpRecovery' && p.hp < p.derived.maxHp) {
          p.hp = Math.min(p.hp + value, p.derived.maxHp);
          const playerCX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
          this.vfx.spawnDamageNumber(playerCX, p.y - 10, value, false, '#44ff44');
          this.e.pendingVfxEvents.push({
            type: VfxEventType.DamageNumber,
            playerId: p.id,
            x: playerCX,
            y: p.y - 10,
            value,
            isCrit: false,
            color: '#44ff44',
          });
          this.e.onPlayerUpdate?.(p);
        } else if (passive.type === 'mpRecovery' && p.mp < p.derived.maxMp) {
          p.mp = Math.min(p.mp + value, p.derived.maxMp);
          const playerCX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
          this.vfx.spawnDamageNumber(playerCX, p.y - 10, value, false, '#4488ff');
          this.e.pendingVfxEvents.push({
            type: VfxEventType.DamageNumber,
            playerId: p.id,
            x: playerCX,
            y: p.y - 10,
            value,
            isCrit: false,
            color: '#4488ff',
          });
          this.e.onPlayerUpdate?.(p);
        }
      } else {
        this.e.passiveRecoveryTimers.set(skill.id, elapsed);
      }
    }
  }

  updateAutoPotion(): void {
    const p: CharacterState | null = this.e.player;
    if (!p || p.isDead) return;
    if (this.e.potionCooldown > 0) return;
    if (this.e.autoPotionCooldown > 0) {
      this.e.autoPotionCooldown--;
      return;
    }

    const autoPotionSkill: SkillDefinition | undefined = SKILLS.find(
      (s: SkillDefinition) =>
        s.classId === p.classId &&
        s.passiveEffect?.type === 'autoPotion' &&
        (p.skillLevels[s.id] ?? 0) > 0,
    );
    if (!autoPotionSkill || !autoPotionSkill.passiveEffect) return;

    const level: number = p.skillLevels[autoPotionSkill.id] ?? 0;
    const successChance: number = getAutoPotionSuccessChance(autoPotionSkill, level);
    const hpThreshold: number = autoPotionSkill.passiveEffect.hpThresholdPercent ?? GAME_CONSTANTS.AUTO_POTION_HP_THRESHOLD_PERCENT;
    const mpThreshold: number = autoPotionSkill.passiveEffect.mpThresholdPercent ?? GAME_CONSTANTS.AUTO_POTION_MP_THRESHOLD_PERCENT;

    const hpPercent: number = (p.hp / p.derived.maxHp) * 100;
    const mpPercent: number = (p.mp / p.derived.maxMp) * 100;
    const playerCX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;

    const hpPotionId: string | null = resolveAutoPotionId(p.inventory.autoPotionHpId, p.inventory.potions, 'hp');
    if (hpPercent <= hpThreshold && hpPotionId && p.hp < p.derived.maxHp) {
      const roll: number = Math.random() * 100;
      if (roll < successChance) {
        const used: boolean = this.e.onUseHpPotion?.() ?? false;
        if (used) {
          const restoreAmount: number = getPotionRestoreAmount(hpPotionId, p.derived.maxHp, p.derived.maxMp);
          p.hp = Math.min(p.hp + restoreAmount, p.derived.maxHp);
          p.inventory.potions[hpPotionId] = Math.max(0, (p.inventory.potions[hpPotionId] ?? 0) - 1);
          this.e.potionCooldown = GAME_CONSTANTS.POTION_USE_COOLDOWN_TICKS;
          this.vfx.spawnHitParticles(playerCX, p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2, '#ff4488');
          this.vfx.spawnDamageNumber(playerCX, p.y - 10, restoreAmount, false, '#44ff44');
          this.e.pendingVfxEvents.push({
            type: VfxEventType.HitParticles,
            playerId: p.id,
            x: playerCX,
            y: p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
            color: '#ff4488',
          });
          this.e.pendingVfxEvents.push({
            type: VfxEventType.DamageNumber,
            playerId: p.id,
            x: playerCX,
            y: p.y - 10,
            value: restoreAmount,
            isCrit: false,
            color: '#44ff44',
          });
          this.e.onPlayerUpdate?.(p);
          return;
        }
      }
      this.e.autoPotionCooldown = GAME_CONSTANTS.POTION_USE_COOLDOWN_TICKS;
      return;
    }

    const mpPotionId: string | null = resolveAutoPotionId(p.inventory.autoPotionMpId, p.inventory.potions, 'mp');
    if (mpPercent <= mpThreshold && mpPotionId && p.mp < p.derived.maxMp) {
      const roll: number = Math.random() * 100;
      if (roll < successChance) {
        const used: boolean = this.e.onUseMpPotion?.() ?? false;
        if (used) {
          const restoreAmount: number = getPotionRestoreAmount(mpPotionId, p.derived.maxHp, p.derived.maxMp);
          p.mp = Math.min(p.mp + restoreAmount, p.derived.maxMp);
          p.inventory.potions[mpPotionId] = Math.max(0, (p.inventory.potions[mpPotionId] ?? 0) - 1);
          this.e.potionCooldown = GAME_CONSTANTS.POTION_USE_COOLDOWN_TICKS;
          this.vfx.spawnHitParticles(playerCX, p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2, '#4488ff');
          this.vfx.spawnDamageNumber(playerCX, p.y - 10, restoreAmount, false, '#4488ff');
          this.e.pendingVfxEvents.push({
            type: VfxEventType.HitParticles,
            playerId: p.id,
            x: playerCX,
            y: p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
            color: '#4488ff',
          });
          this.e.pendingVfxEvents.push({
            type: VfxEventType.DamageNumber,
            playerId: p.id,
            x: playerCX,
            y: p.y - 10,
            value: restoreAmount,
            isCrit: false,
            color: '#4488ff',
          });
          this.e.onPlayerUpdate?.(p);
          return;
        }
      }
      this.e.autoPotionCooldown = GAME_CONSTANTS.POTION_USE_COOLDOWN_TICKS;
    }
  }

  updateSkillCooldowns(): void {
    for (const [id, ticks] of this.e.skillCooldowns) {
      if (ticks > 0) {
        this.e.skillCooldowns.set(id, ticks - 1);
      }
    }

    const p: CharacterState | null = this.e.player;
    if (p) {
      const available: SkillDefinition[] = SKILLS.filter(
        (s: SkillDefinition) =>
          s.classId === p.classId &&
          (s.type === SkillType.Active || s.type === SkillType.Buff) &&
          (p.skillLevels[s.id] ?? 0) > 0,
      ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel)
       .slice(0, 6);
      if (available.length !== this.e.playerUsableSkills.length) {
        this.e.playerUsableSkills = available;
      }
    }
  }

  applyZombieKnockback(z: ZombieState): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    const knockDir: number = z.x > p.x ? 1 : -1;
    z.velocityX = knockDir * GAME_CONSTANTS.KNOCKBACK_FORCE_ZOMBIE;
    z.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
    z.isGrounded = false;
    z.knockbackFrames = GAME_CONSTANTS.KNOCKBACK_ZOMBIE_FRAMES;
  }

  applyZombieDamageToPlayer(damage: number, z: ZombieState): void {
    const p: CharacterState | null = this.e.player;
    if (!p || p.isDown || this.e.invincibilityFrames > 0) return;
    if (this.e.dashPhase) return;
    if (this.e.godMode) return;

    p.hp -= damage;
    this.e.invincibilityFrames = GAME_CONSTANTS.INVINCIBILITY_FRAMES;

    this.interruptReviveChannel();

    const kbResistBuff: ActiveBuff | undefined = p.activeBuffs.find(
      (b: ActiveBuff) => b.stat === 'knockbackResist' && b.remainingMs > 0,
    );
    const resistedKnockback: boolean = !!kbResistBuff && Math.random() * 100 < kbResistBuff.value;

    if (!resistedKnockback) {
      const knockDir: number = p.x > z.x ? 1 : -1;
      p.velocityX = knockDir * GAME_CONSTANTS.KNOCKBACK_FORCE_PLAYER;
      p.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
      p.isGrounded = false;
      if (p.isClimbing) {
        p.isClimbing = false;
      }
    }

    this.vfx.spawnHitParticles(p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2, '#ffffff');
    this.vfx.spawnDamageNumber(p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y - 10, damage, false, '#ff4444');
    this.e.pendingVfxEvents.push({
      type: VfxEventType.HitParticles,
      playerId: p.id,
      x: p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      color: '#ffffff',
    });
    this.e.pendingVfxEvents.push({
      type: VfxEventType.DamageNumber,
      playerId: p.id,
      x: p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: p.y - 10,
      value: damage,
      isCrit: false,
      color: '#ff4444',
    });

    if (p.hp <= 0) {
      p.hp = 0;
      const isMultiplayer: boolean = this.e.isMultiplayerHost || this.e.isMultiplayerClient;
      if (isMultiplayer) {
        p.isDown = true;
        p.downTimer = GAME_CONSTANTS.REVIVE_WINDOW_TICKS;
        this.e.onPlayerUpdate?.(p);
        this.e.onPlayerDowned?.();
      } else {
        p.isDead = true;
        this.e.onPlayerUpdate?.(p);
        this.e.onGameOver?.();
      }
      return;
    }
    this.e.onPlayerUpdate?.(p);
  }

  interruptReviveChannel(): void {
    if (this.e.reviveTargetId !== null) {
      this.e.reviveTargetId = null;
      this.e.reviveProgressTicks = 0;
    }
  }

  handleZombieDeath(z: ZombieState, awardRewards: boolean = true): void {
    z.isDead = true;

    if (this.e.isMultiplayerClient) {
      this.e.pendingLocalKills.add(z.id);
    }

    const grounded: boolean = z.isGrounded;
    const useDeadImmediate: boolean = grounded || this.e.isMultiplayerClient;
    const initialAnim: ZombieAnimState = useDeadImmediate ? ZombieAnimState.Dead : ZombieAnimState.Hurt;
    this.e.zombieSpriteAnimator.setState(z.id, initialAnim);

    const lingerTicks: number = GAME_CONSTANTS.ZOMBIE_CORPSE_LINGER_TICKS;
    const scatter: number = (Math.random() - 0.5) * GAME_CONSTANTS.ZOMBIE_CORPSE_DEATH_SCATTER * 2;
    const corpse: ZombieCorpse = {
      id: z.id,
      type: z.type,
      x: z.x,
      y: z.y,
      width: z.instanceWidth,
      height: z.instanceHeight,
      spriteKey: this.e.zombieSpriteAnimator.getSpriteKey(z.type),
      facing: z.facing,
      velocityX: scatter + (grounded ? 0 : z.velocityX),
      velocityY: grounded ? 0 : z.velocityY,
      isGrounded: grounded,
      frozen: false,
      landProcessed: false,
      fadeTimer: lingerTicks,
      maxFadeTimer: lingerTicks,
      showBlood: Math.random() < GAME_CONSTANTS.ZOMBIE_CORPSE_BLOOD_CHANCE,
    };
    this.e.zombieCorpses.push(corpse);

    if (awardRewards) {
      const floorBonus: number = 1 + (this.e.floor - 1) * 0.1;
      const xpReward: number = Math.floor(z.instanceXpReward * floorBonus);
      this.e.onXpGained?.(xpReward);
      this.e.onScoreUpdate?.(xpReward * 10);
      const isBoss: boolean = z.type === ZombieType.Boss || z.type === ZombieType.DragonBoss;
      const isDragonBoss: boolean = z.type === ZombieType.DragonBoss;
      this.drops.rollDrops(z.x + z.instanceWidth / 2, z.y + z.instanceHeight / 2, isBoss, isDragonBoss);
    }
  }

  private collectDamageEvent(zombieId: string, damage: number, killed: boolean): void {
    if (!this.e.isMultiplayerClient) return;
    this.clientDamageEvents.push({ zombieId, damage, killed });
  }

  private flushDamageEvents(): void {
    if (this.clientDamageEvents.length === 0) return;
    this.e.onZombieDamaged?.(this.clientDamageEvents.slice());
    this.clientDamageEvents = [];
  }
}
