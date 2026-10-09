import { CharacterState, GAME_CONSTANTS, VfxEventType } from '@shared/index';
import { LooseProp, ZombieState } from '@shared/game-entities';
import { IGameEngine } from './engine-types';
import { CombatSystem } from './combat-system';
import { LoosePropSystem } from './loose-prop-system';
import { VfxSystem } from './vfx-system';
import { Box, Point } from './boulder-puzzle';
import { isExplosive, PropKind } from './level-generator';
import {
  barrelHitBy,
  blastBarrels,
  blastCenter,
  blastDamage,
  blastZombies,
  chainFuse,
  lightFuse,
  tickFuse,
} from './exploding-barrel';

const SPARK_COLOR: string = '#ffb347';
const BLAST_DAMAGE_COLOR: string = '#ff8a3d';

/**
 * Exploding barrels. The host (or solo) watches every player's attacks on the barrels: a hit
 * lights the fuse, and when it runs out the barrel blows up, hurting the zombies around it and
 * setting off the barrels next to it. The fuse and the blown-up barrels travel with the synced
 * props (LoosePropSystem.moved), so clients only draw them; the blast itself is a VFX event.
 */
export class ExplodingBarrelSystem {
  constructor(
    private readonly e: IGameEngine,
    private readonly props: LoosePropSystem,
    private readonly combat: CombatSystem,
    private readonly vfx: VfxSystem,
  ) {}

  update(): void {
    const players: CharacterState[] = [
      ...(this.e.player ? [this.e.player] : []),
      ...this.e.remotePlayers,
    ];
    const barrels: LooseProp[] = this.barrels();
    for (const b of barrels) {
      if (!players.some((p: CharacterState): boolean => barrelHitBy(p, b))) continue;
      if (lightFuse(b)) this.spark(b);
    }
    for (const b of barrels.filter((q: LooseProp): boolean => tickFuse(q))) this.blowUp(b);
    const inTheWay: Box[] = players
      .filter((p: CharacterState): boolean => !p.isDead)
      .map(
        (p: CharacterState): Box => ({
          x: p.x,
          y: p.y,
          width: GAME_CONSTANTS.PLAYER_WIDTH,
          height: GAME_CONSTANTS.PLAYER_HEIGHT,
        }),
      );
    for (const b of this.props.respawn(inTheWay)) this.dropIn(b);
  }

  /** A blown-up barrel is back on its spawn spot. */
  private dropIn(b: LooseProp): void {
    const cx: number = b.x + b.width / 2;
    const bottom: number = b.y + b.height;
    this.vfx.spawnBarrelRespawn(cx, bottom);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.BarrelRespawn,
      playerId: this.e.player?.id ?? '',
      x: cx,
      y: bottom,
    });
  }

  private barrels(): LooseProp[] {
    return this.e.looseProps.filter((p: LooseProp): boolean => {
      const kind: PropKind | undefined = this.props.kindOf(p.id);
      return kind !== undefined && isExplosive(kind);
    });
  }

  /** Sparks off the barrel's top as the fuse catches (the burning fuse itself is synced state). */
  private spark(b: LooseProp): void {
    const cx: number = b.x + b.width / 2;
    const cy: number = b.y;
    this.vfx.spawnHitParticles(cx, cy, SPARK_COLOR);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.HitParticles,
      playerId: this.e.player?.id ?? '',
      x: cx,
      y: cy,
      color: SPARK_COLOR,
    });
  }

  private blowUp(b: LooseProp): void {
    const center: Point = blastCenter(b);
    const playerId: string = this.e.player?.id ?? '';
    // A barrel lying on something leaves a scorch mark there; one in the air (thrown) does not.
    const groundY: number | null = b.isGrounded && b.carrierId === null ? b.y + b.height : null;
    this.props.remove(b.id);
    this.vfx.spawnBarrelBlast(center.x, center.y, groundY);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.BarrelBlast,
      playerId,
      x: center.x,
      y: center.y,
      ...(groundY !== null ? { targetY: groundY } : {}),
    });
    this.e.requestHitStop(GAME_CONSTANTS.BARREL_BLAST_HITSTOP_TICKS);
    for (const other of blastBarrels(this.barrels(), center)) chainFuse(other);
    for (const z of blastZombies(this.e.zombies, center)) this.hurt(z, center, playerId);
  }

  private hurt(z: ZombieState, center: Point, playerId: string): void {
    const damage: number = blastDamage(z);
    z.hp -= damage;
    const cx: number = z.x + z.instanceWidth / 2;
    // A zombie in a monster-magnet drag keeps flying to the caster.
    if (!z.magnetPull) {
      z.velocityX = (Math.sign(cx - center.x) || 1) * GAME_CONSTANTS.BARREL_BLAST_KNOCKBACK;
      z.velocityY = GAME_CONSTANTS.BARREL_BLAST_KNOCKBACK_UP;
      z.isGrounded = false;
      z.knockbackFrames = GAME_CONSTANTS.KNOCKBACK_ZOMBIE_FRAMES;
    }
    this.vfx.spawnDamageNumber(cx, z.y - 10, damage, false, BLAST_DAMAGE_COLOR);
    this.e.pendingVfxEvents.push({
      type: VfxEventType.DamageNumber,
      playerId,
      x: cx,
      y: z.y - 10,
      value: damage,
      isCrit: false,
      color: BLAST_DAMAGE_COLOR,
    });
    if (z.hp <= 0) this.combat.handleZombieDeath(z);
  }
}
