import { TestBed } from '@angular/core/testing';
import { GameStateService } from './game-state.service';
import { CharacterClass, CharacterState, SKILLS, SkillDefinition } from '@shared/index';

describe('GameStateService', () => {
  let service: GameStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GameStateService);
  });

  describe('allocateSkillPoint', () => {
    it('should allow leveling a skill past 20 when its maxLevel is 30', () => {
      const skillWith30MaxLevel: SkillDefinition | undefined = SKILLS.find(
        (s: SkillDefinition) => s.maxLevel === 30 && s.classId === CharacterClass.Warrior,
      );
      expect(skillWith30MaxLevel).toBeDefined();

      service.createPlayer('Test', CharacterClass.Warrior);

      const targetSkillId: string = skillWith30MaxLevel!.id;
      const targetLevel: number = 21;

      service.player.update((p: CharacterState | null): CharacterState | null => {
        if (!p) return p;
        const skillLevels: Record<string, number> = { ...p.skillLevels, [targetSkillId]: 20 };
        if (skillWith30MaxLevel!.prerequisite) {
          skillLevels[skillWith30MaxLevel!.prerequisite.skillId] = skillWith30MaxLevel!.prerequisite.level;
        }
        return {
          ...p,
          level: 50,
          unallocatedSkillPoints: 10,
          skillLevels,
        };
      });

      service.allocateSkillPoint(targetSkillId);

      const player: CharacterState | null = service.player();
      expect(player).not.toBeNull();
      expect(player!.skillLevels[targetSkillId]).toBe(targetLevel);
      expect(player!.unallocatedSkillPoints).toBe(9);
    });

    it('should block leveling at maxLevel 20 for skills with maxLevel 20', () => {
      const skillWith20MaxLevel: SkillDefinition | undefined = SKILLS.find(
        (s: SkillDefinition) => s.maxLevel === 20 && s.classId === CharacterClass.Warrior,
      );
      expect(skillWith20MaxLevel).toBeDefined();

      service.createPlayer('Test', CharacterClass.Warrior);

      const targetSkillId: string = skillWith20MaxLevel!.id;

      service.player.update((p: CharacterState | null): CharacterState | null => {
        if (!p) return p;
        return {
          ...p,
          level: 50,
          unallocatedSkillPoints: 10,
          skillLevels: { ...p.skillLevels, [targetSkillId]: 20 },
        };
      });

      service.allocateSkillPoint(targetSkillId);

      const player: CharacterState | null = service.player();
      expect(player).not.toBeNull();
      expect(player!.skillLevels[targetSkillId]).toBe(20);
      expect(player!.unallocatedSkillPoints).toBe(10);
    });

    it('should allow leveling a skill from level 25 to 26 when maxLevel is 30', () => {
      const skillWith30MaxLevel: SkillDefinition | undefined = SKILLS.find(
        (s: SkillDefinition) => s.maxLevel === 30 && s.classId === CharacterClass.Warrior,
      );
      expect(skillWith30MaxLevel).toBeDefined();

      service.createPlayer('Test', CharacterClass.Warrior);

      const targetSkillId: string = skillWith30MaxLevel!.id;

      service.player.update((p: CharacterState | null): CharacterState | null => {
        if (!p) return p;
        const skillLevels: Record<string, number> = { ...p.skillLevels, [targetSkillId]: 25 };
        if (skillWith30MaxLevel!.prerequisite) {
          skillLevels[skillWith30MaxLevel!.prerequisite.skillId] = skillWith30MaxLevel!.prerequisite.level;
        }
        return {
          ...p,
          level: 50,
          unallocatedSkillPoints: 10,
          skillLevels,
        };
      });

      service.allocateSkillPoint(targetSkillId);

      const player: CharacterState | null = service.player();
      expect(player).not.toBeNull();
      expect(player!.skillLevels[targetSkillId]).toBe(26);
    });

    it('should block leveling at maxLevel 30', () => {
      const skillWith30MaxLevel: SkillDefinition | undefined = SKILLS.find(
        (s: SkillDefinition) => s.maxLevel === 30 && s.classId === CharacterClass.Warrior,
      );
      expect(skillWith30MaxLevel).toBeDefined();

      service.createPlayer('Test', CharacterClass.Warrior);

      const targetSkillId: string = skillWith30MaxLevel!.id;

      service.player.update((p: CharacterState | null): CharacterState | null => {
        if (!p) return p;
        const skillLevels: Record<string, number> = { ...p.skillLevels, [targetSkillId]: 30 };
        if (skillWith30MaxLevel!.prerequisite) {
          skillLevels[skillWith30MaxLevel!.prerequisite.skillId] = skillWith30MaxLevel!.prerequisite.level;
        }
        return {
          ...p,
          level: 50,
          unallocatedSkillPoints: 10,
          skillLevels,
        };
      });

      service.allocateSkillPoint(targetSkillId);

      const player: CharacterState | null = service.player();
      expect(player).not.toBeNull();
      expect(player!.skillLevels[targetSkillId]).toBe(30);
      expect(player!.unallocatedSkillPoints).toBe(10);
    });
  });
});
