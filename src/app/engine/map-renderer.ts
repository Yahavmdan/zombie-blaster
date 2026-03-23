import { GAME_CONSTANTS } from '@shared/index';

interface PlatformRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TileBlock {
  tl: number;
  tc: number;
  tr: number;
  ml: number;
  mc: number;
  mr: number;
  bl: number;
  bc: number;
  br: number;
}

interface MapDecoration {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const TILE_SIZE: number = 32;

const GROUND_BLOCK: TileBlock = {
  tl: 55, tc: 56, tr: 57,
  ml: 64, mc: 65, mr: 66,
  bl: 73, bc: 74, br: 75,
};

const PLATFORM_BLOCK: TileBlock = {
  tl: 4, tc: 5, tr: 6,
  ml: 64, mc: 65, mr: 66,
  bl: 73, bc: 74, br: 75,
};

const BG_LAYER_PATHS: string[] = [
  'tiles/backgrounds/1.png',
  'tiles/backgrounds/2.png',
  'tiles/backgrounds/3.png',
  'tiles/backgrounds/4.png',
  'tiles/backgrounds/5.png',
];

const MAP_DECORATIONS: MapDecoration[] = [
  { src: 'tiles/objects/Barrel1.png', x: 30, y: 588, width: 32, height: 32 },
  { src: 'tiles/objects/Barrel2.png', x: 60, y: 588, width: 32, height: 32 },
  { src: 'tiles/objects/Box1.png', x: 1180, y: 588, width: 32, height: 32 },
  { src: 'tiles/objects/Box2.png', x: 1212, y: 588, width: 32, height: 32 },
  { src: 'tiles/objects/Box3.png', x: 1196, y: 556, width: 32, height: 32 },
  { src: 'tiles/objects/Fence1.png', x: 350, y: 588, width: 32, height: 32 },
  { src: 'tiles/objects/Fence2.png', x: 750, y: 588, width: 32, height: 32 },
  { src: 'tiles/objects/Fence3.png', x: 600, y: 588, width: 32, height: 32 },
  { src: 'tiles/objects/Barrel3.png', x: 480, y: 398, width: 32, height: 32 },
  { src: 'tiles/objects/Box1.png', x: 135, y: 498, width: 32, height: 32 },
  { src: 'tiles/objects/Box2.png', x: 960, y: 498, width: 32, height: 32 },
  { src: 'tiles/objects/Locker1.png', x: 1100, y: 556, width: 32, height: 64 },
  { src: 'tiles/objects/Locker2.png', x: 1130, y: 556, width: 32, height: 64 },
  { src: 'tiles/objects/Barrel1.png', x: 870, y: 308, width: 32, height: 32 },
  { src: 'tiles/objects/Box1.png', x: 200, y: 298, width: 32, height: 32 },
  { src: 'tiles/objects/Ladder1.png', x: 178, y: 330, width: 32, height: 64 },
  { src: 'tiles/objects/Ladder1.png', x: 178, y: 394, width: 32, height: 64 },
  { src: 'tiles/objects/Ladder1.png', x: 178, y: 458, width: 32, height: 64 },
  { src: 'tiles/objects/Ladder1.png', x: 898, y: 340, width: 32, height: 64 },
  { src: 'tiles/objects/Ladder1.png', x: 898, y: 404, width: 32, height: 64 },
  { src: 'tiles/objects/Ladder1.png', x: 898, y: 468, width: 32, height: 64 },
  { src: 'tiles/objects/Ladder1.png', x: 548, y: 430, width: 32, height: 64 },
  { src: 'tiles/objects/Ladder1.png', x: 548, y: 494, width: 32, height: 64 },
  { src: 'tiles/objects/Ladder1.png', x: 548, y: 558, width: 32, height: 64 },
];

export class MapRenderer {
  private tileImages: Map<number, HTMLImageElement> = new Map();
  private bgLayers: HTMLImageElement[] = [];
  private decorImages: Map<string, HTMLImageElement> = new Map();
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private loaded: boolean = false;
  private loadCount: number = 0;
  private totalCount: number = 0;

  load(): void {
    const tileIds: Set<number> = new Set<number>();
    this.collectBlockTiles(GROUND_BLOCK, tileIds);
    this.collectBlockTiles(PLATFORM_BLOCK, tileIds);

    const decorSrcs: Set<string> = new Set<string>(
      MAP_DECORATIONS.map((d: MapDecoration) => d.src),
    );

    this.totalCount = tileIds.size + BG_LAYER_PATHS.length + decorSrcs.size;

    for (const id of tileIds) {
      const img: HTMLImageElement = new Image();
      const paddedId: string = String(id).padStart(2, '0');
      img.src = `tiles/ground/IndustrialTile_${paddedId}.png`;
      img.onload = (): void => this.onAssetLoaded();
      this.tileImages.set(id, img);
    }

    for (const path of BG_LAYER_PATHS) {
      const img: HTMLImageElement = new Image();
      img.src = path;
      img.onload = (): void => this.onAssetLoaded();
      this.bgLayers.push(img);
    }

    for (const src of decorSrcs) {
      const img: HTMLImageElement = new Image();
      img.src = src;
      img.onload = (): void => this.onAssetLoaded();
      this.decorImages.set(src, img);
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  private onAssetLoaded(): void {
    this.loadCount++;
    if (this.loadCount >= this.totalCount) {
      this.loaded = true;
      this.composeMap();
    }
  }

  private collectBlockTiles(block: TileBlock, ids: Set<number>): void {
    ids.add(block.tl);
    ids.add(block.tc);
    ids.add(block.tr);
    ids.add(block.ml);
    ids.add(block.mc);
    ids.add(block.mr);
    ids.add(block.bl);
    ids.add(block.bc);
    ids.add(block.br);
  }

  private composeMap(): void {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = GAME_CONSTANTS.CANVAS_WIDTH;
    this.offscreenCanvas.height = GAME_CONSTANTS.CANVAS_HEIGHT;
    const ctx: CanvasRenderingContext2D = this.offscreenCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    this.drawBackground(ctx);
    this.drawGroundTiles(ctx);
    this.drawPlatformTiles(ctx);
    this.drawDecorations(ctx);
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const w: number = GAME_CONSTANTS.CANVAS_WIDTH;
    const h: number = GAME_CONSTANTS.CANVAS_HEIGHT;

    for (const layer of this.bgLayers) {
      ctx.drawImage(layer, 0, 0, w, h);
    }

    ctx.fillStyle = 'rgba(0, 0, 20, 0.35)';
    ctx.fillRect(0, 0, w, h);
  }

  private drawGroundTiles(ctx: CanvasRenderingContext2D): void {
    const groundY: number = GAME_CONSTANTS.GROUND_Y;
    const groundHeight: number = GAME_CONSTANTS.CANVAS_HEIGHT - groundY;
    const canvasW: number = GAME_CONSTANTS.CANVAS_WIDTH;
    const cols: number = Math.ceil(canvasW / TILE_SIZE);
    const rows: number = Math.ceil(groundHeight / TILE_SIZE) + 1;

    for (let row: number = 0; row < rows; row++) {
      for (let col: number = 0; col < cols; col++) {
        const x: number = col * TILE_SIZE;
        const y: number = groundY + row * TILE_SIZE;

        let tileId: number;
        if (row === 0) {
          tileId = GROUND_BLOCK.tc;
        } else if (row === rows - 1) {
          tileId = GROUND_BLOCK.bc;
        } else {
          tileId = GROUND_BLOCK.mc;
        }
        this.drawTile(ctx, tileId, x, y);
      }
    }
  }

  private drawPlatformTiles(ctx: CanvasRenderingContext2D): void {
    const platforms: PlatformRect[] = [
      { x: 80, y: 530, width: 220, height: 20 },
      { x: 800, y: 530, width: 220, height: 20 },
      { x: 420, y: 430, width: 280, height: 20 },
      { x: 150, y: 330, width: 200, height: 20 },
      { x: 820, y: 340, width: 200, height: 20 },
    ];

    for (const plat of platforms) {
      this.drawPlatformSurface(ctx, plat);
    }
  }

  drawDynamicPlatform(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, width: number, height: number,
  ): void {
    this.drawPlatformSurface(ctx, { x, y, width, height });
  }

  private drawPlatformSurface(
    ctx: CanvasRenderingContext2D, plat: PlatformRect,
  ): void {
    const cols: number = Math.max(1, Math.ceil(plat.width / TILE_SIZE));
    const tileY: number = plat.y;

    for (let col: number = 0; col < cols; col++) {
      const x: number = plat.x + col * TILE_SIZE;

      let tileId: number;
      if (col === 0) {
        tileId = PLATFORM_BLOCK.tl;
      } else if (col === cols - 1) {
        tileId = PLATFORM_BLOCK.tr;
      } else {
        tileId = PLATFORM_BLOCK.tc;
      }

      const img: HTMLImageElement | undefined = this.tileImages.get(tileId);
      if (img) {
        ctx.drawImage(img, x, tileY, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private drawDecorations(ctx: CanvasRenderingContext2D): void {
    for (const decor of MAP_DECORATIONS) {
      const img: HTMLImageElement | undefined = this.decorImages.get(decor.src);
      if (img) {
        ctx.drawImage(img, decor.x, decor.y, decor.width, decor.height);
      }
    }
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    tileId: number,
    x: number,
    y: number,
  ): void {
    const img: HTMLImageElement | undefined = this.tileImages.get(tileId);
    if (img) {
      ctx.drawImage(img, x, y, TILE_SIZE, TILE_SIZE);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.offscreenCanvas) {
      ctx.drawImage(this.offscreenCanvas, 0, 0);
    }
  }
}
