import {
  CharacterState,
  GAME_CONSTANTS,
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
        this.e.level * GAME_CONSTANTS.DROP_GOLD_WAVE_BONUS;
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

    for (const drop of this.e.worldDrops) {
      if (!drop.isGrounded) {
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
      p.inventory.hpPotions++;
      this.e.onPotionPickup?.(DropType.HpPotion);
      this.vfx.spawnHitParticles(cx, cy, '#ff4488');
      this.vfx.addDropNotification(DropType.HpPotion, '+1 HP Potion', '#ff4488', '❤️');
    } else if (drop.type === DropType.MpPotion) {
      p.inventory.mpPotions++;
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
      const used: boolean = this.e.onUseHpPotion?.() ?? false;
      if (used) {
        p.hp = Math.min(p.hp + GAME_CONSTANTS.HP_POTION_RESTORE, p.derived.maxHp);
        p.inventory.hpPotions = Math.max(0, p.inventory.hpPotions - 1);
        this.e.potionCooldown = GAME_CONSTANTS.POTION_USE_COOLDOWN_TICKS;
        this.vfx.spawnHitParticles(
          p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
          p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
          '#ff4488',
        );
        this.vfx.spawnDamageNumber(p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y - 10, GAME_CONSTANTS.HP_POTION_RESTORE, false, '#44ff44');
        this.e.onPlayerUpdate?.(p);
      }
    }

    if (this.e.keys.useMpPotion) {
      const used: boolean = this.e.onUseMpPotion?.() ?? false;
      if (used) {
        p.mp = Math.min(p.mp + GAME_CONSTANTS.MP_POTION_RESTORE, p.derived.maxMp);
        p.inventory.mpPotions = Math.max(0, p.inventory.mpPotions - 1);
        this.e.potionCooldown = GAME_CONSTANTS.POTION_USE_COOLDOWN_TICKS;
        this.vfx.spawnHitParticles(
          p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
          p.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
          '#4488ff',
        );
        this.vfx.spawnDamageNumber(p.x + GAME_CONSTANTS.PLAYER_WIDTH / 2, p.y - 10, GAME_CONSTANTS.MP_POTION_RESTORE, false, '#4488ff');
        this.e.onPlayerUpdate?.(p);
      }
    }

    if (this.e.keys.openShop) {
      this.e.onOpenShop?.();
      this.e.keys.openShop = false;
    }
  }
}
