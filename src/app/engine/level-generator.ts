import { GAME_CONSTANTS, PROP_WEIGHT_KG } from '@shared/index';
import { LooseProp, PropMaterial } from '@shared/game-entities';
import {
  BoulderPuzzleLayout,
  CageContent,
  CagePuzzleLayout,
  HangingCage,
  PlatePuzzleLayout,
  Platform,
  Rope,
  SpringPuzzleLayout,
} from './engine-types';
import { chuteSpan } from './boulder-puzzle';

/**
 * Procedural floor layouts. Every floor gets a new arrangement of platforms and ropes from a
 * seeded generator, so all players (who share the host's seed) build the identical level.
 *
 * The layout is the single source of truth: physics collides with it and MapRenderer draws
 * exactly it. Platforms are whole tiles wide and one tile tall, so the drawn art and the
 * collision box are the same rectangle.
 */
export interface LevelLayout {
  seed: number;
  floor: number;
  /** Walkable platforms above the ground (the ground and the exit are separate). */
  platforms: Platform[];
  ropes: Rope[];
  /** Left edge of the exit platform (it hangs at the left or right screen edge). */
  exitX: number;
  /** Solid props on the ground and platforms. */
  props: Prop[];
  /** Floor-2 puzzle (breakable wall; the exit platform is the boulder's ledge, at exitX). */
  boulderPuzzle?: BoulderPuzzleLayout;
  /** Floor-3 puzzle (the spring at the screen edge under the exit, at exitX). */
  springPuzzle?: SpringPuzzleLayout;
  /** Floor-4 puzzle (two hanging cages; their cleats stand on the safe spot). */
  cagePuzzle?: CagePuzzleLayout;
  /** Floor-5 puzzle (the pressure plate on a far, high ledge that holds the exit door open). */
  platePuzzle?: PlatePuzzleLayout;
}

export const GROUND_PLATFORM: Platform = {
  x: -100,
  y: GAME_CONSTANTS.GROUND_Y,
  width: GAME_CONSTANTS.CANVAS_WIDTH + 200,
  height: 100,
};

/** Height the exit hangs at: out of jump reach, higher on later floors and with more players. */
export function exitPlatformY(floor: number, extraPlayers: number): number {
  return Math.max(
    GAME_CONSTANTS.EXIT_PLATFORM_MIN_Y,
    GAME_CONSTANTS.EXIT_PLATFORM_Y -
      (floor - 1) * GAME_CONSTANTS.EXIT_RISE_PER_FLOOR -
      extraPlayers * GAME_CONSTANTS.EXIT_RISE_PER_EXTRA_PLAYER,
  );
}

export type Random = () => number;

/** Small, fast, deterministic PRNG (mulberry32). */
export function seededRandom(seed: number): Random {
  let a: number = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t: number = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rand: Random, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Horizontal distance between two spans (0 when they overlap). */
function spanGap(aLeft: number, aRight: number, bLeft: number, bRight: number): number {
  return Math.max(0, Math.max(aLeft - bRight, bLeft - aRight));
}

function platformGap(a: Platform, b: Platform): number {
  return spanGap(a.x, a.x + a.width, b.x, b.x + b.width);
}

interface TierRules {
  y: number;
  minTiles: number;
  maxTiles: number;
  exitGap: number;
  /** Horizontal spans no platform may overlap (a puzzle's chute, spring or scale column). */
  avoid: Array<[number, number]>;
}

function exitGapFor(tierIndex: number): number {
  return [
    GAME_CONSTANTS.LEVEL_EXIT_CLEARANCE_PX,
    GAME_CONSTANTS.LEVEL_TIER2_EXIT_GAP_PX,
    GAME_CONSTANTS.LEVEL_TIER3_EXIT_GAP_PX,
  ][tierIndex];
}

/**
 * Tries to place one platform on a tier: whole tiles, inside the screen, far enough from the
 * exit and from same-tier platforms, and (when `anchors` is given) one jump from one of them.
 */
function tryPlace(
  rand: Random,
  rules: TierRules,
  exitX: number,
  sameTier: Platform[],
  anchors: Platform[] | null,
): Platform | null {
  const tile: number = GAME_CONSTANTS.LEVEL_TILE_PX;
  const exitRight: number = exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH;
  for (let attempt: number = 0; attempt < 60; attempt++) {
    const width: number = randomInt(rand, rules.minTiles, rules.maxTiles) * tile;
    const maxX: number = GAME_CONSTANTS.CANVAS_WIDTH - tile - width;
    const x: number = Math.round(randomInt(rand, tile, maxX) / 16) * 16;
    const candidate: Platform = { x, y: rules.y, width, height: tile };
    if (spanGap(x, x + width, exitX, exitRight) < rules.exitGap) continue;
    if (rules.avoid.some(([a, b]: [number, number]): boolean => x < b && x + width > a)) continue;
    if (
      sameTier.some(
        (p: Platform): boolean => platformGap(p, candidate) < GAME_CONSTANTS.LEVEL_PLATFORM_GAP_PX,
      )
    ) {
      continue;
    }
    if (
      anchors &&
      !anchors.some(
        (a: Platform): boolean => platformGap(a, candidate) <= GAME_CONSTANTS.LEVEL_STEP_UP_GAP_PX,
      )
    ) {
      continue;
    }
    return candidate;
  }
  return null;
}

/** Surface directly under x below y: a lower platform, else the ground. */
function surfaceUnder(x: number, y: number, platforms: Platform[]): number {
  const below: Platform[] = platforms.filter(
    (p: Platform): boolean => p.y > y && x >= p.x && x <= p.x + p.width,
  );
  return below.length > 0
    ? Math.min(...below.map((p: Platform): number => p.y))
    : GAME_CONSTANTS.GROUND_Y;
}

/** A rope hanging from `top` down to whatever is under it, at a random spot along the platform. */
function ropeFrom(rand: Random, top: Platform, platforms: Platform[]): Rope {
  const margin: number = 32;
  let rope: Rope = { x: 0, topY: top.y, bottomY: GAME_CONSTANTS.GROUND_Y };
  for (let attempt: number = 0; attempt < 20; attempt++) {
    const x: number =
      Math.round(randomInt(rand, top.x + margin, top.x + top.width - margin) / 16) * 16;
    rope = { x, topY: top.y, bottomY: surfaceUnder(x, top.y, platforms) };
    if (ropeLandsCleanly(rope, platforms)) break;
  }
  return rope;
}

/** A rope ending on a platform must end well inside it, not hang half over its edge. */
function ropeLandsCleanly(rope: Rope, platforms: Platform[]): boolean {
  if (rope.bottomY === GAME_CONSTANTS.GROUND_Y) return true;
  const margin: number = GAME_CONSTANTS.LEVEL_TILE_PX / 2;
  return platforms.some(
    (p: Platform): boolean =>
      p.y === rope.bottomY && rope.x >= p.x + margin && rope.x <= p.x + p.width - margin,
  );
}

/** One-image map props (barrels, boxes, lockers). */
export type SinglePropKind =
  | 'barrel1'
  | 'barrel2'
  | 'barrel3'
  | 'box1'
  | 'box2'
  | 'box3'
  | 'locker1'
  | 'locker2';

/** Map props: solid, so you can stand on them and bump into them. A rail is built from pieces (`RAIL_ART`). */
export type PropKind = SinglePropKind | 'rail';

/**
 * Where a prop image's visible pixels are (measured from the PNG): the collision box is exactly
 * this, and the renderer offsets the image so the art lands on the box.
 */
export interface PropArt {
  src: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const PROP_ART: Record<SinglePropKind, PropArt> = {
  barrel1: { src: 'tiles/objects/Barrel1.png', left: 0, top: 4, right: 17, bottom: 25 },
  barrel2: { src: 'tiles/objects/Barrel2.png', left: 0, top: 1, right: 17, bottom: 25 },
  barrel3: { src: 'tiles/objects/Barrel3.png', left: 0, top: 3, right: 17, bottom: 25 },
  box1: { src: 'tiles/objects/Box1.png', left: 2, top: 10, right: 29, bottom: 31 },
  box2: { src: 'tiles/objects/Box2.png', left: 2, top: 10, right: 29, bottom: 31 },
  box3: { src: 'tiles/objects/Box3.png', left: 3, top: 16, right: 28, bottom: 31 },
  locker1: { src: 'tiles/objects/Locker1.png', left: 1, top: 1, right: 30, bottom: 22 },
  locker2: { src: 'tiles/objects/Locker2.png', left: 1, top: 1, right: 31, bottom: 23 },
};

export interface RailArt {
  left: PropArt;
  middle: PropArt;
  right: PropArt;
}

/** A rail's pieces, laid edge to edge: left cap, 0..RAIL_MAX_MIDDLES middle pieces, right cap. */
export const RAIL_ART: RailArt = {
  left: { src: 'tiles/objects/Fence1.png', left: 0, top: 16, right: 31, bottom: 31 },
  middle: { src: 'tiles/objects/Fence2.png', left: 0, top: 16, right: 31, bottom: 31 },
  right: { src: 'tiles/objects/Fence3.png', left: 0, top: 16, right: 20, bottom: 31 },
};
export const RAIL_MAX_MIDDLES: number = 5;

export function propArtWidth(art: PropArt): number {
  return art.right - art.left + 1;
}

export function propArtHeight(art: PropArt): number {
  return art.bottom - art.top + 1;
}

/** A rail's width with `middles` middle pieces between its caps. */
export function railWidth(middles: number): number {
  return (
    propArtWidth(RAIL_ART.left) +
    middles * propArtWidth(RAIL_ART.middle) +
    propArtWidth(RAIL_ART.right)
  );
}

/** What each prop is made of: its weight is PROP_WEIGHT_KG[material] (shared/game-constants.ts). */
export const PROP_MATERIAL: Record<PropKind, PropMaterial> = {
  barrel1: 'barrel',
  barrel2: 'barrel',
  barrel3: 'barrel',
  box1: 'box',
  box2: 'box',
  box3: 'box',
  locker1: 'locker',
  locker2: 'locker',
  rail: 'rail',
};

export function propWeightKg(kind: PropKind): number {
  return PROP_WEIGHT_KG[PROP_MATERIAL[kind]];
}

const PROP_KINDS: PropKind[] = [...(Object.keys(PROP_ART) as SinglePropKind[]), 'rail'];
const STACKABLE: SinglePropKind[] = ['box1', 'box2', 'box3'];

/** A prop's collision box (top-left x/y, size) equals its visible art. */
export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

function propBox(kind: SinglePropKind, x: number, surfaceY: number): Prop {
  const art: PropArt = PROP_ART[kind];
  const height: number = propArtHeight(art);
  return { kind, x, y: surfaceY - height, width: propArtWidth(art), height };
}

function railBox(middles: number, x: number, surfaceY: number): Prop {
  const height: number = propArtHeight(RAIL_ART.middle);
  return { kind: 'rail', x, y: surfaceY - height, width: railWidth(middles), height };
}

/** Props that look liftable (barrels, boxes): players pick them up and throw them. Rails and lockers stay put. */
const PICKABLE_KINDS: PropKind[] = ['barrel1', 'barrel2', 'barrel3', 'box1', 'box2', 'box3'];

export function isPickable(prop: Prop): boolean {
  return PICKABLE_KINDS.includes(prop.kind);
}

/**
 * The floor's pickable props by their game-state id (floor and index in the layout's props, so a
 * new floor never reuses one), each with its art and spawn spot.
 */
export function pickableProps(level: LevelLayout): Map<string, Prop> {
  const out: Map<string, Prop> = new Map<string, Prop>();
  level.props.forEach((p: Prop, i: number): void => {
    if (isPickable(p)) out.set(`prop-${level.floor}-${i}`, p);
  });
  return out;
}

/** A pickable prop as game state, lying on its spawn spot. */
export function lyingProp(id: string, prop: Prop): LooseProp {
  return {
    id,
    x: prop.x,
    y: prop.y,
    width: prop.width,
    height: prop.height,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    carrierId: null,
    weightKg: propWeightKg(prop.kind),
  };
}

/** Horizontal room kept free around the player's spawn point (ground, screen center). */
const SPAWN_CLEAR: [number, number] = [560, 720];
/** Props keep this far from platform edges (ledges stay clear to walk off and jump up). */
const PROP_EDGE_MARGIN_PX: number = 40;
/** ...and this far (each side) from a rope's line where it starts or ends on the same surface. */
const PROP_ROPE_CLEARANCE_PX: number = 24;

interface PropContext {
  platforms: Platform[];
  ropes: Rope[];
  exitX: number;
  props: Prop[];
  boulderPuzzle?: BoulderPuzzleLayout;
  springPuzzle?: SpringPuzzleLayout;
  cagePuzzle?: CagePuzzleLayout;
  /** Floor-5 puzzle (the pressure plate on a far, high ledge that holds the exit door open). */
  platePuzzle?: PlatePuzzleLayout;
}

/** Broken rules for one prop against the rest of the layout (shared by the generator and the checks). */
function propProblems(prop: Prop, layout: PropContext): string[] {
  const out: string[] = [];
  const left: number = prop.x;
  const right: number = prop.x + prop.width;
  const bottom: number = prop.y + prop.height;
  const onGround: boolean = bottom === GAME_CONSTANTS.GROUND_Y;
  const platform: Platform | undefined = layout.platforms.find(
    (p: Platform): boolean =>
      p.y === bottom &&
      left >= p.x + PROP_EDGE_MARGIN_PX &&
      right <= p.x + p.width - PROP_EDGE_MARGIN_PX,
  );
  const below: Prop | undefined = layout.props.find(
    (q: Prop): boolean => q !== prop && q.y === bottom && left >= q.x && right <= q.x + q.width + 2,
  );
  if (!onGround && !platform && !below) out.push('does not rest on a surface');
  if (left < 8 || right > GAME_CONSTANTS.CANVAS_WIDTH - 8) out.push('off screen');

  // Props add height: near the exit only ground-level ones (and stacks on the ground) are safe.
  const groundLevel: boolean =
    onGround || (below !== undefined && below.y + below.height === GAME_CONSTANTS.GROUND_Y);
  const exitGap: number = spanGap(
    left,
    right,
    layout.exitX,
    layout.exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH,
  );
  const neededGap: number = groundLevel
    ? GAME_CONSTANTS.LEVEL_EXIT_CLEARANCE_PX
    : GAME_CONSTANTS.LEVEL_TIER2_EXIT_GAP_PX;
  if (exitGap < neededGap) out.push('too close to the exit');

  if (groundLevel && spanGap(left, right, SPAWN_CLEAR[0], SPAWN_CLEAR[1]) === 0)
    out.push('blocks the spawn point');

  // Standing on a prop needs full headroom: no platform tile just above it.
  const headroom: number = GAME_CONSTANTS.PLAYER_HEIGHT + 4;
  const cramped: boolean = layout.platforms.some(
    (p: Platform): boolean =>
      p.y < prop.y &&
      prop.y - (p.y + GAME_CONSTANTS.LEVEL_TILE_PX) < headroom &&
      spanGap(left, right, p.x, p.x + p.width) < GAME_CONSTANTS.PLAYER_WIDTH,
  );
  if (cramped) out.push('no headroom under a platform');

  const restsOn: number = below ? below.y + below.height : bottom;
  for (const r of layout.ropes) {
    const sameSurface: boolean = r.bottomY === restsOn || r.topY === restsOn;
    if (
      sameSurface &&
      spanGap(left, right, r.x - PROP_ROPE_CLEARANCE_PX, r.x + PROP_ROPE_CLEARANCE_PX) === 0
    ) {
      out.push(`blocks the rope at ${r.x}`);
    }
  }
  for (const q of layout.props) {
    if (q === prop || q === below || q.y + q.height === prop.y) continue;
    const overlap: boolean =
      spanGap(left, right, q.x, q.x + q.width) === 0 && prop.y < q.y + q.height && q.y < bottom;
    if (overlap) out.push('overlaps another prop');
  }
  const puzzle: BoulderPuzzleLayout | undefined = layout.boulderPuzzle;
  if (puzzle) {
    const fromWall: number = spanGap(left, right, puzzle.wall.x, puzzle.wall.x + puzzle.wall.width);
    if (fromWall < GAME_CONSTANTS.BOULDER_OPENING_CLEAR_PX) out.push('blocks the way out');
  }
  const spring: SpringPuzzleLayout | undefined = layout.springPuzzle;
  if (spring) {
    const block: Platform = spring.spring;
    if (spanGap(left, right, block.x, block.x + block.width) < GAME_CONSTANTS.SPRING_CLEAR_PX) {
      out.push('crowds the spring');
    }
    // Nothing stands on the scale but what players load onto it.
    const pan: [number, number] = [spring.scaleX, spring.scaleX + GAME_CONSTANTS.SPRING_SCALE_WIDTH_PX];
    if (groundLevel && spanGap(left, right, pan[0], pan[1]) === 0) out.push('on the scale');
  }
  const cages: CagePuzzleLayout | undefined = layout.cagePuzzle;
  if (cages) {
    // Room to stand and swing on either side of each cleat.
    const room: number = GAME_CONSTANTS.CAGE_CLEAT_WIDTH_PX / 2 + GAME_CONSTANTS.PLAYER_WIDTH + 8;
    for (const c of cages.cages.filter((h: HangingCage): boolean => h.cleatY === restsOn)) {
      if (spanGap(left, right, c.cleatX - room, c.cleatX + room) === 0) out.push('crowds a cleat');
    }
    // Nothing where a mid-screen cage lands: its content spills out there.
    for (const c of cages.cages) {
      if (c.hang && c.landY === restsOn && spanGap(left, right, c.hang.x, c.hang.x + c.hang.width) === 0) {
        out.push('under a hanging cage');
      }
    }
  }
  const plate: PlatePuzzleLayout | undefined = layout.platePuzzle;
  if (plate && restsOn === plate.plateY) {
    // Room to stand beside the plate and toss corpses onto it.
    const room: number = GAME_CONSTANTS.PLAYER_WIDTH;
    const plateRight: number = plate.plateX + GAME_CONSTANTS.PLATE_WIDTH_PX;
    if (spanGap(left, right, plate.plateX - room, plateRight + room) === 0) {
      out.push('crowds the plate');
    }
  }
  return out;
}

/**
 * Scatters props on the ground and platforms (rails of random length, some boxes stacked), each
 * passing propProblems.
 */
function placeProps(rand: Random, layout: Omit<PropContext, 'props'>): Prop[] {
  const props: Prop[] = [];
  const wanted: number = randomInt(rand, 8, 14);
  for (let i: number = 0; i < wanted; i++) {
    for (let attempt: number = 0; attempt < 30; attempt++) {
      const kind: PropKind = PROP_KINDS[randomInt(rand, 0, PROP_KINDS.length - 1)];
      const middles: number = randomInt(rand, 0, RAIL_MAX_MIDDLES);
      const width: number = kind === 'rail' ? railWidth(middles) : propArtWidth(PROP_ART[kind]);
      const bases: Prop[] = props.filter(
        (q: Prop): boolean =>
          q.kind !== 'rail' &&
          STACKABLE.includes(q.kind) &&
          !props.some((t: Prop): boolean => t.y + t.height === q.y),
      );
      let candidate: Prop;
      if (kind !== 'rail' && STACKABLE.includes(kind) && bases.length > 0 && rand() < 0.35) {
        const base: Prop = bases[randomInt(rand, 0, bases.length - 1)];
        candidate = propBox(kind, base.x + Math.floor((base.width - width) / 2), base.y);
      } else {
        const surfaces: Platform[] = [
          GROUND_PLATFORM,
          GROUND_PLATFORM,
          ...layout.platforms.filter((p: Platform): boolean => !p.safe),
        ];
        const surface: Platform = surfaces[randomInt(rand, 0, surfaces.length - 1)];
        const margin: number = surface === GROUND_PLATFORM ? 0 : PROP_EDGE_MARGIN_PX;
        const minX: number = Math.max(8, surface.x + margin);
        const maxX: number = Math.min(
          GAME_CONSTANTS.CANVAS_WIDTH - 8 - width,
          surface.x + surface.width - width - margin,
        );
        if (maxX < minX) continue;
        const x: number = randomInt(rand, minX, maxX);
        candidate = kind === 'rail' ? railBox(middles, x, surface.y) : propBox(kind, x, surface.y);
      }
      if (propProblems(candidate, { ...layout, props: [...props, candidate] }).length === 0) {
        props.push(candidate);
        break;
      }
    }
  }
  return props;
}

/**
 * The floor's safe spot: a high ledge (a tier above the highest platforms) on the far side from
 * the exit, with its own ladder, where players rest out of the zombies' reach.
 */
function placeSafeSpot(
  rand: Random,
  exitX: number,
  exitGap: number,
  below: Platform[],
): { spot: Platform; ladder: Rope } {
  const tile: number = GAME_CONSTANTS.LEVEL_TILE_PX;
  const width: number = GAME_CONSTANTS.LEVEL_SAFE_SPOT_TILES * tile;
  const exitRight: number = exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH;
  const minX: number = tile;
  const maxX: number = GAME_CONSTANTS.CANVAS_WIDTH - tile - width;
  const candidates: number[] = [];
  for (let x: number = minX; x <= maxX; x += 16) {
    if (spanGap(x, x + width, exitX, exitRight) >= exitGap) {
      candidates.push(x);
    }
  }
  const at: (x: number) => Platform = (x: number): Platform => ({
    x,
    y: GAME_CONSTANTS.LEVEL_SAFE_SPOT_Y,
    width,
    height: tile,
    safe: true,
  });
  // Pick a spot whose ladder lands cleanly on whatever is below it.
  let spot: Platform = at(exitX > GAME_CONSTANTS.CANVAS_WIDTH / 2 ? minX : maxX);
  let ladder: Rope = ropeFrom(rand, spot, below);
  for (
    let attempt: number = 0;
    attempt < 40 && !ropeLandsCleanly(ladder, below);
    attempt++
  ) {
    spot = at(candidates[randomInt(rand, 0, candidates.length - 1)]);
    ladder = ropeFrom(rand, spot, below);
  }
  return { spot, ladder };
}

/**
 * Floor-2 puzzle: a solid wall at one screen edge and, a chute's span in from it, the boulder's
 * ledge. The ledge takes the exit platform's place (same height rules, no ladder): players reach
 * it by piling up the dead under it, like the exit on other floors.
 */
function placeBoulderPuzzle(rand: Random, wallOnRight: boolean): BoulderPuzzleLayout {
  const wallWidth: number = GAME_CONSTANTS.BOULDER_WALL_TILES * GAME_CONSTANTS.LEVEL_TILE_PX;
  const span: number =
    randomInt(
      rand,
      GAME_CONSTANTS.BOULDER_CHUTE_MIN_SPAN_PX / 32,
      GAME_CONSTANTS.BOULDER_CHUTE_MAX_SPAN_PX / 32,
    ) * 32;
  const wall: Platform = {
    x: wallOnRight ? GAME_CONSTANTS.CANVAS_WIDTH - wallWidth : 0,
    y: 0,
    width: wallWidth,
    height: GAME_CONSTANTS.GROUND_Y,
  };
  return {
    wall,
    wallDir: wallOnRight ? 1 : -1,
    ledgeX: wallOnRight
      ? wall.x - span - GAME_CONSTANTS.EXIT_PLATFORM_WIDTH
      : wall.x + wallWidth + span,
  };
}

/**
 * Floor-3 puzzle: a big spring block from the exit's screen edge to the exit's inner edge, so the
 * exit (which hangs at the very top) is straight above it. The scale's pan is set into the ground
 * on the far side of the floor.
 */
function placeSpringPuzzle(exitX: number, exitOnRight: boolean): SpringPuzzleLayout {
  const height: number = GAME_CONSTANTS.SPRING_HEIGHT_PX;
  const y: number = GAME_CONSTANTS.GROUND_Y - height;
  const exitRight: number = exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH;
  return exitOnRight
    ? {
        spring: { x: exitX, y, width: GAME_CONSTANTS.CANVAS_WIDTH - exitX, height },
        side: 1,
        scaleX: farScaleX(1),
      }
    : { spring: { x: 0, y, width: exitRight, height }, side: -1, scaleX: farScaleX(-1) };
}

/** Left edge of the scale's pan: inset from the screen edge opposite the spring. */
function farScaleX(side: 1 | -1): number {
  const inset: number = GAME_CONSTANTS.SPRING_SCALE_INSET_PX;
  return side === 1
    ? inset
    : GAME_CONSTANTS.CANVAS_WIDTH - inset - GAME_CONSTANTS.SPRING_SCALE_WIDTH_PX;
}

/** Floor 4: left edges a mid-screen cage may hang at (tile-aligned, clear of the exit and the safe spot). */
function midCageSpots(exitX: number, platforms: Platform[]): number[] {
  const tile: number = GAME_CONSTANTS.LEVEL_TILE_PX;
  const size: number = GAME_CONSTANTS.CAGE_MID_SIZE_PX;
  const exitRight: number = exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH;
  const safe: Platform | undefined = platforms.find((p: Platform): boolean => p.safe === true);
  const out: number[] = [];
  for (let x: number = tile; x + size <= GAME_CONSTANTS.CANVAS_WIDTH - tile; x += tile) {
    if (spanGap(x, x + size, exitX, exitRight) < GAME_CONSTANTS.CAGE_EXIT_CLEAR_PX) continue;
    if (safe && spanGap(x, x + size, safe.x, safe.x + safe.width) < GAME_CONSTANTS.CAGE_MID_GAP_PX) {
      continue;
    }
    out.push(x);
  }
  return out;
}

/** A mid-screen cage hanging with its left edge at x. */
function midCageAt(x: number): Platform {
  const size: number = GAME_CONSTANTS.CAGE_MID_SIZE_PX;
  return { x, y: GAME_CONSTANTS.CAGE_MID_TOP_Y, width: size, height: size };
}

/** `count` mid-screen cages at random free spots, apart from each other (packed from the left if that fails). */
function placeMidCages(rand: Random, count: number, exitX: number, platforms: Platform[]): Platform[] {
  const apart: number = GAME_CONSTANTS.CAGE_MID_SIZE_PX + GAME_CONSTANTS.CAGE_MID_GAP_PX;
  const spots: number[] = midCageSpots(exitX, platforms);
  const fits: (picked: number[], x: number) => boolean = (picked: number[], x: number): boolean =>
    picked.every((p: number): boolean => Math.abs(p - x) >= apart);
  let picked: number[] = [];
  let free: number[] = spots;
  while (picked.length < count && free.length > 0) {
    const x: number = free[randomInt(rand, 0, free.length - 1)];
    picked.push(x);
    free = free.filter((f: number): boolean => fits(picked, f));
  }
  if (picked.length < count) {
    picked = spots.reduce(
      (acc: number[], x: number): number[] => (acc.length < count && fits(acc, x) ? [...acc, x] : acc),
      [],
    );
  }
  return picked.sort((a: number, b: number): number => a - b).map(midCageAt);
}

/** Top of what a mid-screen cage lands on: the highest platform under it, else the ground. */
function cageLandY(cage: Platform, platforms: Platform[]): number {
  const bottom: number = cage.y + cage.height;
  const under: Platform[] = platforms.filter(
    (p: Platform): boolean => p.y >= bottom && p.x < cage.x + cage.width && p.x + p.width > cage.x,
  );
  return Math.min(GAME_CONSTANTS.GROUND_Y, ...under.map((p: Platform): number => p.y));
}

/** A seeded shuffle (Fisher-Yates) of a copy of `items`. */
function shuffled<T>(rand: Random, items: T[]): T[] {
  const out: T[] = [...items];
  for (let i: number = out.length - 1; i > 0; i--) {
    const j: number = randomInt(rand, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** What `count` cages hide: a fixed mix (zombies, loot, the rest empty), not yet shuffled. */
function cageContentMix(count: number): CageContent[] {
  const zombies: number = GAME_CONSTANTS.CAGE_ZOMBIE_CAGES;
  const loot: number = GAME_CONSTANTS.CAGE_LOOT_CAGES;
  return Array.from(
    { length: count },
    (_: unknown, i: number): CageContent => (i < zombies ? 'zombies' : i < zombies + loot ? 'loot' : 'empty'),
  );
}

/**
 * Every spot a floor-4 cleat may stand on, highest surfaces first: spaced along each regular
 * ledge (never the safe spot, where nobody swings), then along the ground (clear of the exit's
 * column, the spawn point and rope ends).
 */
function cleatSpots(exitX: number, platforms: Platform[], ropes: Rope[]): Array<{ x: number; y: number }> {
  const inset: number = GAME_CONSTANTS.CAGE_CLEAT_INSET_PX;
  const spacing: number = GAME_CONSTANTS.CAGE_CLEAT_SPACING_PX;
  const clear: number = GAME_CONSTANTS.CAGE_EXIT_CLEAR_PX;
  const exitRight: number = exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH;
  const surfaces: Platform[] = [
    ...platforms
      .filter((p: Platform): boolean => !p.safe)
      .sort((a: Platform, b: Platform): number => a.y - b.y || a.x - b.x),
    GROUND_PLATFORM,
  ];
  const out: Array<{ x: number; y: number }> = [];
  for (const s of surfaces) {
    const ground: boolean = s.y === GAME_CONSTANTS.GROUND_Y;
    for (let x: number = s.x + inset; x <= s.x + s.width - inset; x += spacing) {
      const nearRope: boolean = ropes.some(
        (r: Rope): boolean => (r.topY === s.y || r.bottomY === s.y) && Math.abs(r.x - x) < spacing / 2,
      );
      const inTheWay: boolean =
        ground &&
        (spanGap(x, x, exitX - clear, exitRight + clear) === 0 ||
          spanGap(x, x, SPAWN_CLEAR[0], SPAWN_CLEAR[1]) === 0);
      if (!nearRope && !inTheWay) out.push({ x, y: s.y });
    }
  }
  return out;
}

/** Points a chain winds through in the ceiling band, around the span between its cleat and its hook. */
function chainKinks(rand: Random, fromX: number, toX: number): Array<{ x: number; y: number }> {
  const margin: number = 16;
  const lo: number = Math.max(margin, Math.min(fromX, toX) - 200);
  const hi: number = Math.min(GAME_CONSTANTS.CANVAS_WIDTH - margin, Math.max(fromX, toX) + 200);
  return Array.from(
    { length: GAME_CONSTANTS.CAGE_CHAIN_KINKS },
    (): { x: number; y: number } => ({
      x: randomInt(rand, lo, hi),
      y: randomInt(rand, GAME_CONSTANTS.CAGE_CHAIN_TOP_Y, GAME_CONSTANTS.CAGE_CHAIN_BOTTOM_Y),
    }),
  );
}

/**
 * Floor-4 puzzle: the exit cage plus 3-4 cages hanging mid-screen, a hidden content each
 * (shuffled), one cleat each on the highest free spots (tied in a random order), and tangled
 * chains between them.
 */
function placeCagePuzzle(rand: Random, exitX: number, platforms: Platform[], ropes: Rope[]): CagePuzzleLayout {
  const wanted: number = randomInt(rand, GAME_CONSTANTS.CAGE_COUNT_MIN, GAME_CONSTANTS.CAGE_COUNT_MAX);
  const mids: Platform[] = placeMidCages(rand, wanted - 1, exitX, platforms);
  const hangs: Array<Platform | null> = [null, ...mids];
  const contents: CageContent[] = shuffled(rand, cageContentMix(hangs.length));
  const cleats: Array<{ x: number; y: number }> = shuffled(
    rand,
    cleatSpots(exitX, platforms, ropes).slice(0, hangs.length),
  );
  const exitHookX: number = exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH / 2;
  return {
    cages: hangs.map(
      (hang: Platform | null, i: number): HangingCage => ({
        hang,
        landY: hang ? cageLandY(hang, platforms) : GAME_CONSTANTS.GROUND_Y,
        content: contents[i],
        cleatX: cleats[i].x,
        cleatY: cleats[i].y,
        kinks: chainKinks(rand, cleats[i].x, hang ? hang.x + hang.width / 2 : exitHookX),
      }),
    ),
  };
}
/**
 * The ledge the floor-5 plate is set into: the highest regular ledge (never the safe spot) on the
 * far half of the screen from the exit, the farthest from the exit among equals; null if none.
 */
function plateLedge(exitX: number, platforms: Platform[]): Platform | null {
  const half: number = GAME_CONSTANTS.CANVAS_WIDTH / 2;
  const exitCenter: number = exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH / 2;
  const fromExit: (p: Platform) => number = (p: Platform): number =>
    Math.abs(p.x + p.width / 2 - exitCenter);
  const minWidth: number = GAME_CONSTANTS.PLATE_WIDTH_PX + 2 * GAME_CONSTANTS.LEVEL_TILE_PX;
  const ledges: Platform[] = platforms
    .filter(
      (p: Platform): boolean =>
        !p.safe && p.width >= minWidth && (p.x + p.width / 2 < half) !== (exitCenter < half),
    )
    .sort((a: Platform, b: Platform): number => a.y - b.y || fromExit(b) - fromExit(a));
  return ledges[0] ?? null;
}

/**
 * Floor-5 puzzle: the pressure plate, centered in the top of its ledge, or on the ground on the
 * far side from the exit when no ledge fits.
 */
function placePlatePuzzle(exitX: number, platforms: Platform[]): PlatePuzzleLayout {
  const width: number = GAME_CONSTANTS.PLATE_WIDTH_PX;
  const ledge: Platform | null = plateLedge(exitX, platforms);
  if (ledge) return { plateX: ledge.x + (ledge.width - width) / 2, plateY: ledge.y };
  const exitOnRight: boolean =
    exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH / 2 > GAME_CONSTANTS.CANVAS_WIDTH / 2;
  const inset: number = 5 * GAME_CONSTANTS.LEVEL_TILE_PX;
  return {
    plateX: exitOnRight ? inset : GAME_CONSTANTS.CANVAS_WIDTH - inset - width,
    plateY: GAME_CONSTANTS.GROUND_Y,
  };
}

/** The scale's pan widened by its clearance: no platform hangs over it (bodies would land there). */
function scaleClearSpan(puzzle: SpringPuzzleLayout): [number, number] {
  const clear: number = GAME_CONSTANTS.SPRING_SCALE_CLEAR_PX;
  return [puzzle.scaleX - clear, puzzle.scaleX + GAME_CONSTANTS.SPRING_SCALE_WIDTH_PX + clear];
}

/** The spring's span widened by its clearance: platforms, ropes and props stay out of it. */
function springClearSpan(puzzle: SpringPuzzleLayout): [number, number] {
  const clear: number = GAME_CONSTANTS.SPRING_CLEAR_PX;
  return [puzzle.spring.x - clear, puzzle.spring.x + puzzle.spring.width + clear];
}

export function generateLevel(seed: number, floor: number): LevelLayout {
  const rand: Random = seededRandom((seed ^ Math.imul(floor, 0x9e3779b1)) >>> 0);
  const [tier1Y, tier2Y, tier3Y]: readonly number[] = GAME_CONSTANTS.LEVEL_TIER_Y;
  const exitOnRight: boolean = rand() < 0.5;
  const boulderPuzzle: BoulderPuzzleLayout | undefined =
    floor === GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR ? placeBoulderPuzzle(rand, exitOnRight) : undefined;
  // On the puzzle floor the exit platform is the boulder's ledge; elsewhere it hangs at an edge.
  const exitX: number = boulderPuzzle
    ? boulderPuzzle.ledgeX
    : exitOnRight
      ? GAME_CONSTANTS.CANVAS_WIDTH -
        GAME_CONSTANTS.EXIT_EDGE_MARGIN_PX -
        GAME_CONSTANTS.EXIT_PLATFORM_WIDTH
      : GAME_CONSTANTS.EXIT_EDGE_MARGIN_PX;
  const springPuzzle: SpringPuzzleLayout | undefined =
    floor === GAME_CONSTANTS.PUZZLE_SPRING_FLOOR ? placeSpringPuzzle(exitX, exitOnRight) : undefined;
  const avoid: Array<[number, number]> = boulderPuzzle
    ? [chuteSpan(boulderPuzzle)]
    : springPuzzle
      ? [springClearSpan(springPuzzle), scaleClearSpan(springPuzzle)]
      : [];

  const tier1: Platform[] = [];
  const tier1Count: number = randomInt(rand, 2, 3);
  for (let i: number = 0; i < tier1Count; i++) {
    const placed: Platform | null = tryPlace(
      rand,
      { y: tier1Y, minTiles: 5, maxTiles: 8, exitGap: exitGapFor(0), avoid },
      exitX,
      tier1,
      null,
    );
    if (placed) tier1.push(placed);
  }

  const platforms: Platform[] = [...tier1];
  const ropes: Rope[] = [];

  const tier2: Platform[] = [];
  const tier2Count: number = floor === 1 ? 1 : randomInt(rand, 1, 2);
  for (let i: number = 0; i < tier2Count; i++) {
    const rules: TierRules = {
      y: tier2Y,
      minTiles: 5,
      maxTiles: 9,
      exitGap: exitGapFor(1),
      avoid,
    };
    // Prefer a platform you can jump up to; otherwise hang a rope from it.
    const byJump: Platform | null = tryPlace(rand, rules, exitX, tier2, tier1);
    const placed: Platform | null = byJump ?? tryPlace(rand, rules, exitX, tier2, null);
    if (!placed) continue;
    tier2.push(placed);
    platforms.push(placed);
    if (!byJump) ropes.push(ropeFrom(rand, placed, platforms));
  }

  // Later floors always have at least one rope, and sometimes a third tier.
  if (floor > 1 && ropes.length === 0 && tier2.length > 0) {
    ropes.push(ropeFrom(rand, tier2[randomInt(rand, 0, tier2.length - 1)], platforms));
  }
  const { spot: safeSpot, ladder }: { spot: Platform; ladder: Rope } = placeSafeSpot(
    rand,
    exitX,
    boulderPuzzle ? GAME_CONSTANTS.BOULDER_SAFE_SPOT_GAP_PX : GAME_CONSTANTS.LEVEL_SAFE_SPOT_EXIT_GAP_PX,
    platforms,
  );
  platforms.push(safeSpot);
  ropes.push(ladder);

  if (floor > 1 && tier2.length > 0 && rand() < 0.5) {
    const placed: Platform | null = tryPlace(
      rand,
      { y: tier3Y, minTiles: 4, maxTiles: 6, exitGap: exitGapFor(2), avoid },
      exitX,
      // Keeps clear of the safe spot, so nothing blocks its ladder or crowds it from below.
      [safeSpot],
      tier2,
    );
    if (placed) platforms.push(placed);
  }

  const cagePuzzle: CagePuzzleLayout | undefined =
    floor === GAME_CONSTANTS.PUZZLE_CAGE_FLOOR ? placeCagePuzzle(rand, exitX, platforms, ropes) : undefined;
  const platePuzzle: PlatePuzzleLayout | undefined =
    floor === GAME_CONSTANTS.PUZZLE_PLATE_FLOOR ? placePlatePuzzle(exitX, platforms) : undefined;
  const props: Prop[] = placeProps(rand, {
    platforms,
    ropes,
    exitX,
    boulderPuzzle,
    springPuzzle,
    cagePuzzle,
    platePuzzle,
  });
  // Normal floors leave the keys out, so their layouts compare equal to before.
  if (boulderPuzzle) return { seed, floor, platforms, ropes, exitX, props, boulderPuzzle };
  if (springPuzzle) return { seed, floor, platforms, ropes, exitX, props, springPuzzle };
  if (cagePuzzle) return { seed, floor, platforms, ropes, exitX, props, cagePuzzle };
  if (platePuzzle) return { seed, floor, platforms, ropes, exitX, props, platePuzzle };
  return { seed, floor, platforms, ropes, exitX, props };
}

/** Broken rules of the floor-2 puzzle. */
function boulderPuzzleProblems(layout: LevelLayout, puzzle: BoulderPuzzleLayout): string[] {
  const out: string[] = [];
  const wall: Platform = puzzle.wall;
  if (wall.x !== 0 && wall.x + wall.width !== GAME_CONSTANTS.CANVAS_WIDTH) {
    out.push('wall: not at a screen edge');
  }
  if (wall.y !== 0 || wall.height !== GAME_CONSTANTS.GROUND_Y) {
    out.push('wall: does not span the screen top to the ground');
  }
  if ((puzzle.wallDir === 1) !== (wall.x > 0)) out.push('wall: on the wrong side of the ledge');
  if (layout.exitX !== puzzle.ledgeX) out.push('ledge: not where the exit platform hangs');
  const [from, to]: [number, number] = chuteSpan(puzzle);
  const span: number = to - from;
  if (
    span < GAME_CONSTANTS.BOULDER_CHUTE_MIN_SPAN_PX ||
    span > GAME_CONSTANTS.BOULDER_CHUTE_MAX_SPAN_PX
  ) {
    out.push(`chute: spans ${span} px`);
  }
  for (const p of layout.platforms) {
    if (p.x < to && p.x + p.width > from) out.push(`platform ${p.x},${p.y}: under the chute`);
  }
  for (const r of layout.ropes) {
    if (r.x > from && r.x < to) out.push(`rope at ${r.x}: under the chute`);
  }
  return out;
}

/** Broken rules of the floor-3 puzzle. */
function springPuzzleProblems(layout: LevelLayout, puzzle: SpringPuzzleLayout): string[] {
  const out: string[] = [];
  const block: Platform = puzzle.spring;
  const right: number = block.x + block.width;
  const grounded: boolean = block.y + block.height === GAME_CONSTANTS.GROUND_Y;
  if (block.height !== GAME_CONSTANTS.SPRING_HEIGHT_PX || !grounded) {
    out.push('spring: not standing on the ground at its height');
  }
  const atRight: boolean = right === GAME_CONSTANTS.CANVAS_WIDTH;
  if (block.x !== 0 && !atRight) out.push('spring: not at a screen edge');
  if ((puzzle.side === 1) !== atRight) out.push('spring: side does not match its edge');
  const exitRight: number = layout.exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH;
  if (block.x > layout.exitX || right < exitRight) out.push('spring: not under the whole exit');
  if (puzzle.scaleX !== farScaleX(puzzle.side)) out.push('scale: not on the far side of the floor');
  const [panFrom, panTo]: [number, number] = scaleClearSpan(puzzle);
  for (const p of layout.platforms) {
    if (p.x < panTo && p.x + p.width > panFrom) out.push(`platform ${p.x},${p.y}: over the scale`);
  }
  for (const r of layout.ropes) {
    if (r.x > panFrom && r.x < panTo) out.push(`rope at ${r.x}: over the scale`);
  }
  const [from, to]: [number, number] = springClearSpan(puzzle);
  for (const p of layout.platforms) {
    if (p.x < to && p.x + p.width > from) out.push(`platform ${p.x},${p.y}: over the spring`);
  }
  for (const r of layout.ropes) {
    if (r.x > from && r.x < to) out.push(`rope at ${r.x}: over the spring`);
  }
  return out;
}

/** Broken rules of the floor-4 puzzle. */
function cagePuzzleProblems(layout: LevelLayout, puzzle: CagePuzzleLayout): string[] {
  const out: string[] = [];
  const cages: HangingCage[] = puzzle.cages;
  if (cages.length < GAME_CONSTANTS.CAGE_COUNT_MIN || cages.length > GAME_CONSTANTS.CAGE_COUNT_MAX) {
    out.push(`cages: ${cages.length}, not ${GAME_CONSTANTS.CAGE_COUNT_MIN}-${GAME_CONSTANTS.CAGE_COUNT_MAX}`);
  }
  if (cages[0]?.hang !== null || cages[0]?.landY !== GAME_CONSTANTS.GROUND_Y) {
    out.push('exit cage: not first, or not landing on the ground under the exit');
  }
  const spots: number[] = midCageSpots(layout.exitX, layout.platforms);
  const mids: Platform[] = cages.slice(1).map((c: HangingCage): Platform | null => c.hang)
    .filter((h: Platform | null): h is Platform => h !== null);
  if (mids.length !== cages.length - 1) out.push('mid cages: one has no hanging spot');
  const headroom: number = GAME_CONSTANTS.PLAYER_HEIGHT + 4;
  cages.slice(1).forEach((c: HangingCage): void => {
    const h: Platform | null = c.hang;
    if (!h) return;
    if (h.width !== GAME_CONSTANTS.CAGE_MID_SIZE_PX || h.height !== GAME_CONSTANTS.CAGE_MID_SIZE_PX) {
      out.push(`mid cage ${h.x}: wrong size`);
    }
    if (h.y !== GAME_CONSTANTS.CAGE_MID_TOP_Y) out.push(`mid cage ${h.x}: not at its hanging height`);
    if (!spots.includes(h.x)) out.push(`mid cage ${h.x}: too close to the exit or the safe spot`);
    if (c.landY !== cageLandY(h, layout.platforms)) out.push(`mid cage ${h.x}: wrong landing`);
    const crowded: boolean = layout.platforms.some(
      (p: Platform): boolean =>
        p.y > h.y && p.y < h.y + h.height + headroom && spanGap(h.x, h.x + h.width, p.x, p.x + p.width) === 0,
    );
    if (crowded) out.push(`mid cage ${h.x}: a platform crowds it`);
  });
  const apart: number = GAME_CONSTANTS.CAGE_MID_SIZE_PX + GAME_CONSTANTS.CAGE_MID_GAP_PX;
  mids.forEach((a: Platform, i: number): void => {
    if (mids.slice(i + 1).some((b: Platform): boolean => Math.abs(a.x - b.x) < apart)) {
      out.push(`mid cage ${a.x}: too close to another`);
    }
  });
  const mix: CageContent[] = cageContentMix(cages.length);
  const count: (list: CageContent[], c: CageContent) => number = (list: CageContent[], c: CageContent): number =>
    list.filter((x: CageContent): boolean => x === c).length;
  const contents: CageContent[] = cages.map((c: HangingCage): CageContent => c.content);
  if ((['zombies', 'loot', 'empty'] as CageContent[]).some((c: CageContent): boolean => count(contents, c) !== count(mix, c))) {
    out.push('contents: not the zombies / loot / empty mix');
  }
  const allowed: Array<{ x: number; y: number }> = cleatSpots(layout.exitX, layout.platforms, layout.ropes);
  const keys: string[] = cages.map((c: HangingCage): string => `${c.cleatX},${c.cleatY}`);
  const onSpot: boolean = keys.every((k: string): boolean =>
    allowed.some((s: { x: number; y: number }): boolean => `${s.x},${s.y}` === k),
  );
  if (!onSpot || new Set(keys).size !== keys.length) out.push('cleats: not one per cage on the cleat spots');
  const inBand: boolean = cages.every(
    (c: HangingCage): boolean =>
      c.kinks.length === GAME_CONSTANTS.CAGE_CHAIN_KINKS &&
      c.kinks.every(
        (k: { x: number; y: number }): boolean =>
          k.y >= GAME_CONSTANTS.CAGE_CHAIN_TOP_Y &&
          k.y <= GAME_CONSTANTS.CAGE_CHAIN_BOTTOM_Y &&
          k.x >= 0 &&
          k.x <= GAME_CONSTANTS.CANVAS_WIDTH,
      ),
  );
  if (!inBand) out.push('chains: kinks outside the ceiling band');
  return out;
}

/** Broken rules of the floor-5 puzzle. */
function platePuzzleProblems(layout: LevelLayout, puzzle: PlatePuzzleLayout): string[] {
  const out: string[] = [];
  const left: number = puzzle.plateX;
  const right: number = left + GAME_CONSTANTS.PLATE_WIDTH_PX;
  const ledge: Platform | null = plateLedge(layout.exitX, layout.platforms);
  const surface: Platform = ledge ?? GROUND_PLATFORM;
  const expected: PlatePuzzleLayout = placePlatePuzzle(layout.exitX, layout.platforms);
  if (left < surface.x || right > surface.x + surface.width || left < 0 || right > GAME_CONSTANTS.CANVAS_WIDTH) {
    out.push('plate: hangs off its surface');
  }
  if (left !== expected.plateX || puzzle.plateY !== expected.plateY) out.push('plate: not where it belongs');
  const half: number = GAME_CONSTANTS.CANVAS_WIDTH / 2;
  const exitCenter: number = layout.exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH / 2;
  if (((left + right) / 2 < half) === (exitCenter < half)) out.push('plate: on the exit side');
  return out;
}

/**
 * Rules every generated layout must satisfy (unit-tested over many seeds). Returns the broken
 * rules; empty means valid.
 */
export function levelViolations(layout: LevelLayout): string[] {
  const out: string[] = [];
  const tile: number = GAME_CONSTANTS.LEVEL_TILE_PX;
  const exitLeft: number = layout.exitX;
  const exitRight: number = layout.exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH;
  const tiers: readonly number[] = GAME_CONSTANTS.LEVEL_TIER_Y;
  const puzzle: BoulderPuzzleLayout | undefined = layout.boulderPuzzle;
  const puzzleFloor: boolean = layout.floor === GAME_CONSTANTS.PUZZLE_BOULDER_FLOOR;
  if (puzzleFloor && !puzzle) out.push('puzzle floor without a boulder puzzle');
  if (!puzzleFloor && puzzle) out.push('boulder puzzle on a normal floor');
  if (puzzle) out.push(...boulderPuzzleProblems(layout, puzzle));
  const spring: SpringPuzzleLayout | undefined = layout.springPuzzle;
  const springFloor: boolean = layout.floor === GAME_CONSTANTS.PUZZLE_SPRING_FLOOR;
  if (springFloor && !spring) out.push('spring floor without a spring');
  if (!springFloor && spring) out.push('spring on another floor');
  if (spring) out.push(...springPuzzleProblems(layout, spring));
  const cages: CagePuzzleLayout | undefined = layout.cagePuzzle;
  const cageFloor: boolean = layout.floor === GAME_CONSTANTS.PUZZLE_CAGE_FLOOR;
  if (cageFloor && !cages) out.push('cage floor without cages');
  if (!cageFloor && cages) out.push('cages on another floor');
  if (cages) out.push(...cagePuzzleProblems(layout, cages));
  const plate: PlatePuzzleLayout | undefined = layout.platePuzzle;
  const plateFloor: boolean = layout.floor === GAME_CONSTANTS.PUZZLE_PLATE_FLOOR;
  if (plateFloor && !plate) out.push('plate floor without a plate');
  if (!plateFloor && plate) out.push('plate on another floor');
  if (plate) out.push(...platePuzzleProblems(layout, plate));

  for (const p of layout.platforms) {
    const name: string = `platform ${p.x},${p.y} w${p.width}`;
    const tierIndex: number = tiers.indexOf(p.y);
    if (tierIndex < 0 && !p.safe) out.push(`${name}: not on a tier`);
    if (p.width % tile !== 0 || p.height !== tile) out.push(`${name}: not whole tiles`);
    if (p.x < 0 || p.x + p.width > GAME_CONSTANTS.CANVAS_WIDTH) out.push(`${name}: off screen`);
    if (
      tierIndex >= 0 &&
      spanGap(p.x, p.x + p.width, exitLeft, exitRight) < exitGapFor(tierIndex)
    ) {
      out.push(`${name}: too close to the exit`);
    }
    for (const q of layout.platforms) {
      if (q !== p && q.y === p.y && platformGap(p, q) < GAME_CONSTANTS.LEVEL_PLATFORM_GAP_PX) {
        out.push(`${name}: crowds another platform`);
      }
    }
  }

  for (const r of layout.ropes) {
    const top: Platform | undefined = layout.platforms.find(
      (p: Platform): boolean => p.y === r.topY && r.x >= p.x && r.x <= p.x + p.width,
    );
    if (!top) out.push(`rope at ${r.x}: does not hang from a platform`);
    if (r.bottomY !== surfaceUnder(r.x, r.topY, layout.platforms)) {
      out.push(`rope at ${r.x}: does not reach the surface below`);
    }
    if (spanGap(r.x - 16, r.x + 16, exitLeft, exitRight) < GAME_CONSTANTS.LEVEL_EXIT_CLEARANCE_PX) {
      out.push(`rope at ${r.x}: under the exit`);
    }
    if (!ropeLandsCleanly(r, layout.platforms)) out.push(`rope at ${r.x}: ends on a platform edge`);
  }

  for (const prop of layout.props) {
    for (const problem of propProblems(prop, layout))
      out.push(`prop ${prop.kind} at ${prop.x},${prop.y}: ${problem}`);
  }

  const safeSpots: Platform[] = layout.platforms.filter((p: Platform): boolean => p.safe === true);
  if (safeSpots.length !== 1) out.push(`${safeSpots.length} safe spots, want exactly 1`);
  for (const spot of safeSpots) {
    const name: string = `safe spot ${spot.x},${spot.y}`;
    if (spot.y !== GAME_CONSTANTS.LEVEL_SAFE_SPOT_Y) out.push(`${name}: not at the safe-spot height`);
    const spotGap: number = puzzle
      ? GAME_CONSTANTS.BOULDER_SAFE_SPOT_GAP_PX
      : GAME_CONSTANTS.LEVEL_SAFE_SPOT_EXIT_GAP_PX;
    if (spanGap(spot.x, spot.x + spot.width, exitLeft, exitRight) < spotGap) {
      out.push(`${name}: too close to the exit`);
    }
    const hasLadder: boolean = layout.ropes.some(
      (r: Rope): boolean => r.topY === spot.y && r.x >= spot.x && r.x <= spot.x + spot.width,
    );
    if (!hasLadder) out.push(`${name}: no ladder`);
    if (layout.props.some((prop: Prop): boolean => prop.y + prop.height === spot.y)) {
      out.push(`${name}: has a prop on it`);
    }
    const crowded: boolean = layout.platforms.some(
      (q: Platform): boolean =>
        q !== spot &&
        q.y > spot.y &&
        q.y - spot.y <= 100 &&
        platformGap(q, spot) < GAME_CONSTANTS.LEVEL_PLATFORM_GAP_PX,
    );
    if (crowded) out.push(`${name}: a platform crowds it from below`);
  }

  // Every platform is reachable from the ground by jumping up a tier or by rope.
  const reached: Set<Platform> = new Set<Platform>();
  let grew: boolean = true;
  while (grew) {
    grew = false;
    for (const p of layout.platforms) {
      if (reached.has(p)) continue;
      const fromGround: boolean = GAME_CONSTANTS.GROUND_Y - p.y <= 100;
      const fromBelow: boolean = [...reached].some(
        (q: Platform): boolean =>
          q.y > p.y && q.y - p.y <= 100 && platformGap(p, q) <= GAME_CONSTANTS.LEVEL_STEP_UP_GAP_PX,
      );
      const byRope: boolean = layout.ropes.some(
        (r: Rope): boolean =>
          r.topY === p.y &&
          r.x >= p.x &&
          r.x <= p.x + p.width &&
          (r.bottomY === GAME_CONSTANTS.GROUND_Y ||
            [...reached].some(
              (q: Platform): boolean => q.y === r.bottomY && r.x >= q.x && r.x <= q.x + q.width,
            )),
      );
      if (fromGround || fromBelow || byRope) {
        reached.add(p);
        grew = true;
      }
    }
  }
  for (const p of layout.platforms) {
    if (!reached.has(p)) out.push(`platform ${p.x},${p.y}: unreachable`);
  }
  return out;
}
