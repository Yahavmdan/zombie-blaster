import { CharacterState, GAME_CONSTANTS, VfxEventType } from '@shared/index';
import { BoulderState, ZombieState } from '@shared/game-entities';
import { BoulderPuzzleLayout, IGameEngine } from './engine-types';
import { CombatSystem } from './combat-system';
import { VfxSystem } from './vfx-system';
import {
  Box,
  BoulderPath,
  boulderBox,
  boulderPath,
  crushTargets,
  debrisBox,
  gateBox,
  gateBroken,
  gateHitBy,
  rollBoulder,
} from './boulder-puzzle';

const WOOD_COLOR: string = '#a0703c';
const DUST_COLOR: string = '#c8b89a';
const CRUSH_DAMAGE_COLOR: string = '#ffcc66';

/**
 * Floor-2 boulder puzzle. The host (or solo) counts every player's attacks on the gate, breaks
 * it, rolls the released boulder down the chute, crushes zombies in its way and breaks the wall.
 * Clients only extrapolate the synced roll; the gate and wall break for them from the snapshot.
 */
export class BoulderPuzzleSystem {
  private hitCooldown: number = 0;
  /** Zombies already crushed by this boulder (each is crushed once). */
  private readonly crushed: Set<string> = new Set<string>();

  constructor(
    private readonly e: IGameEngine,
    private readonly combat: CombatSystem,
    private readonly vfx: VfxSystem,
  ) {}

  update(): void {
    const puzzle: BoulderPuzzleLayout | null = this.e.boulderPuzzle;
    const boulder: BoulderState | null = this.e.boulder;
    if (!puzzle || !boulder || boulder.wallBroken) return;
    const ledgeY: number = this.e.exitPlatform.y;
    if (!gateBroken(boulder)) {
      if (this.hitCooldown > 0) this.hitCooldown--;
      else this.applyGateHits(puzzle, boulder, ledgeY);
      return;
    }
    const path: BoulderPath = boulderPath(puzzle, ledgeY);
    const box: Box | null = boulderBox(boulder, path);
    if (box) this.crush(box, Math.sign(path.end.x - path.start.x));
    if (rollBoulder(boulder, path)) this.breakWall(puzzle);
  }

  tickClient(): void {
    const puzzle: BoulderPuzzleLayout | null = this.e.boulderPuzzle;
    const boulder: BoulderState | null = this.e.boulder;
    if (puzzle && boulder) rollBoulder(boulder, boulderPath(puzzle, this.e.exitPlatform.y));
  }

  private applyGateHits(puzzle: BoulderPuzzleLayout, boulder: BoulderState, ledgeY: number): void {
    const players: CharacterState[] = [
      ...(this.e.player ? [this.e.player] : []),
      ...this.e.remotePlayers,
    ];
    if (!players.some((p: CharacterState): boolean => gateHitBy(p, puzzle, ledgeY))) return;
    boulder.gateHits++;
    this.hitCooldown = GAME_CONSTANTS.BOULDER_HIT_COOLDOWN_TICKS;
    const gate: Box = gateBox(puzzle, ledgeY);
    const cx: number = gate.x + gate.width / 2;
    const cy: number = gate.y + gate.height / 2;
    const playerId: string = this.e.player?.id ?? '';
    if (gateBroken(boulder)) {
      this.e.breakPuzzleGate();
      this.vfx.spawnGateBreak(cx, cy);
      this.e.pendingVfxEvents.push({ type: VfxEventType.GateBreak, playerId, x: cx, y: cy });
      return;
    }
    this.vfx.spawnHitParticles(cx, cy, WOOD_COLOR);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.HitParticles,
      playerId,
      x: cx,
      y: cy,
      color: WOOD_COLOR,
    });
  }

  private breakWall(puzzle: BoulderPuzzleLayout): void {
    const cx: number = puzzle.wall.x + puzzle.wall.width / 2;
    const impactY: number = GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.BOULDER_CHUTE_END_CLEARANCE_PX;
    this.e.breakPuzzleWall();
    this.vfx.spawnWallBreak(cx, impactY);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.WallBreak,
      playerId: this.e.player?.id ?? '',
      x: cx,
      y: impactY,
    });
    // The wall comes down on whoever stands in front of it.
    this.crush(debrisBox(puzzle), puzzle.wallDir * -1);
  }

  private crush(box: Box, dir: number): void {
    const hit: ZombieState[] = crushTargets(this.e.zombies, box, this.crushed);
    const playerId: string = this.e.player?.id ?? '';
    for (const z of hit) {
      this.crushed.add(z.id);
      const damage: number = Math.max(
        1,
        Math.ceil((z.maxHp * GAME_CONSTANTS.BOULDER_CRUSH_DAMAGE_PERCENT) / 100),
      );
      z.hp -= damage;
      // A zombie in a monster-magnet drag keeps flying to the caster.
      if (!z.magnetPull) {
        z.velocityX = dir * GAME_CONSTANTS.KNOCKBACK_FORCE_ZOMBIE;
        z.velocityY = GAME_CONSTANTS.KNOCKBACK_UP_FORCE;
        z.isGrounded = false;
        z.knockbackFrames = GAME_CONSTANTS.KNOCKBACK_ZOMBIE_FRAMES;
      }
      const cx: number = z.x + z.instanceWidth / 2;
      const cy: number = z.y + z.instanceHeight / 2;
      this.vfx.spawnHitParticles(cx, cy, DUST_COLOR);
      this.vfx.spawnDamageNumber(cx, z.y - 10, damage, false, CRUSH_DAMAGE_COLOR);
      this.e.pendingVfxEvents.push(
        { type: VfxEventType.HitParticles, playerId, x: cx, y: cy, color: DUST_COLOR },
        {
          type: VfxEventType.DamageNumber,
          playerId,
          x: cx,
          y: z.y - 10,
          value: damage,
          isCrit: false,
          color: CRUSH_DAMAGE_COLOR,
        },
      );
      if (z.hp <= 0) this.combat.handleZombieDeath(z);
    }
  }
}
