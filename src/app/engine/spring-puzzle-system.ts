import { CharacterState, GAME_CONSTANTS, VfxEventType } from '@shared/index';
import { SpringState, ZombieCorpse } from '@shared/game-entities';
import { IGameEngine, SpringPuzzleLayout } from './engine-types';
import { VfxSystem } from './vfx-system';
import { Box } from './boulder-puzzle';
import {
  LeverPull,
  chargeCorpses,
  flingIfOnSpring,
  leverBox,
  leverHitBy,
  pullLever,
  scatterVelocity,
  springSpan,
  tickSpring,
  tickSpringClient,
} from './spring-puzzle';

const LEVER_COLOR: string = '#c8c8d0';

/**
 * Floor-3 spring puzzle. The host (or solo) watches every player's attacks on the lever: with a
 * full charge it starts the 3-2-1, else the lever only jiggles. When the count runs out the spring
 * launches the local player if they stand on it and scatters its charge through the air (the
 * corpses are synced, so everyone sees them fly); guests launch themselves when the synced launch
 * reaches them (they own their player state). Clients only run the count and bounce down.
 */
export class SpringPuzzleSystem {
  private hitCooldown: number = 0;

  constructor(
    private readonly e: IGameEngine,
    private readonly vfx: VfxSystem,
  ) {}

  update(): void {
    const puzzle: SpringPuzzleLayout | null = this.e.springPuzzle;
    const spring: SpringState | null = this.e.spring;
    if (!puzzle || !spring) return;
    if (tickSpring(spring)) this.launch(puzzle);
    if (this.hitCooldown > 0) {
      this.hitCooldown--;
      return;
    }
    const players: CharacterState[] = [
      ...(this.e.player ? [this.e.player] : []),
      ...this.e.remotePlayers,
    ];
    if (!players.some((p: CharacterState): boolean => leverHitBy(p, puzzle))) return;
    this.hitCooldown = GAME_CONSTANTS.SPRING_HIT_COOLDOWN_TICKS;
    const charge: number = chargeCorpses(this.e.zombieCorpses, puzzle).length;
    const pull: LeverPull | null = pullLever(spring, charge);
    if (pull) this.leverClank(puzzle);
  }

  tickClient(): void {
    if (this.e.spring) tickSpringClient(this.e.spring);
  }

  /** Sparks off the lever on every pull, armed or not (the 3-2-1 itself is synced state). */
  private leverClank(puzzle: SpringPuzzleLayout): void {
    const lever: Box = leverBox(puzzle);
    const cx: number = lever.x + lever.width / 2;
    const cy: number = lever.y + 10;
    this.vfx.spawnHitParticles(cx, cy, LEVER_COLOR);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.HitParticles,
      playerId: this.e.player?.id ?? '',
      x: cx,
      y: cy,
      color: LEVER_COLOR,
    });
  }

  private launch(puzzle: SpringPuzzleLayout): void {
    // Measured before anyone moves: the corpses lying on the spring right now are its charge.
    const charge: ZombieCorpse[] = chargeCorpses(this.e.zombieCorpses, puzzle);
    for (const corpse of charge) {
      const v: { vx: number; vy: number } = scatterVelocity(
        corpse,
        puzzle,
        Math.random(),
        Math.random(),
      );
      corpse.velocityX = v.vx;
      corpse.velocityY = v.vy;
      corpse.isGrounded = false;
    }
    if (this.e.player) flingIfOnSpring(this.e.player, puzzle);
    const [left, right]: [number, number] = springSpan(puzzle);
    const cx: number = (left + right) / 2;
    const y: number = puzzle.spring.y;
    this.vfx.spawnSpringLaunch(cx, y);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.SpringLaunch,
      playerId: this.e.player?.id ?? '',
      x: cx,
      y,
    });
  }
}
