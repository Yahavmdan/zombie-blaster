/**
 * Pixel-art drawing for world objects drawn in code (puzzle parts): a 2-screen-pixel art grid,
 * the pixel icon palette (tools/pixel-icons/drafts.mjs), hard ink outlines, stepped lines and
 * char-grid sprites. No smoothing, no gradients, no anti-aliased strokes.
 */

/** One art pixel is this many screen pixels (the pixel icons and the HUD use the same scale). */
export const ART_PX: number = 2;

/** The pixel icon palette (tools/pixel-icons/drafts.mjs COLORS), plus a few world materials. */
export const PIXEL: Readonly<Record<string, string>> = {
  ink: '#0e0d0b',
  ink2: '#1b1916',
  white: '#fff8e8',
  bone: '#e8dcc2',
  boneDim: '#a89c84',
  boneFaint: '#6f6656',
  bloodHi: '#e0503f',
  blood: '#b8322a',
  bloodDark: '#6e1c17',
  rustHi: '#e8964a',
  rust: '#c9762c',
  rustDark: '#7a4318',
  glow: '#fff3b0',
  goldHi: '#ffe08a',
  gold: '#f2c14e',
  goldDark: '#b07f22',
  toxicHi: '#b5e05a',
  toxic: '#8fbf3a',
  toxicDark: '#557a22',
  steelLight: '#a9bac6',
  steelHi: '#6f8190',
  steel: '#4f5d68',
  steelDark: '#2e363d',
  tealHi: '#8fe8d8',
  teal: '#3fb3a0',
  tealDark: '#1f6e62',
  woodHi: '#b07a44',
  wood: '#8a5a2e',
  woodDark: '#5e3d20',
  /** Weathered stone (the boulder, the door frame). */
  stoneHi: '#a7a2a0',
  stone: '#7d7876',
  stoneMid: '#5f5a5a',
  stoneDark: '#433f41',
  stoneDeep: '#2c292c',
  /** Oiled canvas tarp. */
  tarpHi: '#857553',
  tarp: '#62563d',
  tarpDark: '#433a2a',
};

/** A filled rectangle on whole screen pixels. */
export function pxRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A raised steel-like bar: ink outline, a light top row, the body, a dark bottom row. */
export function pxBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  light: string,
  body: string,
  dark: string,
): void {
  pxRect(ctx, x, y, w, h, PIXEL['ink']);
  pxRect(ctx, x + ART_PX, y + ART_PX, w - 2 * ART_PX, h - 2 * ART_PX, body);
  pxRect(ctx, x + ART_PX, y + ART_PX, w - 2 * ART_PX, ART_PX, light);
  if (h > 4 * ART_PX) pxRect(ctx, x + ART_PX, y + h - 2 * ART_PX, w - 2 * ART_PX, ART_PX, dark);
}

/** A rivet: one light art pixel over one dark one. */
export function pxRivet(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  pxRect(ctx, x, y, ART_PX, ART_PX, PIXEL['steelLight']);
  pxRect(ctx, x, y + ART_PX, ART_PX, ART_PX, PIXEL['steelDark']);
}

/** A stepped line of `size` blocks from (x0, y0) to (x1, y1) (no anti-aliasing). */
export function pxLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  size: number = ART_PX,
): void {
  const steps: number = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / ART_PX),
  );
  ctx.fillStyle = color;
  for (let i: number = 0; i <= steps; i++) {
    const t: number = i / steps;
    const x: number = Math.round((x0 + (x1 - x0) * t) / ART_PX) * ART_PX;
    const y: number = Math.round((y0 + (y1 - y0) * t) / ART_PX) * ART_PX;
    ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size);
  }
}

/** A filled circle of art pixels (row spans on the art grid around the centre). */
export function pxDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  for (let y: number = -r; y < r; y += ART_PX) {
    const mid: number = y + ART_PX / 2;
    const half: number = Math.floor(Math.sqrt(Math.max(0, r * r - mid * mid)) / ART_PX) * ART_PX;
    if (half > 0) ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, ART_PX);
  }
}

/** A char-grid sprite: one char per art pixel, '.' transparent, others palette keys. */
export interface PixelSprite {
  readonly rows: readonly string[];
  readonly palette: Readonly<Record<string, string>>;
}

const spriteCache: Map<PixelSprite, HTMLCanvasElement> = new Map<PixelSprite, HTMLCanvasElement>();

/** Rows with an ink ('k') outline added around every filled cell, into the empty cells next to it. */
export function outlined(rows: readonly string[]): string[] {
  const h: number = rows.length;
  const w: number = rows[0].length;
  const filled: (x: number, y: number) => boolean = (x: number, y: number): boolean =>
    y >= 0 && y < h && x >= 0 && x < w && rows[y][x] !== '.' && rows[y][x] !== 'k';
  return rows.map((row: string, y: number): string =>
    row
      .split('')
      .map((ch: string, x: number): string =>
        ch === '.' && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))
          ? 'k'
          : ch,
      )
      .join(''),
  );
}

/** The sprite rasterised once at one canvas pixel per cell. */
export function spriteCanvas(sprite: PixelSprite): HTMLCanvasElement {
  const cached: HTMLCanvasElement | undefined = spriteCache.get(sprite);
  if (cached) return cached;
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = sprite.rows[0].length;
  canvas.height = sprite.rows.length;
  const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
  if (ctx) {
    sprite.rows.forEach((row: string, y: number): void => {
      for (let x: number = 0; x < row.length; x++) {
        const color: string | undefined = sprite.palette[row[x]];
        if (row[x] !== '.' && color) {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });
  }
  spriteCache.set(sprite, canvas);
  return canvas;
}

/** Draws a sprite with its top-left at (x, y), each cell `scale` screen pixels, optionally mirrored. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: PixelSprite,
  x: number,
  y: number,
  scale: number = ART_PX,
  flipX: boolean = false,
): void {
  const canvas: HTMLCanvasElement = spriteCanvas(sprite);
  const w: number = canvas.width * scale;
  const h: number = canvas.height * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flipX) {
    ctx.translate(Math.round(x) + w, Math.round(y));
    ctx.scale(-1, 1);
    ctx.drawImage(canvas, 0, 0, w, h);
  } else {
    ctx.drawImage(canvas, Math.round(x), Math.round(y), w, h);
  }
  ctx.restore();
}
