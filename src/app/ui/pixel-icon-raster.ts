import type { PixelIconId } from '@shared/pixel-icon';
import { PIXEL_ICONS, PixelIconDef } from './pixel-icons';

const canvasCache: Map<PixelIconId, HTMLCanvasElement> = new Map<PixelIconId, HTMLCanvasElement>();
const dataUrlCache: Map<PixelIconId, string> = new Map<PixelIconId, string>();

/** The icon rasterised once at 1 canvas pixel per grid cell; cached per id. */
export function getPixelIconCanvas(id: PixelIconId): HTMLCanvasElement {
  const cached: HTMLCanvasElement | undefined = canvasCache.get(id);
  if (cached) {
    return cached;
  }
  const def: PixelIconDef = PIXEL_ICONS[id];
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = def.rows[0].length;
  canvas.height = def.rows.length;
  const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
  if (ctx) {
    def.rows.forEach((row: string, y: number): void => {
      for (let x: number = 0; x < row.length; x++) {
        const key: string = row[x];
        if (key !== '.') {
          ctx.fillStyle = def.palette[key];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });
  }
  canvasCache.set(id, canvas);
  return canvas;
}

/** PNG data URL of the 1x icon (for `<img>`); cached per id. */
export function getPixelIconDataUrl(id: PixelIconId): string {
  const cached: string | undefined = dataUrlCache.get(id);
  if (cached) {
    return cached;
  }
  const url: string = getPixelIconCanvas(id).toDataURL('image/png');
  dataUrlCache.set(id, url);
  return url;
}

/** Draws the icon with its top-left corner at (x, y), scaled to size x size without smoothing. */
export function drawPixelIcon(
  ctx: CanvasRenderingContext2D,
  id: PixelIconId,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(getPixelIconCanvas(id), x, y, size, size);
  ctx.restore();
}
