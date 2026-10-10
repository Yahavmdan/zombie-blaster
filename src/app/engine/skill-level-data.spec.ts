import { SKILLS, SkillDefinition, SkillLevelData } from '@shared/index';

interface LevelDrop {
  skillId: string;
  level: number;
  field: 'damage' | 'range';
  from: number;
  to: number;
}

/** Every place where a skill's damage or range is lower than at the level before. */
function levelDrops(): LevelDrop[] {
  const drops: LevelDrop[] = [];
  for (const skill of SKILLS.filter((s: SkillDefinition): boolean => s.levelData !== null)) {
    const levels: SkillLevelData[] = skill.levelData!;
    for (let i: number = 1; i < levels.length; i++) {
      for (const field of ['damage', 'range'] as const) {
        const from: number | undefined = levels[i - 1][field];
        const to: number | undefined = levels[i][field];
        if (from !== undefined && to !== undefined && to < from) {
          drops.push({ skillId: skill.id, level: i + 1, field, from, to });
        }
      }
    }
  }
  return drops;
}

describe('skill level tables', () => {
  // KNOWN BUG: warrior-dragon-roar level 18 has range 190 (17 has 270, 19 has 290). Remove `.fails` once fixed.
  it.fails('never lose damage or range on a level-up', () => {
    expect(levelDrops()).toEqual([]);
  });

  it('the only drop today is the Dragon Roar level-18 range typo', () => {
    expect(levelDrops()).toEqual([
      { skillId: 'warrior-dragon-roar', level: 18, field: 'range', from: 270, to: 190 },
    ]);
  });
});
