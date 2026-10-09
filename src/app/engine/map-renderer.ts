import { GAME_CONSTANTS } from '@shared/index';
import { LooseProp } from '@shared/game-entities';
import { BoulderPuzzleLayout, Platform, Rope } from './engine-types';
import { Prop, PROP_ART, PropArt, propArtWidth, RAIL_ART } from './level-generator';
import { LightningStrike } from './storm';
import { StormSky } from './storm-sky';
import { drawCageArt, drawSpringBlock } from './puzzle-art';

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

const TILE_SIZE: number = GAME_CONSTANTS.LEVEL_TILE_PX;

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

/** The background art's cloud bank (drifts across the sky). */
const CLOUD_LAYER_PATH: string = 'tiles/backgrounds/2.png';

/** Refinery silhouettes, far to near. */
const SKYLINE_LAYER_PATHS: string[] = [
  'tiles/backgrounds/3.png',
  'tiles/backgrounds/4.png',
  'tiles/backgrounds/5.png',
];

const LADDER_PATH: string = 'tiles/objects/Ladder1.png';

/** The ladder image is drawn at this scale (one tile per segment). */
const LADDER_TILE_WIDTH: number = 32;

/**
 * Draws the level. Two layers: scenery (the animated storm sky, never anything you can stand on)
 * and geometry (ground, platforms, ladders) composed from the current layout, the same data
 * the physics collides with. Nothing walkable or climbable is hard-coded here.
 */
export class MapRenderer {
  private tileImages: Map<number, HTMLImageElement> = new Map();
  private cloudLayer: HTMLImageElement | null = null;
  private skylineLayers: HTMLImageElement[] = [];
  private ladderImage: HTMLImageElement | null = null;
  /** Prop images by `PropArt.src`. */
  private propImages: Map<string, HTMLImageElement> = new Map<string, HTMLImageElement>();
  /** Props that stay put, drawn in the geometry layer. */
  private props: Prop[] = [];
  /** Pickable props' art by id: they are drawn per frame, wherever they are. */
  private looseArt: Map<string, Prop> = new Map<string, Prop>();
  /** Opaque columns of the ladder image (its art doesn't fill the tile; it is centered by these). */
  private ladderArt: { left: number; right: number } = { left: 0, right: LADDER_TILE_WIDTH - 1 };
  private stormSky: StormSky | null = null;
  private geometryCanvas: HTMLCanvasElement | null = null;
  private platforms: Platform[] = [];
  private ropes: Rope[] = [];
  private puzzle: BoulderPuzzleLayout | null = null;
  private wallStanding: boolean = false;
  private loaded: boolean = false;
  private loadCount: number = 0;
  private totalCount: number = 0;

  load(): void {
    const tileIds: Set<number> = new Set<number>();
    this.collectBlockTiles(GROUND_BLOCK, tileIds);
    this.collectBlockTiles(PLATFORM_BLOCK, tileIds);

    const propArts: PropArt[] = [
      ...Object.values(PROP_ART),
      RAIL_ART.left,
      RAIL_ART.middle,
      RAIL_ART.right,
    ];
    this.totalCount = tileIds.size + 1 + SKYLINE_LAYER_PATHS.length + 1 + propArts.length;

    for (const art of propArts) {
      const img: HTMLImageElement = new Image();
      img.src = art.src;
      img.onload = (): void => this.onAssetLoaded();
      this.propImages.set(art.src, img);
    }

    for (const id of tileIds) {
      const img: HTMLImageElement = new Image();
      const paddedId: string = String(id).padStart(2, '0');
      img.src = `tiles/ground/IndustrialTile_${paddedId}.png`;
      img.onload = (): void => this.onAssetLoaded();
      this.tileImages.set(id, img);
    }

    const clouds: HTMLImageElement = new Image();
    clouds.src = CLOUD_LAYER_PATH;
    clouds.onload = (): void => this.onAssetLoaded();
    this.cloudLayer = clouds;

    for (const path of SKYLINE_LAYER_PATHS) {
      const img: HTMLImageElement = new Image();
      img.src = path;
      img.onload = (): void => this.onAssetLoaded();
      this.skylineLayers.push(img);
    }

    const ladder: HTMLImageElement = new Image();
    ladder.src = LADDER_PATH;
    ladder.onload = (): void => {
      this.ladderArt = this.measureOpaqueColumns(ladder);
      this.onAssetLoaded();
    };
    this.ladderImage = ladder;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Sets the floor's platforms (ground excluded), ropes, props and floor-2 puzzle (its wall is drawn
   * while it stands), and redraws the geometry layer.
   */
  setLevel(
    platforms: Platform[],
    ropes: Rope[],
    props: Prop[],
    puzzle: BoulderPuzzleLayout | null,
    wallStanding: boolean,
  ): void {
    this.platforms = platforms.map((p: Platform): Platform => ({ ...p }));
    this.ropes = ropes.map((r: Rope): Rope => ({ ...r }));
    this.props = props.map((p: Prop): Prop => ({ ...p }));
    this.puzzle = puzzle;
    this.wallStanding = wallStanding;
    if (this.loaded) this.composeGeometry();
  }

  /** Width of the visible ladder art, which is centered on the climbable line. */
  getLadderArtWidth(): number {
    return this.ladderArt.right - this.ladderArt.left + 1;
  }

  /** The drawn ground/platforms/ladders on a transparent layer (read by the e2e geometry check). */
  getGeometryLayer(): HTMLCanvasElement | null {
    return this.geometryCanvas;
  }

  private onAssetLoaded(): void {
    this.loadCount++;
    if (this.loadCount >= this.totalCount) {
      this.loaded = true;
      this.stormSky = new StormSky(this.cloudLayer!, this.skylineLayers);
      this.composeGeometry();
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

  private createLayer(): CanvasRenderingContext2D {
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = GAME_CONSTANTS.CANVAS_WIDTH;
    canvas.height = GAME_CONSTANTS.CANVAS_HEIGHT;
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  private composeGeometry(): void {
    const ctx: CanvasRenderingContext2D = this.createLayer();
    this.drawGroundTiles(ctx);
    for (const plat of this.platforms) {
      this.drawPlatformSurface(ctx, plat);
    }
    if (this.puzzle && this.wallStanding) this.drawPuzzleWall(ctx, this.puzzle.wall);
    for (const rope of this.ropes) {
      this.drawLadder(ctx, rope);
    }
    for (const prop of this.props) {
      this.drawProp(ctx, prop);
    }
    this.geometryCanvas = ctx.canvas;
  }

  drawGroundTiles(ctx: CanvasRenderingContext2D): void {
    const groundY: number = GAME_CONSTANTS.GROUND_Y;
    const groundHeight: number = GAME_CONSTANTS.CANVAS_HEIGHT - groundY;
    const cols: number = Math.ceil(GAME_CONSTANTS.CANVAS_WIDTH / TILE_SIZE);
    const rows: number = Math.ceil(groundHeight / TILE_SIZE) + 1;

    for (let row: number = 0; row < rows; row++) {
      for (let col: number = 0; col < cols; col++) {
        let tileId: number;
        if (row === 0) {
          tileId = GROUND_BLOCK.tc;
        } else if (row === rows - 1) {
          tileId = GROUND_BLOCK.bc;
        } else {
          tileId = GROUND_BLOCK.mc;
        }
        this.drawTile(ctx, tileId, col * TILE_SIZE, groundY + row * TILE_SIZE);
      }
    }
  }

  drawDynamicPlatform(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, width: number, height: number,
  ): void {
    this.drawPlatformSurface(ctx, { x, y, width, height });
  }

  /** One row of tiles from the platform's left edge: platforms are whole tiles wide. */
  drawPlatformSurface(ctx: CanvasRenderingContext2D, plat: Platform): void {
    const cols: number = Math.max(1, Math.round(plat.width / TILE_SIZE));
    for (let col: number = 0; col < cols; col++) {
      let tileId: number;
      if (col === 0) {
        tileId = PLATFORM_BLOCK.tl;
      } else if (col === cols - 1) {
        tileId = PLATFORM_BLOCK.tr;
      } else {
        tileId = PLATFORM_BLOCK.tc;
      }
      this.drawTile(ctx, tileId, plat.x + col * TILE_SIZE, plat.y);
    }
  }

  /** Ladder art from the rope's top to its bottom, its visible part centered on the climbable line. */
  drawLadder(ctx: CanvasRenderingContext2D, rope: Rope): void {
    const img: HTMLImageElement | null = this.ladderImage;
    if (!img) return;
    const artCenter: number = (this.ladderArt.left + this.ladderArt.right + 1) / 2;
    const x: number = Math.round(rope.x - artCenter);
    for (let y: number = rope.topY; y < rope.bottomY; y += TILE_SIZE) {
      const h: number = Math.min(TILE_SIZE, rope.bottomY - y);
      const srcH: number = (img.naturalHeight * h) / TILE_SIZE;
      ctx.drawImage(img, 0, 0, img.naturalWidth, srcH, x, y, LADDER_TILE_WIDTH, h);
    }
  }

  /** The cracked stone wall: tiles over its whole box, the open-side column using the edge tile. */
  drawPuzzleWall(ctx: CanvasRenderingContext2D, wall: Platform): void {
    const cols: number = Math.round(wall.width / TILE_SIZE);
    const rows: number = Math.ceil(wall.height / TILE_SIZE);
    const faceCol: number = wall.x === 0 ? cols - 1 : 0;
    const faceTile: number = wall.x === 0 ? GROUND_BLOCK.mr : GROUND_BLOCK.ml;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wall.x, wall.y, wall.width, wall.height);
    ctx.clip();
    for (let row: number = 0; row < rows; row++) {
      for (let col: number = 0; col < cols; col++) {
        const tileId: number = col === faceCol ? faceTile : GROUND_BLOCK.mc;
        this.drawTile(ctx, tileId, wall.x + col * TILE_SIZE, wall.y + row * TILE_SIZE);
      }
    }
    // Cracks: a hint that it can break.
    ctx.strokeStyle = 'rgba(10, 10, 15, 0.8)';
    ctx.lineWidth = 2;
    const faceX: number = wall.x === 0 ? wall.x + wall.width - 6 : wall.x + 6;
    const inward: number = wall.x === 0 ? -1 : 1;
    for (let y: number = 120; y < wall.height; y += 140) {
      ctx.beginPath();
      ctx.moveTo(faceX, y);
      ctx.lineTo(faceX + inward * 14, y + 22);
      ctx.lineTo(faceX + inward * 6, y + 44);
      ctx.lineTo(faceX + inward * 22, y + 70);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The big spring: a steel base on the ground, a wide coil, and a hazard-striped plate on top
   * whose top edge is the block's walkable top. At rest (`plateOffset` 0) the art fills exactly
   * its collision box; the plate sinks while it winds up and shoots up on release (drawn per frame).
   */
  drawSpring(ctx: CanvasRenderingContext2D, block: Platform, plateOffset: number): void {
    drawSpringBlock(ctx, block, plateOffset);
  }

  /**
   * A floor-4 cage: an iron frame (its top bar is the walkable top) with bars between, filling
   * exactly its collision box. While it hangs it is covered with a tarp, so nobody sees what it
   * holds; the exit cage that landed stands open and bare (drawn per frame: cages fall).
   */
  drawCage(
    ctx: CanvasRenderingContext2D,
    box: { x: number; y: number; width: number; height: number },
    covered: boolean,
  ): void {
    drawCageArt(ctx, box, covered);
  }

  /** The floor's pickable props (by id), drawn per frame with `drawLooseProp`. */
  setLooseProps(art: Map<string, Prop>): void {
    this.looseArt = art;
  }

  /** A pickable prop where it is now (an id from another floor draws nothing). */
  drawLooseProp(ctx: CanvasRenderingContext2D, prop: LooseProp): void {
    const art: Prop | undefined = this.looseArt.get(prop.id);
    if (art) this.drawProp(ctx, { ...art, x: prop.x, y: prop.y });
  }

  /** A prop image placed so its visible art covers exactly the prop's collision box. */
  drawProp(ctx: CanvasRenderingContext2D, prop: Prop): void {
    if (prop.kind !== 'rail') {
      this.drawPropPiece(ctx, PROP_ART[prop.kind], prop.x, prop.y);
      return;
    }
    // Rail: left cap, middle pieces edge to edge, right cap flush with the box's right side.
    const rightCapX: number = prop.x + prop.width - propArtWidth(RAIL_ART.right);
    this.drawPropPiece(ctx, RAIL_ART.left, prop.x, prop.y);
    const middleWidth: number = propArtWidth(RAIL_ART.middle);
    for (
      let x: number = prop.x + propArtWidth(RAIL_ART.left);
      x < rightCapX;
      x += middleWidth
    ) {
      this.drawPropPiece(ctx, RAIL_ART.middle, x, prop.y);
    }
    this.drawPropPiece(ctx, RAIL_ART.right, rightCapX, prop.y);
  }

  /** One prop image with its visible art's top-left at x, y. */
  private drawPropPiece(ctx: CanvasRenderingContext2D, art: PropArt, x: number, y: number): void {
    const img: HTMLImageElement | undefined = this.propImages.get(art.src);
    if (img) ctx.drawImage(img, x - art.left, y - art.top);
  }

  private measureOpaqueColumns(img: HTMLImageElement): { left: number; right: number } {
    const ctx: CanvasRenderingContext2D = this.createLayer();
    ctx.drawImage(img, 0, 0, LADDER_TILE_WIDTH, TILE_SIZE);
    const data: Uint8ClampedArray = ctx.getImageData(0, 0, LADDER_TILE_WIDTH, TILE_SIZE).data;
    let left: number = LADDER_TILE_WIDTH;
    let right: number = -1;
    for (let x: number = 0; x < LADDER_TILE_WIDTH; x++) {
      for (let y: number = 0; y < TILE_SIZE; y++) {
        if (data[(y * LADDER_TILE_WIDTH + x) * 4 + 3] > 0) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    return right >= left ? { left, right } : { left: 0, right: LADDER_TILE_WIDTH - 1 };
  }

  private drawTile(ctx: CanvasRenderingContext2D, tileId: number, x: number, y: number): void {
    const img: HTMLImageElement | undefined = this.tileImages.get(tileId);
    if (img) {
      ctx.drawImage(img, x, y, TILE_SIZE, TILE_SIZE);
    }
  }

  /** Storm sky (clouds drift with `nowMs`, lit by `lightning`), the level geometry, then rain. */
  render(ctx: CanvasRenderingContext2D, nowMs: number, lightning: LightningStrike | null): void {
    this.stormSky?.drawBack(ctx, nowMs, lightning);
    if (this.geometryCanvas) ctx.drawImage(this.geometryCanvas, 0, 0);
    this.stormSky?.drawRain(ctx, nowMs, lightning);
  }
}
