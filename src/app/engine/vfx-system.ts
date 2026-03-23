import {
  CharacterState,
  Direction,
  GAME_CONSTANTS,
} from '@shared/index';
import { DropType } from '@shared/game-entities';
import { Particle, ParticleShape, FadeMode } from './particle-types';
import { SKILL_ANIMATIONS, SkillAnimation } from './skill-animations';
import { DamageNumber, DropNotification, IGameEngine } from './engine-types';

export class VfxSystem {
  constructor(private readonly e: IGameEngine) {}

  spawnHitParticles(x: number, y: number, color: string): void {
    if (this.e.particles.length >= GAME_CONSTANTS.MAX_PARTICLES) return;
    for (let i: number = 0; i < GAME_CONSTANTS.HIT_PARTICLE_COUNT; i++) {
      this.e.particles.push({
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

  addParticle(p: Particle): void {
    if (this.e.particles.length < GAME_CONSTANTS.MAX_PARTICLES) {
      this.e.particles.push(p);
    }
  }

  spawnSkillParticles(particles: Particle[]): void {
    for (const p of particles) {
      this.addParticle(p);
    }
  }

  spawnDamageNumber(x: number, y: number, value: number, isCrit: boolean, color: string): void {
    this.e.damageNumbers.push({
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

  addDropNotification(type: DropType, label: string, color: string, icon: string): void {
    this.e.dropNotifications.push({
      type,
      label,
      color,
      icon,
      life: this.e.DROP_NOTIFICATION_LIFE_TICKS,
      maxLife: this.e.DROP_NOTIFICATION_LIFE_TICKS,
    });
  }

  triggerScreenShake(frames: number, intensity: number): void {
    this.e.screenShakeFrames = frames;
    this.e.screenShakeIntensity = intensity;
  }

  triggerScreenFlash(color: string, frames: number): void {
    this.e.screenFlashColor = color;
    this.e.screenFlashFrames = frames;
  }

  triggerSkillAnimation(animationKey: string, x: number, y: number, facing: Direction, level: number): void {
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
    if (anim.spriteEffect && this.e.spriteEffectSystem.isLoaded()) {
      const flipX: boolean = facing === Direction.Left;
      this.e.spriteEffectSystem.spawn(anim.spriteEffect, x, y, flipX);
    }
  }

  spawnLevelUpEffect(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const cy: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
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

  spawnLevelUpEffectAt(cx: number, cy: number): void {
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

  spawnPortalVortex(cx: number, cy: number, inward: boolean): void {
    const spiralCount: number = 24;
    for (let i: number = 0; i < spiralCount; i++) {
      const angle: number = (i / spiralCount) * Math.PI * 2;
      const radius: number = inward ? (50 + Math.random() * 40) : 4;
      const tangentAngle: number = angle + (inward ? Math.PI / 2 : -Math.PI / 2);
      const radialSpeed: number = inward ? -(3 + Math.random() * 3) : (5 + Math.random() * 4);
      const tangentSpeed: number = 2 + Math.random() * 2;
      this.addParticle({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: Math.cos(angle) * radialSpeed + Math.cos(tangentAngle) * tangentSpeed,
        vy: Math.sin(angle) * radialSpeed + Math.sin(tangentAngle) * tangentSpeed,
        life: 28 + Math.floor(Math.random() * 12),
        maxLife: 40,
        color: i % 4 === 0 ? '#ffffff' : i % 4 === 1 ? '#bb66ff' : i % 4 === 2 ? '#6644ff' : '#ff8844',
        size: 5 + Math.random() * 5,
        shape: ParticleShape.Star,
        rotation: angle,
        rotationSpeed: (inward ? 0.4 : -0.4) + (Math.random() - 0.5) * 0.1,
        fadeMode: FadeMode.Late,
        scaleOverLife: true,
      });
    }
    const vertSlitCount: number = 10;
    for (let i: number = 0; i < vertSlitCount; i++) {
      const yOff: number = (i / vertSlitCount - 0.5) * 80;
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 6,
        y: cy + yOff,
        vx: (Math.random() - 0.5) * 0.5,
        vy: inward ? -yOff * 0.08 : yOff * 0.06,
        life: 18 + Math.floor(Math.random() * 8),
        maxLife: 26,
        color: '#ddaaff',
        size: 3 + Math.random() * 3,
        shape: ParticleShape.Line,
        rotation: Math.PI / 2,
        rotationSpeed: 0,
        fadeMode: FadeMode.Quick,
        scaleOverLife: true,
      });
    }
    const ringCount: number = 16;
    for (let i: number = 0; i < ringCount; i++) {
      const angle: number = (i / ringCount) * Math.PI * 2;
      const speed: number = inward ? 1.5 : (3 + Math.random() * 2.5);
      this.addParticle({
        x: cx + Math.cos(angle) * (inward ? 35 : 8),
        y: cy + Math.sin(angle) * (inward ? 35 : 8),
        vx: (inward ? -1 : 1) * Math.cos(angle) * speed,
        vy: (inward ? -1 : 1) * Math.sin(angle) * speed * 0.5 - 1.2,
        life: 22,
        maxLife: 28,
        color: '#cc88ff',
        size: 5 + Math.random() * 4,
        shape: ParticleShape.Ring,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Late,
        scaleOverLife: true,
      });
    }
  }

  spawnBuffActivationParticles(x: number, y: number, color: string): void {
    if (this.e.particles.length >= GAME_CONSTANTS.MAX_PARTICLES) return;
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

  spawnPoisonBubbles(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const cy: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    for (let i: number = 0; i < 3; i++) {
      this.e.particles.push({
        x: cx + (Math.random() - 0.5) * GAME_CONSTANTS.PLAYER_WIDTH,
        y: cy + (Math.random() - 0.5) * GAME_CONSTANTS.PLAYER_HEIGHT,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -Math.random() * 2 - 1,
        life: 20 + Math.floor(Math.random() * 10),
        maxLife: 30,
        color: Math.random() > 0.5 ? '#44ff44' : '#00cc44',
        size: 3 + Math.random() * 3,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Quick,
        scaleOverLife: true,
      });
    }
  }

  spawnHitMark(x: number, y: number): void {
    this.e.hitMarks.push({ x, y, frame: 0, tickCounter: 0 });
  }

  updateParticles(): void {
    for (const p of this.e.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += GAME_CONSTANTS.PARTICLE_GRAVITY;
      p.rotation += p.rotationSpeed;
      p.life--;
    }
    this.e.particles = this.e.particles.filter((p: Particle) => p.life > 0);
  }

  updateDamageNumbers(): void {
    for (const d of this.e.damageNumbers) {
      d.y -= 1.2;
      d.x += d.vx;
      d.scale = Math.max(1, d.scale - 0.02);
      d.life--;
    }
    this.e.damageNumbers = this.e.damageNumbers.filter((d: DamageNumber) => d.life > 0);
  }

  updateDropNotifications(): void {
    for (const n of this.e.dropNotifications) {
      n.life--;
    }
    this.e.dropNotifications = this.e.dropNotifications.filter((n: DropNotification) => n.life > 0);
  }

  updateHitMarks(): void {
    for (const hm of this.e.hitMarks) {
      hm.tickCounter++;
      if (hm.tickCounter >= this.e.HIT_MARK_TICKS_PER_FRAME) {
        hm.tickCounter = 0;
        hm.frame++;
      }
    }
    this.e.hitMarks = this.e.hitMarks.filter(
      (hm: { frame: number }) => hm.frame < this.e.DRAGON_IMPACT_FRAMES,
    );
  }

  updateDragonImpacts(): void {
    for (const imp of this.e.dragonImpacts) {
      imp.tickCounter++;
      if (imp.tickCounter >= 5) {
        imp.tickCounter = 0;
        imp.frame++;
      }
    }
    this.e.dragonImpacts = this.e.dragonImpacts.filter(
      (imp: { frame: number }) => imp.frame < this.e.DRAGON_IMPACT_FRAMES,
    );
  }
}
