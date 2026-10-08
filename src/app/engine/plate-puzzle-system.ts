import { CharacterState, GAME_CONSTANTS, VfxEventType } from '@shared/index';
import { PlateState, ZombieCorpse, ZombieState } from '@shared/game-entities';
import { IGameEngine, PlatePuzzleLayout } from './engine-types';
import { VfxSystem } from './vfx-system';
import { Box } from './boulder-puzzle';
import {
  DoorChange,
  doorBox,
  kickCorpse,
  kicksBy,
  plateWeight,
  tickDoor,
  weighPlate,
} from './plate-puzzle';

const KICK_COLOR: string = '#b8a48a';

/**
 * Floor-5 pressure plate. The host (or solo) weighs the plate every tick from the corpses and
 * every player on it, slides the exit door toward open or shut, and lets zombies walking over the
 * plate kick corpses off. Clients slide the door from the synced weight between snapshots.
 */
export class PlatePuzzleSystem {
  /** Ticks until each zombie (by id) may kick again. */
  private readonly kickCooldowns: Map<string, number> = new Map<string, number>();

  constructor(
    private readonly e: IGameEngine,
    private readonly vfx: VfxSystem,
  ) {}

  update(): void {
    const puzzle: PlatePuzzleLayout | null = this.e.platePuzzle;
    const plate: PlateState | null = this.e.plate;
    if (!puzzle || !plate) {
      this.kickCooldowns.clear();
      return;
    }
    this.kicks(puzzle);
    const players: CharacterState[] = [
      ...(this.e.player ? [this.e.player] : []),
      ...this.e.remotePlayers,
    ];
    const change: DoorChange | null = weighPlate(
      plate,
      plateWeight(puzzle, this.e.zombieCorpses, players),
    );
    tickDoor(plate);
    if (change) this.doorEffect(change);
  }

  tickClient(): void {
    if (this.e.plate) tickDoor(this.e.plate);
  }

  private kicks(puzzle: PlatePuzzleLayout): void {
    const zombies: ZombieState[] = this.e.zombies;
    const corpses: ZombieCorpse[] = this.e.zombieCorpses;
    for (const z of zombies) {
      const cooldown: number = this.kickCooldowns.get(z.id) ?? 0;
      if (cooldown > 0) {
        this.kickCooldowns.set(z.id, cooldown - 1);
        continue;
      }
      const kick: { corpse: ZombieCorpse; dir: number } | undefined = kicksBy(
        z,
        corpses,
        puzzle,
      )[0];
      if (!kick) continue;
      kickCorpse(kick.corpse, kick.dir);
      this.kickCooldowns.set(z.id, GAME_CONSTANTS.PLATE_KICK_COOLDOWN_TICKS);
      const x: number = kick.corpse.x + kick.corpse.width / 2;
      const y: number = puzzle.plateY - 4;
      this.vfx.spawnHitParticles(x, y, KICK_COLOR);
      this.e.pendingVfxEvents.push({
        type: VfxEventType.HitParticles,
        playerId: this.e.player?.id ?? '',
        x,
        y,
        color: KICK_COLOR,
      });
    }
  }

  /** Bars grind up (or slam down) on the exit door: everyone sees it, wherever they stand. */
  private doorEffect(change: DoorChange): void {
    const door: Box = doorBox(this.e.exitPlatform);
    const x: number = door.x + door.width / 2;
    const y: number = door.y + door.height / 2;
    const playerId: string = this.e.player?.id ?? '';
    if (change === 'open') {
      this.vfx.spawnDoorOpen(x, y);
      this.e.pendingVfxEvents.push({ type: VfxEventType.DoorOpen, playerId, x, y });
    } else {
      this.vfx.spawnDoorShut(x, y);
      this.e.pendingVfxEvents.push({ type: VfxEventType.DoorShut, playerId, x, y });
    }
  }
}
