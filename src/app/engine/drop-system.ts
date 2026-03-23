import {
  CharacterState,
  GAME_CONSTANTS,
  getSpecialDropDefinition,
  getPotionRestoreAmount,
  resolveAutoPotionId,
  SPECIAL_DROP_DEFINITIONS,
} from '@shared/index';
import {
  ActiveSpecialEffect,
  DropType,
  PendingSpecialDropConfirm,
  SpecialDropDefinition,
  SpecialDropType,
  WorldDrop,
} from '@shared/game-entities';
import { IGameEngine } from './engine-types';
import { PhysicsSystem } from './physics-system';
import { VfxSystem } from './vfx-system';

export class DropSystem {
  constructor(
    private readonly e: IGameEngine,
    private readonly physics: PhysicsSystem,
    private readonly vfx: VfxSystem,
  ) {}

  rollDrops(cx: number, cy: number, isBoss: boolean = false, isDragonBoss: boolean = false): void {
    const dropX: number = cx - GAME_CONSTANTS.DROP_SIZE / 2;
    const dropY: number = cy - GAME_CONSTANTS.DROP_SIZE / 2;

    if (Math.random() < GAME_CONSTANTS.DROP_HP_POTION_CHANCE) {
      this.spawnDrop(DropType.HpPotion, dropX, dropY, GAME_CONSTANTS.HP_POTION_RESTORE);
    }
    if (Math.random() < GAME_CONSTANTS.DROP_MP_POTION_CHANCE) {
      this.spawnDrop(DropType.MpPotion, dropX + 10, dropY, GAME_CONSTANTS.MP_POTION_RESTORE);
    }
    if (Math.random() < GAME_CONSTANTS.DROP_GOLD_CHANCE) {
      const goldAmount: number = GAME_CONSTANTS.DROP_GOLD_MIN +
        Math.floor(Math.random() * (GAME_CONSTANTS.DROP_GOLD_MAX - GAME_CONSTANTS.DROP_GOLD_MIN)) +
        this.e.floor * GAME_CONSTANTS.DROP_GOLD_WAVE_BONUS;
      this.spawnDrop(DropType.Gold, dropX - 10, dropY, goldAmount);
    }

    this.rollSpecialDrop(cx, cy, isBoss, isDragonBoss);
  }

  private rollSpecialDrop(cx: number, cy: number, isBoss: boolean, isDragonBoss: boolean): void {
    let chance: number = GAME_CONSTANTS.SPECIAL_DROP_CHANCE_NORMAL;
    if (isDragonBoss) {
      chance = GAME_CONSTANTS.SPECIAL_DROP_CHANCE_DRAGON_BOSS;
    } else if (isBoss) {
      chance = GAME_CONSTANTS.SPECIAL_DROP_CHANCE_BOSS;
    }

    if (Math.random() >= chance) return;

    const pool: SpecialDropDefinition[] = SPECIAL_DROP_DEFINITIONS.filter(
      (d: SpecialDropDefinition): boolean => !this.hasSpecialEffect(d.type),
    );
    if (pool.length === 0) return;

    const picked: SpecialDropDefinition = pool[Math.floor(Math.random() * pool.length)];
    const dropX: number = cx - GAME_CONSTANTS.SPECIAL_DROP_SIZE / 2;
    const dropY: number = cy - GAME_CONSTANTS.SPECIAL_DROP_SIZE / 2;

    this.e.worldDrops.push({
      id: crypto.randomUUID(),
      type: DropType.Special,
      specialType: picked.type,
      x: dropX,
      y: dropY,
      velocityY: GAME_CONSTANTS.SPECIAL_DROP_POP_FORCE,
      value: 0,
      lifetime: GAME_CONSTANTS.SPECIAL_DROP_LIFETIME,
      isGrounded: false,
    });
  }

  private spawnDrop(type: DropType, x: number, y: number, value: number): void {
    this.e.worldDrops.push({
      id: crypto.randomUUID(),
      type,
      x,
      y,
      velocityY: GAME_CONSTANTS.DROP_POP_FORCE,
      value,
      lifetime: GAME_CONSTANTS.DROP_LIFETIME,
      isGrounded: false,
    });
  }

  hasSpecialEffect(type: SpecialDropType): boolean {
    return this.e.activeSpecialEffects.some(
      (eff: ActiveSpecialEffect): boolean => eff.type === type,
    );
  }

  getEffectiveGravity(): number {
    if (this.hasSpecialEffect(SpecialDropType.LowGravity)) {
      return GAME_CONSTANTS.SPECIAL_LOW_GRAVITY_VALUE;
    }
    return GAME_CONSTANTS.GRAVITY;
  }

  getEffectiveMoveSpeed(): number {
    if (this.hasSpecialEffect(SpecialDropType.SuperSpeed)) {
      return GAME_CONSTANTS.PLAYER_MOVE_SPEED * GAME_CONSTANTS.SPECIAL_SUPER_SPEED_MULTIPLIER;
    }
    return GAME_CONSTANTS.PLAYER_MOVE_SPEED;
  }

  getEffectiveDamageMultiplier(): number {
    if (this.hasSpecialEffect(SpecialDropType.GiantSlayer)) {
      return GAME_CONSTANTS.SPECIAL_GIANT_SLAYER_DAMAGE_MULTIPLIER;
    }
    return 1;
  }

  isZombieShockActive(): boolean {
    return this.hasSpecialEffect(SpecialDropType.ZombieShock);
  }

  updateDrops(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    const playerCx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const playerCy: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;
    const magnetRadius: number = GAME_CONSTANTS.DROP_MAGNET_RADIUS;

    for (const drop of this.e.worldDrops) {
      const size: number = drop.type === DropType.Special
        ? GAME_CONSTANTS.SPECIAL_DROP_SIZE
        : GAME_CONSTANTS.DROP_SIZE;
      const dropCx: number = drop.x + size / 2;
      const dropCy: number = drop.y + size / 2;
      const dx: number = playerCx - dropCx;
      const dy: number = playerCy - dropCy;
      const dist: number = Math.sqrt(dx * dx + dy * dy);

      if (dist < magnetRadius && dist > 0) {
        const speed: number = GAME_CONSTANTS.DROP_MAGNET_SPEED;
        drop.x += (dx / dist) * speed;
        drop.y += (dy / dist) * speed;
        drop.isGrounded = false;
        drop.velocityY = 0;
      } else if (!drop.isGrounded) {
        drop.velocityY += this.getEffectiveGravity();
        if (drop.velocityY > GAME_CONSTANTS.TERMINAL_VELOCITY) {
          drop.velocityY = GAME_CONSTANTS.TERMINAL_VELOCITY;
        }
        drop.y += drop.velocityY;

        for (const plat of this.e.platforms) {
          const dropBottom: number = drop.y + size;
          const prevBottom: number = dropBottom - drop.velocityY;
          if (
            drop.x + size > plat.x &&
            drop.x < plat.x + plat.width &&
            dropBottom >= plat.y &&
            prevBottom <= plat.y + GAME_CONSTANTS.PLATFORM_SNAP_TOLERANCE &&
            drop.velocityY >= 0
          ) {
            drop.y = plat.y - size;
            drop.velocityY = 0;
            drop.isGrounded = true;
          }
        }

        if (!drop.isGrounded) {
          const widthRatio: number = GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_WIDTH_RATIO;
          for (const corpse of this.e.zombieCorpses) {
            if (!corpse.isGrounded) continue;
            const effectiveX: number = corpse.x + corpse.width * (1 - widthRatio) / 2;
            const effectiveW: number = corpse.width * widthRatio;
            const surfaceY: number = corpse.y + corpse.height - GAME_CONSTANTS.ZOMBIE_CORPSE_PLATFORM_HEIGHT;
            const dropBottom: number = drop.y + size;
            const prevBottom: number = dropBottom - drop.velocityY;
            if (
              drop.x + size > effectiveX &&
              drop.x < effectiveX + effectiveW &&
              dropBottom >= surfaceY &&
              prevBottom <= surfaceY + GAME_CONSTANTS.ZOMBIE_CORPSE_SNAP_TOLERANCE &&
              drop.velocityY >= 0
            ) {
              drop.y = surfaceY - size;
              drop.velocityY = 0;
              drop.isGrounded = true;
              break;
            }
          }
        }
      }

      drop.lifetime--;

      if (this.physics.rectsOverlap(
        p.x, p.y, GAME_CONSTANTS.PLAYER_WIDTH, GAME_CONSTANTS.PLAYER_HEIGHT,
        drop.x, drop.y, size, size,
      )) {
        this.collectDrop(drop);
      }
    }

    this.e.worldDrops = this.e.worldDrops.filter((d: WorldDrop) => d.lifetime > 0);
  }

  private collectDrop(drop: WorldDrop): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    const dropSize: number = drop.type === DropType.Special
      ? GAME_CONSTANTS.SPECIAL_DROP_SIZE
      : GAME_CONSTANTS.DROP_SIZE;
    const cx: number = drop.x + dropSize / 2;
    const cy: number = drop.y + dropSize / 2;

    if (drop.type === DropType.Special && drop.specialType) {
      if (this.e.pendingSpecialDropConfirm) return;
      this.setPendingSpecialDrop(drop.specialType, cx, cy);
    } else if (drop.type === DropType.Gold) {
      p.inventory.gold += drop.value;
      this.e.onGoldPickup?.(drop.value);
      this.vfx.spawnHitParticles(cx, cy, '#ffcc44');
      this.vfx.addDropNotification(DropType.Gold, `+${drop.value}G`, '#ffcc44', '💰');
    } else if (drop.type === DropType.HpPotion) {
      const potionId: string = 'hp-potion-1';
      p.inventory.potions[potionId] = (p.inventory.potions[potionId] ?? 0) + 1;
      this.e.onPotionPickup?.(DropType.HpPotion);
      this.vfx.spawnHitParticles(cx, cy, '#ff4488');
      this.vfx.addDropNotification(DropType.HpPotion, '+1 HP Potion', '#ff4488', '❤️');
    } else if (drop.type === DropType.MpPotion) {
      const potionId: string = 'mp-potion-1';
      p.inventory.potions[potionId] = (p.inventory.potions[potionId] ?? 0) + 1;
      this.e.onPotionPickup?.(DropType.MpPotion);
      this.vfx.spawnHitParticles(cx, cy, '#4488ff');
      this.vfx.addDropNotification(DropType.MpPotion, '+1 MP Potion', '#4488ff', '💧');
    }

    this.e.onPlayerUpdate?.(p);
    drop.lifetime = 0;
  }

  private collectSpecialDrop(type: SpecialDropType, cx: number, cy: number): void {
    const def: SpecialDropDefinition | undefined = getSpecialDropDefinition(type);
    if (!def) return;

    const existing: ActiveSpecialEffect | undefined = this.e.activeSpecialEffects.find(
      (eff: ActiveSpecialEffect): boolean => eff.type === type,
    );
    if (existing) {
      existing.remainingTicks = def.durationTicks;
      existing.totalTicks = def.durationTicks;
    } else {
      this.e.activeSpecialEffects.push({
        type,
        remainingTicks: def.durationTicks,
        totalTicks: def.durationTicks,
      });
    }

    if (this.e.isMultiplayerClient) {
      this.e.pendingSpecialDropActivations.push(type);
    }

    this.vfx.spawnBuffActivationParticles(cx, cy, def.color);
    this.vfx.addDropNotification(DropType.Special, def.name, def.color, def.icon);
    this.e.onSpecialDropPickup?.(type);

    this.vfx.triggerScreenFlash(def.color, 8);
    this.vfx.triggerScreenShake(6, 4);
  }

  private setPendingSpecialDrop(type: SpecialDropType, cx: number, cy: number): void {
    const totalTicks: number = GAME_CONSTANTS.SPECIAL_DROP_CONFIRM_TICKS;
    const pending: PendingSpecialDropConfirm = {
      type,
      cx,
      cy,
      remainingTicks: totalTicks,
      totalTicks,
    };
    this.e.pendingSpecialDropConfirm = pending;
  }

  confirmPendingDrop(): void {
    const pending: PendingSpecialDropConfirm | null = this.e.pendingSpecialDropConfirm;
    if (!pending) return;
    this.collectSpecialDrop(pending.type, pending.cx, pending.cy);
    this.e.pendingSpecialDropConfirm = null;
  }

  declinePendingDrop(): void {
    this.e.pendingSpecialDropConfirm = null;
  }

  updatePendingSpecialDrop(): void {
    const pending: PendingSpecialDropConfirm | null = this.e.pendingSpecialDropConfirm;
    if (!pending) return;
    pending.remainingTicks--;
    if (pending.remainingTicks <= 0) {
      this.e.pendingSpecialDropConfirm = null;
    }
  }

  updateSpecialEffects(): void {
    for (const eff of this.e.activeSpecialEffects) {
      eff.remainingTicks--;
    }
    this.e.activeSpecialEffects = this.e.activeSpecialEffects.filter(
      (eff: ActiveSpecialEffect): boolean => eff.remainingTicks > 0,
    );
  }

  updatePotionUse(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    if (this.e.potionCooldown > 0) {
      this.e.potionCooldown--;
      return;
    }

    if (this.e.keys.useHpPotion) {
      const hpPotionId: string | null = resolveAutoPotionId(p.inventory.autoPotionHpId, p.inventory.potions, 'hp');
      if (hpPotionId) {
        const used: boolean = this.e.onUseHpPotion?.() ?? false;
        if (used) {
          const restoreAmount: number = getPotionRestoreAmount(hpPotionId, p.derived.maxHp, p.derived.maxMp);
          p.hp = Math.min(p.hp + restoreAmount, p.derived.maxHp);
          p.inventory.potions[hpPotionId] = Math.max(0, (p.inventory.potions[hpPotionId] ?? 0) - 1);
          this.e.potionCooldown = GAME_CONSTANTS.POTION_USE_COOLDOWN_TICKS;
          this.vfx.spawnHitParticles(
            p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
            p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
            '#ff4488',
          );
          this.vfx.spawnDamageNumber(p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y - 10, restoreAmount, false, '#44ff44');
          this.e.onPlayerUpdate?.(p);
        }
      }
    }

    if (this.e.keys.useMpPotion) {
      const mpPotionId: string | null = resolveAutoPotionId(p.inventory.autoPotionMpId, p.inventory.potions, 'mp');
      if (mpPotionId) {
        const used: boolean = this.e.onUseMpPotion?.() ?? false;
        if (used) {
          const restoreAmount: number = getPotionRestoreAmount(mpPotionId, p.derived.maxHp, p.derived.maxMp);
          p.mp = Math.min(p.mp + restoreAmount, p.derived.maxMp);
          p.inventory.potions[mpPotionId] = Math.max(0, (p.inventory.potions[mpPotionId] ?? 0) - 1);
          this.e.potionCooldown = GAME_CONSTANTS.POTION_USE_COOLDOWN_TICKS;
          this.vfx.spawnHitParticles(
            p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
            p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
            '#4488ff',
          );
          this.vfx.spawnDamageNumber(p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y - 10, restoreAmount, false, '#4488ff');
          this.e.onPlayerUpdate?.(p);
        }
      }
    }

    if (this.e.keys.openShop) {
      this.e.onOpenShop?.();
      this.e.keys.openShop = false;
    }
  }
}
