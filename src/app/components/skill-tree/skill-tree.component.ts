import {
  Component,
  ChangeDetectionStrategy,
  InputSignal,
  OutputEmitterRef,
  Signal,
  input,
  output,
  computed,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import {
  CharacterState,
  SkillDefinition,
  SkillType,
  CHARACTER_CLASSES,
  getSkillDamageMultiplier,
  getSkillMpCost,
  getSkillHpCost,
  getSkillCooldown,
  getSkillRange,
  getSkillStunDurationMs,
  getBuffEffectValue,
  getBuffDurationMs,
  getPassiveEffectValue,
  getAutoPotionSuccessChance,
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
    const firstBuff: SkillDefinition | undefined = sorted.find(
      (s: SkillDefinition) => s.type === SkillType.Buff,
    );
    const firstPassive: SkillDefinition | undefined = sorted.find(
      (s: SkillDefinition) => s.type === SkillType.Passive,
    );
    const recommendedIds: Set<string> = new Set<string>();
    if (firstActive) recommendedIds.add(firstActive.id);
    if (firstBuff) recommendedIds.add(firstBuff.id);
    if (firstPassive) recommendedIds.add(firstPassive.id);

    return sorted.map((skill: SkillDefinition): SkillTreeNode => {
      const currentLevel: number = p.skillLevels[skill.id] ?? 0;
      const isUnlocked: boolean = p.level >= skill.requiredCharacterLevel;
      const isMaxed: boolean = currentLevel >= skill.maxLevel;
      const prereqMet: boolean = !skill.prerequisite ||
        (p.skillLevels[skill.prerequisite.skillId] ?? 0) >= skill.prerequisite.level;
      const canInvest: boolean = points > 0 && isUnlocked && !isMaxed && prereqMet;

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

  readonly buffNodes: Signal<SkillTreeNode[]> = computed((): SkillTreeNode[] => {
    return this.skillNodes().filter((n: SkillTreeNode) => n.skill.type === SkillType.Buff);
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

  private describeEffect(skill: SkillDefinition, level: number): string {
    if (level <= 0) return 'Not learned';

    if (skill.type === SkillType.Buff) {
      return this.describeBuffEffect(skill, level);
    }

    if (skill.type === SkillType.Passive) {
      return this.describePassiveEffect(skill, level);
    }

    return this.describeActiveEffect(skill, level);
  }

  private describeActiveEffect(skill: SkillDefinition, level: number): string {
    const mp: number = getSkillMpCost(skill, level);
    const hp: number = getSkillHpCost(skill, level);
    const cd: number = getSkillCooldown(skill, level);
    const range: number = getSkillRange(skill, level);
    const cdSec: string = (cd / 1000).toFixed(1);

    if (skill.mechanic === 'pull') {
      const parts: string[] = [`${mp} MP`, `${cdSec}s CD`, `Range ${range}%`];
      return `Lv.${level}: ${parts.join(', ')}`;
    }

    const dmg: number = getSkillDamageMultiplier(skill, level);
    const dmgPct: number = Math.round(dmg * 100);
    const parts: string[] = [`${dmgPct}% dmg`, `${mp} MP`];
    if (hp > 0) {
      const hpLabel: string = skill.hpCostIsPercent ? `${hp}% HP` : `${hp} HP`;
      parts.push(hpLabel);
    }
    parts.push(`${cdSec}s CD`);
    if (range > 0) parts.push(`range ${range}%`);
    const stunMs: number = getSkillStunDurationMs(skill, level);
    if (stunMs > 0) {
      const stunSec: string = (stunMs / 1000).toFixed(0);
      parts.push(`stun ${stunSec}s`);
    }
    return `Lv.${level}: ${parts.join(', ')}`;
  }

  private describeBuffEffect(skill: SkillDefinition, level: number): string {
    if (!skill.buffEffect) return `Lv.${level}`;
    const value: number = getBuffEffectValue(skill, level);
    const durationMs: number = getBuffDurationMs(skill, level);
    const durationSec: number = Math.floor(durationMs / 1000);
    const mp: number = getSkillMpCost(skill, level);
    const statLabel: string = this.getStatLabel(skill.buffEffect.stat);

    if (skill.buffEffect.stat === 'knockbackResist') {
      return `Lv.${level}: ${mp} MP, ${Math.round(value)}% ${statLabel} for ${durationSec}s`;
    }

    if (skill.buffEffect.stat === 'maxHpMaxMpPercent') {
      return `Lv.${level}: ${mp} MP, +${Math.round(value)}% ${statLabel} for ${durationSec}s`;
    }

    return `Lv.${level}: +${value.toFixed(1)} ${statLabel} for ${durationSec}s`;
  }

  private describePassiveEffect(skill: SkillDefinition, level: number): string {
    if (!skill.passiveEffect) return `Lv.${level}`;

    if (skill.passiveEffect.type === 'autoPotion') {
      const chance: number = getAutoPotionSuccessChance(skill, level);
      const hpThreshold: number = skill.passiveEffect.hpThresholdPercent ?? 50;
      const mpThreshold: number = skill.passiveEffect.mpThresholdPercent ?? 30;
      return `Lv.${level}: ${Math.round(chance)}% chance, HP<${hpThreshold}% / MP<${mpThreshold}%`;
    }

    const value: number = getPassiveEffectValue(skill, level);
    const typeLabel: string = skill.passiveEffect.type === 'hpRecovery' ? 'HP' : 'MP';
    const intervalSec: number = Math.floor(skill.passiveEffect.intervalMs / 1000);
    return `Lv.${level}: +${value} ${typeLabel} every ${intervalSec}s`;
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
      knockbackResist: 'KB Resist',
      maxHpMaxMpPercent: 'Max HP & MP',
    };
    return labels[stat] ?? stat;
  }
}
