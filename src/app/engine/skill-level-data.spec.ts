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
  it('never lose damage or range on a level-up', () => {
    expect(levelDrops()).toEqual([]);
  });
});
