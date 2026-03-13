import { Injectable, Signal, WritableSignal, signal, computed } from '@angular/core';
import {
  CharacterClass,
  CharacterClassDefinition,
  CharacterState,
  CharacterStats,
  CharacterDerived,
  CHARACTER_CLASSES,
  CLASS_MULTIPLIERS,
  ClassMultiplier,
  Direction,
  GAME_CONSTANTS,
} from '@shared/index';
import { ZombieState } from '@shared/game-entities';

@Injectable({ providedIn: 'root' })
export class GameStateService {
  readonly player: WritableSignal<CharacterState | null> = signal<CharacterState | null>(null);
  readonly zombies: WritableSignal<ZombieState[]> = signal<ZombieState[]>([]);
  readonly wave: WritableSignal<number> = signal<number>(1);
  readonly zombiesRemaining: WritableSignal<number> = signal<number>(0);
  readonly score: WritableSignal<number> = signal<number>(0);
  readonly gameOver: WritableSignal<boolean> = signal<boolean>(false);
  readonly isPaused: WritableSignal<boolean> = signal<boolean>(false);

  readonly isAlive: Signal<boolean> = computed((): boolean => {
    const p: CharacterState | null = this.player();
    return p !== null && !p.isDead;
  });

  readonly hpPercent: Signal<number> = computed((): number => {
    const p: CharacterState | null = this.player();
    if (!p) return 0;
    return (p.hp / p.derived.maxHp) * 100;
  });

  readonly mpPercent: Signal<number> = computed((): number => {
    const p: CharacterState | null = this.player();
    if (!p) return 0;
    return (p.mp / p.derived.maxMp) * 100;
  });

  readonly xpPercent: Signal<number> = computed((): number => {
    const p: CharacterState | null = this.player();
    if (!p) return 0;
    return (p.xp / p.xpToNext) * 100;
  });

  createPlayer(name: string, classId: CharacterClass): void {
    const classDef: CharacterClassDefinition = CHARACTER_CLASSES[classId];
    const stats: CharacterStats = { ...classDef.baseStats };
    const derived: CharacterDerived = this.calculateDerived(stats, classId);

    const character: CharacterState = {
      id: crypto.randomUUID(),
      name,
      classId,
      level: 1,
      xp: 0,
      xpToNext: GAME_CONSTANTS.XP_BASE,
      stats,
      derived,
      hp: derived.maxHp,
      mp: derived.maxMp,
      x: GAME_CONSTANTS.CANVAS_WIDTH / 2,
      y: GAME_CONSTANTS.GROUND_Y - GAME_CONSTANTS.PLAYER_HEIGHT,
      velocityX: 0,
      velocityY: 0,
      facing: Direction.Right,
      isGrounded: true,
      isAttacking: false,
      isClimbing: false,
      isDead: false,
    };

    this.player.set(character);
    this.wave.set(1);
    this.score.set(0);
    this.gameOver.set(false);
    this.zombies.set([]);
    this.zombiesRemaining.set(0);
  }

  calculateDerived(stats: CharacterStats, classId: CharacterClass): CharacterDerived {
    const mult: ClassMultiplier = CLASS_MULTIPLIERS[classId];

    return {
      maxHp: GAME_CONSTANTS.PLAYER_BASE_HP + stats.str * mult.hpMult,
      maxMp: GAME_CONSTANTS.PLAYER_BASE_MP + stats.int * mult.mpMult,
      attack: stats.str * GAME_CONSTANTS.PLAYER_ATTACK_STR_MULT + stats.dex * GAME_CONSTANTS.PLAYER_ATTACK_DEX_MULT,
      defense: stats.str * GAME_CONSTANTS.PLAYER_DEFENSE_STR_MULT + Math.floor(stats.dex / GAME_CONSTANTS.PLAYER_DEFENSE_DEX_DIVISOR),
      speed: GAME_CONSTANTS.PLAYER_MOVE_SPEED + stats.dex * GAME_CONSTANTS.PLAYER_SPEED_PER_DEX,
      critRate: Math.min(stats.luk * GAME_CONSTANTS.PLAYER_CRIT_PER_LUK, GAME_CONSTANTS.PLAYER_CRIT_RATE_CAP),
      critDamage: GAME_CONSTANTS.PLAYER_CRIT_DAMAGE_BASE + stats.luk * GAME_CONSTANTS.PLAYER_CRIT_DAMAGE_PER_LUK,
    };
  }

  addXp(amount: number): void {
    this.player.update((p: CharacterState | null) => {
      if (!p) return p;
      let xp: number = p.xp + amount;
      let level: number = p.level;
      let xpToNext: number = p.xpToNext;
      let stats: CharacterStats = { ...p.stats };

      while (xp >= xpToNext) {
        xp -= xpToNext;
        level++;
        const growth: CharacterStats = CHARACTER_CLASSES[p.classId].growthPerLevel;
        stats = {
          str: stats.str + growth.str,
          dex: stats.dex + growth.dex,
          int: stats.int + growth.int,
          luk: stats.luk + growth.luk,
        };
        xpToNext = Math.floor(GAME_CONSTANTS.XP_BASE * Math.pow(GAME_CONSTANTS.XP_GROWTH, level - 1));
      }

      const derived: CharacterDerived = this.calculateDerived(stats, p.classId);

      return {
        ...p,
        xp,
        level,
        xpToNext,
        stats,
        derived,
        hp: level > p.level ? derived.maxHp : p.hp,
        mp: level > p.level ? derived.maxMp : p.mp,
      };
    });
  }

  reset(): void {
    this.player.set(null);
    this.zombies.set([]);
    this.wave.set(1);
    this.zombiesRemaining.set(0);
    this.score.set(0);
    this.gameOver.set(false);
    this.isPaused.set(false);
  }
}
