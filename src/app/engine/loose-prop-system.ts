import { GAME_CONSTANTS } from '@shared/index';
import { LooseProp, ZombieCorpse } from '@shared/game-entities';
import { IGameEngine, Platform } from './engine-types';
import { DropSystem } from './drop-system';
import { corpseSurface, CorpseSurface } from './corpse-surface';
import { keepOutOfWall } from './boulder-puzzle';
import { pushOutOfSolids } from './solid-blocks';
import { LevelLayout, lyingProp, pickableProps, Prop } from './level-generator';

/** Sideways speed kept per tick by a thrown prop (like a corpse). */
const PROP_AIR_DRAG: number = 0.92;

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

  constructor(
    private readonly e: IGameEngine,
    private readonly drops: DropSystem,
  ) {}

  /** New floor: every pickable prop lies on its spawn spot. */
  reset(level: LevelLayout): void {
    this.spawns = pickableProps(level);
    this.e.mapRenderer.setLooseProps(this.spawns);
    this.e.looseProps = [...this.spawns].map(
      ([id, spawn]: [string, Prop]): LooseProp => lyingProp(id, spawn),
    );
    this.placeSolids();
  }

  /**
   * Host: the props to send, the ones away from their spawn spot (carried, flying, or lying
   * somewhere else). The rest lie where every client's own layout puts them.
   */
  moved(): LooseProp[] {
    return this.e.looseProps
      .filter((p: LooseProp): boolean => {
        const spawn: Prop | undefined = this.spawns.get(p.id);
        return (
          !spawn || p.carrierId !== null || !p.isGrounded || p.x !== spawn.x || p.y !== spawn.y
        );
      })
      .map((p: LooseProp): LooseProp => ({ ...p }));
  }

  /** Client: the host's moved props; every other one lies on its spawn spot. */
  applyRemote(moved: LooseProp[]): void {
    const synced: Map<string, LooseProp> = new Map<string, LooseProp>(
      moved.map((p: LooseProp): [string, LooseProp] => [p.id, p]),
    );
    this.e.looseProps = [...this.spawns].map(([id, spawn]: [string, Prop]): LooseProp => {
      const s: LooseProp | undefined = synced.get(id);
      return s ? { ...s } : lyingProp(id, spawn);
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
