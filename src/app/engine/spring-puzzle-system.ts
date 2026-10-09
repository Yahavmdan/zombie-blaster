import { CharacterState, GAME_CONSTANTS, VfxEventType } from '@shared/index';
import { SpringState, ZombieCorpse } from '@shared/game-entities';
import { IGameEngine, SpringPuzzleLayout } from './engine-types';
import { VfxSystem } from './vfx-system';
import { Box } from './boulder-puzzle';
import {
  buttonBox,
  buttonHitBy,
  corpsesOnSpring,
  flingIfOnSpring,
  pressButton,
  scaleLoadKg,
  scatterVelocity,
  springSpan,
  tickSpring,
  tickSpringClient,
} from './spring-puzzle';

const BUTTON_COLOR: string = '#ff4d4d';

/**
 * Floor-3 spring puzzle. The host (or solo) weighs the scale every tick (the cable raises or
 * lowers the button from that) and watches every player's attacks on the raised button: a press
 * starts the 3-2-1. When the count runs out the spring launches the local player if they stand on
 * it and scatters the corpses lying on it (the corpses are synced, so everyone sees them fly);
 * guests launch themselves when the synced launch reaches them (they own their player state).
 * Clients only move the button and run the count and bounce down.
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
    const players: CharacterState[] = [
      ...(this.e.player ? [this.e.player] : []),
      ...this.e.remotePlayers,
    ];
    spring.scaleKg = scaleLoadKg(
      puzzle,
      this.e.zombieCorpses,
      this.e.looseProps,
      this.e.zombies,
      players,
    );
    if (tickSpring(spring)) this.launch(puzzle);
    if (this.hitCooldown > 0) {
      this.hitCooldown--;
      return;
    }
    if (!players.some((p: CharacterState): boolean => buttonHitBy(p, puzzle, spring))) return;
    this.hitCooldown = GAME_CONSTANTS.SPRING_HIT_COOLDOWN_TICKS;
    if (pressButton(spring)) this.buttonClank(puzzle);
  }

  tickClient(): void {
    if (this.e.spring) tickSpringClient(this.e.spring);
  }

  /** Sparks off the button when a press starts the 3-2-1 (the count itself is synced state). */
  private buttonClank(puzzle: SpringPuzzleLayout): void {
    const button: Box = buttonBox(puzzle);
    const cx: number = button.x + button.width / 2;
    const cy: number = button.y + 6;
    this.vfx.spawnHitParticles(cx, cy, BUTTON_COLOR);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.HitParticles,
      playerId: this.e.player?.id ?? '',
      x: cx,
      y: cy,
      color: BUTTON_COLOR,
    });
  }

  private launch(puzzle: SpringPuzzleLayout): void {
    // Measured before anyone moves: the corpses lying on the spring right now fly off it.
    const thrown: ZombieCorpse[] = corpsesOnSpring(this.e.zombieCorpses, puzzle);
    for (const corpse of thrown) {
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
