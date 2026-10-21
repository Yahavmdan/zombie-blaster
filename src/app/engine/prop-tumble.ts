import { GAME_CONSTANTS } from '@shared/index';
import { LooseProp } from '@shared/game-entities';

/**
 * Loose prop tumbling (pure, so the host system and the tests share the math). A prop turns
 * around its box's center (`LooseProp.angle`, clockwise): it spins in the air, a barrel rolls on
 * landing (round, so it stays on the surface) while a box or rail slides and turns back upright,
 * and one whose middle hangs over an edge tips off it around that edge. At rest it is upright,
 * so its art is exactly its box.
 */

/** Where a prop can land or rest (a platform, another prop, a lying corpse). */
export interface TumbleSurface {
  x: number;
  width: number;
  y: number;
  /** How far below the surface the prop's bottom may have been a tick ago and still land on it. */
  tolerance: number;
}

/** Tipping off an edge: it turns around `pivot`, the edge it rests on. */
export interface Tip {
  pivotX: number;
  pivotY: number;
  /** The side it falls to: 1 right, -1 left. */
  dir: number;
  /** The pivot in the prop's own turned frame, from its center (it slides along its bottom). */
  localX: number;
  localY: number;
}

export interface Span {
  left: number;
  right: number;
}

/** A lying prop is solid and stood on only once it rests: on something, upright, not moving. */
export function isResting(p: LooseProp): boolean {
  return p.isGrounded && p.carrierId === null && p.angle === 0 && p.velocityX === 0;
}

/** An angle in (-PI, PI]. */
export function wrapAngle(a: number): number {
  const turned: number = a % (Math.PI * 2);
  if (turned > Math.PI) return turned - Math.PI * 2;
  if (turned <= -Math.PI) return turned + Math.PI * 2;
  return turned;
}

/** How far the turned prop reaches below its center. A barrel is round: always half its height. */
export function turnedHalfHeight(p: LooseProp, round: boolean): number {
  if (round) return p.height / 2;
  return (p.width / 2) * Math.abs(Math.sin(p.angle)) + (p.height / 2) * Math.abs(Math.cos(p.angle));
}

/** How far the turned prop reaches to each side of its center. */
export function turnedHalfWidth(p: LooseProp, round: boolean): number {
  if (round) return p.width / 2;
  return (p.width / 2) * Math.abs(Math.cos(p.angle)) + (p.height / 2) * Math.abs(Math.sin(p.angle));
}

export function centerX(p: LooseProp): number {
  return p.x + p.width / 2;
}

export function centerY(p: LooseProp): number {
  return p.y + p.height / 2;
}

/** The lowest point of the turned prop. */
export function bottomOf(p: LooseProp, round: boolean): number {
  return centerY(p) + turnedHalfHeight(p, round);
}

/** Puts the turned prop's lowest point on `surfaceY`, its center where it is sideways. */
export function restOn(p: LooseProp, surfaceY: number, round: boolean): void {
  p.y = surfaceY - turnedHalfHeight(p, round) - p.height / 2;
}

/** What holds the prop up at `y`: the span of the surfaces there under its turned width, or null. */
export function supportSpan(
  p: LooseProp,
  surfaces: TumbleSurface[],
  y: number,
  round: boolean,
): Span | null {
  const half: number = turnedHalfWidth(p, round);
  const left: number = centerX(p) - half;
  const right: number = centerX(p) + half;
  let span: Span | null = null;
  for (const s of surfaces) {
    if (Math.abs(s.y - y) > GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE) continue;
    if (right <= s.x || left >= s.x + s.width) continue;
    const l: number = Math.max(left, s.x);
    const r: number = Math.min(right, s.x + s.width);
    span = span
      ? { left: Math.min(span.left, l), right: Math.max(span.right, r) }
      : { left: l, right: r };
  }
  return span;
}

/** The side (1 right, -1 left) a prop whose center is off its support tips to, or 0 when it is balanced. */
export function tipSide(p: LooseProp, span: Span): number {
  const cx: number = centerX(p);
  if (cx > span.right) return 1;
  if (cx < span.left) return -1;
  return 0;
}

/** Starts tipping the prop off the edge of `span` on side `dir`, resting at `y`. */
export function startTip(p: LooseProp, span: Span, dir: number, y: number): Tip {
  const pivotX: number = dir > 0 ? span.right : span.left;
  // The pivot in the prop's frame: turn (pivot - center) back by the prop's angle.
  const dx: number = pivotX - centerX(p);
  const dy: number = y - centerY(p);
  const cos: number = Math.cos(-p.angle);
  const sin: number = Math.sin(-p.angle);
  p.velocityX = 0;
  p.velocityY = 0;
  p.isGrounded = false;
  return { pivotX, pivotY: y, dir, localX: dx * cos - dy * sin, localY: dx * sin + dy * cos };
}

/**
 * One tick of tipping: it turns faster and faster around the edge and slides off along its
 * bottom. Returns true once it falls off (tipped far enough, or slid off the edge): it then flies
 * on with the speed its center had and falls like any thrown prop.
 */
export function tickTip(p: LooseProp, tip: Tip): boolean {
  p.spin += tip.dir * GAME_CONSTANTS.PROP_TIP_ACCEL;
  p.angle += p.spin;
  tip.localX -= tip.dir * GAME_CONSTANTS.PROP_TIP_SLIDE;
  const cos: number = Math.cos(p.angle);
  const sin: number = Math.sin(p.angle);
  const cx: number = tip.pivotX - (tip.localX * cos - tip.localY * sin);
  const cy: number = tip.pivotY - (tip.localX * sin + tip.localY * cos);
  p.x = cx - p.width / 2;
  p.y = cy - p.height / 2;
  const slidOff: boolean = Math.abs(tip.localX) >= p.width / 2;
  if (!slidOff && Math.abs(p.angle) < GAME_CONSTANTS.PROP_TIP_RELEASE_ANGLE) return false;
  // Its center swings around the pivot at (-dy, dx) times the turning speed. Swung below the
  // edge that points back under it; it slides off along its bottom instead, so it leaves outward.
  p.velocityX = tip.dir * Math.abs(p.spin * (cy - tip.pivotY));
  p.velocityY = Math.abs(p.spin * (cx - tip.pivotX));
  return true;
}

/** A prop lying on its side turns back upright, its lowest point kept on the surface. */
export function settleUpright(p: LooseProp, round: boolean): void {
  const surfaceY: number = bottomOf(p, round);
  const a: number = wrapAngle(p.angle);
  const step: number = Math.min(Math.abs(a), GAME_CONSTANTS.PROP_SETTLE_SPIN);
  p.angle = a - Math.sign(a) * step;
  if (Math.abs(p.angle) < 1e-3) p.angle = 0;
  p.spin = 0;
  restOn(p, surfaceY, round);
}

/** Turns the canvas by the prop's tilt around its box's center (drawing only). */
export function turnAroundCenter(ctx: CanvasRenderingContext2D, p: LooseProp): void {
  const cx: number = centerX(p);
  const cy: number = centerY(p);
  ctx.translate(cx, cy);
  ctx.rotate(p.angle);
  ctx.translate(-cx, -cy);
}
