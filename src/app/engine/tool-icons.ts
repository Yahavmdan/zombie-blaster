import { GAME_CONSTANTS } from '@shared/index';
import { GadgetState } from '@shared/game-entities';
import { Box } from './boulder-puzzle';
import { Gadget } from './engine-types';
import { drawGadgets } from './gadget-art';
import { newGadgetState } from './gadgets';
import { EditorTool } from './level-editor';
import {
  PROP_ART,
  PropArt,
  RAIL_ART,
  SinglePropKind,
  propArtHeight,
  propArtWidth,
} from './level-generator';
import { ART_PX, PIXEL, pxBar, pxLine, pxRect, pxRivet } from './pixel-art';
import { drawScalePan, drawScalePost } from './puzzle-art';

/**
 * Pictures for the level editor's tool buttons: each thing drawn with its own art at its own
 * size, then shrunk (pixels kept square) into the button. Props are their map images.
 */

const K: string = PIXEL['ink'];
const TILE: number = GAME_CONSTANTS.LEVEL_TILE_PX;
/** Room left around the picture inside the button canvas. */
const PAD_PX: number = 2;

/** A thing's art drawn at its natural size on a canvas of `w` x `h`. */
function scene(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
  }
  return canvas;
}

function gadgetScene(
  w: number,
  h: number,
  g: Gadget,
  state?: Partial<GadgetState>,
): HTMLCanvasElement {
  const s: GadgetState = { ...newGadgetState(g.id, null), ...state };
  if (g.kind === 'boulder')
    s.body = { x: g.x, y: g.y, velocityX: 0, velocityY: 0, isGrounded: true, angle: 0 };
  // The scene's foot is its floor (a slope's struts stand on it).
  return scene(w, h, (ctx: CanvasRenderingContext2D): void =>
    drawGadgets(ctx, [g], [s], [{ x: 0, y: h, width: w, height: 1 }]),
  );
}

/** A strip of steel floor under something that stands or is set into it. */
function floorStrip(ctx: CanvasRenderingContext2D, y: number, w: number): void {
  pxBar(ctx, 0, y, w, 12, PIXEL['steelHi'], PIXEL['steel'], PIXEL['steelDark']);
}

function cursorScene(): HTMLCanvasElement {
  return scene(24, 32, (ctx: CanvasRenderingContext2D): void => {
    for (let row: number = 0; row < 12; row++) {
      pxRect(ctx, 2, 2 + row * ART_PX, (row + 1) * ART_PX, ART_PX, K);
      if (row > 0 && row < 11)
        pxRect(ctx, 4, 2 + row * ART_PX, (row - 1) * ART_PX, ART_PX, PIXEL['white']);
    }
    pxLine(ctx, 10, 22, 16, 30, K, 4);
  });
}

function eraseScene(): HTMLCanvasElement {
  return scene(32, 32, (ctx: CanvasRenderingContext2D): void => {
    pxLine(ctx, 6, 6, 26, 26, K, 8);
    pxLine(ctx, 26, 6, 6, 26, K, 8);
    pxLine(ctx, 6, 6, 26, 26, PIXEL['bloodHi'], 4);
    pxLine(ctx, 26, 6, 6, 26, PIXEL['bloodHi'], 4);
  });
}

function linkScene(): HTMLCanvasElement {
  return scene(48, 32, (ctx: CanvasRenderingContext2D): void => {
    pxBar(ctx, 2, 20, 12, 10, PIXEL['bloodHi'], PIXEL['blood'], PIXEL['bloodDark']);
    pxBar(ctx, 34, 4, 12, 26, PIXEL['steelHi'], PIXEL['steel'], PIXEL['steelDark']);
    for (let x: number = 16; x < 34; x += 6) pxRect(ctx, x, 24, 4, 4, PIXEL['rustHi']);
  });
}

function platformScene(safe: boolean): HTMLCanvasElement {
  const h: number = safe ? 48 : 24;
  return scene(96, h, (ctx: CanvasRenderingContext2D): void => {
    const y: number = h - 20;
    pxBar(ctx, 0, y, 96, 20, PIXEL['steelLight'], PIXEL['steelHi'], PIXEL['steelDark']);
    for (let x: number = 6; x < 96; x += 16) pxRivet(ctx, x, y + 6);
    if (safe) {
      pxRect(ctx, 16, 8, 4, y - 8, K);
      pxBar(ctx, 10, 6, 16, 14, PIXEL['goldHi'], PIXEL['gold'], PIXEL['goldDark']);
    }
  });
}

function ladderScene(): HTMLCanvasElement {
  return scene(28, 64, (ctx: CanvasRenderingContext2D): void => {
    pxRect(ctx, 2, 0, 6, 64, K);
    pxRect(ctx, 20, 0, 6, 64, K);
    pxRect(ctx, 4, 0, 2, 64, PIXEL['woodHi']);
    pxRect(ctx, 22, 0, 2, 64, PIXEL['woodHi']);
    for (let y: number = 6; y < 64; y += 12)
      pxBar(ctx, 2, y, 24, 6, PIXEL['woodHi'], PIXEL['wood'], PIXEL['woodDark']);
  });
}

function wallScene(): HTMLCanvasElement {
  return scene(2 * TILE, 3 * TILE, (ctx: CanvasRenderingContext2D): void => {
    for (let y: number = 0; y < 3 * TILE; y += TILE) {
      for (let x: number = 0; x < 2 * TILE; x += TILE) {
        pxBar(ctx, x, y, TILE, TILE, PIXEL['steelLight'], PIXEL['steelHi'], PIXEL['steelDark']);
        pxRivet(ctx, x + 4, y + 4);
      }
    }
  });
}

function exitScene(): HTMLCanvasElement {
  return scene(80, 56, (ctx: CanvasRenderingContext2D): void => {
    pxBar(ctx, 0, 40, 80, 16, PIXEL['steelLight'], PIXEL['steelHi'], PIXEL['steelDark']);
    for (let i: number = 0; i < 3; i++) {
      const y: number = 28 - i * 12;
      pxLine(ctx, 40, y, 32, y + 8, PIXEL['tealHi'], 4);
      pxLine(ctx, 40, y, 48, y + 8, PIXEL['tealHi'], 4);
    }
  });
}

function propScene(art: PropArt, then: () => void): HTMLCanvasElement {
  const w: number = propArtWidth(art);
  const h: number = propArtHeight(art);
  const canvas: HTMLCanvasElement = scene(w, h, (): void => undefined);
  const img: HTMLImageElement = new Image();
  img.onload = (): void => {
    canvas.getContext('2d')?.drawImage(img, -art.left, -art.top);
    then();
  };
  img.src = art.src;
  return canvas;
}

/** The thing a tool makes (or does), drawn at its natural size; `then` redraws once an image loaded. */
function toolScene(tool: EditorTool, then: () => void): HTMLCanvasElement {
  const ground: number = 40;
  switch (tool) {
    case 'select':
      return cursorScene();
    case 'erase':
      return eraseScene();
    case 'link':
      return linkScene();
    case 'platform':
      return platformScene(false);
    case 'safe-spot':
      return platformScene(true);
    case 'ladder':
      return ladderScene();
    case 'wall':
      return wallScene();
    case 'exit':
      return exitScene();
    case 'rail':
      return propScene(RAIL_ART.middle, then);
    case 'boulder':
      return gadgetScene(48, 48, {
        id: 'g1',
        kind: 'boulder',
        kg: 600,
        x: 0,
        y: 0,
        width: 48,
        height: 48,
      });
    case 'crack-wall':
      return gadgetScene(
        64,
        128,
        {
          id: 'g1',
          kind: 'crack-wall',
          x: 0,
          y: 0,
          width: 64,
          height: 128,
          crackTop: 64,
          crackBottom: 128,
        },
        { hits: 2 },
      );
    case 'button':
      return scene(64, ground + 12, (ctx: CanvasRenderingContext2D): void => {
        floorStrip(ctx, ground, 64);
        drawGadgets(
          ctx,
          [
            {
              id: 'g1',
              kind: 'button',
              x: 8,
              y: ground,
              width: 48,
              height: 6,
              kg: 60,
              targets: [],
            },
          ],
          [newGadgetState('g1', null)],
          [],
        );
      });
    case 'scale':
      return scene(112, 112, (ctx: CanvasRenderingContext2D): void => {
        floorStrip(ctx, 100, 112);
        drawScalePan(ctx, { x: 4, y: 100, width: 96, height: 8 }, false);
        drawScalePost(ctx, 100, 4, 100, 44, 0.4);
      });
    case 'lever':
      return gadgetScene(32, 32, {
        id: 'g1',
        kind: 'lever',
        x: 8,
        y: 0,
        width: 16,
        height: 32,
        targets: [],
        startsOn: false,
      });
    case 'spring':
      return gadgetScene(64, 32, {
        id: 'g1',
        kind: 'spring',
        x: 0,
        y: 0,
        width: 64,
        height: 32,
        power: 18,
      });
    case 'slingshot':
      return gadgetScene(64, 24, {
        id: 'g1',
        kind: 'slingshot',
        x: 0,
        y: 0,
        width: 64,
        height: 24,
        power: 16,
        angle: 60,
      });
    case 'door':
      return gadgetScene(32, 128, {
        id: 'g1',
        kind: 'door',
        x: 0,
        y: 0,
        width: 32,
        height: 128,
        latch: false,
        exit: false,
      });
    case 'slope':
      return gadgetScene(128, 72, {
        id: 'g1',
        kind: 'slope',
        x: 0,
        y: 4,
        width: 128,
        height: 64,
        risesRight: true,
      });
    case 'cage':
      return gadgetScene(64, 96, {
        id: 'g1',
        kind: 'cage',
        x: 0,
        y: 32,
        width: 64,
        height: 64,
        content: 'empty',
        zombies: 0,
        gold: 0,
        smashes: false,
      });
    default:
      return propScene(PROP_ART[tool as SinglePropKind], then);
  }
}

/** Fits a picture into `canvas`, centred, scaled by whole steps where it can (square pixels). */
function fit(canvas: HTMLCanvasElement, art: HTMLCanvasElement): void {
  const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const room: number = canvas.width - 2 * PAD_PX;
  const raw: number = Math.min(room / art.width, room / art.height);
  const scale: number = raw >= 1 ? Math.floor(raw) : raw;
  const w: number = Math.round(art.width * scale);
  const h: number = Math.round(art.height * scale);
  const box: Box = {
    x: Math.round((canvas.width - w) / 2),
    y: Math.round((canvas.height - h) / 2),
    width: w,
    height: h,
  };
  ctx.drawImage(art, box.x, box.y, box.width, box.height);
}

/** Draws the picture of what `tool` places (or does) into a tool button's canvas. */
export function drawToolIcon(canvas: HTMLCanvasElement, tool: EditorTool): void {
  const art: HTMLCanvasElement = toolScene(tool, (): void => fit(canvas, art));
  fit(canvas, art);
}
