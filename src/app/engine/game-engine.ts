import {
  CharacterState,
  Direction,
  GAME_CONSTANTS,
  CHARACTER_CLASSES,
  SKILLS,
  SkillDefinition,
  ZOMBIE_TYPES,
} from '@shared/index';
import {
  MpPotionDrop,
  ZombieDefinition,
  ZombieState,
  ZombieType,
} from '@shared/game-entities';
import { InputKeys } from '@shared/messages';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface DamageNumber {
  x: number;
  y: number;
  value: number;
  isCrit: boolean;
  life: number;
  color: string;
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

export class GameEngine {
  readonly ctx: CanvasRenderingContext2D;
  private animationFrameId: number = 0;
  private lastTimestamp: number = 0;
  private accumulator: number = 0;
  private readonly fixedDt: number = 1000 / GAME_CONSTANTS.TICK_RATE;

  private player: CharacterState | null = null;
  private zombies: ZombieState[] = [];
  private particles: Particle[] = [];
  private damageNumbers: DamageNumber[] = [];
  private mpPotions: MpPotionDrop[] = [];
  private platforms: Platform[] = [];
  private ropes: Rope[] = [];
  private keys: InputKeys = { left: false, right: false, up: false, down: false, jump: false, attack: false, skill1: false, skill2: false };
  private attackCooldown: number = 0;
  private invincibilityFrames: number = 0;

  private playerSkills: SkillDefinition[] = [];
  private skillCooldowns: Map<string, number> = new Map();

  private wave: number = 1;
  private zombiesKilledThisWave: number = 0;
  private zombiesToSpawnThisWave: number = 0;
  private zombiesSpawnedThisWave: number = 0;
  private spawnTimer: number = 0;
  private waveTransitionTimer: number = 0;

  private backgroundStars: BackgroundStar[] = [];

  private controlKeyDisplay: { move: string; jump: string; climb: string; attack: string; skill1Key: string; skill2Key: string } = {
    move: 'A/D or Arrows  Move',
    jump: 'W/Up or Space  Jump',
    climb: 'W/S on rope    Climb',
    attack: 'J or Click     Attack',
    skill1Key: 'K',
    skill2Key: 'L',
  };

  onPlayerUpdate: ((player: CharacterState) => void) | null = null;
  onZombiesUpdate: ((zombies: ZombieState[]) => void) | null = null;
  onWaveUpdate: ((wave: number, remaining: number) => void) | null = null;
  onXpGained: ((amount: number) => void) | null = null;
  onScoreUpdate: ((delta: number) => void) | null = null;
  onGameOver: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.canvas.width = GAME_CONSTANTS.CANVAS_WIDTH;
    this.canvas.height = GAME_CONSTANTS.CANVAS_HEIGHT;
    this.initPlatforms();
    this.initRopes();
    this.initStars();
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
    this.particles = [];
    this.damageNumbers = [];
    this.mpPotions = [];
    this.wave = 1;
    this.zombiesKilledThisWave = 0;
    this.playerSkills = SKILLS.filter((s: SkillDefinition) => s.classId === player.classId && s.unlockLevel <= player.level);
    this.skillCooldowns.clear();
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

  setKeys(keys: InputKeys): void {
    this.keys = keys;
  }

  setControlKeyDisplay(display: { move: string; jump: string; climb: string; attack: string; skill1Key: string; skill2Key: string }): void {
    this.controlKeyDisplay = display;
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
    if (!this.player || this.player.isDead) return;

    this.updatePlayer();
    this.updateZombies();
    this.updateSpawning();
    this.updatePotions();
    this.updateParticles();
    this.updateDamageNumbers();
    this.updateSkillCooldowns();
    this.checkWaveCompletion();

    if (this.invincibilityFrames > 0) this.invincibilityFrames--;
  }

  private updatePlayer(): void {
    if (!this.player) return;

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
    for (const rope of this.ropes) {
      const withinX: boolean = Math.abs(playerCenterX - rope.x) < GAME_CONSTANTS.ROPE_GRAB_RANGE;
      const withinY: boolean = playerCenterY >= rope.topY && playerCenterY <= rope.bottomY;
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
    }

    if (this.keys.left || this.keys.right) {
      this.player.isClimbing = false;
    }
  }

  private updateMovement(activeRope: Rope | null): void {
    if (!this.player) return;

    const speed: number = this.player.derived.speed;
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

    if ((this.keys.up || this.keys.jump) && this.player.isGrounded) {
      this.player.velocityY = GAME_CONSTANTS.PLAYER_JUMP_FORCE;
      this.player.isGrounded = false;
    }

    if (this.keys.up && activeRope && !this.player.isGrounded) {
      this.player.isClimbing = true;
      this.player.velocityX = 0;
      this.player.velocityY = 0;
      return;
    }

    if (this.keys.down && activeRope) {
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

  private performAttack(): void {
    if (!this.player) return;

    this.player.isAttacking = true;
    setTimeout(() => {
      if (this.player) this.player.isAttacking = false;
    }, GAME_CONSTANTS.PLAYER_ATTACK_ANIM_MS);

    const attackRange: number = GAME_CONSTANTS.PLAYER_BASE_ATTACK_RANGE;
    const attackX: number = this.player.facing === Direction.Right
      ? this.player.x + GAME_CONSTANTS.PLAYER_WIDTH
      : this.player.x - attackRange;

    for (const z of this.zombies) {
      if (z.isDead) continue;
      const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
      if (this.rectsOverlap(attackX, this.player.y, attackRange, GAME_CONSTANTS.PLAYER_HEIGHT, z.x, z.y, zDef.width, zDef.height)) {
        const isCrit: boolean = Math.random() * 100 < this.player.derived.critRate;
        let damage: number = this.player.derived.attack + Math.floor(Math.random() * 5);
        if (isCrit) damage = Math.floor(damage * this.player.derived.critDamage / 100);

        z.hp -= damage;
        this.applyZombieKnockback(z);
        this.spawnHitParticles(z.x + zDef.width / 2, z.y + zDef.height / 2, '#ff4444');
        this.damageNumbers.push({
          x: z.x + zDef.width / 2,
          y: z.y - 10,
          value: damage,
          isCrit,
          life: GAME_CONSTANTS.DAMAGE_NUMBER_LIFE_TICKS,
          color: isCrit ? '#ffaa00' : '#ffffff',
        });

        if (z.hp <= 0) {
          this.handleZombieDeath(z, zDef);
        }
      }
    }

    this.zombies = this.zombies.filter((z: ZombieState) => !z.isDead || z.hp > -100);
    this.onZombiesUpdate?.(this.zombies);
  }

  private tryPerformSkill(slotIndex: number): void {
    if (!this.player) return;
    const skill: SkillDefinition | undefined = this.playerSkills[slotIndex];
    if (!skill) return;

    const remaining: number = this.skillCooldowns.get(skill.id) ?? 0;
    if (remaining > 0) return;
    if (this.player.mp < skill.mpCost) return;

    this.player.mp -= skill.mpCost;
    this.skillCooldowns.set(skill.id, Math.floor(skill.cooldown / this.fixedDt));

    const isHeal: boolean = skill.damage < 0;
    if (isHeal) {
      const healAmount: number = Math.floor(Math.abs(skill.damage) * this.player.derived.attack);
      this.player.hp = Math.min(this.player.hp + healAmount, this.player.derived.maxHp);
      this.spawnHitParticles(
        this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
        this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
        '#44ff44',
      );
      this.damageNumbers.push({
        x: this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
        y: this.player.y - 10,
        value: healAmount,
        isCrit: false,
        life: GAME_CONSTANTS.DAMAGE_NUMBER_LIFE_TICKS,
        color: '#44ff44',
      });
      this.onPlayerUpdate?.(this.player);
      return;
    }

    this.player.isAttacking = true;
    setTimeout((): void => {
      if (this.player) this.player.isAttacking = false;
    }, GAME_CONSTANTS.PLAYER_SKILL_ANIM_MS);

    const skillRange: number = skill.range;
    const attackX: number = this.player.facing === Direction.Right
      ? this.player.x + GAME_CONSTANTS.PLAYER_WIDTH
      : this.player.x - skillRange;
    const attackW: number = skillRange;
    const attackH: number = skill.range > 100 ? GAME_CONSTANTS.PLAYER_HEIGHT * 2 : GAME_CONSTANTS.PLAYER_HEIGHT;
    const attackY: number = skill.range > 100 ? this.player.y - GAME_CONSTANTS.PLAYER_HEIGHT / 2 : this.player.y;

    const skillColor: string = CHARACTER_CLASSES[this.player.classId].color;

    for (const z of this.zombies) {
      if (z.isDead) continue;
      const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
      if (this.rectsOverlap(attackX, attackY, attackW, attackH, z.x, z.y, zDef.width, zDef.height)) {
        const isCrit: boolean = Math.random() * 100 < this.player.derived.critRate;
        let damage: number = Math.floor(this.player.derived.attack * skill.damage) + Math.floor(Math.random() * 5);
        if (isCrit) damage = Math.floor(damage * this.player.derived.critDamage / 100);

        z.hp -= damage;
        this.applyZombieKnockback(z);
        this.spawnHitParticles(z.x + zDef.width / 2, z.y + zDef.height / 2, skillColor);
        this.damageNumbers.push({
          x: z.x + zDef.width / 2,
          y: z.y - 10,
          value: damage,
          isCrit,
          life: GAME_CONSTANTS.DAMAGE_NUMBER_LIFE_TICKS,
          color: isCrit ? '#ffaa00' : skillColor,
        });

        if (z.hp <= 0) {
          this.handleZombieDeath(z, zDef);
        }
      }
    }

    this.zombies = this.zombies.filter((z: ZombieState) => !z.isDead || z.hp > -100);
    this.onZombiesUpdate?.(this.zombies);
  }

  private updateSkillCooldowns(): void {
    for (const [id, ticks] of this.skillCooldowns) {
      if (ticks > 0) {
        this.skillCooldowns.set(id, ticks - 1);
      }
    }

    if (this.player) {
      const available: SkillDefinition[] = SKILLS.filter(
        (s: SkillDefinition) => s.classId === this.player!.classId && s.unlockLevel <= this.player!.level,
      );
      if (available.length !== this.playerSkills.length) {
        this.playerSkills = available;
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
        const dx: number = this.player.x - z.x;
        z.velocityX = dx > 0 ? zDef.speed : -zDef.speed;
      }

      z.velocityY += GAME_CONSTANTS.GRAVITY;
      if (z.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
        z.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
      }

      z.x += z.velocityX;
      z.y += z.velocityY;

      z.isGrounded = false;
      for (const plat of this.platforms) {
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

      if (this.invincibilityFrames <= 0 && this.rectsOverlap(
        this.player.x, this.player.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT,
        z.x, z.y, zDef.width, zDef.height,
      )) {
        const baseHit: number = zDef.baseDamageMin + Math.floor(Math.random() * (zDef.baseDamageMax - zDef.baseDamageMin + 1));
        const rawDamage: number = Math.max(1, baseHit - this.player.derived.defense);
        this.player.hp -= rawDamage;
        this.invincibilityFrames = GAME_CONSTANTS.INVINCIBILITY_FRAMES;

        const knockDir: number = this.player.x > z.x ? 1 : -1;
        this.player.velocityX = knockDir * GAME_CONSTANTS.KNOCKBACK_FORCE_PLAYER;
        this.player.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
        this.player.isGrounded = false;
        if (this.player.isClimbing) {
          this.player.isClimbing = false;
        }

        this.spawnHitParticles(this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, this.player.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2, '#ffffff');
        this.damageNumbers.push({
          x: this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
          y: this.player.y - 10,
          value: rawDamage,
          isCrit: false,
          life: GAME_CONSTANTS.DAMAGE_NUMBER_LIFE_TICKS,
          color: '#ff4444',
        });

        if (this.player.hp <= 0) {
          this.player.hp = 0;
          this.player.isDead = true;
          this.onPlayerUpdate?.(this.player);
          this.onGameOver?.();
          return;
        }
        this.onPlayerUpdate?.(this.player);
      }
    }
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
    if (this.wave >= GAME_CONSTANTS.ZOMBIE_BOSS_MIN_WAVE && this.wave % GAME_CONSTANTS.ZOMBIE_BOSS_WAVE_INTERVAL === 0 && this.zombiesSpawnedThisWave === 0) type = ZombieType.Boss;

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
    const xpReward: number = ZOMBIE_TYPES[z.type].xpReward;
    this.onXpGained?.(xpReward);
    this.onScoreUpdate?.(xpReward * 10);
    this.spawnDeathParticles(z.x + zDef.width / 2, z.y + zDef.height / 2, zDef.color);

    if (Math.random() < GAME_CONSTANTS.MP_POTION_DROP_CHANCE) {
      this.mpPotions.push({
        id: crypto.randomUUID(),
        x: z.x + zDef.width / 2 - GAME_CONSTANTS.MP_POTION_SIZE / 2,
        y: z.y + zDef.height / 2 - GAME_CONSTANTS.MP_POTION_SIZE / 2,
        velocityY: GAME_CONSTANTS.MP_POTION_POP_FORCE,
        restoreAmount: GAME_CONSTANTS.MP_POTION_RESTORE_AMOUNT,
        lifetime: GAME_CONSTANTS.MP_POTION_LIFETIME,
        isGrounded: false,
      });
    }
  }

  private applyZombieKnockback(z: ZombieState): void {
    if (!this.player) return;
    const knockDir: number = z.x > this.player.x ? 1 : -1;
    z.velocityX = knockDir * GAME_CONSTANTS.KNOCKBACK_FORCE_ZOMBIE;
    z.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
    z.isGrounded = false;
    z.knockbackFrames = GAME_CONSTANTS.KNOCKBACK_ZOMBIE_FRAMES;
  }

  private updatePotions(): void {
    if (!this.player) return;

    for (const potion of this.mpPotions) {
      if (!potion.isGrounded) {
        potion.velocityY += GAME_CONSTANTS.GRAVITY;
        if (potion.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
          potion.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
        }
        potion.y += potion.velocityY;

        for (const plat of this.platforms) {
          const potionBottom: number = potion.y + GAME_CONSTANTS.MP_POTION_SIZE;
          const prevBottom: number = potionBottom - potion.velocityY;
          if (
            potion.x + GAME_CONSTANTS.MP_POTION_SIZE > plat.x &&
            potion.x < plat.x + plat.width &&
            potionBottom >= plat.y &&
            prevBottom <= plat.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
            potion.velocityY >= 0
          ) {
            potion.y = plat.y - GAME_CONSTANTS.MP_POTION_SIZE;
            potion.velocityY = 0;
            potion.isGrounded = true;
          }
        }
      }

      potion.lifetime--;

      if (this.rectsOverlap(
        this.player.x, this.player.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT,
        potion.x, potion.y, GAME_CONSTANTS.MP_POTION_SIZE, GAME_CONSTANTS.MP_POTION_SIZE,
      )) {
        const restoreAmount: number = Math.min(
          potion.restoreAmount,
          this.player.derived.maxMp - this.player.mp,
        );
        if (restoreAmount > 0) {
          this.player.mp += restoreAmount;
          this.damageNumbers.push({
            x: this.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
            y: this.player.y - 10,
            value: restoreAmount,
            isCrit: false,
            life: GAME_CONSTANTS.DAMAGE_NUMBER_LIFE_TICKS,
            color: '#4488ff',
          });
          this.spawnHitParticles(
            potion.x + GAME_CONSTANTS.MP_POTION_SIZE / 2,
            potion.y + GAME_CONSTANTS.MP_POTION_SIZE / 2,
            '#4488ff',
          );
          this.onPlayerUpdate?.(this.player);
        }
        potion.lifetime = 0;
      }
    }

    this.mpPotions = this.mpPotions.filter((p: MpPotionDrop) => p.lifetime > 0);
  }

  syncProgression(player: CharacterState): void {
    if (!this.player) return;
    const leveled: boolean = player.level > this.player.level;
    this.player.level = player.level;
    this.player.xp = player.xp;
    this.player.xpToNext = player.xpToNext;
    this.player.stats = { ...player.stats };
    this.player.derived = { ...player.derived };
    if (leveled) {
      this.player.hp = player.hp;
      this.player.mp = player.mp;
    }
    this.playerSkills = SKILLS.filter(
      (s: SkillDefinition) => s.classId === this.player!.classId && s.unlockLevel <= this.player!.level,
    );
  }

  private spawnHitParticles(x: number, y: number, color: string): void {
    for (let i: number = 0; i < GAME_CONSTANTS.HIT_PARTICLE_COUNT; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * GAME_CONSTANTS.HIT_PARTICLE_VELOCITY,
        vy: (Math.random() - 0.5) * GAME_CONSTANTS.HIT_PARTICLE_VELOCITY - GAME_CONSTANTS.HIT_PARTICLE_UP_BIAS,
        life: GAME_CONSTANTS.HIT_PARTICLE_LIFE,
        maxLife: GAME_CONSTANTS.HIT_PARTICLE_LIFE,
        color,
        size: Math.random() * 3 + 1,
      });
    }
  }

  private spawnDeathParticles(x: number, y: number, color: string): void {
    for (let i: number = 0; i < GAME_CONSTANTS.DEATH_PARTICLE_COUNT; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * GAME_CONSTANTS.DEATH_PARTICLE_VELOCITY,
        vy: (Math.random() - 0.5) * GAME_CONSTANTS.DEATH_PARTICLE_VELOCITY - GAME_CONSTANTS.DEATH_PARTICLE_UP_BIAS,
        life: GAME_CONSTANTS.DEATH_PARTICLE_LIFE,
        maxLife: GAME_CONSTANTS.DEATH_PARTICLE_LIFE,
        color,
        size: Math.random() * 4 + 2,
      });
    }
  }

  private updateParticles(): void {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += GAME_CONSTANTS.PARTICLE_GRAVITY;
      p.life--;
    }
    this.particles = this.particles.filter((p: Particle) => p.life > 0);
  }

  private updateDamageNumbers(): void {
    for (const d of this.damageNumbers) {
      d.y -= 1;
      d.life--;
    }
    this.damageNumbers = this.damageNumbers.filter((d: DamageNumber) => d.life > 0);
  }

  private rectsOverlap(
    x1: number, y1: number, w1: number, h1: number,
    x2: number, y2: number, w2: number, h2: number,
  ): boolean {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }

  // --- RENDERING ---

  private render(): void {
    const ctx: CanvasRenderingContext2D = this.ctx;
    ctx.clearRect(0, 0, GAME_CONSTANTS.CANVAS_WIDTH, GAME_CONSTANTS.CANVAS_HEIGHT);

    this.renderBackground(ctx);
    this.renderRopes(ctx);
    this.renderPlatforms(ctx);
    this.renderZombies(ctx);
    this.renderPotions(ctx);
    this.renderPlayer(ctx);
    this.renderParticles(ctx);
    this.renderDamageNumbers(ctx);
    this.renderWaveInfo(ctx);
    this.renderControls(ctx);
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

    ctx.save();
    ctx.translate(p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2);
    if (p.facing === Direction.Left) ctx.scale(-1, 1);

    ctx.fillStyle = classColor;
    ctx.fillRect(-GAME_CONSTANTS.PLAYER_WIDTH / 2, -GAME_CONSTANTS.PLAYER_HEIGHT / 2, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, -GAME_CONSTANTS.PLAYER_HEIGHT / 2 + 10, 6, 6);
    ctx.fillRect(12, -GAME_CONSTANTS.PLAYER_HEIGHT / 2 + 10, 6, 6);

    if (p.isAttacking) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.fillRect(GAME_CONSTANTS.PLAYER_WIDTH / 2, -4, 30, 8);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    ctx.fillStyle = classColor;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y - 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = '9px sans-serif';
    ctx.fillText(`Lv.${p.level}`, p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y - 2);
  }

  private renderZombies(ctx: CanvasRenderingContext2D): void {
    for (const z of this.zombies) {
      if (z.isDead) continue;
      const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];

      ctx.fillStyle = zDef.color;
      ctx.fillRect(z.x, z.y, zDef.width, zDef.height);

      ctx.fillStyle = '#ff0000';
      ctx.fillRect(z.x, z.y, zDef.width, zDef.height);
      ctx.fillStyle = zDef.color;
      ctx.fillRect(z.x + 1, z.y + 1, zDef.width - 2, zDef.height - 2);

      const eyeY: number = z.y + 8;
      ctx.fillStyle = '#ff2222';
      if (this.player) {
        const lookDir: number = this.player.x > z.x ? 1 : -1;
        ctx.fillRect(z.x + zDef.width / 2 - 6 + lookDir * 2, eyeY, 4, 4);
        ctx.fillRect(z.x + zDef.width / 2 + 2 + lookDir * 2, eyeY, 4, 4);
      }

      const hpPercent: number = z.hp / z.maxHp;
      const barWidth: number = zDef.width;
      ctx.fillStyle = '#330000';
      ctx.fillRect(z.x, z.y - 6, barWidth, 4);
      ctx.fillStyle = hpPercent > 0.5 ? '#44aa44' : hpPercent > 0.25 ? '#aaaa44' : '#aa4444';
      ctx.fillRect(z.x, z.y - 6, barWidth * hpPercent, 4);
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private renderPotions(ctx: CanvasRenderingContext2D): void {
    for (const potion of this.mpPotions) {
      const size: number = GAME_CONSTANTS.MP_POTION_SIZE;
      const cx: number = potion.x + size / 2;
      const cy: number = potion.y + size / 2;
      const pulse: number = 1 + Math.sin(potion.lifetime * 0.1) * 0.15;
      const r: number = (size / 2) * pulse;

      ctx.save();
      ctx.shadowColor = '#4488ff';
      ctx.shadowBlur = 12;

      ctx.fillStyle = '#4488ff';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#88ccff';
      ctx.beginPath();
      ctx.arc(cx - r * 0.2, cy - r * 0.25, r * 0.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MP', cx, cy + size + 6);
      ctx.restore();
    }
  }

  private renderDamageNumbers(ctx: CanvasRenderingContext2D): void {
    for (const d of this.damageNumbers) {
      ctx.globalAlpha = d.life / GAME_CONSTANTS.DAMAGE_NUMBER_LIFE_TICKS;
      ctx.font = d.isCrit ? 'bold 18px sans-serif' : 'bold 14px sans-serif';
      ctx.fillStyle = d.color;
      ctx.textAlign = 'center';
      ctx.fillText(`${d.value}`, d.x, d.y);
    }
    ctx.globalAlpha = 1;
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

      ctx.fillStyle = '#8B6914';
      ctx.fillRect(ropeX, rope.topY, ropeW, ropeH);

      ctx.fillStyle = '#A07828';
      const knotSpacing: number = 24;
      const knotCount: number = Math.floor(ropeH / knotSpacing);
      for (let i: number = 0; i <= knotCount; i++) {
        const knotY: number = rope.topY + i * knotSpacing;
        ctx.fillRect(ropeX - 2, knotY, ropeW + 4, 4);
      }

      ctx.strokeStyle = '#6B4F0A';
      ctx.lineWidth = 1;
      ctx.strokeRect(ropeX, rope.topY, ropeW, ropeH);
    }
  }

  private renderControls(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#000000';
    const boxW: number = 230;
    const boxH: number = 135;
    const boxX: number = GAME_CONSTANTS.CANVAS_WIDTH - boxW - 10;
    const boxY: number = GAME_CONSTANTS.CANVAS_HEIGHT - boxH - 10;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#cccccc';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    const x: number = boxX + 10;
    let y: number = boxY + 18;
    const lineH: number = 16;

    ctx.fillStyle = '#ffcc44';
    ctx.fillText('HOW TO PLAY', x, y);
    y += lineH + 2;

    ctx.fillStyle = '#aaaacc';
    ctx.fillText(this.controlKeyDisplay.move, x, y);
    y += lineH;
    ctx.fillText(this.controlKeyDisplay.jump, x, y);
    y += lineH;
    ctx.fillText(this.controlKeyDisplay.climb, x, y);
    y += lineH;
    ctx.fillText(this.controlKeyDisplay.attack, x, y);
    y += lineH;

    const skill1: SkillDefinition | undefined = this.playerSkills[0];
    const skill2: SkillDefinition | undefined = this.playerSkills[1];
    const s1Name: string = skill1 ? skill1.name : 'Locked';
    const s2Name: string = skill2 ? skill2.name : 'Locked';

    ctx.fillStyle = '#44ccff';
    ctx.fillText(`${this.controlKeyDisplay.skill1Key}  Skill 1: ${s1Name}`, x, y);
    y += lineH;
    ctx.fillText(`${this.controlKeyDisplay.skill2Key}  Skill 2: ${s2Name}`, x, y);
  }
}
