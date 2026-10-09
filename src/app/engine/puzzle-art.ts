import { Box, Point } from './boulder-puzzle';
import {
  ART_PX,
  PIXEL,
  PixelSprite,
  drawSprite,
  outlined,
  pxBar,
  pxDisc,
  pxLine,
  pxRect,
  pxRivet,
} from './pixel-art';
import { Random, seededRandom } from './level-generator';

/**
 * Pixel art for the puzzle parts (boulder, chute, gate, spring, button, scale, cable, chains,
 * cages, cleats, plate, door), drawn on the 2-pixel art grid with the pixel icon palette and ink
 * outlines. Drawing only: every function takes the box its caller already uses, so art still
 * covers exactly what the physics collides with.
 */

const K: string = PIXEL['ink'];

// ─── Boulder ─────────────────────────────────────────────

/** The boulder is drawn on a grid this many art pixels across (48 px at 2 px per cell). */
const BOULDER_CELLS: number = 24;
/** Rotations rendered per turn; the boulder snaps to the nearest (crisp pixels at every angle). */
const BOULDER_FRAMES: number = 32;
const boulderFrames: Map<number, HTMLCanvasElement> = new Map<number, HTMLCanvasElement>();
/** Surface marks per cell (fixed to the stone, so they turn as it rolls): 1 crack, 2 pit, 3 fleck. */
let boulderMarks: number[] | null = null;

function boulderTexture(): number[] {
  if (boulderMarks) return boulderMarks;
  const n: number = BOULDER_CELLS;
  const marks: number[] = new Array<number>(n * n).fill(0);
  const rand: Random = seededRandom(0xb01d);
  for (let i: number = 0; i < 30; i++) {
    marks[Math.floor(rand() * n) * n + Math.floor(rand() * n)] = rand() < 0.5 ? 2 : 3;
  }
  // Two cracks running across the face.
  const cracks: [number, number][][] = [
    [
      [5, 9],
      [7, 10],
      [9, 10],
      [10, 12],
      [12, 13],
      [13, 15],
      [15, 16],
    ],
    [
      [14, 4],
      [13, 6],
      [14, 8],
      [13, 9],
    ],
    [
      [10, 12],
      [9, 14],
      [9, 16],
      [8, 18],
    ],
  ];
  for (const crack of cracks) {
    for (let i: number = 0; i < crack.length - 1; i++) {
      const x0: number = crack[i][0];
      const y0: number = crack[i][1];
      const x1: number = crack[i + 1][0];
      const y1: number = crack[i + 1][1];
      const steps: number = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s: number = 0; s <= steps; s++) {
        const x: number = Math.round(x0 + ((x1 - x0) * s) / steps);
        const y: number = Math.round(y0 + ((y1 - y0) * s) / steps);
        marks[y * n + x] = 1;
      }
    }
  }
  boulderMarks = marks;
  return marks;
}

/** One rotation of the boulder: the light stays top-left while the marks turn with the stone. */
function boulderFrame(frame: number): HTMLCanvasElement {
  const cached: HTMLCanvasElement | undefined = boulderFrames.get(frame);
  if (cached) return cached;
  const n: number = BOULDER_CELLS;
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!;
  const marks: number[] = boulderTexture();
  const angle: number = (frame / BOULDER_FRAMES) * Math.PI * 2;
  const cos: number = Math.cos(-angle);
  const sin: number = Math.sin(-angle);
  const c: number = (n - 1) / 2;
  const shades: string[] = [
    PIXEL['stoneDeep'],
    PIXEL['stoneDark'],
    PIXEL['stoneMid'],
    PIXEL['stone'],
    PIXEL['stoneHi'],
  ];
  for (let y: number = 0; y < n; y++) {
    for (let x: number = 0; x < n; x++) {
      const dx: number = x - c;
      const dy: number = y - c;
      const d: number = Math.hypot(dx, dy);
      if (d > n / 2) continue;
      if (d > n / 2 - 1.1) {
        ctx.fillStyle = K;
        ctx.fillRect(x, y, 1, 1);
        continue;
      }
      // Light from the top-left; the rim darkens toward the bottom-right.
      const light: number = (-dx * 0.6 - dy * 0.8) / (n / 2);
      let shade: number = light > 0.45 ? 4 : light > 0.05 ? 3 : light > -0.4 ? 2 : 1;
      if (d > n / 2 - 2.5 && light < 0) shade = Math.max(0, shade - 1);
      const sx: number = Math.round(c + dx * cos - dy * sin);
      const sy: number = Math.round(c + dx * sin + dy * cos);
      const mark: number = sx >= 0 && sy >= 0 && sx < n && sy < n ? marks[sy * n + sx] : 0;
      if (mark === 1) shade = 0;
      else if (mark === 2) shade = Math.max(1, shade - 1);
      else if (mark === 3) shade = Math.min(4, shade + 1);
      ctx.fillStyle = shades[shade];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  boulderFrames.set(frame, canvas);
  return canvas;
}

/** The boulder in `box`, turned by `angle` (radians), lit from the top-left. */
export function drawBoulder(ctx: CanvasRenderingContext2D, box: Box, angle: number): void {
  const turn: number = (((angle / (Math.PI * 2)) % 1) + 1) % 1;
  const frame: number = Math.round(turn * BOULDER_FRAMES) % BOULDER_FRAMES;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(boulderFrame(frame), Math.round(box.x), Math.round(box.y), box.width, box.height);
  ctx.restore();
}

// ─── Chute ───────────────────────────────────────────────

/** Posts along the chute's guard rail, braced bay by bay. */
const BAYS: number = 6;

/**
 * The boulder's chute: a steel trough from (x0, y0) down to (x1, y1) (its floor, where the boulder
 * rolls), a guard rail `railRise` over it on posts, and a brace across each bay. Stepped on the art
 * grid; nothing here looks like a walkway.
 */
export function drawChute(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  railRise: number,
): void {
  const left: number = Math.min(x0, x1);
  const right: number = Math.max(x0, x1);
  const yAt: (x: number) => number = (x: number): number =>
    Math.round((y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)) / ART_PX) * ART_PX;
  // Posts and braces behind the rails.
  for (let i: number = 0; i <= BAYS; i++) {
    const px: number = Math.round((x0 + ((x1 - x0) * i) / BAYS) / ART_PX) * ART_PX;
    const py: number = yAt(px);
    pxRect(ctx, px - 2, py - railRise, 4, railRise, K);
    pxRect(ctx, px - 2, py - railRise, 2, railRise, PIXEL['steelHi']);
    if (i < BAYS) {
      const nx: number = Math.round((x0 + ((x1 - x0) * (i + 1)) / BAYS) / ART_PX) * ART_PX;
      pxLine(ctx, px, py - railRise + 4, nx, yAt(nx) - 4, PIXEL['steel']);
    }
  }
  for (let x: number = Math.floor(left / ART_PX) * ART_PX; x <= right; x += ART_PX) {
    const y: number = yAt(x);
    // Trough: ink lip, light edge, steel, shadow, ink.
    pxRect(ctx, x, y, ART_PX, 12, K);
    pxRect(ctx, x, y + 2, ART_PX, 2, PIXEL['steelLight']);
    pxRect(ctx, x, y + 4, ART_PX, 4, PIXEL['steel']);
    pxRect(ctx, x, y + 8, ART_PX, 2, PIXEL['steelDark']);
    // Guard rail.
    const ry: number = y - railRise;
    pxRect(ctx, x, ry - 2, ART_PX, 8, K);
    pxRect(ctx, x, ry, ART_PX, 2, PIXEL['steelLight']);
    pxRect(ctx, x, ry + 2, ART_PX, 2, PIXEL['steelHi']);
  }
}

// ─── Gate ────────────────────────────────────────────────

const GATE_PALETTE: Readonly<Record<string, string>> = {
  k: K,
  h: PIXEL['woodHi'],
  H: PIXEL['wood'],
  D: PIXEL['woodDark'],
  s: PIXEL['steelLight'],
  S: PIXEL['steelHi'],
  z: PIXEL['steelDark'],
  b: PIXEL['boneDim'],
};

/** The gate at 0, 1 and 2 hits: two oak planks in iron bands, splitting with each hit. */
const GATE_SPRITES: PixelSprite[] = [
  [
    'kkkkkkkk',
    'khHHDHHk',
    'khHHDHDk',
    'ksSSSSsk',
    'kzzzzzzk',
    'khHDDHHk',
    'khHHDHHk',
    'khHHDHDk',
    'khDHDHHk',
    'khHHDHHk',
    'khHHDDHk',
    'khHHDHHk',
    'khHDDHHk',
    'khHHDHDk',
    'ksSSSSsk',
    'kzzzzzzk',
    'khHHDHHk',
    'khHDDHHk',
    'khHHDHDk',
    'kkkkkkkk',
  ],
  [
    'kkkkkkkk',
    'khHHDHHk',
    'khHHDHDk',
    'ksSSSSsk',
    'kzzzzzzk',
    'khkDDHHk',
    'khbkDHHk',
    'khHbkHDk',
    'khDHkHHk',
    'khHHDHHk',
    'khHHDDHk',
    'khHHDHHk',
    'khHDDHHk',
    'khHHDHDk',
    'ksSSSSsk',
    'kzzzzzzk',
    'khHHDHHk',
    'khHDDHHk',
    'khHHDHDk',
    'kkkkkkkk',
  ],
  [
    'kkkkkkkk',
    'khHHDkHk',
    'khHHkbDk',
    'ksSSSSsk',
    'kzzzzzzk',
    'khkDDHHk',
    'khbkDHHk',
    'khHbkHDk',
    'khDHkkHk',
    'khHHbkHk',
    'khHHDkbk',
    'khHHkbHk',
    'khHkbHHk',
    'khkbDHDk',
    'ksSSSSsk',
    'kzzzzzzk',
    'khHHDHHk',
    'khHDDkHk',
    'khHHkbDk',
    'kkkkkkkk',
  ],
].map((rows: string[]): PixelSprite => ({ rows, palette: GATE_PALETTE }));

/** The wooden gate holding the boulder, in its box, split by `hits` hits. */
export function drawGate(ctx: CanvasRenderingContext2D, gate: Box, hits: number): void {
  const sprite: PixelSprite = GATE_SPRITES[Math.max(0, Math.min(GATE_SPRITES.length - 1, hits))];
  drawSprite(ctx, sprite, gate.x, gate.y, gate.width / sprite.rows[0].length);
}

// ─── Exit arrows ─────────────────────────────────────────

const ARROW: PixelSprite = {
  rows: outlined([
    '.......',
    '.e.....',
    '.ee....',
    '.eEe...',
    '.eEEe..',
    '.eEe...',
    '.ee....',
    '.e.....',
    '.......',
  ]),
  palette: { k: K, e: PIXEL['tealHi'], E: PIXEL['teal'] },
};

/** Three chevrons pointing `dir` (1 right, -1 left) from (x, y), bobbing a step every other beat. */
export function drawExitArrows(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  nowMs: number,
): void {
  const bob: number = Math.floor(nowMs / 400) % 2 === 0 ? 0 : ART_PX * dir;
  const w: number = ARROW.rows[0].length * ART_PX;
  for (let i: number = 0; i < 3; i++) {
    const ax: number = x + dir * (i - 1) * (w - 2) + bob - w / 2;
    drawSprite(ctx, ARROW, ax, y, ART_PX, dir < 0);
  }
}

// ─── Spring ──────────────────────────────────────────────

const PLATE_H: number = 12;
const BASE_H: number = 8;
/** The coils stand this far in from the block's ends, together. */
const COIL_INSET: number = 16;
/** One coil per this much width, each this wide either side of its rod, wound this many times. */
const COIL_PITCH: number = 36;
const COIL_HALF_WIDTH: number = 12;
const COIL_LOOPS: number = 3;

/**
 * The big spring in its block: a riveted steel base, a heavy coil, and a hazard-striped plate
 * whose top row is the block's walkable top. At rest it fills the block exactly; the plate sinks
 * (`plateOffset` > 0) while it winds up and shoots up on release.
 */
export function drawSpringBlock(
  ctx: CanvasRenderingContext2D,
  block: { x: number; y: number; width: number; height: number },
  plateOffset: number,
): void {
  const x: number = Math.round(block.x);
  const w: number = Math.round(block.width);
  const plateY: number = Math.round((block.y + plateOffset) / ART_PX) * ART_PX;
  const bottom: number = Math.round(block.y + block.height);
  const coilTop: number = plateY + PLATE_H;
  const coilBottom: number = bottom - BASE_H;

  // Base.
  pxBar(ctx, x, coilBottom, w, BASE_H, PIXEL['steelHi'], PIXEL['steel'], PIXEL['steelDark']);
  for (let rx: number = x + 6; rx < x + w - 6; rx += 16) pxRivet(ctx, rx, coilBottom + 2);

  // Coils: a row of heavy helical springs between base and plate, each wound back and forth
  // (the strokes behind darker, the ones in front lit), with a guide rod through the middle.
  const coils: number = Math.max(2, Math.floor((w - COIL_INSET) / COIL_PITCH));
  const span: number = (w - COIL_INSET) / coils;
  for (let c: number = 0; c < coils; c++) {
    const cx: number = Math.round((x + COIL_INSET / 2 + span * (c + 0.5)) / ART_PX) * ART_PX;
    const left: number = cx - COIL_HALF_WIDTH;
    const right: number = cx + COIL_HALF_WIDTH;
    pxRect(ctx, cx - 2, coilTop, 4, coilBottom - coilTop, PIXEL['steelDark']);
    const turns: number = COIL_LOOPS * 2;
    const step: number = (coilBottom - coilTop) / turns;
    const passes: number[] = [0, 1];
    for (const pass of passes) {
      for (let t: number = 0; t < turns; t++) {
        const front: boolean = t % 2 === 0;
        if ((pass === 0) === front) continue;
        const y0: number = coilTop + step * t + 2;
        const y1: number = coilTop + step * (t + 1) + 2;
        const from: number = front ? left : right;
        const to: number = front ? right : left;
        pxLine(ctx, from, y0, to, y1, K, 6);
        pxLine(ctx, from, y0, to, y1, front ? PIXEL['steelHi'] : PIXEL['steelDark'], 2);
        if (front) pxLine(ctx, from, y0 - 2, to, y1 - 2, PIXEL['steelLight'], 2);
      }
    }
  }

  // Plate: ink frame, hazard stripes, a light top edge and bolts at both ends.
  pxRect(ctx, x, plateY, w, PLATE_H, K);
  for (let cxp: number = 0; cxp < (w - 4) / ART_PX; cxp++) {
    for (let cyp: number = 0; cyp < (PLATE_H - 4) / ART_PX; cyp++) {
      const stripe: boolean = Math.floor((cxp + cyp) / 4) % 2 === 0;
      const top: boolean = cyp === 0;
      const color: string = stripe
        ? top
          ? PIXEL['goldHi']
          : cyp === (PLATE_H - 4) / ART_PX - 1
            ? PIXEL['goldDark']
            : PIXEL['gold']
        : top
          ? PIXEL['steel']
          : PIXEL['ink2'];
      pxRect(ctx, x + 2 + cxp * ART_PX, plateY + 2 + cyp * ART_PX, ART_PX, ART_PX, color);
    }
  }
  pxRivet(ctx, x + 4, plateY + 4);
  pxRivet(ctx, x + w - 6, plateY + 4);
}

/** The spring's button: a housing in the ground, a steel shaft and a red cap (lit while up). */
export function drawButton(
  ctx: CanvasRenderingContext2D,
  button: Box,
  capY: number,
  groundY: number,
  lit: boolean,
): void {
  const x: number = Math.round(button.x);
  const w: number = button.width;
  const cy: number = Math.round(capY / ART_PX) * ART_PX;
  const shaftX: number = x + w / 2 - 4;
  pxRect(ctx, shaftX, cy, 8, groundY - cy, K);
  pxRect(ctx, shaftX + 2, cy, 2, groundY - cy, PIXEL['steelLight']);
  pxRect(ctx, shaftX + 4, cy, 2, groundY - cy, PIXEL['steel']);
  pxBar(
    ctx,
    x - 2,
    cy - 4,
    w + 4,
    10,
    lit ? PIXEL['rustHi'] : PIXEL['blood'],
    lit ? PIXEL['bloodHi'] : PIXEL['bloodDark'],
    lit ? PIXEL['blood'] : PIXEL['ink2'],
  );
  if (lit) pxRect(ctx, x + 2, cy - 2, 4, 2, PIXEL['white']);
  pxBar(ctx, x - 6, groundY - 8, w + 12, 8, PIXEL['steelHi'], PIXEL['steel'], PIXEL['steelDark']);
  pxRivet(ctx, x - 4, groundY - 6);
  pxRivet(ctx, x + w + 2, groundY - 6);
}

// ─── Scale ───────────────────────────────────────────────

/** The scale's pan set into the ground: a tread plate with a status lip (gold, green when loaded). */
export function drawScalePan(ctx: CanvasRenderingContext2D, pan: Box, loaded: boolean): void {
  pxBar(
    ctx,
    pan.x,
    pan.y,
    pan.width,
    pan.height,
    loaded ? PIXEL['toxicHi'] : PIXEL['goldHi'],
    PIXEL['steel'],
    PIXEL['steelDark'],
  );
  for (let x: number = pan.x + 6; x < pan.x + pan.width - 6; x += 8) {
    pxRect(ctx, x, pan.y + 4, 2, 2, PIXEL['steelHi']);
  }
}

const GAUGE_CELLS: number = 16;
let gaugeFace: PixelSprite | null = null;

function gaugeSprite(): PixelSprite {
  if (gaugeFace) return gaugeFace;
  const n: number = GAUGE_CELLS;
  const c: number = (n - 1) / 2;
  const rows: string[] = [];
  for (let y: number = 0; y < n; y++) {
    let row: string = '';
    for (let x: number = 0; x < n; x++) {
      const dx: number = x - c;
      const dy: number = y - c;
      const d: number = Math.hypot(dx, dy);
      const a: number = Math.atan2(dy, dx);
      if (d > 7.6) row += '.';
      else if (d > 6.6) row += 'k';
      else if (d > 5.5) row += dx + dy < 0 ? 's' : 'S';
      else if (d > 4.3) {
        // Ticks round the dial (its sweep runs from 135 to 405 degrees), the last stretch red.
        const deg: number = ((a * 180) / Math.PI + 360) % 360;
        const sweep: number = (deg - 135 + 360) % 360;
        if (sweep > 270) row += 'b';
        else if (sweep > 220) row += 'R';
        else row += sweep % 45 < 9 ? 'k' : 'b';
      } else row += 'b';
    }
    rows.push(row);
  }
  gaugeFace = {
    rows,
    palette: {
      k: K,
      s: PIXEL['steelLight'],
      S: PIXEL['steelHi'],
      b: PIXEL['bone'],
      R: PIXEL['blood'],
    },
  };
  return gaugeFace;
}

/** The scale's post (a riveted girder from the ground up) with its dial; `fraction` 0..1 of the load. */
export function drawScalePost(
  ctx: CanvasRenderingContext2D,
  postX: number,
  postTop: number,
  groundY: number,
  gaugeY: number,
  fraction: number,
): void {
  const x: number = Math.round(postX) - 4;
  pxRect(ctx, x, postTop, 8, groundY - postTop, K);
  pxRect(ctx, x + 2, postTop, 2, groundY - postTop, PIXEL['steelHi']);
  pxRect(ctx, x + 4, postTop, 2, groundY - postTop, PIXEL['steelDark']);
  for (let y: number = postTop + 6; y < groundY - 4; y += 16) pxRivet(ctx, x + 2, y);
  const size: number = GAUGE_CELLS * ART_PX;
  const gx: number = Math.round(postX) - size / 2;
  const gy: number = Math.round(gaugeY) - size / 2;
  drawSprite(ctx, gaugeSprite(), gx, gy, ART_PX);
  const angle: number = Math.PI * (0.75 + 1.5 * fraction);
  const cx: number = gx + size / 2;
  const cy: number = gy + size / 2;
  pxLine(ctx, cx, cy, cx + Math.cos(angle) * 9, cy + Math.sin(angle) * 9, PIXEL['bloodHi']);
  pxRect(ctx, cx - 2, cy - 2, 4, 4, K);
}

// ─── Cable and pulleys ───────────────────────────────────

/** A pulley wheel at (x, y), hung from the roof on a rod. */
function drawPulley(ctx: CanvasRenderingContext2D, x: number, y: number, hung: boolean): void {
  const cx: number = Math.round(x / ART_PX) * ART_PX;
  const cy: number = Math.round(y / ART_PX) * ART_PX;
  if (hung) {
    pxRect(ctx, cx - 2, 0, 4, cy, K);
    pxRect(ctx, cx - 2, 0, 2, cy, PIXEL['steelHi']);
  }
  pxDisc(ctx, cx, cy, 8, K);
  pxDisc(ctx, cx, cy, 6, PIXEL['steelHi']);
  pxDisc(ctx, cx, cy, 4, PIXEL['steelDark']);
  pxRect(ctx, cx - 2, cy - 2, 4, 4, PIXEL['steelLight']);
}

/** A steel cable along `path` (straight runs), with pulleys at its first corners. */
export function drawCable(ctx: CanvasRenderingContext2D, path: Point[], pulleys: number): void {
  for (let i: number = 0; i < path.length - 1; i++) {
    pxLine(ctx, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y, K, 4);
  }
  for (let i: number = 0; i < path.length - 1; i++) {
    pxLine(ctx, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y, PIXEL['steelLight'], 2);
  }
  for (let i: number = 0; i < Math.min(pulleys, path.length); i++) {
    drawPulley(ctx, path[i].x, path[i].y, path[i].y < 200);
  }
}

// ─── Chains ──────────────────────────────────────────────

const LINK_PALETTE: Readonly<Record<string, string>> = {
  k: K,
  s: PIXEL['steelLight'],
  S: PIXEL['steelHi'],
};
const LINK_OPEN: PixelSprite = {
  rows: ['.kk.', 'kssk', 'k..k', 'kSSk', '.kk.'],
  palette: LINK_PALETTE,
};
const LINK_EDGE: PixelSprite = { rows: ['kk', 'sk', 'sk', 'Sk', 'kk'], palette: LINK_PALETTE };
const LINK_OPEN_FLAT: PixelSprite = {
  rows: ['.kkk.', 'ks.Sk', 'ks.Sk', '.kkk.'],
  palette: LINK_PALETTE,
};
const LINK_EDGE_FLAT: PixelSprite = { rows: ['kssSk', 'kkkkk'], palette: LINK_PALETTE };
/** Distance between chain links along the chain. */
const LINK_STEP: number = 7;

/** Points along `path` with its corners rounded off (quadratic through each midpoint). */
function smoothPath(path: Point[]): Point[] {
  const out: Point[] = [path[0]];
  let from: Point = path[0];
  for (let i: number = 1; i < path.length - 1; i++) {
    const mid: Point = { x: (path[i].x + path[i + 1].x) / 2, y: (path[i].y + path[i + 1].y) / 2 };
    for (let s: number = 1; s <= 12; s++) {
      const t: number = s / 12;
      const u: number = 1 - t;
      out.push({
        x: u * u * from.x + 2 * u * t * path[i].x + t * t * mid.x,
        y: u * u * from.y + 2 * u * t * path[i].y + t * t * mid.y,
      });
    }
    from = mid;
  }
  out.push(path[path.length - 1]);
  return out;
}

/** A chain of iron links along `path`, sagging through its corners; links alternate face and edge. */
export function drawChain(ctx: CanvasRenderingContext2D, path: Point[]): void {
  const points: Point[] = smoothPath(path);
  let carry: number = 0;
  let index: number = 0;
  for (let i: number = 0; i < points.length - 1; i++) {
    const a: Point = points[i];
    const b: Point = points[i + 1];
    const len: number = Math.hypot(b.x - a.x, b.y - a.y);
    const flat: boolean = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
    let d: number = carry;
    while (d <= len) {
      const t: number = len > 0 ? d / len : 0;
      const open: boolean = index % 2 === 0;
      const sprite: PixelSprite = flat
        ? open
          ? LINK_OPEN_FLAT
          : LINK_EDGE_FLAT
        : open
          ? LINK_OPEN
          : LINK_EDGE;
      const w: number = sprite.rows[0].length * ART_PX;
      const h: number = sprite.rows.length * ART_PX;
      const x: number = Math.round((a.x + (b.x - a.x) * t - w / 2) / ART_PX) * ART_PX;
      const y: number = Math.round((a.y + (b.y - a.y) * t - h / 2) / ART_PX) * ART_PX;
      drawSprite(ctx, sprite, x, y, ART_PX);
      index++;
      d += LINK_STEP;
    }
    carry = d - len;
  }
}

/** The iron ring on a cage's top that its chain hooks into. */
export function drawCageRing(ctx: CanvasRenderingContext2D, cx: number, bottomY: number): void {
  const x: number = Math.round(cx / ART_PX) * ART_PX;
  pxDisc(ctx, x, bottomY - 6, 6, K);
  pxDisc(ctx, x, bottomY - 6, 4, PIXEL['steelHi']);
  pxDisc(ctx, x, bottomY - 6, 2, K);
}

// ─── Cages ───────────────────────────────────────────────

/**
 * A floor-4 cage filling exactly `box`: an iron frame (its top bar is the walkable top). Covered,
 * an oiled tarp hangs over it, gathered by a rope; bare, its bars and the dark inside show.
 */
export function drawCageArt(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  covered: boolean,
): void {
  const x: number = Math.round(box.x);
  const y: number = Math.round(box.y);
  const w: number = Math.round(box.width);
  const h: number = Math.round(box.height);
  if (covered) {
    pxRect(ctx, x, y, w, h, K);
    pxRect(ctx, x + 2, y + 8, w - 4, h - 12, PIXEL['tarp']);
    // Drape: folds fan out from the knot down to the hem, each a shadowed valley beside a lit
    // ridge; the cloth sags between the corners.
    const knotX: number = x + w / 2;
    const folds: number = Math.max(3, Math.round(w / 24));
    for (let f: number = 0; f < folds; f++) {
      const t: number = (f + 0.5) / folds;
      const topX: number = knotX + (t - 0.5) * w * 0.35;
      const hemX: number = x + 6 + t * (w - 12);
      pxLine(ctx, topX, y + 20, hemX, y + h - 8, PIXEL['tarpDark']);
      pxLine(ctx, topX + 2, y + 22, hemX + 4, y + h - 8, PIXEL['tarpHi']);
    }
    pxRect(ctx, x + 2, y + 8, 4, h - 12, PIXEL['tarpDark']);
    pxRect(ctx, x + w - 6, y + 8, 4, h - 12, PIXEL['tarpDark']);
    // Rope band and its knot.
    pxRect(ctx, x + 2, y + 14, w - 4, 2, PIXEL['boneDim']);
    pxRect(ctx, x + 2, y + 16, w - 4, 2, PIXEL['woodDark']);
    pxRect(ctx, x + w / 2 - 4, y + 12, 8, 8, K);
    pxRect(ctx, x + w / 2 - 2, y + 14, 4, 4, PIXEL['boneDim']);
    // Ragged hem.
    for (let hx: number = x + 2; hx < x + w - 2; hx += 8) {
      pxRect(ctx, hx, y + h - 6, 4, 2, PIXEL['tarpDark']);
    }
  } else {
    ctx.fillStyle = 'rgba(14, 13, 11, 0.6)';
    ctx.fillRect(x, y, w, h);
    for (let bx: number = x + 14; bx < x + w - 10; bx += 14) {
      pxRect(ctx, bx, y, 4, h, K);
      pxRect(ctx, bx + 2, y, 2, h, PIXEL['steelHi']);
    }
    pxBar(ctx, x, y + h / 2 - 3, w, 6, PIXEL['steelHi'], PIXEL['steel'], PIXEL['steelDark']);
    pxBar(ctx, x, y + h - 8, w, 8, PIXEL['steelHi'], PIXEL['steel'], PIXEL['steelDark']);
    pxRect(ctx, x, y, 6, h, K);
    pxRect(ctx, x + 2, y, 2, h, PIXEL['steel']);
    pxRect(ctx, x + w - 6, y, 6, h, K);
    pxRect(ctx, x + w - 4, y, 2, h, PIXEL['steel']);
  }
  // Iron top bar with corner brackets.
  pxBar(ctx, x, y, w, 8, PIXEL['steelLight'], PIXEL['steel'], PIXEL['steelDark']);
  pxRivet(ctx, x + 4, y + 2);
  pxRivet(ctx, x + w - 6, y + 2);
  pxRect(ctx, x, y + h - 2, w, 2, K);
}

/** An iron cleat on a ledge: a bolted foot, a post and a horn, cracking per hit; snapped, half is gone. */
export function drawCleatArt(
  ctx: CanvasRenderingContext2D,
  cleat: Box,
  hits: number,
  cut: boolean,
): void {
  const x: number = Math.round(cleat.x);
  const y: number = Math.round(cleat.y);
  const w: number = cleat.width;
  const h: number = cleat.height;
  const top: number = cut ? y + Math.round(h / 2 / ART_PX) * ART_PX : y;
  const postX: number = x + w / 2 - 3;
  pxRect(ctx, postX, top, 6, y + h - top, K);
  pxRect(ctx, postX + 2, top, 2, y + h - top, PIXEL['steelHi']);
  pxBar(ctx, x - 2, y + h - 6, w + 4, 6, PIXEL['steelHi'], PIXEL['steel'], PIXEL['steelDark']);
  pxRect(ctx, x, y + h - 4, 2, 2, PIXEL['steelLight']);
  pxRect(ctx, x + w - 2, y + h - 4, 2, 2, PIXEL['steelLight']);
  if (cut) {
    // Bright torn metal where it snapped.
    pxRect(ctx, postX, top, 6, 2, PIXEL['steelLight']);
    pxRect(ctx, postX + 2, top - 2, 2, 2, PIXEL['steelLight']);
    return;
  }
  pxBar(ctx, x - 2, y, w + 4, 6, PIXEL['steelLight'], PIXEL['steel'], PIXEL['steelDark']);
  pxRect(ctx, x - 2, y - 2, 4, 2, K);
  pxRect(ctx, x + w - 2, y - 2, 4, 2, K);
  for (let i: number = 0; i < hits; i++) {
    const cy: number = y + 8 + i * 6;
    pxLine(ctx, postX, cy, postX + 4, cy + 4, K);
    pxRect(ctx, postX + 4, cy + 4, 2, 2, PIXEL['goldHi']);
  }
}

// ─── Pressure plate ──────────────────────────────────────

/**
 * The pressure plate set into its ledge's top: a recessed tread plate with a status lip (red, green
 * when held; pressed in while held) and a signal arm whose lamps count the weight on it.
 */
export function drawPlateArt(
  ctx: CanvasRenderingContext2D,
  box: Box,
  held: boolean,
  weight: number,
  needed: number,
): void {
  const x: number = Math.round(box.x);
  const y: number = Math.round(box.y);
  const sink: number = held ? ART_PX : 0;
  pxRect(ctx, x - 2, y, box.width + 4, box.height, K);
  pxRect(ctx, x, y + sink, box.width, box.height - sink, PIXEL['steel']);
  pxRect(ctx, x, y + sink, box.width, 2, held ? PIXEL['toxicHi'] : PIXEL['bloodHi']);
  for (let tx: number = x + 4; tx < x + box.width - 2; tx += 8) {
    pxRect(ctx, tx, y + sink + 4, 2, 2, PIXEL['steelHi']);
  }

  // Signal arm: a post at the plate's left end, an arm over the plate holding the lamps.
  const lampGap: number = 18;
  const armY: number = y - 64;
  const armW: number = needed * lampGap + 8;
  const armX: number = Math.round((x + box.width / 2 - armW / 2) / ART_PX) * ART_PX;
  const postX: number = Math.min(armX, x - 8);
  pxRect(ctx, postX, armY, 6, y - armY, K);
  pxRect(ctx, postX + 2, armY, 2, y - armY, PIXEL['steelHi']);
  pxBar(
    ctx,
    postX,
    armY,
    armX + armW - postX,
    16,
    PIXEL['steelHi'],
    PIXEL['steelDark'],
    PIXEL['ink2'],
  );
  const lit: number = Math.min(needed, weight);
  for (let i: number = 0; i < needed; i++) {
    const lx: number = armX + 6 + i * lampGap;
    const on: boolean = i < lit;
    pxRect(ctx, lx, armY + 3, 10, 10, K);
    pxRect(
      ctx,
      lx + 2,
      armY + 5,
      6,
      6,
      on ? (held ? PIXEL['toxicHi'] : PIXEL['goldHi']) : PIXEL['steelDark'],
    );
    if (on) pxRect(ctx, lx + 2, armY + 5, 2, 2, PIXEL['white']);
  }
}

// ─── Exit door ───────────────────────────────────────────

/**
 * The barred exit door: a stone frame, a dark doorway, and iron bars (with a cross band and spiked
 * feet) sliding up into the lintel as it opens (`open` 0..1). Fully open, the doorway lights up.
 */
export function drawExitDoorArt(ctx: CanvasRenderingContext2D, door: Box, open: number): void {
  const post: number = 8;
  const x: number = Math.round(door.x);
  const y: number = Math.round(door.y);
  const w: number = door.width;
  const h: number = door.height;
  const inner: Box = { x: x + post, y: y + post, width: w - 2 * post, height: h - post };
  pxRect(
    ctx,
    inner.x,
    inner.y,
    inner.width,
    inner.height,
    open >= 1 ? PIXEL['tealDark'] : PIXEL['ink2'],
  );
  if (open >= 1) {
    pxRect(ctx, inner.x, inner.y, inner.width, 2, PIXEL['teal']);
    pxRect(ctx, inner.x, inner.y, 2, inner.height, PIXEL['teal']);
  }
  const barsBottom: number = Math.round((inner.y + inner.height * (1 - open)) / ART_PX) * ART_PX;
  if (barsBottom > inner.y) {
    for (let bx: number = inner.x + 2; bx < inner.x + inner.width - 2; bx += 8) {
      pxRect(ctx, bx, inner.y, 4, barsBottom - inner.y, K);
      pxRect(ctx, bx + 2, inner.y, 2, barsBottom - inner.y - 2, PIXEL['steelHi']);
      pxRect(ctx, bx + 1, barsBottom, 2, 2, K);
    }
    const band: number = Math.max(inner.y, barsBottom - 18);
    pxBar(ctx, inner.x, band, inner.width, 6, PIXEL['steelHi'], PIXEL['steel'], PIXEL['steelDark']);
  }
  // Stone frame: blocks with ink mortar.
  const stoneBlock: (bx: number, by: number, bw: number, bh: number, i: number) => void = (
    bx: number,
    by: number,
    bw: number,
    bh: number,
    i: number,
  ): void => {
    pxRect(ctx, bx, by, bw, bh, K);
    pxRect(ctx, bx + 2, by + 2, bw - 4, bh - 4, i % 2 === 0 ? PIXEL['stone'] : PIXEL['stoneMid']);
    pxRect(ctx, bx + 2, by + 2, bw - 4, 2, PIXEL['stoneHi']);
  };
  let i: number = 0;
  for (let by: number = y + post; by < y + h; by += 14, i++) {
    const bh: number = Math.min(14, y + h - by);
    stoneBlock(x, by, post, bh, i);
    stoneBlock(x + w - post, by, post, bh, i + 1);
  }
  for (let bx: number = x, j: number = 0; bx < x + w; bx += 14, j++) {
    stoneBlock(bx, y, Math.min(14, x + w - bx), post, j);
  }
}
