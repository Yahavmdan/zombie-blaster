import { GAME_CONSTANTS } from '@shared/index';
import { Platform, Rope } from '../engine/engine-types';
import { GameEngine } from '../engine/game-engine';
import { Prop } from '../engine/level-generator';
import { E2eGeometryCheck, E2eGeometryReport } from './e2e-api';

/** Pixels at or above this alpha count as drawn art. */
const OPAQUE_ALPHA: number = 32;

interface Measured {
  object: string;
  kind: E2eGeometryCheck['kind'];
  /** The collision box (what physics uses). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Draws this object's art, exactly as the map renderer does when it composes the frame. */
  draw: (ctx: CanvasRenderingContext2D) => void;
}

type Alpha = (x: number, y: number) => boolean;

/**
 * Measures the level art against the collision data the physics uses. Dev/e2e only.
 *
 * Each object (ground, platform, exit, ladder, prop) is drawn alone on a blank layer with the
 * renderer's own draw call, and its art edges are measured there and compared with its collision
 * box. Each object's art must also be present in the real geometry layer (plus the exit, drawn per
 * frame), and that layer may hold no art outside the objects' boxes.
 */
export function measureLevelGeometry(engine: GameEngine): E2eGeometryReport {
  const layer: HTMLCanvasElement | null = engine.mapRenderer.getGeometryLayer();
  if (!layer) return { ready: false, checks: [], strayPixels: 0, strayExample: null };

  const w: number = GAME_CONSTANTS.CANVAS_WIDTH;
  const h: number = GAME_CONSTANTS.CANVAS_HEIGHT;
  const tile: number = GAME_CONSTANTS.LEVEL_TILE_PX;
  const groundY: number = GAME_CONSTANTS.GROUND_Y;
  const renderer: GameEngine['mapRenderer'] = engine.mapRenderer;
  const exit: Platform = engine.exitPlatform;
  // The floor-2 puzzle wall (while it stands) is measured like a prop.
  const wall: Platform | null = engine.puzzleWall();
  const ladderWidth: number = renderer.getLadderArtWidth();

  const frame: CanvasRenderingContext2D = blankLayer(w, h);
  frame.drawImage(layer, 0, 0);
  renderer.drawDynamicPlatform(frame, exit.x, exit.y, exit.width, exit.height);
  const inFrame: Alpha = alphaOf(frame, w, h);

  const objects: Measured[] = [
    {
      object: 'ground',
      kind: 'ground',
      x: 0,
      y: groundY,
      width: w,
      height: h - groundY,
      draw: (ctx: CanvasRenderingContext2D): void => renderer.drawGroundTiles(ctx),
    },
    {
      object: `exit ${exit.x},${exit.y}`,
      kind: 'exit',
      x: exit.x,
      y: exit.y,
      width: exit.width,
      height: tile,
      draw: (ctx: CanvasRenderingContext2D): void =>
        renderer.drawDynamicPlatform(ctx, exit.x, exit.y, exit.width, exit.height),
    },
    // The puzzle wall, like a prop: art in every column of its collision box.
    ...(wall
      ? [
          {
            object: `wall ${wall.x},${wall.y} ${wall.width}x${wall.height}`,
            kind: 'prop' as const,
            x: wall.x,
            y: wall.y,
            width: wall.width,
            height: wall.height,
            draw: (ctx: CanvasRenderingContext2D): void => renderer.drawPuzzleWall(ctx, wall),
          },
        ]
      : []),
    ...engine.platforms
      .filter((p: Platform): boolean => p.y !== groundY && !p.solid)
      .map(
        (p: Platform): Measured => ({
          object: `platform ${p.x},${p.y} w${p.width}`,
          kind: 'platform',
          x: p.x,
          y: p.y,
          width: p.width,
          height: tile,
          draw: (ctx: CanvasRenderingContext2D): void => renderer.drawPlatformSurface(ctx, p),
        }),
      ),
    // Props: the collision box (stand on it, bump into it) must be exactly the drawn art.
    ...engine.platforms
      .filter((p: Platform): boolean => p.solid === true && p.puzzlePart === undefined)
      .map((p: Platform): Measured => {
        const prop: Prop | undefined = engine.level.props.find(
          (q: Prop): boolean => q.x === p.x && q.y === p.y,
        );
        return {
          object: `prop ${prop?.kind ?? '?'} ${p.x},${p.y} ${p.width}x${p.height}`,
          kind: 'prop',
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          draw: (ctx: CanvasRenderingContext2D): void => {
            if (prop) renderer.drawProp(ctx, prop);
          },
        };
      }),
    // A ladder's art must be centered on the line you climb (the rope's x).
    ...engine.ropes.map(
      (r: Rope): Measured => ({
        object: `rope ${r.x} ${r.topY}-${r.bottomY}`,
        kind: 'rope',
        x: r.x - ladderWidth / 2,
        y: r.topY,
        width: ladderWidth,
        height: r.bottomY - r.topY,
        draw: (ctx: CanvasRenderingContext2D): void => renderer.drawLadder(ctx, r),
      }),
    ),
  ];

  const checks: E2eGeometryCheck[] = objects.map(
    (o: Measured): E2eGeometryCheck => measureObject(o, inFrame, w, h),
  );

  let strayPixels: number = 0;
  let strayExample: string | null = null;
  for (let y: number = 0; y < h; y++) {
    for (let x: number = 0; x < w; x++) {
      if (!inFrame(x, y)) continue;
      if (objects.some((o: Measured): boolean => inBox(o, x, y, 1))) continue;
      strayPixels++;
      strayExample ??= `${x},${y}`;
    }
  }
  return { ready: true, checks, strayPixels, strayExample };
}

function measureObject(o: Measured, inFrame: Alpha, w: number, h: number): E2eGeometryCheck {
  const ctx: CanvasRenderingContext2D = blankLayer(w, h);
  o.draw(ctx);
  const own: Alpha = alphaOf(ctx, w, h);
  let minX: number = w;
  let maxX: number = -1;
  let minY: number = h;
  let maxY: number = -1;
  let ownPixels: number = 0;
  let shown: number = 0;
  for (let y: number = 0; y < h; y++) {
    for (let x: number = 0; x < w; x++) {
      if (!own(x, y)) continue;
      ownPixels++;
      if (inFrame(x, y)) shown++;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const left: number = Math.max(0, Math.round(o.x));
  const right: number = Math.min(w - 1, Math.round(o.x + o.width) - 1);
  const top: number = Math.round(o.y);
  const bottom: number = Math.min(h - 1, Math.round(o.y + o.height) - 1);
  let covered: number = 0;
  let total: number = 0;
  if (o.kind === 'rope') {
    // Rows: the ladder runs the whole way.
    for (let y: number = top; y <= bottom; y++, total++) {
      for (let x: number = left; x <= right; x++) {
        if (own(x, y)) {
          covered++;
          break;
        }
      }
    }
  } else {
    // Columns: art across the whole width, starting at the top edge you stand on.
    for (let x: number = left; x <= right; x++, total++) {
      // Platforms: a flat top edge; props: art somewhere in every column of their box.
      const lastRow: number = o.kind === 'prop' ? bottom : Math.min(bottom, top + 3);
      for (let y: number = top; y <= lastRow; y++) {
        if (own(x, y)) {
          covered++;
          break;
        }
      }
    }
  }
  const drawn: boolean = ownPixels > 0;
  return {
    object: o.object,
    kind: o.kind,
    expectedTop: top,
    drawnTop: drawn ? minY : null,
    expectedLeft: left,
    expectedRight: right,
    drawnLeft: drawn ? minX : null,
    drawnRight: drawn ? maxX : null,
    expectedBottom: o.kind === 'rope' ? bottom : null,
    drawnBottom: o.kind === 'rope' && drawn ? maxY : null,
    coverage: total > 0 ? covered / total : 0,
    presentInFrame: ownPixels > 0 ? shown / ownPixels : 0,
  };
}

function blankLayer(w: number, h: number): CanvasRenderingContext2D {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx: CanvasRenderingContext2D = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function alphaOf(ctx: CanvasRenderingContext2D, w: number, h: number): Alpha {
  const data: Uint8ClampedArray = ctx.getImageData(0, 0, w, h).data;
  return (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] >= OPAQUE_ALPHA;
}

function inBox(o: Measured, x: number, y: number, pad: number): boolean {
  return x >= o.x - pad && x < o.x + o.width + pad && y >= o.y - pad && y < o.y + o.height + pad;
}
