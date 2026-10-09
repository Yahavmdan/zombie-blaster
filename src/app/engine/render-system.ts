import {
  ActiveBuff,
  CharacterClassDefinition,
  CharacterState,
  CHARACTER_CLASSES,
  Direction,
  GAME_CONSTANTS,
  SKILLS,
  SkillDefinition,
  ZOMBIE_TYPES,
  isZombieWindingUp,
} from '@shared/index';
import {
  ActiveSpecialEffect,
  BoulderState,
  CagePuzzleState,
  PlateState,
  CageState,
  DropType,
  SpringState,
  PendingSpecialDropConfirm,
  SpecialDropDefinition,
  SpecialDropType,
  ZombieDefinition,
  ZombieState,
  ZombieType,
} from '@shared/game-entities';
import {
  getSpecialDropDefinition,
} from '@shared/game-constants';
import { Particle, ParticleShape, FadeMode } from './particle-types';
import { PlayerAnimState, SpriteAnimator } from './sprite-animator';
import { ZombieAnimState, ZombieSpriteAnchor } from './zombie-sprite-animator';
import { LooseProp, MagnetPull, ZombieCorpse } from '@shared/game-entities';
import { magnetPullProgress } from './magnet-pull';
import { Carriable, CarryPose, carriedIds, isCorpse, nearestCarriable } from './corpse-carry';
import {
  BODY_HALF_SPAN,
  BODY_SHIFT,
  CorpseDrape,
  DRAPE_STRIP_PX,
  corpseFlipX,
  corpseRenderSize,
  dropAt,
  maxDrop,
  shiftAt,
} from './corpse-drape';
import {
  Box,
  BoulderPath,
  boulderBox,
  boulderPath,
  floorHint,
  gateBox,
  gateBroken,
  Point,
} from './boulder-puzzle';
import {
  SPRING_FLOOR_HINT,
  buttonBox,
  buttonTopY,
  cablePath,
  countdownSeconds,
  gaugeFraction,
  isBusy,
  isButtonUp,
  isLoaded,
  plateOffset,
  scaleBox,
  scalePostTopY,
  scalePostX,
  springSpan,
} from './spring-puzzle';
import {
  CAGE_FLOOR_HINT,
  cageBox,
  chainPath,
  cleatBox,
  isCut,
} from './cage-puzzle';
import { PLATE_FLOOR_HINT, doorBox, isHeld, plateBox } from './plate-puzzle';
import {
  BoulderPuzzleLayout,
  CagePuzzleLayout,
  PlatePuzzleLayout,
  SpringPuzzleLayout,
  DashPhaseState,
  DropNotification,
  IGameEngine,
  LevelUpNotification,
  Platform,
  PlayerTint,
} from './engine-types';
import { drawPixelIcon } from '../ui/pixel-icon-raster';
import { lightningFlash } from './storm';
import {
  drawBoulder,
  drawButton,
  drawCable,
  drawCageRing,
  drawChain,
  drawChute,
  drawCleatArt,
  drawExitArrows,
  drawExitDoorArt,
  drawGate,
  drawPlateArt,
  drawScalePan,
  drawScalePost,
} from './puzzle-art';
import {
  CANVAS_BLOOD_HI,
  CANVAS_BONE,
  CANVAS_BONE_DIM,
  CANVAS_GOLD,
  CANVAS_INK,
  CANVAS_INK_2,
  CANVAS_TOXIC_HI,
  fillOutlinedText,
  fillPixelBox,
  fillPixelPanel,
  pixelFont,
  preloadCanvasFonts,
  snapFontSize,
} from './canvas-text';

/** Strips past a carried body's ends (empty sprite margin) stop dropping further. */
const BEND_MAX_REACH: number = 1.3;
/** A lying body sagging less than this is drawn straight. */
const MIN_DRAPE_PX: number = 0.5;
/** Strips of a bent body sloping less than this are drawn unturned (and merged). */
const FLAT_STRIP_RAD: number = 0.05;

/** How far one strip of a bent corpse sprite is moved. */
interface StripOffset {
  dx: number;
  dy: number;
}

/** Matches the warrior-monster-magnet skill color. */
const MAGNET_STREAK_COLOR: string = '#cc44ff';
const HURT_TINT_COLOR: string = '#ff2020';
const POISON_TINT_COLOR: string = '#30ff50';
/** Ticks over which the poison tint fades out at the end. */
const POISON_TINT_FADE_TICKS: number = 20;

export class RenderSystem {
  private bendSprite: HTMLCanvasElement | null = null;

  constructor(private readonly e: IGameEngine) {
    preloadCanvasFonts();
  }

  private getTwinMimicPercent(p: CharacterState): number {
    const twinBuff: ActiveBuff | undefined = p.activeBuffs.find(
      (b: ActiveBuff): boolean => b.stat === 'twinMimicPercent' && b.remainingMs > 0,
    );
    return twinBuff ? twinBuff.value : 0;
  }

  private hasDarkSight(p: CharacterState): boolean {
    return p.activeBuffs.some(
      (b: ActiveBuff): boolean => b.stat === 'darkSight' && b.remainingMs > 0,
    );
  }

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
      this.e.mapRenderer.render(ctx, performance.now(), this.e.lightning);
    } else {
      this.renderBackground(ctx);
      this.renderRopes(ctx);
      this.renderPlatforms(ctx);
    }
    // The exit cage's chain runs down behind the exit.
    this.renderCageChains(ctx);
    this.renderSpringCable(ctx);
    this.renderExitPlatform(ctx);
    this.renderSafeSpotMarker(ctx);
    this.renderBoulderPuzzle(ctx);
    this.renderSpringPuzzle(ctx);
    this.renderCages(ctx);
    this.renderPlate(ctx);
    this.renderLyingProps(ctx);
    this.renderZombies(ctx);
    this.renderHitMarks(ctx);
    this.renderDragonProjectiles(ctx);
    this.renderSpitterProjectiles(ctx);
    this.renderDrops(ctx);
    // Carried corpses and props rest on their carriers' heads, under the name tags.
    this.renderCarriedCorpses(ctx);
    this.renderCarriedProps(ctx);
    this.renderRemotePlayers(ctx);
    this.renderPlayer(ctx);
    this.renderCarryPrompt(ctx);
    this.renderPlayerProjectiles(ctx);
    this.renderReviveProgress(ctx);
    this.renderParticles(ctx);
    this.renderDashOverlay(ctx);
    this.e.spriteEffectSystem.render(ctx);
    this.renderDamageNumbers(ctx);
    this.renderDropNotifications(ctx);
    this.renderActiveSpecialEffects(ctx);
    this.renderPendingSpecialDropDialog(ctx);
    this.renderLevelUpNotification(ctx);
    this.renderFloorInfo(ctx);
    if (this.e.showCollisionBoxes) {
      this.renderDebugCollisionBoxes(ctx);
    }

    ctx.restore();

    this.renderLightningFlash(ctx);

    if (this.e.screenFlashFrames > 0 && this.e.screenFlashColor) {
      ctx.globalAlpha = this.e.screenFlashFrames / 10;
      ctx.fillStyle = this.e.screenFlashColor;
      ctx.fillRect(0, 0, GAME_CONSTANTS.CANVAS_WIDTH, GAME_CONSTANTS.CANVAS_HEIGHT);
      ctx.globalAlpha = 1;
      this.e.screenFlashFrames--;
    }
  }

  /** A strike washes the whole screen, players and zombies included, for a moment. */
  private renderLightningFlash(ctx: CanvasRenderingContext2D): void {
    if (!this.e.lightning) return;
    const flash: number = lightningFlash(this.e.lightning.ageMs);
    if (flash <= 0) return;
    ctx.fillStyle = `rgba(230, 228, 255, ${flash * GAME_CONSTANTS.LIGHTNING_SCREEN_FLASH_ALPHA})`;
    ctx.fillRect(0, 0, GAME_CONSTANTS.CANVAS_WIDTH, GAME_CONSTANTS.CANVAS_HEIGHT);
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

    if (p.isDown) {
      this.renderDownedPlayer(ctx, p);
      return;
    }

    this.renderBuffAura(ctx, p);
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

    const darkSightAlpha: number = this.hasDarkSight(p) ? GAME_CONSTANTS.DARK_SIGHT_ALPHA : 1;
    const combinedAlpha: number = dashAlpha * darkSightAlpha;
    const needsAlpha: boolean = combinedAlpha < 1;
    if (needsAlpha) {
      ctx.save();
      ctx.globalAlpha = combinedAlpha;
    }

    const classColor: string = CHARACTER_CLASSES[p.classId].color;
    const spriteSize: number = this.e.SPRITE_RENDER_SIZE;
    const flipX: boolean = p.facing === Direction.Left;
    const playerAnchorX: number = 0.30;
    const playerAnchorY: number = 0.979;
    const effectiveAnchorX: number = flipX ? (1 - playerAnchorX) : playerAnchorX;
    const drawX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2 - spriteSize * effectiveAnchorX;
    const drawY: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT - spriteSize * playerAnchorY;

    const superSpeed: boolean = this.isSuperSpeedActive();
    const isRunning: boolean = p.velocityX !== 0;

    const twinPercent: number = this.getTwinMimicPercent(p);
    if (twinPercent > 0) {
      this.renderMagicTwin(ctx, p, drawX, drawY, spriteSize, flipX, dashAlpha, true);
    }

    if (this.e.spriteAnimator.isLoaded()) {
      if (superSpeed && isRunning) {
        this.renderSpeedTrail(ctx, p, drawX, drawY, spriteSize, flipX,
          (trailCtx: CanvasRenderingContext2D, tx: number, ty: number, tw: number, th: number, tf: boolean): void => {
            this.e.spriteAnimator.draw(trailCtx, tx, ty, tw, th, tf);
          });
      }
      this.e.spriteAnimator.draw(ctx, drawX, drawY, spriteSize, spriteSize, flipX);
      this.renderStatusTint(ctx, p.id, this.e.spriteAnimator, drawX, drawY, spriteSize, flipX);
    } else {
      ctx.save();
      ctx.translate(p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2);
      if (flipX) ctx.scale(-1, 1);
      ctx.fillStyle = classColor;
      ctx.fillRect(-GAME_CONSTANTS.PLAYER_WIDTH / 2, -GAME_CONSTANTS.PLAYER_HEIGHT / 2, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT);
      ctx.restore();
    }

    ctx.font = pixelFont(12, 700);
    ctx.textAlign = 'center';
    fillOutlinedText(ctx, p.name, p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y - 12, classColor);
    ctx.font = pixelFont(10);
    fillOutlinedText(ctx, `Lv.${p.level}`, p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y - 2, CANVAS_BONE);

    if (needsAlpha) {
      ctx.restore();
    }
  }

  private renderDownedPlayer(ctx: CanvasRenderingContext2D, p: CharacterState): void {
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const classColor: string = CHARACTER_CLASSES[p.classId].color;
    const blink: boolean = Math.floor(Date.now() / 300) % 2 === 0;

    const spriteSize: number = this.e.SPRITE_RENDER_SIZE;
    const flipX: boolean = p.facing === Direction.Left;
    const playerAnchorX: number = 0.30;
    const playerAnchorY: number = 0.979;
    const effectiveAnchorX: number = flipX ? (1 - playerAnchorX) : playerAnchorX;
    const drawX: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2 - spriteSize * effectiveAnchorX;
    const drawY: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT - spriteSize * playerAnchorY;

    const isLocal: boolean = this.e.player === p;

    ctx.save();
    ctx.globalAlpha = blink ? 0.7 : 0.4;

    if (isLocal && this.e.spriteAnimator.isLoaded()) {
      this.e.spriteAnimator.draw(ctx, drawX, drawY, spriteSize, spriteSize, flipX);
    } else if (!isLocal) {
      const animator: SpriteAnimator | undefined = this.e.remotePlayerAnimators.get(p.id);
      if (animator && animator.isLoaded()) {
        animator.draw(ctx, drawX, drawY, spriteSize, spriteSize, flipX);
      } else {
        ctx.fillStyle = classColor;
        ctx.fillRect(p.x, p.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT);
      }
    } else {
      ctx.fillStyle = classColor;
      ctx.fillRect(p.x, p.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT);
    }

    ctx.restore();

    const timerSeconds: number = Math.ceil(p.downTimer / GAME_CONSTANTS.TICK_RATE);
    const timerPercent: number = p.downTimer / GAME_CONSTANTS.REVIVE_WINDOW_TICKS;
    const barWidth: number = 50;
    const barHeight: number = 6;
    const barX: number = cx - barWidth / 2;
    const barY: number = p.y - 30;

    ctx.fillStyle = '#333333';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    const timerColor: string = timerPercent > 0.5 ? '#ffcc00' : timerPercent > 0.25 ? '#ff8800' : '#ff2200';
    ctx.fillStyle = timerColor;
    ctx.fillRect(barX, barY, barWidth * timerPercent, barHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    ctx.font = pixelFont(12, 700);
    ctx.textAlign = 'center';
    fillOutlinedText(ctx, `${timerSeconds}s`, cx, barY - 4, CANVAS_BONE);

    ctx.font = pixelFont(10, 700);
    fillOutlinedText(ctx, 'Downed', cx, barY - 16, CANVAS_BLOOD_HI);

    ctx.font = pixelFont(12, 700);
    fillOutlinedText(ctx, p.name, cx, barY - 28, classColor);
  }

  private renderReviveProgress(ctx: CanvasRenderingContext2D): void {
    const targetId: string | null = this.e.reviveTargetId;
    if (targetId === null) return;

    const target: CharacterState | undefined = this.e.remotePlayers.find(
      (rp: CharacterState) => rp.id === targetId,
    );
    if (!target || !target.isDown) return;

    const cx: number = target.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const cy: number = target.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const progress: number = this.e.reviveProgressTicks / GAME_CONSTANTS.REVIVE_CHANNEL_TICKS;

    const barWidth: number = 60;
    const barHeight: number = 8;
    const barX: number = cx - barWidth / 2;
    const barY: number = target.y - 10;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
    ctx.fillStyle = '#222222';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = '#44ff88';
    ctx.fillRect(barX, barY, barWidth * progress, barHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    ctx.font = pixelFont(10, 700);
    ctx.textAlign = 'center';
    fillOutlinedText(ctx, 'Reviving...', cx, barY - 4, '#44ff88');

    const radius: number = 24;
    ctx.strokeStyle = '#44ff88';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }

  private renderRemotePlayers(ctx: CanvasRenderingContext2D): void {
    for (const rp of this.e.remotePlayers) {
      if (rp.isDead) continue;

      if (rp.isDown) {
        this.renderDownedPlayer(ctx, rp);
        continue;
      }

      this.renderBuffAura(ctx, rp);
      const classDef: CharacterClassDefinition = CHARACTER_CLASSES[rp.classId];
      const classColor: string = classDef.color;
      const flipX: boolean = rp.facing === Direction.Left;
      const spriteSize: number = this.e.SPRITE_RENDER_SIZE;
      const animator: SpriteAnimator | undefined =
        this.e.remotePlayerAnimators.get(rp.id);

      ctx.save();
      const remoteDarkSightAlpha: number = this.hasDarkSight(rp) ? GAME_CONSTANTS.DARK_SIGHT_ALPHA : 1;
      ctx.globalAlpha = 0.85 * remoteDarkSightAlpha;

      const superSpeed: boolean = this.isSuperSpeedActive();

      if (animator && animator.isLoaded()) {
        const playerAnchorX: number = 0.30;
        const playerAnchorY: number = 0.979;
        const effectiveAnchorX: number = flipX ? (1 - playerAnchorX) : playerAnchorX;
        const drawX: number = rp.x + GAME_CONSTANTS.PLAYER_WIDTH / 2 - spriteSize * effectiveAnchorX;
        const drawY: number = rp.y + GAME_CONSTANTS.PLAYER_HEIGHT - spriteSize * playerAnchorY;

        const remoteTwinPercent: number = this.getTwinMimicPercent(rp);
        if (remoteTwinPercent > 0) {
          this.renderMagicTwinRemote(ctx, rp, drawX, drawY, spriteSize, flipX, animator);
        }

        const isRunning: boolean = rp.velocityX !== 0;
        if (superSpeed && isRunning) {
          this.renderSpeedTrail(ctx, rp, drawX, drawY, spriteSize, flipX,
            (trailCtx: CanvasRenderingContext2D, tx: number, ty: number, tw: number, th: number, tf: boolean): void => {
              animator.draw(trailCtx, tx, ty, tw, th, tf);
            });
        }
        animator.draw(ctx, drawX, drawY, spriteSize, spriteSize, flipX);
        this.renderStatusTint(ctx, rp.id, animator, drawX, drawY, spriteSize, flipX);
      } else {
        ctx.translate(rp.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, rp.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2);
        if (flipX) ctx.scale(-1, 1);
        ctx.fillStyle = classColor;
        ctx.fillRect(
          -GAME_CONSTANTS.PLAYER_WIDTH / 2,
          -GAME_CONSTANTS.PLAYER_HEIGHT / 2,
          GAME_CONSTANTS.PLAYER_WIDTH,
          GAME_CONSTANTS.PLAYER_HEIGHT,
        );
      }

      ctx.restore();

      ctx.font = pixelFont(12, 700);
      ctx.textAlign = 'center';
      fillOutlinedText(ctx, rp.name, rp.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, rp.y - 12, classColor);
      ctx.font = pixelFont(10);
      fillOutlinedText(ctx, `Lv.${rp.level}`, rp.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, rp.y - 2, CANVAS_BONE);

      const hpPercent: number = rp.hp / rp.derived.maxHp;
      const barWidth: number = 40;
      const barX: number = rp.x + GAME_CONSTANTS.PLAYER_WIDTH / 2 - barWidth / 2;
      const barY: number = rp.y - 22;
      ctx.fillStyle = '#333333';
      ctx.fillRect(barX, barY, barWidth, 4);
      ctx.fillStyle = hpPercent > 0.3 ? '#44cc44' : '#ff4444';
      ctx.fillRect(barX, barY, barWidth * hpPercent, 4);
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

  private isShockActive(): boolean {
    return this.e.activeSpecialEffects.some(
      (eff: ActiveSpecialEffect): boolean => eff.type === SpecialDropType.ZombieShock,
    );
  }

  private isSuperSpeedActive(): boolean {
    return this.e.activeSpecialEffects.some(
      (eff: ActiveSpecialEffect): boolean => eff.type === SpecialDropType.SuperSpeed,
    );
  }

  private renderMagicTwin(
    ctx: CanvasRenderingContext2D,
    p: CharacterState,
    drawX: number,
    drawY: number,
    spriteSize: number,
    flipX: boolean,
    dashAlpha: number,
    isLocal: boolean,
  ): void {
    const dir: number = p.facing === Direction.Right ? 1 : -1;
    const twinOffsetX: number = -dir * GAME_CONSTANTS.MAGIC_TWIN_OFFSET_X;
    const twinDrawX: number = drawX + twinOffsetX;
    const twinDrawY: number = drawY;
    const twinAlpha: number = GAME_CONSTANTS.MAGIC_TWIN_ALPHA * dashAlpha;

    ctx.save();
    ctx.globalAlpha = twinAlpha;

    if (isLocal && this.e.spriteAnimator.isLoaded()) {
      this.e.spriteAnimator.draw(ctx, twinDrawX, twinDrawY, spriteSize, spriteSize, flipX);
    } else {
      const classColor: string = CHARACTER_CLASSES[p.classId].color;
      ctx.translate(
        p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2 + twinOffsetX,
        p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
      );
      if (flipX) ctx.scale(-1, 1);
      ctx.fillStyle = classColor;
      ctx.fillRect(
        -GAME_CONSTANTS.PLAYER_WIDTH / 2,
        -GAME_CONSTANTS.PLAYER_HEIGHT / 2,
        GAME_CONSTANTS.PLAYER_WIDTH,
        GAME_CONSTANTS.PLAYER_HEIGHT,
      );
    }

    ctx.restore();
  }

  private renderMagicTwinRemote(
    ctx: CanvasRenderingContext2D,
    rp: CharacterState,
    drawX: number,
    drawY: number,
    spriteSize: number,
    flipX: boolean,
    animator: SpriteAnimator,
  ): void {
    const dir: number = rp.facing === Direction.Right ? 1 : -1;
    const twinOffsetX: number = -dir * GAME_CONSTANTS.MAGIC_TWIN_OFFSET_X;
    const twinDrawX: number = drawX + twinOffsetX;
    const twinDrawY: number = drawY;

    ctx.save();
    ctx.globalAlpha = GAME_CONSTANTS.MAGIC_TWIN_ALPHA * 0.85;
    animator.draw(ctx, twinDrawX, twinDrawY, spriteSize, spriteSize, flipX);
    ctx.restore();
  }

  private renderSpeedTrail(
    ctx: CanvasRenderingContext2D,
    p: CharacterState,
    drawX: number,
    drawY: number,
    spriteSize: number,
    flipX: boolean,
    drawFn: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, flip: boolean) => void,
  ): void {
    const trailCount: number = GAME_CONSTANTS.SPECIAL_SUPER_SPEED_TRAIL_COUNT;
    const spacing: number = GAME_CONSTANTS.SPECIAL_SUPER_SPEED_TRAIL_SPACING;
    const dirSign: number = p.facing === Direction.Left ? 1 : -1;

    for (let i: number = trailCount; i >= 1; i--) {
      const t: number = i / trailCount;
      const offsetX: number = dirSign * spacing * i;
      const stretchW: number = spriteSize * (1 + t * 0.35);
      const stretchH: number = spriteSize * (1 - t * 0.08);
      const stretchOffsetX: number = (stretchW - spriteSize) / 2;
      const stretchOffsetY: number = (spriteSize - stretchH);
      const alpha: number = 0.08 + 0.1 * (trailCount - i);
      const blur: number = 3 + i * 2;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.filter = `blur(${blur}px)`;
      drawFn(ctx, drawX + offsetX - stretchOffsetX, drawY + stretchOffsetY, stretchW, stretchH, flipX);
      ctx.restore();
    }
  }

  private renderElectricArcs(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number,
  ): void {
    const arcCount: number = GAME_CONSTANTS.SPECIAL_ZOMBIE_SHOCK_ARC_COUNT;
    const segments: number = GAME_CONSTANTS.SPECIAL_ZOMBIE_SHOCK_ARC_SEGMENTS;

    ctx.save();
    for (let a: number = 0; a < arcCount; a++) {
      const startX: number = cx + (Math.random() - 0.5) * w * 0.8;
      const startY: number = cy - h * 0.1 + (Math.random() - 0.5) * h * 0.6;
      const endX: number = cx + (Math.random() - 0.5) * w * 0.8;
      const endY: number = cy - h * 0.1 + (Math.random() - 0.5) * h * 0.6;

      ctx.beginPath();
      ctx.moveTo(startX, startY);

      for (let s: number = 1; s <= segments; s++) {
        const t: number = s / segments;
        const px: number = startX + (endX - startX) * t + (Math.random() - 0.5) * 14;
        const py: number = startY + (endY - startY) * t + (Math.random() - 0.5) * 14;
        ctx.lineTo(px, py);
      }

      ctx.strokeStyle = Math.random() > 0.4 ? '#ffffff' : '#ccff00';
      ctx.lineWidth = Math.random() > 0.5 ? 2 : 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Brief white flash on a zombie that was just hit (knockback is synced, so everyone sees it). */
  /**
   * Monster-magnet drag, drawn from the synced pull state so every screen shows the same thing.
   * Bracing: the zombie shakes and leans away, resisting. Dragged: it tilts toward the caster,
   * feet trailing, with streaks behind it that lengthen as it speeds up.
   */
  private renderMagnetDrag(
    ctx: CanvasRenderingContext2D,
    z: ZombieState,
    progress: number,
    drawSprite: () => void,
  ): void {
    const pull: MagnetPull | null = z.magnetPull;
    if (!pull) return;
    const dir: number = pull.targetX >= pull.startX ? 1 : -1;
    const bracing: boolean = pull.delayTicks > 0;
    const feetX: number = z.x + z.instanceWidth / 2;
    const feetY: number = z.y + z.instanceHeight;

    if (!bracing) {
      const streakLength: number = 8 + 34 * progress;
      ctx.save();
      ctx.strokeStyle = MAGNET_STREAK_COLOR;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i: number = 0; i < 3; i++) {
        const y: number = z.y + z.instanceHeight * (0.3 + i * 0.25);
        ctx.globalAlpha = 0.5 - i * 0.12;
        ctx.beginPath();
        ctx.moveTo(feetX - dir * (z.instanceWidth / 2 + 2), y);
        ctx.lineTo(feetX - dir * (z.instanceWidth / 2 + 2 + streakLength * (1 - i * 0.2)), y);
        ctx.stroke();
      }
      ctx.restore();
    }

    const shake: number = bracing ? Math.sin(performance.now() / 18) * 1.5 : 0;
    const tilt: number = bracing ? -dir * 0.12 : dir * 0.35 * Math.sin(Math.PI * Math.min(1, progress * 1.4));
    ctx.save();
    ctx.translate(feetX + shake, feetY);
    ctx.rotate(tilt);
    ctx.translate(-feetX, -feetY);
    drawSprite();
    ctx.restore();
  }

  private renderHitFlash(ctx: CanvasRenderingContext2D, z: ZombieState): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(
      z.x + z.instanceWidth / 2,
      z.y + z.instanceHeight / 2,
      z.instanceWidth * 0.55,
      z.instanceHeight * 0.5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }

  /** Soft glow at the feet of a player with an active buff, in the buff skill's color. */
  private renderBuffAura(ctx: CanvasRenderingContext2D, p: CharacterState): void {
    const buff: ActiveBuff | undefined = p.activeBuffs.find((b: ActiveBuff): boolean => b.remainingMs > 0);
    if (!buff) return;
    const color: string = SKILLS.find((s: SkillDefinition): boolean => s.id === buff.skillId)?.color ?? '#ffcc44';
    const pulse: number = 0.5 + Math.sin(performance.now() / 180) * 0.5;
    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const feet: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT;
    ctx.save();
    ctx.globalAlpha = 0.25 + pulse * 0.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, feet - 2, 26 + pulse * 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.12 + pulse * 0.08;
    ctx.beginPath();
    ctx.ellipse(cx, feet - GAME_CONSTANTS.PLAYER_HEIGHT / 2, 30, GAME_CONSTANTS.PLAYER_HEIGHT * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Wind-up warning: a big pulsing "!" over the zombie's head so players can react before the hit lands. */
  private renderAttackTelegraph(ctx: CanvasRenderingContext2D, z: ZombieState): void {
    const cx: number = z.x + z.instanceWidth / 2;
    const pulse: number = 0.5 + Math.sin(performance.now() / 45) * 0.5;
    const scale: number = 1 + pulse * 0.2;
    ctx.save();
    ctx.translate(cx, z.y - 8);
    ctx.scale(scale, scale);
    ctx.font = pixelFont(28, 700);
    ctx.textAlign = 'center';
    fillOutlinedText(ctx, '!', 0, 0, pulse > 0.5 ? '#ffdd33' : '#ff3030', CANVAS_INK, 6);
    ctx.restore();
  }

  private renderZombies(ctx: CanvasRenderingContext2D): void {
    this.renderZombieCorpses(ctx);

    const shocked: boolean = this.isShockActive();
    const vibrate: number = GAME_CONSTANTS.SPECIAL_ZOMBIE_SHOCK_VIBRATE_PX;

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
        let drawX: number = z.x + z.instanceWidth / 2 - renderW * effectiveAnchorX;
        let drawY: number = z.y + z.instanceHeight - renderH * anchor.anchorY;

        if (shocked && !isSpawning) {
          drawX += (Math.random() - 0.5) * vibrate * 2;
          drawY += (Math.random() - 0.5) * vibrate * 2;
        }

        const pullProgress: number | null = magnetPullProgress(z);
        if (pullProgress !== null) {
          this.renderMagnetDrag(ctx, z, pullProgress, (): void => {
            this.e.zombieSpriteAnimator.draw(ctx, z.id, spriteKey, drawX, drawY, renderW, renderH, flipX);
          });
        } else {
          this.e.zombieSpriteAnimator.draw(ctx, z.id, spriteKey, drawX, drawY, renderW, renderH, flipX);
        }
        if (z.knockbackFrames >= GAME_CONSTANTS.KNOCKBACK_ZOMBIE_FRAMES - 2) this.renderHitFlash(ctx, z);
        if (isZombieWindingUp(z)) this.renderAttackTelegraph(ctx, z);

        if (shocked && !isSpawning) {
          const arcCx: number = z.x + z.instanceWidth / 2;
          const arcCy: number = z.y + z.instanceHeight / 2;
          this.renderElectricArcs(ctx, arcCx, arcCy, renderW * 0.6, renderH * 0.7);
        }
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
        ctx.font = pixelFont(12, 700);
        ctx.textAlign = 'center';
        const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];
        fillOutlinedText(ctx, zDef.name, z.x + z.instanceWidth / 2, barY - 4, '#88ccff');
      }
    }
  }

  /** A corpse or prop on someone's head (granted, or the local player's pick-up awaiting the host). */
  private isCarried(item: Carriable): boolean {
    return item.carrierId !== null || (!!this.e.player && carriedIds(this.e.player).includes(item.id));
  }

  /** Lying corpses, drawn under the zombies. Carried ones are drawn with the players. */
  private renderZombieCorpses(ctx: CanvasRenderingContext2D): void {
    this.drawCorpses(ctx, this.e.zombieCorpses.filter((c: ZombieCorpse): boolean => !this.isCarried(c)));
  }

  private renderCarriedCorpses(ctx: CanvasRenderingContext2D): void {
    this.drawCorpses(ctx, this.e.zombieCorpses.filter((c: ZombieCorpse): boolean => this.isCarried(c)));
  }

  /** Pickable props lying (or flying) in the world, drawn like the map's other props. */
  private renderLyingProps(ctx: CanvasRenderingContext2D): void {
    for (const p of this.e.looseProps.filter((q: LooseProp): boolean => !this.isCarried(q))) {
      this.e.mapRenderer.drawLooseProp(ctx, p);
    }
  }

  private renderCarriedProps(ctx: CanvasRenderingContext2D): void {
    for (const p of this.e.looseProps.filter((q: LooseProp): boolean => this.isCarried(q))) {
      this.e.mapRenderer.drawLooseProp(ctx, p);
    }
  }

  /**
   * What the carry key does next: "[E] Carry" over the corpse or prop it would pick up (with the
   * stack count once carrying), or "[E] Throw" over the stack when nothing more can be picked up.
   */
  private renderCarryPrompt(ctx: CanvasRenderingContext2D): void {
    const p: CharacterState | null = this.e.player;
    if (!p || p.isDead || p.isDown) return;
    const ids: string[] = carriedIds(p);
    const items: Carriable[] = [...this.e.zombieCorpses, ...this.e.looseProps];
    const next: Carriable | null =
      ids.length < GAME_CONSTANTS.CORPSE_CARRY_MAX ? nearestCarriable(p, items) : null;
    const stackTop: Carriable | undefined = items.find(
      (c: Carriable): boolean => c.id === ids[ids.length - 1],
    );
    const anchor: Carriable | undefined = next ?? stackTop;
    if (!anchor) return;
    const count: string = ids.length > 0 ? ` (${ids.length}/${GAME_CONSTANTS.CORPSE_CARRY_MAX})` : '';
    const label: string = `[${this.e.carryKeyLabel}] ${next ? `Carry${count}` : 'Throw'}`;
    const cx: number = anchor.x + anchor.width / 2;
    // A corpse's body lies low in its tall box; a prop's art fills its box.
    const y: number = isCorpse(anchor) ? anchor.y + anchor.height - 34 : anchor.y - 6;
    ctx.save();
    ctx.font = pixelFont(12, 700);
    ctx.textAlign = 'center';
    const w: number = Math.round(ctx.measureText(label).width) + 12;
    fillPixelBox(ctx, Math.round(cx - w / 2), y - 14, w, 20, CANVAS_INK_2);
    ctx.fillStyle = CANVAS_GOLD;
    ctx.fillText(label, cx, y);
    ctx.restore();
  }

  private drawCorpses(ctx: CanvasRenderingContext2D, corpses: ZombieCorpse[]): void {
    if (!this.e.zombieSpriteAnimator.isLoaded()) return;

    for (const corpse of corpses) {
      const progress: number = corpse.fadeTimer / corpse.maxFadeTimer;
      const alpha: number = Math.min(1, progress * 2);

      const renderW: number = corpseRenderSize(corpse);
      const renderH: number = renderW;
      const flipX: boolean = corpseFlipX(corpse);
      const anchor: ZombieSpriteAnchor = this.e.zombieSpriteAnimator.getAnchor(corpse.spriteKey);
      const effectiveAnchorX: number = flipX ? (1 - anchor.anchorX) : anchor.anchorX;
      // A lying body stretches behind its feet (the anchor); carried, its middle goes on the head.
      const bodyShift: number = this.isCarried(corpse) ? (flipX ? 1 : -1) * renderW * BODY_SHIFT : 0;
      const drawX: number = corpse.x + corpse.width / 2 - renderW * effectiveAnchorX + bodyShift;
      const drawY: number = corpse.y + corpse.height - renderH * anchor.anchorY;

      const pose: CarryPose | undefined = this.isCarried(corpse) ? this.e.carryPoses.get(corpse.id) : undefined;
      if (pose) {
        this.drawSwayingCorpse(ctx, corpse, pose, drawX, drawY, renderW, flipX, alpha);
        continue;
      }

      const drape: CorpseDrape | undefined = this.isLyingFlat(corpse) ? this.e.corpseDrapes.get(corpse.id) : undefined;
      if (drape && maxDrop(drape) >= MIN_DRAPE_PX) {
        ctx.save();
        ctx.globalAlpha = alpha;
        this.drawBentCorpse(ctx, corpse, drawX, drawY, renderW, flipX, (x: number): StripOffset => ({ dx: shiftAt(drape, x), dy: dropAt(drape, x) }));
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        this.e.zombieSpriteAnimator.draw(
          ctx, corpse.id, corpse.spriteKey,
          drawX, drawY, renderW, renderH, flipX,
        );
        ctx.restore();
      }

      if (corpse.isGrounded) {
        if (corpse.showBlood) {
          this.renderCorpseBlood(ctx, corpse);
        }
        this.renderCorpseFlies(ctx, corpse);
      }
    }
  }

  /**
   * A carried body draped over the head: drawn in thin vertical strips, each dropped by the pose's
   * sag (growing with the square of its distance from the head) so the ends hang, then bobbed and
   * tilted about the head.
   */
  private drawSwayingCorpse(
    ctx: CanvasRenderingContext2D,
    corpse: ZombieCorpse,
    pose: CarryPose,
    drawX: number,
    drawY: number,
    size: number,
    flipX: boolean,
    alpha: number,
  ): void {
    const pivotX: number = corpse.x + corpse.width / 2;
    const pivotY: number = corpse.y + corpse.height;
    const halfSpan: number = size * BODY_HALF_SPAN;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pivotX, pivotY + Math.round(pose.bob));
    ctx.rotate(pose.tilt);
    ctx.translate(-pivotX, -pivotY);
    this.drawBentCorpse(ctx, corpse, drawX, drawY, size, flipX, (x: number): StripOffset => {
      const reach: number = Math.min(BEND_MAX_REACH, Math.abs(x - pivotX) / halfSpan);
      return { dx: 0, dy: pose.sag * reach * reach };
    });
    ctx.restore();
  }

  /** The corpse shows its last death frame: fully lying down (the body a drape bends). */
  private isLyingFlat(corpse: ZombieCorpse): boolean {
    const anim: { state: ZombieAnimState; frame: number } | null = this.e.zombieSpriteAnimator.getInstanceFrame(corpse.id);
    return (
      !!anim &&
      anim.state === ZombieAnimState.Dead &&
      anim.frame === this.e.zombieSpriteAnimator.getFrameCount(corpse.spriteKey, ZombieAnimState.Dead) - 1
    );
  }

  /**
   * Draws a corpse's frame bent: in thin vertical strips, each moved by `offsetAt` of its screen x
   * and turned along the bend about the body's underside, so a hanging part keeps its thickness
   * instead of being sheared thin. Flat neighbors moved the same are drawn as one.
   */
  private drawBentCorpse(
    ctx: CanvasRenderingContext2D,
    corpse: ZombieCorpse,
    drawX: number,
    drawY: number,
    size: number,
    flipX: boolean,
    offsetAt: (x: number) => StripOffset,
  ): void {
    const sprite: HTMLCanvasElement = this.bendCanvas(size);
    const spriteCtx: CanvasRenderingContext2D = sprite.getContext('2d')!;
    spriteCtx.clearRect(0, 0, size, size);
    this.e.zombieSpriteAnimator.draw(spriteCtx, corpse.id, corpse.spriteKey, 0, 0, size, size, flipX);

    ctx.imageSmoothingEnabled = false;
    const count: number = Math.ceil(size / DRAPE_STRIP_PX);
    const offsets: StripOffset[] = Array.from({ length: count }, (_: unknown, k: number): StripOffset =>
      offsetAt(drawX + k * DRAPE_STRIP_PX + DRAPE_STRIP_PX / 2),
    );
    const base: DOMMatrix = ctx.getTransform();
    const pivotY: number = corpse.y + corpse.height;
    let runStart: number = 0;
    let run: StripOffset | null = null;
    const flushRun: (end: number) => void = (end: number): void => {
      if (run && end > runStart) {
        ctx.drawImage(sprite, runStart, 0, end - runStart, size, drawX + runStart + run.dx, drawY + run.dy, end - runStart, size);
      }
      run = null;
    };
    for (let k: number = 0; k < count; k++) {
      const sx: number = k * DRAPE_STRIP_PX;
      const w: number = Math.min(DRAPE_STRIP_PX, size - sx);
      const before: StripOffset = offsets[Math.max(0, k - 1)];
      const after: StripOffset = offsets[Math.min(count - 1, k + 1)];
      const span: number = (Math.min(count - 1, k + 1) - Math.max(0, k - 1)) * DRAPE_STRIP_PX;
      const angle: number = span > 0 ? Math.atan((after.dy - before.dy) / span) : 0;
      const dx: number = Math.round(offsets[k].dx);
      const dy: number = Math.round(offsets[k].dy);
      if (Math.abs(angle) < FLAT_STRIP_RAD) {
        if (run && run.dx === dx && run.dy === dy) continue;
        flushRun(sx);
        runStart = sx;
        run = { dx, dy };
        continue;
      }
      flushRun(sx);
      // Turned about this strip's spot on the body's underside; a pixel wider so no seams open.
      ctx.translate(drawX + sx + offsets[k].dx + w / 2, pivotY + offsets[k].dy);
      ctx.rotate(angle);
      ctx.drawImage(sprite, sx, 0, w, size, -w / 2 - 0.5, drawY - pivotY, w + 1, size);
      ctx.setTransform(base);
    }
    flushRun(size);
  }

  /** Scratch canvas a carried corpse's frame is drawn on before it is bent onto the screen. */
  private bendCanvas(size: number): HTMLCanvasElement {
    if (!this.bendSprite) this.bendSprite = document.createElement('canvas');
    if (this.bendSprite.width < size || this.bendSprite.height < size) {
      this.bendSprite.width = size;
      this.bendSprite.height = size;
    }
    return this.bendSprite;
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

  private renderPlayerProjectiles(ctx: CanvasRenderingContext2D): void {
    for (const proj of this.e.playerProjectiles) {
      if (proj.delay > 0) continue;
      ctx.save();
      ctx.translate(proj.x, proj.y);
      ctx.rotate(proj.rotation);

      const size: number = proj.size;
      const outerR: number = size;
      const innerR: number = size * 0.35;
      const spikes: number = 4;

      ctx.fillStyle = proj.particleColor;
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

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = proj.particleColor;
      const trailDir: number = proj.velocityX > 0 ? -1 : 1;
      for (let t: number = 1; t <= 3; t++) {
        const trailSize: number = size * (1 - t * 0.2);
        const tx: number = proj.x + trailDir * t * 8;
        const ty: number = proj.y;
        ctx.globalAlpha = 0.3 / t;
        ctx.beginPath();
        ctx.arc(tx, ty, trailSize * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
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

  /** Pulsing green while poisoned, red flash on a hit (on top), both in the sprite's own shape. */
  private renderStatusTint(
    ctx: CanvasRenderingContext2D,
    playerId: string,
    animator: SpriteAnimator,
    drawX: number,
    drawY: number,
    spriteSize: number,
    flipX: boolean,
  ): void {
    const tint: PlayerTint | undefined = this.e.playerTints.get(playerId);
    if (!tint) return;
    if (tint.poisonTicks > 0) {
      const pulse: number = 0.45 + Math.sin(tint.poisonTicks * 0.15) * 0.15;
      const fade: number = Math.min(1, tint.poisonTicks / POISON_TINT_FADE_TICKS);
      animator.drawTint(ctx, drawX, drawY, spriteSize, spriteSize, flipX, POISON_TINT_COLOR, pulse * fade);
    }
    if (tint.hurtTicks > 0) {
      const alpha: number = 0.75 * (tint.hurtTicks / GAME_CONSTANTS.PLAYER_HURT_TINT_TICKS);
      animator.drawTint(ctx, drawX, drawY, spriteSize, spriteSize, flipX, HURT_TINT_COLOR, alpha);
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.e.particles) {
      this.renderParticle(ctx, p);
    }
    ctx.globalAlpha = 1;
  }

  private getParticleAlpha(p: Particle): number {
    const ratio: number = p.life / p.maxLife;
    const scale: number = p.alphaScale ?? 1;
    switch (p.fadeMode) {
      case FadeMode.Quick:
        return ratio * ratio * scale;
      case FadeMode.Late:
        return (ratio < 0.3 ? ratio / 0.3 : 1) * scale;
      default:
        return ratio * scale;
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
      if (drop.type === DropType.Special && drop.specialType) {
        this.renderSpecialDrop(ctx, drop.x, drop.y, drop.specialType, drop.lifetime);
        continue;
      }

      const size: number = GAME_CONSTANTS.DROP_SIZE;
      const cx: number = drop.x + size / 2;
      const cy: number = drop.y + size / 2;
      const pulse: number = 1 + Math.sin(drop.lifetime * 0.1) * 0.15;
      const r: number = (size / 2) * pulse;

      const normalColors: Record<string, { main: string; highlight: string; label: string }> = {
        [DropType.HpPotion]: { main: '#ff4488', highlight: '#ff88aa', label: 'HP' },
        [DropType.MpPotion]: { main: '#4488ff', highlight: '#88ccff', label: 'MP' },
        [DropType.Gold]: { main: '#ffcc44', highlight: '#ffee88', label: `${drop.value}G` },
      };
      const c: { main: string; highlight: string; label: string } | undefined = normalColors[drop.type];
      if (!c) continue;

      ctx.save();
      ctx.fillStyle = c.main;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = c.highlight;
      ctx.beginPath();
      ctx.arc(cx - r * 0.2, cy - r * 0.25, r * 0.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = pixelFont(10, 700);
      ctx.textAlign = 'center';
      fillOutlinedText(ctx, c.label, cx, cy + size + 6, CANVAS_BONE, CANVAS_INK, 2);
      ctx.restore();
    }
  }

  private renderSpecialDrop(
    ctx: CanvasRenderingContext2D, x: number, y: number, type: SpecialDropType, lifetime: number,
  ): void {
    const def: ReturnType<typeof getSpecialDropDefinition> = getSpecialDropDefinition(type);
    if (!def) return;

    const size: number = GAME_CONSTANTS.SPECIAL_DROP_SIZE;
    const cx: number = x + size / 2;
    const cy: number = y + size / 2;
    const pulse: number = 1 + Math.sin(lifetime * 0.15) * 0.25;
    const r: number = (size / 2) * pulse;
    const rotation: number = lifetime * 0.04;

    ctx.save();

    const outerGlow: CanvasGradient = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 1.8);
    outerGlow.addColorStop(0, def.color + 'cc');
    outerGlow.addColorStop(0.5, def.color + '44');
    outerGlow.addColorStop(1, def.color + '00');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2);
    ctx.fill();

    const points: number = 6;
    const outerR: number = r;
    const innerR: number = r * 0.5;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    for (let i: number = 0; i < points * 2; i++) {
      const angle: number = rotation + (i * Math.PI) / points;
      const radius: number = i % 2 === 0 ? outerR : innerR;
      const px: number = cx + Math.cos(angle) * radius;
      const py: number = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = def.highlightColor;
    ctx.beginPath();
    ctx.arc(cx - r * 0.15, cy - r * 0.2, r * 0.3, 0, Math.PI * 2);
    ctx.fill();

    const iconPx: number = Math.round(size * 0.6);
    drawPixelIcon(ctx, def.icon, cx - iconPx / 2, cy - iconPx / 2, iconPx);
    ctx.textAlign = 'center';

    ctx.font = pixelFont(10, 700);
    ctx.textBaseline = 'top';
    fillOutlinedText(ctx, def.name, cx, cy + size / 2 + 6, CANVAS_BONE, CANVAS_INK, 2);
    ctx.restore();
  }

  private renderDamageNumbers(ctx: CanvasRenderingContext2D): void {
    for (const d of this.e.damageNumbers) {
      const progress: number = d.life / GAME_CONSTANTS.DAMAGE_NUMBER_LIFE_TICKS;
      ctx.globalAlpha = Math.min(1, progress * 1.5);

      const baseSize: number = d.isCrit ? 28 : 20;
      const fontSize: number = snapFontSize(baseSize * d.scale);
      ctx.font = pixelFont(fontSize, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const text: string = `${d.value}`;

      ctx.save();
      if (d.isCrit) {
        ctx.shadowColor = d.color;
        ctx.shadowBlur = 12;
      }

      fillOutlinedText(ctx, text, d.x, d.y, d.color);

      if (d.isCrit) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha = Math.min(1, progress * 1.5) * 0.4;
        ctx.fillStyle = d.color;
        ctx.fillText(text, d.x, d.y);
      }

      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  private renderLevelUpNotification(ctx: CanvasRenderingContext2D): void {
    const n: LevelUpNotification | null = this.e.levelUpNotification;
    const p: CharacterState | null = this.e.player;
    if (!n || !p) return;

    const progress: number = 1 - n.life / n.maxLife;
    const fadeIn: number = Math.min(1, progress * 5);
    const fadeOut: number = n.life < 30 ? n.life / 30 : 1;
    const alpha: number = fadeIn * fadeOut;
    const floatOffset: number = progress * 40;

    const cx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const baseY: number = p.y - 28;
    const y: number = baseY - floatOffset;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const titleScale: number = progress < 0.1 ? 0.8 + progress * 2 : 1;
    const titleFontSize: number = snapFontSize(16 * titleScale);
    ctx.font = pixelFont(titleFontSize, 700);

    ctx.shadowColor = CANVAS_GOLD;
    ctx.shadowBlur = 12;
    fillOutlinedText(ctx, 'Level up!', cx, y, CANVAS_GOLD);

    ctx.shadowBlur = 0;
    ctx.font = pixelFont(12, 700);
    const subText: string = `Lv.${n.oldLevel} → Lv.${n.newLevel}`;
    fillOutlinedText(ctx, subText, cx, y + 16, CANVAS_BONE, CANVAS_INK, 2);

    ctx.restore();
  }

  private renderActiveSpecialEffects(ctx: CanvasRenderingContext2D): void {
    const effects: ActiveSpecialEffect[] = this.e.activeSpecialEffects;
    if (effects.length === 0) return;

    const barWidth: number = 140;
    const barHeight: number = 20;
    const padding: number = 4;
    const startX: number = GAME_CONSTANTS.CANVAS_WIDTH - barWidth - 10;
    // Under the HUD's score plate and stat chips in the top-right corner.
    let startY: number = 84;

    for (const eff of effects) {
      const def: ReturnType<typeof getSpecialDropDefinition> = getSpecialDropDefinition(eff.type);
      if (!def) continue;

      const progress: number = eff.remainingTicks / eff.totalTicks;
      const secondsLeft: number = Math.ceil(eff.remainingTicks / GAME_CONSTANTS.TICK_RATE);

      ctx.save();
      fillPixelPanel(ctx, startX, startY, barWidth, barHeight);

      // Time left: the buff's colour fills the panel's inside from the left.
      const inset: number = 2;
      ctx.fillStyle = def.color;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(
        startX + inset,
        startY + inset,
        Math.round((barWidth - inset * 2) * progress),
        barHeight - inset * 2,
      );

      ctx.globalAlpha = 1;
      ctx.font = pixelFont(12, 700);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const textY: number = startY + barHeight / 2;
      const buffIconPx: number = 12;
      drawPixelIcon(ctx, def.icon, startX + padding + 2, textY - buffIconPx / 2, buffIconPx);
      fillOutlinedText(ctx, def.name, startX + padding + 6 + buffIconPx, textY, CANVAS_BONE, CANVAS_INK, 2);

      ctx.textAlign = 'right';
      fillOutlinedText(ctx, `${secondsLeft}s`, startX + barWidth - padding - 2, textY, CANVAS_BONE, CANVAS_INK, 2);

      ctx.restore();
      startY += barHeight + 3;
    }
  }

  private renderPendingSpecialDropDialog(ctx: CanvasRenderingContext2D): void {
    const pending: PendingSpecialDropConfirm | null = this.e.pendingSpecialDropConfirm;
    if (!pending) return;

    const def: SpecialDropDefinition | undefined = getSpecialDropDefinition(pending.type);
    if (!def) return;

    const cw: number = GAME_CONSTANTS.CANVAS_WIDTH;
    const ch: number = GAME_CONSTANTS.CANVAS_HEIGHT;
    const boxW: number = 380;
    const boxH: number = 190;
    const boxX: number = (cw - boxW) / 2;
    const boxY: number = Math.min(56, ch - boxH);
    const timerProgress: number = pending.remainingTicks / pending.totalTicks;
    const secondsLeft: number = Math.ceil(pending.remainingTicks / GAME_CONSTANTS.TICK_RATE);
    const pulse: number = 0.9 + Math.sin(Date.now() / 200) * 0.1;

    ctx.save();

    // A toast near the top, not a modal: the fight stays visible and playable.
    ctx.globalAlpha = 0.95;
    fillPixelPanel(ctx, boxX, boxY, boxW, boxH);
    // The drop's colour as a stripe along the top, like the modals' header stripe.
    ctx.fillStyle = def.color;
    ctx.fillRect(boxX + 2, boxY + 2, boxW - 4, 4);

    ctx.globalAlpha = 1;
    const iconSize: number = 32;
    drawPixelIcon(ctx, def.icon, boxX + boxW / 2 - iconSize / 2, boxY + 34 - iconSize / 2, iconSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = pixelFont(20, 700);
    fillOutlinedText(ctx, def.name, boxX + boxW / 2, boxY + 62, def.color);

    ctx.fillStyle = CANVAS_BONE_DIM;
    ctx.font = pixelFont(12);
    const maxTextW: number = boxW - 40;
    const lines: string[] = this.wrapText(ctx, def.funnyDescription, maxTextW);
    let textY: number = boxY + 86;
    for (const line of lines) {
      ctx.fillText(line, boxX + boxW / 2, textY);
      textY += 16;
    }

    const barW: number = boxW - 60;
    const barH: number = 10;
    const barX: number = boxX + 30;
    const barY: number = boxY + boxH - 52;

    fillPixelBox(ctx, barX, barY, barW, barH, CANVAS_INK_2);
    ctx.fillStyle = timerProgress > 0.4 ? def.color : timerProgress > 0.2 ? '#ff8800' : '#ff2222';
    ctx.fillRect(barX + 2, barY + 2, Math.round((barW - 4) * timerProgress), barH - 4);

    ctx.font = pixelFont(12, 700);
    fillOutlinedText(ctx, `${secondsLeft}s`, boxX + boxW / 2, barY + barH + 12, CANVAS_BONE, CANVAS_INK, 2);

    ctx.font = pixelFont(14, 700);
    const promptY: number = boxY + boxH - 14;

    ctx.globalAlpha = pulse;
    fillOutlinedText(ctx, '[Y] Activate', boxX + boxW / 2 - 70, promptY, CANVAS_TOXIC_HI);
    fillOutlinedText(ctx, '[N] Nope', boxX + boxW / 2 + 70, promptY, CANVAS_BLOOD_HI);

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words: string[] = text.split(' ');
    const lines: string[] = [];
    let current: string = '';
    for (const word of words) {
      const test: string = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  private renderFloorInfo(ctx: CanvasRenderingContext2D): void {
    const total: number = GAME_CONSTANTS.FLOOR_TRANSITION_TICKS;
    const timer: number = this.e.floorTransitionTimer;
    if (timer <= 0) return;

    const progress: number = 1 - timer / total;

    ctx.save();

    const wipePhase: number = Math.min(1, progress * 3);
    if (wipePhase < 1) {
      const wipeY: number = GAME_CONSTANTS.CANVAS_HEIGHT * (1 - wipePhase);
      ctx.fillStyle = CANVAS_INK;
      ctx.globalAlpha = 0.85 * (1 - wipePhase);
      ctx.fillRect(0, wipeY, GAME_CONSTANTS.CANVAS_WIDTH, GAME_CONSTANTS.CANVAS_HEIGHT - wipeY);
    }

    const textFadeIn: number = Math.min(1, Math.max(0, (progress - 0.1) * 4));
    const textFadeOut: number = Math.min(1, Math.max(0, (1 - progress) * 3));
    const textAlpha: number = textFadeIn * textFadeOut;

    if (textAlpha > 0) {
      ctx.globalAlpha = textAlpha;
      const slideOffset: number = (1 - textFadeIn) * 60;
      const cy: number = GAME_CONSTANTS.CANVAS_HEIGHT / 2 + slideOffset;

      ctx.font = pixelFont(52, 700);
      ctx.textAlign = 'center';
      fillOutlinedText(ctx, `Floor ${this.e.floor}`, GAME_CONSTANTS.CANVAS_WIDTH / 2, cy, CANVAS_GOLD, CANVAS_INK, 6);

      ctx.font = pixelFont(20);
      const hint: string = this.e.springPuzzle
        ? SPRING_FLOOR_HINT
        : this.e.cagePuzzle
          ? CAGE_FLOOR_HINT
          : this.e.platePuzzle
            ? PLATE_FLOOR_HINT
            : floorHint(this.e.boulderPuzzle);
      fillOutlinedText(ctx, hint, GAME_CONSTANTS.CANVAS_WIDTH / 2, cy + 42, CANVAS_BONE);

      // A hard pixel rule under the hint: a gold line in an ink border.
      const lineWidth: number = 200;
      const lineY: number = cy + 64;
      fillPixelBox(ctx, GAME_CONSTANTS.CANVAS_WIDTH / 2 - lineWidth, lineY - 3, lineWidth * 2, 6, CANVAS_GOLD);
    }

    ctx.restore();
  }

  private renderExitPlatform(ctx: CanvasRenderingContext2D): void {
    const exit: { x: number; y: number; width: number; height: number } = this.e.exitPlatform;
    const t: number = performance.now() / 1000;
    const pulse: number = 0.6 + Math.sin(t * 2) * 0.2;

    ctx.save();

    if (this.e.mapRenderer.isLoaded()) {
      this.e.mapRenderer.drawDynamicPlatform(ctx, exit.x, exit.y, exit.width, exit.height);
    } else {
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(exit.x, exit.y, exit.width, exit.height);
      ctx.fillStyle = '#3a3a5a';
      ctx.fillRect(exit.x, exit.y, exit.width, 4);
      ctx.strokeStyle = '#1a1a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(exit.x, exit.y, exit.width, exit.height);
    }

    // On the puzzle floor this is the boulder's ledge: the way out is the wall it breaks.
    if (this.e.boulderPuzzle) {
      ctx.restore();
      return;
    }

    // On the plate floor a barred door stands on the exit: the sign goes over it.
    const plate: PlateState | null = this.e.plate;
    if (plate) this.renderExitDoor(ctx, doorBox(exit), plate);
    const signY: number = plate ? doorBox(exit).y : exit.y;

    // No hints about how to get up here: players work out that the dead pile up under it.
    ctx.fillStyle = CANVAS_BONE;
    ctx.font = pixelFont(14, 700);
    ctx.textAlign = 'center';
    ctx.globalAlpha = pulse;
    ctx.fillText('EXIT', exit.x + exit.width / 2, signY - 8);

    const arrowCount: number = 3;
    for (let i: number = 0; i < arrowCount; i++) {
      const arrowY: number = signY - 25 - i * 16 + Math.sin(t * 3 + i) * 4;
      const arrowAlpha: number = (1 - i / arrowCount) * pulse;
      ctx.globalAlpha = arrowAlpha;
      ctx.fillStyle = '#44ddff';
      ctx.beginPath();
      const cx: number = exit.x + exit.width / 2;
      ctx.moveTo(cx, arrowY);
      ctx.lineTo(cx - 8, arrowY + 10);
      ctx.lineTo(cx + 8, arrowY + 10);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * The floor-2 puzzle, per frame from the layout and the synced boulder (nothing here is
   * walkable): the chute from the ledge down to the wall (a covered trough, boulder only), the
   * boulder (it spins with the distance it rolled) until it shatters, the gate holding it (cracking
   * with each hit) until it breaks, and an EXIT sign at the opening once the wall is gone.
   */
  private renderBoulderPuzzle(ctx: CanvasRenderingContext2D): void {
    const puzzle: BoulderPuzzleLayout | null = this.e.boulderPuzzle;
    const boulder: BoulderState | null = this.e.boulder;
    if (!puzzle || !boulder) return;
    const ledgeY: number = this.e.exitPlatform.y;
    const path: BoulderPath = boulderPath(puzzle, ledgeY);
    const r: number = GAME_CONSTANTS.BOULDER_SIZE_PX / 2;
    this.renderChute(ctx, path, r);
    const box: Box | null = boulderBox(boulder, path);
    if (box) this.renderBoulder(ctx, box, (puzzle.wallDir * boulder.progress) / r);
    if (!gateBroken(boulder)) this.renderGate(ctx, gateBox(puzzle, ledgeY), boulder.gateHits);
    if (boulder.wallBroken) this.renderOpeningSign(ctx, puzzle);
  }

  /**
   * The floor-3 cable (not walkable), behind the exit: from the scale's post up to a pulley on the
   * ceiling, along it, and down to the spring's button, whose cap it holds (so it follows the
   * button up and down).
   */
  private renderSpringCable(ctx: CanvasRenderingContext2D): void {
    const puzzle: SpringPuzzleLayout | null = this.e.springPuzzle;
    const spring: SpringState | null = this.e.spring;
    if (!puzzle || !spring) return;
    drawCable(ctx, cablePath(puzzle, spring), 3);
  }

  /**
   * The floor-3 spring, per frame from the layout and the synced state: the spring (its plate
   * winds down in the 3-2-1 and shoots up on release), its button rising out of the ground on the
   * cable (pressed in during the count), the scale with its gauge and kg readout, and the big 3-2-1.
   */
  private renderSpringPuzzle(ctx: CanvasRenderingContext2D): void {
    const puzzle: SpringPuzzleLayout | null = this.e.springPuzzle;
    const spring: SpringState | null = this.e.spring;
    if (!puzzle || !spring) return;
    const block: Platform = puzzle.spring;
    const [left, right]: [number, number] = springSpan(puzzle);
    const cx: number = (left + right) / 2;
    const t: number = performance.now() / 1000;
    const ground: number = GAME_CONSTANTS.GROUND_Y;
    this.e.mapRenderer.drawSpring(ctx, block, plateOffset(spring));
    ctx.save();

    // The button: a red cap on a shaft, pulled up out of its housing in the ground by the cable.
    const button: Box = buttonBox(puzzle);
    const buttonX: number = button.x + button.width / 2;
    drawButton(ctx, button, buttonTopY(puzzle, spring), ground, isButtonUp(spring));

    // The scale: the pan set into the ground, its girder post and dial at the inner end.
    const pan: Box = scaleBox(puzzle);
    const loaded: boolean = isLoaded(spring);
    drawScalePan(ctx, pan, loaded);
    drawScalePost(ctx, scalePostX(puzzle), scalePostTopY(), ground, ground - 56, gaugeFraction(spring));

    ctx.font = pixelFont(14, 700);
    ctx.textAlign = 'center';
    const readout: string = loaded ? '#7dff7d' : '#ffd166';
    const needed: number = GAME_CONSTANTS.SPRING_SCALE_KG_NEEDED;
    const label: string = `${Math.round(spring.scaleKg)} / ${needed} kg`;
    fillOutlinedText(ctx, label, pan.x + pan.width / 2, ground + 28, readout);
    // A 2-frame blink, like the rest of the pixel UI.
    if (isButtonUp(spring) && !isBusy(spring) && Math.floor(t * 3) % 2 === 0) {
      fillOutlinedText(ctx, 'Hit!', buttonX, button.y - 16, '#7dff7d');
    }

    const seconds: number = countdownSeconds(spring);
    if (seconds > 0) {
      const frac: number = (spring.countdownTicks % GAME_CONSTANTS.TICK_RATE) / GAME_CONSTANTS.TICK_RATE;
      ctx.globalAlpha = 1;
      // Drawn at the 52px type size and scaled, so the beat pulse keeps one font size.
      const countdownPx: number = 52;
      const beatScale: number = (48 + Math.round(frac * 24)) / countdownPx;
      ctx.save();
      ctx.translate(cx, block.y - 120);
      ctx.scale(beatScale, beatScale);
      ctx.font = pixelFont(countdownPx, 700);
      fillOutlinedText(ctx, String(seconds), 0, 0, CANVAS_BONE, CANVAS_INK, 6);
      ctx.restore();
      ctx.font = pixelFont(16, 700);
      fillOutlinedText(ctx, 'Get on the spring!', cx, block.y - 86, '#aaeeff');
    }
    ctx.restore();
  }

  /** Trough floor under the boulder's path and a guard rail over it, from the ledge to the wall. */
  private renderChute(ctx: CanvasRenderingContext2D, path: BoulderPath, r: number): void {
    const x1: number = path.end.x + Math.sign(path.end.x - path.edge.x) * r;
    drawChute(ctx, path.edge.x, path.edge.y + r, x1, path.end.y + r, 2 * r + 6);
  }

  /** The small wooden wall holding the boulder; one more crack per hit. */
  private renderGate(ctx: CanvasRenderingContext2D, gate: Box, hits: number): void {
    drawGate(ctx, gate, hits);
  }

  private renderBoulder(ctx: CanvasRenderingContext2D, box: Box, angle: number): void {
    drawBoulder(ctx, box, angle);
  }

  private renderOpeningSign(ctx: CanvasRenderingContext2D, puzzle: BoulderPuzzleLayout): void {
    const wall: Platform = puzzle.wall;
    const signX: number = wall.x + wall.width / 2;
    const signY: number = GAME_CONSTANTS.GROUND_Y - 70;
    ctx.save();
    ctx.font = pixelFont(14, 700);
    ctx.textAlign = 'center';
    fillOutlinedText(ctx, 'Exit', signX, signY, CANVAS_BONE);
    drawExitArrows(ctx, signX, signY + 8, puzzle.wallDir, performance.now());
    ctx.restore();
  }

  /**
   * A lantern and a "SAFE" sign over the floor's safe spot, so players know where they can rest.
   * Drawn from the layout every frame (not part of the geometry layer: nothing here is walkable).
   */
  /**
   * The floor-4 chains (not walkable): each runs from its cleat straight up into the ceiling band,
   * winds through its kinks, tangled with the others, and comes down to its cage. All alike, so
   * nobody can follow one. A snapped chain is gone, leaving a torn end on its cleat.
   */
  private renderCageChains(ctx: CanvasRenderingContext2D): void {
    const puzzle: CagePuzzleLayout | null = this.e.cagePuzzle;
    const cages: CagePuzzleState | null = this.e.cages;
    if (!puzzle || !cages) return;
    cages.cages.forEach((cage: CageState, i: number): void => {
      const path: Point[] = chainPath(puzzle, i, this.e.exitPlatform);
      if (isCut(cage)) {
        drawChain(ctx, [path[0], { x: path[0].x + 4, y: path[0].y - 14 }]);
        return;
      }
      drawChain(ctx, path);
    });
  }


  /**
   * The floor-4 cages where their state puts them (hanging and falling under their tarps, the
   * exit cage standing bare on the ground; any other is gone once it smashed), and the cleats
   * cracking per hit.
   */
  private renderCages(ctx: CanvasRenderingContext2D): void {
    const puzzle: CagePuzzleLayout | null = this.e.cagePuzzle;
    const cages: CagePuzzleState | null = this.e.cages;
    if (!puzzle || !cages) return;
    ctx.save();
    cages.cages.forEach((cage: CageState, i: number): void => {
      const box: Box | null = cageBox(puzzle, i, cage, this.e.exitPlatform);
      if (box) {
        this.e.mapRenderer.drawCage(ctx, box, !cage.landed);
        if (!isCut(cage)) drawCageRing(ctx, box.x + box.width / 2, box.y);
      }
      this.renderCleat(ctx, cleatBox(puzzle, i), cage);
    });
    ctx.restore();
  }

  /**
   * The floor-5 exit door (scenery, nothing to stand on): a dark doorway in a stone frame whose
   * bars slide up into the lintel as it opens. Fully open, the doorway glows.
   */
  private renderExitDoor(ctx: CanvasRenderingContext2D, door: Box, plate: PlateState): void {
    drawExitDoorArt(ctx, door, plate.doorTicks / GAME_CONSTANTS.PLATE_DOOR_TICKS);
  }

  /**
   * The floor-5 pressure plate, set into the top of its ledge (inside its collision box), pressed
   * down and green while it holds the door open. Lamps over it count the weight on it.
   */
  private renderPlate(ctx: CanvasRenderingContext2D): void {
    const puzzle: PlatePuzzleLayout | null = this.e.platePuzzle;
    const plate: PlateState | null = this.e.plate;
    if (!puzzle || !plate) return;
    drawPlateArt(ctx, plateBox(puzzle), isHeld(plate), plate.weight, GAME_CONSTANTS.PLATE_WEIGHT_NEEDED);
  }

  /** An iron cleat; cracks show the hits it took, a snapped one is broken off at the top. */
  private renderCleat(ctx: CanvasRenderingContext2D, cleat: Box, cage: CageState): void {
    const hits: number = Math.min(cage.cleatHits, GAME_CONSTANTS.CAGE_CLEAT_HITS - 1);
    drawCleatArt(ctx, cleat, hits, isCut(cage));
  }

  private renderSafeSpotMarker(ctx: CanvasRenderingContext2D): void {
    const spot: Platform | undefined = this.e.platforms.find((p: Platform): boolean => p.safe === true);
    if (!spot) return;
    const t: number = performance.now() / 1000;
    const flicker: number = 0.75 + Math.sin(t * 7) * 0.08 + Math.sin(t * 13) * 0.05;
    const cx: number = spot.x + spot.width / 2;
    const lanternX: number = spot.x + 18;
    const lanternY: number = spot.y - 26;

    ctx.save();
    const glow: CanvasGradient = ctx.createRadialGradient(lanternX, lanternY, 2, lanternX, lanternY, 70);
    glow.addColorStop(0, `rgba(255, 200, 110, ${0.45 * flicker})`);
    glow.addColorStop(1, 'rgba(255, 200, 110, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(lanternX - 70, lanternY - 70, 140, 140);

    // Post and lantern.
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(lanternX - 1, lanternY + 6, 3, spot.y - lanternY - 6);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(lanternX - 6, lanternY - 6, 12, 14);
    ctx.fillStyle = `rgba(255, 210, 120, ${flicker})`;
    ctx.fillRect(lanternX - 4, lanternY - 4, 8, 10);

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#9dffb0';
    ctx.font = pixelFont(14, 700);
    ctx.textAlign = 'center';
    ctx.fillText('SAFE', cx, spot.y - 40);
    ctx.restore();
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

      ctx.font = pixelFont(14, 700);
      const toastIconPx: number = 16;
      const labelWidth: number = ctx.measureText(n.label).width;
      // Wide enough for the icon and label, never narrower than the old fixed toast.
      const textWidth: number = Math.max(140, Math.ceil(labelWidth) + toastIconPx + 8);
      const boxX: number = baseX - textWidth - padding * 2;
      const boxY: number = y - rowHeight / 2;
      ctx.globalAlpha = alpha * 0.9;
      fillPixelPanel(ctx, boxX, boxY + 1, textWidth + padding * 2, rowHeight - 2);

      ctx.globalAlpha = alpha;
      fillOutlinedText(ctx, n.label, baseX - padding, y, n.color);
      drawPixelIcon(ctx, n.icon, baseX - padding - labelWidth - toastIconPx - 4, y - toastIconPx / 2, toastIconPx);
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
    ctx.font = pixelFont(10);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(text, x, y);
  }

  updatePlayerAnimState(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;

    if (p.isDead || p.isDown) {
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
      if (this.e.doubleJumpAnimTicks > 0) {
        this.e.spriteAnimator.setState(PlayerAnimState.DoubleJump);
      } else {
        this.e.spriteAnimator.setState(PlayerAnimState.Jump);
      }
      return;
    }

    if (Math.abs(p.velocityX) > GAME_CONSTANTS.PLAYER_MIN_VELOCITY) {
      this.e.spriteAnimator.setState(PlayerAnimState.Run);
      return;
    }

    this.e.spriteAnimator.setState(PlayerAnimState.Idle);
  }
}
