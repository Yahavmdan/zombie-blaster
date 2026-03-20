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
import {
  CharacterState,
  POTION_DEFINITIONS,
  CHARACTER_CLASSES,
} from '@shared/index';
import { PotionDefinition } from '@shared/game-entities';

export interface InventoryRow {
  potion: PotionDefinition;
  count: number;
}

@Component({
  selector: 'app-inventory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inventory',
    '(document:keydown.escape)': 'onClose()',
  },
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.css',
})
export class InventoryComponent {
  readonly player: InputSignal<CharacterState> = input.required<CharacterState>();

  readonly closed: OutputEmitterRef<void> = output<void>();

  readonly gold: Signal<number> = computed((): number => this.player().inventory.gold);

  readonly className: Signal<string> = computed((): string =>
    CHARACTER_CLASSES[this.player().classId].name,
  );

  readonly classIcon: Signal<string> = computed((): string =>
    CHARACTER_CLASSES[this.player().classId].icon,
  );

  readonly rows: Signal<InventoryRow[]> = computed((): InventoryRow[] => {
    const potions: Record<string, number> = this.player().inventory.potions;
    return POTION_DEFINITIONS
      .map((potion: PotionDefinition): InventoryRow => ({
        potion,
        count: potions[potion.id] ?? 0,
      }))
      .filter((row: InventoryRow): boolean => row.count > 0);
  });

  readonly totalItems: Signal<number> = computed((): number => {
    const potions: Record<string, number> = this.player().inventory.potions;
    let total: number = 0;
    for (const key of Object.keys(potions)) {
      total += potions[key];
    }
    return total;
  });

  onPotionDragStart(event: DragEvent, potionId: string): void {
    event.dataTransfer?.setData('application/json', JSON.stringify({ type: 'potion', id: potionId }));
  }

  onClose(): void {
    this.closed.emit();
  }
}
