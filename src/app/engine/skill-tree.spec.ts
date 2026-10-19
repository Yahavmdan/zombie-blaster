import { describe, it, expect } from 'vitest';
import {
  AttackCombo,
  CharacterClass,
  CharacterStats,
  ClassSkillTree,
  GAME_CONSTANTS,
  SKILL_TREES,
  SkillType,
  SkillTreeBranch,
  StatCurve,
  TreeSkill,
  WARRIOR_SKILL_TREE,
  curveValue,
  findTreeSkill,
  autoSlotSkill,
  getSkillTree,
  isSlottable,
  normalizeSkillBar,
  placeOnSkillBar,
  skillPointsPerLevel,
  startingSkillPoints,
  treeSkillCooldownMs,
  treeSkillLockReason,
  treeSkillValue,
} from '@shared/index';
import { SKILL_ANIMATIONS } from './skill-animations';

const STATS: CharacterStats = { str: 45, dex: 20, int: 4, luk: 12 };
const TIERS: readonly number[] = GAME_CONSTANTS.SKILL_TIER_LEVELS;

function trees(): ClassSkillTree[] {
  return Object.values(SKILL_TREES).filter(
    (t: ClassSkillTree | undefined): t is ClassSkillTree => !!t,
  );
}

describe('stat curves', () => {
  const curve: StatCurve = { stat: 'dex', min: 160, max: 320, half: 40 };

  it('starts at min, reaches the halfway point at `half`, and never passes max', () => {
    expect(curveValue(curve, { ...STATS, dex: 0 })).toBe(160);
    expect(curveValue(curve, { ...STATS, dex: 40 })).toBe(240);
    expect(curveValue(curve, { ...STATS, dex: 100000 })).toBeLessThan(320);
  });

  it('grows with the stat (more DEX, longer dash)', () => {
    const dash: TreeSkill = findTreeSkill('warrior-power-dash')!;
    const low: number = treeSkillValue(dash, 'distance', { ...STATS, dex: 10 });
    const high: number = treeSkillValue(dash, 'distance', { ...STATS, dex: 60 });
    expect(high).toBeGreaterThan(low);
  });

  it('cuts cooldowns by the cooldownCut curve, never below 10%', () => {
    const dash: TreeSkill = findTreeSkill('warrior-power-dash')!;
    expect(treeSkillCooldownMs(dash, { ...STATS, dex: 0 })).toBe(dash.cooldownMs);
    expect(treeSkillCooldownMs(dash, { ...STATS, dex: 60 })).toBeLessThan(dash.cooldownMs);
    expect(treeSkillCooldownMs(dash, { ...STATS, dex: 100000 })).toBeGreaterThanOrEqual(
      dash.cooldownMs * 0.1,
    );
  });
});

describe('skill points', () => {
  it('gives a tree class one point per level and one to start with; other classes keep 3 per level', () => {
    expect(skillPointsPerLevel(CharacterClass.Warrior)).toBe(1);
    expect(startingSkillPoints(CharacterClass.Warrior)).toBe(1);
    expect(getSkillTree(CharacterClass.Assassin)).toBeNull();
    expect(skillPointsPerLevel(CharacterClass.Assassin)).toBe(
      GAME_CONSTANTS.SKILL_POINTS_PER_LEVEL,
    );
    expect(startingSkillPoints(CharacterClass.Assassin)).toBe(0);
  });
});

describe('learning tree skills', () => {
  const strike: TreeSkill = findTreeSkill('warrior-power-strike')!;
  const blast: TreeSkill = findTreeSkill('warrior-slash-blast')!;
  const executioner: TreeSkill = findTreeSkill('warrior-executioner')!;

  it('lets a level 1 warrior learn a root skill with its starting point', () => {
    expect(treeSkillLockReason(strike, {}, 1, 1, TIERS)).toBeNull();
  });

  it('needs the tier level, then a parent, then a point', () => {
    expect(treeSkillLockReason(blast, {}, 1, 5, TIERS)).toBe('level');
    expect(treeSkillLockReason(blast, {}, 4, 5, TIERS)).toBe('parent');
    expect(treeSkillLockReason(blast, { [strike.id]: 1 }, 4, 0, TIERS)).toBe('points');
    expect(treeSkillLockReason(blast, { [strike.id]: 1 }, 4, 1, TIERS)).toBeNull();
    expect(treeSkillLockReason(blast, { [strike.id]: 1, [blast.id]: 1 }, 4, 1, TIERS)).toBe(
      'owned',
    );
  });

  it('unlocks a node from any one of its parents', () => {
    expect(executioner.parents.length).toBe(2);
    expect(
      treeSkillLockReason(executioner, { [executioner.parents[1]]: 1 }, 12, 1, TIERS),
    ).toBeNull();
  });
});

describe('skill bar', () => {
  const SLOTS: number = GAME_CONSTANTS.TREE_SKILL_BAR_SLOTS;
  const owned: Record<string, number> = {
    'warrior-power-strike': 1,
    'warrior-uppercut': 1,
    'warrior-power-dash': 1,
    'warrior-iron-recovery': 1,
  };

  it('puts actives and buffs on the bar, never attack combos, passives or reactives', () => {
    expect(isSlottable(findTreeSkill('warrior-power-strike')!)).toBe(true);
    expect(isSlottable(findTreeSkill('warrior-power-dash')!)).toBe(false);
    expect(isSlottable(findTreeSkill('warrior-slash-blast')!)).toBe(false);
    expect(isSlottable(findTreeSkill('warrior-ground-slam')!)).toBe(false);
    expect(isSlottable(findTreeSkill('warrior-hyper-body')!)).toBe(true);
    expect(isSlottable(findTreeSkill('warrior-counter')!)).toBe(true);
    expect(isSlottable(findTreeSkill('warrior-iron-recovery')!)).toBe(false);
    expect(isSlottable(findTreeSkill('warrior-second-wind')!)).toBe(false);
  });

  it('cleans a bar: right length, owned slottable skills once, junk dropped', () => {
    const bar: Array<string | null> = normalizeSkillBar(
      WARRIOR_SKILL_TREE,
      owned,
      [
        'warrior-uppercut',
        'warrior-uppercut',
        'warrior-power-dash',
        'warrior-slash-blast',
        'warrior-iron-recovery',
        7,
        'x',
        'warrior-power-strike',
        'extra',
      ],
      SLOTS,
    );
    expect(bar).toEqual(['warrior-uppercut', null, null, null, null, null]);
    expect(normalizeSkillBar(WARRIOR_SKILL_TREE, owned, undefined, SLOTS)).toEqual(
      new Array(SLOTS).fill(null),
    );
  });

  it('auto-slots a new skill into the first empty slot, once', () => {
    let bar: Array<string | null> = [null, 'a', null, null, null, null];
    bar = autoSlotSkill(bar, 'b');
    expect(bar).toEqual(['b', 'a', null, null, null, null]);
    expect(autoSlotSkill(bar, 'a')).toEqual(bar);
    expect(autoSlotSkill(['a', 'b', 'c', 'd', 'e', 'f'], 'g')).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
  });

  it('moves a skill already on the bar, swapping with the slot it lands on', () => {
    const bar: Array<string | null> = ['a', 'b', null, null, null, null];
    expect(placeOnSkillBar(bar, 1, 'a')).toEqual(['b', 'a', null, null, null, null]);
    expect(placeOnSkillBar(bar, 3, 'a')).toEqual([null, 'b', null, 'a', null, null]);
    expect(placeOnSkillBar(bar, 0, null)).toEqual([null, 'b', null, null, null, null]);
    expect(placeOnSkillBar(bar, 9, 'c')).toEqual(bar);
  });
});

describe('skill tree data', () => {
  for (const tree of trees()) {
    describe(tree.classId, () => {
      it('has an active or buff in every branch root, so a fresh character has a key to press', () => {
        const roots: TreeSkill[] = tree.skills.filter(
          (s: TreeSkill): boolean => s.parents.length === 0,
        );
        expect(roots.some((s: TreeSkill): boolean => isSlottable(s))).toBe(true);
        for (const combo of Object.values(AttackCombo)) {
          const users: TreeSkill[] = tree.skills.filter((s: TreeSkill): boolean => s.combo === combo);
          expect(users.length, combo).toBeLessThanOrEqual(1);
        }
        for (const s of tree.skills) {
          if (s.combo) expect(s.type, s.id).toBe(SkillType.Active);
        }
        for (const s of tree.skills) {
          if (s.type === SkillType.Buff) expect(s.buff, s.id).not.toBeNull();
        }
      });

      it('has unique ids, valid branches, tiers 1..5 and columns 0..2', () => {
        const ids: Set<string> = new Set<string>(tree.skills.map((s: TreeSkill): string => s.id));
        expect(ids.size).toBe(tree.skills.length);
        const branches: Set<string> = new Set<string>(
          tree.branches.map((b: SkillTreeBranch): string => b.id),
        );
        for (const s of tree.skills) {
          expect(branches.has(s.branch), s.id).toBe(true);
          expect(s.tier).toBeGreaterThanOrEqual(1);
          expect(s.tier).toBeLessThanOrEqual(TIERS.length);
          expect(s.column).toBeGreaterThanOrEqual(0);
          expect(s.column).toBeLessThanOrEqual(2);
          expect(s.classId).toBe(tree.classId);
        }
      });

      it('links every skill to parents of a lower tier in the same branch; roots are tier 1', () => {
        for (const s of tree.skills) {
          if (s.parents.length === 0) expect(s.tier, s.id).toBe(1);
          for (const parentId of s.parents) {
            const parent: TreeSkill | undefined = tree.skills.find(
              (p: TreeSkill): boolean => p.id === parentId,
            );
            expect(parent, `${s.id} -> ${parentId}`).toBeDefined();
            expect(parent!.tier).toBeLessThan(s.tier);
            expect(parent!.branch).toBe(s.branch);
          }
        }
      });

      it('gives every branch exactly one capstone, at the top tier', () => {
        for (const b of tree.branches) {
          const caps: TreeSkill[] = tree.skills.filter(
            (s: TreeSkill): boolean => s.branch === b.id && s.capstone,
          );
          expect(caps.length, b.id).toBe(1);
          expect(caps[0].tier).toBe(TIERS.length);
        }
      });

      it('has an animation for every skill that names one', () => {
        for (const s of tree.skills) {
          if (s.animationKey) expect(SKILL_ANIMATIONS[s.animationKey], s.id).toBeDefined();
        }
      });

      it('keeps every curve value sane for a strong build', () => {
        const strong: CharacterStats = { str: 300, dex: 300, int: 300, luk: 300 };
        for (const s of tree.skills) {
          for (const key of Object.keys(s.curves) as Array<keyof TreeSkill['curves']>) {
            const v: number = treeSkillValue(s, key, strong);
            expect(Number.isFinite(v), `${s.id}.${key}`).toBe(true);
            expect(v, `${s.id}.${key}`).toBeGreaterThanOrEqual(0);
          }
          if (s.curves.cooldownCut)
            expect(treeSkillValue(s, 'cooldownCut', strong)).toBeLessThan(0.9);
        }
      });
    });
  }

  it('the warrior tree has 22 skills, all 9 old warrior skills among them', () => {
    expect(WARRIOR_SKILL_TREE.skills.length).toBe(22);
    for (const id of [
      'warrior-power-strike',
      'warrior-slash-blast',
      'warrior-power-dash',
      'warrior-iron-recovery',
      'warrior-power-stance',
      'warrior-hyper-body',
      'warrior-monster-magnet',
      'warrior-dragon-roar',
      'warrior-auto-potion',
    ]) {
      expect(findTreeSkill(id), id).not.toBeNull();
    }
  });
});
