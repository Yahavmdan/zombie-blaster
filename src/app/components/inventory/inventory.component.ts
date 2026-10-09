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
import {
  CharacterState,
  POTION_DEFINITIONS,
  CHARACTER_CLASSES,
} from '@shared/index';
import { PotionDefinition } from '@shared/game-entities';
import { PixelIconId } from '@shared/pixel-icon';
import { PixelIconComponent } from '../../ui/pixel-icon/pixel-icon.component';

export interface InventoryRow {
  potion: PotionDefinition;
  count: number;
}

/** Bag grid shape: always at least this many slot cells, filled in whole rows. */
const BAG_COLUMNS: number = 5;
const BAG_MIN_SLOTS: number = 10;

@Component({
  selector: 'app-inventory',
  imports: [PixelIconComponent],
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

  /** Potion id under the pointer / keyboard focus; the detail pane describes it. */
  readonly hoveredId: WritableSignal<string | null> = signal<string | null>(null);

  readonly gold: Signal<number> = computed((): number => this.player().inventory.gold);

  readonly className: Signal<string> = computed((): string =>
    CHARACTER_CLASSES[this.player().classId].name,
  );

  readonly classIcon: Signal<PixelIconId> = computed((): PixelIconId =>
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

  /** Placeholder cells that pad the bag grid to full rows. */
  readonly emptySlots: Signal<number[]> = computed((): number[] => {
    const used: number = this.rows().length;
    const total: number = Math.max(BAG_MIN_SLOTS, Math.ceil(used / BAG_COLUMNS) * BAG_COLUMNS);
    return Array.from(Array(total - used).keys());
  });

  readonly detail: Signal<InventoryRow | null> = computed((): InventoryRow | null => {
    const rows: InventoryRow[] = this.rows();
    const id: string | null = this.hoveredId();
    return rows.find((row: InventoryRow): boolean => row.potion.id === id) ?? rows[0] ?? null;
  });

  readonly activeId: Signal<string | null> = computed((): string | null => {
    const row: InventoryRow | null = this.detail();
    return row ? row.potion.id : null;
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
