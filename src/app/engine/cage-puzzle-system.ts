import { CharacterState, GAME_CONSTANTS, VfxEventType } from '@shared/index';
import {
  CagePuzzleState,
  CageState,
  LooseProp,
  WorldDrop,
  ZombieCorpse,
  ZombieState,
} from '@shared/game-entities';
import { CageContent, CagePuzzleLayout, IGameEngine, Platform } from './engine-types';
import { VfxSystem } from './vfx-system';
import { ZombieSystem } from './zombie-system';
import { DropSystem } from './drop-system';
import { Box } from './boulder-puzzle';
import {
  CleatHit,
  EXIT_CAGE,
  cleatBox,
  cleatHitBy,
  exitCageGroundBox,
  hangBox,
  hitCleat,
  landTop,
  liftOntoLandedCage,
  releaseSpots,
  tickCage,
  tickCageClient,
  yAfterCageLands,
} from './cage-puzzle';

const CLEAT_COLOR: string = '#c8c8d0';
const SNAP_COLOR: string = '#ffd166';

/**
 * Floor-4 hanging cages. The host (or solo) counts every player's swings at the cleats, snaps a
 * chain on the last one, drops its cage and lands it: the exit cage becomes a solid step under
 * the exit (what stood under it rides up onto it), any other cage smashes where it lands. Either
 * way the cage's hidden content spills out (zombies, loot, or nothing). Clients only let a
 * snapped cage fall on between snapshots; guests lift their own player when the synced landing
 * reaches them (they own their player state).
 */
export class CagePuzzleSystem {
  private readonly hitCooldowns: number[] = [];

  constructor(
    private readonly e: IGameEngine,
    private readonly vfx: VfxSystem,
    private readonly zombieSystem: ZombieSystem,
    private readonly drops: DropSystem,
  ) {}

  update(): void {
    const puzzle: CagePuzzleLayout | null = this.e.cagePuzzle;
    const cages: CagePuzzleState | null = this.e.cages;
    if (!puzzle || !cages) return;
    const players: CharacterState[] = [
      ...(this.e.player ? [this.e.player] : []),
      ...this.e.remotePlayers,
    ];
    const exit: Platform = this.e.exitPlatform;
    cages.cages.forEach((cage: CageState, i: number): void => {
      if (tickCage(cage, hangBox(puzzle, i, exit).y, landTop(puzzle, i, exit))) this.land(puzzle, i);
      const cooldown: number = this.hitCooldowns[i] ?? 0;
      if (cooldown > 0) {
        this.hitCooldowns[i] = cooldown - 1;
        return;
      }
      if (!players.some((p: CharacterState): boolean => cleatHitBy(p, puzzle, i))) return;
      const hit: CleatHit | null = hitCleat(cage);
      if (!hit) return;
      this.hitCooldowns[i] = GAME_CONSTANTS.CAGE_HIT_COOLDOWN_TICKS;
      this.cleatSparks(puzzle, i, hit);
      if (hit === 'snap') this.e.placeCages();
    });
  }

  tickClient(): void {
    const puzzle: CagePuzzleLayout | null = this.e.cagePuzzle;
    const cages: CagePuzzleState | null = this.e.cages;
    if (!puzzle || !cages) return;
    const exit: Platform = this.e.exitPlatform;
    cages.cages.forEach((cage: CageState, i: number): void => {
      tickCageClient(cage, hangBox(puzzle, i, exit).y, landTop(puzzle, i, exit));
    });
  }

  /** Sparks off the cleat on every hit; a burst of gold as the chain snaps. */
  private cleatSparks(puzzle: CagePuzzleLayout, i: number, hit: CleatHit): void {
    const cleat: Box = cleatBox(puzzle, i);
    const cx: number = cleat.x + cleat.width / 2;
    const cy: number = cleat.y + 6;
    const color: string = hit === 'snap' ? SNAP_COLOR : CLEAT_COLOR;
    this.vfx.spawnHitParticles(cx, cy, color);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.HitParticles,
      playerId: this.e.player?.id ?? '',
      x: cx,
      y: cy,
      color,
    });
  }

  private land(puzzle: CagePuzzleLayout, i: number): void {
    this.e.placeCages();
    const exit: Platform = this.e.exitPlatform;
    const content: CageContent = puzzle.cages[i].content;
    if (i !== EXIT_CAGE) {
      const box: Box = { ...hangBox(puzzle, i, exit), y: landTop(puzzle, i, exit) };
      const cx: number = box.x + box.width / 2;
      const cy: number = box.y + box.height / 2;
      const gore: boolean = content === 'zombies';
      this.vfx.spawnCageSmash(cx, cy, gore);
      this.e.pendingVfxEvents.push({
        type: VfxEventType.CageSmash,
        playerId: this.e.player?.id ?? '',
        x: cx,
        y: cy,
        value: gore ? 1 : 0,
      });
      this.spill(content, box, puzzle.cages[i].landY);
      return;
    }
    const box: Box = exitCageGroundBox(exit);
    // The pile under the exit rides up onto the cage (carried corpses stay on their carriers).
    const corpses: ZombieCorpse[] = this.e.zombieCorpses.filter(
      (c: ZombieCorpse): boolean => c.carrierId === null,
    );
    for (const c of corpses) {
      c.y = yAfterCageLands(c.x, c.y, c.width, c.height, c.isGrounded, box, exit);
    }
    // ...and so do loose props lying there (thrown under the exit).
    for (const p of this.e.looseProps.filter((q: LooseProp): boolean => q.carrierId === null)) {
      p.y = yAfterCageLands(p.x, p.y, p.width, p.height, p.isGrounded, box, exit);
    }
    const zombies: ZombieState[] = this.e.zombies;
    for (const z of zombies) {
      z.y = yAfterCageLands(z.x, z.y, z.instanceWidth, z.instanceHeight, z.isGrounded, box, exit);
    }
    const drops: WorldDrop[] = this.e.worldDrops;
    const size: number = GAME_CONSTANTS.DROP_SIZE;
    for (const d of drops) d.y = yAfterCageLands(d.x, d.y, size, size, d.isGrounded, box, exit);
    if (this.e.player) liftOntoLandedCage(this.e.player, exit);
    const cx: number = box.x + box.width / 2;
    this.vfx.spawnCageLand(cx, GAME_CONSTANTS.GROUND_Y);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.CageLand,
      playerId: this.e.player?.id ?? '',
      x: cx,
      y: GAME_CONSTANTS.GROUND_Y,
    });
    // The exit cage stays standing: what it hid climbs out on top of it.
    this.spill(content, box, box.y);
  }

  /** A landed cage's hidden content comes out onto `surfaceY` across the cage's width. */
  private spill(content: CageContent, box: Box, surfaceY: number): void {
    if (content === 'zombies') {
      for (const spot of releaseSpots(box, surfaceY, GAME_CONSTANTS.CAGE_ZOMBIES)) {
        this.zombieSystem.spawnZombieAt(spot.x, spot.y);
      }
    } else if (content === 'loot') {
      this.drops.spawnCageLoot(box.x + box.width / 2, surfaceY);
    }
  }
}
