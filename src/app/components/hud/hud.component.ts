import { Component, ChangeDetectionStrategy, InputSignal, OutputEmitterRef, Signal, input, output, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { CharacterState, CHARACTER_CLASSES, SKILLS, SkillDefinition, SkillType, getSkillMpCost } from '@shared/index';

export interface SkillSlot {
  key: string;
  name: string;
  icon: string;
  mpCost: number;
  locked: boolean;
}

@Component({
  selector: 'app-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  host: {
    class: 'hud',
  },
  templateUrl: './hud.component.html',
  styleUrl: './hud.component.css',
})
export class HudComponent {
  readonly playerData: InputSignal<CharacterState> = input.required<CharacterState>();
  readonly wave: InputSignal<number> = input.required<number>();
  readonly score: InputSignal<number> = input.required<number>();

  readonly statPanelRequested: OutputEmitterRef<void> = output<void>();
  readonly skillTreeRequested: OutputEmitterRef<void> = output<void>();

  readonly classIcon: Signal<string> = computed((): string => {
    return CHARACTER_CLASSES[this.playerData().classId].icon;
  });

  readonly hpPercent: Signal<number> = computed((): number => {
    const p: CharacterState = this.playerData();
    return (p.hp / p.derived.maxHp) * 100;
  });

  readonly mpPercent: Signal<number> = computed((): number => {
    const p: CharacterState = this.playerData();
    return (p.mp / p.derived.maxMp) * 100;
  });

  readonly xpPercent: Signal<number> = computed((): number => {
    const p: CharacterState = this.playerData();
    return (p.xp / p.xpToNext) * 100;
  });

  readonly hasStatPoints: Signal<boolean> = computed((): boolean => {
    return this.playerData().unallocatedStatPoints > 0;
  });

  readonly unallocatedStatPoints: Signal<number> = computed((): number => {
    return this.playerData().unallocatedStatPoints;
  });

  readonly hasSkillPoints: Signal<boolean> = computed((): boolean => {
    return this.playerData().unallocatedSkillPoints > 0;
  });

  readonly unallocatedSkillPoints: Signal<number> = computed((): number => {
    return this.playerData().unallocatedSkillPoints;
  });

  readonly skillSlots: Signal<SkillSlot[]> = computed((): SkillSlot[] => {
    const p: CharacterState = this.playerData();
    const activeSkills: SkillDefinition[] = SKILLS.filter(
      (s: SkillDefinition) =>
        s.classId === p.classId &&
        s.type === SkillType.Active &&
        (p.skillLevels[s.id] ?? 0) > 0,
    ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel)
     .slice(0, 6);
    const keys: string[] = ['1', '2', '3', '4', '5', '6'];
    return activeSkills.map((skill: SkillDefinition, idx: number): SkillSlot => {
      const level: number = p.skillLevels[skill.id] ?? 0;
      return {
        key: keys[idx] ?? '?',
        name: `${skill.name} Lv.${level}`,
        icon: skill.icon,
        mpCost: getSkillMpCost(skill, level),
        locked: false,
      };
    });
  });

  onOpenStatPanel(): void {
    this.statPanelRequested.emit();
  }

  onOpenSkillTree(): void {
    this.skillTreeRequested.emit();
  }
}
