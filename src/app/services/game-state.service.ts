import { Injectable, Signal, WritableSignal, signal, computed } from '@angular/core';
import {
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
  SKILLS,
  SkillDefinition,
  SkillType,
  getPassiveBonusValue,
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
    };

    this.player.set(character);
    this.wave.set(1);
    this.score.set(0);
    this.gameOver.set(false);
    this.zombies.set([]);
    this.zombiesRemaining.set(0);
  }

  calculateDerived(baseStats: CharacterStats, allocatedStats: CharacterStats, classId: CharacterClass): CharacterDerived {
    const w: ClassStatWeights = CLASS_STAT_WEIGHTS[classId];
    const totalStats: CharacterStats = this.getTotalStats(baseStats, allocatedStats);

    const primaryValue: number = totalStats[w.primaryStat];
    const secondaryValue: number = totalStats[w.secondaryStat];

    return {
      maxHp: GAME_CONSTANTS.PLAYER_BASE_HP + totalStats.str * w.hpPerStr,
      maxMp: GAME_CONSTANTS.PLAYER_BASE_MP + totalStats.int * w.mpPerInt,
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

  calculateDerivedWithPassives(
    baseStats: CharacterStats,
    allocatedStats: CharacterStats,
    classId: CharacterClass,
    skillLevels: Record<string, number>,
  ): CharacterDerived {
    const derived: CharacterDerived = this.calculateDerived(baseStats, allocatedStats, classId);

    const classPassives: SkillDefinition[] = SKILLS.filter(
      (s: SkillDefinition) => s.classId === classId && s.type === SkillType.Passive,
    );

    for (const skill of classPassives) {
      const level: number = skillLevels[skill.id] ?? 0;
      if (level <= 0 || !skill.passiveBonus) continue;

      const bonusValue: number = getPassiveBonusValue(skill, level);
      const target: string = skill.passiveBonus.stat;

      if (target === 'allDamagePercent') {
        derived.attack = Math.floor(derived.attack * (1 + bonusValue / 100));
      } else if (target in derived) {
        (derived as unknown as Record<string, number>)[target] += bonusValue;
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
      const derived: CharacterDerived = this.calculateDerivedWithPassives(baseSt, p.allocatedStats, p.classId, p.skillLevels);

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
      const derived: CharacterDerived = this.calculateDerivedWithPassives(baseSt, newAllocated, p.classId, p.skillLevels);
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
      if (currentLevel >= GAME_CONSTANTS.MAX_SKILL_LEVEL) return p;
      if (p.level < skillDef.requiredCharacterLevel) return p;

      const newSkillLevels: Record<string, number> = {
        ...p.skillLevels,
        [skillId]: currentLevel + 1,
      };

      const derived: CharacterDerived = this.calculateDerivedWithPassives(
        CHARACTER_CLASSES[p.classId].baseStats,
        p.allocatedStats,
        p.classId,
        newSkillLevels,
      );

      return {
        ...p,
        skillLevels: newSkillLevels,
        unallocatedSkillPoints: p.unallocatedSkillPoints - 1,
        derived,
      };
    });
  }

  getPlayerActiveSkills(p: CharacterState): SkillDefinition[] {
    return SKILLS.filter(
      (s: SkillDefinition) =>
        s.classId === p.classId &&
        s.type === SkillType.Active &&
        (p.skillLevels[s.id] ?? 0) > 0,
    ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel);
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
