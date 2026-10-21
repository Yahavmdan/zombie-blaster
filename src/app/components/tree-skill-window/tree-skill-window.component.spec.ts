import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  CHARACTER_CLASSES,
  CharacterClass,
  CharacterState,
  Direction,
  GAME_CONSTANTS,
  WARRIOR_SKILL_TREE,
} from '@shared/index';
import { SkillBarAssignment, TreeSkillWindowComponent } from './tree-skill-window.component';

function makeWarrior(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: 'test-player',
    name: 'Tester',
    classId: CharacterClass.Warrior,
    level: 1,
    xp: 0,
    xpToNext: GAME_CONSTANTS.XP_BASE,
    stats: { ...CHARACTER_CLASSES[CharacterClass.Warrior].baseStats },
    derived: {
      maxHp: 500,
      maxMp: 200,
      attack: 100,
      defense: 50,
      speed: 5,
      critRate: 10,
      critDamage: 150,
    },
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
    unallocatedSkillPoints: 1,
    allocatedStats: { str: 0, dex: 0, int: 0, luk: 0 },
    skillLevels: {},
    activeBuffs: [],
    inventory: { potions: {}, gold: 0, autoPotionHpId: null, autoPotionMpId: null },
    ...overrides,
  };
}

describe('TreeSkillWindowComponent', (): void => {
  let fixture: ComponentFixture<TreeSkillWindowComponent>;
  let componentRef: ComponentRef<TreeSkillWindowComponent>;
  let host: HTMLElement;

  function render(player: CharacterState): void {
    componentRef.setInput('player', player);
    fixture.detectChanges();
  }

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  function node(id: string): HTMLButtonElement {
    return byTestId(`tree-node-${id}`) as HTMLButtonElement;
  }

  function learnButton(): HTMLButtonElement | null {
    return byTestId('tree-learn-button') as HTMLButtonElement | null;
  }

  beforeEach(async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [TreeSkillWindowComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(TreeSkillWindowComponent);
    componentRef = fixture.componentRef;
    host = fixture.nativeElement as HTMLElement;
  });

  it('draws every node of the class tree with its state', (): void => {
    render(makeWarrior());
    const nodes: NodeListOf<HTMLElement> = host.querySelectorAll<HTMLElement>(
      '[data-testid^="tree-node-"]',
    );
    expect(nodes.length).toBe(WARRIOR_SKILL_TREE.skills.length);
    expect(node('warrior-shoulder-charge').dataset['state']).toBe('available');
    expect(node('warrior-slash-blast').dataset['state']).toBe('locked');
    expect(byTestId('tree-points')?.textContent).toContain('1');
  });

  it('selects the first learnable node and learns the clicked one', (): void => {
    render(makeWarrior());
    const learned: string[] = [];
    componentRef.instance.learn.subscribe((id: string): void => {
      learned.push(id);
    });
    expect(byTestId('tree-detail-name')?.textContent).toContain('Power Dash');

    node('warrior-shoulder-charge').click();
    fixture.detectChanges();
    expect(byTestId('tree-detail-name')?.textContent).toContain('Shoulder Charge');
    expect(node('warrior-shoulder-charge').classList).toContain('node--selected');

    learnButton()!.click();
    expect(learned).toEqual(['warrior-shoulder-charge']);
  });

  it('explains why a node is locked', (): void => {
    render(makeWarrior());
    node('warrior-slash-blast').click();
    fixture.detectChanges();
    expect(learnButton()!.disabled).toBe(true);
    expect(byTestId('tree-lock-reason')?.textContent).toContain('Needs level 4');

    render(makeWarrior({ level: 12 }));
    node('warrior-adrenaline').click();
    fixture.detectChanges();
    expect(byTestId('tree-lock-reason')?.textContent).toContain('Needs Monster Magnet or Leap Strike');

    render(makeWarrior({ unallocatedSkillPoints: 0 }));
    node('warrior-shoulder-charge').click();
    fixture.detectChanges();
    expect(byTestId('tree-lock-reason')?.textContent).toContain('No skill points left');
  });

  it('marks owned nodes and lights the link to an owned child', (): void => {
    render(
      makeWarrior({
        level: 4,
        skillLevels: {
          'warrior-power-dash': 1,
          'warrior-slash-blast': 1,
          'warrior-shoulder-charge': 1,
        },
      }),
    );
    expect(node('warrior-power-dash').dataset['state']).toBe('owned');
    expect(node('warrior-carry-1').dataset['state']).toBe('available');
    expect(host.querySelectorAll('.link[data-state="lit"]').length).toBe(1);
    expect(host.querySelectorAll('.link[data-state="ready"]').length).toBe(2);

    node('warrior-slash-blast').click();
    fixture.detectChanges();
    expect(byTestId('tree-owned-chip')).not.toBeNull();
    expect(learnButton()).toBeNull();
  });

  it('shows live values from stats and the cost line', (): void => {
    render(makeWarrior({ level: 4 }));
    node('warrior-shoulder-charge').click();
    fixture.detectChanges();
    const values: string = host.querySelector('.values')?.textContent ?? '';
    expect(values).toContain('Damage');
    expect(values).toContain('120');
    expect(values).toContain('ATK 100 × 1.2');
    expect(values).toContain('Knockback');
    expect(values).toMatch(/from STR \d+/);
    expect(byTestId('tree-detail-cost')?.textContent).toContain('6 MP');
    expect(byTestId('tree-detail-cost')?.textContent).toContain('cooldown');
  });

  it('respec is free the first time, priced after, and needs an owned skill', (): void => {
    render(makeWarrior());
    const respec: HTMLButtonElement = byTestId('tree-respec-button') as HTMLButtonElement;
    expect(respec.disabled).toBe(true);

    let asked: number = 0;
    componentRef.instance.respec.subscribe((): void => {
      asked++;
    });
    render(makeWarrior({ skillLevels: { 'warrior-shoulder-charge': 1 } }));
    expect(respec.disabled).toBe(false);
    expect(respec.textContent?.trim()).toBe('Respec');
    respec.click();
    expect(asked).toBe(1);

    const price: number = GAME_CONSTANTS.RESPEC_GOLD_PER_LEVEL * 10;
    render(makeWarrior({ level: 10, respecCount: 1, skillLevels: { 'warrior-shoulder-charge': 1 } }));
    expect(respec.textContent).toContain(`Respec · ${price} gold`);
    expect(respec.disabled).toBe(true);
    render(
      makeWarrior({
        level: 10,
        respecCount: 1,
        skillLevels: { 'warrior-shoulder-charge': 1 },
        inventory: { potions: {}, gold: price, autoPotionHpId: null, autoPotionMpId: null },
      }),
    );
    expect(respec.disabled).toBe(false);
  });

  it('offers no drag to quick slots', (): void => {
    render(makeWarrior({ skillLevels: { 'warrior-shoulder-charge': 1 } }));
    expect(host.querySelectorAll('[draggable="true"]').length).toBe(0);
  });

  it('shows the skill bar with its keys and how the selected skill is used', (): void => {
    const owned: Record<string, number> = { 'warrior-shoulder-charge': 1, 'warrior-iron-recovery': 1 };
    render(
      makeWarrior({
        skillLevels: owned,
        skillBar: ['warrior-shoulder-charge', null, null, null, null, null],
      }),
    );
    expect(byTestId('tree-bar-slot-0')?.dataset['skill']).toBe('warrior-shoulder-charge');
    expect(byTestId('tree-bar-slot-0')?.textContent).toContain('1');
    expect(byTestId('tree-bar-slot-5')?.dataset['skill']).toBe('');
    expect(node('warrior-shoulder-charge').querySelector('.badge--key')?.textContent).toContain('1');

    node('warrior-shoulder-charge').click();
    fixture.detectChanges();
    expect(byTestId('tree-detail-use')?.textContent).toContain('Press');
    expect(byTestId('tree-detail-use')?.textContent).toContain('1');

    node('warrior-iron-recovery').click();
    fixture.detectChanges();
    expect(byTestId('tree-detail-use')?.textContent).toContain('Always on');

    node('warrior-power-dash').click();
    fixture.detectChanges();
    expect(byTestId('tree-detail-use')?.textContent).toContain('Hold attack');

    node('warrior-slash-blast').click();
    fixture.detectChanges();
    expect(byTestId('tree-detail-use')?.textContent).toContain('Double-tap attack');

    node('warrior-backstep').click();
    fixture.detectChanges();
    expect(byTestId('tree-detail-use')?.textContent).toContain('goes on your skill bar');
  });

  it('puts the selected owned active on a clicked slot, and takes it off its own slot', (): void => {
    const owned: Record<string, number> = {
      'warrior-shoulder-charge': 1,
      'warrior-backstep': 1,
      'warrior-power-dash': 1,
    };
    render(
      makeWarrior({
        skillLevels: owned,
        skillBar: ['warrior-shoulder-charge', null, null, null, null, null],
      }),
    );
    const asked: SkillBarAssignment[] = [];
    componentRef.instance.assign.subscribe((a: SkillBarAssignment): void => {
      asked.push(a);
    });
    // An attack combo takes no slot.
    node('warrior-power-dash').click();
    fixture.detectChanges();
    expect(byTestId('tree-bar-slot-2')?.classList).not.toContain('bar-slot--target');
    node('warrior-backstep').click();
    fixture.detectChanges();
    expect(byTestId('tree-bar-slot-2')?.classList).toContain('bar-slot--target');
    byTestId('tree-bar-slot-2')!.click();
    node('warrior-shoulder-charge').click();
    fixture.detectChanges();
    byTestId('tree-bar-slot-0')!.click();
    expect(asked).toEqual([
      { slot: 2, skillId: 'warrior-backstep' },
      { slot: 0, skillId: null },
    ]);
  });

  it('a slot click with a passive selected picks the skill on that slot instead', (): void => {
    const owned: Record<string, number> = { 'warrior-shoulder-charge': 1, 'warrior-iron-recovery': 1 };
    render(
      makeWarrior({
        skillLevels: owned,
        skillBar: [null, 'warrior-shoulder-charge', null, null, null, null],
      }),
    );
    let asked: number = 0;
    componentRef.instance.assign.subscribe((): void => {
      asked++;
    });
    node('warrior-iron-recovery').click();
    fixture.detectChanges();
    byTestId('tree-bar-slot-1')!.click();
    fixture.detectChanges();
    expect(asked).toBe(0);
    expect(byTestId('tree-detail-name')?.textContent).toContain('Shoulder Charge');
  });

  it('closes on Escape', (): void => {
    render(makeWarrior());
    let closed: number = 0;
    componentRef.instance.closed.subscribe((): void => {
      closed++;
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(1);
  });
});
