import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { SkillTreeComponent, SkillTreeNode } from './skill-tree.component';
import {
  CharacterClass,
  CharacterState,
  CHARACTER_CLASSES,
  Direction,
  GAME_CONSTANTS,
  SKILLS,
  SkillDefinition,
} from '@shared/index';

function makePlayer(overrides: Partial<CharacterState> = {}): CharacterState {
  const classId: CharacterClass = overrides.classId ?? CharacterClass.Assassin;
  const baseDef = CHARACTER_CLASSES[classId];
  return {
    id: 'test-player',
    name: 'Tester',
    classId,
    level: 50,
    xp: 0,
    xpToNext: GAME_CONSTANTS.XP_BASE,
    stats: { ...baseDef.baseStats },
    derived: { maxHp: 500, maxMp: 200, attack: 100, defense: 50, speed: 5, critRate: 10, critDamage: 150 },
    hp: 500,
    mp: 200,
    x: 0,
    y: 0,
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
    unallocatedSkillPoints: 10,
    allocatedStats: { str: 0, dex: 0, int: 0, luk: 0 },
    skillLevels: {},
    activeBuffs: [],
    inventory: { potions: {}, gold: 0, autoPotionHpId: null, autoPotionMpId: null },
    ...overrides,
  };
}

describe('SkillTreeComponent', () => {
  let fixture: ComponentFixture<SkillTreeComponent>;
  let component: SkillTreeComponent;
  let componentRef: ComponentRef<SkillTreeComponent>;

  // The warrior moved to a skill tree; the assassin still levels skills in this window.
  const legacySkills: SkillDefinition[] = SKILLS.filter(
    (s: SkillDefinition) => s.classId === CharacterClass.Assassin,
  );

  const skillWithMax20: SkillDefinition = legacySkills.find(
    (s: SkillDefinition) => s.maxLevel === 20,
  )!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkillTreeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkillTreeComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
  });

  it('should show canInvest=true for a maxLevel:20 skill at level 19', () => {
    const skillLevels: Record<string, number> = { [skillWithMax20.id]: 19 };
    if (skillWithMax20.prerequisite) {
      skillLevels[skillWithMax20.prerequisite.skillId] = skillWithMax20.prerequisite.level;
    }

    componentRef.setInput('player', makePlayer({
      unallocatedSkillPoints: 5,
      skillLevels,
    }));
    componentRef.setInput('skills', legacySkills);
    fixture.detectChanges();

    const node: SkillTreeNode | undefined = component.skillNodes().find(
      (n: SkillTreeNode) => n.skill.id === skillWithMax20.id,
    );

    expect(node).toBeDefined();
    expect(node!.currentLevel).toBe(19);
    expect(node!.maxLevel).toBe(20);
    expect(node!.isMaxed).toBe(false);
    expect(node!.canInvest).toBe(true);
  });

  it('should render the invest button as enabled at level 19 for maxLevel:20 skill', () => {
    const skillLevels: Record<string, number> = { [skillWithMax20.id]: 19 };
    if (skillWithMax20.prerequisite) {
      skillLevels[skillWithMax20.prerequisite.skillId] = skillWithMax20.prerequisite.level;
    }

    componentRef.setInput('player', makePlayer({
      unallocatedSkillPoints: 5,
      skillLevels,
    }));
    componentRef.setInput('skills', legacySkills);
    fixture.detectChanges();

    const investBtn: HTMLButtonElement | null = fixture.nativeElement.querySelector(
      `[data-testid="skill-tree-button-invest-${skillWithMax20.id}"]`,
    );

    expect(investBtn).not.toBeNull();
    expect(investBtn!.disabled).toBe(false);
  });

  it('should show level as 19/20 for a maxLevel:20 skill', () => {
    const skillLevels: Record<string, number> = { [skillWithMax20.id]: 19 };
    if (skillWithMax20.prerequisite) {
      skillLevels[skillWithMax20.prerequisite.skillId] = skillWithMax20.prerequisite.level;
    }

    componentRef.setInput('player', makePlayer({
      unallocatedSkillPoints: 5,
      skillLevels,
    }));
    componentRef.setInput('skills', legacySkills);
    fixture.detectChanges();

    const card: HTMLElement | null = fixture.nativeElement.querySelector(
      `[data-testid="skill-tree-card-${skillWithMax20.id}"]`,
    );
    expect(card).not.toBeNull();

    const levelText: string = card!.querySelector('.skill-card-level')?.textContent?.trim() ?? '';
    expect(levelText).toBe('19/20');
  });

  it('should show isMaxed=true only when currentLevel reaches actual maxLevel (20)', () => {
    const skillLevels: Record<string, number> = { [skillWithMax20.id]: 20 };
    if (skillWithMax20.prerequisite) {
      skillLevels[skillWithMax20.prerequisite.skillId] = skillWithMax20.prerequisite.level;
    }

    componentRef.setInput('player', makePlayer({
      unallocatedSkillPoints: 5,
      skillLevels,
    }));
    componentRef.setInput('skills', legacySkills);
    fixture.detectChanges();

    const node: SkillTreeNode | undefined = component.skillNodes().find(
      (n: SkillTreeNode) => n.skill.id === skillWithMax20.id,
    );

    expect(node).toBeDefined();
    expect(node!.isMaxed).toBe(true);
    expect(node!.canInvest).toBe(false);
  });
});
