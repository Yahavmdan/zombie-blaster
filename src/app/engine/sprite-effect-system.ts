export interface SpriteEffectConfig {
  src: string;
  frameSize: number;
  columns: number;
  totalFrames: number;
  ticksPerFrame: number;
  scale: number;
  offsetY: number;
}

export interface ActiveSpriteEffect {
  configId: string;
  image: HTMLImageElement;
  x: number;
  y: number;
  currentFrame: number;
  tickCounter: number;
  flipX: boolean;
  done: boolean;
  totalFrames: number;
  columns: number;
  frameSize: number;
  ticksPerFrame: number;
  scale: number;
  offsetY: number;
}

export const EFFECT_CONFIGS: Record<string, SpriteEffectConfig> = {
  'magicspell':       { src: 'effects/1_magicspell_spritesheet.png',       frameSize: 100, columns: 9,  totalFrames: 75,  ticksPerFrame: 1, scale: 3.0, offsetY: 0 },
  'magic8':           { src: 'effects/2_magic8_spritesheet.png',           frameSize: 100, columns: 8,  totalFrames: 61,  ticksPerFrame: 1, scale: 2.8, offsetY: 0 },
  'bluefire':         { src: 'effects/3_bluefire_spritesheet.png',         frameSize: 100, columns: 8,  totalFrames: 61,  ticksPerFrame: 1, scale: 2.8, offsetY: 0 },
  'casting':          { src: 'effects/4_casting_spritesheet.png',          frameSize: 100, columns: 9,  totalFrames: 73,  ticksPerFrame: 1, scale: 2.4, offsetY: 0 },
  'magickahit':       { src: 'effects/5_magickahit_spritesheet.png',       frameSize: 100, columns: 7,  totalFrames: 45,  ticksPerFrame: 1, scale: 2.8, offsetY: 0 },
  'flamelash':        { src: 'effects/6_flamelash_spritesheet.png',        frameSize: 100, columns: 7,  totalFrames: 45,  ticksPerFrame: 1, scale: 3.2, offsetY: 0 },
  'firespin':         { src: 'effects/7_firespin_spritesheet.png',         frameSize: 100, columns: 8,  totalFrames: 61,  ticksPerFrame: 1, scale: 3.0, offsetY: 0 },
  'protectioncircle': { src: 'effects/8_protectioncircle_spritesheet.png', frameSize: 100, columns: 8,  totalFrames: 61,  ticksPerFrame: 1, scale: 2.8, offsetY: 0 },
  'brightfire':       { src: 'effects/9_brightfire_spritesheet.png',       frameSize: 100, columns: 8,  totalFrames: 61,  ticksPerFrame: 1, scale: 2.8, offsetY: 0 },
  'weaponhit':        { src: 'effects/10_weaponhit_spritesheet.png',       frameSize: 100, columns: 6,  totalFrames: 36,  ticksPerFrame: 1, scale: 2.4, offsetY: 0 },
  'fire':             { src: 'effects/11_fire_spritesheet.png',            frameSize: 100, columns: 8,  totalFrames: 60,  ticksPerFrame: 1, scale: 3.2, offsetY: 0 },
  'nebula':           { src: 'effects/12_nebula_spritesheet.png',          frameSize: 100, columns: 8,  totalFrames: 61,  ticksPerFrame: 1, scale: 3.5, offsetY: 0 },
  'vortex':           { src: 'effects/13_vortex_spritesheet.png',          frameSize: 100, columns: 8,  totalFrames: 61,  ticksPerFrame: 1, scale: 3.0, offsetY: 0 },
  'phantom':          { src: 'effects/14_phantom_spritesheet.png',         frameSize: 100, columns: 8,  totalFrames: 61,  ticksPerFrame: 1, scale: 2.8, offsetY: 0 },
  'sunburn':          { src: 'effects/16_sunburn_spritesheet.png',         frameSize: 100, columns: 8,  totalFrames: 61,  ticksPerFrame: 1, scale: 3.5, offsetY: 0 },
  'felspell':         { src: 'effects/17_felspell_spritesheet.png',        frameSize: 100, columns: 10, totalFrames: 91,  ticksPerFrame: 1, scale: 3.5, offsetY: 0 },
  'midnight':         { src: 'effects/18_midnight_spritesheet.png',        frameSize: 100, columns: 8,  totalFrames: 60,  ticksPerFrame: 1, scale: 2.8, offsetY: 0 },
  'freezing':         { src: 'effects/19_freezing_spritesheet.png',        frameSize: 100, columns: 10, totalFrames: 96,  ticksPerFrame: 1, scale: 3.5, offsetY: 0 },
  'magicbubbles':     { src: 'effects/20_magicbubbles_spritesheet.png',    frameSize: 100, columns: 8,  totalFrames: 61,  ticksPerFrame: 1, scale: 2.8, offsetY: -20 },
};

export class SpriteEffectSystem {
  private images: Map<string, HTMLImageElement> = new Map();
  private activeEffects: ActiveSpriteEffect[] = [];
  private loaded: boolean = false;
  private loadCount: number = 0;
  private readonly totalCount: number = Object.keys(EFFECT_CONFIGS).length;

  load(): void {
    const entries: [string, SpriteEffectConfig][] = Object.entries(EFFECT_CONFIGS);
    for (const [id, config] of entries) {
      const img: HTMLImageElement = new Image();
      img.src = config.src;
      img.onload = (): void => {
        this.images.set(id, img);
        this.loadCount++;
        if (this.loadCount >= this.totalCount) {
          this.loaded = true;
        }
      };
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  spawn(configId: string, x: number, y: number, flipX: boolean): void {
    const config: SpriteEffectConfig | undefined = EFFECT_CONFIGS[configId];
    const image: HTMLImageElement | undefined = this.images.get(configId);
    if (!config || !image) return;

    this.activeEffects.push({
      configId,
      image,
      x,
      y: y + config.offsetY,
      currentFrame: 0,
      tickCounter: 0,
      flipX,
      done: false,
      totalFrames: config.totalFrames,
      columns: config.columns,
      frameSize: config.frameSize,
      ticksPerFrame: config.ticksPerFrame,
      scale: config.scale,
      offsetY: config.offsetY,
    });
  }

  tick(): void {
    for (const effect of this.activeEffects) {
      effect.tickCounter++;
      if (effect.tickCounter >= effect.ticksPerFrame) {
        effect.tickCounter = 0;
        effect.currentFrame++;
        if (effect.currentFrame >= effect.totalFrames) {
          effect.done = true;
        }
      }
    }
    this.activeEffects = this.activeEffects.filter((e: ActiveSpriteEffect) => !e.done);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    for (const effect of this.activeEffects) {
      const col: number = effect.currentFrame % effect.columns;
      const row: number = Math.floor(effect.currentFrame / effect.columns);
      const srcX: number = col * effect.frameSize;
      const srcY: number = row * effect.frameSize;
      const renderSize: number = effect.frameSize * effect.scale;
      const drawX: number = effect.x - renderSize / 2;
      const drawY: number = effect.y - renderSize / 2;

      const progress: number = effect.currentFrame / effect.totalFrames;
      const alpha: number = progress > 0.8 ? (1 - progress) / 0.2 : 1;
      ctx.globalAlpha = Math.max(0, alpha);

      if (effect.flipX) {
        ctx.save();
        ctx.translate(drawX + renderSize, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(
          effect.image,
          srcX, srcY, effect.frameSize, effect.frameSize,
          0, 0, renderSize, renderSize,
        );
        ctx.restore();
      } else {
        ctx.drawImage(
          effect.image,
          srcX, srcY, effect.frameSize, effect.frameSize,
          drawX, drawY, renderSize, renderSize,
        );
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  getActiveCount(): number {
    return this.activeEffects.length;
  }
}
