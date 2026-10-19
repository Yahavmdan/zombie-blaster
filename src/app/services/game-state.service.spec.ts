import { TestBed } from '@angular/core/testing';
import { GameStateService } from './game-state.service';
import { CharacterClass, CharacterState, GAME_CONSTANTS, SKILLS, SkillDefinition, WARRIOR_SKILL_TREE } from '@shared/index';

describe('GameStateService', () => {
  let service: GameStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GameStateService);
  });

  function patch(change: Partial<CharacterState>): void {
    service.player.update((p: CharacterState | null): CharacterState | null => (p ? { ...p, ...change } : p));
  }

  describe('skill levels (classes without a tree)', () => {
    const luckySeven: SkillDefinition = SKILLS.find((s: SkillDefinition): boolean => s.id === 'assassin-lucky-seven')!;

    it('levels a skill up to its maxLevel', () => {
      service.createPlayer('Test', CharacterClass.Assassin);
      patch({ level: 50, unallocatedSkillPoints: 10, skillLevels: { [luckySeven.id]: luckySeven.maxLevel - 1 } });

      service.allocateSkillPoint(luckySeven.id);

      const player: CharacterState = service.player()!;
      expect(player.skillLevels[luckySeven.id]).toBe(luckySeven.maxLevel);
      expect(player.unallocatedSkillPoints).toBe(9);
    });

    it('stops at maxLevel', () => {
      service.createPlayer('Test', CharacterClass.Assassin);
      patch({ level: 50, unallocatedSkillPoints: 10, skillLevels: { [luckySeven.id]: luckySeven.maxLevel } });

      service.allocateSkillPoint(luckySeven.id);

      expect(service.player()!.skillLevels[luckySeven.id]).toBe(luckySeven.maxLevel);
      expect(service.player()!.unallocatedSkillPoints).toBe(10);
    });

    it('gives 3 points per level and none at the start', () => {
      service.createPlayer('Test', CharacterClass.Assassin);
      expect(service.player()!.unallocatedSkillPoints).toBe(0);
      service.addXp(service.player()!.xpToNext);
      expect(service.player()!.unallocatedSkillPoints).toBe(GAME_CONSTANTS.SKILL_POINTS_PER_LEVEL);
    });
  });

  describe('skill tree (warrior)', () => {
    it('starts with one point and gets one per level', () => {
      service.createPlayer('Test', CharacterClass.Warrior);
      expect(service.player()!.unallocatedSkillPoints).toBe(1);
      service.addXp(service.player()!.xpToNext);
      expect(service.player()!.level).toBe(2);
      expect(service.player()!.unallocatedSkillPoints).toBe(2);
    });

    it('owns a skill with one point, once', () => {
      service.createPlayer('Test', CharacterClass.Warrior);
      service.allocateSkillPoint('warrior-power-dash');
      expect(service.player()!.skillLevels['warrior-power-dash']).toBe(1);
      expect(service.player()!.unallocatedSkillPoints).toBe(0);

      patch({ unallocatedSkillPoints: 3 });
      service.allocateSkillPoint('warrior-power-dash');
      expect(service.player()!.skillLevels['warrior-power-dash']).toBe(1);
      expect(service.player()!.unallocatedSkillPoints).toBe(3);
    });

    it('refuses a skill above the character level or without a parent', () => {
      service.createPlayer('Test', CharacterClass.Warrior);
      patch({ unallocatedSkillPoints: 5 });
      service.allocateSkillPoint('warrior-slash-blast');
      expect(service.player()!.skillLevels['warrior-slash-blast']).toBeUndefined();

      patch({ level: 4 });
      service.allocateSkillPoint('warrior-slash-blast');
      expect(service.player()!.skillLevels['warrior-slash-blast']).toBeUndefined();

      service.allocateSkillPoint('warrior-power-strike');
      service.allocateSkillPoint('warrior-slash-blast');
      expect(service.player()!.skillLevels['warrior-slash-blast']).toBe(1);
      expect(service.player()!.unallocatedSkillPoints).toBe(3);
    });

    it('respecs for free once, then for gold, and gives every point back', () => {
      service.createPlayer('Test', CharacterClass.Warrior);
      patch({ level: 4, unallocatedSkillPoints: 4, inventory: { ...service.player()!.inventory, gold: 0 } });
      service.allocateSkillPoint('warrior-power-strike');
      service.allocateSkillPoint('warrior-uppercut');

      expect(service.respecPrice(service.player()!)).toBe(0);
      expect(service.respecSkills()).toBe(true);
      expect(service.player()!.unallocatedSkillPoints).toBe(4);
      expect(service.player()!.skillLevels['warrior-power-strike']).toBeUndefined();

      service.allocateSkillPoint('warrior-power-strike');
      const price: number = service.respecPrice(service.player()!);
      expect(price).toBe(GAME_CONSTANTS.RESPEC_GOLD_PER_LEVEL * 4);
      expect(service.respecSkills()).toBe(false);
      patch({ inventory: { ...service.player()!.inventory, gold: price } });
      expect(service.respecSkills()).toBe(true);
      expect(service.player()!.inventory.gold).toBe(0);
      expect(service.player()!.unallocatedSkillPoints).toBe(4);
    });

    it('max-out owns the whole tree and fills the skill bar', () => {
      service.createPlayer('Test', CharacterClass.Warrior);
      service.maxAllSkills();
      for (const s of WARRIOR_SKILL_TREE.skills) {
        expect(service.player()!.skillLevels[s.id], s.id).toBe(1);
      }
      expect(service.player()!.skillBar!.every((id: string | null): boolean => id !== null)).toBe(true);
    });

    it('slots a learned active on the first free key; attack combos and passives stay off the bar', () => {
      service.createPlayer('Test', CharacterClass.Warrior);
      expect(service.player()!.skillBar).toEqual([null, null, null, null, null, null]);
      patch({ unallocatedSkillPoints: 3 });
      service.allocateSkillPoint('warrior-iron-recovery');
      service.allocateSkillPoint('warrior-power-dash');
      service.allocateSkillPoint('warrior-power-strike');
      expect(service.player()!.skillBar).toEqual(['warrior-power-strike', null, null, null, null, null]);
    });

    it('moves a skill between bar slots, empties a slot, and refuses combos and skills it does not own', () => {
      service.createPlayer('Test', CharacterClass.Warrior);
      patch({ level: GAME_CONSTANTS.SKILL_TIER_LEVELS[1], unallocatedSkillPoints: 3 });
      service.allocateSkillPoint('warrior-power-strike');
      service.allocateSkillPoint('warrior-power-dash');
      service.allocateSkillPoint('warrior-uppercut');
      service.setSkillBarSlot(4, 'warrior-uppercut');
      expect(service.player()!.skillBar).toEqual(['warrior-power-strike', null, null, null, 'warrior-uppercut', null]);
      service.setSkillBarSlot(0, null);
      service.setSkillBarSlot(1, 'warrior-power-dash');
      service.setSkillBarSlot(2, 'warrior-iron-recovery');
      service.setSkillBarSlot(3, 'warrior-slash-blast');
      expect(service.player()!.skillBar).toEqual([null, null, null, null, 'warrior-uppercut', null]);
    });

    it('a respec empties the skill bar', () => {
      service.createPlayer('Test', CharacterClass.Warrior);
      service.allocateSkillPoint('warrior-power-strike');
      service.respecSkills();
      expect(service.player()!.skillBar).toEqual([null, null, null, null, null, null]);
    });
  });
});
