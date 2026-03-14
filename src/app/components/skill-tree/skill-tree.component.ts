import {
  Component,
  ChangeDetectionStrategy,
  InputSignal,
  OutputEmitterRef,
  Signal,
  WritableSignal,
  input,
  output,
  computed,
  signal,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import {
  CharacterState,
  SkillDefinition,
  SkillType,
  CHARACTER_CLASSES,
  getSkillDamageMultiplier,
  getSkillMpCost,
  getSkillCooldown,
  getSkillRange,
  getPassiveBonusValue,
} from '@shared/index';

export interface SkillTreeNode {
  skill: SkillDefinition;
  currentLevel: number;
  maxLevel: number;
  canInvest: boolean;
  isUnlocked: boolean;
  isMaxed: boolean;
  isRecommended: boolean;
  currentEffect: string;
  nextEffect: string;
  progressPercent: number;
}

@Component({
  selector: 'app-skill-tree',
  imports: [UpperCasePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'skill-tree',
  },
  templateUrl: './skill-tree.component.html',
  styleUrl: './skill-tree.component.css',
})
export class SkillTreeComponent {
  readonly player: InputSignal<CharacterState> = input.required<CharacterState>();
  readonly skills: InputSignal<SkillDefinition[]> = input.required<SkillDefinition[]>();

  readonly skillAllocated: OutputEmitterRef<string> = output<string>();
  readonly closed: OutputEmitterRef<void> = output<void>();

  readonly hoveredSkillId: WritableSignal<string | null> = signal<string | null>(null);

  readonly className: Signal<string> = computed((): string => {
    return CHARACTER_CLASSES[this.player().classId].name;
  });

  readonly classIcon: Signal<string> = computed((): string => {
    return CHARACTER_CLASSES[this.player().classId].icon;
  });

  readonly unallocatedPoints: Signal<number> = computed((): number => {
    return this.player().unallocatedSkillPoints;
  });

  readonly skillNodes: Signal<SkillTreeNode[]> = computed((): SkillTreeNode[] => {
    const p: CharacterState = this.player();
    const skills: SkillDefinition[] = this.skills();
    const points: number = p.unallocatedSkillPoints;

    const sorted: SkillDefinition[] = [...skills].sort(
      (a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel,
    );
    const firstActive: SkillDefinition | undefined = sorted.find(
      (s: SkillDefinition) => s.type === SkillType.Active,
    );
    const firstPassive: SkillDefinition | undefined = sorted.find(
      (s: SkillDefinition) => s.type === SkillType.Passive,
    );
    const recommendedIds: Set<string> = new Set<string>();
    if (firstActive) recommendedIds.add(firstActive.id);
    if (firstPassive) recommendedIds.add(firstPassive.id);

    return sorted.map((skill: SkillDefinition): SkillTreeNode => {
      const currentLevel: number = p.skillLevels[skill.id] ?? 0;
      const isUnlocked: boolean = p.level >= skill.requiredCharacterLevel;
      const isMaxed: boolean = currentLevel >= skill.maxLevel;
      const canInvest: boolean = points > 0 && isUnlocked && !isMaxed;

      return {
        skill,
        currentLevel,
        maxLevel: skill.maxLevel,
        canInvest,
        isUnlocked,
        isMaxed,
        isRecommended: recommendedIds.has(skill.id),
        currentEffect: this.describeEffect(skill, currentLevel),
        nextEffect: isMaxed ? 'MAX' : this.describeEffect(skill, currentLevel + 1),
        progressPercent: (currentLevel / skill.maxLevel) * 100,
      };
    });
  });

  readonly activeNodes: Signal<SkillTreeNode[]> = computed((): SkillTreeNode[] => {
    return this.skillNodes().filter((n: SkillTreeNode) => n.skill.type === SkillType.Active);
  });

  readonly passiveNodes: Signal<SkillTreeNode[]> = computed((): SkillTreeNode[] => {
    return this.skillNodes().filter((n: SkillTreeNode) => n.skill.type === SkillType.Passive);
  });

  onInvest(skillId: string): void {
    this.skillAllocated.emit(skillId);
  }

  onClose(): void {
    this.closed.emit();
  }

  onHover(skillId: string): void {
    this.hoveredSkillId.set(skillId);
  }

  onHoverOut(): void {
    this.hoveredSkillId.set(null);
  }

  private describeEffect(skill: SkillDefinition, level: number): string {
    if (level <= 0) return 'Not learned';

    if (skill.type === SkillType.Passive) {
      return this.describePassiveEffect(skill, level);
    }

    return this.describeActiveEffect(skill, level);
  }

  private describeActiveEffect(skill: SkillDefinition, level: number): string {
    const dmg: number = getSkillDamageMultiplier(skill, level);
    const mp: number = getSkillMpCost(skill, level);
    const cd: number = getSkillCooldown(skill, level);
    const range: number = getSkillRange(skill, level);
    const cdSec: string = (cd / 1000).toFixed(1);

    const parts: string[] = [`${dmg.toFixed(2)}x dmg`, `${mp} MP`, `${cdSec}s CD`];
    if (range > 0) {
      parts.push(`range ${range}`);
    }
    return `Lv.${level}: ${parts.join(', ')}`;
  }

  private describePassiveEffect(skill: SkillDefinition, level: number): string {
    if (!skill.passiveBonus) return `Lv.${level}`;
    const value: number = getPassiveBonusValue(skill, level);
    const statLabel: string = this.getStatLabel(skill.passiveBonus.stat);
    return `Lv.${level}: +${value.toFixed(1)} ${statLabel}`;
  }

  private getStatLabel(stat: string): string {
    const labels: Record<string, string> = {
      attack: 'ATK',
      defense: 'DEF',
      maxHp: 'Max HP',
      maxMp: 'Max MP',
      speed: 'Speed',
      critRate: 'Crit Rate',
      critDamage: 'Crit DMG',
      allDamagePercent: '% All DMG',
    };
    return labels[stat] ?? stat;
  }
}
