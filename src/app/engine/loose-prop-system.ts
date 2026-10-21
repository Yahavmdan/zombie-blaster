import { GAME_CONSTANTS } from '@shared/index';
import { LooseProp, ZombieCorpse } from '@shared/game-entities';
import { IGameEngine, Platform } from './engine-types';
import { DropSystem } from './drop-system';
import { corpseSurface, CorpseSurface } from './corpse-surface';
import { Box, keepOutOfWall } from './boulder-puzzle';
import { pushOutOfSolids } from './solid-blocks';
import {
  isExplosive,
  LevelLayout,
  lyingProp,
  pickableProps,
  Prop,
  PropKind,
  propWeightKg,
} from './level-generator';
import {
  bottomOf,
  centerX,
  isResting,
  restOn,
  settleUpright,
  Span,
  startTip,
  supportSpan,
  tickTip,
  Tip,
  tipSide,
  TumbleSurface,
  turnedHalfWidth,
  wrapAngle,
} from './prop-tumble';

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** A synced number, or `fallback` for anything malformed. */
function syncedNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A synced fuse as a whole tick count within the fuse's length (0 for anything malformed). */
function syncedFuseTicks(ticks: unknown): number {
  if (typeof ticks !== 'number' || !Number.isFinite(ticks)) return 0;
  return Math.min(GAME_CONSTANTS.BARREL_FUSE_TICKS, Math.max(0, Math.round(ticks)));
}

/**
 * Loose props (barrels, boxes, rails players pick up). The host (or solo) moves them: a thrown or
 * blasted prop flies spinning, falls, bounces and lands on the ground, a platform, another prop or
 * a corpse; there a barrel rolls on, a box or rail slides and turns back upright. One whose middle
 * hangs over an edge tips off it (`prop-tumble.ts`); a lying one falls when what held it up is
 * gone. Every client turns the resting ones (upright, still) into solid platforms each tick
 * (`Platform.propId`), so they are stood on and stepped over like any prop, wherever they lie.
 */
export class LoosePropSystem {
  /** The floor's pickable props by id: art and spawn spot. */
  private spawns: Map<string, Prop> = new Map<string, Prop>();
  /** Host: props blown up and not back yet, sent with every sync so clients drop them too. */
  private exploded: LooseProp[] = [];
  /** Host: ticks until each blown-up prop comes back (0 = due, waiting for its spot to clear). */
  private respawnTicks: Map<string, number> = new Map<string, number>();
  /** Host: props tipping off an edge, by id. */
  private tips: Map<string, Tip> = new Map<string, Tip>();

  constructor(
    private readonly e: IGameEngine,
    private readonly drops: DropSystem,
  ) {}

  /** New floor: every pickable prop lies on its spawn spot. */
  reset(level: LevelLayout): void {
    this.spawns = pickableProps(level);
    this.exploded = [];
    this.respawnTicks.clear();
    this.tips.clear();
    this.e.mapRenderer.setLooseProps(this.spawns);
    this.e.looseProps = [...this.spawns].map(
      ([id, spawn]: [string, Prop]): LooseProp => lyingProp(id, spawn),
    );
    this.placeSolids();
  }

  /** What a prop of this floor is (its layout kind), or undefined for an unknown id. */
  kindOf(id: string): PropKind | undefined {
    return this.spawns.get(id)?.kind;
  }

  /**
   * Host: the prop is blown up. It leaves the world (and any carrier's hands) until it comes back
   * on its spawn spot BARREL_RESPAWN_TICKS later (`respawn`), or for the rest of the floor when
   * `respawns` is false (test setup clearing room).
   */
  remove(id: string, respawns: boolean = true): void {
    const prop: LooseProp | undefined = this.e.looseProps.find((p: LooseProp): boolean => p.id === id);
    if (!prop) return;
    this.e.looseProps = this.e.looseProps.filter((p: LooseProp): boolean => p !== prop);
    this.tips.delete(id);
    this.exploded.push({ ...prop, carrierId: null, fuseTicks: 0, exploded: true });
    if (respawns) this.respawnTicks.set(id, GAME_CONSTANTS.BARREL_RESPAWN_TICKS);
    this.placeSolids();
  }

  /**
   * Host, every tick: blown-up props whose time is up come back, lying on their spawn spots. One
   * waits while a player (a `blockers` box) or another prop is in the way. Returns the ones back.
   */
  respawn(blockers: Box[]): LooseProp[] {
    const back: LooseProp[] = [];
    for (const [id, ticks] of this.respawnTicks) {
      if (ticks > 0) {
        this.respawnTicks.set(id, ticks - 1);
        continue;
      }
      const spawn: Prop | undefined = this.spawns.get(id);
      if (!spawn) {
        this.respawnTicks.delete(id);
        continue;
      }
      const inTheWay: boolean = [...blockers, ...this.e.looseProps].some(
        (b: Box): boolean => boxesOverlap(b, spawn),
      );
      if (inTheWay) continue;
      const prop: LooseProp = lyingProp(id, spawn);
      this.e.looseProps.push(prop);
      this.exploded = this.exploded.filter((p: LooseProp): boolean => p.id !== id);
      this.respawnTicks.delete(id);
      back.push(prop);
    }
    if (back.length > 0) this.placeSolids();
    return back;
  }

  /**
   * Host: the props to send, the ones away from their spawn spot (carried, flying, lying
   * somewhere else, burning a fuse or blown up). The rest lie where every client's own layout
   * puts them.
   */
  moved(): LooseProp[] {
    return [
      ...this.e.looseProps.filter((p: LooseProp): boolean => {
        const spawn: Prop | undefined = this.spawns.get(p.id);
        return (
          !spawn ||
          p.carrierId !== null ||
          !p.isGrounded ||
          p.fuseTicks > 0 ||
          !isResting(p) ||
          p.x !== spawn.x ||
          p.y !== spawn.y
        );
      }),
      ...this.exploded,
    ].map((p: LooseProp): LooseProp => ({ ...p }));
  }

  /** Client: the host's moved props; every other one lies on its spawn spot, blown up ones are gone. */
  applyRemote(moved: LooseProp[]): void {
    const synced: Map<string, LooseProp> = new Map<string, LooseProp>(
      moved.map((p: LooseProp): [string, LooseProp] => [p.id, p]),
    );
    this.e.looseProps = [...this.spawns]
      .filter(([id]: [string, Prop]): boolean => synced.get(id)?.exploded !== true)
      .map(([id, spawn]: [string, Prop]): LooseProp => {
        const s: LooseProp | undefined = synced.get(id);
        if (!s) return lyingProp(id, spawn);
        // The weight comes from this client's own layout, never from the sync.
        return {
          ...s,
          weightKg: propWeightKg(spawn.kind),
          fuseTicks: syncedFuseTicks(s.fuseTicks),
          exploded: false,
          angle: wrapAngle(syncedNumber(s.angle, 0)),
          spin: syncedNumber(s.spin, 0),
        };
      });
  }

  update(): void {
    this.placeSolids();
    if (this.e.isMultiplayerClient) return;
    for (const prop of this.e.looseProps) {
      if (prop.carrierId !== null) {
        this.tips.delete(prop.id);
        continue;
      }
      const tip: Tip | undefined = this.tips.get(prop.id);
      if (tip) {
        if (tickTip(prop, tip)) this.tips.delete(prop.id);
      } else if (prop.isGrounded) {
        this.onGround(prop);
      } else {
        this.fall(prop);
      }
    }
    this.placeSolids();
  }

  /**
   * Host: throws a prop (a barrel blast): it leaves whatever it lay on or tipped off, flying and
   * turning at these speeds.
   */
  launch(prop: LooseProp, velocityX: number, velocityY: number, spin: number): void {
    this.tips.delete(prop.id);
    prop.velocityX = velocityX;
    prop.velocityY = velocityY;
    prop.spin = spin;
    prop.isGrounded = false;
  }

  /** Resting props are solid platforms; carried, flying, tumbling and rolling ones have no collision. */
  placeSolids(): void {
    this.e.platforms = [
      ...this.e.platforms.filter((p: Platform): boolean => p.propId === undefined),
      ...this.e.looseProps
        .filter((p: LooseProp): boolean => isResting(p))
        .map(
          (p: LooseProp): Platform => ({
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
            solid: true,
            propId: p.id,
          }),
        ),
    ];
  }

  /** A barrel is round: it rolls, and turned it still reaches half its height down. */
  private isRound(prop: LooseProp): boolean {
    const kind: PropKind | undefined = this.kindOf(prop.id);
    return kind !== undefined && isExplosive(kind);
  }

  /**
   * On something: it falls when nothing is under it any more, tips off an edge its middle hangs
   * over, rolls (barrel) or slides (box, rail) on, and turns back upright.
   */
  private onGround(prop: LooseProp): void {
    const round: boolean = this.isRound(prop);
    const y: number = bottomOf(prop, round);
    const span: Span | null = supportSpan(prop, this.surfaces(prop), y, round);
    if (!span) {
      prop.isGrounded = false;
      return;
    }
    const side: number = prop.angle === 0 ? tipSide(prop, span) : 0;
    if (side !== 0) {
      this.tips.set(prop.id, startTip(prop, span, side, y));
      return;
    }
    if (prop.velocityX !== 0) this.slide(prop, round);
    if (prop.angle !== 0 && !(round && prop.velocityX !== 0)) settleUpright(prop, round);
    if (isResting(prop)) {
      // Whole pixels, so the art lies crisp and exactly on its box.
      prop.x = Math.round(prop.x);
      prop.y = Math.round(prop.y);
    }
  }

  /** Sideways along what it lies on: a barrel rolls far (turning as it goes), others slide a little. */
  private slide(prop: LooseProp, round: boolean): void {
    const prevX: number = prop.x;
    this.moveSideways(prop);
    if (round) prop.angle += (prop.x - prevX) / (prop.width / 2);
    prop.velocityX *= round
      ? GAME_CONSTANTS.PROP_ROLL_FRICTION
      : GAME_CONSTANTS.PROP_SLIDE_FRICTION;
    if (Math.abs(prop.velocityX) < 0.1) prop.velocityX = 0;
  }

  /** Moves the prop by its sideways speed, on screen, out of the puzzle wall, stopped by solids. */
  private moveSideways(prop: LooseProp): void {
    const prevX: number = prop.x;
    prop.x += prop.velocityX;
    const maxX: number = GAME_CONSTANTS.CANVAS_WIDTH - prop.width;
    const onScreenX: number = keepOutOfWall(
      Math.min(Math.max(prop.x, 0), maxX),
      prop.width,
      this.e.puzzleWall(),
    );
    // Solid things (other props, puzzle parts) stop it sideways like they stop a player. One it
    // already overlaps (a tumbling prop's box swings through things) lets it pass.
    const solids: Platform[] = this.others(prop).filter(
      (s: Platform): boolean => !boxesOverlap({ ...prop, x: prevX }, s),
    );
    const pushed: { x: number; blocked: boolean } = pushOutOfSolids(
      onScreenX,
      prop.y,
      prop.width,
      prop.height,
      prevX,
      solids,
    );
    if (pushed.x !== prop.x) prop.velocityX = 0;
    prop.x = pushed.x;
  }

  private fall(prop: LooseProp): void {
    const round: boolean = this.isRound(prop);
    // Its lowest point before this tick's move and turn (a fast turn swings it a long way).
    const prevBottom: number = bottomOf(prop, round);
    this.moveSideways(prop);
    prop.velocityX *= GAME_CONSTANTS.PROP_AIR_DRAG;
    if (Math.abs(prop.velocityX) < 0.1) prop.velocityX = 0;
    prop.velocityY = Math.min(
      prop.velocityY + this.drops.getEffectiveGravity(),
      GAME_CONSTANTS.TERMINAL_VELOCITY,
    );
    prop.y += prop.velocityY;
    prop.angle += prop.spin;
    prop.spin *= GAME_CONSTANTS.PROP_AIR_SPIN_DRAG;

    const landing: number | null = this.landingY(prop, round, prevBottom);
    if (landing === null) return;
    restOn(prop, landing, round);
    if (prop.velocityY > GAME_CONSTANTS.PROP_BOUNCE_MIN_SPEED) {
      // A hard landing bounces it back up, turning slower.
      prop.velocityY = -prop.velocityY * GAME_CONSTANTS.PROP_BOUNCE;
      prop.velocityX *= GAME_CONSTANTS.PROP_LAND_KEEP_SPEED;
      prop.spin /= 2;
      return;
    }
    prop.velocityY = 0;
    prop.velocityX *= GAME_CONSTANTS.PROP_LAND_KEEP_SPEED;
    if (Math.abs(prop.velocityX) < 0.1) prop.velocityX = 0;
    prop.spin = 0;
    prop.isGrounded = true;
    prop.angle = wrapAngle(prop.angle);
  }

  /** The highest surface the falling prop's lowest point passed this tick, or null. */
  private landingY(prop: LooseProp, round: boolean, prevBottom: number): number | null {
    if (prop.velocityY < 0) return null;
    const bottom: number = bottomOf(prop, round);
    const half: number = turnedHalfWidth(prop, round);
    const cx: number = centerX(prop);
    let best: number | null = null;
    for (const s of this.surfaces(prop)) {
      if (cx + half <= s.x || cx - half >= s.x + s.width) continue;
      if (bottom < s.y || prevBottom > s.y + s.tolerance) continue;
      if (best === null || s.y < best) best = s.y;
    }
    // Nothing falls through the ground (a fast turn can swing its lowest point past it).
    if (best === null && bottom >= GAME_CONSTANTS.GROUND_Y) return GAME_CONSTANTS.GROUND_Y;
    return best;
  }

  /** Everything a prop can rest on: platforms (other props included) and lying corpses. */
  private surfaces(prop: LooseProp): TumbleSurface[] {
    const platforms: TumbleSurface[] = this.others(prop).map(
      (p: Platform): TumbleSurface => ({
        x: p.x,
        width: p.width,
        y: p.y,
        tolerance: GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE,
      }),
    );
    const corpses: TumbleSurface[] = this.e.zombieCorpses
      .filter((c: ZombieCorpse): boolean => c.isGrounded && c.carrierId === null)
      .map((c: ZombieCorpse): TumbleSurface => {
        const s: CorpseSurface = corpseSurface(c);
        return { ...s, tolerance: GAME_CONSTANTS.ZOMBIE_CORPSE_SNAP_TOLERANCE };
      });
    return [...platforms, ...corpses];
  }

  private others(prop: LooseProp): Platform[] {
    return this.e.platforms.filter((p: Platform): boolean => p.propId !== prop.id);
  }
}
