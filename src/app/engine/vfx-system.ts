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

  spawnPoisonBubblesAt(cx: number, cy: number): void {
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

  spawnDashTrailBurst(startCX: number, endCX: number, playerCY: number, dir: number): void {
    const cometCount: number = 16;
    for (let i: number = 0; i < cometCount; i++) {
      const t: number = i / cometCount;
      const x: number = startCX + (endCX - startCX) * t;
      this.addParticle({
        x,
        y: playerCY + (Math.random() - 0.5) * 8,
        vx: dir * (14 + Math.random() * 6),
        vy: (Math.random() - 0.5) * 1.2,
        life: 16 + Math.floor(t * 6),
        maxLife: 22,
        color: '#ffffff',
        size: 7 + Math.random() * 4,
        shape: ParticleShape.Line,
        rotation: dir > 0 ? 0 : Math.PI,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: true,
      });
    }
    const pathLen: number = Math.abs(endCX - startCX);
    const ringSegments: number = Math.max(3, Math.floor(pathLen / 80));
    for (let s: number = 0; s < ringSegments; s++) {
      const t: number = (s + 0.5) / ringSegments;
      const rx: number = startCX + (endCX - startCX) * t;
      const expandCount: number = 8;
      for (let i: number = 0; i < expandCount; i++) {
        const angle: number = (i / expandCount) * Math.PI * 2;
        this.addParticle({
          x: rx,
          y: playerCY,
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
        });
      }
    }
  }

  spawnThrowingStarTrail(fromX: number, fromY: number, toX: number, toY: number, color: string): void {
    const dx: number = toX - fromX;
    const dy: number = toY - fromY;
    const dist: number = Math.sqrt(dx * dx + dy * dy);
    const nx: number = dist > 0 ? dx / dist : 1;
    const ny: number = dist > 0 ? dy / dist : 0;
    const gravity: number = GAME_CONSTANTS.PARTICLE_GRAVITY;
    const speed: number = 14;

    for (let s: number = 0; s < 3; s++) {
      const spread: number = (s - 1) * 6;
      const life: number = 30;
      this.addParticle({
        x: fromX,
        y: fromY + spread,
        vx: nx * speed + (Math.random() - 0.5) * 2,
        vy: ny * speed - gravity * life * 0.5 + (Math.random() - 0.5) * 2,
        life,
        maxLife: life,
        color: s === 1 ? '#ffffff' : color,
        size: 10 + Math.random() * 4,
        shape: ParticleShape.Star,
        rotation: 0,
        rotationSpeed: 0.8,
        fadeMode: FadeMode.Late,
        scaleOverLife: false,
      });
    }

    const trailCount: number = 10;
    for (let i: number = 0; i < trailCount; i++) {
      const t: number = (i + 1) / (trailCount + 1);
      const delay: number = t * 0.4;
      const trailLife: number = 22;
      this.addParticle({
        x: fromX + dx * delay,
        y: fromY + dy * delay + (Math.random() - 0.5) * 10,
        vx: nx * speed * 0.3 + (Math.random() - 0.5) * 2,
        vy: ny * speed * 0.3 - gravity * trailLife * 0.5,
        life: trailLife,
        maxLife: trailLife,
        color: i % 2 === 0 ? color : '#ff88ff',
        size: 5 + Math.random() * 3,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Quick,
        scaleOverLife: true,
      });
    }

    const burstCount: number = 8;
    for (let i: number = 0; i < burstCount; i++) {
      const angle: number = (i / burstCount) * Math.PI * 2;
      const burstSpeed: number = 3 + Math.random() * 3;
      const burstLife: number = 18;
      this.addParticle({
        x: toX,
        y: toY,
        vx: Math.cos(angle) * burstSpeed,
        vy: Math.sin(angle) * burstSpeed - gravity * burstLife * 0.5,
        life: burstLife,
        maxLife: burstLife,
        color: i % 2 === 0 ? '#ffffff' : color,
        size: 6 + Math.random() * 3,
        shape: ParticleShape.Star,
        rotation: angle,
        rotationSpeed: 0.4,
        fadeMode: FadeMode.Quick,
        scaleOverLife: true,
      });
    }
  }

  spawnHitMark(x: number, y: number): void {
    this.e.hitMarks.push({ x, y, frame: 0, tickCounter: 0 });
  }

  /** Wood splinters flying off the boulder's gate as it gives way, and a short shake. */
  spawnGateBreak(cx: number, cy: number): void {
    const woods: string[] = ['#a0703c', '#7a5230', '#c89858'];
    for (let i: number = 0; i < 28; i++) {
      const life: number = 35 + Math.floor(Math.random() * 25);
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 12,
        y: cy + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 9,
        vy: -2 - Math.random() * 4,
        life,
        maxLife: life,
        color: woods[i % woods.length],
        size: 2 + Math.random() * 4,
        shape: ParticleShape.Line,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.4,
        fadeMode: FadeMode.Late,
        scaleOverLife: false,
      });
    }
    this.triggerScreenShake(10, 4);
  }

  /** The exit cage slams down on the ground: a wide dust cloud from under it and a heavy shake. */
  spawnCageLand(cx: number, groundY: number): void {
    for (let i: number = 0; i < 30; i++) {
      const life: number = 35 + Math.floor(Math.random() * 25);
      const side: number = i % 2 === 0 ? 1 : -1;
      this.addParticle({
        x: cx + side * (40 + Math.random() * 40),
        y: groundY - Math.random() * 12,
        vx: side * (1 + Math.random() * 4),
        vy: -0.5 - Math.random() * 1.5,
        life,
        maxLife: life,
        color: 'rgba(200, 184, 154, 0.75)',
        size: 8 + Math.random() * 12,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: true,
      });
    }
    this.triggerScreenShake(12, 6);
  }

  /** The zombie cage smashes open: bent bars and splinters fly out, green gore splashes. */
  spawnCageSmash(cx: number, cy: number): void {
    const colors: string[] = ['#8a8f98', '#5a5f68', '#a0703c', '#6abf4b', '#3f7a2c'];
    for (let i: number = 0; i < 40; i++) {
      const life: number = 35 + Math.floor(Math.random() * 25);
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 100,
        y: cy + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 12,
        vy: -3 - Math.random() * 6,
        life,
        maxLife: life,
        color: colors[i % colors.length],
        size: 2 + Math.random() * 5,
        shape: i % 5 >= 3 ? ParticleShape.Circle : ParticleShape.Line,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.4,
        fadeMode: FadeMode.Late,
        scaleOverLife: false,
      });
    }
    this.triggerScreenShake(14, 7);
  }

  /**
   * The spring lets go: a dust cloud puffs out from its base and a rising streak of wind lines
   * shoots up over it as it launches everyone.
   */
  spawnSpringLaunch(cx: number, topY: number): void {
    for (let i: number = 0; i < 26; i++) {
      const life: number = 35 + Math.floor(Math.random() * 20);
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 160,
        y: GAME_CONSTANTS.GROUND_Y - Math.random() * 16,
        vx: (Math.random() - 0.5) * 6,
        vy: -0.5 - Math.random() * 1.5,
        life,
        maxLife: life,
        color: 'rgba(200, 184, 154, 0.75)',
        size: 8 + Math.random() * 12,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: true,
      });
    }
    for (let i: number = 0; i < 22; i++) {
      const life: number = 25 + Math.floor(Math.random() * 15);
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 150,
        y: topY - Math.random() * 30,
        vx: 0,
        vy: -9 - Math.random() * 6,
        life,
        maxLife: life,
        color: i % 2 === 0 ? '#ffffff' : '#aaeeff',
        size: 6 + Math.random() * 10,
        shape: ParticleShape.Line,
        rotation: Math.PI / 2,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: false,
      });
    }
    this.triggerScreenShake(14, 6);
  }

  /** Stone debris down the whole wall, a dust cloud at the impact, and a heavy shake. */
  spawnWallBreak(cx: number, impactY: number): void {
    const stones: string[] = ['#6b6b78', '#8a8a96', '#4a4a55', '#a89c88'];
    for (let i: number = 0; i < 60; i++) {
      const life: number = 50 + Math.floor(Math.random() * 30);
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 64,
        y: Math.random() * GAME_CONSTANTS.GROUND_Y,
        vx: (Math.random() - 0.5) * 8,
        vy: -2 - Math.random() * 5,
        life,
        maxLife: life,
        color: stones[i % stones.length],
        size: 3 + Math.random() * 6,
        shape: ParticleShape.Square,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        fadeMode: FadeMode.Late,
        scaleOverLife: false,
      });
    }
    for (let i: number = 0; i < 24; i++) {
      const life: number = 40 + Math.floor(Math.random() * 20);
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 80,
        y: impactY - Math.random() * 40,
        vx: (Math.random() - 0.5) * 3,
        vy: -0.5 - Math.random(),
        life,
        maxLife: life,
        color: 'rgba(190, 180, 160, 0.7)',
        size: 10 + Math.random() * 14,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: true,
      });
    }
    this.triggerScreenShake(24, 10);
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
