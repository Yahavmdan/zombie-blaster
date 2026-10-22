import { CharacterState, GAME_CONSTANTS } from '@shared/index';
import { LooseProp, ZombieCorpse, ZombieState, ZombieType } from '@shared/game-entities';
import type { GameEngine } from './game-engine';
import { Box } from './boulder-puzzle';
import { Platform } from './engine-types';

/** What the left mouse button does on the canvas while the dev tools are on. */
export type DevMouseTool = 'attack' | 'drag' | 'spawn';

type DevGrabKind = 'player' | 'zombie' | 'corpse' | 'prop';

/** Something the mouse holds: it stays where the cursor is, offset as it was grabbed. */
interface DevGrab {
  kind: DevGrabKind;
  id: string;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
}

/** A body the mouse can grab: its id and box. */
interface Grabbable {
  kind: DevGrabKind;
  id: string;
  box: Box;
}

function contains(box: Box, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

/**
 * Dev tools in the engine (dev builds and the /dev page): the mouse grabs and drags anything,
 * zombies spawn at the cursor, time stops / slows / steps, the player heals, teleports and keeps
 * full MP. Only the player is the guest's own; zombies, corpses and props are the host's world.
 */
export class DevToolsSystem {
  paused: boolean = false;
  slowMotion: boolean = false;
  infiniteMp: boolean = false;
  private stepTicks: number = 0;
  private grab: DevGrab | null = null;

  constructor(private readonly e: GameEngine) {}

  /** How fast the simulation runs now (0 while paused). */
  timeScale(): number {
    if (this.paused) return 0;
    return this.slowMotion ? GAME_CONSTANTS.DEV_SLOW_MOTION_SCALE : 1;
  }

  /** One more tick while paused. */
  step(): void {
    if (this.paused) this.stepTicks++;
  }

  /** Ticks asked for with `step` since the last call. */
  takeSteps(): number {
    const steps: number = this.stepTicks;
    this.stepTicks = 0;
    return steps;
  }

  /** What the mouse is holding, by kind (null when nothing). */
  heldKind(): DevGrabKind | null {
    return this.grab?.kind ?? null;
  }

  /**
   * Grabs the topmost thing under (x, y): the player, else a zombie, prop or corpse (host/solo).
   * Pressing on nothing brings the player to the cursor, centered.
   */
  grabAt(x: number, y: number): void {
    const hit: Grabbable | undefined = this.grabbables().find((g: Grabbable): boolean =>
      contains(g.box, x, y),
    );
    if (hit) {
      this.grab = {
        kind: hit.kind,
        id: hit.id,
        offsetX: x - hit.box.x,
        offsetY: y - hit.box.y,
        x,
        y,
      };
    } else {
      const id: string = this.e.player?.id ?? '';
      const offsetX: number = GAME_CONSTANTS.PLAYER_WIDTH / 2;
      const offsetY: number = GAME_CONSTANTS.PLAYER_HEIGHT / 2;
      this.grab = { kind: 'player', id, offsetX, offsetY, x, y };
    }
    this.hold();
  }

  dragTo(x: number, y: number): void {
    if (!this.grab) return;
    this.grab.x = x;
    this.grab.y = y;
    // Paused, no tick runs: it follows the cursor anyway.
    this.hold();
  }

  release(): void {
    this.grab = null;
  }

  /** Runs at the end of every tick: the held thing stays at the cursor, MP stays full. */
  update(): void {
    this.hold();
    const p: CharacterState | null = this.e.player;
    if (this.infiniteMp && p) p.mp = p.derived.maxMp;
  }

  /** A zombie of `type` climbs out of the surface under (x, y) (host/solo). */
  spawnAt(x: number, y: number, type: ZombieType): void {
    if (this.e.isMultiplayerClient) return;
    this.e.spawnZombieAt(x, type, this.surfaceBelow(x, y));
  }

  /** Full HP and MP; a downed player gets up first. */
  heal(): void {
    const p: CharacterState | null = this.e.player;
    if (!p || p.isDead) return;
    if (p.isDown) this.e.applyRevive();
    p.hp = p.derived.maxHp;
    p.mp = p.derived.maxMp;
    this.e.onPlayerUpdate?.(p);
  }

  teleportToExit(): void {
    this.standOn(this.e.exitPlatform);
  }

  teleportToSafeSpot(): void {
    const spot: Platform | undefined = this.e.platforms.find(
      (pl: Platform): boolean => pl.safe === true,
    );
    if (spot) this.standOn(spot);
  }

  /** Puts the player on top of `box`, in its middle: it lands there on the next tick. */
  standOn(box: Box): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    p.x = box.x + box.width / 2 - GAME_CONSTANTS.PLAYER_WIDTH / 2;
    p.y = box.y - GAME_CONSTANTS.PLAYER_HEIGHT;
    p.velocityX = 0;
    p.velocityY = 0;
    p.isClimbing = false;
    p.isGrounded = false;
  }

  /** The player first (the guest's only one), then the host's zombies, props and corpses, topmost first. */
  private grabbables(): Grabbable[] {
    const list: Grabbable[] = [];
    const p: CharacterState | null = this.e.player;
    if (p) {
      list.push({
        kind: 'player',
        id: p.id,
        box: {
          x: p.x,
          y: p.y,
          width: GAME_CONSTANTS.PLAYER_WIDTH,
          height: GAME_CONSTANTS.PLAYER_HEIGHT,
        },
      });
    }
    if (this.e.isMultiplayerClient) return list;
    for (const z of [...this.e.zombies].reverse()) {
      if (z.isDead) continue;
      list.push({
        kind: 'zombie',
        id: z.id,
        box: { x: z.x, y: z.y, width: z.instanceWidth, height: z.instanceHeight },
      });
    }
    for (const prop of [...this.e.looseProps].reverse()) {
      if (prop.exploded || prop.carrierId !== null) continue;
      list.push({ kind: 'prop', id: prop.id, box: prop });
    }
    for (const c of [...this.e.zombieCorpses].reverse()) {
      if (c.carrierId !== null) continue;
      list.push({ kind: 'corpse', id: c.id, box: c });
    }
    return list;
  }

  /** Moves the held thing to the cursor (kept on screen) and takes its speed away. Lets go of what is gone. */
  private hold(): void {
    const grab: DevGrab | null = this.grab;
    if (!grab) return;
    const target: {
      box: Box;
      body: CharacterState | ZombieState | ZombieCorpse | LooseProp;
    } | null = this.heldBody(grab);
    if (!target) {
      this.grab = null;
      return;
    }
    const { box, body } = target;
    body.x = Math.min(Math.max(grab.x - grab.offsetX, 0), GAME_CONSTANTS.CANVAS_WIDTH - box.width);
    body.y = Math.min(Math.max(grab.y - grab.offsetY, 0), GAME_CONSTANTS.GROUND_Y - box.height);
    body.velocityX = 0;
    body.velocityY = 0;
    body.isGrounded = false;
    if (grab.kind === 'player') (body as CharacterState).isClimbing = false;
    if (grab.kind === 'zombie') (body as ZombieState).magnetPull = null;
    if (grab.kind === 'corpse' || grab.kind === 'prop') {
      const turning: ZombieCorpse | LooseProp = body as ZombieCorpse | LooseProp;
      turning.angle = 0;
      turning.spin = 0;
    }
    if (grab.kind === 'corpse') (body as ZombieCorpse).landProcessed = false;
  }

  private heldBody(
    grab: DevGrab,
  ): { box: Box; body: CharacterState | ZombieState | ZombieCorpse | LooseProp } | null {
    if (grab.kind === 'player') {
      const p: CharacterState | null = this.e.player;
      if (!p) return null;
      return {
        box: {
          x: p.x,
          y: p.y,
          width: GAME_CONSTANTS.PLAYER_WIDTH,
          height: GAME_CONSTANTS.PLAYER_HEIGHT,
        },
        body: p,
      };
    }
    if (grab.kind === 'zombie') {
      const z: ZombieState | undefined = this.e.zombies.find(
        (zz: ZombieState): boolean => zz.id === grab.id && !zz.isDead,
      );
      return z
        ? { box: { x: z.x, y: z.y, width: z.instanceWidth, height: z.instanceHeight }, body: z }
        : null;
    }
    if (grab.kind === 'prop') {
      const prop: LooseProp | undefined = this.e.looseProps.find(
        (lp: LooseProp): boolean => lp.id === grab.id && !lp.exploded && lp.carrierId === null,
      );
      return prop ? { box: prop, body: prop } : null;
    }
    const corpse: ZombieCorpse | undefined = this.e.zombieCorpses.find(
      (c: ZombieCorpse): boolean => c.id === grab.id && c.carrierId === null,
    );
    return corpse ? { box: corpse, body: corpse } : null;
  }

  /** Top of the highest surface at or below y whose span covers x (the ground when none). */
  private surfaceBelow(x: number, y: number): number {
    let top: number = GAME_CONSTANTS.GROUND_Y;
    for (const pl of this.e.platforms) {
      if (pl.propId || x < pl.x || x > pl.x + pl.width || pl.y < y) continue;
      top = Math.min(top, pl.y);
    }
    return top;
  }
}
