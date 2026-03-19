import {
  CharacterState,
  GAME_CONSTANTS,
} from '@shared/index';
import { ZombieState } from '@shared/game-entities';
import { IGameEngine } from './engine-types';
import { PhysicsSystem } from './physics-system';
import { VfxSystem } from './vfx-system';

export class ProjectileSystem {
  constructor(
    private readonly e: IGameEngine,
    private readonly physics: PhysicsSystem,
    private readonly vfx: VfxSystem,
  ) {}

  spawnDragonProjectile(z: ZombieState): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    const startX: number = z.x + z.instanceWidth / 2;
    const startY: number = z.y + z.instanceHeight / 2;
    const targetX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const targetY: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const dx: number = targetX - startX;
    const dy: number = targetY - startY;
    const dist: number = Math.sqrt(dx * dx + dy * dy);
    const speed: number = GAME_CONSTANTS.DRAGON_PROJECTILE_SPEED;

    const baseHit: number = z.instanceDamageMin + Math.floor(Math.random() * (z.instanceDamageMax - z.instanceDamageMin + 1));

    this.e.dragonProjectiles.push({
      x: startX,
      y: startY,
      velocityX: dist > 0 ? (dx / dist) * speed : speed * z.facing,
      velocityY: dist > 0 ? (dy / dist) * speed : 0,
      damage: baseHit,
      lifetime: GAME_CONSTANTS.DRAGON_PROJECTILE_LIFETIME,
      frame: 0,
      tickCounter: 0,
    });

    this.vfx.spawnHitParticles(startX, startY, '#88ccff');
  }

  spawnSpitterProjectile(z: ZombieState): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    const startX: number = z.x + z.instanceWidth / 2;
    const startY: number = z.y + z.instanceHeight * 0.3;
    const targetX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const targetY: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const dx: number = targetX - startX;
    const dy: number = targetY - startY;
    const dist: number = Math.sqrt(dx * dx + dy * dy);
    const speed: number = GAME_CONSTANTS.SPITTER_PROJECTILE_SPEED;

    const baseHit: number = z.instanceDamageMin + Math.floor(Math.random() * (z.instanceDamageMax - z.instanceDamageMin + 1));

    this.e.spitterProjectiles.push({
      x: startX,
      y: startY,
      velocityX: dist > 0 ? (dx / dist) * speed : speed * z.facing,
      velocityY: dist > 0 ? (dy / dist) * speed : 0,
      damage: baseHit,
      lifetime: GAME_CONSTANTS.SPITTER_PROJECTILE_LIFETIME,
      trail: [],
    });

    this.vfx.spawnHitParticles(startX, startY, '#44ff44');
  }

  updateDragonProjectiles(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    for (const proj of this.e.dragonProjectiles) {
      proj.x += proj.velocityX;
      proj.y += proj.velocityY;
      proj.lifetime--;

      proj.tickCounter++;
      if (proj.tickCounter >= 5) {
        proj.tickCounter = 0;
        proj.frame = (proj.frame + 1) % this.e.DRAGON_PROJ_FRAMES;
      }

      if (!this.e.godMode && this.e.invincibilityFrames <= 0 && this.physics.rectsOverlap(
        p.x, p.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT,
        proj.x - 20, proj.y - 20, 40, 40,
      )) {
        const rawDamage: number = Math.max(1, proj.damage - p.derived.defense);
        this.e.dragonImpacts.push({ x: proj.x, y: proj.y, frame: 0, tickCounter: 0 });
        this.vfx.spawnHitParticles(proj.x, proj.y, '#88ccff');
        p.hp -= rawDamage;
        this.e.invincibilityFrames = GAME_CONSTANTS.INVINCIBILITY_FRAMES;
        this.vfx.spawnDamageNumber(proj.x, proj.y - 10, rawDamage, false, '#88ccff');

        const knockDir: number = proj.velocityX > 0 ? 1 : -1;
        p.velocityX = knockDir * GAME_CONSTANTS.KNOCKBACK_FORCE_PLAYER;
        p.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
        p.isGrounded = false;

        if (p.hp <= 0) {
          p.hp = 0;
          p.isDead = true;
          this.e.onPlayerUpdate?.(p);
          this.e.onGameOver?.();
        } else {
          this.e.onPlayerUpdate?.(p);
        }

        proj.lifetime = 0;
      }
    }

    this.e.dragonProjectiles = this.e.dragonProjectiles.filter(
      (proj: { lifetime: number; x: number; y: number }) => proj.lifetime > 0 &&
        proj.x > -50 && proj.x < GAME_CONSTANTS.CANVAS_WIDTH + 50 &&
        proj.y > -50 && proj.y < GAME_CONSTANTS.CANVAS_HEIGHT + 50,
    );
  }

  updateSpitterProjectiles(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    for (const proj of this.e.spitterProjectiles) {
      proj.trail.push({ x: proj.x, y: proj.y, life: 15 });
      if (proj.trail.length > 8) proj.trail.shift();
      for (const t of proj.trail) t.life--;
      proj.trail = proj.trail.filter((t: { x: number; y: number; life: number }) => t.life > 0);

      proj.x += proj.velocityX;
      proj.y += proj.velocityY;
      proj.velocityY += GAME_CONSTANTS.SPITTER_PROJECTILE_GRAVITY;
      proj.lifetime--;

      if (!this.e.godMode && this.e.invincibilityFrames <= 0 && this.physics.rectsOverlap(
        p.x, p.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT,
        proj.x - 10, proj.y - 10, 20, 20,
      )) {
        const rawDamage: number = Math.max(1, proj.damage - p.derived.defense);
        this.vfx.spawnHitParticles(proj.x, proj.y, '#44ff44');
        p.hp -= rawDamage;
        this.e.invincibilityFrames = GAME_CONSTANTS.INVINCIBILITY_FRAMES;
        this.vfx.spawnDamageNumber(proj.x, proj.y - 10, rawDamage, false, '#44ff44');

        const knockDir: number = proj.velocityX > 0 ? 1 : -1;
        p.velocityX = knockDir * GAME_CONSTANTS.KNOCKBACK_FORCE_PLAYER * 0.5;
        p.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE * 0.5;
        p.isGrounded = false;

        this.applyPoisonToPlayer();

        if (p.hp <= 0) {
          p.hp = 0;
          p.isDead = true;
          this.e.onPlayerUpdate?.(p);
          this.e.onGameOver?.();
        } else {
          this.e.onPlayerUpdate?.(p);
        }

        proj.lifetime = 0;
      }
    }

    this.e.spitterProjectiles = this.e.spitterProjectiles.filter(
      (proj: { lifetime: number; x: number; y: number }) => proj.lifetime > 0 &&
        proj.x > -50 && proj.x < GAME_CONSTANTS.CANVAS_WIDTH + 50 &&
        proj.y > -50 && proj.y < GAME_CONSTANTS.CANVAS_HEIGHT + 50,
    );
  }

  private applyPoisonToPlayer(): void {
    const damagePerTick: number = GAME_CONSTANTS.SPITTER_POISON_DAMAGE_PER_TICK +
      Math.floor(this.e.level * GAME_CONSTANTS.SPITTER_POISON_DAMAGE_WAVE_SCALE);
    this.e.poisonEffect = {
      remainingTicks: GAME_CONSTANTS.SPITTER_POISON_DURATION_TICKS,
      tickInterval: GAME_CONSTANTS.SPITTER_POISON_TICK_INTERVAL,
      tickTimer: GAME_CONSTANTS.SPITTER_POISON_TICK_INTERVAL,
      damagePerTick,
    };
  }

  updatePoisonEffect(): void {
    if (!this.e.poisonEffect || !this.e.player || this.e.player.isDead) return;

    this.e.poisonEffect.remainingTicks--;
    this.e.poisonEffect.tickTimer--;

    if (this.e.poisonEffect.tickTimer <= 0) {
      this.e.poisonEffect.tickTimer = this.e.poisonEffect.tickInterval;
      if (!this.e.godMode) {
        this.e.player.hp -= this.e.poisonEffect.damagePerTick;
        this.vfx.spawnDamageNumber(
          this.e.player.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
          this.e.player.y - 10,
          this.e.poisonEffect.damagePerTick,
          false,
          '#00cc44',
        );
        this.vfx.spawnPoisonBubbles();

        if (this.e.player.hp <= 0) {
          this.e.player.hp = 0;
          this.e.player.isDead = true;
          this.e.onPlayerUpdate?.(this.e.player);
          this.e.onGameOver?.();
          this.e.poisonEffect = null;
          return;
        }
        this.e.onPlayerUpdate?.(this.e.player);
      }
    }

    if (this.e.poisonEffect && this.e.poisonEffect.remainingTicks <= 0) {
      this.e.poisonEffect = null;
    }
  }
}
