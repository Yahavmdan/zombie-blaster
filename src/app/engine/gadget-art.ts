import { GAME_CONSTANTS } from '@shared/index';
import { GadgetBody, GadgetState } from '@shared/game-entities';
import { Box, Point } from './boulder-puzzle';
import { CANVAS_BONE, fillOutlinedText, pixelFont } from './canvas-text';
import {
  ButtonGadget,
  CrackWallGadget,
  CageGadget,
  DoorGadget,
  EXIT_TARGET,
  Gadget,
  LeverGadget,
  ScaleGadget,
  SlingshotGadget,
  Platform,
  SlopeGadget,
} from './engine-types';
import {
  SlopeSurface,
  boulderBox,
  cageBox,
  crackBand,
  doorSolid,
  lookOf,
  dotsAlong,
  gaugeFraction,
  padOffset,
  slopeSurface,
  slopeY,
  stateOf,
  wirePath,
  wires,
} from './gadgets';
import { Random, seededRandom } from './level-generator';
import { ART_PX, PIXEL, pxBar, pxDisc, pxLine, pxRect, pxRivet } from './pixel-art';
import {
  BUTTON_LOOKS,
  ButtonLook,
  DOOR_LOOKS,
  BIN_LOOKS,
  LEVER_LOOKS,
  LeverLook,
  Ramp,
  SLINGSHOT_LOOKS,
  SLOPE_LOOKS,
  SlingshotLook,
  SlopeLook,
  WALL_LOOKS,
} from './gadget-looks';
import {
  WALL_INK,
  WALL_MORTAR,
  WALL_SHADES,
  drawBoulder,
  drawCageArt,
  drawChain,
  drawScalePan,
  drawScalePost,
  drawSpringBlock,
  paintWallStone,
  wallStoneLayout,
} from './puzzle-art';

/**
 * Pixel art for designed floors' gadgets (`gadgets.ts`), on the 2-pixel art grid with the pixel
 * icon palette. Every solid gadget fills exactly its collision box; the lever, the wire dots and
 * the scale's post are scenery.
 */

const K: string = PIXEL['ink'];
const CRACK_SEED: number = 0xc4ac;
/** A brick's size in art cells, its mortar included. */
const BRICK_COLS: number = 12;
const BRICK_ROWS: number = 4;
const CONCRETE_POUR_ROWS: number = 32;
const CONCRETE_TIE_COLS: number = 14;
/** Cells painted moss (`wallShades` in `gadget-looks.ts`). */
const WALL_MOSS: number = 6;
const WALL_MOSS_HI: number = 7;
/** The cracked wall's look when none is given. */
const CRACK_LOOK: string = 'stone';
const masonry: Map<string, HTMLCanvasElement> = new Map<string, HTMLCanvasElement>();
const bands: Map<string, HTMLCanvasElement> = new Map<string, HTMLCanvasElement>();

function canvasOf(cols: number, rows: number, cells: number[], shades: string[]): HTMLCanvasElement {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
  if (!ctx) return canvas;
  for (let y: number = 0; y < rows; y++) {
    for (let x: number = 0; x < cols; x++) {
      ctx.fillStyle = shades[cells[y * cols + x]];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

function wallShadesOf(look: string): string[] {
  return WALL_LOOKS[look] ?? WALL_SHADES;
}

function stoneCells(cols: number, rows: number, seed: number): number[] {
  const rand: Random = seededRandom(seed);
  const cells: number[] = new Array<number>(cols * rows).fill(3);
  const joints: number[] = new Array<number>(cols * rows).fill(0);
  for (const stone of wallStoneLayout(cols, rows, true)) {
    paintWallStone(cells, joints, cols, rows, stone, rand);
  }
  return cells;
}

/** Courses of bricks in running bond: a row of mortar under each, every other course shifted. */
function brickCells(cols: number, rows: number): number[] {
  const cells: number[] = new Array<number>(cols * rows).fill(3);
  for (let y: number = 0; y < rows; y++) {
    const course: number = Math.floor(y / BRICK_ROWS);
    for (let x: number = 0; x < cols; x++) {
      const along: number = x + (course % 2) * (BRICK_COLS / 2);
      const brick: number = Math.floor(along / BRICK_COLS);
      if (y % BRICK_ROWS === BRICK_ROWS - 1 || along % BRICK_COLS === BRICK_COLS - 1) {
        cells[y * cols + x] = WALL_MORTAR;
      } else if (y % BRICK_ROWS === 0) {
        cells[y * cols + x] = WALL_SHADES.length - 1;
      } else {
        cells[y * cols + x] = (brick * 5 + course * 3) % 4 === 0 ? 2 : 3;
      }
    }
  }
  return cells;
}

/** Cast concrete: speckled, a form seam every pour and the tie holes the forms left. */
function concreteCells(cols: number, rows: number, seed: number): number[] {
  const rand: Random = seededRandom(seed);
  const cells: number[] = new Array<number>(cols * rows).fill(3);
  for (let i: number = 0; i < cells.length; i++) {
    const r: number = rand();
    if (r < 0.08) cells[i] = 2;
    else if (r < 0.14) cells[i] = 5;
  }
  for (let y: number = CONCRETE_POUR_ROWS; y < rows; y += CONCRETE_POUR_ROWS) {
    for (let x: number = 0; x < cols; x++) {
      cells[(y - 1) * cols + x] = WALL_MORTAR;
      cells[y * cols + x] = WALL_SHADES.length - 1;
    }
  }
  for (let y: number = CONCRETE_POUR_ROWS / 2; y < rows; y += CONCRETE_POUR_ROWS) {
    for (let x: number = 5; x < cols - 2; x += CONCRETE_TIE_COLS) {
      cells[y * cols + x] = WALL_MORTAR;
      cells[y * cols + x + 1] = WALL_MORTAR;
    }
  }
  return cells;
}

/** Old stone with moss creeping down from the courses: patches, thin strands under them. */
function mossyCells(cols: number, rows: number, seed: number): number[] {
  const rand: Random = seededRandom(seed + 7);
  const cells: number[] = stoneCells(cols, rows, seed);
  const patches: number = Math.ceil((cols * rows) / 160);
  for (let p: number = 0; p < patches; p++) {
    const px: number = Math.floor(rand() * cols);
    const py: number = Math.floor(rand() * rows);
    const wide: number = 3 + Math.floor(rand() * 6);
    for (let x: number = px; x < Math.min(cols, px + wide); x++) {
      const drop: number = 1 + Math.floor(rand() * 5);
      for (let y: number = py; y < Math.min(rows, py + drop); y++) {
        cells[y * cols + x] = y === py ? WALL_MOSS_HI : WALL_MOSS;
      }
    }
  }
  return cells;
}

function wallCells(cols: number, rows: number, seed: number, look: string): number[] {
  if (look === 'brick') return brickCells(cols, rows);
  if (look === 'concrete') return concreteCells(cols, rows, seed);
  if (look === 'mossy') return mossyCells(cols, rows, seed);
  return stoneCells(cols, rows, seed);
}

/** A dressed stone wall at one canvas pixel per art cell (the cracked wall outside its band). */
function masonryArt(cols: number, rows: number, look: string): HTMLCanvasElement {
  const key: string = `${look}:${cols}x${rows}`;
  const cached: HTMLCanvasElement | undefined = masonry.get(key);
  if (cached) return cached;
  const cells: number[] = wallCells(cols, rows, CRACK_SEED, look);
  // Ink down both faces: the wall's silhouette.
  for (let y: number = 0; y < rows; y++) {
    cells[y * cols] = WALL_INK;
    cells[y * cols + cols - 1] = WALL_INK;
  }
  const canvas: HTMLCanvasElement = canvasOf(cols, rows, cells, wallShadesOf(look));
  masonry.set(key, canvas);
  return canvas;
}

/**
 * The crack band at one canvas pixel per art cell: the same stones, shattered. `stage` (0..hits)
 * shows the cracks so far: a few hairlines at first, more and wider with every swing.
 */
export function crackBandArt(
  cols: number,
  rows: number,
  stage: number,
  look: string = CRACK_LOOK,
): HTMLCanvasElement {
  const key: string = `${look}:${cols}x${rows}:${stage}`;
  const cached: HTMLCanvasElement | undefined = bands.get(key);
  if (cached) return cached;
  const rand: Random = seededRandom(CRACK_SEED + cols * 31 + rows);
  const cells: number[] = wallCells(cols, rows, CRACK_SEED + 1, look);
  const inside: (x: number, y: number) => boolean = (x: number, y: number): boolean =>
    x >= 1 && y >= 1 && x < cols - 1 && y < rows - 1;
  // Crushed stone: chipped patches, deep where the chips fell out, a fresh light edge below them.
  for (let p: number = 0; p < 6 + stage * 4; p++) {
    const px: number = 1 + Math.floor(rand() * (cols - 3));
    const py: number = 1 + Math.floor(rand() * (rows - 3));
    const size: number = 1 + Math.floor(rand() * 2);
    for (let dy: number = 0; dy <= size; dy++) {
      for (let dx: number = 0; dx <= size; dx++) {
        if (inside(px + dx, py + dy)) cells[(py + dy) * cols + px + dx] = WALL_MORTAR;
      }
    }
    if (inside(px + 1, py + size + 1))
      cells[(py + size + 1) * cols + px + 1] = WALL_SHADES.length - 1;
  }
  // Cracks spread from a few breaking points in every direction, branching; more and wider with
  // every swing. Each is an ink gap with a lit lip under it.
  const crack: boolean[] = new Array<boolean>(cols * rows).fill(false);
  const origins: number = 2 + Math.floor(stage / 2);
  for (let o: number = 0; o < origins; o++) {
    const ox: number = 2 + Math.floor(rand() * (cols - 4));
    const oy: number = 1 + Math.floor(rand() * (rows - 2));
    const arms: number = 3 + Math.floor(rand() * 2) + Math.floor(stage / 2);
    for (let a: number = 0; a < arms; a++) {
      let heading: number = (a / arms) * Math.PI * 2 + rand() * 0.8;
      let fx: number = ox;
      let fy: number = oy;
      const length: number = 6 + Math.floor(rand() * (cols / 2 + stage * 4));
      const width: number = a < stage ? 2 : 1;
      for (let s: number = 0; s < length; s++) {
        heading += (rand() - 0.5) * 0.9;
        fx += Math.cos(heading);
        fy += Math.sin(heading);
        const cx: number = Math.round(fx);
        const cy: number = Math.round(fy);
        if (!inside(cx, cy)) break;
        for (let t: number = 0; t < width; t++)
          if (inside(cx + t, cy)) crack[cy * cols + cx + t] = true;
      }
    }
  }
  for (let y: number = 0; y < rows; y++) {
    for (let x: number = 0; x < cols; x++) {
      if (!crack[y * cols + x]) continue;
      cells[y * cols + x] = WALL_INK;
      if (y + 1 < rows && !crack[(y + 1) * cols + x])
        cells[(y + 1) * cols + x] = WALL_SHADES.length - 1;
    }
  }
  for (let y: number = 0; y < rows; y++) {
    cells[y * cols] = WALL_INK;
    cells[y * cols + cols - 1] = WALL_INK;
  }
  for (let x: number = 0; x < cols; x++) {
    cells[x] = WALL_INK;
    cells[(rows - 1) * cols + x] = WALL_INK;
  }
  const canvas: HTMLCanvasElement = canvasOf(cols, rows, cells, wallShadesOf(look));
  bands.set(key, canvas);
  return canvas;
}

function blit(ctx: CanvasRenderingContext2D, art: HTMLCanvasElement, box: Box, sy: number): void {
  const rows: number = Math.ceil(box.height / ART_PX);
  ctx.drawImage(art, 0, sy, art.width, rows, box.x, box.y, art.width * ART_PX, rows * ART_PX);
}

/**
 * A cracked wall: dressed stone, with its crack band shattered (cracks growing with every swing it
 * took) until it breaks out, then a dark hole between what stands above and below.
 */
export function drawCrackWall(
  ctx: CanvasRenderingContext2D,
  g: CrackWallGadget,
  state: GadgetState,
): void {
  const cols: number = Math.ceil(g.width / ART_PX);
  const band: Box = crackBand(g);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.beginPath();
  ctx.rect(g.x, g.y, g.width, g.height);
  ctx.clip();
  const look: string = lookOf(g);
  const wall: HTMLCanvasElement = masonryArt(cols, Math.ceil(g.height / ART_PX), look);
  if (band.y > g.y) blit(ctx, wall, { ...g, height: band.y - g.y }, 0);
  const below: number = band.y + band.height;
  if (below < g.y + g.height) {
    blit(ctx, wall, { ...g, y: below, height: g.y + g.height - below }, (below - g.y) / ART_PX);
  }
  if (!state.broken) {
    const art: HTMLCanvasElement = crackBandArt(
      cols,
      Math.ceil(band.height / ART_PX),
      Math.min(state.hits, GAME_CONSTANTS.GADGET_CRACK_HITS - 1),
      look,
    );
    blit(ctx, art, band, 0);
  } else {
    // Ragged lips where the band broke away.
    for (let x: number = g.x; x < g.x + g.width; x += ART_PX * 3) {
      if (band.y > g.y) pxRect(ctx, x, band.y, ART_PX * 2, ART_PX, K);
      if (below < g.y + g.height) pxRect(ctx, x + ART_PX, below - ART_PX, ART_PX * 2, ART_PX, K);
    }
  }
  ctx.restore();
}

/**
 * A floor button set into its surface: a steel ring flush with the top and a cap standing proud of
 * it until enough weight presses it in (then it lights up): red, a green dome, a blue one with a
 * slot, or hazard stripes.
 */
export function drawGadgetButton(
  ctx: CanvasRenderingContext2D,
  g: ButtonGadget,
  state: GadgetState,
): void {
  const x: number = Math.round(g.x);
  const y: number = Math.round(g.y);
  pxRect(ctx, x, y, g.width, g.height, K);
  pxRect(ctx, x + 2, y + 2, g.width - 4, g.height - 4, PIXEL['steelDark']);
  pxRect(ctx, x + 2, y, g.width - 4, 2, PIXEL['steelHi']);
  const capX: number = x + 8;
  const capW: number = g.width - 16;
  const look: string = lookOf(g);
  const style: ButtonLook = BUTTON_LOOKS[look] ?? BUTTON_LOOKS['red'];
  if (state.on) {
    pxRect(ctx, capX, y, capW, 4, style.lit.dark);
    pxRect(ctx, capX, y, capW, 2, style.lit.hi);
    pxRect(ctx, capX + 2, y, 4, 2, PIXEL['white']);
    return;
  }
  // The cap stands well proud (inked round) so an unpressed button reads from across the screen.
  const cap: number = GAME_CONSTANTS.GADGET_BUTTON_CAP_PX;
  const tone: Ramp = style.cap;
  if (look === 'green') {
    // A dome: a narrower top on a wide skirt.
    pxRect(ctx, capX - 2, y - cap + 2, capW + 4, cap, K);
    pxRect(ctx, capX + 2, y - cap - 2, capW - 4, 6, K);
    pxBar(ctx, capX, y - cap + 4, capW, cap, tone.hi, tone.mid, tone.dark);
    pxRect(ctx, capX + 4, y - cap, capW - 8, 4, tone.mid);
    pxRect(ctx, capX + 4, y - cap, capW - 8, 2, tone.hi);
    pxRect(ctx, capX + 6, y - cap, 4, 2, PIXEL['white']);
    return;
  }
  pxRect(ctx, capX - 2, y - cap - 2, capW + 4, cap + 2, K);
  pxBar(ctx, capX, y - cap, capW, cap + 4, tone.hi, tone.mid, tone.dark);
  pxRect(ctx, capX + 2, y - cap + 2, 4, 2, PIXEL['white']);
  if (look === 'blue') {
    pxRect(ctx, capX + capW / 2 - 6, y - cap + 4, 12, 2, K);
  } else if (look === 'hazard') {
    for (let sx: number = capX + 2; sx < capX + capW - 4; sx += 8) {
      pxRect(ctx, sx + 2, y - cap + 4, 4, cap - 4, K);
    }
  }
}

/** A scale: its pan set into the surface, a post at its right end with a dial, and its load in kg. */
export function drawGadgetScale(
  ctx: CanvasRenderingContext2D,
  g: ScaleGadget,
  state: GadgetState,
): void {
  const look: string = lookOf(g);
  drawScalePan(ctx, g, state.on, look);
  const postX: number = g.x + g.width;
  const postTop: number = g.y - 96;
  drawScalePost(ctx, postX, postTop, g.y, g.y - 56, gaugeFraction(g, state), look);
  ctx.save();
  ctx.font = pixelFont(14);
  ctx.textAlign = 'center';
  const label: string = `${Math.round(state.kg)} / ${g.kg} kg`;
  fillOutlinedText(ctx, label, postX, postTop - 8, state.on ? PIXEL['toxicHi'] : PIXEL['goldHi']);
  ctx.restore();
}

/** A lever on a riveted base: its handle leans left when off, right (knob changed) when on. */
export function drawGadgetLever(
  ctx: CanvasRenderingContext2D,
  g: LeverGadget,
  state: GadgetState,
): void {
  const x: number = Math.round(g.x);
  const bottom: number = Math.round(g.y + g.height);
  const baseH: number = 8;
  const style: LeverLook = LEVER_LOOKS[lookOf(g)] ?? LEVER_LOOKS['steel'];
  const pivot: Point = { x: x + g.width / 2, y: bottom - baseH };
  const lean: number = state.on ? 0.6 : -0.6;
  const length: number = g.height - baseH - 4;
  const tip: Point = {
    x: Math.round(pivot.x + Math.sin(lean) * length),
    y: Math.round(pivot.y - Math.cos(lean) * length),
  };
  pxLine(ctx, pivot.x, pivot.y, tip.x, tip.y, K, 6);
  pxLine(ctx, pivot.x, pivot.y, tip.x, tip.y, style.handle, 2);
  const knob: number = style.knob;
  pxRect(ctx, tip.x - knob, tip.y - knob, 2 * knob, 2 * knob, K);
  pxRect(
    ctx,
    tip.x - knob + 2,
    tip.y - knob + 2,
    2 * knob - 4,
    2 * knob - 4,
    state.on ? style.knobOn : style.knobOff,
  );
  pxBar(ctx, x - 4, bottom - baseH, g.width + 8, baseH, style.base.hi, style.base.mid, style.base.dark);
  pxRivet(ctx, x - 2, bottom - baseH + 2);
  pxRivet(ctx, x + g.width, bottom - baseH + 2);
}

/**
 * A slingshot base: a wooden cradle filling its box, a leather pouch across its top (the walkable
 * top, it sinks as it winds and kicks up on release) on rubber bands, and chevrons on its face
 * pointing where it throws.
 */
export function drawGadgetSlingshot(
  ctx: CanvasRenderingContext2D,
  g: SlingshotGadget,
  padOffset: number,
): void {
  const x: number = Math.round(g.x);
  const y: number = Math.round(g.y);
  const w: number = g.width;
  const h: number = g.height;
  const style: SlingshotLook = SLINGSHOT_LOOKS[lookOf(g)] ?? SLINGSHOT_LOOKS['wood'];
  const pouchY: number = Math.round((y + padOffset) / ART_PX) * ART_PX;
  pxBar(ctx, x, y + 6, w, h - 6, style.cradle.hi, style.cradle.mid, style.cradle.dark);
  // Bands from the cradle's ends up to the pouch.
  pxLine(ctx, x + 4, y + 8, x + 12, pouchY + 2, K, 4);
  pxLine(ctx, x + w - 4, y + 8, x + w - 12, pouchY + 2, K, 4);
  pxBar(ctx, x + 8, pouchY, w - 16, 6, style.pouch.hi, style.pouch.mid, style.pouch.dark);
  // An arrow painted on its face, pointing where it throws.
  const a: number = (g.angle * Math.PI) / 180;
  const cx: number = x + w / 2;
  const cy: number = y + 6 + (h - 6) / 2;
  const reach: number = 7;
  const tip: { x: number; y: number } = {
    x: cx + Math.cos(a) * reach,
    y: cy - Math.sin(a) * reach,
  };
  const tail: { x: number; y: number } = {
    x: cx - Math.cos(a) * reach,
    y: cy + Math.sin(a) * reach,
  };
  const barb: (turn: number) => { x: number; y: number } = (
    turn: number,
  ): { x: number; y: number } => ({
    x: tip.x - Math.cos(a + turn) * 6,
    y: tip.y + Math.sin(a + turn) * 6,
  });
  const strokes: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
    [tail, tip],
    [barb(0.6), tip],
    [barb(-0.6), tip],
  ];
  for (const [from, to] of strokes) pxLine(ctx, from.x, from.y, to.x, to.y, K, 6);
  for (const [from, to] of strokes) pxLine(ctx, from.x, from.y, to.x, to.y, style.arrow, 2);
}

/** The stretch of a door that blocks the way, `top`..`foot`: what its look hangs there. */
function drawDoorLeaf(
  ctx: CanvasRenderingContext2D,
  look: string,
  x: number,
  top: number,
  w: number,
  foot: number,
): void {
  pxRect(ctx, x, top, w, foot - top, K);
  if (look === 'planks') drawPlanksLeaf(ctx, x, top, w, foot);
  else if (look === 'portcullis') drawPortcullisLeaf(ctx, x, top, w, foot);
  else if (look === 'hazard') drawHazardLeaf(ctx, x, top, w, foot);
  else drawShutterLeaf(ctx, x, top, w, foot);
}

/** A slatted steel shutter with a hazard-striped foot. */
function drawShutterLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  w: number,
  bottom: number,
): void {
  for (let sy: number = top; sy < bottom - 2; sy += 8) {
    pxRect(ctx, x + 2, sy, w - 4, Math.min(6, bottom - 2 - sy), PIXEL['steel']);
    pxRect(ctx, x + 2, sy, w - 4, 2, PIXEL['steelHi']);
  }
  const foot: number = Math.max(top, bottom - 6);
  for (let fx: number = x + 2; fx < x + w - 2; fx += 4) {
    const stripe: boolean = Math.floor((fx - x) / 4) % 2 === 0;
    pxRect(ctx, fx, foot, Math.min(4, x + w - 2 - fx), bottom - 2 - foot, stripe ? PIXEL['gold'] : K);
  }
}

/** Upright boards held by iron straps; everything hangs from the foot, so it rises as one. */
function drawPlanksLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  w: number,
  foot: number,
): void {
  for (let bx: number = x + 2; bx < x + w - 2; bx += 8) {
    const wide: number = Math.min(6, x + w - 2 - bx);
    pxRect(ctx, bx, top, wide, foot - top - 2, PIXEL['wood']);
    pxRect(ctx, bx, top, 2, foot - top - 2, PIXEL['woodHi']);
  }
  for (let sy: number = foot - 12; sy >= top; sy -= 40) {
    pxRect(ctx, x + 2, sy, w - 4, 6, K);
    pxRect(ctx, x + 2, sy + 2, w - 4, 2, PIXEL['steelHi']);
    pxRivet(ctx, x + 4, sy + 2);
    pxRivet(ctx, x + w - 6, sy + 2);
  }
}

/** A gate of iron bars and cross rails over the dark, spiked at its foot. */
function drawPortcullisLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  w: number,
  foot: number,
): void {
  pxRect(ctx, x + 2, top, w - 4, foot - top - 2, PIXEL['ink2']);
  for (let sy: number = foot - 16; sy >= top; sy -= 24) {
    pxRect(ctx, x + 2, sy, w - 4, 6, K);
    pxRect(ctx, x + 2, sy + 2, w - 4, 2, PIXEL['steel']);
  }
  for (let bx: number = x + 4; bx < x + w - 4; bx += 8) {
    pxRect(ctx, bx, top, 4, foot - top, K);
    pxRect(ctx, bx, top, 2, foot - top - 2, PIXEL['steelHi']);
    pxRect(ctx, bx + 2, top, 2, foot - top - 2, PIXEL['steel']);
    pxRect(ctx, bx, foot - 4, 2, 2, PIXEL['steelLight']);
  }
}

/** A blast door painted in hazard chevrons from the foot up. */
function drawHazardLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  w: number,
  foot: number,
): void {
  const middle: number = x + w / 2;
  for (let sy: number = foot - 4; sy >= top; sy -= ART_PX) {
    for (let sx: number = x + 2; sx < x + w - 2; sx += ART_PX) {
      const chevron: number = foot - sy + Math.abs(sx - middle);
      const color: string = Math.floor(chevron / 12) % 2 === 0 ? PIXEL['gold'] : PIXEL['ink2'];
      pxRect(ctx, sx, sy, ART_PX, ART_PX, color);
    }
  }
}

/**
 * A door: a housing on top (always solid) and below it a leaf that rises into the housing as it
 * opens: a slatted shutter, boards, a portcullis or a hazard-painted blast door. Fills exactly its
 * solid box.
 */
export function drawGadgetDoor(
  ctx: CanvasRenderingContext2D,
  g: DoorGadget,
  state: GadgetState,
): void {
  if (g.exit) {
    // An exit door says so: lit once it stands open.
    ctx.save();
    ctx.font = pixelFont(14);
    ctx.textAlign = 'center';
    const open: boolean = state.openTicks >= GAME_CONSTANTS.GADGET_DOOR_TICKS;
    fillOutlinedText(
      ctx,
      'EXIT',
      g.x + g.width / 2,
      g.y - 8,
      open ? PIXEL['toxicHi'] : PIXEL['boneDim'],
    );
    ctx.restore();
  }
  const solid: Box = doorSolid(g, state);
  const x: number = Math.round(g.x);
  const y: number = Math.round(g.y);
  const lintel: number = Math.min(g.height, GAME_CONSTANTS.GADGET_DOOR_LINTEL_PX);
  const bottom: number = Math.round(solid.y + solid.height);
  // The doorway behind the shutter (scenery): dark, lit teal in an open exit door; frame posts down
  // its sides so an open door still reads as a door.
  const foot: number = Math.round(g.y + g.height);
  const open: boolean = state.openTicks >= GAME_CONSTANTS.GADGET_DOOR_TICKS;
  pxRect(
    ctx,
    x,
    y + lintel,
    g.width,
    foot - y - lintel,
    g.exit && open ? PIXEL['tealDark'] : PIXEL['ink2'],
  );
  if (g.exit && open) pxRect(ctx, x + 4, y + lintel, g.width - 8, 2, PIXEL['teal']);
  pxRect(ctx, x, y + lintel, 4, foot - y - lintel, K);
  pxRect(ctx, x + 2, y + lintel, 2, foot - y - lintel, PIXEL['steelDark']);
  pxRect(ctx, x + g.width - 4, y + lintel, 4, foot - y - lintel, K);
  const look: string = lookOf(g);
  if (bottom > y + lintel) drawDoorLeaf(ctx, look, x, y + lintel, g.width, bottom);
  const housing: Ramp = DOOR_LOOKS[look] ?? DOOR_LOOKS['shutter'];
  pxBar(ctx, x, y, g.width, lintel, housing.hi, housing.mid, housing.dark);
  pxRivet(ctx, x + 2, y + 2);
  pxRivet(ctx, x + g.width - 4, y + 2);
}

/** How thick a slope's deck is drawn under its walkable line (scenery below: you pass under it). */
const SLOPE_DECK_PX: number = 16;
/** Its struts stand this far apart, from the deck down to the floor (or whatever is under them)... */
const SLOPE_STRUT_SPACING_PX: number = 48;
/** ...the end ones this far in from the slope's ends. */
const SLOPE_STRUT_INSET_PX: number = 8;

/**
 * Where a slope's strut at x, hanging from `from`, stands: the top of the highest fixed thing under
 * it (a platform or wall; not a prop or a gadget, which can move), else the ground.
 */
function strutFoot(platforms: Platform[], x: number, from: number): number {
  let foot: number = GAME_CONSTANTS.GROUND_Y;
  for (const p of platforms) {
    if (p.propId !== undefined || p.gadgetId !== undefined) continue;
    if (x < p.x || x > p.x + p.width || p.y < from) continue;
    foot = Math.min(foot, p.y);
  }
  return foot;
}

/**
 * A slope: a riveted steel deck stepped on the art grid whose top row is the walkable line, on
 * thin struts down to the box's foot (scenery: one-way like a platform, you walk under it).
 */
/** Where a wheel's spoke tip sits per quarter turn (px from its hub). */
const BIN_SPOKE: readonly (readonly [number, number])[] = [
  [4, 0],
  [0, 4],
  [-4, 0],
  [0, -4],
];

/** A rolling bin filling `box`, in `look`: steel lid (its flat top is walkable), ribbed body, two wheels turned by `angle`. */
export function drawBin(ctx: CanvasRenderingContext2D, box: Box, angle: number, look: string): void {
  const paint: Ramp = BIN_LOOKS[look] ?? BIN_LOOKS['teal'];
  const x: number = Math.round(box.x);
  const y: number = Math.round(box.y);
  const w: number = box.width;
  const h: number = box.height;
  const wheelR: number = 7;
  const wheelY: number = y + h - wheelR;
  pxRect(ctx, x + 6, wheelY - 4, w - 12, 4, PIXEL['steelDark']);
  pxBar(ctx, x + 2, y + 8, w - 4, h - 16, paint.hi, paint.mid, paint.dark);
  for (let rib: number = x + 10; rib < x + w - 6; rib += 10) {
    pxRect(ctx, rib, y + 14, ART_PX, h - 26, paint.dark);
  }
  pxRect(ctx, x + 12, y + 24, 8, ART_PX, PIXEL['rustDark']);
  pxRect(ctx, x + 30, y + 18, 6, ART_PX, PIXEL['ink']);
  pxBar(ctx, x, y, w, 10, PIXEL['steelLight'], PIXEL['steelHi'], PIXEL['steelDark']);
  pxRect(ctx, x + w / 2 - 6, y + 4, 12, ART_PX, PIXEL['steelDark']);
  const quarter: number = Math.PI / 2;
  const turn: number = ((Math.round(angle / quarter) % 4) + 4) % 4;
  const [sx, sy]: readonly [number, number] = BIN_SPOKE[turn];
  for (const cx of [x + 10, x + w - 10]) {
    pxDisc(ctx, cx, wheelY, wheelR, K);
    pxDisc(ctx, cx, wheelY, wheelR - 2, PIXEL['steel']);
    pxRect(ctx, cx - 1 + sx, wheelY - 1 + sy, ART_PX, ART_PX, PIXEL['steelLight']);
    pxRect(ctx, cx - 1 - sx, wheelY - 1 - sy, ART_PX, ART_PX, PIXEL['steelDark']);
    pxRect(ctx, cx - 1, wheelY - 1, ART_PX, ART_PX, PIXEL['ink']);
  }
}

export function drawGadgetSlope(
  ctx: CanvasRenderingContext2D,
  g: SlopeGadget,
  platforms: Platform[],
): void {
  const s: SlopeSurface = slopeSurface(g);
  const style: SlopeLook = SLOPE_LOOKS[lookOf(g)] ?? SLOPE_LOOKS['steel'];
  // Struts near both ends and every SLOPE_STRUT_SPACING_PX between, each down to what is under it.
  const xs: number[] = [g.x + SLOPE_STRUT_INSET_PX];
  for (
    let x: number = xs[0] + SLOPE_STRUT_SPACING_PX;
    x < g.x + g.width - SLOPE_STRUT_INSET_PX;
    x += SLOPE_STRUT_SPACING_PX
  ) {
    xs.push(x);
  }
  xs.push(g.x + g.width - SLOPE_STRUT_INSET_PX);
  for (const x of xs) {
    const top: number | null = slopeY(s, x);
    if (top === null) continue;
    const from: number = top + SLOPE_DECK_PX;
    const foot: number = strutFoot(platforms, x, from);
    if (foot <= from) continue;
    pxRect(ctx, x - 2, from, 4, foot - from, K);
    pxRect(ctx, x - 2, from, 2, foot - from, style.strut);
  }
  for (let x: number = g.x; x < g.x + g.width; x += ART_PX) {
    const top: number | null = slopeY(s, x + ART_PX / 2);
    if (top === null) continue;
    const y: number = Math.round(top / ART_PX) * ART_PX;
    pxRect(ctx, x, y, ART_PX, SLOPE_DECK_PX, K);
    const along: number = Math.round(x - g.x);
    pxRect(ctx, x, y + ART_PX, ART_PX, SLOPE_DECK_PX - 2 * ART_PX, style.deck(along));
    pxRect(ctx, x, y, ART_PX, ART_PX, style.top);
    if (style.stud && along % 16 === 8) pxRect(ctx, x, y + 6, ART_PX, ART_PX, style.stud);
  }
}

/**
 * A cage: hanging on a chain from the ceiling and covered (nobody sees what it hides); falling
 * with its torn chain; landed, open and bare. A smashed one is gone (its debris is an effect).
 */
export function drawGadgetCage(
  ctx: CanvasRenderingContext2D,
  g: CageGadget,
  state: GadgetState,
): void {
  if (state.landed && state.broken) return;
  const box: Box = cageBox(g, state);
  const cx: number = box.x + box.width / 2;
  if (!state.dropped) {
    drawChain(ctx, [
      { x: cx, y: 0 },
      { x: cx, y: box.y },
    ]);
  }
  drawCageArt(ctx, box, !state.landed, lookOf(g));
}

/** A wire's dots (scenery), dim steel when off, lit orange while it carries the signal. */
export function drawWireDots(ctx: CanvasRenderingContext2D, dots: Point[], on: boolean): void {
  for (const d of dots) {
    pxRect(ctx, d.x - 2, d.y - 2, 4, 4, K);
    pxRect(ctx, d.x - 1, d.y - 1, 2, 2, on ? PIXEL['rustHi'] : PIXEL['steelHi']);
  }
}

/** The editor's aim of a spring or slingshot: where a boulder it throws flies (dots), and its power. */
export function drawFlightPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  label: string,
): void {
  points.forEach((p: Point, i: number): void => {
    if (i % 3 === 0) pxRect(ctx, p.x - 2, p.y - 2, 4, 4, PIXEL['goldHi']);
  });
  const end: Point | undefined = points[points.length - 1];
  if (!end) return;
  ctx.save();
  ctx.font = pixelFont(12);
  ctx.textAlign = 'center';
  fillOutlinedText(ctx, label, end.x, end.y - 8, CANVAS_BONE);
  ctx.restore();
}

/**
 * Every gadget of a designed floor where its state says, boulders last (on top): cracked walls,
 * doors, buttons, scales, levers, springs and slingshots, then the boulders rolling or at rest.
 */
export function drawGadgets(
  ctx: CanvasRenderingContext2D,
  gadgets: Gadget[],
  states: GadgetState[],
  platforms: Platform[],
): void {
  for (const g of gadgets) {
    const state: GadgetState | undefined = stateOf(states, g.id);
    if (!state) continue;
    switch (g.kind) {
      case 'crack-wall':
        drawCrackWall(ctx, g, state);
        break;
      case 'door':
        drawGadgetDoor(ctx, g, state);
        break;
      case 'button':
        drawGadgetButton(ctx, g, state);
        break;
      case 'scale':
        drawGadgetScale(ctx, g, state);
        break;
      case 'lever':
        drawGadgetLever(ctx, g, state);
        break;
      case 'spring':
        drawSpringBlock(ctx, g, padOffset(state), lookOf(g));
        break;
      case 'slingshot':
        drawGadgetSlingshot(ctx, g, padOffset(state));
        break;
      case 'slope':
        drawGadgetSlope(ctx, g, platforms);
        break;
      case 'cage':
        drawGadgetCage(ctx, g, state);
        break;
      case 'boulder':
      case 'bin':
        break;
    }
  }
  for (const g of gadgets) {
    const body: GadgetBody | null | undefined = stateOf(states, g.id)?.body;
    if (!body) continue;
    if (g.kind === 'boulder') drawBoulder(ctx, boulderBox(body), body.angle, lookOf(g));
    else if (g.kind === 'bin') drawBin(ctx, boulderBox(body), body.angle, lookOf(g));
  }
}

/** Every wire's dots, from each source to its targets (`exit` for the floor's exit). */
export function drawGadgetWires(
  ctx: CanvasRenderingContext2D,
  gadgets: Gadget[],
  states: GadgetState[],
  exit: Box,
): void {
  for (const w of wires(gadgets)) {
    const to: Box | undefined =
      w.to === EXIT_TARGET ? exit : gadgets.find((g: Gadget): boolean => g.id === w.to);
    // A hidden exit hangs far above the screen: no wire runs up there.
    if (!to || to.y + to.height < 0) continue;
    const dots: Point[] = dotsAlong(
      wirePath(w.from, to),
      GAME_CONSTANTS.GADGET_WIRE_DOT_SPACING_PX,
    );
    drawWireDots(ctx, dots, stateOf(states, w.from.id)?.on === true);
  }
}
