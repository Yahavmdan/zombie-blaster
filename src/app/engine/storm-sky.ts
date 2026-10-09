import { GAME_CONSTANTS } from '@shared/index';
import { Random, seededRandom } from './level-generator';
import {
  BoltPath,
  LightningStrike,
  lightningBolt,
  lightningBoltAlpha,
  lightningFlash,
  lightningLandingY,
} from './storm';

const W: number = GAME_CONSTANTS.CANVAS_WIDTH;
const H: number = GAME_CONSTANTS.CANVAS_HEIGHT;

/** Night sky, top to the blood-red glow on the horizon behind the refinery. */
const SKY_STOPS: [number, string][] = [
  [0, '#06030b'],
  [0.3, '#140a1f'],
  [0.55, '#2e0f22'],
  [0.75, '#5c1520'],
  [1, '#24070d'],
];
/** The background art's cloud bank, tinted to storm clouds; its lace gaps show the sky through. */
const CLOUD_COLOR: string = '#2b2234';
/** The same clouds lit from inside by a strike. */
const LIT_CLOUD_COLOR: string = '#b4acdf';
/** The moon glows through the clouds drifting over it. */
const CLOUD_ALPHA: number = 0.86;
/** Refinery silhouettes, far to near: each nearer one darker. */
const SKYLINE_COLORS: string[] = ['#2a1730', '#190f22', '#0b0710'];
/** Red haze rising between the silhouette rows. */
const HAZE_COLOR: string = '120, 28, 40';
const SKY_FLASH_COLOR: string = '196, 186, 255';
const BOLT_GLOW_COLOR: string = '170, 150, 255';
const BOLT_CORE_COLOR: string = '#f6f2ff';
const RAIN_COLOR: string = '160, 170, 215';
const FOG_COLOR: string = '150, 135, 170';
const BEACON_COLOR: string = '#ff3b30';
const BEACON_DIM_COLOR: string = '#5a1410';

/** The moon hangs behind the cloud bank, left of centre. */
const MOON_X: number = Math.round(W * 0.3);
const MOON_Y: number = 150;
const MOON_RADIUS: number = 52;
/** The moon is drawn in blocks this size, like the rest of the pixel art. */
const MOON_PIXEL: number = 4;
const FOG_HEIGHT: number = 190;
const FOG_Y: number = GAME_CONSTANTS.GROUND_Y - FOG_HEIGHT + 30;
const FOG_SEED: number = 0x5f0c;
const RAIN_SEED: number = 0x7a11;
const BEACON_COUNT: number = 4;
const BEACON_MIN_GAP_PX: number = 140;
const BEACON_BLINK_MS: number = 1400;

/**
 * The stormy backdrop: a night sky with a blood moon behind the background art's clouds (drifting),
 * refinery silhouettes with blinking beacons, ground fog and rain, all lit up by the
 * current lightning strike. Pure scenery: nothing here can be stood on.
 */
export class StormSky {
  private readonly sky: HTMLCanvasElement;
  private readonly moon: HTMLCanvasElement;
  /** Cloud strips are two screens wide (the art, then its mirror) so they wrap seamlessly. */
  private readonly clouds: HTMLCanvasElement;
  private readonly litClouds: HTMLCanvasElement;
  /** The farthest silhouette row: bolts land between it and the nearer rows. */
  private readonly skylineFar: HTMLCanvasElement;
  private readonly skylineNear: HTMLCanvasElement;
  /** Per screen column, the highest silhouette pixel: where a bolt at that x hits the refinery. */
  private readonly skylineTops: number[];
  private readonly fog: HTMLCanvasElement;
  private readonly beacons: { x: number; y: number; phase: number }[];
  private readonly rain: { x: number; y: number; speed: number }[];
  private bolt: { strike: LightningStrike; paths: BoltPath[] } | null = null;

  constructor(cloudLayer: HTMLImageElement, skylineLayers: HTMLImageElement[]) {
    this.sky = this.paintSky();
    this.moon = this.paintMoon();
    this.clouds = this.mirrorStrip(this.tint(cloudLayer, CLOUD_COLOR));
    this.litClouds = this.mirrorStrip(this.tint(cloudLayer, LIT_CLOUD_COLOR));
    const tinted: HTMLCanvasElement[] = skylineLayers.map(
      (img: HTMLImageElement, i: number): HTMLCanvasElement =>
        this.tint(img, SKYLINE_COLORS[Math.min(i, SKYLINE_COLORS.length - 1)]),
    );
    this.skylineFar = this.paintSkyline(tinted.slice(0, 1), 0);
    this.skylineNear = this.paintSkyline(tinted.slice(1), 1);
    this.skylineTops = this.columnTops([this.skylineFar, this.skylineNear]);
    this.beacons = tinted.length > 1 ? this.findBeacons(tinted[1]) : [];
    this.fog = this.paintFog();
    const rand: Random = seededRandom(RAIN_SEED);
    this.rain = Array.from(
      { length: GAME_CONSTANTS.STORM_RAIN_DROP_COUNT },
      (): { x: number; y: number; speed: number } => ({
        x: rand() * W,
        y: rand() * H,
        speed: 0.7 + rand() * 0.6,
      }),
    );
  }

  /** Everything behind the level geometry: sky, clouds, silhouettes with the bolt between, fog. */
  drawBack(ctx: CanvasRenderingContext2D, nowMs: number, lightning: LightningStrike | null): void {
    const seconds: number = nowMs / 1000;
    const flash: number = lightning ? lightningFlash(lightning.ageMs) : 0;

    ctx.drawImage(this.sky, 0, 0);
    if (flash > 0) {
      ctx.fillStyle = `rgba(${SKY_FLASH_COLOR}, ${flash * 0.55})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.drawImage(this.moon, 0, 0);
    const scroll: number = seconds * GAME_CONSTANTS.STORM_CLOUD_SPEED_PX_S;
    this.drawStrip(ctx, this.clouds, scroll, 0, CLOUD_ALPHA);
    if (flash > 0) this.drawStrip(ctx, this.litClouds, scroll, 0, flash * 0.85);

    ctx.drawImage(this.skylineFar, 0, 0);
    ctx.drawImage(this.skylineNear, 0, 0);
    this.drawBeacons(ctx, nowMs);
    // The bolt strikes the refinery: in front of the silhouettes, behind the fog and the level.
    if (lightning) this.drawBolt(ctx, lightning);
    // Fog drifts the other way to the clouds.
    this.drawStrip(ctx, this.fog, -seconds * GAME_CONSTANTS.STORM_FOG_SPEED_PX_S, FOG_Y, 1);
  }

  /** Rain over the level geometry (characters are drawn over it). */
  drawRain(ctx: CanvasRenderingContext2D, nowMs: number, lightning: LightningStrike | null): void {
    const flash: number = lightning ? lightningFlash(lightning.ageMs) : 0;
    const fallen: number = (nowMs / 1000) * GAME_CONSTANTS.STORM_RAIN_FALL_PX_S;
    const length: number = GAME_CONSTANTS.STORM_RAIN_LENGTH_PX;
    const slant: number = GAME_CONSTANTS.STORM_RAIN_SLANT;
    const span: number = H + length;
    ctx.strokeStyle = `rgba(${RAIN_COLOR}, ${0.28 + flash * 0.45})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const drop of this.rain) {
      const travel: number = fallen * drop.speed;
      const y: number = ((drop.y + travel) % span) - length;
      const x: number = (((drop.x + travel * slant) % W) + W) % W;
      ctx.moveTo(x, y);
      ctx.lineTo(x - length * slant, y - length);
    }
    ctx.stroke();
  }

  private drawStrip(
    ctx: CanvasRenderingContext2D,
    strip: HTMLCanvasElement,
    scroll: number,
    y: number,
    alpha: number,
  ): void {
    const period: number = strip.width;
    const offset: number = Math.floor(((scroll % period) + period) % period);
    ctx.globalAlpha = alpha;
    ctx.drawImage(strip, -offset, y);
    ctx.drawImage(strip, period - offset, y);
    ctx.globalAlpha = 1;
  }

  private drawBolt(ctx: CanvasRenderingContext2D, lightning: LightningStrike): void {
    const alpha: number = lightningBoltAlpha(lightning.ageMs);
    if (alpha <= 0) return;
    if (!this.bolt || this.bolt.strike !== lightning) {
      const column: number = Math.max(0, Math.min(W - 1, Math.round(lightning.x)));
      const bottom: number = lightningLandingY(this.skylineTops[column]);
      this.bolt = { strike: lightning, paths: lightningBolt(lightning.x, lightning.seed, bottom) };
    }
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'square';
    for (const path of this.bolt.paths) {
      this.strokePath(ctx, path, path.width + 4, `rgba(${BOLT_GLOW_COLOR}, ${alpha * 0.45})`);
    }
    for (const path of this.bolt.paths) {
      ctx.globalAlpha = alpha;
      this.strokePath(ctx, path, path.width, BOLT_CORE_COLOR);
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'butt';
    // A hard white spark where it hits.
    const main: BoltPath = this.bolt.paths[0];
    const hit: { x: number; y: number } = main.points[main.points.length - 1];
    ctx.fillStyle = `rgba(${BOLT_GLOW_COLOR}, ${alpha * 0.5})`;
    ctx.fillRect(hit.x - 10, hit.y - 6, 20, 12);
    ctx.fillStyle = BOLT_CORE_COLOR;
    ctx.globalAlpha = alpha;
    ctx.fillRect(hit.x - 4, hit.y - 3, 8, 6);
    ctx.globalAlpha = 1;
  }

  private strokePath(
    ctx: CanvasRenderingContext2D,
    path: BoltPath,
    width: number,
    color: string,
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i: number = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    ctx.stroke();
  }

  private drawBeacons(ctx: CanvasRenderingContext2D, nowMs: number): void {
    for (const b of this.beacons) {
      const on: boolean = (nowMs + b.phase) % BEACON_BLINK_MS < BEACON_BLINK_MS * 0.35;
      ctx.fillStyle = on ? BEACON_COLOR : BEACON_DIM_COLOR;
      ctx.fillRect(b.x - 2, b.y - 4, 4, 4);
      if (on) {
        ctx.fillStyle = 'rgba(255, 59, 48, 0.25)';
        ctx.fillRect(b.x - 5, b.y - 7, 10, 10);
      }
    }
  }

  private createCanvas(width: number, height: number): CanvasRenderingContext2D {
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  private paintSky(): HTMLCanvasElement {
    const ctx: CanvasRenderingContext2D = this.createCanvas(W, H);
    const gradient: CanvasGradient = ctx.createLinearGradient(0, 0, 0, H);
    for (const [stop, color] of SKY_STOPS) gradient.addColorStop(stop, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // Faint stars in the clear band above the clouds' gaps.
    const rand: Random = seededRandom(0x51a7);
    for (let i: number = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(255, 235, 230, ${0.15 + rand() * 0.35})`;
      ctx.fillRect(Math.floor(rand() * W), Math.floor(rand() * H * 0.45), 2, 2);
    }
    return ctx.canvas;
  }

  /** A blocky blood moon with hard-edged halo rings (no blur, like the rest of the pixel art). */
  private paintMoon(): HTMLCanvasElement {
    const ctx: CanvasRenderingContext2D = this.createCanvas(W, H);
    ctx.fillStyle = 'rgba(200, 60, 50, 0.10)';
    this.fillBlockCircle(ctx, MOON_X, MOON_Y, MOON_RADIUS + 28);
    ctx.fillStyle = 'rgba(200, 60, 50, 0.12)';
    this.fillBlockCircle(ctx, MOON_X, MOON_Y, MOON_RADIUS + 12);
    ctx.fillStyle = '#b8382f';
    this.fillBlockCircle(ctx, MOON_X, MOON_Y, MOON_RADIUS);
    ctx.fillStyle = '#d65a44';
    this.fillBlockCircle(ctx, MOON_X - 10, MOON_Y - 10, MOON_RADIUS - 14);
    ctx.fillStyle = '#9a2b26';
    this.fillBlockCircle(ctx, MOON_X + 16, MOON_Y + 6, 10);
    this.fillBlockCircle(ctx, MOON_X - 18, MOON_Y + 20, 7);
    this.fillBlockCircle(ctx, MOON_X + 4, MOON_Y - 24, 5);
    return ctx.canvas;
  }

  /** A circle of `block`-sized pixels on the block grid, one row span at a time. */
  private fillBlockCircle(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    block: number = MOON_PIXEL,
  ): void {
    for (let y: number = -r; y <= r; y += block) {
      const half: number = Math.sqrt(r * r - y * y);
      const left: number = Math.floor((cx - half) / block) * block;
      const right: number = Math.ceil((cx + half) / block) * block;
      ctx.fillRect(left, Math.floor((cy + y) / block) * block, right - left, block);
    }
  }

  /** The image stretched to the screen in one flat colour, keeping its shape. */
  private tint(img: HTMLImageElement, color: string): HTMLCanvasElement {
    const ctx: CanvasRenderingContext2D = this.createCanvas(W, H);
    ctx.drawImage(img, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    return ctx.canvas;
  }

  /** Two screens: the tile, then its mirror, so a drifting strip never shows a seam. */
  private mirrorStrip(tile: HTMLCanvasElement): HTMLCanvasElement {
    const ctx: CanvasRenderingContext2D = this.createCanvas(W * 2, tile.height);
    ctx.drawImage(tile, 0, 0);
    ctx.save();
    ctx.translate(W * 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(tile, 0, 0);
    ctx.restore();
    return ctx.canvas;
  }

  /** Silhouette rows with red haze rising in front of each (row `depth` onward), so each reads further away. */
  private paintSkyline(layers: HTMLCanvasElement[], depth: number): HTMLCanvasElement {
    const ctx: CanvasRenderingContext2D = this.createCanvas(W, H);
    layers.forEach((layer: HTMLCanvasElement, i: number): void => {
      ctx.drawImage(layer, 0, 0);
      const row: number = depth + i;
      if (row >= SKYLINE_COLORS.length - 1) return;
      const haze: CanvasGradient = ctx.createLinearGradient(0, H * 0.45, 0, H);
      haze.addColorStop(0, `rgba(${HAZE_COLOR}, 0)`);
      haze.addColorStop(1, `rgba(${HAZE_COLOR}, ${0.35 - row * 0.1})`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H);
    });
    return ctx.canvas;
  }

  /** Per column, the first opaque row over all `layers` (the screen height where a column is empty). */
  private columnTops(layers: HTMLCanvasElement[]): number[] {
    const tops: number[] = new Array<number>(W).fill(H);
    for (const layer of layers) {
      const data: Uint8ClampedArray = layer.getContext('2d')!.getImageData(0, 0, W, H).data;
      for (let x: number = 0; x < W; x++) {
        for (let y: number = 0; y < tops[x]; y++) {
          if (data[(y * W + x) * 4 + 3] > 0) {
            tops[x] = y;
            break;
          }
        }
      }
    }
    return tops;
  }

  /** Warning lights on the highest stacks of a silhouette row (its tallest, well-spaced columns). */
  private findBeacons(layer: HTMLCanvasElement): { x: number; y: number; phase: number }[] {
    const ctx: CanvasRenderingContext2D = layer.getContext('2d')!;
    const data: Uint8ClampedArray = ctx.getImageData(0, 0, W, H).data;
    const tops: { x: number; y: number }[] = [];
    for (let x: number = 4; x < W - 4; x += 2) {
      for (let y: number = 0; y < H; y++) {
        if (data[(y * W + x) * 4 + 3] > 0) {
          tops.push({ x, y });
          break;
        }
      }
    }
    tops.sort((a: { x: number; y: number }, b: { x: number; y: number }): number => a.y - b.y);
    const picked: { x: number; y: number; phase: number }[] = [];
    for (const t of tops) {
      if (picked.length >= BEACON_COUNT) break;
      if (picked.some((p: { x: number }): boolean => Math.abs(p.x - t.x) < BEACON_MIN_GAP_PX))
        continue;
      picked.push({ ...t, phase: picked.length * 370 });
    }
    return picked;
  }

  private paintFog(): HTMLCanvasElement {
    const tile: CanvasRenderingContext2D = this.createCanvas(W, FOG_HEIGHT);
    const rand: Random = seededRandom(FOG_SEED);
    const block: number = 4;
    for (let i: number = 0; i < 90; i++) {
      const cx: number = rand() * W;
      const cy: number = FOG_HEIGHT * (0.35 + rand() * 0.55);
      const rx: number = 60 + rand() * 140;
      const ry: number = 12 + rand() * 26;
      tile.fillStyle = `rgba(${FOG_COLOR}, ${0.03 + rand() * 0.05})`;
      for (let y: number = -ry; y <= ry; y += block) {
        const half: number = rx * Math.sqrt(1 - (y * y) / (ry * ry));
        const left: number = Math.floor((cx - half) / block) * block;
        tile.fillRect(
          left,
          Math.floor((cy + y) / block) * block,
          Math.ceil((half * 2) / block) * block,
          block,
        );
      }
    }
    return this.mirrorStrip(tile.canvas);
  }
}
