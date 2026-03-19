import {
  CharacterState,
  CHARACTER_CLASSES,
  Direction,
  GAME_CONSTANTS,
  ZOMBIE_TYPES,
} from '@shared/index';
import {
  DropType,
  ZombieDefinition,
  ZombieState,
  ZombieType,
} from '@shared/game-entities';
import { Particle, ParticleShape, FadeMode } from './particle-types';
import { PlayerAnimState } from './sprite-animator';
import { ZombieSpriteAnchor } from './zombie-sprite-animator';
import {
  DamageNumber,
  DashPhaseState,
  DropNotification,
  IGameEngine,
  ZombieCorpse,
} from './engine-types';

export class RenderSystem {
  constructor(private readonly e: IGameEngine) {}

  render(): void {
    const ctx: CanvasRenderingContext2D = this.e.ctx;
    ctx.clearRect(0, 0, GAME_CONSTANTS.CANVAS_WIDTH, GAME_CONSTANTS.CANVAS_HEIGHT);

    ctx.save();

    if (this.e.screenShakeFrames > 0) {
      const shakeX: number = (Math.random() - 0.5) * this.e.screenShakeIntensity;
      const shakeY: number = (Math.random() - 0.5) * this.e.screenShakeIntensity;
      ctx.translate(shakeX, shakeY);
      this.e.screenShakeFrames--;
    }

    if (this.e.mapRenderer.isLoaded()) {
      this.e.mapRenderer.render(ctx);
    } else {
      this.renderBackground(ctx);
      this.renderRopes(ctx);
      this.renderPlatforms(ctx);
    }
    this.renderZombies(ctx);
    this.renderHitMarks(ctx);
    this.renderDragonProjectiles(ctx);
    this.renderSpitterProjectiles(ctx);
    this.renderDrops(ctx);
    this.renderPlayer(ctx);
    this.renderPoisonOverlay(ctx);
    this.renderParticles(ctx);
    this.renderDashOverlay(ctx);
    this.e.spriteEffectSystem.render(ctx);
    this.renderDamageNumbers(ctx);
    this.renderDropNotifications(ctx);
    this.renderWaveInfo(ctx);
    if (this.e.showCollisionBoxes) {
      this.renderDebugCollisionBoxes(ctx);
    }

    ctx.restore();

    if (this.e.screenFlashFrames > 0 && this.e.screenFlashColor) {
      ctx.globalAlpha = this.e.screenFlashFrames / 10;
      ctx.fillStyle = this.e.screenFlashColor;
      ctx.fillRect(0, 0, GAME_CONSTANTS.CANVAS_WIDTH, GAME_CONSTANTS.CANVAS_HEIGHT);
      ctx.globalAlpha = 1;
      this.e.screenFlashFrames--;
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

    for (const star of this.e.backgroundStars) {
      ctx.fillStyle = `rgba(255, 255, 220, ${star.brightness})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
  }

  private renderPlatforms(ctx: CanvasRenderingContext2D): void {
    for (const plat of this.e.platforms) {
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
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    if (this.e.invincibilityFrames > 0 && Math.floor(this.e.invincibilityFrames / GAME_CONSTANTS.INVINCIBILITY_BLINK_RATE) % 2 === 0) return;

    const dash: DashPhaseState | null = this.e.dashPhase;
    let dashAlpha: number = 1;
    if (dash) {
      if (dash.phase === 'vanishing') {
        dashAlpha = 1 - dash.ticksInPhase / dash.vanishTicks;
      } else if (dash.phase === 'swishing') {
        dashAlpha = 0;
      } else if (dash.phase === 'appearing') {
        dashAlpha = dash.ticksInPhase / dash.appearTicks;
      }
    }
    if (dashAlpha <= 0) return;

    const needsAlpha: boolean = dashAlpha < 1;
    if (needsAlpha) {
      ctx.save();
      ctx.globalAlpha = dashAlpha;
    }

    const classColor: string = CHARACTER_CLASSES[p.classId].color;
    const spriteSize: number = this.e.SPRITE_RENDER_SIZE;
    const flipX: boolean = p.facing === Direction.Left;
    const playerAnchorX: number = 0.30;
    const playerAnchorY: number = 0.979;
    const effectiveAnchorX: number = flipX ? (1 - playerAnchorX) : playerAnchorX;
    const drawX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2 - spriteSize * effectiveAnchorX;
    const drawY: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT - spriteSize * playerAnchorY;

    if (this.e.spriteAnimator.isLoaded()) {
      this.e.spriteAnimator.draw(ctx, drawX, drawY, spriteSize, spriteSize, flipX);
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

    if (needsAlpha) {
      ctx.restore();
    }
  }

  private renderDashOverlay(ctx: CanvasRenderingContext2D): void {
    const dash: DashPhaseState | null = this.e.dashPhase;
    if (!dash) return;

    ctx.save();

    if (dash.phase === 'vanishing') {
      const progress: number = dash.ticksInPhase / dash.vanishTicks;
      this.renderPortalGlow(ctx, dash.startCX, dash.playerCY, progress, true);
    }

    if (dash.phase === 'swishing') {
      const progress: number = dash.ticksInPhase / dash.swishTicks;
      const fadePortalStart: number = Math.max(0, 1 - progress * 2);
      if (fadePortalStart > 0) {
        this.renderPortalGlow(ctx, dash.startCX, dash.playerCY, fadePortalStart * 0.8, true);
      }
      this.renderSwishBeam(ctx, dash, progress);
      const fadePortalEnd: number = Math.max(0, (progress - 0.5) * 2);
      if (fadePortalEnd > 0) {
        this.renderPortalGlow(ctx, dash.endCX, dash.playerCY, fadePortalEnd * 0.6, false);
      }
    }

    if (dash.phase === 'appearing') {
      const progress: number = dash.ticksInPhase / dash.appearTicks;
      const fadeOut: number = Math.max(0, 1 - progress);
      this.renderPortalGlow(ctx, dash.endCX, dash.playerCY, fadeOut, false);
    }

    ctx.restore();
  }

  private renderPortalGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, intensity: number, isEntry: boolean): void {
    const baseRadius: number = 50;
    const glowRadius: number = baseRadius * (0.6 + intensity * 0.4);

    ctx.save();
    ctx.globalAlpha = intensity * 0.6;

    const gradient: CanvasGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    const coreColor: string = isEntry ? 'rgba(170,100,255,' : 'rgba(255,136,68,';
    gradient.addColorStop(0, coreColor + '0.9)');
    gradient.addColorStop(0.3, coreColor + '0.5)');
    gradient.addColorStop(0.7, 'rgba(100,68,255,0.2)');
    gradient.addColorStop(1, 'rgba(100,68,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(cx, cy, glowRadius, glowRadius * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = intensity * 0.8;
    const innerGlow: CanvasGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius * 0.4);
    innerGlow.addColorStop(0, 'rgba(255,255,255,0.9)');
    innerGlow.addColorStop(0.5, 'rgba(200,170,255,0.4)');
    innerGlow.addColorStop(1, 'rgba(200,170,255,0)');
    ctx.fillStyle = innerGlow;
    ctx.beginPath();
    ctx.ellipse(cx, cy, glowRadius * 0.4, glowRadius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderSwishBeam(ctx: CanvasRenderingContext2D, dash: DashPhaseState, progress: number): void {
    const headX: number = dash.startCX + (dash.endCX - dash.startCX) * progress;
    const tailX: number = dash.startCX + (dash.endCX - dash.startCX) * Math.max(0, progress - 0.4);
    const cy: number = dash.playerCY;

    ctx.save();

    const beamGradient: CanvasGradient = ctx.createLinearGradient(tailX, cy, headX, cy);
    beamGradient.addColorStop(0, 'rgba(187,102,255,0)');
    beamGradient.addColorStop(0.3, 'rgba(255,136,68,0.4)');
    beamGradient.addColorStop(0.7, 'rgba(255,204,68,0.6)');
    beamGradient.addColorStop(1, 'rgba(255,255,255,0.8)');

    ctx.globalAlpha = 0.7;
    ctx.fillStyle = beamGradient;
    const beamHeight: number = 18;
    const left: number = Math.min(tailX, headX);
    const right: number = Math.max(tailX, headX);
    ctx.beginPath();
    ctx.ellipse((left + right) / 2, cy, (right - left) / 2, beamHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = beamGradient;
    const coreHeight: number = 6;
    ctx.beginPath();
    ctx.ellipse((left + right) / 2, cy, (right - left) / 2, coreHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    const headGlow: CanvasGradient = ctx.createRadialGradient(headX, cy, 0, headX, cy, 25);
    headGlow.addColorStop(0, 'rgba(255,255,255,0.9)');
    headGlow.addColorStop(0.4, 'rgba(255,204,68,0.5)');
    headGlow.addColorStop(1, 'rgba(255,136,68,0)');
    ctx.fillStyle = headGlow;
    ctx.beginPath();
    ctx.arc(headX, cy, 25, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderZombies(ctx: CanvasRenderingContext2D): void {
    this.renderZombieCorpses(ctx);

    const sorted: ZombieState[] = this.e.zombies
      .filter((z: ZombieState) => !z.isDead)
      .sort((a: ZombieState, b: ZombieState) => {
        return (a.y + a.instanceHeight) - (b.y + b.instanceHeight);
      });

    for (const z of sorted) {
      const isSpawning: boolean = z.spawnTimer > 0;
      if (isSpawning) {
        const progress: number = 1 - z.spawnTimer / GAME_CONSTANTS.ZOMBIE_SPAWN_ANIM_TICKS;
        ctx.save();
        ctx.globalAlpha = progress;
      }

      if (this.e.zombieSpriteAnimator.isLoaded()) {
        const spriteKey: string = this.e.zombieSpriteAnimator.getSpriteKey(z.type);
        const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
        const baseRenderSize: number = z.type === ZombieType.DragonBoss ? 260 : z.type === ZombieType.Boss ? 200 : 140;
        const baseH: number = (zDef.heightMin + zDef.heightMax) / 2;
        const scale: number = z.instanceHeight / baseH;
        const renderW: number = Math.round(baseRenderSize * scale);
        const renderH: number = renderW;
        const flipX: boolean = z.type === ZombieType.DragonBoss ? z.facing > 0 : z.facing < 0;
        const anchor: ZombieSpriteAnchor = this.e.zombieSpriteAnimator.getAnchor(spriteKey);
        const effectiveAnchorX: number = flipX ? (1 - anchor.anchorX) : anchor.anchorX;
        const drawX: number = z.x + z.instanceWidth / 2 - renderW * effectiveAnchorX;
        const drawY: number = z.y + z.instanceHeight - renderH * anchor.anchorY;

        this.e.zombieSpriteAnimator.draw(ctx, z.id, spriteKey, drawX, drawY, renderW, renderH, flipX);
      } else {
        this.renderZombieFallback(ctx, z);
      }

      if (isSpawning) {
        ctx.restore();
        continue;
      }

      const isDragon: boolean = z.type === ZombieType.DragonBoss;
      const hpPercent: number = z.hp / z.maxHp;
      const barWidth: number = isDragon ? 120 : Math.max(z.instanceWidth, 40);
      const barX: number = z.x + z.instanceWidth / 2 - barWidth / 2;
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
        const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
        ctx.fillText(zDef.name, z.x + z.instanceWidth / 2, barY - 4);
      }
    }
  }

  private renderZombieCorpses(ctx: CanvasRenderingContext2D): void {
    if (!this.e.zombieSpriteAnimator.isLoaded()) return;

    for (const corpse of this.e.zombieCorpses) {
      const progress: number = corpse.fadeTimer / corpse.maxFadeTimer;
      const alpha: number = Math.min(1, progress * 2);

      const corpseDef: ZombieDefinition = ZOMBIE_TYPES[corpse.type];
      const baseRenderSize: number = corpse.type === ZombieType.DragonBoss ? 260 : corpse.type === ZombieType.Boss ? 200 : 140;
      const baseH: number = (corpseDef.heightMin + corpseDef.heightMax) / 2;
      const scale: number = corpse.height / baseH;
      const renderW: number = Math.round(baseRenderSize * scale);
      const renderH: number = renderW;
      const flipX: boolean = corpse.type === ZombieType.DragonBoss ? corpse.facing > 0 : corpse.facing < 0;
      const anchor: ZombieSpriteAnchor = this.e.zombieSpriteAnimator.getAnchor(corpse.spriteKey);
      const effectiveAnchorX: number = flipX ? (1 - anchor.anchorX) : anchor.anchorX;
      const drawX: number = corpse.x + corpse.width / 2 - renderW * effectiveAnchorX;
      const drawY: number = corpse.y + corpse.height - renderH * anchor.anchorY;

      ctx.save();
      ctx.globalAlpha = alpha;
      this.e.zombieSpriteAnimator.draw(
        ctx, corpse.id, corpse.spriteKey,
        drawX, drawY, renderW, renderH, flipX,
      );
      ctx.restore();

      if (corpse.isGrounded) {
        if (corpse.showBlood) {
          this.renderCorpseBlood(ctx, corpse);
        }
        this.renderCorpseFlies(ctx, corpse);
      }
    }
  }

  private renderCorpseFlies(ctx: CanvasRenderingContext2D, corpse: ZombieCorpse): void {
    const cx: number = corpse.x + corpse.width / 2;
    const cy: number = corpse.y + corpse.height * 0.4;
    const t: number = performance.now() / 1000;
    const seed: number = corpse.id.charCodeAt(0) + corpse.id.charCodeAt(1) * 7;
    const flyCount: number = 2 + (seed % 2);

    ctx.fillStyle = '#000000';
    for (let i: number = 0; i < flyCount; i++) {
      const p: number = seed * 0.7 + i * 2.1;
      const s1: number = 2.3 + i * 0.6;
      const s2: number = 3.1 + i * 0.9;
      const r: number = 8 + i * 3;
      const fx: number = cx + Math.cos(t * s1 + p) * r + Math.sin(t * s2 * 1.7 + p * 3) * r * 0.5;
      const fy: number = cy + Math.sin(t * s2 + p) * r * 0.6 + Math.cos(t * s1 * 1.4 + p * 2) * r * 0.4;
      ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
    }
  }

  private renderCorpseBlood(ctx: CanvasRenderingContext2D, corpse: ZombieCorpse): void {
    const cx: number = corpse.x + corpse.width / 2 - 8;
    const baseY: number = corpse.y + corpse.height + 6;
    const t: number = performance.now() / 1000;
    const seed: number = corpse.id.charCodeAt(0) * 13 + corpse.id.charCodeAt(1) * 31;
    const decay: number = 1 - corpse.fadeTimer / corpse.maxFadeTimer;

    const bloodColors: string[] = ['#980000', '#960c00', '#aa0000', '#500b00', '#990011'];
    const darkColors: string[] = ['#550000', '#4a0000', '#3a0000'];

    ctx.save();

    const streamCount: number = 4 + (seed % 4);
    for (let i: number = 0; i < streamCount; i++) {
      const sx: number = seed + i * 23;
      const originX: number = corpse.x - 20 + corpse.width * (0.1 + (sx % 80) / 100);
      const originY: number = baseY - corpse.height * (0.35 + (sx % 20) / 100);
      const streamLen: number = corpse.height * (0.3 + (sx % 30) / 100);
      const speed: number = 0.5 + (i % 3) * 0.2;
      const wobble: number = Math.sin(t * 1.5 + sx) * 1.5;

      const segCount: number = 8 + (sx % 4);
      for (let s: number = 0; s < segCount; s++) {
        const rawPhase: number = (t * speed + s * (1.0 / segCount) + sx * 0.03) % 1.0;
        const py: number = originY + rawPhase * streamLen;
        const sineShift: number = Math.sin(rawPhase * Math.PI * 2 + sx) * 1.2 + wobble;
        const px: number = originX + sineShift;

        const fade: number = rawPhase < 0.15
          ? rawPhase / 0.15
          : rawPhase > 0.7 ? (1 - rawPhase) / 0.3 : 1;
        ctx.globalAlpha = fade * 0.85;
        ctx.fillStyle = bloodColors[(sx + s) % bloodColors.length];

        const sz: number = 2 + ((sx + s) % 2);
        ctx.fillRect(Math.round(px), Math.round(py), sz, sz);

        if (s % 2 === 0) {
          ctx.globalAlpha = fade * 0.5;
          ctx.fillStyle = darkColors[(sx + s) % darkColors.length];
          ctx.fillRect(Math.round(px) + 1, Math.round(py) + sz, sz - 1, 1);
        }
      }

      const tipPhase: number = (t * speed * 1.4 + sx * 0.07) % 1.6;
      if (tipPhase < 1.0) {
        const tipY: number = originY + streamLen + tipPhase * 6;
        ctx.globalAlpha = (1 - tipPhase) * 0.9;
        ctx.fillStyle = bloodColors[sx % bloodColors.length];
        ctx.fillRect(Math.round(originX + wobble), Math.round(tipY), 2, 3);
      }
    }

    const poolGrowth: number = Math.min(1, decay * 2.5);
    const maxPoolHalf: number = corpse.width * 0.6;
    const poolHalf: number = maxPoolHalf * poolGrowth;
    const layerCount: number = 3;

    for (let layer: number = 0; layer < layerCount; layer++) {
      const layerHalf: number = poolHalf * (1 - layer * 0.25);
      const pixelCount: number = Math.floor((layerHalf * 2) / 2);
      const layerY: number = baseY + layer * 2 - 1;

      for (let i: number = 0; i < pixelCount; i++) {
        const hash: number = (seed + i * 7 + layer * 53) % 1000;
        const offset: number = hash / 1000;
        const px: number = cx - layerHalf + offset * layerHalf * 2;
        const jitterY: number = (seed + i * 11 + layer * 31) % 3;
        const pSize: number = 2 + ((seed + i * 3 + layer) % 2);
        const pulse: number = 0.08 * Math.sin(t * 2 + i * 0.5 + layer);

        ctx.globalAlpha = (0.7 + pulse) * poolGrowth;
        ctx.fillStyle = layer === 0
          ? darkColors[i % darkColors.length]
          : bloodColors[(seed + i) % bloodColors.length];
        ctx.fillRect(Math.round(px), Math.round(layerY + jitterY), pSize, Math.max(1, pSize - 1));
      }
    }

    const edgeCount: number = Math.floor(poolHalf * 0.4);
    for (let i: number = 0; i < edgeCount; i++) {
      const angle: number = (seed + i * 41) % 360;
      const rad: number = angle * Math.PI / 180;
      const dist: number = poolHalf * (0.7 + ((seed + i * 19) % 30) / 100);
      const ex: number = cx + Math.cos(rad) * dist;
      const ey: number = baseY + Math.abs(Math.sin(rad)) * 4;
      const flowDist: number = Math.min(4, decay * 12) * ((seed + i) % 3);
      const flowX: number = ex + Math.cos(rad) * flowDist * Math.min(1, decay * 2);

      ctx.globalAlpha = 0.5 * poolGrowth;
      ctx.fillStyle = bloodColors[(seed + i) % bloodColors.length];
      ctx.fillRect(Math.round(flowX), Math.round(ey), 2, 1);
    }

    ctx.restore();
  }

  private renderZombieFallback(ctx: CanvasRenderingContext2D, z: ZombieState): void {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(z.x, z.y, z.instanceWidth, z.instanceHeight);
    ctx.fillRect(z.x + 1, z.y + 1, z.instanceWidth - 2, z.instanceHeight - 2);

    const eyeY: number = z.y + 8;
    ctx.fillStyle = '#ff2222';
    if (this.e.player) {
      const lookDir: number = this.e.player.x > z.x ? 1 : -1;
      ctx.fillRect(z.x + z.instanceWidth / 2 - 6 + lookDir * 2, eyeY, 4, 4);
      ctx.fillRect(z.x + z.instanceWidth / 2 + 2 + lookDir * 2, eyeY, 4, 4);
    }
  }

  private renderDragonProjectiles(ctx: CanvasRenderingContext2D): void {
    if (!this.e.dragonProjectileImg.complete || !this.e.dragonImpactImg.complete) return;

    for (const proj of this.e.dragonProjectiles) {
      const srcX: number = proj.frame * this.e.DRAGON_PROJ_FRAME_W;
      const renderSize: number = 70 + proj.frame * 10;
      const angle: number = Math.atan2(proj.velocityY, proj.velocityX);

      ctx.save();
      ctx.translate(proj.x, proj.y);
      ctx.rotate(angle);
      ctx.drawImage(
        this.e.dragonProjectileImg,
        srcX, 0, this.e.DRAGON_PROJ_FRAME_W, this.e.DRAGON_PROJ_FRAME_H,
        -renderSize / 2, -renderSize / 2, renderSize, renderSize,
      );
      ctx.restore();
    }

    for (const imp of this.e.dragonImpacts) {
      const srcX: number = imp.frame * this.e.DRAGON_IMPACT_FRAME_W;
      const renderSize: number = 90 + imp.frame * 15;
      const alpha: number = 1 - imp.frame / this.e.DRAGON_IMPACT_FRAMES;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        this.e.dragonImpactImg,
        srcX, 0, this.e.DRAGON_IMPACT_FRAME_W, this.e.DRAGON_IMPACT_FRAME_H,
        imp.x - renderSize / 2, imp.y - renderSize / 2, renderSize, renderSize,
      );
      ctx.restore();
    }
  }

  private renderSpitterProjectiles(ctx: CanvasRenderingContext2D): void {
    for (const proj of this.e.spitterProjectiles) {
      for (const t of proj.trail) {
        const alpha: number = t.life / 15;
        ctx.save();
        ctx.globalAlpha = alpha * 0.4;
        ctx.fillStyle = '#44ff44';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.shadowColor = '#44ff44';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#88ff44';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ccffcc';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderPoisonOverlay(ctx: CanvasRenderingContext2D): void {
    if (!this.e.poisonEffect || !this.e.player) return;

    const pulse: number = Math.sin(this.e.poisonEffect.remainingTicks * 0.15) * 0.15 + 0.25;

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#00ff44';
    ctx.fillRect(
      this.e.player.x - 2,
      this.e.player.y - 2,
      GAME_CONSTANTS.PLAYER_WIDTH + 4,
      GAME_CONSTANTS.PLAYER_HEIGHT + 4,
    );
    ctx.restore();
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.e.particles) {
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
    for (const drop of this.e.worldDrops) {
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
    for (const d of this.e.damageNumbers) {
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
    if (this.e.waveTransitionTimer > halfTransition) {
      ctx.globalAlpha = (this.e.waveTransitionTimer - halfTransition) / halfTransition;
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`WAVE ${this.e.wave}`, GAME_CONSTANTS.CANVAS_WIDTH / 2, GAME_CONSTANTS.CANVAS_HEIGHT / 2);
      ctx.globalAlpha = 1;
    }
  }

  private renderRopes(ctx: CanvasRenderingContext2D): void {
    for (const rope of this.e.ropes) {
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

  private renderHitMarks(ctx: CanvasRenderingContext2D): void {
    if (!this.e.dragonImpactImg.complete) return;

    for (const hm of this.e.hitMarks) {
      const srcX: number = hm.frame * this.e.DRAGON_IMPACT_FRAME_W;
      const renderSize: number = this.e.HIT_MARK_RENDER_SIZE;
      const alpha: number = 1 - hm.frame / this.e.DRAGON_IMPACT_FRAMES;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        this.e.dragonImpactImg,
        srcX, 0, this.e.DRAGON_IMPACT_FRAME_W, this.e.DRAGON_IMPACT_FRAME_H,
        hm.x - renderSize / 2, hm.y - renderSize / 2, renderSize, renderSize,
      );
      ctx.restore();
    }
  }

  private renderDropNotifications(ctx: CanvasRenderingContext2D): void {
    if (this.e.dropNotifications.length === 0) return;

    const rowHeight: number = 28;
    const padding: number = 8;
    const marginRight: number = 12;
    const marginBottom: number = 12;
    const baseX: number = GAME_CONSTANTS.CANVAS_WIDTH - marginRight;
    const baseY: number = GAME_CONSTANTS.CANVAS_HEIGHT - marginBottom;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i: number = 0; i < this.e.dropNotifications.length; i++) {
      const n: DropNotification = this.e.dropNotifications[i];
      const progress: number = n.life / n.maxLife;
      const fadeIn: number = Math.min(1, (n.maxLife - n.life) / 8);
      const fadeOut: number = progress < 0.2 ? progress / 0.2 : 1;
      const alpha: number = fadeIn * fadeOut;

      const rowIdx: number = this.e.dropNotifications.length - 1 - i;
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

  private renderDebugCollisionBoxes(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineWidth = 1;

    const p: CharacterState | null = this.e.player;
    if (p && !p.isDead) {
      ctx.strokeStyle = '#00ff00';
      ctx.strokeRect(p.x, p.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT);

      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
      const attackRange: number = GAME_CONSTANTS.PLAYER_BASE_ATTACK_RANGE;
      const attackX: number = p.facing === Direction.Right
        ? p.x + GAME_CONSTANTS.PLAYER_WIDTH
        : p.x - attackRange;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(attackX, p.y, attackRange, GAME_CONSTANTS.PLAYER_HEIGHT);
      ctx.setLineDash([]);

      this.renderDebugLabel(ctx, '#00ff00', 'PLAYER', p.x, p.y - 4);
    }

    for (const z of this.e.zombies) {
      if (z.isDead || z.spawnTimer > 0) continue;
      ctx.strokeStyle = '#ff4444';
      ctx.strokeRect(z.x, z.y, z.instanceWidth, z.instanceHeight);
      this.renderDebugLabel(ctx, '#ff4444', z.type, z.x, z.y - 4);
    }

    for (const drop of this.e.worldDrops) {
      const size: number = GAME_CONSTANTS.DROP_SIZE;
      ctx.strokeStyle = '#ffcc44';
      ctx.strokeRect(drop.x, drop.y, size, size);
    }

    for (const proj of this.e.dragonProjectiles) {
      ctx.strokeStyle = '#88ccff';
      ctx.strokeRect(proj.x - 20, proj.y - 20, 40, 40);
    }

    for (const proj of this.e.spitterProjectiles) {
      ctx.strokeStyle = '#44ff44';
      ctx.strokeRect(proj.x - 10, proj.y - 10, 20, 20);
    }

    ctx.restore();
  }

  private renderDebugLabel(ctx: CanvasRenderingContext2D, color: string, text: string, x: number, y: number): void {
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(text, x, y);
  }

  updatePlayerAnimState(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    if (p.isDead) {
      this.e.spriteAnimator.setState(PlayerAnimState.Death);
      return;
    }

    if (p.isAttacking) {
      this.e.spriteAnimator.setState(PlayerAnimState.Attack);
      return;
    }

    if (p.isClimbing) {
      this.e.spriteAnimator.setState(PlayerAnimState.Climb);
      return;
    }

    if (!p.isGrounded) {
      this.e.spriteAnimator.setState(PlayerAnimState.Jump);
      return;
    }

    if (Math.abs(p.velocityX) > GAME_CONSTANTS.PLAYER_MIN_VELOCITY) {
      this.e.spriteAnimator.setState(PlayerAnimState.Run);
      return;
    }

    this.e.spriteAnimator.setState(PlayerAnimState.Idle);
  }
}
