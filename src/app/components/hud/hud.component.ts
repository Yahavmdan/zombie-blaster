import { Component, ChangeDetectionStrategy, InputSignal, OutputEmitterRef, Signal, input, output, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActiveBuff, CharacterState, CHARACTER_CLASSES, SKILLS, SkillDefinition, SkillType, getSkillMpCost } from '@shared/index';

export interface SkillSlot {
  key: string;
  name: string;
  icon: string;
  mpCost: number;
  locked: boolean;
  isBuff: boolean;
}

export interface ActiveBuffDisplay {
  skillName: string;
  icon: string;
  color: string;
  remainingPercent: number;
  remainingSec: number;
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
  readonly shopRequested: OutputEmitterRef<void> = output<void>();

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
    const usableSkills: SkillDefinition[] = SKILLS.filter(
      (s: SkillDefinition) =>
        s.classId === p.classId &&
        (s.type === SkillType.Active || s.type === SkillType.Buff) &&
        (p.skillLevels[s.id] ?? 0) > 0,
    ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel)
     .slice(0, 6);
    const keys: string[] = ['1', '2', '3', '4', '5', '6'];
    return usableSkills.map((skill: SkillDefinition, idx: number): SkillSlot => {
      const level: number = p.skillLevels[skill.id] ?? 0;
      return {
        key: keys[idx] ?? '?',
        name: `${skill.name} Lv.${level}`,
        icon: skill.icon,
        mpCost: getSkillMpCost(skill, level),
        locked: false,
        isBuff: skill.type === SkillType.Buff,
      };
    });
  });

  readonly activeBuffs: Signal<ActiveBuffDisplay[]> = computed((): ActiveBuffDisplay[] => {
    const p: CharacterState = this.playerData();
    return p.activeBuffs.map((buff: ActiveBuff): ActiveBuffDisplay => {
      const skill: SkillDefinition | undefined = SKILLS.find((s: SkillDefinition) => s.id === buff.skillId);
      return {
        skillName: skill?.name ?? 'Buff',
        icon: skill?.icon ?? '✨',
        color: skill?.color ?? '#ffffff',
        remainingPercent: (buff.remainingMs / buff.totalDurationMs) * 100,
        remainingSec: Math.ceil(buff.remainingMs / 1000),
      };
    });
  });

  readonly hpPotions: Signal<number> = computed((): number => this.playerData().inventory.hpPotions);
  readonly mpPotions: Signal<number> = computed((): number => this.playerData().inventory.mpPotions);
  readonly gold: Signal<number> = computed((): number => this.playerData().inventory.gold);

  onOpenStatPanel(): void {
    this.statPanelRequested.emit();
  }

  onOpenSkillTree(): void {
    this.skillTreeRequested.emit();
  }

  onOpenShop(): void {
    this.shopRequested.emit();
  }
}
