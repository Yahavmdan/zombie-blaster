import { GAME_CONSTANTS } from '@shared/index';
import { BoulderPuzzleLayout, Platform, Rope, SpringPuzzleLayout } from './engine-types';
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

type Random = () => number;

/** Small, fast, deterministic PRNG (mulberry32). */
function seededRandom(seed: number): Random {
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
  /** A horizontal span no platform may overlap (a puzzle's chute or spring), or null. */
  avoid: [number, number] | null;
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
    if (rules.avoid && x < rules.avoid[1] && x + width > rules.avoid[0]) continue;
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

/** Map props (barrels, boxes, lockers, fences): solid, so you can stand on them and bump into them. */
export type PropKind =
  | 'barrel1'
  | 'barrel2'
  | 'barrel3'
  | 'box1'
  | 'box2'
  | 'box3'
  | 'fence1'
  | 'fence2'
  | 'fence3'
  | 'locker1'
  | 'locker2';

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

export const PROP_ART: Record<PropKind, PropArt> = {
  barrel1: { src: 'tiles/objects/Barrel1.png', left: 0, top: 4, right: 17, bottom: 25 },
  barrel2: { src: 'tiles/objects/Barrel2.png', left: 0, top: 1, right: 17, bottom: 25 },
  barrel3: { src: 'tiles/objects/Barrel3.png', left: 0, top: 3, right: 17, bottom: 25 },
  box1: { src: 'tiles/objects/Box1.png', left: 2, top: 10, right: 29, bottom: 31 },
  box2: { src: 'tiles/objects/Box2.png', left: 2, top: 10, right: 29, bottom: 31 },
  box3: { src: 'tiles/objects/Box3.png', left: 3, top: 16, right: 28, bottom: 31 },
  fence1: { src: 'tiles/objects/Fence1.png', left: 0, top: 16, right: 31, bottom: 31 },
  fence2: { src: 'tiles/objects/Fence2.png', left: 0, top: 16, right: 31, bottom: 31 },
  fence3: { src: 'tiles/objects/Fence3.png', left: 0, top: 16, right: 20, bottom: 31 },
  locker1: { src: 'tiles/objects/Locker1.png', left: 1, top: 1, right: 30, bottom: 22 },
  locker2: { src: 'tiles/objects/Locker2.png', left: 1, top: 1, right: 31, bottom: 23 },
};

const PROP_KINDS: PropKind[] = Object.keys(PROP_ART) as PropKind[];
const STACKABLE: PropKind[] = ['box1', 'box2', 'box3'];

/** A prop's collision box (top-left x/y, size) equals its visible art. */
export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

function propBox(kind: PropKind, x: number, surfaceY: number): Prop {
  const art: PropArt = PROP_ART[kind];
  const width: number = art.right - art.left + 1;
  const height: number = art.bottom - art.top + 1;
  return { kind, x, y: surfaceY - height, width, height };
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
  }
  return out;
}

/** Scatters props on the ground and platforms (some boxes stacked), each passing propProblems. */
function placeProps(rand: Random, layout: Omit<PropContext, 'props'>): Prop[] {
  const props: Prop[] = [];
  const wanted: number = randomInt(rand, 3, 7);
  for (let i: number = 0; i < wanted; i++) {
    for (let attempt: number = 0; attempt < 30; attempt++) {
      const kind: PropKind = PROP_KINDS[randomInt(rand, 0, PROP_KINDS.length - 1)];
      const art: PropArt = PROP_ART[kind];
      const width: number = art.right - art.left + 1;
      const bases: Prop[] = props.filter(
        (q: Prop): boolean =>
          STACKABLE.includes(q.kind) && !props.some((t: Prop): boolean => t.y + t.height === q.y),
      );
      let candidate: Prop;
      if (STACKABLE.includes(kind) && bases.length > 0 && rand() < 0.35) {
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
        candidate = propBox(kind, randomInt(rand, minX, maxX), surface.y);
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
  for (let attempt: number = 0; attempt < 40 && !ropeLandsCleanly(ladder, below); attempt++) {
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
 * exit (which hangs at the very top) is straight above it.
 */
function placeSpringPuzzle(exitX: number, exitOnRight: boolean): SpringPuzzleLayout {
  const height: number = GAME_CONSTANTS.SPRING_HEIGHT_PX;
  const y: number = GAME_CONSTANTS.GROUND_Y - height;
  const exitRight: number = exitX + GAME_CONSTANTS.EXIT_PLATFORM_WIDTH;
  return exitOnRight
    ? { spring: { x: exitX, y, width: GAME_CONSTANTS.CANVAS_WIDTH - exitX, height }, side: 1 }
    : { spring: { x: 0, y, width: exitRight, height }, side: -1 };
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
  const avoid: [number, number] | null = boulderPuzzle
    ? chuteSpan(boulderPuzzle)
    : springPuzzle
      ? springClearSpan(springPuzzle)
      : null;

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

  const props: Prop[] = placeProps(rand, { platforms, ropes, exitX, boulderPuzzle, springPuzzle });
  // Normal floors leave the keys out, so their layouts compare equal to before.
  if (boulderPuzzle) return { seed, floor, platforms, ropes, exitX, props, boulderPuzzle };
  if (springPuzzle) return { seed, floor, platforms, ropes, exitX, props, springPuzzle };
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
  const [from, to]: [number, number] = springClearSpan(puzzle);
  for (const p of layout.platforms) {
    if (p.x < to && p.x + p.width > from) out.push(`platform ${p.x},${p.y}: over the spring`);
  }
  for (const r of layout.ropes) {
    if (r.x > from && r.x < to) out.push(`rope at ${r.x}: over the spring`);
  }
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
