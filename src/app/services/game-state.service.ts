import { Injectable, Signal, WritableSignal, signal, computed, isDevMode } from '@angular/core';
import {
  ActiveBuff,
  CharacterClass,
  CharacterClassDefinition,
  CharacterState,
  CharacterStats,
  CharacterDerived,
  CHARACTER_CLASSES,
  CLASS_STAT_WEIGHTS,
  ClassStatWeights,
  Direction,
  GAME_CONSTANTS,
  SHOP_ITEMS,
  SKILLS,
  SkillDefinition,
  SkillType,
} from '@shared/index';
import { DropType, PlayerInventory, ShopItemDefinition, ZombieState } from '@shared/game-entities';

@Injectable({ providedIn: 'root' })
export class GameStateService {
  readonly player: WritableSignal<CharacterState | null> = signal<CharacterState | null>(null);
  readonly zombies: WritableSignal<ZombieState[]> = signal<ZombieState[]>([]);
  readonly level: WritableSignal<number> = signal<number>(1);
  readonly score: WritableSignal<number> = signal<number>(0);
  readonly gameOver: WritableSignal<boolean> = signal<boolean>(false);
  readonly isPaused: WritableSignal<boolean> = signal<boolean>(false);
  readonly godMode: WritableSignal<boolean> = signal<boolean>(false);
  readonly showCollisionBoxes: WritableSignal<boolean> = signal<boolean>(false);

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
    const allocatedStats: CharacterStats = { str: 0, dex: 0, int: 0, luk: 0 };
    const derived: CharacterDerived = this.calculateDerived(classDef.baseStats, allocatedStats, classId);
    const totalStats: CharacterStats = this.getTotalStats(classDef.baseStats, allocatedStats);

    const character: CharacterState = {
      id: crypto.randomUUID(),
      name,
      classId,
      level: 1,
      xp: 0,
      xpToNext: GAME_CONSTANTS.XP_BASE,
      stats: totalStats,
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
      unallocatedStatPoints: 0,
      unallocatedSkillPoints: 0,
      allocatedStats,
      skillLevels: {},
      activeBuffs: [],
      inventory: { hpPotions: 3, mpPotions: 3, gold: isDevMode() ? 1_000_000 : 0 },
    };

    this.player.set(character);
    this.level.set(1);
    this.score.set(0);
    this.gameOver.set(false);
    this.zombies.set([]);
  }

  calculateDerived(baseStats: CharacterStats, allocatedStats: CharacterStats, classId: CharacterClass, level: number = 1): CharacterDerived {
    const w: ClassStatWeights = CLASS_STAT_WEIGHTS[classId];
    const totalStats: CharacterStats = this.getTotalStats(baseStats, allocatedStats);

    const primaryValue: number = totalStats[w.primaryStat];
    const secondaryValue: number = totalStats[w.secondaryStat];

    return {
      maxHp: GAME_CONSTANTS.PLAYER_BASE_HP + totalStats.str * w.hpPerStr + (level - 1) * GAME_CONSTANTS.PLAYER_HP_PER_LEVEL,
      maxMp: GAME_CONSTANTS.PLAYER_BASE_MP + totalStats.int * w.mpPerInt + (level - 1) * GAME_CONSTANTS.PLAYER_MP_PER_LEVEL,
      attack: Math.floor(primaryValue * w.attackFromPrimary + secondaryValue * w.attackFromSecondary),
      defense: Math.floor(totalStats.str * w.defenseFromStr + totalStats.dex * w.defenseFromDex),
      speed: GAME_CONSTANTS.PLAYER_MOVE_SPEED + totalStats.dex * GAME_CONSTANTS.PLAYER_SPEED_PER_DEX,
      critRate: Math.min(totalStats.luk * w.critFromLuk, GAME_CONSTANTS.PLAYER_CRIT_RATE_CAP),
      critDamage: GAME_CONSTANTS.PLAYER_CRIT_DAMAGE_BASE + totalStats.luk * w.critDmgFromLuk,
    };
  }

  getTotalStats(baseStats: CharacterStats, allocatedStats: CharacterStats): CharacterStats {
    return {
      str: baseStats.str + allocatedStats.str,
      dex: baseStats.dex + allocatedStats.dex,
      int: baseStats.int + allocatedStats.int,
      luk: baseStats.luk + allocatedStats.luk,
    };
  }

  calculateDerivedWithBuffs(
    baseStats: CharacterStats,
    allocatedStats: CharacterStats,
    classId: CharacterClass,
    activeBuffs: ActiveBuff[],
    level: number = 1,
  ): CharacterDerived {
    const derived: CharacterDerived = this.calculateDerived(baseStats, allocatedStats, classId, level);

    for (const buff of activeBuffs) {
      if (buff.remainingMs <= 0) continue;

      const target: string = buff.stat;
      if (target === 'allDamagePercent') {
        derived.attack = Math.floor(derived.attack * (1 + buff.value / 100));
      } else if (target === 'maxHpMaxMpPercent') {
        derived.maxHp = Math.floor(derived.maxHp * (1 + buff.value / 100));
        derived.maxMp = Math.floor(derived.maxMp * (1 + buff.value / 100));
      } else if (target in derived) {
        (derived as unknown as Record<string, number>)[target] += buff.value;
      }
    }

    derived.critRate = Math.min(derived.critRate, GAME_CONSTANTS.PLAYER_CRIT_RATE_CAP);

    return derived;
  }

  addXp(amount: number): void {
    this.player.update((p: CharacterState | null) => {
      if (!p) return p;
      let xp: number = p.xp + amount;
      let level: number = p.level;
      let xpToNext: number = p.xpToNext;
      let pendingStatPts: number = p.unallocatedStatPoints;
      let pendingSkillPts: number = p.unallocatedSkillPoints;

      while (xp >= xpToNext) {
        xp -= xpToNext;
        level++;
        pendingStatPts += GAME_CONSTANTS.STAT_POINTS_PER_LEVEL;
        pendingSkillPts += GAME_CONSTANTS.SKILL_POINTS_PER_LEVEL;
        xpToNext = Math.floor(GAME_CONSTANTS.XP_BASE * Math.pow(GAME_CONSTANTS.XP_GROWTH, level - 1));
      }

      const baseSt: CharacterStats = CHARACTER_CLASSES[p.classId].baseStats;
      const derived: CharacterDerived = this.calculateDerivedWithBuffs(baseSt, p.allocatedStats, p.classId, p.activeBuffs, level);

      return {
        ...p,
        xp,
        level,
        xpToNext,
        derived,
        unallocatedStatPoints: pendingStatPts,
        unallocatedSkillPoints: pendingSkillPts,
        hp: level > p.level ? derived.maxHp : p.hp,
        mp: level > p.level ? derived.maxMp : p.mp,
      };
    });
  }

  allocateStatPoint(stat: keyof CharacterStats): void {
    this.player.update((p: CharacterState | null) => {
      if (!p || p.unallocatedStatPoints <= 0) return p;

      const newAllocated: CharacterStats = {
        ...p.allocatedStats,
        [stat]: p.allocatedStats[stat] + 1,
      };

      const baseSt: CharacterStats = CHARACTER_CLASSES[p.classId].baseStats;
      const derived: CharacterDerived = this.calculateDerivedWithBuffs(baseSt, newAllocated, p.classId, p.activeBuffs, p.level);
      const totalStats: CharacterStats = this.getTotalStats(baseSt, newAllocated);

      return {
        ...p,
        allocatedStats: newAllocated,
        unallocatedStatPoints: p.unallocatedStatPoints - 1,
        stats: totalStats,
        derived,
      };
    });
  }

  readonly availableSkills: Signal<SkillDefinition[]> = computed((): SkillDefinition[] => {
    const p: CharacterState | null = this.player();
    if (!p) return [];
    return SKILLS.filter((s: SkillDefinition) => s.classId === p.classId);
  });

  allocateSkillPoint(skillId: string): void {
    this.player.update((p: CharacterState | null) => {
      if (!p || p.unallocatedSkillPoints <= 0) return p;

      const skillDef: SkillDefinition | undefined = SKILLS.find(
        (s: SkillDefinition) => s.id === skillId && s.classId === p.classId,
      );
      if (!skillDef) return p;

      const currentLevel: number = p.skillLevels[skillId] ?? 0;
      if (currentLevel >= skillDef.maxLevel) return p;
      if (p.level < skillDef.requiredCharacterLevel) return p;

      if (skillDef.prerequisite) {
        const prereqLevel: number = p.skillLevels[skillDef.prerequisite.skillId] ?? 0;
        if (prereqLevel < skillDef.prerequisite.level) return p;
      }

      const newSkillLevels: Record<string, number> = {
        ...p.skillLevels,
        [skillId]: currentLevel + 1,
      };

      const derived: CharacterDerived = this.calculateDerivedWithBuffs(
        CHARACTER_CLASSES[p.classId].baseStats,
        p.allocatedStats,
        p.classId,
        p.activeBuffs,
        p.level,
      );

      return {
        ...p,
        skillLevels: newSkillLevels,
        unallocatedSkillPoints: p.unallocatedSkillPoints - 1,
        derived,
      };
    });
  }

  maxAllSkills(): void {
    this.player.update((p: CharacterState | null): CharacterState | null => {
      if (!p) return p;
      const classSkills: SkillDefinition[] = SKILLS.filter(
        (s: SkillDefinition) => s.classId === p.classId,
      );
      const newSkillLevels: Record<string, number> = { ...p.skillLevels };
      for (const skill of classSkills) {
        newSkillLevels[skill.id] = skill.maxLevel;
      }
      const derived: CharacterDerived = this.calculateDerivedWithBuffs(
        CHARACTER_CLASSES[p.classId].baseStats,
        p.allocatedStats,
        p.classId,
        p.activeBuffs,
        p.level,
      );
      return { ...p, skillLevels: newSkillLevels, derived };
    });
  }

  maxOutPlayer(): void {
    this.player.update((p: CharacterState | null): CharacterState | null => {
      if (!p) return p;

      const targetLevel: number = 50;
      const totalStatPoints: number = (targetLevel - 1) * GAME_CONSTANTS.STAT_POINTS_PER_LEVEL;
      const perStat: number = Math.floor(totalStatPoints / 4);
      const remainder: number = totalStatPoints - perStat * 4;
      const w: ClassStatWeights = CLASS_STAT_WEIGHTS[p.classId];

      const allocatedStats: CharacterStats = {
        str: perStat + (w.primaryStat === 'str' ? remainder : 0),
        dex: perStat + (w.primaryStat === 'dex' ? remainder : 0),
        int: perStat + (w.primaryStat === 'int' ? remainder : 0),
        luk: perStat + (w.primaryStat === 'luk' ? remainder : 0),
      };

      const baseSt: CharacterStats = CHARACTER_CLASSES[p.classId].baseStats;
      const totalStats: CharacterStats = this.getTotalStats(baseSt, allocatedStats);
      const derived: CharacterDerived = this.calculateDerivedWithBuffs(baseSt, allocatedStats, p.classId, p.activeBuffs, targetLevel);

      const classSkills: SkillDefinition[] = SKILLS.filter(
        (s: SkillDefinition) => s.classId === p.classId,
      );
      const newSkillLevels: Record<string, number> = {};
      for (const skill of classSkills) {
        newSkillLevels[skill.id] = skill.maxLevel;
      }

      const xpToNext: number = Math.floor(GAME_CONSTANTS.XP_BASE * Math.pow(GAME_CONSTANTS.XP_GROWTH, targetLevel - 1));

      return {
        ...p,
        level: targetLevel,
        xp: 0,
        xpToNext,
        allocatedStats,
        stats: totalStats,
        derived,
        hp: derived.maxHp,
        mp: derived.maxMp,
        unallocatedStatPoints: 0,
        unallocatedSkillPoints: 0,
        skillLevels: newSkillLevels,
        inventory: { ...p.inventory, gold: 1_000_000 },
      };
    });

    this.godMode.set(true);
  }

  getPlayerUsableSkills(p: CharacterState): SkillDefinition[] {
    return SKILLS.filter(
      (s: SkillDefinition) =>
        s.classId === p.classId &&
        (s.type === SkillType.Active || s.type === SkillType.Buff) &&
        (p.skillLevels[s.id] ?? 0) > 0,
    ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel);
  }

  addGold(amount: number): void {
    this.player.update((p: CharacterState | null): CharacterState | null => {
      if (!p) return p;
      return {
        ...p,
        inventory: { ...p.inventory, gold: p.inventory.gold + amount },
      };
    });
  }

  addPotion(type: DropType): void {
    this.player.update((p: CharacterState | null): CharacterState | null => {
      if (!p) return p;
      const inv: PlayerInventory = { ...p.inventory };
      if (type === DropType.HpPotion) inv.hpPotions++;
      else if (type === DropType.MpPotion) inv.mpPotions++;
      return { ...p, inventory: inv };
    });
  }

  useHpPotion(): boolean {
    const p: CharacterState | null = this.player();
    if (!p || p.inventory.hpPotions <= 0) return false;
    if (p.hp >= p.derived.maxHp) return false;

    this.player.update((c: CharacterState | null): CharacterState | null => {
      if (!c) return c;
      const healed: number = Math.min(GAME_CONSTANTS.HP_POTION_RESTORE, c.derived.maxHp - c.hp);
      return {
        ...c,
        hp: c.hp + healed,
        inventory: { ...c.inventory, hpPotions: c.inventory.hpPotions - 1 },
      };
    });
    return true;
  }

  useMpPotion(): boolean {
    const p: CharacterState | null = this.player();
    if (!p || p.inventory.mpPotions <= 0) return false;
    if (p.mp >= p.derived.maxMp) return false;

    this.player.update((c: CharacterState | null): CharacterState | null => {
      if (!c) return c;
      const restored: number = Math.min(GAME_CONSTANTS.MP_POTION_RESTORE, c.derived.maxMp - c.mp);
      return {
        ...c,
        mp: c.mp + restored,
        inventory: { ...c.inventory, mpPotions: c.inventory.mpPotions - 1 },
      };
    });
    return true;
  }

  buyShopItem(itemId: string): boolean {
    const p: CharacterState | null = this.player();
    if (!p) return false;

    const item: ShopItemDefinition | undefined = SHOP_ITEMS.find(
      (i: ShopItemDefinition) => i.id === itemId,
    );
    if (!item || p.inventory.gold < item.price) return false;

    this.player.update((c: CharacterState | null): CharacterState | null => {
      if (!c) return c;
      const inv: PlayerInventory = { ...c.inventory, gold: c.inventory.gold - item.price };
      if (item.type === DropType.HpPotion) inv.hpPotions++;
      else if (item.type === DropType.MpPotion) inv.mpPotions++;
      return { ...c, inventory: inv };
    });
    return true;
  }

  reset(): void {
    this.player.set(null);
    this.zombies.set([]);
    this.level.set(1);
    this.score.set(0);
    this.gameOver.set(false);
    this.isPaused.set(false);
  }
}
