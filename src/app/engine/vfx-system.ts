import {
  CharacterState,
  Direction,
  GAME_CONSTANTS,
  VfxEventType,
} from '@shared/index';
import { DropType, ZombieType } from '@shared/game-entities';
import { ChunkSource, Particle, ParticleChunk, ParticleShape, FadeMode } from './particle-types';
import { BOULDER_ART_CELLS, crackedWallStones } from './puzzle-art';
import { SKILL_ANIMATIONS, SkillAnimation } from './skill-animations';
import { AcidPuddle, BarrelBlastFx, DamageNumber, DropNotification, IGameEngine, PlayerTint } from './engine-types';
import { PixelIconId } from '@shared/pixel-icon';
import { lightningStrikeX, nextLightningDelayMs } from './storm';
import { ART_PX, PIXEL } from './pixel-art';
import { BILE_COLORS } from './spit-art';
import { Point, spitterMouth } from './spitter-spit';
import { ZombieAnimState } from './zombie-sprite-animator';

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

  /** Local hurt tint on the hit player plus the event that shows it on every other screen. */
  flashPlayerHurt(p: CharacterState): void {
    this.tintPlayerHurt(p.id);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.PlayerHurt,
      playerId: p.id,
      x: p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
      y: p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
    });
  }

  /** Red flash in the shape of the player's sprite. */
  tintPlayerHurt(playerId: string): void {
    this.tintFor(playerId).hurtTicks = GAME_CONSTANTS.PLAYER_HURT_TINT_TICKS;
  }

  /** Sickly green sprite while the spitter poison lasts (its trigger is synced as PoisonTrigger). */
  tintPlayerPoisoned(playerId: string): void {
    this.tintFor(playerId).poisonTicks = GAME_CONSTANTS.SPITTER_POISON_DURATION_TICKS;
  }

  /** Every client, every tick: tints run out; a poisoned player (any) bubbles and drips bile. */
  updatePlayerTints(): void {
    for (const [id, tint] of this.e.playerTints) {
      if (tint.hurtTicks > 0) tint.hurtTicks--;
      if (tint.poisonTicks > 0) {
        tint.poisonTicks--;
        this.tickPoisonedPlayer(id, tint.poisonTicks);
      }
      if (tint.hurtTicks === 0 && tint.poisonTicks === 0) this.e.playerTints.delete(id);
    }
  }

  /**
   * Bile bubbling out of a poisoned player: a bubble rising off the head or a drop running off the
   * body every few ticks, a burst on every poison damage tick (both run on the same clock).
   */
  private tickPoisonedPlayer(playerId: string, poisonTicks: number): void {
    const p: CharacterState | undefined = this.findPlayer(playerId);
    if (!p || p.isDead) return;
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const elapsed: number = GAME_CONSTANTS.SPITTER_POISON_DURATION_TICKS - poisonTicks;
    if (elapsed > 0 && elapsed % GAME_CONSTANTS.SPITTER_POISON_TICK_INTERVAL === 0) {
      this.spawnPoisonBurst(cx, p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2);
      return;
    }
    const interval: number = GAME_CONSTANTS.SPITTER_POISON_BUBBLE_INTERVAL_TICKS;
    if (poisonTicks % interval !== 0) return;
    const spread: number = (Math.random() - 0.5) * GAME_CONSTANTS.PLAYER_WIDTH;
    if ((poisonTicks / interval) % 2 === 0) {
      this.spawnPoisonBubble(cx + spread, p.y + 6);
    } else {
      const y: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT * (0.4 + Math.random() * 0.4);
      this.spawnBileDrop(cx + spread, y, 0, 0.4, 24, ART_PX, PIXEL['toxicDark']);
    }
  }

  private findPlayer(playerId: string): CharacterState | undefined {
    if (this.e.player?.id === playerId) return this.e.player;
    return this.e.remotePlayers.find((r: CharacterState): boolean => r.id === playerId);
  }

  private tintFor(playerId: string): PlayerTint {
    let tint: PlayerTint | undefined = this.e.playerTints.get(playerId);
    if (!tint) {
      tint = { hurtTicks: 0, poisonTicks: 0 };
      this.e.playerTints.set(playerId, tint);
    }
    return tint;
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

  addDropNotification(type: DropType, label: string, color: string, icon: PixelIconId): void {
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

  /** Lights the sky with the bolt for `x`/`seed` and rumbles the screen (local; replay entry point). */
  strikeLightning(x: number, seed: number): void {
    this.e.lightning = { x, seed, ageMs: 0 };
    this.triggerScreenShake(GAME_CONSTANTS.LIGHTNING_SHAKE_FRAMES, GAME_CONSTANTS.LIGHTNING_SHAKE_INTENSITY);
  }

  /**
   * Ages the strike on screen. The scheduler (host or solo) also counts down to the next strike,
   * plays it and queues the Lightning event so every guest draws the same bolt.
   */
  updateLightning(isScheduler: boolean): void {
    const tickMs: number = 1000 / GAME_CONSTANTS.TICK_RATE;
    if (this.e.lightning) {
      this.e.lightning.ageMs += tickMs;
      if (this.e.lightning.ageMs >= GAME_CONSTANTS.LIGHTNING_DURATION_MS) this.e.lightning = null;
    }
    if (!isScheduler) return;
    this.e.lightningTimerMs -= tickMs;
    if (this.e.lightningTimerMs > 0) return;
    this.e.lightningTimerMs = nextLightningDelayMs(Math.random);
    const x: number = lightningStrikeX(Math.random);
    const seed: number = Math.floor(Math.random() * 0x7fffffff);
    this.strikeLightning(x, seed);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.Lightning,
      playerId: this.e.player?.id ?? '',
      x,
      y: GAME_CONSTANTS.LIGHTNING_TOP_Y,
      value: seed,
    });
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

  /** One drop of bile: a pixel that falls (or rises, `gravityScale` < 0, for bubbles and fumes). */
  private spawnBileDrop(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    gravityScale: number = 1,
  ): void {
    this.addParticle({
      x, y, vx, vy,
      life,
      maxLife: life,
      color,
      size,
      shape: ParticleShape.Pixel,
      rotation: 0,
      rotationSpeed: 0,
      fadeMode: FadeMode.Late,
      scaleOverLife: false,
      gravityScale,
    });
  }

  /** A random bile tone, mostly the mid ones (the shine is rare). */
  private bileColor(): string {
    return BILE_COLORS[Math.random() < 0.15 ? 0 : 1 + Math.floor(Math.random() * (BILE_COLORS.length - 1))];
  }

  private dropSize(): number {
    return Math.random() < 0.35 ? ART_PX * 2 : ART_PX;
  }

  /** The spit leaving the mouth: a spray of droplets toward `dir` and a string of drool falling. */
  spawnSpitSpray(x: number, y: number, dir: number): void {
    for (let i: number = 0; i < GAME_CONSTANTS.SPIT_SPRAY_DROPLETS; i++) {
      this.spawnBileDrop(
        x, y,
        dir * (1.5 + Math.random() * 3),
        -1.2 + Math.random() * 2,
        16 + Math.floor(Math.random() * 12),
        this.dropSize(),
        this.bileColor(),
      );
    }
    for (let i: number = 0; i < 2; i++) {
      this.spawnBileDrop(x, y + i * ART_PX, dir * 0.4, 0.3, 30, ART_PX, PIXEL['toxicDark']);
    }
  }

  /** A drop shed by a glob in flight: it keeps a little of the glob's speed and falls away. */
  spawnSpitDrip(x: number, y: number, vx: number, vy: number): void {
    this.spawnBileDrop(x, y, vx * 0.15, Math.max(0, vy * 0.2), 20, ART_PX, Math.random() < 0.5 ? PIXEL['toxic'] : PIXEL['toxicDark']);
  }

  /**
   * A glob bursting. On a surface (`surfaceY`): a crown of droplets thrown up and a puddle of
   * `width` px left there. On a player (null): bile splattering back off the body and running down.
   */
  spawnSpitSplat(x: number, y: number, dir: number, surfaceY: number | null, width: number): void {
    const count: number = GAME_CONSTANTS.SPIT_SPLASH_DROPLETS;
    if (surfaceY !== null) {
      for (let i: number = 0; i < count; i++) {
        this.spawnBileDrop(
          x + (Math.random() - 0.5) * 8,
          surfaceY - ART_PX * 2,
          (Math.random() - 0.5) * 3 + dir * 1.2,
          -(1.5 + Math.random() * 2.5),
          18 + Math.floor(Math.random() * 12),
          this.dropSize(),
          this.bileColor(),
        );
      }
      this.e.acidPuddles.push({ x, y: surfaceY, width, age: 0, floor: this.e.floor });
      if (this.e.acidPuddles.length > GAME_CONSTANTS.SPIT_PUDDLE_MAX) this.e.acidPuddles.shift();
      return;
    }
    for (let i: number = 0; i < count; i++) {
      this.spawnBileDrop(
        x, y,
        -dir * (0.5 + Math.random() * 2) + (Math.random() - 0.5),
        -(0.5 + Math.random() * 2),
        16 + Math.floor(Math.random() * 12),
        this.dropSize(),
        this.bileColor(),
      );
    }
    for (let i: number = 0; i < 4; i++) {
      this.spawnBileDrop(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12, 0, 0.5, 28, ART_PX, PIXEL['toxicDark']);
    }
  }

  /** Every client, every tick: puddles age, give off fumes while fresh and dry up. */
  updateAcidPuddles(): void {
    for (const p of this.e.acidPuddles) {
      p.age++;
      const fresh: boolean = p.age < GAME_CONSTANTS.SPIT_PUDDLE_TICKS * 0.7;
      if (fresh && Math.random() < GAME_CONSTANTS.SPIT_PUDDLE_FUME_CHANCE) {
        const fume: number = 30 + Math.floor(Math.random() * 15);
        this.spawnBileDrop(p.x + (Math.random() - 0.5) * p.width, p.y - ART_PX * 3, (Math.random() - 0.5) * 0.3, -0.4, fume, ART_PX, PIXEL['toxicHi'], -0.08);
      }
    }
    this.e.acidPuddles = this.e.acidPuddles.filter((p: AcidPuddle): boolean => p.age < GAME_CONSTANTS.SPIT_PUDDLE_TICKS && p.floor === this.e.floor);
  }

  /** Every client, every tick (ambient, not synced): living spitters drool bile from the mouth. */
  updateSpitterDrool(): void {
    for (const z of this.e.zombies) {
      if (z.type !== ZombieType.Spitter || z.isDead || z.spawnTimer > 0) continue;
      if (Math.random() >= GAME_CONSTANTS.SPITTER_DROOL_CHANCE) continue;
      const anim: { state: ZombieAnimState; frame: number } | null = this.e.zombieSpriteAnimator.getInstanceFrame(z.id);
      if (!anim) continue;
      const mouth: Point | null = spitterMouth(z, anim.state, anim.frame);
      if (mouth) this.spawnBileDrop(mouth.x, mouth.y + ART_PX, z.velocityX * 0.5, 0.2, 30, ART_PX, PIXEL['toxic']);
    }
  }

  /** A bubble of bile rising off a poisoned player and popping. */
  private spawnPoisonBubble(x: number, y: number): void {
    const life: number = 26 + Math.floor(Math.random() * 10);
    this.spawnBileDrop(x, y, (Math.random() - 0.5) * 0.4, -0.5, life, this.dropSize(), Math.random() < 0.5 ? PIXEL['toxicHi'] : PIXEL['bileHi'], -0.12);
  }

  /** Poison taking hold or biting (a damage tick): bubbles boil off the body, bile runs down it. */
  spawnPoisonBurst(cx: number, cy: number): void {
    for (let i: number = 0; i < 5; i++) {
      this.spawnPoisonBubble(
        cx + (Math.random() - 0.5) * GAME_CONSTANTS.PLAYER_WIDTH,
        cy + (Math.random() - 0.5) * GAME_CONSTANTS.PLAYER_HEIGHT * 0.6,
      );
    }
    for (let i: number = 0; i < 2; i++) {
      this.spawnBileDrop(cx + (Math.random() - 0.5) * GAME_CONSTANTS.PLAYER_WIDTH, cy, 0, 0.5, 24, ART_PX, PIXEL['toxicDark']);
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

  /** A cage smashes open: bent bars and splinters fly out (and green gore, if zombies were inside). */
  spawnCageSmash(cx: number, cy: number, gore: boolean): void {
    const debris: string[] = ['#8a8f98', '#5a5f68', '#a0703c', '#c2b280', '#7a6a4f'];
    const colors: string[] = gore ? [...debris.slice(0, 3), '#6abf4b', '#3f7a2c'] : debris;
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

  /** The exit door's bars grind up: sparks and dust burst from the doorway. */
  spawnDoorOpen(cx: number, cy: number): void {
    const colors: string[] = ['#ffd166', '#fff3c4', '#8a8f98'];
    for (let i: number = 0; i < 24; i++) {
      const life: number = 30 + Math.floor(Math.random() * 20);
      this.addParticle({
        x: cx + (Math.random() - 0.5) * GAME_CONSTANTS.PLATE_DOOR_WIDTH_PX,
        y: cy + (Math.random() - 0.5) * GAME_CONSTANTS.PLATE_DOOR_HEIGHT_PX,
        vx: (Math.random() - 0.5) * 4,
        vy: -1 - Math.random() * 3,
        life,
        maxLife: life,
        color: colors[i % colors.length],
        size: 2 + Math.random() * 3,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: true,
      });
    }
  }

  /** The exit door slams shut: a puff of grey dust at its foot and a small shake. */
  spawnDoorShut(cx: number, cy: number): void {
    for (let i: number = 0; i < 18; i++) {
      const life: number = 25 + Math.floor(Math.random() * 20);
      const side: number = i % 2 === 0 ? 1 : -1;
      this.addParticle({
        x: cx + side * Math.random() * GAME_CONSTANTS.PLATE_DOOR_WIDTH_PX * 0.5,
        y: cy + GAME_CONSTANTS.PLATE_DOOR_HEIGHT_PX / 2 - Math.random() * 8,
        vx: side * (0.5 + Math.random() * 2.5),
        vy: -0.5 - Math.random(),
        life,
        maxLife: life,
        color: 'rgba(160, 160, 170, 0.7)',
        size: 5 + Math.random() * 7,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: true,
      });
    }
    this.triggerScreenShake(6, 3);
  }

  /**
   * A barrel blows up: the animated blast (white-hot core, fireball, shockwave, glow, then a
   * scorch mark under it: `barrelBlasts`), a burning ring, flames licking the surface, a burst of
   * fire, embers raining down, steel shards, a rising smoke column, a flash and a shake that is
   * hardest close to the blast. `groundY`: the surface it lay on, null when it blew up in the air.
   */
  spawnBarrelBlast(cx: number, cy: number, groundY: number | null): void {
    this.e.barrelBlasts.push({ x: cx, y: cy, groundY, age: 0 });
    if (this.e.spriteEffectSystem.isLoaded()) {
      this.e.spriteEffectSystem.spawn('sunburn', cx, cy, false);
      if (groundY !== null) {
        for (const dx of [-34, 0, 34]) {
          this.e.spriteEffectSystem.spawn('brightfire', cx + dx, groundY - 26, dx < 0);
        }
      }
    }
    const fire: string[] = ['#fff6c8', '#ffd23a', '#ff9a1f', '#ff5a1a', '#d8301a'];
    for (let i: number = 0; i < 40; i++) {
      const angle: number = Math.random() * Math.PI * 2;
      const speed: number = 2 + Math.random() * 6;
      const life: number = 16 + Math.floor(Math.random() * 20);
      this.addParticle({
        x: cx + Math.cos(angle) * 8,
        y: cy + Math.sin(angle) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.8 - 2,
        life,
        maxLife: life,
        color: fire[i % fire.length],
        size: 8 + Math.random() * 12,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Quick,
        scaleOverLife: true,
        gravityScale: -0.3,
      });
    }
    for (let i: number = 0; i < 40; i++) {
      const angle: number = -Math.PI * Math.random();
      const speed: number = 4 + Math.random() * 8;
      const life: number = 40 + Math.floor(Math.random() * 40);
      this.addParticle({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life,
        maxLife: life,
        color: i % 3 === 0 ? '#fff2a8' : '#ffb347',
        size: 2 + Math.random() * 2,
        shape: ParticleShape.Square,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Late,
        scaleOverLife: false,
      });
    }
    const steel: string[] = ['#c0392b', '#7f1d16', '#9aa3ad', '#e0a030'];
    for (let i: number = 0; i < 16; i++) {
      const life: number = 45 + Math.floor(Math.random() * 30);
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 10,
        y: cy,
        vx: (Math.random() - 0.5) * 16,
        vy: -5 - Math.random() * 8,
        life,
        maxLife: life,
        color: steel[i % steel.length],
        size: 4 + Math.random() * 5,
        shape: ParticleShape.Square,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.8,
        fadeMode: FadeMode.Late,
        scaleOverLife: false,
      });
    }
    for (let i: number = 0; i < 24; i++) {
      const life: number = 70 + Math.floor(Math.random() * 60);
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 50,
        y: cy - Math.random() * 30,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -1 - Math.random() * 1.5,
        life,
        maxLife: life,
        color: i % 2 === 0 ? 'rgba(54, 48, 46, 0.8)' : 'rgba(92, 84, 80, 0.7)',
        size: 14 + Math.random() * 16,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: false,
        // Smoke rises and slows as it goes.
        gravityScale: -0.05,
      });
    }
    const p: { x: number; y: number } | null = this.e.player;
    const distance: number = p ? Math.hypot(p.x - cx, p.y - cy) : 0;
    const closeness: number = Math.max(0.35, 1 - distance / 900);
    this.triggerScreenShake(Math.round(26 * closeness), Math.round(13 * closeness));
    this.triggerScreenFlash('#ffb060', 6);
  }

  /** Every client, every tick: blasts play out and their scorch marks fade. */
  updateBarrelBlasts(): void {
    for (const b of this.e.barrelBlasts) b.age++;
    this.e.barrelBlasts = this.e.barrelBlasts.filter(
      (b: BarrelBlastFx): boolean =>
        b.age < Math.max(GAME_CONSTANTS.BARREL_BLAST_FX_TICKS, GAME_CONSTANTS.BARREL_SCORCH_TICKS),
    );
  }

  /** A blown-up barrel is back on its spawn spot: a puff of dust as it drops in. */
  spawnBarrelRespawn(cx: number, bottomY: number): void {
    for (let i: number = 0; i < 16; i++) {
      const side: number = i % 2 === 0 ? 1 : -1;
      const life: number = 22 + Math.floor(Math.random() * 16);
      this.addParticle({
        x: cx + side * Math.random() * 10,
        y: bottomY - Math.random() * 6,
        vx: side * (0.8 + Math.random() * 2),
        vy: -0.4 - Math.random() * 0.8,
        life,
        maxLife: life,
        color: 'rgba(190, 180, 165, 0.75)',
        size: 4 + Math.random() * 5,
        shape: ParticleShape.Circle,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: true,
        gravityScale: 0,
      });
    }
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

  /** A slow, rising puff of stone dust. */
  private addDust(x: number, y: number, vx: number, vy: number, size: number, life: number): void {
    this.addParticle({
      x,
      y,
      vx,
      vy,
      life,
      maxLife: life,
      color: 'rgba(150, 140, 126, 0.4)',
      size,
      shape: ParticleShape.Circle,
      rotation: 0,
      rotationSpeed: 0,
      fadeMode: FadeMode.Linear,
      scaleOverLife: false,
      gravityScale: -0.04,
    });
  }

  /**
   * Debris that reached its floor: it bounces (less each time), then slides and spins to a stop;
   * a chunk landing hard kicks up dust.
   */
  private landOnFloor(p: Particle, floorY: number): void {
    const half: number = p.chunk ? (p.chunk.sh * ART_PX) / 2 : p.size / 2;
    if (p.vy <= 0 || p.y + half < floorY) return;
    if (p.chunk && p.vy > GAME_CONSTANTS.DEBRIS_DUST_MIN_SPEED) {
      const spread: number = p.chunk.sw * ART_PX;
      this.addDust(p.x, floorY - 6, (Math.random() - 0.5) * 2, -0.3, spread, 50 + Math.random() * 30);
    }
    p.y = floorY - half;
    p.vy = p.vy > GAME_CONSTANTS.DEBRIS_BOUNCE_MIN_SPEED ? -p.vy * GAME_CONSTANTS.DEBRIS_BOUNCE : 0;
    p.vx *= GAME_CONSTANTS.DEBRIS_FRICTION;
    p.rotationSpeed *= GAME_CONSTANTS.DEBRIS_FRICTION;
  }

  /** A piece of a puzzle part's art, falling under debris gravity onto the ground. */
  private addDebrisChunk(
    chunk: ParticleChunk,
    x: number,
    y: number,
    vx: number,
    vy: number,
    spin: number,
    delay: number,
  ): void {
    const life: number = GAME_CONSTANTS.DEBRIS_LIFE_TICKS + Math.floor(Math.random() * 40);
    this.addParticle({
      x,
      y,
      vx,
      vy,
      life,
      maxLife: life,
      color: PIXEL['stone'],
      size: Math.max(chunk.sw, chunk.sh) * ART_PX,
      shape: ParticleShape.Chunk,
      rotation: 0,
      rotationSpeed: spin,
      fadeMode: FadeMode.Late,
      scaleOverLife: false,
      gravityScale: GAME_CONSTANTS.DEBRIS_GRAVITY_SCALE,
      chunk,
      delay,
      floorY: GAME_CONSTANTS.GROUND_Y,
    });
  }

  /**
   * The boulder smashes the floor-2 wall (`cx` its middle, `impactY` the boulder's centre): the
   * boulder bursts into shards and chips, the wall's own stones near the impact are blown out into
   * the room, the rest crumble from the impact upward and come down, tumbling and bouncing on the
   * ground, and dust rolls out along its foot. The wall's box comes from `cx` alone (it always spans
   * the screen top to the ground at a screen edge), so a replay draws the same stones.
   */
  spawnWallBreak(cx: number, impactY: number): void {
    const width: number = GAME_CONSTANTS.BOULDER_WALL_TILES * GAME_CONSTANTS.LEVEL_TILE_PX;
    const wallX: number = cx - width / 2;
    const faceRight: boolean = wallX <= 0;
    const room: number = faceRight ? 1 : -1;
    const faceX: number = faceRight ? wallX + width : wallX;
    const cols: number = Math.ceil(width / ART_PX);
    const rows: number = Math.ceil(GAME_CONSTANTS.GROUND_Y / ART_PX);
    const source: ChunkSource = { kind: 'wall', cols, rows, faceRight };

    for (const stone of crackedWallStones(cols, rows, faceRight)) {
      // Near the impact a stone breaks into a few pieces; higher up most come down whole.
      const stoneY: number = (stone.y + stone.height / 2) * ART_PX;
      const near: boolean = Math.abs(stoneY - impactY) < GAME_CONSTANTS.WALL_BREAK_BLAST_PX;
      const pieces: number = near ? 2 + Math.floor(Math.random() * 2) : Math.random() < 0.4 ? 2 : 1;
      const end: number = stone.x + stone.width;
      for (let i: number = 0, sx: number = stone.x; sx < end; i++) {
        const cut: number = Math.round((stone.width / pieces) * (0.7 + Math.random() * 0.6));
        // The last piece (or a sliver too thin to cut off) takes the rest of the stone.
        const sw: number = i === pieces - 1 || end - sx - cut < 3 ? end - sx : Math.max(3, cut);
        const chunk: ParticleChunk = { source, sx, sy: stone.y, sw, sh: stone.height };
        const x: number = wallX + (sx + sw / 2) * ART_PX;
        const y: number = stoneY;
        sx += sw;
        const reach: number = 1 - Math.hypot(x - faceX, y - impactY) / GAME_CONSTANTS.WALL_BREAK_BLAST_PX;
        if (reach > 0) {
          const speed: number = GAME_CONSTANTS.WALL_BREAK_BLAST_SPEED * reach * (0.5 + Math.random() * 0.5);
          const up: number = (y - impactY) / GAME_CONSTANTS.WALL_BREAK_BLAST_PX;
          this.addDebrisChunk(
            chunk, x, y,
            room * speed,
            (up - 0.6) * speed * 0.6,
            (Math.random() - 0.5) * 0.4,
            Math.floor(Math.random() * 3),
          );
        } else {
          // Let go one after another from the impact up; topple outward a little as it drops.
          const delay: number =
            Math.abs(impactY - y) * GAME_CONSTANTS.WALL_BREAK_CRUMBLE_TICKS_PER_PX + Math.random() * 8;
          this.addDebrisChunk(
            chunk, x, y,
            room * Math.random() * 1.4 + (Math.random() - 0.5) * 0.6,
            0,
            room * (0.02 + Math.random() * 0.06),
            Math.floor(delay),
          );
        }
      }
    }

    // The boulder shatters into a grid of shards that rebound into the room.
    const radius: number = GAME_CONSTANTS.BOULDER_SIZE_PX / 2;
    const boulderX: number = faceX + room * radius;
    const grid: number = 3;
    const cell: number = BOULDER_ART_CELLS / grid;
    for (let gy: number = 0; gy < grid; gy++) {
      for (let gx: number = 0; gx < grid; gx++) {
        const chunk: ParticleChunk = { source: { kind: 'boulder' }, sx: gx * cell, sy: gy * cell, sw: cell, sh: cell };
        this.addDebrisChunk(
          chunk,
          boulderX + (gx + 0.5 - grid / 2) * cell * ART_PX,
          impactY + (gy + 0.5 - grid / 2) * cell * ART_PX,
          room * (1 + Math.random() * 3) + (gx - 1) * room * 0.8,
          -2 - Math.random() * 3 + (gy - 1) * 1.5,
          (Math.random() - 0.5) * 0.5,
          0,
        );
      }
    }

    // Chips and grit spraying from the impact.
    const grit: string[] = [PIXEL['stoneHi'], PIXEL['stone'], PIXEL['stoneMid'], PIXEL['stoneDark']];
    for (let i: number = 0; i < 40; i++) {
      const life: number = 40 + Math.floor(Math.random() * 30);
      this.addParticle({
        x: faceX + (Math.random() - 0.5) * 16,
        y: impactY + (Math.random() - 0.5) * 40,
        vx: room * Math.random() * 7 + (Math.random() - 0.5) * 2,
        vy: -1 - Math.random() * 5,
        life,
        maxLife: life,
        color: grit[i % grit.length],
        size: 2 + Math.random() * 4,
        shape: ParticleShape.Pixel,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Late,
        scaleOverLife: false,
        gravityScale: GAME_CONSTANTS.DEBRIS_GRAVITY_SCALE / 2,
        floorY: GAME_CONSTANTS.GROUND_Y,
      });
    }

    // Dust: a burst at the impact and a cloud rolling out along the ground (more puffs where stones land).
    for (let i: number = 0; i < 14; i++) {
      this.addDust(
        faceX,
        impactY,
        room * Math.random() * 3,
        (Math.random() - 0.5) * 2,
        14 + Math.random() * 14,
        50 + Math.random() * 30,
      );
    }
    for (let i: number = 0; i < 22; i++) {
      this.addDust(
        faceX + room * Math.random() * 40,
        GAME_CONSTANTS.GROUND_Y - Math.random() * 24,
        room * (0.4 + Math.random() * 1.8),
        -0.1 - Math.random() * 0.3,
        22 + Math.random() * 22,
        90 + Math.random() * 60,
      );
    }
    this.triggerScreenShake(GAME_CONSTANTS.WALL_BREAK_SHAKE_FRAMES, GAME_CONSTANTS.WALL_BREAK_SHAKE_INTENSITY);
  }

  /**
   * A cracked wall's crack band breaks out (designed floors): its shattered stones (cut from the
   * band's own art) blow out away from the hit (`dir`) and fall, with grit and dust. Derived from
   * the band's box only, so a replay draws the same pieces.
   */
  spawnCrackBreak(band: { x: number; y: number; width: number; height: number }, dir: number): void {
    const cols: number = Math.ceil(band.width / ART_PX);
    const rows: number = Math.ceil(band.height / ART_PX);
    const source: ChunkSource = { kind: 'crack', cols, rows };
    const piece: number = 8;
    for (let sy: number = 0; sy < rows; sy += piece) {
      for (let sx: number = 0; sx < cols; sx += piece) {
        const sw: number = Math.min(piece, cols - sx);
        const sh: number = Math.min(piece, rows - sy);
        const x: number = band.x + (sx + sw / 2) * ART_PX;
        const y: number = band.y + (sy + sh / 2) * ART_PX;
        this.addDebrisChunk(
          { source, sx, sy, sw, sh },
          x,
          y,
          dir * (1 + Math.random() * GAME_CONSTANTS.WALL_BREAK_BLAST_SPEED * 0.6),
          -1 - Math.random() * 4,
          (Math.random() - 0.5) * 0.5,
          Math.floor(Math.random() * 4),
        );
      }
    }
    const grit: string[] = [PIXEL['stoneHi'], PIXEL['stone'], PIXEL['stoneMid'], PIXEL['stoneDark']];
    const faceX: number = dir === 1 ? band.x + band.width : band.x;
    for (let i: number = 0; i < 24; i++) {
      const life: number = 40 + Math.floor(Math.random() * 30);
      this.addParticle({
        x: faceX + (Math.random() - 0.5) * 12,
        y: band.y + Math.random() * band.height,
        vx: dir * Math.random() * 6,
        vy: -1 - Math.random() * 4,
        life,
        maxLife: life,
        color: grit[i % grit.length],
        size: 2 + Math.random() * 4,
        shape: ParticleShape.Pixel,
        rotation: 0,
        rotationSpeed: 0,
        fadeMode: FadeMode.Late,
        scaleOverLife: false,
        gravityScale: GAME_CONSTANTS.DEBRIS_GRAVITY_SCALE / 2,
        floorY: GAME_CONSTANTS.GROUND_Y,
      });
    }
    for (let i: number = 0; i < 10; i++) {
      this.addDust(
        faceX,
        band.y + Math.random() * band.height,
        dir * Math.random() * 2.5,
        (Math.random() - 0.5) * 1.5,
        12 + Math.random() * 12,
        50 + Math.random() * 30,
      );
    }
    this.triggerScreenShake(GAME_CONSTANTS.WALL_BREAK_SHAKE_FRAMES, GAME_CONSTANTS.WALL_BREAK_SHAKE_INTENSITY);
  }

  /** A spring or slingshot fired: a dust puff off its pad and streaks along the throw (`angle` degrees). */
  spawnGadgetLaunch(cx: number, topY: number, angle: number): void {
    for (let i: number = 0; i < 10; i++) {
      this.addDust(cx + (Math.random() - 0.5) * 48, topY - 4, (Math.random() - 0.5) * 3, -0.5, 8 + Math.random() * 8, 35 + Math.random() * 20);
    }
    const a: number = (angle * Math.PI) / 180;
    for (let i: number = 0; i < 12; i++) {
      const life: number = 18 + Math.floor(Math.random() * 12);
      const speed: number = 6 + Math.random() * 6;
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 40,
        y: topY - Math.random() * 20,
        vx: Math.cos(a) * speed,
        vy: -Math.sin(a) * speed,
        life,
        maxLife: life,
        color: i % 2 === 0 ? PIXEL['white'] : PIXEL['steelLight'],
        size: 6 + Math.random() * 8,
        shape: ParticleShape.Line,
        rotation: -a,
        rotationSpeed: 0,
        fadeMode: FadeMode.Linear,
        scaleOverLife: false,
        gravityScale: 0,
      });
    }
    this.triggerScreenShake(6, 3);
  }

  updateParticles(): void {
    for (const p of this.e.particles) {
      if (p.delay) {
        p.delay--;
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += GAME_CONSTANTS.PARTICLE_GRAVITY * (p.gravityScale ?? 1);
      p.rotation += p.rotationSpeed;
      if (p.floorY !== undefined) this.landOnFloor(p, p.floorY);
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
