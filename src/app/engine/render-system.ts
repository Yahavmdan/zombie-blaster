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
import {
  DamageNumber,
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
    this.e.spriteEffectSystem.render(ctx);
    this.renderDamageNumbers(ctx);
    this.renderDropNotifications(ctx);
    this.renderWaveInfo(ctx);

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

    const classColor: string = CHARACTER_CLASSES[p.classId].color;
    const spriteSize: number = this.e.SPRITE_RENDER_SIZE;
    const offsetX: number = (GAME_CONSTANTS.PLAYER_WIDTH - spriteSize) / 2;
    const offsetY: number = GAME_CONSTANTS.PLAYER_HEIGHT - spriteSize;
    const drawX: number = p.x + offsetX;
    const drawY: number = p.y + offsetY;
    const flipX: boolean = p.facing === Direction.Left;

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
        const offsetX: number = (z.instanceWidth - renderW) / 2;
        const offsetY: number = z.instanceHeight - renderH;
        const drawX: number = z.x + offsetX;
        const drawY: number = z.y + offsetY;
        const flipX: boolean = z.type === ZombieType.DragonBoss ? z.facing > 0 : z.facing < 0;

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
      const offsetX: number = (corpse.width - renderW) / 2;
      const offsetY: number = corpse.height - renderH;
      const drawX: number = corpse.x + offsetX;
      const drawY: number = corpse.y + offsetY;
      const flipX: boolean = corpse.type === ZombieType.DragonBoss ? corpse.facing > 0 : corpse.facing < 0;

      ctx.save();
      ctx.globalAlpha = alpha;
      this.e.zombieSpriteAnimator.draw(
        ctx, corpse.id, corpse.spriteKey,
        drawX, drawY, renderW, renderH, flipX,
      );
      ctx.restore();

      if (corpse.isGrounded) {
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
