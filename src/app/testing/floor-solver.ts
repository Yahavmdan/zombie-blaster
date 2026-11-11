import {
  CharacterClass,
  CharacterState,
  Direction,
  GAME_CONSTANTS,
  InputKeys,
  ZOMBIE_TYPES,
  ZombieType,
} from '@shared/index';
import { GadgetState, LooseProp, ZombieCorpse } from '@shared/game-entities';
import { Box } from '../engine/boulder-puzzle';
import { calculateDerived } from '../engine/derived-stats';
import {
  CrackWallGadget,
  EXIT_TARGET,
  Gadget,
  LauncherGadget,
  Platform,
} from '../engine/engine-types';
import {
  boulderBox,
  boulderResting,
  crackBand,
  isLauncher,
  isWired,
  launchVelocity,
  stateOf,
  swingHits,
} from '../engine/gadgets';
import { GameEngine } from '../engine/game-engine';
import { PhysicsSystem } from '../engine/physics-system';
import { SpawnSpan, spawnSpans } from '../engine/spawn-zones';
import {
  E2eFloorVerdict,
  E2eSolverAction,
  E2eSolverMove,
  E2eSolverSpot,
  E2eSolverSteer,
} from './e2e-api';

/**
 * Floor solver for designed floors (DESIGNED_LEVELS): can a player who just started (a level-1
 * warrior with no points spent: walk, one jump, ladders, swing, carry one thing, kill zombies for
 * bodies; no skills, no double jump) finish the floor, and is there no soft lock (a state the
 * player can get into from which the exit can no longer be reached)?
 *
 * It runs on a real GameEngine: the player moves with the real PhysicsSystem under real key plans
 * (walk, jumps steered four ways, drop through, ropes, unwired launchers), and the world (doors,
 * boulders, crack walls, launchers, corpses, props) moves with the engine's own update. It searches
 * world states: the gadgets' states, the weight left on buttons, the props, and the spots the
 * player can reach from where they stand. A world move is one thing the player does to the world:
 * leave weight on a button (or take it off), stand on a button a while and step off, swing at a
 * boulder, crack wall or lever. Where zombies rise (a spawn span the player can reach) the player
 * has as many bodies as they like: they leave them on buttons and pile them up to climb
 * (FLOOR_SOLVER_PILE_MAX_PX at most). Not modelled (so never counted on): lighting barrels,
 * carrying props anywhere but onto a button, bins and cages (a floor with one fails loudly).
 */

const W: number = GAME_CONSTANTS.PLAYER_WIDTH;
const H: number = GAME_CONSTANTS.PLAYER_HEIGHT;
const SNAP: number = GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE;

/** Ticks a jump is held: to its top and through the apex hang. */
export const SOLVER_JUMP_HOLD_TICKS: number = 30;
/** Ticks a jump rises before it turns. */
export const SOLVER_JUMP_RISE_TICKS: number = 22;
/** Ticks a walk step (or a tapped steer) holds its key. */
export const SOLVER_WALK_TICKS: number = 6;

export type SolverSpot = E2eSolverSpot;
export type SolverSteer = E2eSolverSteer;
export type SolverMove = E2eSolverMove;
export type SolverAction = E2eSolverAction;
export type FloorVerdict = E2eFloorVerdict;

/** A short line for a move. */
export function describeMove(m: SolverMove): string {
  const from: string = `(${Math.round(m.from.x)}, ${Math.round(m.from.y)})`;
  const pile: string = m.pilePx > 0 ? `on a ${m.pilePx} px pile of bodies, ` : '';
  const what: string =
    m.kind === 'jump'
      ? `jump ${side(m.dir)} (${m.steer})`
      : m.kind === 'ride'
        ? `ride ${m.launcher} steering ${side(m.dir)}`
        : m.kind === 'rope-jump'
          ? `jump ${side(m.dir)} to a rope`
          : m.kind === 'walk'
            ? `walk ${side(m.dir)}`
            : m.kind.replace('-', ' ');
  return `${pile}${what} from ${from}`;
}

/** A short line for a world move. */
export function describeAction(a: SolverAction): string {
  switch (a.kind) {
    case 'hold':
      return `leave weight on ${a.gadgetId}`;
    case 'release':
      return `take the weight off ${a.gadgetId}`;
    case 'stand':
      return `stand on ${a.gadgetId}, then step off`;
    case 'swing':
      return `swing once at ${a.gadgetId} facing ${side(a.dir)}`;
    case 'swing-on':
      return `keep swinging at ${a.gadgetId} facing ${side(a.dir)}`;
  }
}

/** The keys a move holds on tick `t` (the e2e replay holds them for t x 20 ms). */
export function moveKeys(m: SolverMove, t: number): Partial<InputKeys> {
  const dir: Partial<InputKeys> = m.dir < 0 ? { left: true } : m.dir > 0 ? { right: true } : {};
  switch (m.kind) {
    case 'walk':
      return t < SOLVER_WALK_TICKS ? dir : {};
    case 'jump':
      return { ...(steering(m.steer, t) ? dir : {}), jump: t < SOLVER_JUMP_HOLD_TICKS };
    case 'rope-jump':
      return { ...(steering('tap', t) ? dir : {}), jump: t < SOLVER_JUMP_HOLD_TICKS, up: true };
    case 'drop':
      return t === 0 ? { down: true, jump: true } : {};
    case 'climb-up':
      return { up: true };
    case 'climb-down':
      return { down: true };
    case 'ride':
      return dir;
  }
}

function steering(steer: SolverSteer, t: number): boolean {
  return (
    steer === 'all' ||
    (steer === 'rise' && t < SOLVER_JUMP_RISE_TICKS) ||
    (steer === 'late' && t >= SOLVER_JUMP_RISE_TICKS) ||
    (steer === 'tap' && t < SOLVER_WALK_TICKS)
  );
}

/** The world at one moment: everything a move can change. */
interface World {
  gadgetStates: GadgetState[];
  corpses: ZombieCorpse[];
  props: LooseProp[];
  platforms: Platform[];
  player: SolverSpot;
  /** Buttons/scales with weight left on them: the corpse ids lying there. */
  held: Record<string, string[]>;
}

/** The spots the player can reach in one world, and how. */
interface Region {
  spots: SolverSpot[];
  /** Each spot's key: the move that first reached it (none for the start). */
  via: Map<string, SolverMove>;
  key: string;
  /** Zombies rise somewhere the player can go: bodies to pile and leave on buttons. */
  bodies: boolean;
  /** A spot that finishes the floor, if any. */
  exit: SolverSpot | null;
}

interface SearchState {
  world: World;
  region: Region;
  parent: number;
  /** The world move that led here (null for the start and a floor ended mid-move). */
  action: SolverAction | null;
  next: number[];
  exit: boolean;
  /** The floor ended during the move that led here. */
  ended: boolean;
}

/** A simulated move, kept with the box its path swept and what stood in that box then. */
interface CachedSim {
  sweep: Box;
  near: string;
  to: SolverSpot | null;
}

/** A move's keys without its spots (a template tried from every spot). */
type MoveKind = Omit<SolverMove, 'from' | 'to'>;

function side(d: number): string {
  return d < 0 ? 'left' : d > 0 ? 'right' : 'up';
}

function spotKey(n: SolverSpot): string {
  return `${Math.round(n.x / GAME_CONSTANTS.FLOOR_SOLVER_NODE_PX)}:${Math.round(n.y)}`;
}

/** Walker bodies that weigh `kg` or more (at least one). */
function bodiesFor(kg: number): number {
  return Math.max(1, Math.ceil(kg / ZOMBIE_TYPES[ZombieType.Walker].weightKg));
}

/** The cell a spot falls in, for telling regions apart. */
function regionCell(n: SolverSpot): string {
  const c: number = GAME_CONSTANTS.FLOOR_SOLVER_REGION_CELL_PX;
  return `${Math.round(n.x / c)}:${Math.round(n.y / c)}`;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** FNV-1a: a short key for a long string. */
function hash(s: string): string {
  let h: number = 0x811c9dc5;
  for (let i: number = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function move(
  kind: SolverMove['kind'],
  dir: number,
  steer: SolverSteer = 'all',
  launcher: string = '',
): MoveKind {
  return { kind, dir, steer, pilePx: 0, launcher };
}

/** A level-1 warrior with no points spent anywhere: the slowest, weakest start. */
export function basicPlayer(): CharacterState {
  const stats: CharacterState['stats'] = { str: 0, dex: 0, int: 0, luk: 0 };
  const derived: CharacterState['derived'] = calculateDerived(
    stats,
    stats,
    CharacterClass.Warrior,
    1,
  );
  return {
    id: 'solver',
    name: 'Solver',
    classId: CharacterClass.Warrior,
    level: 1,
    xp: 0,
    xpToNext: 100,
    hp: derived.maxHp,
    mp: derived.maxMp,
    stats,
    derived,
    allocatedStats: { str: 0, dex: 0, int: 0, luk: 0 },
    unallocatedStatPoints: 0,
    unallocatedSkillPoints: 0,
    skillLevels: {},
    activeBuffs: [],
    inventory: { potions: {}, gold: 0, autoPotionHpId: null, autoPotionMpId: null },
    x: GAME_CONSTANTS.CANVAS_WIDTH / 2 - W / 2,
    y: GAME_CONSTANTS.GROUND_Y - H,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    isDead: false,
    isDown: false,
    downTimer: 0,
    isAttacking: false,
    isDoubleJumping: false,
    isClimbing: false,
    facing: Direction.Right,
  };
}

export class FloorSolver {
  private readonly physics: PhysicsSystem;
  private readonly player: CharacterState;
  private readonly states: SearchState[] = [];
  private readonly index: Map<string, number> = new Map<string, number>();
  /** The floor's gadgets, as built at its start. */
  private floorGadgets: Gadget[] = [];
  /** No key held (a fresh engine's keys). */
  private readonly idle: InputKeys;
  /**
   * Moves simulated so far, by spot and keys: each kept with the box its path swept and what
   * stood in that box. A later world reuses it while nothing in that box changed.
   */
  private readonly sims: Map<string, CachedSim[]> = new Map<string, CachedSim[]>();
  /** Called with a line per state found (a slow floor shows where the time goes). */
  onProgress: ((line: string) => void) | null = null;

  constructor(
    private readonly engine: GameEngine,
    private readonly floor: number,
  ) {
    this.physics = engine['physicsSystem'];
    this.idle = { ...engine.keys };
    this.player = basicPlayer();
  }

  solve(): FloorVerdict {
    this.startFloor();
    this.floorGadgets = structuredClone(this.engine.gadgets);
    for (const g of this.gadgets()) {
      if (g.kind === 'bin' || g.kind === 'cage') {
        throw new Error(
          `floor ${this.floor}: the solver has no rules for a ${g.kind} yet (${g.id}): teach FloorSolver first`,
        );
      }
    }
    this.settle(true);
    this.add(this.snapshot(this.playerSpot()), -1, null);
    for (let i: number = 0; i < this.states.length; i++) {
      if (this.states.length > GAME_CONSTANTS.FLOOR_SOLVER_MAX_STATES) {
        throw new Error(
          `floor ${this.floor}: over ${GAME_CONSTANTS.FLOOR_SOLVER_MAX_STATES} states, the solver can't finish`,
        );
      }
      // A player in reach of the exit may still do something else first: every state is tried.
      if (!this.states[i].ended) this.expand(i);
    }
    return this.verdict();
  }

  // ─── The search ──────────────────────────────────────────

  private add(world: World, parent: number, action: SolverAction | null): number {
    this.restore(world);
    const region: Region = this.region(world.player);
    const key: string = `${this.worldKey(world)}|${region.key}`;
    const known: number | undefined = this.index.get(key);
    if (known !== undefined) return known;
    const id: number = this.states.length;
    this.states.push({
      world,
      region,
      parent,
      action,
      next: [],
      exit: region.exit !== null,
      ended: false,
    });
    this.index.set(key, id);
    this.onProgress?.(
      `state ${id}: ${region.spots.length} spots, bodies ${region.bodies}, exit ${region.exit !== null}` +
        (action ? `, by ${describeAction(action)}` : ''),
    );
    return id;
  }

  private link(from: number, world: World | 'exit', action: SolverAction): void {
    const s: SearchState = this.states[from];
    if (world === 'exit') {
      // The floor ended during the move: a state that is already out.
      const id: number = this.states.length;
      this.states.push({
        world: s.world,
        region: s.region,
        parent: from,
        action,
        next: [],
        exit: true,
        ended: true,
      });
      s.next.push(id);
      return;
    }
    const to: number = this.add(world, from, action);
    if (!s.next.includes(to)) s.next.push(to);
  }

  private expand(id: number): void {
    const s: SearchState = this.states[id];
    const spots: SolverSpot[] = s.region.spots;
    const act: (
      kind: SolverAction['kind'],
      g: Gadget,
      spot: SolverSpot,
      dir: number,
    ) => SolverAction = (
      kind: SolverAction['kind'],
      g: Gadget,
      spot: SolverSpot,
      dir: number,
    ): SolverAction => ({
      kind,
      gadgetId: g.id,
      dir,
      spot,
      area: { x: g.x, y: g.y, width: g.width },
      bodies: kind === 'hold' && (g.kind === 'button' || g.kind === 'scale') ? bodiesFor(g.kg) : 0,
      route: this.route(s.region, spot),
    });
    for (const g of this.gadgets()) {
      if (g.kind !== 'button' && g.kind !== 'scale') continue;
      const on: SolverSpot[] = spots.filter((n: SolverSpot): boolean => this.standsOn(n, g));
      if (on.length === 0) continue;
      const spot: SolverSpot = on[Math.floor(on.length / 2)];
      if (s.world.held[g.id]) {
        this.link(id, this.release(s.world, g.id, spot), act('release', g, spot, 0));
        continue;
      }
      if (s.region.bodies || this.propKgNear(spots) >= g.kg) {
        this.link(id, this.hold(s.world, g, spot), act('hold', g, spot, 0));
      }
      this.link(id, this.stand(s.world, spot), act('stand', g, spot, 0));
    }
    for (const g of this.gadgets()) {
      const box: Box | null = this.swingTarget(g, s.world);
      if (!box) continue;
      for (const dir of [-1, 1]) {
        const spot: SolverSpot | null = this.swingSpot(spots, box, dir);
        if (!spot) continue;
        this.link(id, this.swing(s.world, spot, dir, 1), act('swing', g, spot, dir));
        if (g.kind === 'crack-wall' || g.kind === 'boulder') {
          this.link(
            id,
            this.swing(s.world, spot, dir, GAME_CONSTANTS.FLOOR_SOLVER_SWING_HOLD_TICKS),
            act('swing-on', g, spot, dir),
          );
        }
      }
    }
  }

  private verdict(): FloorVerdict {
    // States from which the exit can still be reached (walking the links backwards).
    const good: Set<number> = new Set<number>();
    this.states.forEach((s: SearchState, i: number): void => {
      if (s.exit) good.add(i);
    });
    let grew: boolean = true;
    while (grew) {
      grew = false;
      this.states.forEach((s: SearchState, i: number): void => {
        if (good.has(i) || !s.next.some((n: number): boolean => good.has(n))) return;
        good.add(i);
        grew = true;
      });
    }
    const softLocks: string[] = [];
    this.states.forEach((_s: SearchState, i: number): void => {
      if (!good.has(i)) softLocks.push(this.path(i).map(describeAction).join(' > ') || 'the start');
    });
    const exit: number = this.states.findIndex((s: SearchState): boolean => s.exit);
    const out: SearchState | undefined = exit >= 0 ? this.states[exit] : undefined;
    return {
      floor: this.floor,
      solvable: good.has(0),
      skippable: this.states[0].exit,
      states: this.states.length,
      softLocks: good.has(0) ? softLocks : [],
      solution: exit >= 0 ? this.path(exit) : [],
      exitRoute: out?.region.exit ? this.route(out.region, out.region.exit) : [],
      exitSpot: out?.region.exit ?? null,
    };
  }

  private path(id: number): SolverAction[] {
    const actions: SolverAction[] = [];
    for (let i: number = id; i > 0; i = this.states[i].parent) {
      const a: SolverAction | null = this.states[i].action;
      if (a) actions.unshift(a);
    }
    return actions;
  }

  /** The moves from the region's start to `spot`. */
  private route(region: Region, spot: SolverSpot): SolverMove[] {
    const moves: SolverMove[] = [];
    let at: SolverMove | undefined = region.via.get(spotKey(spot));
    while (at && moves.length <= region.spots.length) {
      moves.unshift(at);
      at = region.via.get(spotKey(at.from));
    }
    return moves;
  }

  // ─── Moves on the world ──────────────────────────────────

  /** Bodies left on the button, enough for its kg: they stay until taken off. */
  private hold(world: World, g: Gadget & { kg: number }, spot: SolverSpot): World | 'exit' {
    this.restore(world, spot);
    const before: Set<string> = new Set<string>(
      this.engine.zombieCorpses.map((c: ZombieCorpse): string => c.id),
    );
    const count: number = bodiesFor(g.kg);
    this.engine.layCorpsesOn({ x: g.x, y: g.y, width: g.width, height: g.height }, count);
    const ids: string[] = this.engine.zombieCorpses
      .map((c: ZombieCorpse): string => c.id)
      .filter((cid: string): boolean => !before.has(cid));
    if (!this.settle(true)) return 'exit';
    return this.snapshot(this.playerSpot(), { ...world.held, [g.id]: ids });
  }

  private release(world: World, id: string, spot: SolverSpot): World | 'exit' {
    this.restore(world, spot);
    const ids: Set<string> = new Set<string>(world.held[id]);
    this.engine.zombieCorpses = this.engine.zombieCorpses.filter(
      (c: ZombieCorpse): boolean => !ids.has(c.id),
    );
    const held: Record<string, string[]> = { ...world.held };
    delete held[id];
    if (!this.settle(true)) return 'exit';
    return this.snapshot(this.playerSpot(), held);
  }

  /**
   * The player stands on the button a while (what it opens opens, what rolls rolls), then steps
   * off: the world settles without their weight, and they go on from that spot.
   */
  private stand(world: World, spot: SolverSpot): World | 'exit' {
    this.restore(world, spot);
    for (let t: number = 0; t < GAME_CONSTANTS.FLOOR_SOLVER_STAND_TICKS; t++) {
      if (!this.tick(true)) return 'exit';
    }
    this.settle(false);
    return this.snapshot(spot, world.held);
  }

  /** Swings facing `dir` from `spot`: one swing (`ticks` 1) or the attack held that long. */
  private swing(world: World, spot: SolverSpot, dir: number, ticks: number): World | 'exit' {
    this.restore(world, spot);
    this.player.facing = dir < 0 ? Direction.Left : Direction.Right;
    for (let t: number = 0; t < ticks; t++) {
      this.engine.setKeys({ ...this.idle, attack: true });
      if (!this.tick(true)) return 'exit';
    }
    this.engine.setKeys({ ...this.idle });
    if (!this.settle(true)) return 'exit';
    return this.snapshot(this.playerSpot(), world.held);
  }

  /** What a swing can hit on this gadget now, or null. */
  private swingTarget(g: Gadget, world: World): Box | null {
    const state: GadgetState | undefined = stateOf(world.gadgetStates, g.id);
    if (!state) return null;
    if (g.kind === 'boulder' && state.body && boulderResting(state.body))
      return boulderBox(state.body);
    if (g.kind === 'crack-wall' && !state.broken) return crackBand(g as CrackWallGadget);
    if (g.kind === 'lever') return g;
    return null;
  }

  /** The reachable spot nearest `box` from which a swing facing `dir` hits it. */
  private swingSpot(spots: SolverSpot[], box: Box, dir: number): SolverSpot | null {
    const facing: Direction = dir < 0 ? Direction.Left : Direction.Right;
    let best: SolverSpot | null = null;
    let bestGap: number = Infinity;
    for (const n of spots) {
      const hits: boolean = swingHits(
        { x: n.x, y: n.y, facing, isAttacking: true, isDead: false, isDown: false },
        box,
        GAME_CONSTANTS.GADGET_HIT_REACH_PX,
      );
      if (!hits) continue;
      const gap: number = Math.abs(n.x + W / 2 - (box.x + box.width / 2));
      if (gap < bestGap) {
        best = n;
        bestGap = gap;
      }
    }
    return best;
  }

  private standsOn(n: SolverSpot, g: Box): boolean {
    const cx: number = n.x + W / 2;
    return cx >= g.x && cx <= g.x + g.width && Math.abs(n.y + H - g.y) <= SNAP;
  }

  /** Kg of loose props lying where the player can pick them up. */
  private propKgNear(spots: SolverSpot[]): number {
    let kg: number = 0;
    for (const p of this.engine.looseProps) {
      const px: number = p.x + p.width / 2;
      const py: number = p.y + p.height / 2;
      const near: boolean = spots.some(
        (n: SolverSpot): boolean =>
          Math.hypot(n.x + W / 2 - px, n.y + H / 2 - py) <= GAME_CONSTANTS.CORPSE_CARRY_RANGE,
      );
      if (near) kg += p.weightKg;
    }
    return kg;
  }

  // ─── Engine plumbing ─────────────────────────────────────

  /** This floor's gadgets (the engine moves on to the next floor when a move ends this one). */
  private gadgets(): Gadget[] {
    return this.floorGadgets;
  }

  private startFloor(): void {
    const e: GameEngine = this.engine;
    e.designedFloors = true;
    e.godMode = true;
    e.zombieSpawnsPaused = true;
    // Where every player stands as a floor begins (ZombieSystem.resetPlayerToGround).
    this.place({ x: GAME_CONSTANTS.CANVAS_WIDTH / 2 - W / 2, y: GAME_CONSTANTS.GROUND_Y - H });
    e.setFloor(this.floor);
    e.zombies = [];
    e.setKeys({ ...this.idle });
  }

  /**
   * One engine tick with the player in the world (`withPlayer`), or of the world alone. Zombies
   * are cleared (a scripted clue zombie must not hold a button). False when the floor ended.
   */
  private tick(withPlayer: boolean): boolean {
    const e: GameEngine = this.engine;
    if (withPlayer) {
      e.player = this.player;
      e['update']();
    } else {
      e.player = null;
      e.gadgetSystem.update();
      e['explodingBarrelSystem'].update();
      e['loosePropSystem'].update();
      e['zombieSystem'].updateZombieCorpses();
      e.player = this.player;
    }
    e.zombies = [];
    return e.floor === this.floor;
  }

  /** Runs the world until nothing moves (or FLOOR_SOLVER_SETTLE_TICKS). False when the floor ended. */
  private settle(withPlayer: boolean): boolean {
    let quiet: number = 0;
    let last: string = '';
    for (let t: number = 0; t < GAME_CONSTANTS.FLOOR_SOLVER_SETTLE_TICKS; t++) {
      if (!this.tick(withPlayer)) return false;
      const now: string = this.motionKey();
      quiet = now === last ? quiet + 1 : 0;
      last = now;
      if (quiet >= GAME_CONSTANTS.FLOOR_SOLVER_QUIET_TICKS) break;
    }
    if (withPlayer) this.landPlayer();
    return true;
  }

  /** Lets the player come down onto something after a move. */
  private landPlayer(): void {
    this.engine.setKeys({ ...this.idle });
    for (
      let t: number = 0;
      t < GAME_CONSTANTS.FLOOR_SOLVER_MOVE_MAX_TICKS && !this.player.isGrounded;
      t++
    ) {
      this.movePlayer();
    }
  }

  /** Where everything that moves is: unchanged for a while = settled. */
  private motionKey(): string {
    const e: GameEngine = this.engine;
    const parts: string[] = e.gadgetStates.map(
      (s: GadgetState): string =>
        `${s.openTicks},${s.body ? `${s.body.x.toFixed(1)},${s.body.y.toFixed(1)}` : ''},${s.broken}`,
    );
    for (const c of e.zombieCorpses) parts.push(`${c.x.toFixed(0)},${c.y.toFixed(0)}`);
    for (const p of e.looseProps) parts.push(`${p.x.toFixed(0)},${p.y.toFixed(0)}`);
    parts.push(`${this.player.x.toFixed(0)},${this.player.y.toFixed(0)}`);
    return parts.join(';');
  }

  private playerSpot(): SolverSpot {
    return { x: this.player.x, y: this.player.y };
  }

  private snapshot(player: SolverSpot, held: Record<string, string[]> = {}): World {
    const e: GameEngine = this.engine;
    return {
      gadgetStates: structuredClone(e.gadgetStates),
      corpses: structuredClone(e.zombieCorpses),
      props: structuredClone(e.looseProps),
      platforms: structuredClone(e.platforms),
      player: { ...player },
      held: structuredClone(held),
    };
  }

  private restore(world: World, at: SolverSpot = world.player): void {
    const e: GameEngine = this.engine;
    if (e.floor !== this.floor) this.startFloor();
    e.gadgetStates = structuredClone(world.gadgetStates);
    e.zombieCorpses = structuredClone(world.corpses);
    e.looseProps = structuredClone(world.props);
    e.platforms = structuredClone(world.platforms);
    e.zombies = [];
    e.setKeys({ ...this.idle });
    this.place(at);
  }

  private place(n: SolverSpot): void {
    const p: CharacterState = this.player;
    this.engine.player = p;
    p.x = n.x;
    p.y = n.y;
    p.velocityX = 0;
    p.velocityY = 0;
    p.isGrounded = true;
    p.isClimbing = false;
    p.isAttacking = false;
    p.isDead = false;
    p.isDown = false;
    this.physics['coyoteTicks'] = 0;
    this.physics['jumpRising'] = false;
    this.engine.platformDropTimer = 0;
    this.engine.ropeJumpCooldown = 0;
    this.engine.jumpBufferTicks = 0;
    this.engine.attackCooldown = 0;
  }

  private worldKey(world: World): string {
    const P: number = GAME_CONSTANTS.FLOOR_SOLVER_NODE_PX;
    const parts: string[] = world.gadgetStates.map((s: GadgetState): string => {
      const body: string = s.body ? `${Math.round(s.body.x / P)},${Math.round(s.body.y / P)}` : '';
      return `${s.id}:${body}:${s.broken}:${s.openTicks > 0}:${s.dropped}:${this.isLever(s.id) ? s.on : ''}`;
    });
    parts.push(Object.keys(world.held).sort().join(','));
    parts.push(
      world.props
        .map((p: LooseProp): string => `${p.id}@${Math.round(p.x / P)},${Math.round(p.y / P)}`)
        .sort()
        .join(','),
    );
    return parts.join(';');
  }

  private isLever(id: string): boolean {
    return this.gadgets().some((g: Gadget): boolean => g.id === id && g.kind === 'lever');
  }

  /**
   * Pile heights worth trying under feet at `feet`: each puts the pile's top level with something
   * above (a platform or solid top, a slope's ends, a rope's foot), or a jump or two below it.
   */
  private pileHeights(feet: number): number[] {
    const tops: number[] = this.engine.platforms.map((p: Platform): number => p.y);
    for (const g of this.gadgets()) {
      if (g.kind === 'slope') tops.push(g.y, g.y + g.height);
    }
    for (const r of this.engine.ropes) tops.push(r.bottomY);
    const step: number = GAME_CONSTANTS.FLOOR_SOLVER_PILE_STEP_PX;
    const heights: Set<number> = new Set<number>();
    for (const top of tops) {
      for (const below of GAME_CONSTANTS.FLOOR_SOLVER_PILE_BELOW_PX) {
        const h: number = Math.round((feet - top - below) / step) * step;
        if (h >= step && h <= GAME_CONSTANTS.FLOOR_SOLVER_PILE_MAX_PX) heights.add(h);
      }
    }
    return [...heights].sort((a: number, b: number): number => a - b);
  }

  // ─── Where the player can go ─────────────────────────────

  /** Every spot the player reaches from `start` in the world as restored (nothing in it moves). */
  private region(start: SolverSpot): Region {
    const spans: SpawnSpan[] = this.spawnSpans();
    const seen: Map<string, SolverSpot> = new Map<string, SolverSpot>();
    const via: Map<string, SolverMove> = new Map<string, SolverMove>();
    const queue: SolverSpot[] = [];
    let bodies: boolean = false;
    const visit: (n: SolverSpot, by: SolverMove | null) => void = (
      n: SolverSpot,
      by: SolverMove | null,
    ): void => {
      const key: string = spotKey(n);
      if (seen.has(key)) return;
      seen.set(key, n);
      if (by) via.set(key, by);
      queue.push(n);
      if (!bodies && this.onSpan(n, spans)) bodies = true;
    };
    visit(start, null);
    // Plain moves first; piles only once those run out, so a route climbs a pile only where it must.
    let moved: number = 0;
    let piled: number = 0;
    while (moved < queue.length || (bodies && piled < queue.length)) {
      for (; moved < queue.length; moved++) {
        const n: SolverSpot = queue[moved];
        for (const m of this.moves(n)) visit(m.to, m);
      }
      if (!bodies) break;
      for (const end: number = queue.length; piled < end; piled++) {
        const n: SolverSpot = queue[piled];
        for (const m of this.pileMoves(n)) visit(m.to, m);
      }
    }
    const spots: SolverSpot[] = [...seen.values()];
    return {
      spots,
      via,
      // Coarse: a body shifted a few pixels on a button must not make a new state.
      key: hash([...new Set<string>(spots.map(regionCell))].sort().join(' ')),
      bodies,
      exit: spots.find((n: SolverSpot): boolean => this.leaves(n)) ?? null,
    };
  }

  /** The move templates tried from every spot (and from every pile). */
  private templates(): MoveKind[] {
    const out: MoveKind[] = [move('walk', -1), move('walk', 1), move('jump', 0)];
    for (const d of [-1, 1]) {
      for (const steer of ['all', 'rise', 'late', 'tap'] as const) out.push(move('jump', d, steer));
    }
    if (this.engine.ropes.length > 0) {
      for (const d of [-1, 0, 1]) out.push(move('rope-jump', d, 'tap'));
    }
    return out;
  }

  /** Walk, jump (steered several ways), drop through, climb a rope, ride an unwired launcher. */
  private moves(n: SolverSpot): SolverMove[] {
    const kinds: MoveKind[] = this.templates();
    if (n.y + H < GAME_CONSTANTS.GROUND_Y - 1) kinds.push(move('drop', 0));
    if (this.engine.ropes.length > 0) kinds.push(move('climb-up', 0), move('climb-down', 0));
    const launcher: LauncherGadget | null = this.unwiredLauncherUnder(n);
    if (launcher) {
      for (const d of [-1, 0, 1]) kinds.push(move('ride', d, 'all', launcher.id));
    }
    const out: SolverMove[] = [];
    for (const k of kinds) {
      const to: SolverSpot | null = this.run(n, k, null);
      if (to) out.push({ ...k, from: n, to });
    }
    return out;
  }

  /** From a pile of bodies built under the player on this spot, up to FLOOR_SOLVER_PILE_MAX_PX high. */
  private pileMoves(n: SolverSpot): SolverMove[] {
    const out: SolverMove[] = [];
    if (
      Math.round(n.x / GAME_CONSTANTS.FLOOR_SOLVER_NODE_PX) %
        GAME_CONSTANTS.FLOOR_SOLVER_PILE_EVERY_NODES !==
      0
    )
      return out;
    if (!this.pileable(n)) return out;
    const feet: number = n.y + H;
    for (const h of this.pileHeights(feet)) {
      const top: number = feet - h;
      if (top - H < 0) continue;
      // The pile and the player on it stay clear of solids.
      const column: Box = { x: n.x, y: top - H, width: W, height: h + H - 1 };
      if (
        this.engine.platforms.some(
          (p: Platform): boolean => p.solid === true && overlaps(column, p),
        )
      )
        continue;
      const pile: Platform = { x: n.x, y: top, width: W, height: 1 };
      for (const k of this.templates()) {
        const to: SolverSpot | null = this.run({ x: n.x, y: top - H }, k, pile);
        if (to) out.push({ ...k, pilePx: h, from: n, to });
      }
    }
    return out;
  }

  /** Bodies dropped here land and stay: on the ground, a platform or a solid's top, not on a slope. */
  private pileable(n: SolverSpot): boolean {
    const feet: number = n.y + H;
    return this.engine.platforms.some(
      (p: Platform): boolean => Math.abs(p.y - feet) <= 1 && n.x + W > p.x && n.x < p.x + p.width,
    );
  }

  /** A move from `start`: reused from an earlier world when nothing near its path changed. */
  private run(start: SolverSpot, k: MoveKind, pile: Platform | null): SolverSpot | null {
    const key: string = `${spotKey(start)}|${k.kind}|${k.dir}|${k.steer}|${k.launcher}|${pile ? pile.y : ''}`;
    const known: CachedSim[] = this.sims.get(key) ?? [];
    this.sims.set(key, known);
    for (const c of known) {
      if (this.near(c.sweep) === c.near) return c.to;
    }
    const sim: { to: SolverSpot | null; sweep: Box } = this.simulate(start, k, pile);
    known.push({ sweep: sim.sweep, near: this.near(sim.sweep), to: sim.to });
    return sim.to;
  }

  /** What stands in `box`: platforms and solids, and bodies lying there. */
  private near(box: Box): string {
    const parts: string[] = [];
    for (const p of this.engine.platforms) {
      if (overlaps(box, p))
        parts.push(
          `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.width)},${Math.round(p.height)},${p.solid === true}`,
        );
    }
    for (const c of this.engine.zombieCorpses) {
      if (overlaps(box, c)) parts.push(`c${Math.round(c.x)},${Math.round(c.y)}`);
    }
    return parts.sort().join(';');
  }

  /**
   * Runs the real player physics from `start` under the move's keys until the player stands still
   * on something. `pile` is a pile under the start (landing back on it is no new spot); a `ride`
   * throws the player off its launcher first. Null when they never come to rest.
   */
  private simulate(
    start: SolverSpot,
    k: MoveKind,
    pile: Platform | null,
  ): { to: SolverSpot | null; sweep: Box } {
    const e: GameEngine = this.engine;
    const p: CharacterState = this.player;
    this.place(start);
    if (pile) e.platforms.push(pile);
    const launcher: Gadget | undefined =
      k.kind === 'ride'
        ? this.gadgets().find((g: Gadget): boolean => g.id === k.launcher)
        : undefined;
    if (launcher && isLauncher(launcher)) {
      const v: { vx: number; vy: number } = launchVelocity(launcher);
      p.velocityX = v.vx;
      p.velocityY = v.vy;
      p.isGrounded = false;
    }
    const m: SolverMove = { ...k, from: start, to: start };
    let x0: number = p.x;
    let y0: number = p.y;
    let x1: number = p.x + W;
    let y1: number = p.y + H;
    let result: SolverSpot | null = null;
    for (let t: number = 0; t < GAME_CONSTANTS.FLOOR_SOLVER_MOVE_MAX_TICKS; t++) {
      e.setKeys({ ...this.idle, ...moveKeys(m, t) });
      this.movePlayer();
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + W);
      y1 = Math.max(y1, p.y + H);
      const resting: boolean =
        p.isGrounded && !p.isClimbing && Math.abs(p.velocityX) < GAME_CONSTANTS.PLAYER_MIN_VELOCITY;
      if (t > SOLVER_JUMP_HOLD_TICKS && resting) {
        result = { x: p.x, y: p.y };
        break;
      }
    }
    if (pile) e.platforms.pop();
    e.setKeys({ ...this.idle });
    const onPile: boolean =
      pile !== null &&
      result !== null &&
      Math.abs(result.y + H - pile.y) <= 1 &&
      result.x + W > pile.x &&
      result.x < pile.x + pile.width;
    const margin: number = GAME_CONSTANTS.FLOOR_SOLVER_SWEEP_MARGIN_PX;
    const sweep: Box = {
      x: x0 - margin,
      y: y0 - margin,
      width: x1 - x0 + 2 * margin,
      height: y1 - y0 + 2 * margin,
    };
    return { to: onPile ? null : result, sweep };
  }

  private movePlayer(): void {
    const e: GameEngine = this.engine;
    this.physics.updatePlayer();
    if (e.ropeJumpCooldown > 0) e.ropeJumpCooldown--;
    if (e.platformDropTimer > 0) e.platformDropTimer--;
    if (e.jumpBufferTicks > 0) e.jumpBufferTicks--;
  }

  private unwiredLauncherUnder(n: SolverSpot): LauncherGadget | null {
    for (const g of this.gadgets()) {
      if (isLauncher(g) && !isWired(this.gadgets(), g.id) && this.standsOn(n, g)) return g;
    }
    return null;
  }

  /** Where zombies rise (the engine's own spans): a walker-sized body on a free surface. */
  private spawnSpans(): SpawnSpan[] {
    const def: { widthMax: number; heightMax: number } = ZOMBIE_TYPES[ZombieType.Walker];
    const surfaces: Platform[] = this.engine.platforms.filter(
      (p: Platform): boolean => !p.solid && !p.safe,
    );
    return spawnSpans(surfaces, this.engine.noSpawnZones, def.widthMax, def.heightMax).map(
      (s: SpawnSpan): SpawnSpan => ({ ...s, max: s.max + def.widthMax }),
    );
  }

  private onSpan(n: SolverSpot, spans: SpawnSpan[]): boolean {
    const feet: number = n.y + H;
    return spans.some(
      (s: SpawnSpan): boolean => Math.abs(s.y - feet) <= 1 && n.x + W > s.min && n.x < s.max,
    );
  }

  /** Standing here finishes the floor: an open exit door, or the hanging exit while unlocked. */
  private leaves(n: SolverSpot): boolean {
    const e: GameEngine = this.engine;
    const standing: CharacterState = {
      ...this.player,
      x: n.x,
      y: n.y,
      isGrounded: true,
      isDead: false,
    };
    if (e.leavesThroughDoor(standing)) return true;
    const exit: Platform = e.exitPlatform;
    const bottom: number = n.y + H;
    const onExit: boolean =
      n.x + W > exit.x &&
      n.x < exit.x + exit.width &&
      bottom >= exit.y &&
      bottom <= exit.y + exit.height + SNAP;
    const locked: boolean = stateOf(e.gadgetStates, EXIT_TARGET) !== undefined && e.isExitLocked();
    return onExit && !locked;
  }
}

/** Solves designed floor `floor` on `engine` (a fresh GameEngine). */
export function solveFloor(engine: GameEngine, floor: number): FloorVerdict {
  return new FloorSolver(engine, floor).solve();
}
