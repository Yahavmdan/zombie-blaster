import {
  Component,
  ChangeDetectionStrategy,
  InputSignal,
  OutputEmitterRef,
  Signal,
  input,
  output,
  computed,
  inject,
} from '@angular/core';
import {
  CharacterState,
  CharacterStats,
  CharacterDerived,
  CHARACTER_CLASSES,
  CLASS_STAT_WEIGHTS,
  ClassStatWeights,
} from '@shared/index';
import { GameStateService } from '../../services/game-state.service';

export interface StatPreviewDelta {
  attack: number;
  defense: number;
  maxHp: number;
  maxMp: number;
  speed: number;
  critRate: number;
  critDamage: number;
}

export interface StatRow {
  key: keyof CharacterStats;
  label: string;
  icon: string;
  currentValue: number;
  baseValue: number;
  allocatedValue: number;
  isPrimary: boolean;
  isSecondary: boolean;
  previewDelta: StatPreviewDelta;
}

@Component({
  selector: 'app-stat-allocation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'stat-allocation',
  },
  templateUrl: './stat-allocation.component.html',
  styleUrl: './stat-allocation.component.css',
})
export class StatAllocationComponent {
  private readonly gameState: GameStateService = inject(GameStateService);

  readonly player: InputSignal<CharacterState> = input.required<CharacterState>();

  readonly statAllocated: OutputEmitterRef<keyof CharacterStats> = output<keyof CharacterStats>();
  readonly closed: OutputEmitterRef<void> = output<void>();
  readonly autoAllocateRequested: OutputEmitterRef<keyof CharacterStats> = output<keyof CharacterStats>();

  readonly hasPoints: Signal<boolean> = computed((): boolean => {
    return this.player().unallocatedStatPoints > 0;
  });

  readonly classWeights: Signal<ClassStatWeights> = computed((): ClassStatWeights => {
    return CLASS_STAT_WEIGHTS[this.player().classId];
  });

  readonly primaryStatLabel: Signal<string> = computed((): string => {
    const w: ClassStatWeights = this.classWeights();
    return w.primaryStat.toUpperCase();
  });

  readonly statRows: Signal<StatRow[]> = computed((): StatRow[] => {
    const p: CharacterState = this.player();
    const w: ClassStatWeights = this.classWeights();
    const base: CharacterStats = CHARACTER_CLASSES[p.classId].baseStats;

    const stats: { key: keyof CharacterStats; label: string; icon: string }[] = [
      { key: 'str', label: 'STR', icon: '💪' },
      { key: 'dex', label: 'DEX', icon: '🏃' },
      { key: 'int', label: 'INT', icon: '🧠' },
      { key: 'luk', label: 'LUK', icon: '🍀' },
    ];

    return stats.map((s: { key: keyof CharacterStats; label: string; icon: string }): StatRow => ({
      key: s.key,
      label: s.label,
      icon: s.icon,
      currentValue: base[s.key] + p.allocatedStats[s.key],
      baseValue: base[s.key],
      allocatedValue: p.allocatedStats[s.key],
      isPrimary: w.primaryStat === s.key,
      isSecondary: w.secondaryStat === s.key,
      previewDelta: this.computePreview(p, s.key),
    }));
  });

  onAllocate(stat: keyof CharacterStats): void {
    this.statAllocated.emit(stat);
  }

  onClose(): void {
    this.closed.emit();
  }

  onAutoAllocate(): void {
    const w: ClassStatWeights = this.classWeights();
    this.autoAllocateRequested.emit(w.primaryStat);
  }

  private computePreview(player: CharacterState, stat: keyof CharacterStats): StatPreviewDelta {
    const previewAllocated: CharacterStats = {
      ...player.allocatedStats,
      [stat]: player.allocatedStats[stat] + 1,
    };
    const currentDerived: CharacterDerived = player.derived;
    const previewDerived: CharacterDerived = this.gameState.calculateDerivedWithBuffs(
      CHARACTER_CLASSES[player.classId].baseStats,
      previewAllocated,
      player.classId,
      player.activeBuffs,
    );

    return {
      attack: previewDerived.attack - currentDerived.attack,
      defense: previewDerived.defense - currentDerived.defense,
      maxHp: previewDerived.maxHp - currentDerived.maxHp,
      maxMp: previewDerived.maxMp - currentDerived.maxMp,
      speed: +(previewDerived.speed - currentDerived.speed).toFixed(2),
      critRate: +(previewDerived.critRate - currentDerived.critRate).toFixed(1),
      critDamage: +(previewDerived.critDamage - currentDerived.critDamage).toFixed(1),
    };
  }
}
