import {
  CharacterState,
  GAME_CONSTANTS,
  getPotionRestoreAmount,
  resolveAutoPotionId,
} from '@shared/index';
import {
  DropType,
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

  rollDrops(cx: number, cy: number): void {
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

  updateDrops(): void {
    const p: CharacterState | null = this.e.player;
    if (!p) return;
    const size: number = GAME_CONSTANTS.DROP_SIZE;
    const playerCx: number = p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2;
    const playerCy: number = p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2;

    for (const drop of this.e.worldDrops) {
      const dropCx: number = drop.x + size / 2;
      const dropCy: number = drop.y + size / 2;
      const dx: number = playerCx - dropCx;
      const dy: number = playerCy - dropCy;
      const dist: number = Math.sqrt(dx * dx + dy * dy);

      if (dist < GAME_CONSTANTS.DROP_MAGNET_RADIUS && dist > 0) {
        const speed: number = GAME_CONSTANTS.DROP_MAGNET_SPEED;
        drop.x += (dx / dist) * speed;
        drop.y += (dy / dist) * speed;
        drop.isGrounded = false;
        drop.velocityY = 0;
      } else if (!drop.isGrounded) {
        drop.velocityY += GAME_CONSTANTS.GRAVITY;
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
    const cx: number = drop.x + GAME_CONSTANTS.DROP_SIZE / 2;
    const cy: number = drop.y + GAME_CONSTANTS.DROP_SIZE / 2;

    if (drop.type === DropType.Gold) {
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
