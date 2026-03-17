import {
  ActiveBuff,
  CharacterState,
  Direction,
  GAME_CONSTANTS,
  CHARACTER_CLASSES,
  SKILLS,
  SkillDefinition,
  SkillType,
  ZOMBIE_TYPES,
  getSkillDamageMultiplier,
  getSkillMpCost,
  getSkillHpCost,
  getSkillCooldown,
  getSkillRange,
  getSkillStunDurationMs,
  getBuffEffectValue,
  getBuffDurationMs,
  getPassiveEffectValue,
  PassiveEffect,
} from '@shared/index';
import {
  DropType,
  WorldDrop,
  ZombieDefinition,
  ZombieState,
  ZombieType,
} from '@shared/game-entities';
import { InputKeys } from '@shared/messages';
import { Particle, ParticleShape, FadeMode } from './particle-types';
import { SKILL_ANIMATIONS, SkillAnimation } from './skill-animations';
import { SpriteAnimator, PlayerAnimState } from './sprite-animator';
import { ZombieSpriteAnimator, ZombieAnimState } from './zombie-sprite-animator';
import { MapRenderer } from './map-renderer';
import { SpriteEffectSystem } from './sprite-effect-system';

export type { Particle };
export { ParticleShape, FadeMode };

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

interface ZombieCorpse {
  id: string;
  type: ZombieType;
  x: number;
  y: number;
  width: number;
  height: number;
  spriteKey: string;
  facing: number;
  velocityY: number;
  isGrounded: boolean;
  fadeTimer: number;
  maxFadeTimer: number;
}

interface DragonProjectile {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  damage: number;
  lifetime: number;
  frame: number;
  tickCounter: number;
}

interface DragonImpact {
  x: number;
  y: number;
  frame: number;
  tickCounter: number;
}

export class GameEngine {
  readonly ctx: CanvasRenderingContext2D;
  private animationFrameId: number = 0;
  private lastTimestamp: number = 0;
  private accumulator: number = 0;
  private readonly fixedDt: number = 1000 / GAME_CONSTANTS.TICK_RATE;

  private player: CharacterState | null = null;
  private zombies: ZombieState[] = [];
  private zombieCorpses: ZombieCorpse[] = [];
  private particles: Particle[] = [];
  private damageNumbers: DamageNumber[] = [];
  private dropNotifications: DropNotification[] = [];
  private readonly DROP_NOTIFICATION_LIFE_TICKS: number = 250;
  private worldDrops: WorldDrop[] = [];
  private platforms: Platform[] = [];
  private ropes: Rope[] = [];
  private keys: InputKeys = { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false, skill3: false, skill4: false, skill5: false, skill6: false, openStats: false, openSkills: false, useHpPotion: false, useMpPotion: false, openShop: false };
  private attackCooldown: number = 0;
  private attackAnimTicks: number = 0;
  private attackHitPending: boolean = false;
  private attackHitDelay: number = 0;
  private invincibilityFrames: number = 0;
  private potionCooldown: number = 0;
  private jumpHeld: boolean = false;
  private ropeJumpCooldown: number = 0;
  private platformDropTimer: number = 0;

  private playerUsableSkills: SkillDefinition[] = [];
  private skillCooldowns: Map<string, number> = new Map();
  private passiveRecoveryTimers: Map<string, number> = new Map();
  private playerStandingStillTicks: number = 0;
  private playerStunTicks: number = 0;

  private wave: number = 1;
  private zombiesKilledThisWave: number = 0;
  private zombiesToSpawnThisWave: number = 0;
  private zombiesSpawnedThisWave: number = 0;
  private spawnTimer: number = 0;
  private waveTransitionTimer: number = 0;

  private backgroundStars: BackgroundStar[] = [];

  private screenShakeFrames: number = 0;
  private screenShakeIntensity: number = 0;
  private screenFlashColor: string | null = null;
  private screenFlashFrames: number = 0;

  private readonly spriteAnimator: SpriteAnimator = new SpriteAnimator();
  private readonly zombieSpriteAnimator: ZombieSpriteAnimator = new ZombieSpriteAnimator();
  private readonly mapRenderer: MapRenderer = new MapRenderer();
  private readonly spriteEffectSystem: SpriteEffectSystem = new SpriteEffectSystem();
  private readonly SPRITE_RENDER_SIZE: number = 96;

  private dragonProjectiles: DragonProjectile[] = [];
  private dragonImpacts: DragonImpact[] = [];
  private readonly dragonProjectileImg: HTMLImageElement = new Image();
  private readonly dragonImpactImg: HTMLImageElement = new Image();
  private readonly DRAGON_PROJ_FRAME_W: number = 105;
  private readonly DRAGON_PROJ_FRAME_H: number = 118;
  private readonly DRAGON_PROJ_FRAMES: number = 3;
  private readonly DRAGON_IMPACT_FRAME_W: number = 85;
  private readonly DRAGON_IMPACT_FRAME_H: number = 131;
  private readonly DRAGON_IMPACT_FRAMES: number = 4;

  onPlayerUpdate: ((player: CharacterState) => void) | null = null;
  onZombiesUpdate: ((zombies: ZombieState[]) => void) | null = null;
  onWaveUpdate: ((wave: number, remaining: number) => void) | null = null;
  onXpGained: ((amount: number) => void) | null = null;
  onScoreUpdate: ((delta: number) => void) | null = null;
  onGameOver: (() => void) | null = null;
  onGoldPickup: ((amount: number) => void) | null = null;
  onPotionPickup: ((type: DropType) => void) | null = null;
  onUseHpPotion: (() => boolean) | null = null;
  onUseMpPotion: (() => boolean) | null = null;
  onOpenShop: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.canvas.width = GAME_CONSTANTS.CANVAS_WIDTH;
    this.canvas.height = GAME_CONSTANTS.CANVAS_HEIGHT;
    this.initPlatforms();
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

  private initRopes(): void {
    this.ropes = [
      { x: 190, topY: 330, bottomY: 530 },
      { x: 910, topY: 340, bottomY: 530 },
      { x: 560, topY: 430, bottomY: GAME_CONSTANTS.GROUND_Y },
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
    this.wave = 1;
    this.zombiesKilledThisWave = 0;
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
    this.startWave();
    this.lastTimestamp = performance.now();
    this.loop(this.lastTimestamp);
  }

  stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  setWave(wave: number): void {
    for (const z of this.zombies) {
      z.isDead = true;
    }
    this.zombies = [];
    for (const corpse of this.zombieCorpses) {
      this.zombieSpriteAnimator.removeInstance(corpse.id);
    }
    this.zombieCorpses = [];
    this.wave = wave;
    this.startWave();
  }

  setKeys(keys: InputKeys): void {
    this.keys = keys;
  }

  private loop(timestamp: number): void {
    const dt: number = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    this.accumulator += dt;

    while (this.accumulator >= this.fixedDt) {
      this.update();
      this.accumulator -= this.fixedDt;
    }

    this.render();
    this.animationFrameId = requestAnimationFrame((t: number) => this.loop(t));
  }

  private update(): void {
    if (!this.player) return;

    this.updatePlayerAnimState();
    this.spriteAnimator.tick();

    if (this.player.isDead) return;

    this.updateAttackTiming();
    this.updatePlayer();
    this.updateZombies();
    this.updateDragonProjectiles();
    this.updateDragonImpacts();
    this.updateSpawning();
    this.updateZombieCorpses();
    this.updateDrops();
    this.updatePotionUse();
    this.updateParticles();
    this.updateDamageNumbers();
    this.updateDropNotifications();
    this.updateSkillCooldowns();
    this.spriteEffectSystem.tick();
    this.updateActiveBuffs();
    this.updatePassiveSkills();
    this.checkWaveCompletion();

    if (this.invincibilityFrames > 0) this.invincibilityFrames--;
    if (this.ropeJumpCooldown > 0) this.ropeJumpCooldown--;
    if (this.platformDropTimer > 0) this.platformDropTimer--;
    if (this.playerStunTicks > 0) this.playerStunTicks--;
  }

  private updatePlayer(): void {
    if (!this.player) return;

    if (this.playerStunTicks > 0) {
      this.player.velocityX *= GAME_CONSTANTS.PLAYER_FRICTION;
      if (Math.abs(this.player.velocityX) < GAME_CONSTANTS.PLAYER_MIN_VELOCITY) this.player.velocityX = 0;
      this.player.velocityY += GAME_CONSTANTS.GRAVITY;
      if (this.player.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
        this.player.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
      }
      this.player.x += this.player.velocityX;
      this.player.y += this.player.velocityY;
      this.player.isGrounded = false;
      for (const plat of this.platforms) {
        if (this.platformDropTimer > 0 && plat.y !== GAME_CONSTANTS.GROUND_Y) continue;
        if (this.isOnPlatform(this.player.x, this.player.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT, plat)) {
          this.player.y = plat.y - GAME_CONSTANTS.PLAYER_HEIGHT;
          this.player.velocityY = 0;
          this.player.isGrounded = true;
        }
      }
      if (this.player.x < 0) this.player.x = 0;
      if (this.player.x + GAME_CONSTANTS.PLAYER_WIDTH > GAME_CONSTANTS.CANVAS_WIDTH) {
        this.player.x = GAME_CONSTANTS.CANVAS_WIDTH - GAME_CONSTANTS.PLAYER_WIDTH;
      }
      this.onPlayerUpdate?.(this.player);
      return;
    }

    const activeRope: Rope | null = this.getActiveRope();

    if (this.player.isClimbing) {
      this.updateClimbing(activeRope);
    } else {
      this.updateMovement(activeRope);
    }

    if (this.keys.attack && this.attackCooldown <= 0) {
      this.performAttack();
      this.attackCooldown = GAME_CONSTANTS.PLAYER_ATTACK_COOLDOWN_TICKS;
    }
    if (this.attackCooldown > 0) this.attackCooldown--;

    if (this.keys.skill1) this.tryPerformSkill(0);
    if (this.keys.skill2) this.tryPerformSkill(1);
    if (this.keys.skill3) this.tryPerformSkill(2);
    if (this.keys.skill4) this.tryPerformSkill(3);
    if (this.keys.skill5) this.tryPerformSkill(4);
    if (this.keys.skill6) this.tryPerformSkill(5);

    if (this.player.x < 0) this.player.x = 0;
    if (this.player.x + GAME_CONSTANTS.PLAYER_WIDTH > GAME_CONSTANTS.CANVAS_WIDTH) {
      this.player.x = GAME_CONSTANTS.CANVAS_WIDTH - GAME_CONSTANTS.PLAYER_WIDTH;
    }

    this.onPlayerUpdate?.(this.player);
  }

  private getActiveRope(): Rope | null {
    if (!this.player) return null;
    const playerCenterX: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const playerCenterY: number = this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const playerBottom: number = this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT;
    for (const rope of this.ropes) {
      const withinX: boolean = Math.abs(playerCenterX - rope.x) < GAME_CONSTANTS.ROPE_GRAB_RANGE;
      const withinY: boolean = playerBottom >= rope.topY && playerCenterY <= rope.bottomY;
      if (withinX && withinY) return rope;
    }
    return null;
  }

  private updateClimbing(activeRope: Rope | null): void {
    if (!this.player) return;

    if (!activeRope) {
      this.player.isClimbing = false;
      return;
    }

    this.player.velocityX = 0;
    this.player.velocityY = 0;
    this.player.x = activeRope.x - GAME_CONSTANTS.PLAYER_WIDTH / 2;

    if (this.keys.up) {
      this.player.y -= GAME_CONSTANTS.ROPE_CLIMB_SPEED;
      if (this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2 < activeRope.topY) {
        this.player.y = activeRope.topY - GAME_CONSTANTS.PLAYER_HEIGHT;
        this.player.isClimbing = false;
        this.player.isGrounded = true;
      }
    }

    if (this.keys.down) {
      this.player.y += GAME_CONSTANTS.ROPE_CLIMB_SPEED;
      if (this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2 > activeRope.bottomY) {
        this.player.isClimbing = false;
      }
    }

    if (this.keys.jump) {
      this.player.isClimbing = false;
      this.player.velocityY = GAME_CONSTANTS.PLAYER_JUMP_FORCE;
      this.ropeJumpCooldown = GAME_CONSTANTS.ROPE_JUMP_COOLDOWN_TICKS;

      if (this.keys.left) {
        this.player.velocityX = -this.player.derived.speed;
        this.player.facing = Direction.Left;
      } else if (this.keys.right) {
        this.player.velocityX = this.player.derived.speed;
        this.player.facing = Direction.Right;
      }
    }
  }

  private updateMovement(activeRope: Rope | null): void {
    if (!this.player) return;

    const speed: number = this.player.derived.speed;
    if (this.player.isGrounded) {
      if (this.keys.left) {
        this.player.velocityX = -speed;
        this.player.facing = Direction.Left;
      } else if (this.keys.right) {
        this.player.velocityX = speed;
        this.player.facing = Direction.Right;
      } else {
        this.player.velocityX *= GAME_CONSTANTS.PLAYER_FRICTION;
        if (Math.abs(this.player.velocityX) < GAME_CONSTANTS.PLAYER_MIN_VELOCITY) this.player.velocityX = 0;
      }
    } else {
      if (this.keys.left) {
        this.player.facing = Direction.Left;
      } else if (this.keys.right) {
        this.player.facing = Direction.Right;
      }
      this.player.velocityX *= GAME_CONSTANTS.PLAYER_AIR_DRAG;
      if (Math.abs(this.player.velocityX) < GAME_CONSTANTS.PLAYER_MIN_VELOCITY) this.player.velocityX = 0;
    }

    const jumpPressed: boolean = this.keys.up || this.keys.jump;
    if (jumpPressed && !this.jumpHeld && this.player.isGrounded) {
      if (this.keys.down && this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT < GAME_CONSTANTS.GROUND_Y) {
        this.platformDropTimer = GAME_CONSTANTS.PLATFORM_DROP_TICKS;
        this.player.y += GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE + 1;
        this.player.isGrounded = false;
      } else {
        this.player.velocityY = GAME_CONSTANTS.PLAYER_JUMP_FORCE;
        this.player.isGrounded = false;
      }
    }
    this.jumpHeld = jumpPressed;

    if (this.keys.up && activeRope && !this.player.isGrounded && this.ropeJumpCooldown <= 0) {
      this.player.isClimbing = true;
      this.player.velocityX = 0;
      this.player.velocityY = 0;
      return;
    }

    if (this.keys.down && activeRope && this.ropeJumpCooldown <= 0) {
      this.player.isClimbing = true;
      this.player.velocityX = 0;
      this.player.velocityY = 0;
      return;
    }

    this.player.velocityY += GAME_CONSTANTS.GRAVITY;
    if (this.player.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
      this.player.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
    }

    this.player.x += this.player.velocityX;
    this.player.y += this.player.velocityY;

    this.player.isGrounded = false;
    for (const plat of this.platforms) {
      if (this.platformDropTimer > 0 && plat.y !== GAME_CONSTANTS.GROUND_Y) continue;
      if (this.isOnPlatform(this.player.x, this.player.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT, plat)) {
        this.player.y = plat.y - GAME_CONSTANTS.PLAYER_HEIGHT;
        this.player.velocityY = 0;
        this.player.isGrounded = true;
      }
    }
  }

  private isOnPlatform(
    ex: number, ey: number, ew: number, eh: number,
    plat: Platform,
  ): boolean {
    const entityBottom: number = ey + eh;
    const prevBottom: number = entityBottom - (this.player?.velocityY ?? 0);
    return (
      ex + ew > plat.x &&
      ex < plat.x + plat.width &&
      entityBottom >= plat.y &&
      prevBottom <= plat.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
      (this.player?.velocityY ?? 0) >= 0
    );
  }

  private updateAttackTiming(): void {
    if (!this.player) return;

    if (this.attackHitPending) {
      this.attackHitDelay--;
      if (this.attackHitDelay <= 0) {
        this.attackHitPending = false;
        this.resolveAttackHit();
      }
    }

    if (this.attackAnimTicks > 0) {
      this.attackAnimTicks--;
      if (this.attackAnimTicks <= 0) {
        this.player.isAttacking = false;
      }
    }
  }

  private performAttack(): void {
    if (!this.player) return;

    this.player.isAttacking = true;
    this.attackAnimTicks = Math.ceil(GAME_CONSTANTS.PLAYER_ATTACK_ANIM_MS / this.fixedDt);
    this.attackHitDelay = Math.ceil(GAME_CONSTANTS.PLAYER_ATTACK_HIT_DELAY_MS / this.fixedDt);
    this.attackHitPending = true;
    this.spriteAnimator.restart();
  }

  private resolveAttackHit(): void {
    if (!this.player || this.player.isDead) return;

    const attackRange: number = GAME_CONSTANTS.PLAYER_BASE_ATTACK_RANGE;
    const attackX: number = this.player.facing === Direction.Right
      ? this.player.x + GAME_CONSTANTS.PLAYER_WIDTH
      : this.player.x - attackRange;

    const playerCx: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    let closest: ZombieState | null = null;
    let closestDist: number = Infinity;

    for (const z of this.zombies) {
      if (z.isDead) continue;
      const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
      if (this.rectsOverlap(attackX, this.player.y, attackRange, GAME_CONSTANTS.PLAYER_HEIGHT, z.x, z.y, zDef.width, zDef.height)) {
        const dist: number = Math.abs((z.x + zDef.width / 2) - playerCx);
        if (dist < closestDist) {
          closestDist = dist;
          closest = z;
        }
      }
    }

    if (closest) {
      const zDef: ZombieDefinition = ZOMBIE_TYPES[closest.type];
      const isCrit: boolean = Math.random() * 100 < this.player.derived.critRate;
      let damage: number = Math.max(1, this.player.derived.attack + Math.floor(Math.random() * 5));
      if (isCrit) damage = Math.max(1, Math.floor(damage * this.player.derived.critDamage / 100));

      closest.hp -= damage;
      this.applyZombieKnockback(closest);
      this.spawnHitParticles(closest.x + zDef.width / 2, closest.y + zDef.height / 2, '#ff4444');
      this.spawnDamageNumber(closest.x + zDef.width / 2, closest.y - 10, damage, isCrit, isCrit ? '#ffaa00' : '#ffffff');

      if (closest.hp <= 0) {
        this.handleZombieDeath(closest, zDef);
      }
    }

    this.zombies = this.zombies.filter((z: ZombieState) => !z.isDead || z.hp > -100);
    this.onZombiesUpdate?.(this.zombies);
  }

  private tryPerformSkill(slotIndex: number): void {
    if (!this.player) return;
    if (this.playerStunTicks > 0) return;

    const skill: SkillDefinition | undefined = this.playerUsableSkills[slotIndex];
    if (!skill) return;

    const skillLevel: number = this.player.skillLevels[skill.id] ?? 0;
    if (skillLevel <= 0) return;

    const remaining: number = this.skillCooldowns.get(skill.id) ?? 0;
    if (remaining > 0) return;

    const mpCost: number = getSkillMpCost(skill, skillLevel);
    const hpCostRaw: number = getSkillHpCost(skill, skillLevel);
    const cooldownMs: number = getSkillCooldown(skill, skillLevel);

    if (skill.minHpPercent > 0) {
      const hpPercent: number = (this.player.hp / this.player.derived.maxHp) * 100;
      if (hpPercent <= skill.minHpPercent) return;
    }

    const hpCost: number = skill.hpCostIsPercent
      ? Math.floor(this.player.derived.maxHp * (hpCostRaw / 100))
      : hpCostRaw;

    if (this.player.mp < mpCost) return;
    if (hpCost > 0 && this.player.hp <= hpCost) return;

    this.player.mp -= mpCost;
    if (hpCost > 0) this.player.hp -= hpCost;
    this.skillCooldowns.set(skill.id, Math.floor(cooldownMs / this.fixedDt));

    const playerCX: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const playerCY: number = this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;

    if (skill.type === SkillType.Buff) {
      this.triggerSkillAnimation(skill.animationKey, playerCX, playerCY, this.player.facing, skillLevel);
      this.activateBuff(skill, skillLevel);
      this.onPlayerUpdate?.(this.player);
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

    const damageMultiplier: number = getSkillDamageMultiplier(skill, skillLevel);
    const range: number = getSkillRange(skill, skillLevel);

    const isHeal: boolean = damageMultiplier < 0;
    if (isHeal) {
      this.triggerSkillAnimation(skill.animationKey, playerCX, playerCY, this.player.facing, skillLevel);
      const healAmount: number = Math.floor(Math.abs(damageMultiplier) * this.player.derived.attack);
      this.player.hp = Math.min(this.player.hp + healAmount, this.player.derived.maxHp);
      this.spawnDamageNumber(playerCX, this.player.y - 10, healAmount, false, '#44ff44');
      this.onPlayerUpdate?.(this.player);
      return;
    }

    this.player.isAttacking = true;
    setTimeout((): void => {
      if (this.player) this.player.isAttacking = false;
    }, GAME_CONSTANTS.PLAYER_SKILL_ANIM_MS);

    const attackX: number = this.player.facing === Direction.Right
      ? this.player.x + GAME_CONSTANTS.PLAYER_WIDTH
      : this.player.x - range;

    const attackCenterX: number = attackX + range / 2;
    const attackCenterY: number = this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    this.triggerSkillAnimation(skill.animationKey, attackCenterX, attackCenterY, this.player.facing, skillLevel);
    const attackW: number = range;
    const attackH: number = range > 100 ? GAME_CONSTANTS.PLAYER_HEIGHT * 2 : GAME_CONSTANTS.PLAYER_HEIGHT;
    const attackY: number = range > 100 ? this.player.y - GAME_CONSTANTS.PLAYER_HEIGHT / 2 : this.player.y;

    const skillColor: string = skill.color;
    const isSingleTarget: boolean = skill.aoeRadius <= 0;

    if (isSingleTarget) {
      const playerCx: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
      let closest: ZombieState | null = null;
      let closestDist: number = Infinity;

      for (const z of this.zombies) {
        if (z.isDead) continue;
        const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
        if (this.rectsOverlap(attackX, attackY, attackW, attackH, z.x, z.y, zDef.width, zDef.height)) {
          const dist: number = Math.abs((z.x + zDef.width / 2) - playerCx);
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
      for (const z of this.zombies) {
        if (z.isDead) continue;
        if (hitCount >= targetCap) break;
        const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
        if (this.rectsOverlap(attackX, attackY, attackW, attackH, z.x, z.y, zDef.width, zDef.height)) {
          this.applySkillDamageToZombie(z, damageMultiplier, skillColor);
          hitCount++;
        }
      }
    }

    const stunMs: number = getSkillStunDurationMs(skill, skillLevel);
    if (stunMs > 0) {
      this.playerStunTicks = Math.floor(stunMs / this.fixedDt);
    }

    this.zombies = this.zombies.filter((z: ZombieState) => !z.isDead || z.hp > -100);
    this.onZombiesUpdate?.(this.zombies);
  }

  private applySkillDamageToZombie(z: ZombieState, damageMultiplier: number, skillColor: string): void {
    if (!this.player) return;
    const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
    const isCrit: boolean = Math.random() * 100 < this.player.derived.critRate;
    let damage: number = Math.max(1, Math.floor(this.player.derived.attack * damageMultiplier) + Math.floor(Math.random() * 5));
    if (isCrit) damage = Math.max(1, Math.floor(damage * this.player.derived.critDamage / 100));

    z.hp -= damage;
    this.applyZombieKnockback(z);
    this.spawnHitParticles(z.x + zDef.width / 2, z.y + zDef.height / 2, skillColor);
    this.spawnDamageNumber(z.x + zDef.width / 2, z.y - 10, damage, isCrit, isCrit ? '#ffaa00' : skillColor);

    if (z.hp <= 0) {
      this.handleZombieDeath(z, zDef);
    }
  }

  private performPullSkill(skill: SkillDefinition, skillLevel: number, playerCX: number, playerCY: number): void {
    if (!this.player) return;

    const rangePercent: number = getSkillRange(skill, skillLevel);
    const pullRange: number = rangePercent * 4;

    this.triggerSkillAnimation(skill.animationKey, playerCX, playerCY, this.player.facing, skillLevel);

    const spreadHalf: number = GAME_CONSTANTS.PLAYER_WIDTH * 2;
    let pulledCount: number = 0;

    for (const z of this.zombies) {
      if (z.isDead) continue;
      if (z.type === ZombieType.Boss || z.type === ZombieType.DragonBoss) continue;
      const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
      const zCX: number = z.x + zDef.width / 2;
      const zCY: number = z.y + zDef.height / 2;
      const dist: number = Math.sqrt((zCX - playerCX) ** 2 + (zCY - playerCY) ** 2);

      if (dist <= pullRange) {
        const offsetX: number = (Math.random() - 0.5) * spreadHalf * 2;
        z.x = this.player.x + offsetX;
        z.y = this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT - zDef.height;
        z.velocityX = 0;
        z.velocityY = 0;
        z.knockbackFrames = 0;

        this.spawnHitParticles(z.x + zDef.width / 2, z.y + zDef.height / 2, skill.color);
        pulledCount++;
      }
    }

    if (pulledCount > 0) {
      this.onZombiesUpdate?.(this.zombies);
    }
    this.onPlayerUpdate?.(this.player);
  }

  private performDashSkill(skill: SkillDefinition, skillLevel: number, playerCX: number, playerCY: number): void {
    if (!this.player) return;

    const range: number = getSkillRange(skill, skillLevel);
    const damageMultiplier: number = getSkillDamageMultiplier(skill, skillLevel);
    const dir: number = this.player.facing === Direction.Right ? 1 : -1;

    const startX: number = this.player.x;
    const endX: number = Math.max(0, Math.min(
      startX + dir * range,
      GAME_CONSTANTS.CANVAS_WIDTH - GAME_CONSTANTS.PLAYER_WIDTH,
    ));

    const corridorLeft: number = Math.min(startX, endX);
    const corridorRight: number = Math.max(startX, endX) + GAME_CONSTANTS.PLAYER_WIDTH;
    const corridorTop: number = this.player.y;
    const corridorHeight: number = GAME_CONSTANTS.PLAYER_HEIGHT;

    const maxTargets: number = 10;
    let hitCount: number = 0;
    const hitZombies: ZombieState[] = [];

    for (const z of this.zombies) {
      if (z.isDead) continue;
      if (hitCount >= maxTargets) break;
      const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
      if (this.rectsOverlap(
        corridorLeft, corridorTop, corridorRight - corridorLeft, corridorHeight,
        z.x, z.y, zDef.width, zDef.height,
      )) {
        hitZombies.push(z);
        hitCount++;
      }
    }

    this.player.x = endX;
    this.player.velocityX = dir * GAME_CONSTANTS.PLAYER_MOVE_SPEED * 2;

    const dashEndCX: number = endX + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    this.triggerSkillAnimation(skill.animationKey, dashEndCX, playerCY, this.player.facing, skillLevel);

    this.player.isAttacking = true;
    setTimeout((): void => {
      if (this.player) this.player.isAttacking = false;
    }, GAME_CONSTANTS.PLAYER_SKILL_ANIM_MS);

    const pushForce: number = GAME_CONSTANTS.KNOCKBACK_FORCE_ZOMBIE * 1.5;
    for (const z of hitZombies) {
      const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
      const isCrit: boolean = Math.random() * 100 < this.player.derived.critRate;
      let damage: number = Math.max(1, Math.floor(this.player.derived.attack * damageMultiplier) + Math.floor(Math.random() * 5));
      if (isCrit) damage = Math.max(1, Math.floor(damage * this.player.derived.critDamage / 100));

      z.hp -= damage;
      z.velocityX = dir * pushForce;
      z.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
      z.isGrounded = false;
      z.knockbackFrames = GAME_CONSTANTS.KNOCKBACK_ZOMBIE_FRAMES * 2;

      this.spawnHitParticles(z.x + zDef.width / 2, z.y + zDef.height / 2, skill.color);
      this.spawnDamageNumber(z.x + zDef.width / 2, z.y - 10, damage, isCrit, isCrit ? '#ffaa00' : skill.color);

      if (z.hp <= 0) {
        this.handleZombieDeath(z, zDef);
      }
    }

    this.zombies = this.zombies.filter((z: ZombieState) => !z.isDead || z.hp > -100);
    this.onZombiesUpdate?.(this.zombies);
    this.onPlayerUpdate?.(this.player);
  }

  private activateBuff(skill: SkillDefinition, level: number): void {
    if (!this.player || !skill.buffEffect || !skill.buffDuration) return;

    const durationMs: number = getBuffDurationMs(skill, level);
    const effectValue: number = getBuffEffectValue(skill, level);

    const existingIdx: number = this.player.activeBuffs.findIndex(
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
      this.player.activeBuffs[existingIdx] = newBuff;
    } else {
      this.player.activeBuffs.push(newBuff);
    }

    const playerCX: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    this.spawnBuffActivationParticles(playerCX, this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2, skill.color);
  }

  private spawnBuffActivationParticles(x: number, y: number, color: string): void {
    if (this.particles.length >= GAME_CONSTANTS.MAX_PARTICLES) return;
    const count: number = 10;
    for (let i: number = 0; i < count; i++) {
      const angle: number = (i / count) * Math.PI * 2;
      const speed: number = 2 + Math.random() * 2;
      this.addParticle({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        life: 30 + Math.floor(Math.random() * 15),
        maxLife: 45,
        color,
        size: Math.random() * 3 + 1.5,
        shape: ParticleShape.Star,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.15,
        fadeMode: FadeMode.Late,
        scaleOverLife: true,
      });
    }
  }

  private updateActiveBuffs(): void {
    if (!this.player) return;

    const beforeCount: number = this.player.activeBuffs.length;

    for (const buff of this.player.activeBuffs) {
      buff.remainingMs -= this.fixedDt;
    }

    this.player.activeBuffs = this.player.activeBuffs.filter(
      (b: ActiveBuff) => b.remainingMs > 0,
    );

    if (this.player.activeBuffs.length !== beforeCount) {
      this.onPlayerUpdate?.(this.player);
    }
  }

  private updatePassiveSkills(): void {
    if (!this.player) return;

    const isStandingStill: boolean =
      this.player.isGrounded &&
      !this.player.isClimbing &&
      Math.abs(this.player.velocityX) < GAME_CONSTANTS.PLAYER_MIN_VELOCITY;

    if (isStandingStill) {
      this.playerStandingStillTicks++;
    } else {
      this.playerStandingStillTicks = 0;
      this.passiveRecoveryTimers.clear();
    }

    const passiveSkills: SkillDefinition[] = SKILLS.filter(
      (s: SkillDefinition) =>
        s.classId === this.player!.classId &&
        s.type === SkillType.Passive &&
        s.passiveEffect !== null &&
        (this.player!.skillLevels[s.id] ?? 0) > 0,
    );

    for (const skill of passiveSkills) {
      const passive: PassiveEffect = skill.passiveEffect!;
      if (passive.condition === 'standingStill' && !isStandingStill) continue;

      const intervalTicks: number = Math.floor(passive.intervalMs / this.fixedDt);
      const elapsed: number = (this.passiveRecoveryTimers.get(skill.id) ?? 0) + 1;

      if (elapsed >= intervalTicks) {
        this.passiveRecoveryTimers.set(skill.id, 0);
        const level: number = this.player.skillLevels[skill.id] ?? 0;
        const value: number = getPassiveEffectValue(skill, level);

        if (passive.type === 'hpRecovery' && this.player.hp < this.player.derived.maxHp) {
          this.player.hp = Math.min(this.player.hp + value, this.player.derived.maxHp);
          const playerCX: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
          this.spawnDamageNumber(playerCX, this.player.y - 10, value, false, '#44ff44');
          this.onPlayerUpdate?.(this.player);
        } else if (passive.type === 'mpRecovery' && this.player.mp < this.player.derived.maxMp) {
          this.player.mp = Math.min(this.player.mp + value, this.player.derived.maxMp);
          const playerCX: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
          this.spawnDamageNumber(playerCX, this.player.y - 10, value, false, '#4488ff');
          this.onPlayerUpdate?.(this.player);
        }
      } else {
        this.passiveRecoveryTimers.set(skill.id, elapsed);
      }
    }
  }

  private updateSkillCooldowns(): void {
    for (const [id, ticks] of this.skillCooldowns) {
      if (ticks > 0) {
        this.skillCooldowns.set(id, ticks - 1);
      }
    }

    if (this.player) {
      const available: SkillDefinition[] = SKILLS.filter(
        (s: SkillDefinition) =>
          s.classId === this.player!.classId &&
          (s.type === SkillType.Active || s.type === SkillType.Buff) &&
          (this.player!.skillLevels[s.id] ?? 0) > 0,
      ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel)
       .slice(0, 6);
      if (available.length !== this.playerUsableSkills.length) {
        this.playerUsableSkills = available;
      }
    }
  }

  private updateZombies(): void {
    if (!this.player) return;

    for (const z of this.zombies) {
      if (z.isDead) continue;
      const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];

      if (z.knockbackFrames > 0) {
        z.knockbackFrames--;
      } else {
        this.updateZombieAI(z, zDef);
      }

      if (z.jumpCooldown > 0) z.jumpCooldown--;
      if (z.attackCooldown > 0) z.attackCooldown--;
      if (z.platformDropTimer > 0) z.platformDropTimer--;

      z.facing = this.player.x > z.x ? 1 : -1;

      this.updateZombieAnimState(z);
      const spriteKey: string = this.zombieSpriteAnimator.getSpriteKey(z.type);
      this.zombieSpriteAnimator.tick(z.id, spriteKey);

      this.updateZombieAttack(z, zDef);

      if (z.type === ZombieType.DragonBoss) {
        const targetY: number = GAME_CONSTANTS.GROUND_Y - zDef.height - GAME_CONSTANTS.DRAGON_HOVER_Y_OFFSET;
        z.velocityY += (targetY - z.y) * 0.04;
        z.velocityY *= 0.85;
        z.x += z.velocityX;
        z.y += z.velocityY;
      } else {
        z.velocityY += GAME_CONSTANTS.GRAVITY;
        if (z.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
          z.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
        }

        z.x += z.velocityX;
        z.y += z.velocityY;

        z.isGrounded = false;
        for (const plat of this.platforms) {
          if (z.platformDropTimer > 0 && plat.y !== GAME_CONSTANTS.GROUND_Y) continue;
          const zBottom: number = z.y + zDef.height;
          const prevZBottom: number = zBottom - z.velocityY;
          if (
            z.x + zDef.width > plat.x &&
            z.x < plat.x + plat.width &&
            zBottom >= plat.y &&
            prevZBottom <= plat.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
            z.velocityY >= 0
          ) {
            z.y = plat.y - zDef.height;
            z.velocityY = 0;
            z.isGrounded = true;
          }
        }
      }

      if (z.type !== ZombieType.DragonBoss && this.invincibilityFrames <= 0 && this.rectsOverlap(
        this.player.x, this.player.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT,
        z.x, z.y, zDef.width, zDef.height,
      )) {
        const baseHit: number = zDef.baseDamageMin + Math.floor(Math.random() * (zDef.baseDamageMax - zDef.baseDamageMin + 1));
        const contactDamage: number = Math.max(1, Math.floor((baseHit - this.player.derived.defense) * GAME_CONSTANTS.ZOMBIE_CONTACT_DAMAGE_MULT));
        this.applyZombieDamageToPlayer(contactDamage, z);
      }
    }
  }

  private updateZombieAttack(z: ZombieState, zDef: ZombieDefinition): void {
    if (!this.player) return;

    if (z.attackAnimTimer > 0) {
      z.attackAnimTimer--;

      const hitTick: number = zDef.attackAnimTicks - zDef.attackHitTick;
      if (z.attackAnimTimer === hitTick && !z.attackHasHit) {
        z.attackHasHit = true;
        if (z.type === ZombieType.DragonBoss) {
          this.spawnDragonProjectile(z, zDef);
        } else if (this.invincibilityFrames <= 0 && this.zombieSwingHitsPlayer(z, zDef)) {
          const baseHit: number = zDef.baseDamageMin + Math.floor(Math.random() * (zDef.baseDamageMax - zDef.baseDamageMin + 1));
          const rawDamage: number = Math.max(1, baseHit - this.player.derived.defense);
          this.applyZombieDamageToPlayer(rawDamage, z);
        }
      }
      return;
    }

    if (z.attackCooldown > 0 || z.knockbackFrames > 0) return;

    const zCenterX: number = z.x + zDef.width / 2;
    const zCenterY: number = z.y + zDef.height / 2;
    const pCenterX: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const pCenterY: number = this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const distX: number = Math.abs(pCenterX - zCenterX);
    const distY: number = Math.abs(pCenterY - zCenterY);

    const isDragon: boolean = z.type === ZombieType.DragonBoss;
    const attackRange: number = isDragon
      ? GAME_CONSTANTS.DRAGON_ATTACK_RANGE
      : zDef.width / 2 + GAME_CONSTANTS.ZOMBIE_ATTACK_RANGE + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const heightCheck: number = isDragon ? GAME_CONSTANTS.DRAGON_ATTACK_RANGE : zDef.height;

    if (distX < attackRange && distY < heightCheck) {
      if (!isDragon && z.attackHesitation > 0) return;
      z.attackAnimTimer = zDef.attackAnimTicks;
      z.attackHasHit = false;
      z.attackCooldown = GAME_CONSTANTS.ZOMBIE_ATTACK_COOLDOWN_MIN +
        Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_ATTACK_COOLDOWN_MAX - GAME_CONSTANTS.ZOMBIE_ATTACK_COOLDOWN_MIN));
      if (!isDragon) {
        z.attackHesitation = GAME_CONSTANTS.ZOMBIE_ATTACK_HESITATION_MIN +
          Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_ATTACK_HESITATION_MAX - GAME_CONSTANTS.ZOMBIE_ATTACK_HESITATION_MIN));
        z.hesitationRange = GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MIN +
          Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MAX - GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MIN));
      }
    }
  }

  private zombieSwingHitsPlayer(z: ZombieState, zDef: ZombieDefinition): boolean {
    if (!this.player) return false;

    const swingX: number = z.facing > 0
      ? z.x + zDef.width
      : z.x - GAME_CONSTANTS.ZOMBIE_ATTACK_RANGE;
    const swingY: number = z.y;
    const swingW: number = GAME_CONSTANTS.ZOMBIE_ATTACK_RANGE;
    const swingH: number = zDef.height;

    return this.rectsOverlap(
      swingX, swingY, swingW, swingH,
      this.player.x, this.player.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT,
    );
  }

  private applyZombieDamageToPlayer(damage: number, z: ZombieState): void {
    if (!this.player || this.invincibilityFrames > 0) return;

    this.player.hp -= damage;
    this.invincibilityFrames = GAME_CONSTANTS.INVINCIBILITY_FRAMES;

    const kbResistBuff: ActiveBuff | undefined = this.player.activeBuffs.find(
      (b: ActiveBuff) => b.stat === 'knockbackResist' && b.remainingMs > 0,
    );
    const resistedKnockback: boolean = !!kbResistBuff && Math.random() * 100 < kbResistBuff.value;

    if (!resistedKnockback) {
      const knockDir: number = this.player.x > z.x ? 1 : -1;
      this.player.velocityX = knockDir * GAME_CONSTANTS.KNOCKBACK_FORCE_PLAYER;
      this.player.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
      this.player.isGrounded = false;
      if (this.player.isClimbing) {
        this.player.isClimbing = false;
      }
    }

    this.spawnHitParticles(this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2, '#ffffff');
    this.spawnDamageNumber(this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, this.player.y - 10, damage, false, '#ff4444');

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.player.isDead = true;
      this.onPlayerUpdate?.(this.player);
      this.onGameOver?.();
      return;
    }
    this.onPlayerUpdate?.(this.player);
  }

  private updateDragonAI(z: ZombieState, zDef: ZombieDefinition): void {
    if (!this.player) return;

    const dx: number = this.player.x - z.x;
    const dist: number = Math.abs(dx);
    const keepDist: number = GAME_CONSTANTS.DRAGON_KEEP_DISTANCE;

    if (z.attackAnimTimer > 0) {
      z.velocityX *= 0.85;
      return;
    }

    if (dist < keepDist * 0.6) {
      z.velocityX = dx > 0 ? -zDef.speed * 1.2 : zDef.speed * 1.2;
    } else if (dist > keepDist * 1.4) {
      z.velocityX = dx > 0 ? zDef.speed * GAME_CONSTANTS.DRAGON_APPROACH_SPEED_MULT : -zDef.speed * GAME_CONSTANTS.DRAGON_APPROACH_SPEED_MULT;
    } else {
      z.velocityX *= 0.92;
    }

    if (z.x < 20) z.velocityX = Math.max(z.velocityX, zDef.speed);
    if (z.x + zDef.width > GAME_CONSTANTS.CANVAS_WIDTH - 20) z.velocityX = Math.min(z.velocityX, -zDef.speed);
  }

  private updateZombieAI(z: ZombieState, zDef: ZombieDefinition): void {
    if (!this.player) return;

    if (z.type === ZombieType.DragonBoss) {
      this.updateDragonAI(z, zDef);
      return;
    }

    if (z.attackCooldown <= 0 && z.attackAnimTimer <= 0 && z.attackHesitation > 0) {
      const effectiveRange: number = GAME_CONSTANTS.ZOMBIE_ATTACK_RANGE + z.hesitationRange;
      const zCx: number = z.x + zDef.width / 2;
      const pCx: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
      const pCy: number = this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
      const zCy: number = z.y + zDef.height / 2;
      const dx: number = Math.abs(pCx - zCx);
      const dy: number = Math.abs(pCy - zCy);
      const inRange: boolean = dx < zDef.width / 2 + effectiveRange + GAME_CONSTANTS.PLAYER_WIDTH / 2
        && dy < zDef.height;
      if (inRange) {
        z.velocityX = 0;
        z.attackHesitation--;
        return;
      }
    }

    const targetX: number = this.player.x + z.orbitOffset;
    const dxToTarget: number = targetX - z.x;
    const dy: number = this.player.y - z.y;
    const playerIsAbove: boolean = dy < -zDef.height;
    const distToPlayer: number = Math.abs(this.player.x - z.x);

    if (Math.abs(dxToTarget) < GAME_CONSTANTS.ZOMBIE_ORBIT_ARRIVE_THRESHOLD) {
      const side: number = z.orbitOffset > 0 ? -1 : 1;
      z.orbitOffset = side * (GAME_CONSTANTS.ZOMBIE_ORBIT_MIN +
        Math.random() * (GAME_CONSTANTS.ZOMBIE_ORBIT_MAX - GAME_CONSTANTS.ZOMBIE_ORBIT_MIN));
    }

    z.velocityX = dxToTarget > 0 ? zDef.speed : -zDef.speed;

    if (!z.isGrounded || z.jumpCooldown > 0) return;

    const playerIsBelow: boolean = dy > zDef.height;

    if (playerIsBelow && z.y + zDef.height < GAME_CONSTANTS.GROUND_Y && Math.random() < GAME_CONSTANTS.ZOMBIE_PLATFORM_DROP_CHANCE) {
      z.platformDropTimer = GAME_CONSTANTS.ZOMBIE_PLATFORM_DROP_TICKS;
      z.y += GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE + 1;
      z.isGrounded = false;
    } else if (playerIsAbove && Math.random() < GAME_CONSTANTS.ZOMBIE_JUMP_PLATFORM_CHASE_CHANCE) {
      this.zombieJump(z);
    } else if (distToPlayer < GAME_CONSTANTS.ZOMBIE_ORBIT_MAX * 2 && Math.random() < GAME_CONSTANTS.ZOMBIE_JUMP_CHANCE_PER_TICK) {
      this.zombieJump(z);
    }
  }

  private updateZombieAnimState(z: ZombieState): void {
    if (z.isDead) {
      this.zombieSpriteAnimator.setState(z.id, ZombieAnimState.Dead);
      return;
    }

    if (z.attackAnimTimer > 0) {
      this.zombieSpriteAnimator.setState(z.id, ZombieAnimState.Attack);
      return;
    }

    if (z.knockbackFrames > 0) {
      this.zombieSpriteAnimator.setState(z.id, ZombieAnimState.Hurt);
      return;
    }

    if (Math.abs(z.velocityX) > 0.1) {
      this.zombieSpriteAnimator.setState(z.id, ZombieAnimState.Walk);
      return;
    }

    this.zombieSpriteAnimator.setState(z.id, ZombieAnimState.Idle);
  }

  private zombieJump(z: ZombieState): void {
    z.velocityY = GAME_CONSTANTS.ZOMBIE_JUMP_FORCE;
    z.isGrounded = false;
    z.jumpCooldown = GAME_CONSTANTS.ZOMBIE_JUMP_COOLDOWN_MIN +
      Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_JUMP_COOLDOWN_MAX - GAME_CONSTANTS.ZOMBIE_JUMP_COOLDOWN_MIN));
  }

  private spawnDragonProjectile(z: ZombieState, zDef: ZombieDefinition): void {
    if (!this.player) return;

    const startX: number = z.x + zDef.width / 2;
    const startY: number = z.y + zDef.height / 2;
    const targetX: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const targetY: number = this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const dx: number = targetX - startX;
    const dy: number = targetY - startY;
    const dist: number = Math.sqrt(dx * dx + dy * dy);
    const speed: number = GAME_CONSTANTS.DRAGON_PROJECTILE_SPEED;

    const baseHit: number = zDef.baseDamageMin + Math.floor(Math.random() * (zDef.baseDamageMax - zDef.baseDamageMin + 1));

    this.dragonProjectiles.push({
      x: startX,
      y: startY,
      velocityX: dist > 0 ? (dx / dist) * speed : speed * z.facing,
      velocityY: dist > 0 ? (dy / dist) * speed : 0,
      damage: baseHit,
      lifetime: GAME_CONSTANTS.DRAGON_PROJECTILE_LIFETIME,
      frame: 0,
      tickCounter: 0,
    });

    this.spawnHitParticles(startX, startY, '#88ccff');
  }

  private updateDragonProjectiles(): void {
    if (!this.player) return;

    for (const p of this.dragonProjectiles) {
      p.x += p.velocityX;
      p.y += p.velocityY;
      p.lifetime--;

      p.tickCounter++;
      if (p.tickCounter >= 5) {
        p.tickCounter = 0;
        p.frame = (p.frame + 1) % this.DRAGON_PROJ_FRAMES;
      }

      if (this.invincibilityFrames <= 0 && this.rectsOverlap(
        this.player.x, this.player.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT,
        p.x - 20, p.y - 20, 40, 40,
      )) {
        const rawDamage: number = Math.max(1, p.damage - this.player.derived.defense);
        this.dragonImpacts.push({ x: p.x, y: p.y, frame: 0, tickCounter: 0 });
        this.spawnHitParticles(p.x, p.y, '#88ccff');
        this.player.hp -= rawDamage;
        this.invincibilityFrames = GAME_CONSTANTS.INVINCIBILITY_FRAMES;
        this.spawnDamageNumber(p.x, p.y - 10, rawDamage, false, '#88ccff');

        const knockDir: number = p.velocityX > 0 ? 1 : -1;
        this.player.velocityX = knockDir * GAME_CONSTANTS.KNOCKBACK_FORCE_PLAYER;
        this.player.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
        this.player.isGrounded = false;

        if (this.player.hp <= 0) {
          this.player.hp = 0;
          this.player.isDead = true;
          this.onPlayerUpdate?.(this.player);
          this.onGameOver?.();
        } else {
          this.onPlayerUpdate?.(this.player);
        }

        p.lifetime = 0;
      }
    }

    this.dragonProjectiles = this.dragonProjectiles.filter(
      (p: DragonProjectile) => p.lifetime > 0 &&
        p.x > -50 && p.x < GAME_CONSTANTS.CANVAS_WIDTH + 50 &&
        p.y > -50 && p.y < GAME_CONSTANTS.CANVAS_HEIGHT + 50,
    );
  }

  private updateDragonImpacts(): void {
    for (const imp of this.dragonImpacts) {
      imp.tickCounter++;
      if (imp.tickCounter >= 5) {
        imp.tickCounter = 0;
        imp.frame++;
      }
    }
    this.dragonImpacts = this.dragonImpacts.filter(
      (imp: DragonImpact) => imp.frame < this.DRAGON_IMPACT_FRAMES,
    );
  }

  private updateSpawning(): void {
    if (this.waveTransitionTimer > 0) {
      this.waveTransitionTimer--;
      return;
    }

    if (this.zombiesSpawnedThisWave >= this.zombiesToSpawnThisWave) return;

    this.spawnTimer--;
    if (this.spawnTimer <= 0) {
      this.spawnZombie();
      this.zombiesSpawnedThisWave++;
      const interval: number = Math.max(
        GAME_CONSTANTS.ZOMBIE_SPAWN_MIN_INTERVAL_MS,
        GAME_CONSTANTS.ZOMBIE_SPAWN_INTERVAL_MS - this.wave * GAME_CONSTANTS.ZOMBIE_SPAWN_DECREASE_PER_WAVE,
      );
      this.spawnTimer = Math.floor(interval / this.fixedDt);
    }
  }

  private spawnZombie(): void {
    const spawnRight: boolean = Math.random() > 0.5;
    const x: number = spawnRight ? GAME_CONSTANTS.CANVAS_WIDTH - 10 : -20;

    let type: ZombieType = ZombieType.Walker;
    const roll: number = Math.random();
    if (this.wave >= GAME_CONSTANTS.ZOMBIE_TANK_MIN_WAVE && roll > GAME_CONSTANTS.ZOMBIE_TANK_ROLL_THRESHOLD) type = ZombieType.Tank;
    else if (this.wave >= GAME_CONSTANTS.ZOMBIE_RUNNER_MIN_WAVE && roll > GAME_CONSTANTS.ZOMBIE_RUNNER_ROLL_THRESHOLD) type = ZombieType.Runner;
    else if (this.wave >= GAME_CONSTANTS.ZOMBIE_SPITTER_MIN_WAVE && roll > GAME_CONSTANTS.ZOMBIE_SPITTER_ROLL_THRESHOLD) type = ZombieType.Spitter;
    if (this.wave >= GAME_CONSTANTS.ZOMBIE_DRAGON_BOSS_MIN_WAVE && this.wave % GAME_CONSTANTS.ZOMBIE_DRAGON_BOSS_WAVE_INTERVAL === 0 && this.zombiesSpawnedThisWave === 0) {
      type = ZombieType.DragonBoss;
    } else if (this.wave >= GAME_CONSTANTS.ZOMBIE_BOSS_MIN_WAVE && this.wave % GAME_CONSTANTS.ZOMBIE_BOSS_WAVE_INTERVAL === 0 && this.zombiesSpawnedThisWave === 0) {
      type = ZombieType.Boss;
    }

    const zDef: ZombieDefinition = ZOMBIE_TYPES[type];
    const hpScale: number = 1 + (this.wave - 1) * GAME_CONSTANTS.ZOMBIE_HP_SCALE_PER_WAVE;

    const zombie: ZombieState = {
      id: crypto.randomUUID(),
      type,
      hp: Math.floor(zDef.baseHp * hpScale),
      maxHp: Math.floor(zDef.baseHp * hpScale),
      x,
      y: GAME_CONSTANTS.GROUND_Y - zDef.height,
      velocityX: 0,
      velocityY: 0,
      isGrounded: true,
      isDead: false,
      target: null,
      knockbackFrames: 0,
      jumpCooldown: GAME_CONSTANTS.ZOMBIE_JUMP_COOLDOWN_MAX,
      attackCooldown: GAME_CONSTANTS.ZOMBIE_ATTACK_COOLDOWN_MAX,
      attackAnimTimer: 0,
      attackHasHit: false,
      attackHesitation: GAME_CONSTANTS.ZOMBIE_ATTACK_HESITATION_MIN +
        Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_ATTACK_HESITATION_MAX - GAME_CONSTANTS.ZOMBIE_ATTACK_HESITATION_MIN)),
      hesitationRange: GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MIN +
        Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MAX - GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MIN)),
      facing: spawnRight ? -1 : 1,
      orbitOffset: (Math.random() > 0.5 ? 1 : -1) *
        (GAME_CONSTANTS.ZOMBIE_ORBIT_MIN + Math.random() * (GAME_CONSTANTS.ZOMBIE_ORBIT_MAX - GAME_CONSTANTS.ZOMBIE_ORBIT_MIN)),
      platformDropTimer: 0,
    };

    this.zombies.push(zombie);
    this.onZombiesUpdate?.(this.zombies);
  }

  private checkWaveCompletion(): void {
    if (
      this.zombiesSpawnedThisWave >= this.zombiesToSpawnThisWave &&
      this.zombies.every((z: ZombieState) => z.isDead)
    ) {
      this.wave++;
      this.waveTransitionTimer = GAME_CONSTANTS.WAVE_TRANSITION_TICKS;
      this.startWave();
      this.onWaveUpdate?.(this.wave, this.zombiesToSpawnThisWave);
    }
  }

  private startWave(): void {
    this.zombiesToSpawnThisWave = GAME_CONSTANTS.WAVE_ZOMBIE_COUNT_BASE + (this.wave - 1) * GAME_CONSTANTS.WAVE_ZOMBIE_COUNT_GROWTH;
    this.zombiesSpawnedThisWave = 0;
    this.zombiesKilledThisWave = 0;
    this.zombies = this.zombies.filter((z: ZombieState) => !z.isDead);
    this.spawnTimer = GAME_CONSTANTS.WAVE_INITIAL_SPAWN_DELAY_TICKS;
    this.onWaveUpdate?.(this.wave, this.zombiesToSpawnThisWave);
  }

  private handleZombieDeath(z: ZombieState, zDef: ZombieDefinition): void {
    z.isDead = true;
    this.zombiesKilledThisWave++;

    const grounded: boolean = z.isGrounded;
    const initialAnim: ZombieAnimState = grounded ? ZombieAnimState.Dead : ZombieAnimState.Hurt;
    this.zombieSpriteAnimator.setState(z.id, initialAnim);

    const lingerTicks: number = GAME_CONSTANTS.ZOMBIE_CORPSE_LINGER_TICKS;
    this.zombieCorpses.push({
      id: z.id,
      type: z.type,
      x: z.x,
      y: z.y,
      width: zDef.width,
      height: zDef.height,
      spriteKey: this.zombieSpriteAnimator.getSpriteKey(z.type),
      facing: z.facing,
      velocityY: grounded ? 0 : z.velocityY,
      isGrounded: grounded,
      fadeTimer: lingerTicks,
      maxFadeTimer: lingerTicks,
    });

    const baseXp: number = ZOMBIE_TYPES[z.type].xpReward;
    const waveBonus: number = 1 + (this.wave - 1) * 0.1;
    const xpReward: number = Math.floor(baseXp * waveBonus);
    this.onXpGained?.(xpReward);
    this.onScoreUpdate?.(xpReward * 10);

    this.rollDrops(z.x + zDef.width / 2, z.y + zDef.height / 2);
  }

  private updateZombieCorpses(): void {
    for (const corpse of this.zombieCorpses) {
      if (!corpse.isGrounded) {
        corpse.velocityY += GAME_CONSTANTS.GRAVITY;
        if (corpse.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
          corpse.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
        }
        corpse.y += corpse.velocityY;

        for (const plat of this.platforms) {
          const bottom: number = corpse.y + corpse.height;
          const prevBottom: number = bottom - corpse.velocityY;
          if (
            corpse.x + corpse.width > plat.x &&
            corpse.x < plat.x + plat.width &&
            bottom >= plat.y &&
            prevBottom <= plat.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
            corpse.velocityY >= 0
          ) {
            corpse.y = plat.y - corpse.height;
            corpse.velocityY = 0;
            corpse.isGrounded = true;
            this.zombieSpriteAnimator.setState(corpse.id, ZombieAnimState.Dead);
          }
        }
      }

      this.zombieSpriteAnimator.tick(corpse.id, corpse.spriteKey);

      if (corpse.isGrounded) {
        corpse.fadeTimer--;
      }
    }

    const expired: ZombieCorpse[] = this.zombieCorpses.filter(
      (c: ZombieCorpse) => c.fadeTimer <= 0,
    );
    for (const corpse of expired) {
      this.zombieSpriteAnimator.removeInstance(corpse.id);
    }

    this.zombieCorpses = this.zombieCorpses.filter(
      (c: ZombieCorpse) => c.fadeTimer > 0,
    );
  }

  private rollDrops(cx: number, cy: number): void {
    const dropX: number = cx - GAME_CONSTANTS.DROP_SIZE / 2;
    const dropY: number = cy - GAME_CONSTANTS.DROP_SIZE / 2;

    if (Math.random() < GAME_CONSTANTS.DROP_HP_POTION_CHANCE) {
      this.spawnDrop(DropType.HpPotion, dropX, dropY, GAME_CONSTANTS.HP_POTION_RESTORE);
    }
    if (Math.random() < GAME_CONSTANTS.DROP_MP_POTION_CHANCE) {
      this.spawnDrop(DropType.MpPotion, dropX + 10, dropY, GAME_CONSTANTS.MP_POTION_RESTORE);
    }
    if (Math.random() < GAME_CONSTANTS.DROP_GOLD_CHANCE) {
      const goldAmount: number = GAME_CONSTANTS.DROP_GOLD_MIN +
        Math.floor(Math.random() * (GAME_CONSTANTS.DROP_GOLD_MAX - GAME_CONSTANTS.DROP_GOLD_MIN)) +
        this.wave * GAME_CONSTANTS.DROP_GOLD_WAVE_BONUS;
      this.spawnDrop(DropType.Gold, dropX - 10, dropY, goldAmount);
    }
  }

  private spawnDrop(type: DropType, x: number, y: number, value: number): void {
    this.worldDrops.push({
      id: crypto.randomUUID(),
      type,
      x,
      y,
      velocityY: GAME_CONSTANTS.DROP_POP_FORCE,
      value,
      lifetime: GAME_CONSTANTS.DROP_LIFETIME,
      isGrounded: false,
    });
  }

  private applyZombieKnockback(z: ZombieState): void {
    if (!this.player) return;
    const knockDir: number = z.x > this.player.x ? 1 : -1;
    z.velocityX = knockDir * GAME_CONSTANTS.KNOCKBACK_FORCE_ZOMBIE;
    z.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
    z.isGrounded = false;
    z.knockbackFrames = GAME_CONSTANTS.KNOCKBACK_ZOMBIE_FRAMES;
  }

  private updateDrops(): void {
    if (!this.player) return;
    const size: number = GAME_CONSTANTS.DROP_SIZE;

    for (const drop of this.worldDrops) {
      if (!drop.isGrounded) {
        drop.velocityY += GAME_CONSTANTS.GRAVITY;
        if (drop.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
          drop.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
        }
        drop.y += drop.velocityY;

        for (const plat of this.platforms) {
          const dropBottom: number = drop.y + size;
          const prevBottom: number = dropBottom - drop.velocityY;
          if (
            drop.x + size > plat.x &&
            drop.x < plat.x + plat.width &&
            dropBottom >= plat.y &&
            prevBottom <= plat.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
            drop.velocityY >= 0
          ) {
            drop.y = plat.y - size;
            drop.velocityY = 0;
            drop.isGrounded = true;
          }
        }
      }

      drop.lifetime--;

      if (this.rectsOverlap(
        this.player.x, this.player.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT,
        drop.x, drop.y, size, size,
      )) {
        this.collectDrop(drop);
      }
    }

    this.worldDrops = this.worldDrops.filter((d: WorldDrop) => d.lifetime > 0);
  }

  private collectDrop(drop: WorldDrop): void {
    if (!this.player) return;
    const cx: number = drop.x + GAME_CONSTANTS.DROP_SIZE / 2;
    const cy: number = drop.y + GAME_CONSTANTS.DROP_SIZE / 2;

    if (drop.type === DropType.Gold) {
      this.player.inventory.gold += drop.value;
      this.onGoldPickup?.(drop.value);
      this.spawnHitParticles(cx, cy, '#ffcc44');
      this.addDropNotification(DropType.Gold, `+${drop.value}G`, '#ffcc44', '💰');
    } else if (drop.type === DropType.HpPotion) {
      this.player.inventory.hpPotions++;
      this.onPotionPickup?.(DropType.HpPotion);
      this.spawnHitParticles(cx, cy, '#ff4488');
      this.addDropNotification(DropType.HpPotion, '+1 HP Potion', '#ff4488', '❤️');
    } else if (drop.type === DropType.MpPotion) {
      this.player.inventory.mpPotions++;
      this.onPotionPickup?.(DropType.MpPotion);
      this.spawnHitParticles(cx, cy, '#4488ff');
      this.addDropNotification(DropType.MpPotion, '+1 MP Potion', '#4488ff', '💧');
    }

    this.onPlayerUpdate?.(this.player);
    drop.lifetime = 0;
  }

  private updatePotionUse(): void {
    if (!this.player) return;
    if (this.potionCooldown > 0) {
      this.potionCooldown--;
      return;
    }

    if (this.keys.useHpPotion) {
      const used: boolean = this.onUseHpPotion?.() ?? false;
      if (used) {
        this.player.hp = Math.min(this.player.hp + GAME_CONSTANTS.HP_POTION_RESTORE, this.player.derived.maxHp);
        this.player.inventory.hpPotions = Math.max(0, this.player.inventory.hpPotions - 1);
        this.potionCooldown = GAME_CONSTANTS.POTION_USE_COOLDOWN_TICKS;
        this.spawnHitParticles(
          this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
          this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
          '#ff4488',
        );
        this.spawnDamageNumber(this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, this.player.y - 10, GAME_CONSTANTS.HP_POTION_RESTORE, false, '#44ff44');
        this.onPlayerUpdate?.(this.player);
      }
    }

    if (this.keys.useMpPotion) {
      const used: boolean = this.onUseMpPotion?.() ?? false;
      if (used) {
        this.player.mp = Math.min(this.player.mp + GAME_CONSTANTS.MP_POTION_RESTORE, this.player.derived.maxMp);
        this.player.inventory.mpPotions = Math.max(0, this.player.inventory.mpPotions - 1);
        this.potionCooldown = GAME_CONSTANTS.POTION_USE_COOLDOWN_TICKS;
        this.spawnHitParticles(
          this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
          this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
          '#4488ff',
        );
        this.spawnDamageNumber(this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, this.player.y - 10, GAME_CONSTANTS.MP_POTION_RESTORE, false, '#4488ff');
        this.onPlayerUpdate?.(this.player);
      }
    }

    if (this.keys.openShop) {
      this.onOpenShop?.();
      this.keys.openShop = false;
    }
  }

  syncProgression(player: CharacterState): void {
    if (!this.player) return;
    const leveled: boolean = player.level > this.player.level;
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
    if (leveled) {
      this.player.hp = player.hp;
      this.player.mp = player.mp;
      this.spawnLevelUpEffect();
    }
    this.playerUsableSkills = SKILLS.filter(
      (s: SkillDefinition) =>
        s.classId === this.player!.classId &&
        (s.type === SkillType.Active || s.type === SkillType.Buff) &&
        (this.player!.skillLevels[s.id] ?? 0) > 0,
    ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel)
     .slice(0, 6);
  }

  private spawnHitParticles(x: number, y: number, color: string): void {
    if (this.particles.length >= GAME_CONSTANTS.MAX_PARTICLES) return;
    for (let i: number = 0; i < GAME_CONSTANTS.HIT_PARTICLE_COUNT; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * GAME_CONSTANTS.HIT_PARTICLE_VELOCITY,
        vy: (Math.random() - 0.5) * GAME_CONSTANTS.HIT_PARTICLE_VELOCITY - GAME_CONSTANTS.HIT_PARTICLE_UP_BIAS,
        life: GAME_CONSTANTS.HIT_PARTICLE_LIFE,
        maxLife: GAME_CONSTANTS.HIT_PARTICLE_LIFE,
        color,
        size: Math.random() * 3 + 1,
        shape: ParticleShape.Square,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: false,
      });
    }
  }

  private addParticle(p: Particle): void {
    if (this.particles.length < GAME_CONSTANTS.MAX_PARTICLES) {
      this.particles.push(p);
    }
  }

  spawnSkillParticles(particles: Particle[]): void {
    for (const p of particles) {
      this.addParticle(p);
    }
  }

  triggerScreenShake(frames: number, intensity: number): void {
    this.screenShakeFrames = frames;
    this.screenShakeIntensity = intensity;
  }

  triggerScreenFlash(color: string, frames: number): void {
    this.screenFlashColor = color;
    this.screenFlashFrames = frames;
  }

  private triggerSkillAnimation(animationKey: string, x: number, y: number, facing: Direction, level: number): void {
    const anim: SkillAnimation | undefined = SKILL_ANIMATIONS[animationKey];
    if (!anim) return;

    const particles: Particle[] = anim.spawnParticles(x, y, facing, level);
    this.spawnSkillParticles(particles);

    if (anim.screenShake > 0) {
      this.triggerScreenShake(anim.screenShake, anim.screenShakeIntensity);
    }
    if (anim.flashColor && anim.flashFrames > 0) {
      this.triggerScreenFlash(anim.flashColor, anim.flashFrames);
    }
    if (anim.spriteEffect && this.spriteEffectSystem.isLoaded()) {
      const flipX: boolean = facing === Direction.Left;
      this.spriteEffectSystem.spawn(anim.spriteEffect, x, y, flipX);
    }
  }

  spawnLevelUpEffect(): void {
    if (!this.player) return;
    const cx: number = this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const cy: number = this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const count: number = 20;
    for (let i: number = 0; i < count; i++) {
      const angle: number = (i / count) * Math.PI * 2;
      const speed: number = 3 + Math.random() * 4;
      this.addParticle({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 40 + Math.floor(Math.random() * 20),
        maxLife: 60,
        color: Math.random() > 0.5 ? '#ffcc44' : '#ffffff',
        size: Math.random() * 4 + 2,
        shape: ParticleShape.Star,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        fadeMode: FadeMode.Late,
        scaleOverLife: true,
      });
    }
    this.triggerScreenFlash('#ffcc44', 8);
  }

  private updateParticles(): void {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += GAME_CONSTANTS.PARTICLE_GRAVITY;
      p.rotation += p.rotationSpeed;
      p.life--;
    }
    this.particles = this.particles.filter((p: Particle) => p.life > 0);
  }

  private spawnDamageNumber(x: number, y: number, value: number, isCrit: boolean, color: string): void {
    this.damageNumbers.push({
      x: x + (Math.random() - 0.5) * 16,
      y,
      value,
      isCrit,
      life: GAME_CONSTANTS.DAMAGE_NUMBER_LIFE_TICKS,
      color,
      vx: (Math.random() - 0.5) * 1.5,
      scale: isCrit ? 1.6 : 1.2,
    });
  }

  private updateDamageNumbers(): void {
    for (const d of this.damageNumbers) {
      d.y -= 1.2;
      d.x += d.vx;
      d.scale = Math.max(1, d.scale - 0.02);
      d.life--;
    }
    this.damageNumbers = this.damageNumbers.filter((d: DamageNumber) => d.life > 0);
  }

  private addDropNotification(type: DropType, label: string, color: string, icon: string): void {
    this.dropNotifications.push({
      type,
      label,
      color,
      icon,
      life: this.DROP_NOTIFICATION_LIFE_TICKS,
      maxLife: this.DROP_NOTIFICATION_LIFE_TICKS,
    });
  }

  private updateDropNotifications(): void {
    for (const n of this.dropNotifications) {
      n.life--;
    }
    this.dropNotifications = this.dropNotifications.filter((n: DropNotification) => n.life > 0);
  }

  private renderDropNotifications(ctx: CanvasRenderingContext2D): void {
    if (this.dropNotifications.length === 0) return;

    const rowHeight: number = 28;
    const padding: number = 8;
    const marginRight: number = 12;
    const marginBottom: number = 12;
    const baseX: number = GAME_CONSTANTS.CANVAS_WIDTH - marginRight;
    const baseY: number = GAME_CONSTANTS.CANVAS_HEIGHT - marginBottom;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i: number = 0; i < this.dropNotifications.length; i++) {
      const n: DropNotification = this.dropNotifications[i];
      const progress: number = n.life / n.maxLife;
      const fadeIn: number = Math.min(1, (n.maxLife - n.life) / 8);
      const fadeOut: number = progress < 0.2 ? progress / 0.2 : 1;
      const alpha: number = fadeIn * fadeOut;

      const rowIdx: number = this.dropNotifications.length - 1 - i;
      const y: number = baseY - rowIdx * rowHeight - rowHeight / 2;

      ctx.globalAlpha = alpha * 0.55;
      const textWidth: number = 140;
      const boxX: number = baseX - textWidth - padding * 2;
      const boxY: number = y - rowHeight / 2;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, textWidth + padding * 2, rowHeight, 4);
      ctx.fill();

      ctx.globalAlpha = alpha;
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.fillStyle = n.color;
      ctx.fillText(`${n.icon} ${n.label}`, baseX - padding, y);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private rectsOverlap(
    x1: number, y1: number, w1: number, h1: number,
    x2: number, y2: number, w2: number, h2: number,
  ): boolean {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }

  private updatePlayerAnimState(): void {
    if (!this.player) return;

    if (this.player.isDead) {
      this.spriteAnimator.setState(PlayerAnimState.Death);
      return;
    }

    if (this.player.isAttacking) {
      this.spriteAnimator.setState(PlayerAnimState.Attack);
      return;
    }

    if (this.player.isClimbing) {
      this.spriteAnimator.setState(PlayerAnimState.Climb);
      return;
    }

    if (!this.player.isGrounded) {
      this.spriteAnimator.setState(PlayerAnimState.Jump);
      return;
    }

    if (Math.abs(this.player.velocityX) > GAME_CONSTANTS.PLAYER_MIN_VELOCITY) {
      this.spriteAnimator.setState(PlayerAnimState.Run);
      return;
    }

    this.spriteAnimator.setState(PlayerAnimState.Idle);
  }

  // --- RENDERING ---

  private render(): void {
    const ctx: CanvasRenderingContext2D = this.ctx;
    ctx.clearRect(0, 0, GAME_CONSTANTS.CANVAS_WIDTH, GAME_CONSTANTS.CANVAS_HEIGHT);

    ctx.save();

    if (this.screenShakeFrames > 0) {
      const shakeX: number = (Math.random() - 0.5) * this.screenShakeIntensity;
      const shakeY: number = (Math.random() - 0.5) * this.screenShakeIntensity;
      ctx.translate(shakeX, shakeY);
      this.screenShakeFrames--;
    }

    if (this.mapRenderer.isLoaded()) {
      this.mapRenderer.render(ctx);
    } else {
      this.renderBackground(ctx);
      this.renderRopes(ctx);
      this.renderPlatforms(ctx);
    }
    this.renderZombies(ctx);
    this.renderDragonProjectiles(ctx);
    this.renderDrops(ctx);
    this.renderPlayer(ctx);
    this.renderParticles(ctx);
    this.spriteEffectSystem.render(ctx);
    this.renderDamageNumbers(ctx);
    this.renderDropNotifications(ctx);
    this.renderWaveInfo(ctx);

    ctx.restore();

    if (this.screenFlashFrames > 0 && this.screenFlashColor) {
      ctx.globalAlpha = this.screenFlashFrames / 10;
      ctx.fillStyle = this.screenFlashColor;
      ctx.fillRect(0, 0, GAME_CONSTANTS.CANVAS_WIDTH, GAME_CONSTANTS.CANVAS_HEIGHT);
      ctx.globalAlpha = 1;
      this.screenFlashFrames--;
    }
  }

  private renderBackground(ctx: CanvasRenderingContext2D): void {
    const gradient: CanvasGradient = ctx.createLinearGradient(0, 0, 0, GAME_CONSTANTS.CANVAS_HEIGHT);
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(0.6, '#0f1428');
    gradient.addColorStop(1, '#1a0a0a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GAME_CONSTANTS.CANVAS_WIDTH, GAME_CONSTANTS.CANVAS_HEIGHT);

    ctx.fillStyle = '#883322';
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.arc(GAME_CONSTANTS.CANVAS_WIDTH * 0.8, 80, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    for (const star of this.backgroundStars) {
      ctx.fillStyle = `rgba(255, 255, 220, ${star.brightness})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
  }

  private renderPlatforms(ctx: CanvasRenderingContext2D): void {
    for (const plat of this.platforms) {
      if (plat.y === GAME_CONSTANTS.GROUND_Y) {
        const grd: CanvasGradient = ctx.createLinearGradient(0, plat.y, 0, plat.y + plat.height);
        grd.addColorStop(0, '#2a1a0a');
        grd.addColorStop(1, '#1a0f05');
        ctx.fillStyle = grd;
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(plat.x, plat.y, plat.width, 4);
      } else {
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        ctx.fillStyle = '#3a3a5a';
        ctx.fillRect(plat.x, plat.y, plat.width, 4);
        ctx.strokeStyle = '#1a1a2a';
        ctx.lineWidth = 1;
        ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);
      }
    }
  }

  private renderPlayer(ctx: CanvasRenderingContext2D): void {
    if (!this.player) return;

    if (this.invincibilityFrames > 0 && Math.floor(this.invincibilityFrames / GAME_CONSTANTS.INVINCIBILITY_BLINK_RATE) % 2 === 0) return;

    const p: CharacterState = this.player;
    const classColor: string = CHARACTER_CLASSES[p.classId].color;
    const spriteSize: number = this.SPRITE_RENDER_SIZE;
    const offsetX: number = (GAME_CONSTANTS.PLAYER_WIDTH - spriteSize) / 2;
    const offsetY: number = GAME_CONSTANTS.PLAYER_HEIGHT - spriteSize;
    const drawX: number = p.x + offsetX;
    const drawY: number = p.y + offsetY;
    const flipX: boolean = p.facing === Direction.Left;

    if (this.spriteAnimator.isLoaded()) {
      this.spriteAnimator.draw(ctx, drawX, drawY, spriteSize, spriteSize, flipX);
    } else {
      ctx.save();
      ctx.translate(p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2);
      if (flipX) ctx.scale(-1, 1);
      ctx.fillStyle = classColor;
      ctx.fillRect(-GAME_CONSTANTS.PLAYER_WIDTH / 2, -GAME_CONSTANTS.PLAYER_HEIGHT / 2, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT);
      ctx.restore();
    }

    ctx.fillStyle = classColor;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y - 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = '9px sans-serif';
    ctx.fillText(`Lv.${p.level}`, p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y - 2);
  }

  private renderZombies(ctx: CanvasRenderingContext2D): void {
    this.renderZombieCorpses(ctx);

    for (const z of this.zombies) {
      if (z.isDead) continue;
      const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];

      if (this.zombieSpriteAnimator.isLoaded()) {
        const spriteKey: string = this.zombieSpriteAnimator.getSpriteKey(z.type);
        const renderW: number = z.type === ZombieType.DragonBoss ? 260 : z.type === ZombieType.Boss ? 200 : 140;
        const renderH: number = renderW;
        const offsetX: number = (zDef.width - renderW) / 2;
        const offsetY: number = zDef.height - renderH;
        const drawX: number = z.x + offsetX;
        const drawY: number = z.y + offsetY;
        const flipX: boolean = z.type === ZombieType.DragonBoss ? z.facing > 0 : z.facing < 0;

        this.zombieSpriteAnimator.draw(ctx, z.id, spriteKey, drawX, drawY, renderW, renderH, flipX);
      } else {
        this.renderZombieFallback(ctx, z, zDef);
      }

      const isDragon: boolean = z.type === ZombieType.DragonBoss;
      const hpPercent: number = z.hp / z.maxHp;
      const barWidth: number = isDragon ? 120 : Math.max(zDef.width, 40);
      const barX: number = z.x + zDef.width / 2 - barWidth / 2;
      const barY: number = z.y - (isDragon ? 55 : 45);
      ctx.fillStyle = '#330000';
      ctx.fillRect(barX, barY, barWidth, isDragon ? 7 : 5);
      ctx.fillStyle = hpPercent > 0.5 ? '#44aa44' : hpPercent > 0.25 ? '#aaaa44' : '#aa4444';
      ctx.fillRect(barX, barY, barWidth * hpPercent, isDragon ? 7 : 5);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, isDragon ? 7 : 5);

      if (isDragon) {
        ctx.fillStyle = '#88ccff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(zDef.name, z.x + zDef.width / 2, barY - 4);
      }
    }
  }

  private renderZombieCorpses(ctx: CanvasRenderingContext2D): void {
    if (!this.zombieSpriteAnimator.isLoaded()) return;

    for (const corpse of this.zombieCorpses) {
      const progress: number = corpse.fadeTimer / corpse.maxFadeTimer;
      const alpha: number = Math.min(1, progress * 2);

      const renderW: number = corpse.type === ZombieType.DragonBoss ? 260 : corpse.type === ZombieType.Boss ? 200 : 140;
      const renderH: number = renderW;
      const offsetX: number = (corpse.width - renderW) / 2;
      const offsetY: number = corpse.height - renderH;
      const drawX: number = corpse.x + offsetX;
      const drawY: number = corpse.y + offsetY;
      const flipX: boolean = corpse.type === ZombieType.DragonBoss ? corpse.facing > 0 : corpse.facing < 0;

      ctx.save();
      ctx.globalAlpha = alpha;
      this.zombieSpriteAnimator.draw(
        ctx, corpse.id, corpse.spriteKey,
        drawX, drawY, renderW, renderH, flipX,
      );
      ctx.restore();
    }
  }

  private renderZombieFallback(ctx: CanvasRenderingContext2D, z: ZombieState, zDef: ZombieDefinition): void {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(z.x, z.y, zDef.width, zDef.height);
    ctx.fillRect(z.x + 1, z.y + 1, zDef.width - 2, zDef.height - 2);

    const eyeY: number = z.y + 8;
    ctx.fillStyle = '#ff2222';
    if (this.player) {
      const lookDir: number = this.player.x > z.x ? 1 : -1;
      ctx.fillRect(z.x + zDef.width / 2 - 6 + lookDir * 2, eyeY, 4, 4);
      ctx.fillRect(z.x + zDef.width / 2 + 2 + lookDir * 2, eyeY, 4, 4);
    }
  }

  private renderDragonProjectiles(ctx: CanvasRenderingContext2D): void {
    if (!this.dragonProjectileImg.complete || !this.dragonImpactImg.complete) return;

    for (const proj of this.dragonProjectiles) {
      const srcX: number = proj.frame * this.DRAGON_PROJ_FRAME_W;
      const renderSize: number = 70 + proj.frame * 10;
      const drawX: number = proj.x - renderSize / 2;
      const drawY: number = proj.y - renderSize / 2;
      const angle: number = Math.atan2(proj.velocityY, proj.velocityX);

      ctx.save();
      ctx.translate(proj.x, proj.y);
      ctx.rotate(angle);
      ctx.drawImage(
        this.dragonProjectileImg,
        srcX, 0, this.DRAGON_PROJ_FRAME_W, this.DRAGON_PROJ_FRAME_H,
        -renderSize / 2, -renderSize / 2, renderSize, renderSize,
      );
      ctx.restore();
    }

    for (const imp of this.dragonImpacts) {
      const srcX: number = imp.frame * this.DRAGON_IMPACT_FRAME_W;
      const renderSize: number = 90 + imp.frame * 15;
      const alpha: number = 1 - imp.frame / this.DRAGON_IMPACT_FRAMES;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        this.dragonImpactImg,
        srcX, 0, this.DRAGON_IMPACT_FRAME_W, this.DRAGON_IMPACT_FRAME_H,
        imp.x - renderSize / 2, imp.y - renderSize / 2, renderSize, renderSize,
      );
      ctx.restore();
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      this.renderParticle(ctx, p);
    }
    ctx.globalAlpha = 1;
  }

  private getParticleAlpha(p: Particle): number {
    const ratio: number = p.life / p.maxLife;
    switch (p.fadeMode) {
      case FadeMode.Quick:
        return ratio * ratio;
      case FadeMode.Late:
        return ratio < 0.3 ? ratio / 0.3 : 1;
      default:
        return ratio;
    }
  }

  private renderParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
    const alpha: number = this.getParticleAlpha(p);
    const scale: number = p.scaleOverLife ? p.life / p.maxLife : 1;
    const size: number = p.size * scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);

    switch (p.shape) {
      case ParticleShape.Circle:
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case ParticleShape.Star:
        this.drawStar(ctx, size);
        break;
      case ParticleShape.Line:
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-size / 2, 0);
        ctx.lineTo(size / 2, 0);
        ctx.stroke();
        break;
      case ParticleShape.Ring:
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.stroke();
        break;
      default:
        ctx.fillRect(-size / 2, -size / 2, size, size);
    }

    ctx.restore();
  }

  private drawStar(ctx: CanvasRenderingContext2D, size: number): void {
    const spikes: number = 5;
    const outerR: number = size / 2;
    const innerR: number = outerR * 0.4;
    ctx.beginPath();
    for (let i: number = 0; i < spikes * 2; i++) {
      const r: number = i % 2 === 0 ? outerR : innerR;
      const angle: number = (i * Math.PI) / spikes - Math.PI / 2;
      const px: number = Math.cos(angle) * r;
      const py: number = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  private renderDrops(ctx: CanvasRenderingContext2D): void {
    for (const drop of this.worldDrops) {
      const size: number = GAME_CONSTANTS.DROP_SIZE;
      const cx: number = drop.x + size / 2;
      const cy: number = drop.y + size / 2;
      const pulse: number = 1 + Math.sin(drop.lifetime * 0.1) * 0.15;
      const r: number = (size / 2) * pulse;

      const colors: Record<DropType, { main: string; highlight: string; label: string }> = {
        [DropType.HpPotion]: { main: '#ff4488', highlight: '#ff88aa', label: 'HP' },
        [DropType.MpPotion]: { main: '#4488ff', highlight: '#88ccff', label: 'MP' },
        [DropType.Gold]: { main: '#ffcc44', highlight: '#ffee88', label: `${drop.value}G` },
      };
      const c: { main: string; highlight: string; label: string } = colors[drop.type];

      ctx.save();
      ctx.shadowColor = c.main;
      ctx.shadowBlur = 12;

      ctx.fillStyle = c.main;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = c.highlight;
      ctx.beginPath();
      ctx.arc(cx - r * 0.2, cy - r * 0.25, r * 0.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.label, cx, cy + size + 6);
      ctx.restore();
    }
  }

  private renderDamageNumbers(ctx: CanvasRenderingContext2D): void {
    for (const d of this.damageNumbers) {
      const progress: number = d.life / GAME_CONSTANTS.DAMAGE_NUMBER_LIFE_TICKS;
      ctx.globalAlpha = Math.min(1, progress * 1.5);

      const baseSize: number = d.isCrit ? 26 : 20;
      const fontSize: number = Math.round(baseSize * d.scale);
      ctx.font = `bold ${fontSize}px 'Segoe UI', Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const text: string = `${d.value}`;

      ctx.save();
      if (d.isCrit) {
        ctx.shadowColor = d.color;
        ctx.shadowBlur = 12;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
      }

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.lineJoin = 'round';
      ctx.strokeText(text, d.x, d.y);

      ctx.fillStyle = d.color;
      ctx.fillText(text, d.x, d.y);

      if (d.isCrit) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha = Math.min(1, progress * 1.5) * 0.4;
        ctx.fillText(text, d.x, d.y);
      }

      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  private renderWaveInfo(ctx: CanvasRenderingContext2D): void {
    const halfTransition: number = GAME_CONSTANTS.WAVE_TRANSITION_TICKS / 2;
    if (this.waveTransitionTimer > halfTransition) {
      ctx.globalAlpha = (this.waveTransitionTimer - halfTransition) / halfTransition;
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`WAVE ${this.wave}`, GAME_CONSTANTS.CANVAS_WIDTH / 2, GAME_CONSTANTS.CANVAS_HEIGHT / 2);
      ctx.globalAlpha = 1;
    }
  }

  private renderRopes(ctx: CanvasRenderingContext2D): void {
    for (const rope of this.ropes) {
      const ropeW: number = GAME_CONSTANTS.ROPE_WIDTH;
      const ropeX: number = rope.x - ropeW / 2;
      const ropeH: number = rope.bottomY - rope.topY;
      const railWidth: number = 4;

      ctx.fillStyle = '#6B4F0A';
      ctx.fillRect(ropeX, rope.topY, railWidth, ropeH);
      ctx.fillRect(ropeX + ropeW - railWidth, rope.topY, railWidth, ropeH);

      ctx.strokeStyle = '#503A08';
      ctx.lineWidth = 1;
      ctx.strokeRect(ropeX, rope.topY, railWidth, ropeH);
      ctx.strokeRect(ropeX + ropeW - railWidth, rope.topY, railWidth, ropeH);

      const rungSpacing: number = 20;
      const rungCount: number = Math.floor(ropeH / rungSpacing);
      for (let i: number = 0; i <= rungCount; i++) {
        const rungY: number = rope.topY + i * rungSpacing;
        ctx.fillStyle = '#A07828';
        ctx.fillRect(ropeX + railWidth, rungY, ropeW - railWidth * 2, 4);
        ctx.fillStyle = '#C09030';
        ctx.fillRect(ropeX + railWidth, rungY, ropeW - railWidth * 2, 2);
      }
    }
  }
}
