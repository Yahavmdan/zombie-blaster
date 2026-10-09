/**
 * Pixel-UI text and panel helpers for the canvas. The canvas can't read CSS variables, so the few
 * UI colours it needs are copied here from `src/styles/tokens.css` (keep them in step).
 */

/** `--ink`: outlines and panel borders. */
export const CANVAS_INK: string = '#0e0d0b';
/** `--ink-2`: empty bar tracks. */
export const CANVAS_INK_2: string = '#1b1916';
/** `--panel`: window fill. */
export const CANVAS_PANEL: string = '#2a2622';
/** `--edge-light`: the 1px top/left bevel of a panel. */
export const CANVAS_EDGE_LIGHT: string = '#6e6152';
/** `--bone`: body text. */
export const CANVAS_BONE: string = '#e8dcc2';
/** `--bone-dim`: secondary text. */
export const CANVAS_BONE_DIM: string = '#a89c84';
/** `--gold`: titles and highlights. */
export const CANVAS_GOLD: string = '#f2c14e';
/** `--blood-hi`: warnings. */
export const CANVAS_BLOOD_HI: string = '#e0503f';
/** `--toxic-hi`: good / go. */
export const CANVAS_TOXIC_HI: string = '#b5e05a';

export type CanvasFontWeight = 400 | 500 | 700;

export const CANVAS_FONT_FAMILY: string = "'Pixelify Sans', monospace";

/** The canvas type scale: every canvas font size is one of these. */
const CANVAS_FONT_SIZES: readonly number[] = [10, 12, 14, 16, 20, 28, 40, 52];

/** Every weight the canvas draws with (all three are bundled by `styles.css`). */
const CANVAS_FONT_WEIGHTS: readonly CanvasFontWeight[] = [400, 500, 700];

/** Border width of square canvas boxes and panels. */
const CANVAS_BORDER_PX: number = 2;

/**
 * Starts loading every canvas weight of the pixel font. Faces load on first use, and canvas text
 * drawn before then falls back to another font, so the engine asks for them up front.
 */
export function preloadCanvasFonts(): void {
  if (typeof document === 'undefined' || !document.fonts) return;
  for (const weight of CANVAS_FONT_WEIGHTS) {
    document.fonts.load(pixelFont(16, weight)).catch((): void => undefined);
  }
}

export function pixelFont(sizePx: number, weight: CanvasFontWeight = 500): string {
  return `${weight} ${sizePx}px ${CANVAS_FONT_FAMILY}`;
}

/** The type-scale size closest to `sizePx` (for sizes computed from an animation). */
export function snapFontSize(sizePx: number): number {
  return CANVAS_FONT_SIZES.reduce(
    (best: number, size: number): number =>
      Math.abs(size - sizePx) < Math.abs(best - sizePx) ? size : best,
    CANVAS_FONT_SIZES[0],
  );
}

export function fillOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  outline: string = CANVAS_INK,
  outlineWidth: number = 3,
): void {
  // Saved so the outline's stroke settings never leak into what is drawn next.
  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2;
  ctx.lineWidth = outlineWidth;
  ctx.strokeStyle = outline;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A square box: `fill` inside a 2px ink border drawn inside the box. */
export function fillPixelBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
): void {
  ctx.fillStyle = CANVAS_INK;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(
    x + CANVAS_BORDER_PX,
    y + CANVAS_BORDER_PX,
    w - CANVAS_BORDER_PX * 2,
    h - CANVAS_BORDER_PX * 2,
  );
}

/** A pixel window: panel fill, ink border and a 1px light bevel along the top and left. */
export function fillPixelPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  fillPixelBox(ctx, x, y, w, h, CANVAS_PANEL);
  const inner: number = CANVAS_BORDER_PX;
  ctx.fillStyle = CANVAS_EDGE_LIGHT;
  ctx.fillRect(x + inner, y + inner, w - inner * 2, 1);
  ctx.fillRect(x + inner, y + inner, 1, h - inner * 2);
}
