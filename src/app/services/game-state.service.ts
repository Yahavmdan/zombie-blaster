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
  ClassSkillTree,
  TreeSkill,
  autoSlotSkill,
  countOwnedTreeSkills,
  getSkillTree,
  isSlottable,
  normalizeSkillBar,
  placeOnSkillBar,
  skillPointsPerLevel,
  startingSkillPoints,
  treeSkillLockReason,
  getPotionById,
  getPotionRestoreAmount,
  resolveAutoPotionId,
} from '@shared/index';
import { DropType, PotionDefinition, ShopItemDefinition, ZombieState } from '@shared/game-entities';
import { calculateDerived, calculateDerivedWithBuffs, totalStats } from '../engine/derived-stats';

/** A skill bar with every slot empty. */
function emptySkillBar(): Array<string | null> {
  return new Array<string | null>(GAME_CONSTANTS.TREE_SKILL_BAR_SLOTS).fill(null);
}

/** The player's bar cleaned for the tree (owned slottable skills only, right length). */
function barOf(
  tree: ClassSkillTree,
  skillLevels: Record<string, number>,
  bar: ReadonlyArray<string | null> | undefined,
): Array<string | null> {
  return normalizeSkillBar(tree, skillLevels, bar, GAME_CONSTANTS.TREE_SKILL_BAR_SLOTS);
}

/** A bar filled with the owned actives and buffs among `ids`, in that order, until it is full. */
function filledSkillBar(tree: ClassSkillTree, skillLevels: Record<string, number>, ids: string[]): Array<string | null> {
  let bar: Array<string | null> = emptySkillBar();
  for (const id of ids) {
    const skill: TreeSkill | undefined = tree.skills.find((s: TreeSkill): boolean => s.id === id);
    if (skill && isSlottable(skill) && (skillLevels[id] ?? 0) > 0) bar = autoSlotSkill(bar, id);
  }
  return bar;
}

@Injectable({ providedIn: 'root' })
export class GameStateService {
  readonly player: WritableSignal<CharacterState | null> = signal<CharacterState | null>(null);
  readonly zombies: WritableSignal<ZombieState[]> = signal<ZombieState[]>([]);
  readonly floor: WritableSignal<number> = signal<number>(1);
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

  createPlayer(name: string, classId: CharacterClass, overrideId?: string): void {
    const classDef: CharacterClassDefinition = CHARACTER_CLASSES[classId];
    const allocatedStats: CharacterStats = { str: 0, dex: 0, int: 0, luk: 0 };
    const derived: CharacterDerived = this.calculateDerived(classDef.baseStats, allocatedStats, classId);
    const totalStats: CharacterStats = this.getTotalStats(classDef.baseStats, allocatedStats);

    const character: CharacterState = {
      id: overrideId ?? crypto.randomUUID(),
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
      isDoubleJumping: false,
      isClimbing: false,
      isDead: false,
      isDown: false,
      downTimer: 0,
      unallocatedStatPoints: 0,
      unallocatedSkillPoints: startingSkillPoints(classId),
      allocatedStats,
      skillLevels: {},
      skillBar: getSkillTree(classId) ? emptySkillBar() : undefined,
      respecCount: 0,
      activeBuffs: [],
      inventory: {
        potions: { 'hp-potion-1': 3, 'mp-potion-1': 3 },
        gold: isDevMode() ? 1_000_000 : 0,
        autoPotionHpId: 'hp-potion-1',
        autoPotionMpId: 'mp-potion-1',
      },
    };

    this.player.set(character);
    this.floor.set(1);
    this.score.set(0);
    this.gameOver.set(false);
    this.zombies.set([]);
  }

  calculateDerived(baseStats: CharacterStats, allocatedStats: CharacterStats, classId: CharacterClass, level: number = 1): CharacterDerived {
    return calculateDerived(baseStats, allocatedStats, classId, level);
  }

  getTotalStats(baseStats: CharacterStats, allocatedStats: CharacterStats): CharacterStats {
    return totalStats(baseStats, allocatedStats);
  }

  calculateDerivedWithBuffs(
    baseStats: CharacterStats,
    allocatedStats: CharacterStats,
    classId: CharacterClass,
    activeBuffs: ActiveBuff[],
    level: number = 1,
  ): CharacterDerived {
    return calculateDerivedWithBuffs(baseStats, allocatedStats, classId, activeBuffs, level);
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
        pendingSkillPts += skillPointsPerLevel(p.classId);
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

  /** Gold the next skill-tree respec costs (the first one is free). */
  respecPrice(p: CharacterState): number {
    return (p.respecCount ?? 0) > 0 ? GAME_CONSTANTS.RESPEC_GOLD_PER_LEVEL * p.level : 0;
  }

  /**
   * Skill-tree classes: forget every learned tree skill and get the points back, for gold after the
   * first time. Returns false when the player can't pay (or has no tree).
   */
  respecSkills(): boolean {
    let done: boolean = false;
    this.player.update((p: CharacterState | null): CharacterState | null => {
      const tree: ClassSkillTree | null = p ? getSkillTree(p.classId) : null;
      if (!p || !tree) return p;
      const price: number = this.respecPrice(p);
      if (p.inventory.gold < price) return p;
      const refunded: number = countOwnedTreeSkills(tree, p.skillLevels);
      const skillLevels: Record<string, number> = { ...p.skillLevels };
      for (const skill of tree.skills) delete skillLevels[skill.id];
      done = true;
      return {
        ...p,
        skillLevels,
        skillBar: emptySkillBar(),
        unallocatedSkillPoints: p.unallocatedSkillPoints + refunded,
        respecCount: (p.respecCount ?? 0) + 1,
        inventory: { ...p.inventory, gold: p.inventory.gold - price },
      };
    });
    return done;
  }

  allocateSkillPoint(skillId: string): void {
    this.player.update((p: CharacterState | null) => {
      if (!p || p.unallocatedSkillPoints <= 0) return p;

      // Skill-tree classes: one point owns the skill, if its tier and a parent are unlocked.
      const tree: ClassSkillTree | null = getSkillTree(p.classId);
      if (tree) {
        const node: TreeSkill | undefined = tree.skills.find((s: TreeSkill): boolean => s.id === skillId);
        if (!node) return p;
        const locked: string | null = treeSkillLockReason(node, p.skillLevels, p.level, p.unallocatedSkillPoints, GAME_CONSTANTS.SKILL_TIER_LEVELS);
        if (locked) return p;
        const skillLevels: Record<string, number> = { ...p.skillLevels, [skillId]: 1 };
        // A new active or buff takes the first free skill-bar slot, so its key works at once.
        const bar: Array<string | null> = barOf(tree, skillLevels, p.skillBar);
        return {
          ...p,
          skillLevels,
          skillBar: isSlottable(node) ? autoSlotSkill(bar, skillId) : bar,
          unallocatedSkillPoints: p.unallocatedSkillPoints - 1,
        };
      }

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
      const newSkillLevels: Record<string, number> = { ...p.skillLevels, ...this.maxedSkillLevels(p.classId) };
      const derived: CharacterDerived = this.calculateDerivedWithBuffs(
        CHARACTER_CLASSES[p.classId].baseStats,
        p.allocatedStats,
        p.classId,
        p.activeBuffs,
        p.level,
      );
      const tree: ClassSkillTree | null = getSkillTree(p.classId);
      const skillBar: Array<string | null> | undefined = tree
        ? filledSkillBar(tree, newSkillLevels, [
            ...(p.skillBar ?? []).filter((id: string | null): id is string => id !== null),
            ...tree.skills.map((s: TreeSkill): string => s.id),
          ])
        : p.skillBar;
      return { ...p, skillLevels: newSkillLevels, skillBar, derived };
    });
  }

  /**
   * Setup (dev, e2e): owns exactly these tree skills of the player's class, whatever the points. The
   * actives and buffs among them fill the skill bar in the order given.
   */
  setTreeSkills(ids: string[]): void {
    this.player.update((p: CharacterState | null): CharacterState | null => {
      const tree: ClassSkillTree | null = p ? getSkillTree(p.classId) : null;
      if (!p || !tree) return p;
      const skillLevels: Record<string, number> = { ...p.skillLevels };
      for (const skill of tree.skills) {
        if (ids.includes(skill.id)) skillLevels[skill.id] = 1;
        else delete skillLevels[skill.id];
      }
      return { ...p, skillLevels, skillBar: filledSkillBar(tree, skillLevels, ids) };
    });
  }

  /** Skill-tree classes: puts a learned active or buff on a bar slot (null empties the slot). */
  setSkillBarSlot(slot: number, skillId: string | null): void {
    this.player.update((p: CharacterState | null): CharacterState | null => {
      const tree: ClassSkillTree | null = p ? getSkillTree(p.classId) : null;
      if (!p || !tree) return p;
      const placed: Array<string | null> = placeOnSkillBar(barOf(tree, p.skillLevels, p.skillBar), slot, skillId);
      return { ...p, skillBar: barOf(tree, p.skillLevels, placed) };
    });
  }

  /** Every skill of the class at its top: owned for a tree class, max level otherwise. */
  private maxedSkillLevels(classId: CharacterClass): Record<string, number> {
    const levels: Record<string, number> = {};
    const tree: ClassSkillTree | null = getSkillTree(classId);
    if (tree) {
      for (const skill of tree.skills) levels[skill.id] = 1;
      return levels;
    }
    for (const skill of SKILLS.filter((s: SkillDefinition): boolean => s.classId === classId)) {
      levels[skill.id] = skill.maxLevel;
    }
    return levels;
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

      const newSkillLevels: Record<string, number> = this.maxedSkillLevels(p.classId);

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
    const potionId: string = type === DropType.HpPotion ? 'hp-potion-1' : 'mp-potion-1';
    this.player.update((p: CharacterState | null): CharacterState | null => {
      if (!p) return p;
      const potions: Record<string, number> = { ...p.inventory.potions };
      potions[potionId] = (potions[potionId] ?? 0) + 1;
      return { ...p, inventory: { ...p.inventory, potions } };
    });
  }

  useHpPotion(): boolean {
    const p: CharacterState | null = this.player();
    if (!p || p.hp >= p.derived.maxHp) return false;

    const potionId: string | null = resolveAutoPotionId(p.inventory.autoPotionHpId, p.inventory.potions, 'hp');
    if (!potionId || (p.inventory.potions[potionId] ?? 0) <= 0) return false;

    this.player.update((c: CharacterState | null): CharacterState | null => {
      if (!c) return c;
      const restoreAmount: number = getPotionRestoreAmount(potionId, c.derived.maxHp, c.derived.maxMp);
      const healed: number = Math.min(restoreAmount, c.derived.maxHp - c.hp);
      const potions: Record<string, number> = { ...c.inventory.potions };
      potions[potionId] = Math.max(0, (potions[potionId] ?? 0) - 1);
      return {
        ...c,
        hp: c.hp + healed,
        inventory: { ...c.inventory, potions },
      };
    });
    return true;
  }

  useMpPotion(): boolean {
    const p: CharacterState | null = this.player();
    if (!p || p.mp >= p.derived.maxMp) return false;

    const potionId: string | null = resolveAutoPotionId(p.inventory.autoPotionMpId, p.inventory.potions, 'mp');
    if (!potionId || (p.inventory.potions[potionId] ?? 0) <= 0) return false;

    this.player.update((c: CharacterState | null): CharacterState | null => {
      if (!c) return c;
      const restoreAmount: number = getPotionRestoreAmount(potionId, c.derived.maxHp, c.derived.maxMp);
      const restored: number = Math.min(restoreAmount, c.derived.maxMp - c.mp);
      const potions: Record<string, number> = { ...c.inventory.potions };
      potions[potionId] = Math.max(0, (potions[potionId] ?? 0) - 1);
      return {
        ...c,
        mp: c.mp + restored,
        inventory: { ...c.inventory, potions },
      };
    });
    return true;
  }

  buyShopItem(itemId: string, quantity: number = 1): boolean {
    const p: CharacterState | null = this.player();
    if (!p) return false;

    const item: ShopItemDefinition | undefined = SHOP_ITEMS.find(
      (i: ShopItemDefinition) => i.id === itemId,
    );
    if (!item) return false;

    const clampedQty: number = Math.max(1, Math.min(quantity, Math.floor(p.inventory.gold / item.price)));
    const totalCost: number = clampedQty * item.price;
    if (p.inventory.gold < totalCost) return false;

    const potionDef: PotionDefinition | undefined = getPotionById(item.potionId);
    if (!potionDef) return false;

    this.player.update((c: CharacterState | null): CharacterState | null => {
      if (!c) return c;
      const potions: Record<string, number> = { ...c.inventory.potions };
      potions[item.potionId] = (potions[item.potionId] ?? 0) + clampedQty;
      return { ...c, inventory: { ...c.inventory, gold: c.inventory.gold - totalCost, potions } };
    });
    return true;
  }

  usePotion(potionId: string): boolean {
    const p: CharacterState | null = this.player();
    if (!p) return false;

    const def: PotionDefinition | undefined = getPotionById(potionId);
    if (!def) return false;
    if ((p.inventory.potions[potionId] ?? 0) <= 0) return false;
    if (def.category === 'hp' && p.hp >= p.derived.maxHp) return false;
    if (def.category === 'mp' && p.mp >= p.derived.maxMp) return false;

    this.player.update((c: CharacterState | null): CharacterState | null => {
      if (!c) return c;
      const potionDef: PotionDefinition | undefined = getPotionById(potionId);
      if (!potionDef) return c;
      const restoreAmount: number = getPotionRestoreAmount(potionId, c.derived.maxHp, c.derived.maxMp);
      const potions: Record<string, number> = { ...c.inventory.potions };
      potions[potionId] = Math.max(0, (potions[potionId] ?? 0) - 1);

      if (potionDef.category === 'hp') {
        const healed: number = Math.min(restoreAmount, c.derived.maxHp - c.hp);
        return { ...c, hp: c.hp + healed, inventory: { ...c.inventory, potions } };
      }
      const restored: number = Math.min(restoreAmount, c.derived.maxMp - c.mp);
      return { ...c, mp: c.mp + restored, inventory: { ...c.inventory, potions } };
    });
    return true;
  }

  setAutoPotionHp(potionId: string | null): void {
    this.player.update((p: CharacterState | null): CharacterState | null => {
      if (!p) return p;
      return { ...p, inventory: { ...p.inventory, autoPotionHpId: potionId } };
    });
  }

  setAutoPotionMp(potionId: string | null): void {
    this.player.update((p: CharacterState | null): CharacterState | null => {
      if (!p) return p;
      return { ...p, inventory: { ...p.inventory, autoPotionMpId: potionId } };
    });
  }

  reset(): void {
    this.player.set(null);
    this.zombies.set([]);
    this.floor.set(1);
    this.score.set(0);
    this.gameOver.set(false);
    this.isPaused.set(false);
  }
}
