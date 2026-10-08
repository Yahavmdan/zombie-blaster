import { CharacterState, GAME_CONSTANTS, VfxEventType } from '@shared/index';
import {
  CagePuzzleState,
  CageState,
  WorldDrop,
  ZombieCorpse,
  ZombieState,
} from '@shared/game-entities';
import { CagePuzzleLayout, IGameEngine, Platform } from './engine-types';
import { VfxSystem } from './vfx-system';
import { ZombieSystem } from './zombie-system';
import { Box } from './boulder-puzzle';
import {
  CAGE_IDS,
  CageId,
  CleatHit,
  cleatBox,
  cleatHitBy,
  exitCageGroundBox,
  hangBox,
  hitCleat,
  liftOntoLandedCage,
  releaseSpots,
  tickCage,
  tickCageClient,
  yAfterCageLands,
} from './cage-puzzle';

const CLEAT_COLOR: string = '#c8c8d0';
const SNAP_COLOR: string = '#ffd166';

/**
 * Floor-4 hanging cages. The host (or solo) counts every player's swings at the cleats on the
 * ledge, snaps a chain on the last one, drops its cage and lands it: the exit cage becomes a
 * solid step under the exit (what stood under it rides up onto it), the zombie cage smashes and
 * lets its zombies loose. Clients only let a snapped cage fall on between snapshots; guests lift
 * their own player when the synced landing reaches them (they own their player state).
 */
export class CagePuzzleSystem {
  private readonly hitCooldowns: Record<CageId, number> = { exitCage: 0, zombieCage: 0 };

  constructor(
    private readonly e: IGameEngine,
    private readonly vfx: VfxSystem,
    private readonly zombieSystem: ZombieSystem,
  ) {}

  update(): void {
    const puzzle: CagePuzzleLayout | null = this.e.cagePuzzle;
    const cages: CagePuzzleState | null = this.e.cages;
    if (!puzzle || !cages) return;
    const players: CharacterState[] = [
      ...(this.e.player ? [this.e.player] : []),
      ...this.e.remotePlayers,
    ];
    for (const id of CAGE_IDS) {
      const cage: CageState = cages[id];
      if (tickCage(cage, hangBox(puzzle, id, this.e.exitPlatform).y)) this.land(puzzle, id);
      if (this.hitCooldowns[id] > 0) {
        this.hitCooldowns[id]--;
        continue;
      }
      if (!players.some((p: CharacterState): boolean => cleatHitBy(p, puzzle, id))) continue;
      const hit: CleatHit | null = hitCleat(cage);
      if (!hit) continue;
      this.hitCooldowns[id] = GAME_CONSTANTS.CAGE_HIT_COOLDOWN_TICKS;
      this.cleatSparks(puzzle, id, hit);
      if (hit === 'snap') this.e.placeCages();
    }
  }

  tickClient(): void {
    const puzzle: CagePuzzleLayout | null = this.e.cagePuzzle;
    const cages: CagePuzzleState | null = this.e.cages;
    if (!puzzle || !cages) return;
    for (const id of CAGE_IDS) {
      tickCageClient(cages[id], hangBox(puzzle, id, this.e.exitPlatform).y);
    }
  }

  /** Sparks off the cleat on every hit; a burst of gold as the chain snaps. */
  private cleatSparks(puzzle: CagePuzzleLayout, id: CageId, hit: CleatHit): void {
    const cleat: Box = cleatBox(puzzle, id);
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

  private land(puzzle: CagePuzzleLayout, id: CageId): void {
    this.e.placeCages();
    const playerId: string = this.e.player?.id ?? '';
    if (id === 'zombieCage') {
      const cage: Platform = puzzle.zombieCage;
      const cx: number = cage.x + cage.width / 2;
      const cy: number = GAME_CONSTANTS.GROUND_Y - cage.height / 2;
      for (const spot of releaseSpots(puzzle, GAME_CONSTANTS.CAGE_ZOMBIES)) {
        this.zombieSystem.spawnZombieAt(spot.x, spot.y);
      }
      this.vfx.spawnCageSmash(cx, cy);
      this.e.pendingVfxEvents.push({ type: VfxEventType.CageSmash, playerId, x: cx, y: cy });
      return;
    }
    const exit: Platform = this.e.exitPlatform;
    const box: Box = exitCageGroundBox(exit);
    // The pile under the exit rides up onto the cage (carried corpses stay on their carriers).
    const corpses: ZombieCorpse[] = this.e.zombieCorpses.filter(
      (c: ZombieCorpse): boolean => c.carrierId === null,
    );
    for (const c of corpses) {
      c.y = yAfterCageLands(c.x, c.y, c.width, c.height, c.isGrounded, box, exit);
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
      playerId,
      x: cx,
      y: GAME_CONSTANTS.GROUND_Y,
    });
  }
}
