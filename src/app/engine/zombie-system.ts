import {
  CharacterState,
  GAME_CONSTANTS,
  ZOMBIE_TYPES,
} from '@shared/index';
import {
  ZombieDefinition,
  ZombieState,
  ZombieType,
} from '@shared/game-entities';
import { ZombieCorpse } from '@shared/game-entities';
import { IGameEngine, Platform } from './engine-types';
import { PhysicsSystem } from './physics-system';
import { CombatSystem } from './combat-system';
import { ProjectileSystem } from './projectile-system';
import { ZombieAnimState } from './zombie-sprite-animator';

interface TargetInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isLocal: boolean;
  defense: number;
}

export class ZombieSystem {
  constructor(
    private readonly e: IGameEngine,
    private readonly physics: PhysicsSystem,
    private readonly combat: CombatSystem,
    private readonly projectiles: ProjectileSystem,
  ) {}

  private getAllTargets(): TargetInfo[] {
    const targets: TargetInfo[] = [];
    const p: CharacterState | null = this.e.player;
    if (p && !p.isDead && !p.isDown) {
      targets.push({
        id: p.id,
        x: p.x,
        y: p.y,
        width: GAME_CONSTANTS.PLAYER_WIDTH,
        height: GAME_CONSTANTS.PLAYER_HEIGHT,
        isLocal: true,
        defense: p.derived.defense,
      });
    }
    for (const rp of this.e.remotePlayers) {
      if (rp.isDead || rp.isDown) continue;
      targets.push({
        id: rp.id,
        x: rp.x,
        y: rp.y,
        width: GAME_CONSTANTS.PLAYER_WIDTH,
        height: GAME_CONSTANTS.PLAYER_HEIGHT,
        isLocal: false,
        defense: rp.derived.defense,
      });
    }
    return targets;
  }

  private findNearestTarget(zx: number, zy: number): TargetInfo | null {
    const targets: TargetInfo[] = this.getAllTargets();
    let nearest: TargetInfo | null = null;
    let bestDist: number = Infinity;
    for (const t of targets) {
      const dx: number = (t.x + t.width / 2) - zx;
      const dy: number = (t.y + t.height / 2) - zy;
      const dist: number = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        nearest = t;
      }
    }
    return nearest;
  }

  updateZombies(): void {
    if (this.getAllTargets().length === 0) return;

    for (const z of this.e.zombies) {
      if (z.isDead) continue;
      const zDef: ZombieDefinition = ZOMBIE_TYPES[z.type];

      if (z.spawnTimer > 0) {
        z.spawnTimer--;
        const spriteKey: string = this.e.zombieSpriteAnimator.getSpriteKey(z.type);
        this.e.zombieSpriteAnimator.tick(z.id, spriteKey);
        if (z.spawnTimer <= 0) {
          this.e.zombieSpriteAnimator.setState(z.id, ZombieAnimState.Idle);
        }
        continue;
      }

      if (z.knockbackFrames > 0) {
        z.knockbackFrames--;
      } else if (z.reactionDelay > 0) {
        z.reactionDelay--;
      } else {
        this.updateZombieAI(z, zDef);
        z.reactionDelay = GAME_CONSTANTS.ZOMBIE_REACTION_DELAY_MIN_TICKS +
          Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_REACTION_DELAY_MAX_TICKS - GAME_CONSTANTS.ZOMBIE_REACTION_DELAY_MIN_TICKS));
      }

      if (z.jumpCooldown > 0) z.jumpCooldown--;
      if (z.attackCooldown > 0) z.attackCooldown--;
      if (z.platformDropTimer > 0) z.platformDropTimer--;

      const nearestForHesitation: TargetInfo | null = this.findNearestTarget(z.x + z.instanceWidth / 2, z.y + z.instanceHeight / 2);
      if (nearestForHesitation) {
        this.tickHesitation(z, nearestForHesitation);
      }

      this.updateZombieAnimState(z);
      const spriteKey: string = this.e.zombieSpriteAnimator.getSpriteKey(z.type);
      this.e.zombieSpriteAnimator.tick(z.id, spriteKey);

      this.updateZombieAttack(z, zDef);

      if (z.type === ZombieType.DragonBoss) {
        const targetY: number = GAME_CONSTANTS.GROUND_Y - z.instanceHeight - GAME_CONSTANTS.DRAGON_HOVER_Y_OFFSET;
        z.velocityY += (targetY - z.y) * 0.04;
        z.velocityY *= 0.85;
        z.x += z.velocityX;
        z.y += z.velocityY;
      } else {
        z.velocityY += GAME_CONSTANTS.GRAVITY;
        if (z.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
          z.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
        }

        z.x += z.velocityX;
        z.y += z.velocityY;

        z.isGrounded = false;
        for (const plat of this.e.platforms) {
          if (z.platformDropTimer > 0 && plat.y !== GAME_CONSTANTS.GROUND_Y) continue;
          const zBottom: number = z.y + z.instanceHeight;
          const prevZBottom: number = zBottom - z.velocityY;
          if (
            z.x + z.instanceWidth > plat.x &&
            z.x < plat.x + plat.width &&
            zBottom >= plat.y &&
            prevZBottom <= plat.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
            z.velocityY >= 0
          ) {
            z.y = plat.y - z.instanceHeight;
            z.velocityY = 0;
            z.isGrounded = true;
          }
        }

        let bestCorpseSurface: number | null = null;
        const zBot: number = z.y + z.instanceHeight;
        const zPrevBot: number = zBot - z.velocityY;
        const wRatio: number = GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_WIDTH_RATIO;
        for (const corpse of this.e.zombieCorpses) {
          if (!corpse.isGrounded) continue;
          const cEffX: number = corpse.x + corpse.width * (1 - wRatio) / 2;
          const cEffW: number = corpse.width * wRatio;
          const surfaceY: number = corpse.y + corpse.height - GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_HEIGHT;
          if (
            z.x + z.instanceWidth > cEffX &&
            z.x < cEffX + cEffW &&
            zBot >= surfaceY &&
            zPrevBot <= surfaceY + GAME_CONSTANTS.ZOMBIE_CORPSE_SNAP_TOLERANCE &&
            z.velocityY >= 0
          ) {
            if (bestCorpseSurface === null || surfaceY < bestCorpseSurface) {
              bestCorpseSurface = surfaceY;
            }
          }
        }
        if (bestCorpseSurface !== null) {
          z.y = bestCorpseSurface - z.instanceHeight;
          z.velocityY = 0;
          z.isGrounded = true;
        }

        let bestZombieSurface: number | null = null;
        const climbRatio: number = GAME_CONSTANTS.ZOMBIE_CLIMB_WIDTH_RATIO;
        for (const other of this.e.zombies) {
          if (other === z || other.isDead || other.spawnTimer > 0) continue;
          if (other.type === ZombieType.DragonBoss) continue;
          if (!other.isGrounded) continue;
          const oEffX: number = other.x + other.instanceWidth * (1 - climbRatio) / 2;
          const oEffW: number = other.instanceWidth * climbRatio;
          const surfaceY: number = other.y;
          if (
            z.x + z.instanceWidth > oEffX &&
            z.x < oEffX + oEffW &&
            zBot >= surfaceY &&
            zPrevBot <= surfaceY + GAME_CONSTANTS.ZOMBIE_CLIMB_SNAP_TOLERANCE &&
            z.velocityY >= 0
          ) {
            if (bestZombieSurface === null || surfaceY < bestZombieSurface) {
              bestZombieSurface = surfaceY;
            }
          }
        }
        if (bestZombieSurface !== null) {
          z.y = bestZombieSurface - z.instanceHeight;
          z.velocityY = 0;
          z.isGrounded = true;
        }
      }

      const minX: number = 0;
      const maxX: number = GAME_CONSTANTS.CANVAS_WIDTH - z.instanceWidth;
      if (z.x < minX) {
        z.x = minX;
        z.velocityX = 0;
      } else if (z.x > maxX) {
        z.x = maxX;
        z.velocityX = 0;
      }

    
    }

    this.resolveZombieCollisions();
  }

  private tickHesitation(z: ZombieState, target: TargetInfo): void {
    if (z.attackHesitation <= 0 || z.attackCooldown > 0 || z.attackAnimTimer > 0 || z.knockbackFrames > 0) return;
    if (z.type === ZombieType.DragonBoss || z.type === ZombieType.Spitter) return;

    const zCx: number = z.x + z.instanceWidth / 2;
    const zCy: number = z.y + z.instanceHeight / 2;
    const tCx: number = target.x + target.width / 2;
    const tCy: number = target.y + target.height / 2;
    const dx: number = Math.abs(tCx - zCx);
    const dy: number = Math.abs(tCy - zCy);
    const effectiveRange: number = GAME_CONSTANTS.ZOMBIE_ATTACK_RANGE + z.hesitationRange;
    const inRange: boolean = dx < z.instanceWidth / 2 + effectiveRange + target.width / 2
      && dy < z.instanceHeight;

    if (inRange) {
      z.attackHesitation--;
    }
  }

  private updateZombieAttack(z: ZombieState, zDef: ZombieDefinition): void {
    if (z.attackAnimTimer > 0) {
      z.attackAnimTimer--;

      const hitTick: number = zDef.attackAnimTicks - zDef.attackHitTick;
      if (z.attackAnimTimer === hitTick && !z.attackHasHit) {
        z.attackHasHit = true;
        if (z.type === ZombieType.DragonBoss) {
          this.projectiles.spawnDragonProjectile(z);
        } else if (z.type === ZombieType.Spitter) {
          this.projectiles.spawnSpitterProjectile(z);
        } else {
          this.resolveZombieSwingHits(z);
        }
      }
      return;
    }

    if (z.attackCooldown > 0 || z.knockbackFrames > 0) return;

    const zCenterX: number = z.x + z.instanceWidth / 2;
    const zCenterY: number = z.y + z.instanceHeight / 2;
    const target: TargetInfo | null = this.findNearestTarget(zCenterX, zCenterY);
    if (!target) return;

    const tCenterX: number = target.x + target.width / 2;
    const tCenterY: number = target.y + target.height / 2;
    const distX: number = Math.abs(tCenterX - zCenterX);
    const distY: number = Math.abs(tCenterY - zCenterY);

    const isDragon: boolean = z.type === ZombieType.DragonBoss;
    const isSpitter: boolean = z.type === ZombieType.Spitter;
    const isRanged: boolean = isDragon || isSpitter;
    const attackRange: number = isDragon
      ? GAME_CONSTANTS.DRAGON_ATTACK_RANGE
      : isSpitter
        ? GAME_CONSTANTS.SPITTER_ATTACK_RANGE
        : z.instanceWidth / 2 + GAME_CONSTANTS.ZOMBIE_ATTACK_RANGE + target.width / 2;
    const heightCheck: number = isRanged ? attackRange : z.instanceHeight;

    if (distX < attackRange && distY < heightCheck) {
      if (!isRanged && z.attackHesitation > 0) return;
      z.attackAnimTimer = zDef.attackAnimTicks;
      z.attackHasHit = false;
      z.attackCooldown = GAME_CONSTANTS.ZOMBIE_ATTACK_COOLDOWN_MIN +
        Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_ATTACK_COOLDOWN_MAX - GAME_CONSTANTS.ZOMBIE_ATTACK_COOLDOWN_MIN));
      if (!isRanged) {
        z.attackHesitation = Math.floor(zDef.hesitationMin + Math.random() * (zDef.hesitationMax - zDef.hesitationMin));
        z.hesitationRange = GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MIN +
          Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MAX - GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MIN));
      }
    }
  }

  private resolveZombieSwingHits(z: ZombieState): void {
    const swingX: number = z.facing > 0
      ? z.x + z.instanceWidth
      : z.x - GAME_CONSTANTS.ZOMBIE_ATTACK_RANGE;
    const swingY: number = z.y;
    const swingW: number = GAME_CONSTANTS.ZOMBIE_ATTACK_RANGE;
    const swingH: number = z.instanceHeight;

    for (const target of this.getAllTargets()) {
      const hit: boolean = this.physics.rectsOverlap(
        swingX, swingY, swingW, swingH,
        target.x, target.y, target.width, target.height,
      );
      if (!hit) continue;

      const baseHit: number = z.instanceDamageMin + Math.floor(Math.random() * (z.instanceDamageMax - z.instanceDamageMin + 1));
      const rawDamage: number = Math.max(1, baseHit - target.defense);

      if (target.isLocal) {
        if (this.e.invincibilityFrames <= 0) {
          this.combat.applyZombieDamageToPlayer(rawDamage, z);
        }
      } else {
        const knockDir: number = target.x > z.x ? 1 : -1;
        this.e.pendingRemoteAttacks.push({ targetPlayerId: target.id, damage: rawDamage, knockbackDir: knockDir, isPoisonAttack: false });
        this.e.onRemotePlayerDamaged?.(target.id, rawDamage, z.x, z.y, knockDir, false);
      }
    }
  }

  private updateZombieAI(z: ZombieState, zDef: ZombieDefinition): void {
    const zCx: number = z.x + z.instanceWidth / 2;
    const zCy: number = z.y + z.instanceHeight / 2;
    const target: TargetInfo | null = this.findNearestTarget(zCx, zCy);
    if (!target) return;

    if (z.type === ZombieType.DragonBoss) {
      this.updateDragonAI(z);
      return;
    }

    if (z.type === ZombieType.Spitter) {
      this.updateSpitterAI(z);
      return;
    }

    const detectionRadius: number = GAME_CONSTANTS.CANVAS_WIDTH * GAME_CONSTANTS.ZOMBIE_DETECTION_RANGE;
    const distToTargetX: number = Math.abs(zCx - (target.x + target.width / 2));
    if (distToTargetX > detectionRadius) {
      this.updateZombieIdleWander(z, zDef);
      return;
    }

    z.facing = target.x > z.x ? 1 : -1;

    if (z.attackCooldown <= 0 && z.attackAnimTimer <= 0 && z.attackHesitation > 0) {
      const effectiveRange: number = GAME_CONSTANTS.ZOMBIE_ATTACK_RANGE + z.hesitationRange;
      const tCx: number = target.x + target.width / 2;
      const tCy: number = target.y + target.height / 2;
      const dx: number = Math.abs(tCx - zCx);
      const dy: number = Math.abs(tCy - zCy);
      const inRange: boolean = dx < z.instanceWidth / 2 + effectiveRange + target.width / 2
        && dy < z.instanceHeight;
      if (inRange) {
        z.velocityX = 0;
        return;
      }
    }

    const targetX: number = target.x + z.orbitOffset;
    const dxToTarget: number = targetX - z.x;
    const dy: number = target.y - z.y;
    const targetIsAbove: boolean = dy < -z.instanceHeight;
    const distToTarget: number = Math.abs(target.x - z.x);

    if (Math.abs(dxToTarget) < GAME_CONSTANTS.ZOMBIE_ORBIT_ARRIVE_THRESHOLD) {
      const side: number = z.orbitOffset > 0 ? -1 : 1;
      z.orbitOffset = side * (GAME_CONSTANTS.ZOMBIE_ORBIT_MIN +
        Math.random() * (GAME_CONSTANTS.ZOMBIE_ORBIT_MAX - GAME_CONSTANTS.ZOMBIE_ORBIT_MIN));
    }

    z.velocityX = dxToTarget > 0 ? z.instanceSpeed : -z.instanceSpeed;

    if (!z.isGrounded || z.jumpCooldown > 0) return;

    const targetIsBelow: boolean = dy > z.instanceHeight;

    if (targetIsBelow && z.y + z.instanceHeight < GAME_CONSTANTS.GROUND_Y && Math.random() < GAME_CONSTANTS.ZOMBIE_PLATFORM_DROP_CHANCE) {
      z.platformDropTimer = GAME_CONSTANTS.ZOMBIE_PLATFORM_DROP_TICKS;
      z.y += GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE + 1;
      z.isGrounded = false;
    } else if (targetIsAbove && Math.random() < GAME_CONSTANTS.ZOMBIE_JUMP_PLATFORM_CHASE_CHANCE) {
      this.zombieJump(z);
    } else if (distToTarget < GAME_CONSTANTS.ZOMBIE_ORBIT_MAX * 2 && Math.random() < GAME_CONSTANTS.ZOMBIE_JUMP_CHANCE_PER_TICK) {
      this.zombieJump(z);
    }
  }

  private updateDragonAI(z: ZombieState): void {
    const zCx: number = z.x + z.instanceWidth / 2;
    const zCy: number = z.y + z.instanceHeight / 2;
    const target: TargetInfo | null = this.findNearestTarget(zCx, zCy);
    if (!target) return;

    const dx: number = target.x - z.x;
    const dist: number = Math.abs(dx);
    const keepDist: number = GAME_CONSTANTS.DRAGON_KEEP_DISTANCE;

    if (z.attackAnimTimer > 0) {
      z.velocityX *= 0.85;
      return;
    }

    if (dist < keepDist * 0.6) {
      z.velocityX = dx > 0 ? -z.instanceSpeed * 1.2 : z.instanceSpeed * 1.2;
    } else if (dist > keepDist * 1.4) {
      z.velocityX = dx > 0 ? z.instanceSpeed * GAME_CONSTANTS.DRAGON_APPROACH_SPEED_MULT : -z.instanceSpeed * GAME_CONSTANTS.DRAGON_APPROACH_SPEED_MULT;
    } else {
      z.velocityX *= 0.92;
    }

    if (z.x < 20) z.velocityX = Math.max(z.velocityX, z.instanceSpeed);
    if (z.x + z.instanceWidth > GAME_CONSTANTS.CANVAS_WIDTH - 20) z.velocityX = Math.min(z.velocityX, -z.instanceSpeed);
  }

  private updateSpitterAI(z: ZombieState): void {
    const zCx: number = z.x + z.instanceWidth / 2;
    const zCy: number = z.y + z.instanceHeight / 2;
    const target: TargetInfo | null = this.findNearestTarget(zCx, zCy);
    if (!target) return;

    const dx: number = target.x - z.x;
    const dist: number = Math.abs(dx);
    const keepDist: number = GAME_CONSTANTS.SPITTER_KEEP_DISTANCE;

    if (z.attackAnimTimer > 0) {
      z.velocityX *= 0.8;
      return;
    }

    z.facing = dx > 0 ? 1 : -1;

    if (dist < keepDist * 0.5) {
      z.velocityX = dx > 0 ? -z.instanceSpeed * 1.3 : z.instanceSpeed * 1.3;
    } else if (dist > keepDist * 1.3) {
      z.velocityX = dx > 0 ? z.instanceSpeed : -z.instanceSpeed;
    } else {
      z.velocityX *= 0.9;
    }

    const margin: number = 20;
    if (z.x < margin) z.velocityX = Math.max(z.velocityX, z.instanceSpeed);
    if (z.x + z.instanceWidth > GAME_CONSTANTS.CANVAS_WIDTH - margin) z.velocityX = Math.min(z.velocityX, -z.instanceSpeed);

    if (!z.isGrounded || z.jumpCooldown > 0) return;

    const targetIsAbove: boolean = (target.y - z.y) < -z.instanceHeight;
    const targetIsBelow: boolean = (target.y - z.y) > z.instanceHeight;

    if (targetIsBelow && z.y + z.instanceHeight < GAME_CONSTANTS.GROUND_Y && Math.random() < GAME_CONSTANTS.ZOMBIE_PLATFORM_DROP_CHANCE) {
      z.platformDropTimer = GAME_CONSTANTS.ZOMBIE_PLATFORM_DROP_TICKS;
      z.y += GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE + 1;
      z.isGrounded = false;
    } else if (targetIsAbove && Math.random() < GAME_CONSTANTS.ZOMBIE_JUMP_PLATFORM_CHASE_CHANCE) {
      this.zombieJump(z);
    }
  }

  private updateZombieIdleWander(z: ZombieState, zDef: ZombieDefinition): void {
    const isStanding: boolean = Math.abs(z.velocityX) < 0.01;

    if (isStanding) {
      if (Math.random() < GAME_CONSTANTS.ZOMBIE_IDLE_DIRECTION_CHANGE_CHANCE) {
        z.facing = Math.random() > 0.5 ? 1 : -1;
        z.velocityX = z.facing * z.instanceSpeed * GAME_CONSTANTS.ZOMBIE_IDLE_WANDER_SPEED_MULT;
      }
    } else {
      if (Math.random() < GAME_CONSTANTS.ZOMBIE_IDLE_STOP_CHANCE) {
        z.velocityX = 0;
      } else if (Math.random() < GAME_CONSTANTS.ZOMBIE_IDLE_DIRECTION_CHANGE_CHANCE) {
        z.facing = z.facing > 0 ? -1 : 1;
        z.velocityX = z.facing * z.instanceSpeed * GAME_CONSTANTS.ZOMBIE_IDLE_WANDER_SPEED_MULT;
      }
    }

    const margin: number = 20;
    if (z.x < margin) {
      z.facing = 1;
      z.velocityX = z.instanceSpeed * GAME_CONSTANTS.ZOMBIE_IDLE_WANDER_SPEED_MULT;
    } else if (z.x + z.instanceWidth > GAME_CONSTANTS.CANVAS_WIDTH - margin) {
      z.facing = -1;
      z.velocityX = -z.instanceSpeed * GAME_CONSTANTS.ZOMBIE_IDLE_WANDER_SPEED_MULT;
    }

    if (z.attackAnimTimer <= 0 && z.attackCooldown <= 0 && Math.random() < GAME_CONSTANTS.ZOMBIE_IDLE_ATTACK_CHANCE) {
      z.attackAnimTimer = zDef.attackAnimTicks;
      z.attackHasHit = true;
      z.attackCooldown = GAME_CONSTANTS.ZOMBIE_ATTACK_COOLDOWN_MIN +
        Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_ATTACK_COOLDOWN_MAX - GAME_CONSTANTS.ZOMBIE_ATTACK_COOLDOWN_MIN));
      z.velocityX = 0;
    }
  }

  private updateZombieAnimState(z: ZombieState): void {
    if (z.isDead) {
      this.e.zombieSpriteAnimator.setState(z.id, ZombieAnimState.Dead);
      return;
    }

    if (z.attackAnimTimer > 0) {
      this.e.zombieSpriteAnimator.setState(z.id, ZombieAnimState.Attack);
      return;
    }

    if (z.knockbackFrames > 0) {
      this.e.zombieSpriteAnimator.setState(z.id, ZombieAnimState.Hurt);
      return;
    }

    if (Math.abs(z.velocityX) > 0.1) {
      this.e.zombieSpriteAnimator.setState(z.id, ZombieAnimState.Walk);
      return;
    }

    this.e.zombieSpriteAnimator.setState(z.id, ZombieAnimState.Idle);
  }

  private zombieJump(z: ZombieState): void {
    z.velocityY = GAME_CONSTANTS.ZOMBIE_JUMP_FORCE;
    z.isGrounded = false;
    z.jumpCooldown = GAME_CONSTANTS.ZOMBIE_JUMP_COOLDOWN_MIN +
      Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_JUMP_COOLDOWN_MAX - GAME_CONSTANTS.ZOMBIE_JUMP_COOLDOWN_MIN));
  }

  private resolveZombieCollisions(): void {
    const alive: ZombieState[] = this.e.zombies.filter(
      (z: ZombieState) => !z.isDead && z.spawnTimer <= 0 && z.type !== ZombieType.DragonBoss,
    );
    const count: number = alive.length;

    const overlapCounts: number[] = new Array<number>(count).fill(0);
    for (let i: number = 0; i < count; i++) {
      const a: ZombieState = alive[i];
      const aBottom: number = a.y + a.instanceHeight;
      for (let j: number = i + 1; j < count; j++) {
        const b: ZombieState = alive[j];
        const bBottom: number = b.y + b.instanceHeight;
        if (Math.abs(aBottom - bBottom) > GAME_CONSTANTS.ZOMBIE_COLLISION_Y_TOLERANCE) continue;
        const xOverlap: number = Math.min(a.x + a.instanceWidth, b.x + b.instanceWidth) - Math.max(a.x, b.x);
        if (xOverlap > 0) {
          overlapCounts[i]++;
          overlapCounts[j]++;
        }
      }
    }

    const crowdLimit: number = GAME_CONSTANTS.ZOMBIE_CROWD_OVERLAP_LIMIT;

    for (let i: number = 0; i < count; i++) {
      const a: ZombieState = alive[i];
      const aBottom: number = a.y + a.instanceHeight;

      for (let j: number = i + 1; j < count; j++) {
        const b: ZombieState = alive[j];
        const bBottom: number = b.y + b.instanceHeight;

        if (Math.abs(aBottom - bBottom) > GAME_CONSTANTS.ZOMBIE_COLLISION_Y_TOLERANCE) continue;

        const xOverlap: number = Math.min(a.x + a.instanceWidth, b.x + b.instanceWidth) - Math.max(a.x, b.x);
        if (xOverlap <= 0) continue;

        const maxOverlap: number = Math.max(overlapCounts[i], overlapCounts[j]);
        if (maxOverlap <= crowdLimit) continue;

        const strength: number = GAME_CONSTANTS.ZOMBIE_CROWD_PUSH_STRENGTH;

        const aCx: number = a.x + a.instanceWidth / 2;
        const bCx: number = b.x + b.instanceWidth / 2;
        const pushDir: number = aCx < bCx ? -1 : (aCx > bCx ? 1 : (Math.random() > 0.5 ? 1 : -1));
        const pushAmount: number = xOverlap * strength;

        const aArea: number = a.instanceWidth * a.instanceHeight;
        const bArea: number = b.instanceWidth * b.instanceHeight;
        const totalArea: number = aArea + bArea;
        const aRatio: number = bArea / totalArea;
        const bRatio: number = aArea / totalArea;

        a.x += pushDir * pushAmount * aRatio;
        b.x -= pushDir * pushAmount * bRatio;

        const aMaxX: number = GAME_CONSTANTS.CANVAS_WIDTH - a.instanceWidth;
        const bMaxX: number = GAME_CONSTANTS.CANVAS_WIDTH - b.instanceWidth;
        a.x = Math.max(0, Math.min(aMaxX, a.x));
        b.x = Math.max(0, Math.min(bMaxX, b.x));
      }
    }
  }

  updateSpawning(): void {
    if (this.e.floorTransitionTimer > 0) {
      this.e.floorTransitionTimer--;
      return;
    }

    const maxAlive: number = Math.min(
      GAME_CONSTANTS.FLOOR_MAX_ALIVE_ZOMBIES_BASE + (this.e.floor - 1) * GAME_CONSTANTS.FLOOR_MAX_ALIVE_ZOMBIES_GROWTH,
      GAME_CONSTANTS.FLOOR_MAX_ALIVE_ZOMBIES_CAP,
    );
    const aliveCount: number = this.e.zombies.filter((z: ZombieState) => !z.isDead).length;
    if (aliveCount >= maxAlive) return;

    this.e.spawnTimer--;
    if (this.e.spawnTimer <= 0) {
      this.spawnZombie();
      const interval: number = Math.max(
        GAME_CONSTANTS.ZOMBIE_SPAWN_MIN_INTERVAL_MS,
        GAME_CONSTANTS.ZOMBIE_SPAWN_INTERVAL_MS - this.e.floor * GAME_CONSTANTS.ZOMBIE_SPAWN_DECREASE_PER_WAVE,
      );
      this.e.spawnTimer = Math.floor(interval / this.e.fixedDt);
    }
  }

  private spawnZombie(): void {
    let type: ZombieType = ZombieType.Walker;
    const roll: number = Math.random();
    if (this.e.floor >= GAME_CONSTANTS.ZOMBIE_TANK_MIN_WAVE && roll > GAME_CONSTANTS.ZOMBIE_TANK_ROLL_THRESHOLD) type = ZombieType.Tank;
    else if (this.e.floor >= GAME_CONSTANTS.ZOMBIE_RUNNER_MIN_WAVE && roll > GAME_CONSTANTS.ZOMBIE_RUNNER_ROLL_THRESHOLD) type = ZombieType.Runner;
    else if (this.e.floor >= GAME_CONSTANTS.ZOMBIE_SPITTER_MIN_WAVE && roll > GAME_CONSTANTS.ZOMBIE_SPITTER_ROLL_THRESHOLD) type = ZombieType.Spitter;
    const hasBoss: boolean = this.e.zombies.some(
      (z: ZombieState) => !z.isDead && (z.type === ZombieType.DragonBoss || z.type === ZombieType.Boss),
    );
    if (!hasBoss) {
      if (this.e.floor >= GAME_CONSTANTS.ZOMBIE_DRAGON_BOSS_MIN_WAVE && this.e.floor % GAME_CONSTANTS.ZOMBIE_DRAGON_BOSS_WAVE_INTERVAL === 0 && Math.random() < 0.02) {
        type = ZombieType.DragonBoss;
      } else if (this.e.floor >= GAME_CONSTANTS.ZOMBIE_BOSS_MIN_WAVE && this.e.floor % GAME_CONSTANTS.ZOMBIE_BOSS_WAVE_INTERVAL === 0 && Math.random() < 0.04) {
        type = ZombieType.Boss;
      }
    }

    const zDef: ZombieDefinition = ZOMBIE_TYPES[type];
    const hpScale: number = 1 + (this.e.floor - 1) * GAME_CONSTANTS.ZOMBIE_HP_SCALE_PER_WAVE;
    const damageScale: number = 1 + (this.e.floor - 1) * GAME_CONSTANTS.ZOMBIE_DAMAGE_SCALE_PER_WAVE;

    const rolledHp: number = Math.floor((zDef.hpMin + Math.random() * (zDef.hpMax - zDef.hpMin)) * hpScale);
    const rolledSpeed: number = zDef.speedMin + Math.random() * (zDef.speedMax - zDef.speedMin);
    const rolledDamageMin: number = Math.floor((zDef.damageMinLow + Math.random() * (zDef.damageMinHigh - zDef.damageMinLow)) * damageScale);
    const rolledDamageMax: number = Math.floor((zDef.damageMaxLow + Math.random() * (zDef.damageMaxHigh - zDef.damageMaxLow)) * damageScale);
    const rolledKnockback: number = zDef.knockbackMin + Math.random() * (zDef.knockbackMax - zDef.knockbackMin);
    const rolledHesitation: number = Math.floor(zDef.hesitationMin + Math.random() * (zDef.hesitationMax - zDef.hesitationMin));
    const rolledXp: number = Math.floor(zDef.xpRewardMin + Math.random() * (zDef.xpRewardMax - zDef.xpRewardMin));
    const rolledWidth: number = Math.floor(zDef.widthMin + Math.random() * (zDef.widthMax - zDef.widthMin));
    const rolledHeight: number = Math.floor(zDef.heightMin + Math.random() * (zDef.heightMax - zDef.heightMin));

    const plat: Platform = this.e.platforms[Math.floor(Math.random() * this.e.platforms.length)];
    const platMinX: number = Math.max(0, plat.x);
    const platMaxX: number = Math.min(GAME_CONSTANTS.CANVAS_WIDTH - rolledWidth, plat.x + plat.width - rolledWidth);
    const x: number = platMinX + Math.floor(Math.random() * (platMaxX - platMinX + 1));
    const y: number = plat.y - rolledHeight;
    const nearestSpawnTarget: TargetInfo | null = this.findNearestTarget(x + rolledWidth / 2, y + rolledHeight / 2);
    const facing: number = nearestSpawnTarget ? (nearestSpawnTarget.x > x ? 1 : -1) : (Math.random() > 0.5 ? 1 : -1);

    const zombie: ZombieState = {
      id: crypto.randomUUID(),
      type,
      hp: rolledHp,
      maxHp: rolledHp,
      x,
      y,
      velocityX: 0,
      velocityY: 0,
      isGrounded: true,
      isDead: false,
      target: null,
      knockbackFrames: 0,
      jumpCooldown: GAME_CONSTANTS.ZOMBIE_JUMP_COOLDOWN_MAX,
      attackCooldown: GAME_CONSTANTS.ZOMBIE_ATTACK_COOLDOWN_MAX,
      attackAnimTimer: 0,
      attackHasHit: false,
      attackHesitation: rolledHesitation,
      hesitationRange: GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MIN +
        Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MAX - GAME_CONSTANTS.ZOMBIE_HESITATION_RANGE_MIN)),
      facing,
      instanceSpeed: rolledSpeed,
      instanceDamageMin: rolledDamageMin,
      instanceDamageMax: rolledDamageMax,
      instanceKnockbackForce: rolledKnockback,
      instanceXpReward: rolledXp,
      instanceWidth: rolledWidth,
      instanceHeight: rolledHeight,
      orbitOffset: (Math.random() > 0.5 ? 1 : -1) *
        (GAME_CONSTANTS.ZOMBIE_ORBIT_MIN + Math.random() * (GAME_CONSTANTS.ZOMBIE_ORBIT_MAX - GAME_CONSTANTS.ZOMBIE_ORBIT_MIN)),
      platformDropTimer: 0,
      spawnTimer: 0,
      reactionDelay: GAME_CONSTANTS.ZOMBIE_REACTION_DELAY_MIN_TICKS +
        Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_REACTION_DELAY_MAX_TICKS - GAME_CONSTANTS.ZOMBIE_REACTION_DELAY_MIN_TICKS)),
    };

    const spriteKey: string = this.e.zombieSpriteAnimator.getSpriteKey(type);
    zombie.spawnTimer = GAME_CONSTANTS.ZOMBIE_SPAWN_ANIM_TICKS;
    this.e.zombies.push(zombie);
    this.e.zombieSpriteAnimator.setStateReversed(zombie.id, ZombieAnimState.Dead, spriteKey, GAME_CONSTANTS.ZOMBIE_SPAWN_ANIM_TICKS);
    this.e.onZombiesUpdate?.(this.e.zombies);
  }

  checkFloorCompletion(): void {
    if (this.e.floorTransitionTimer > 0) return;

    const exit: Platform = this.e.exitPlatform;

    const candidates: CharacterState[] = [];
    if (this.e.player && !this.e.player.isDead) {
      candidates.push(this.e.player);
    }
    if (this.e.isMultiplayerHost) {
      for (const rp of this.e.remotePlayers) {
        if (!rp.isDead) {
          candidates.push(rp);
        }
      }
    }

    for (const c of candidates) {
      const bottom: number = c.y + GAME_CONSTANTS.PLAYER_HEIGHT;
      const right: number = c.x + GAME_CONSTANTS.PLAYER_WIDTH;

      const onExitPlatform: boolean =
        right > exit.x &&
        c.x < exit.x + exit.width &&
        bottom >= exit.y &&
        bottom <= exit.y + exit.height + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
        c.isGrounded;

      if (onExitPlatform) {
        this.e.onFloorComplete?.();
        this.advanceFloor();
        return;
      }
    }
  }

  private advanceFloor(): void {
    this.e.floor++;
    this.e.floorTransitionTimer = GAME_CONSTANTS.FLOOR_TRANSITION_TICKS;

    for (const z of this.e.zombies) {
      z.isDead = true;
    }
    this.e.zombies = [];

    for (const corpse of this.e.zombieCorpses) {
      this.e.zombieSpriteAnimator.removeInstance(corpse.id);
    }
    this.e.zombieCorpses = [];

    this.resetPlayerToGround(this.e.player);
    for (const rp of this.e.remotePlayers) {
      this.resetPlayerToGround(rp);
    }

    this.startFloor();
    this.e.onFloorUpdate?.(this.e.floor);
  }

  private resetPlayerToGround(p: CharacterState | null): void {
    if (!p) return;
    p.x = GAME_CONSTANTS.CANVAS_WIDTH / 2 - GAME_CONSTANTS.PLAYER_WIDTH / 2;
    p.y = GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT;
    p.velocityX = 0;
    p.velocityY = 0;
    p.isGrounded = true;
  }

  startFloor(): void {
    this.e.zombies = this.e.zombies.filter((z: ZombieState) => !z.isDead);
    this.e.spawnTimer = GAME_CONSTANTS.FLOOR_INITIAL_SPAWN_DELAY_TICKS;
    this.e.onFloorUpdate?.(this.e.floor);
  }

  updateZombieCorpses(): void {
    if (this.e.isMultiplayerClient) {
      this.tickClientCorpseVisuals();
      return;
    }

    for (const corpse of this.e.zombieCorpses) {
      if (!corpse.isGrounded) {
        corpse.x += corpse.velocityX;
        corpse.velocityX *= 0.92;
        if (Math.abs(corpse.velocityX) < 0.1) corpse.velocityX = 0;

        corpse.velocityY += GAME_CONSTANTS.GRAVITY;
        if (corpse.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
          corpse.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
        }
        corpse.y += corpse.velocityY;

        if (corpse.x < 0) { corpse.x = 0; corpse.velocityX = 0; }
        const maxCX: number = GAME_CONSTANTS.CANVAS_WIDTH - corpse.width;
        if (corpse.x > maxCX) { corpse.x = maxCX; corpse.velocityX = 0; }

        for (const plat of this.e.platforms) {
          const bottom: number = corpse.y + corpse.height;
          const prevBottom: number = bottom - corpse.velocityY;
          if (
            corpse.x + corpse.width > plat.x &&
            corpse.x < plat.x + plat.width &&
            bottom >= plat.y &&
            prevBottom <= plat.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
            corpse.velocityY >= 0
          ) {
            corpse.y = plat.y - corpse.height;
            corpse.velocityY = 0;
            corpse.velocityX = 0;
            corpse.isGrounded = true;
            this.e.zombieSpriteAnimator.setState(corpse.id, ZombieAnimState.Dead);
          }
        }

        if (!corpse.isGrounded) {
          const ratio: number = GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_WIDTH_RATIO;
          for (const other of this.e.zombieCorpses) {
            if (other === corpse || !other.isGrounded) continue;
            const effectiveX: number = other.x + other.width * (1 - ratio) / 2;
            const effectiveW: number = other.width * ratio;
            const surfaceY: number = other.y + other.height - GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_HEIGHT;
            const bottom: number = corpse.y + corpse.height;
            const prevBottom: number = bottom - corpse.velocityY;
            if (
              corpse.x + corpse.width > effectiveX &&
              corpse.x < effectiveX + effectiveW &&
              bottom >= surfaceY &&
              prevBottom <= surfaceY + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
              corpse.velocityY >= 0
            ) {
              corpse.y = surfaceY - corpse.height;
              corpse.velocityY = 0;
              corpse.isGrounded = true;
              const corpseCx: number = corpse.x + corpse.width / 2;
              const otherCx: number = other.x + other.width / 2;
              const slideDir: number = corpseCx > otherCx ? 1 : -1;
              corpse.x += slideDir * Math.random() * GAME_CONSTANTS.ZOMBIE_CORPSE_SLIDE_OFFSET;
              this.e.zombieSpriteAnimator.setState(corpse.id, ZombieAnimState.Dead);
              break;
            }
          }
        }
      }

      if (corpse.isGrounded && !corpse.landProcessed) {
        corpse.landProcessed = true;
        this.diversifyCorpsePose(corpse);
      }

      if (!corpse.frozen) {
        this.e.zombieSpriteAnimator.tick(corpse.id, corpse.spriteKey);
      }
    }
  }

  private tickClientCorpseVisuals(): void {
    for (const corpse of this.e.zombieCorpses) {
      if (!corpse.isGrounded && this.e.pendingLocalKills.has(corpse.id)) {
        corpse.velocityY += GAME_CONSTANTS.GRAVITY;
        if (corpse.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
          corpse.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
        }
        corpse.x += corpse.velocityX;
        corpse.y += corpse.velocityY;
        corpse.velocityX *= 0.92;

        for (const plat of this.e.platforms) {
          const bottom: number = corpse.y + corpse.height;
          const prevBottom: number = bottom - corpse.velocityY;
          if (
            corpse.x + corpse.width > plat.x &&
            corpse.x < plat.x + plat.width &&
            bottom >= plat.y &&
            prevBottom <= plat.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
            corpse.velocityY >= 0
          ) {
            corpse.y = plat.y - corpse.height;
            corpse.velocityY = 0;
            corpse.velocityX = 0;
            corpse.isGrounded = true;
            this.e.zombieSpriteAnimator.setState(corpse.id, ZombieAnimState.Dead);
          }
        }
      }

      if (!corpse.frozen) {
        this.e.zombieSpriteAnimator.tick(corpse.id, corpse.spriteKey);
      }
    }
  }

  private diversifyCorpsePose(corpse: ZombieCorpse): void {
    const nearPile: boolean = this.e.zombieCorpses.some(
      (other: ZombieCorpse) =>
        other !== corpse &&
        other.isGrounded &&
        Math.abs((other.x + other.width / 2) - (corpse.x + corpse.width / 2)) < corpse.width * 2,
    );
    if (!nearPile) return;
    if (Math.random() >= GAME_CONSTANTS.ZOMBIE_CORPSE_DIVERSE_CHANCE) return;

    const frameCount: number = this.e.zombieSpriteAnimator.getFrameCount(corpse.spriteKey, ZombieAnimState.Dead);
    const firstDiverseFrame: number = Math.max(0, frameCount - 3);
    const frame: number = firstDiverseFrame + Math.floor(Math.random() * (frameCount - firstDiverseFrame));
    this.e.zombieSpriteAnimator.setStateAtFrame(corpse.id, ZombieAnimState.Dead, frame);
    if (Math.random() > 0.5) corpse.facing = -corpse.facing;
    corpse.frozen = true;
  }
}
