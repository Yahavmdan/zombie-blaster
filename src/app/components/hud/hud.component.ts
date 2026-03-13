import { Component, ChangeDetectionStrategy, InputSignal, Signal, input, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { CharacterState, CHARACTER_CLASSES, SKILLS, SkillDefinition } from '@shared/index';

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

  readonly skillSlots: Signal<SkillSlot[]> = computed((): SkillSlot[] => {
    const p: CharacterState = this.playerData();
    const classSkills: SkillDefinition[] = SKILLS.filter(
      (s: SkillDefinition) => s.classId === p.classId,
    );
    const keys: string[] = ['K', 'L'];
    return classSkills.map((skill: SkillDefinition, idx: number): SkillSlot => ({
      key: keys[idx] ?? '?',
      name: skill.name,
      icon: skill.icon,
      mpCost: skill.mpCost,
      locked: p.level < skill.unlockLevel,
    }));
  });
}
