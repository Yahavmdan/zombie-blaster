import { GAME_CONSTANTS } from '@shared/index';
import { LooseProp, ZombieCorpse } from '@shared/game-entities';
import { IGameEngine, Platform } from './engine-types';
import { DropSystem } from './drop-system';
import { corpseSurface, CorpseSurface } from './corpse-surface';
import { Box, keepOutOfWall } from './boulder-puzzle';
import { pushOutOfSolids } from './solid-blocks';
import {
  LevelLayout,
  lyingProp,
  pickableProps,
  Prop,
  PropKind,
  propWeightKg,
} from './level-generator';

/** Sideways speed kept per tick by a thrown prop (like a corpse). */
const PROP_AIR_DRAG: number = 0.92;

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** A synced fuse as a whole tick count within the fuse's length (0 for anything malformed). */
function syncedFuseTicks(ticks: unknown): number {
  if (typeof ticks !== 'number' || !Number.isFinite(ticks)) return 0;
  return Math.min(GAME_CONSTANTS.BARREL_FUSE_TICKS, Math.max(0, Math.round(ticks)));
}

/**
 * Loose props (barrels, boxes players pick up). The host (or solo) moves the ones in the air: a
 * thrown prop flies, falls and lands on the ground, a platform, another prop or a corpse; a lying
 * one falls when what held it up is gone (picked up, carried off). Every client turns the lying
 * ones into solid platforms each tick (`Platform.propId`), so they are stood on and stepped over
 * like any prop, wherever they lie.
 */
export class LoosePropSystem {
  /** The floor's pickable props by id: art and spawn spot. */
  private spawns: Map<string, Prop> = new Map<string, Prop>();
  /** Host: props blown up and not back yet, sent with every sync so clients drop them too. */
  private exploded: LooseProp[] = [];
  /** Host: ticks until each blown-up prop comes back (0 = due, waiting for its spot to clear). */
  private respawnTicks: Map<string, number> = new Map<string, number>();

  constructor(
    private readonly e: IGameEngine,
    private readonly drops: DropSystem,
  ) {}

  /** New floor: every pickable prop lies on its spawn spot. */
  reset(level: LevelLayout): void {
    this.spawns = pickableProps(level);
    this.exploded = [];
    this.respawnTicks.clear();
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
        };
      });
  }

  update(): void {
    this.placeSolids();
    if (this.e.isMultiplayerClient) return;
    for (const prop of this.e.looseProps) {
      if (prop.carrierId !== null) continue;
      if (prop.isGrounded && !this.isSupported(prop)) prop.isGrounded = false;
      if (!prop.isGrounded) this.fall(prop);
    }
    this.placeSolids();
  }

  /** Lying props are solid platforms; carried and falling ones have no collision. */
  placeSolids(): void {
    this.e.platforms = [
      ...this.e.platforms.filter((p: Platform): boolean => p.propId === undefined),
      ...this.e.looseProps
        .filter((p: LooseProp): boolean => p.isGrounded && p.carrierId === null)
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

  private fall(prop: LooseProp): void {
    const prevX: number = prop.x;
    prop.x += prop.velocityX;
    prop.velocityX *= PROP_AIR_DRAG;
    if (Math.abs(prop.velocityX) < 0.1) prop.velocityX = 0;
    prop.velocityY = Math.min(
      prop.velocityY + this.drops.getEffectiveGravity(),
      GAME_CONSTANTS.TERMINAL_VELOCITY,
    );

    const maxX: number = GAME_CONSTANTS.CANVAS_WIDTH - prop.width;
    const onScreenX: number = keepOutOfWall(
      Math.min(Math.max(prop.x, 0), maxX),
      prop.width,
      this.e.puzzleWall(),
    );
    // Solid things (other props, puzzle parts) stop it sideways like they stop a player.
    const pushed: { x: number; blocked: boolean } = pushOutOfSolids(
      onScreenX,
      prop.y,
      prop.width,
      prop.height,
      prevX,
      this.others(prop),
    );
    if (pushed.x !== prop.x) prop.velocityX = 0;
    prop.x = pushed.x;
    prop.y += prop.velocityY;

    const landing: number | null = this.landingY(prop);
    if (landing === null) return;
    // Whole pixels, so the art lands crisp and exactly on its box.
    prop.x = Math.round(prop.x);
    prop.y = Math.round(landing - prop.height);
    prop.velocityX = 0;
    prop.velocityY = 0;
    prop.isGrounded = true;
  }

  /** The highest surface the falling prop's bottom passed this tick, or null. */
  private landingY(prop: LooseProp): number | null {
    if (prop.velocityY < 0) return null;
    const bottom: number = prop.y + prop.height;
    const prevBottom: number = bottom - prop.velocityY;
    let best: number | null = null;
    for (const s of this.surfaces(prop)) {
      if (prop.x + prop.width <= s.x || prop.x >= s.x + s.width) continue;
      if (bottom < s.y || prevBottom > s.y + s.tolerance) continue;
      if (best === null || s.y < best) best = s.y;
    }
    return best;
  }

  /** Whether something holds a lying prop up (a surface right under its bottom). */
  private isSupported(prop: LooseProp): boolean {
    const bottom: number = prop.y + prop.height;
    return this.surfaces(prop).some(
      (s: Surface): boolean =>
        prop.x + prop.width > s.x &&
        prop.x < s.x + s.width &&
        Math.abs(bottom - s.y) <= GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE,
    );
  }

  /** Everything a prop can rest on: platforms (other props included) and lying corpses. */
  private surfaces(prop: LooseProp): Surface[] {
    const platforms: Surface[] = this.others(prop).map(
      (p: Platform): Surface => ({
        x: p.x,
        width: p.width,
        y: p.y,
        tolerance: GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE,
      }),
    );
    const corpses: Surface[] = this.e.zombieCorpses
      .filter((c: ZombieCorpse): boolean => c.isGrounded && c.carrierId === null)
      .map((c: ZombieCorpse): Surface => {
        const s: CorpseSurface = corpseSurface(c);
        return { ...s, tolerance: GAME_CONSTANTS.ZOMBIE_CORPSE_SNAP_TOLERANCE };
      });
    return [...platforms, ...corpses];
  }

  private others(prop: LooseProp): Platform[] {
    return this.e.platforms.filter((p: Platform): boolean => p.propId !== prop.id);
  }
}

/** A surface a prop can land on, and how far its bottom may have been below it a tick ago. */
interface Surface extends CorpseSurface {
  tolerance: number;
}
