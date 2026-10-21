/**
 * Spitter bile drawn in code on the 2 px art grid (pixel-art.ts): the glob in flight and the
 * acid puddle a splat leaves. Hard ink outline, light top-left, no smoothing or gradients.
 */
import { GAME_CONSTANTS } from '@shared/game-constants';
import { AcidPuddle } from './engine-types';
import { ART_PX, PIXEL, pxDisc, pxRect } from './pixel-art';

/** Bile tones, light to dark (also the colours of its drops, splashes and bubbles). */
export const BILE_COLORS: readonly string[] = [
  PIXEL['bileHi'],
  PIXEL['toxicHi'],
  PIXEL['toxic'],
  PIXEL['toxicDark'],
];

/** Ticks per wobble frame of a glob in flight (2 frames: round, squashed). */
const GLOB_WOBBLE_TICKS: number = 4;
/** Ticks per bubble cycle in a puddle (rise, pop, rest). */
const PUDDLE_BUBBLE_CYCLE: number = 40;
/** Share of a puddle's life at the end where it dries up and shrinks. */
const PUDDLE_DRY_SHARE: number = 0.3;

function snap(v: number): number {
  return Math.round(v / ART_PX) * ART_PX;
}

/**
 * A glob of bile flying along its velocity: a round head and a tapering tail behind it that
 * stretches with speed, wobbling between 2 frames.
 */
export function drawSpitGlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
  age: number,
): void {
  const speed: number = Math.hypot(vx, vy) || 1;
  const ux: number = vx / speed;
  const uy: number = vy / speed;
  const stretch: number = Math.min(1.6, 0.6 + speed / 6);
  const squash: boolean = Math.floor(age / GLOB_WOBBLE_TICKS) % 2 === 1;
  const blobs: { x: number; y: number; r: number }[] = [
    { x: snap(x), y: snap(y), r: squash ? 5 : 6 },
    { x: snap(x - ux * 4 * stretch), y: snap(y - uy * 4 * stretch), r: 4 },
    { x: snap(x - ux * 7 * stretch), y: snap(y - uy * 7 * stretch), r: 3 },
    { x: snap(x - ux * 10 * stretch), y: snap(y - uy * 10 * stretch), r: 2 },
  ];
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const b of blobs) pxDisc(ctx, b.x, b.y, b.r + ART_PX, PIXEL['ink']);
  for (const b of blobs) pxDisc(ctx, b.x, b.y, b.r, PIXEL['toxicDark']);
  for (const b of blobs) {
    if (b.r > ART_PX) pxDisc(ctx, b.x - ART_PX, b.y - ART_PX, b.r - ART_PX, PIXEL['toxic']);
  }
  const head: { x: number; y: number; r: number } = blobs[0];
  pxRect(ctx, head.x - ART_PX * 2, head.y - ART_PX * 2, ART_PX * 2, ART_PX, PIXEL['bileHi']);
  pxRect(ctx, head.x - ART_PX * 2, head.y - ART_PX, ART_PX, ART_PX, PIXEL['toxicHi']);
  // a bubble of air caught in the tail
  pxRect(ctx, blobs[1].x, blobs[1].y - ART_PX, ART_PX, ART_PX, PIXEL['toxicHi']);
  ctx.restore();
}

/**
 * A puddle of acid on a surface (its top at `p.y`): a thin wet layer with a shine, eating a dark
 * stain into the surface, bubbles rising and popping; it dries up and shrinks at the end.
 */
export function drawAcidPuddle(ctx: CanvasRenderingContext2D, p: AcidPuddle): void {
  const life: number = 1 - p.age / GAME_CONSTANTS.SPIT_PUDDLE_TICKS;
  if (life <= 0) return;
  const drying: boolean = life < PUDDLE_DRY_SHARE;
  // shrinks in whole 4 px steps while it dries
  const share: number = drying ? life / PUDDLE_DRY_SHARE : 1;
  const w: number = Math.max(ART_PX * 2, Math.round((p.width * share) / (ART_PX * 2)) * ART_PX * 2);
  const left: number = snap(p.x - w / 2);
  const y: number = snap(p.y);
  const seed: number = Math.abs(Math.round(p.x));

  ctx.save();
  // the stain in the surface
  pxRect(ctx, left + ART_PX, y, w - ART_PX * 2, ART_PX, PIXEL['bileDeep']);
  if (!drying) {
    // wet layer: a dark rim row, the body row, a shine on top
    pxRect(ctx, left, y - ART_PX, w, ART_PX, PIXEL['toxicDark']);
    pxRect(ctx, left + ART_PX * 2, y - ART_PX * 2, w - ART_PX * 4, ART_PX, PIXEL['toxic']);
    pxRect(ctx, left - ART_PX, y - ART_PX, ART_PX, ART_PX, PIXEL['ink']);
    pxRect(ctx, left + w, y - ART_PX, ART_PX, ART_PX, PIXEL['ink']);
    const shineX: number = left + ART_PX * (2 + (seed % 3));
    pxRect(ctx, shineX, y - ART_PX * 2, ART_PX * 2, ART_PX, PIXEL['bileHi']);
    drawPuddleBubble(ctx, p, left, w, y, seed);
  } else {
    pxRect(ctx, left, y - ART_PX, w, ART_PX, PIXEL['bileDeep']);
  }
  ctx.restore();
}

/** A bubble swelling out of the puddle, then popping into 2 specks. */
function drawPuddleBubble(
  ctx: CanvasRenderingContext2D,
  p: AcidPuddle,
  left: number,
  w: number,
  y: number,
  seed: number,
): void {
  const phase: number = (p.age + seed) % PUDDLE_BUBBLE_CYCLE;
  const bx: number =
    left +
    snap(
      ((seed * 7 + Math.floor((p.age + seed) / PUDDLE_BUBBLE_CYCLE) * 11) %
        Math.max(ART_PX, w - ART_PX * 4)) +
        ART_PX * 2,
    );
  const top: number = y - ART_PX * 2;
  if (phase < 10) {
    pxRect(ctx, bx, top - ART_PX, ART_PX, ART_PX, PIXEL['toxicHi']);
  } else if (phase < 18) {
    pxRect(ctx, bx - ART_PX, top - ART_PX * 2, ART_PX * 3, ART_PX, PIXEL['ink']);
    pxRect(ctx, bx - ART_PX, top - ART_PX, ART_PX * 3, ART_PX, PIXEL['toxic']);
    pxRect(ctx, bx, top - ART_PX * 2, ART_PX, ART_PX, PIXEL['bileHi']);
  } else if (phase < 22) {
    pxRect(ctx, bx - ART_PX * 2, top - ART_PX * 3, ART_PX, ART_PX, PIXEL['toxicHi']);
    pxRect(ctx, bx + ART_PX * 2, top - ART_PX * 3, ART_PX, ART_PX, PIXEL['toxicHi']);
  }
}
