import {
  Component,
  ChangeDetectionStrategy,
  InputSignal,
  Signal,
  input,
  computed,
  inject,
} from '@angular/core';
import {
  CharacterState,
  SKILLS,
  SkillDefinition,
  getPotionById,
} from '@shared/index';
import {
  QuickSlotEntry,
  QuickSlotAction,
  QUICK_SLOT_ACTIONS,
  PotionDefinition,
  ACTION_INFO,
  ActionInfo,
} from '@shared/game-entities';
import { KeyBindings } from '@shared/messages';
import { QuickSlotService } from '../../services/quick-slot.service';
import { KeyBindingsService, formatKeyName } from '../../services/key-bindings.service';

export interface QuickSlotDisplay {
  action: QuickSlotAction;
  entry: QuickSlotEntry | null;
  keyLabel: string;
  icon: string;
  label: string;
  count: number | null;
  isEmpty: boolean;
}

@Component({
  selector: 'app-quick-slots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'quick-slots',
  },
  templateUrl: './quick-slots.component.html',
  styleUrl: './quick-slots.component.css',
})
export class QuickSlotsComponent {
  private readonly quickSlotService: QuickSlotService = inject(QuickSlotService);
  private readonly keyBindingsService: KeyBindingsService = inject(KeyBindingsService);

  readonly player: InputSignal<CharacterState> = input.required<CharacterState>();

  readonly displaySlots: Signal<QuickSlotDisplay[]> = computed((): QuickSlotDisplay[] => {
    const assignments: Record<string, QuickSlotEntry | null> = this.quickSlotService.slots();
    const bindings: KeyBindings = this.keyBindingsService.bindings();
    const p: CharacterState = this.player();

    return QUICK_SLOT_ACTIONS.map((action: QuickSlotAction): QuickSlotDisplay => {
      const entry: QuickSlotEntry | null = assignments[action] ?? null;
      const boundKeys: string[] = bindings[action] ?? [];
      const keyLabel: string = boundKeys.length > 0 ? formatKeyName(boundKeys[0]) : '—';

      if (!entry) {
        return { action, entry: null, keyLabel, icon: '', label: '', count: null, isEmpty: true };
      }

      if (entry.type === 'keybind') {
        const info: ActionInfo | undefined = ACTION_INFO[entry.id];
        return {
          action,
          entry,
          keyLabel,
          icon: info?.icon ?? '?',
          label: info?.label ?? entry.id,
          count: null,
          isEmpty: false,
        };
      }

      if (entry.type === 'potion') {
        const def: PotionDefinition | undefined = getPotionById(entry.id);
        const count: number = p.inventory.potions[entry.id] ?? 0;
        return {
          action,
          entry,
          keyLabel,
          icon: def?.icon ?? '?',
          label: def?.name ?? entry.id,
          count,
          isEmpty: false,
        };
      }

      const skillDef: SkillDefinition | undefined = SKILLS.find(
        (s: SkillDefinition): boolean => s.id === entry.id,
      );
      return {
        action,
        entry,
        keyLabel,
        icon: skillDef?.icon ?? '?',
        label: skillDef?.name ?? entry.id,
        count: null,
        isEmpty: false,
      };
    });
  });

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onDrop(event: DragEvent, action: QuickSlotAction): void {
    event.preventDefault();
    const raw: string | undefined = event.dataTransfer?.getData('application/json');
    if (!raw) return;
    try {
      const entry: QuickSlotEntry = JSON.parse(raw) as QuickSlotEntry;
      if (entry.type && entry.id) {
        this.quickSlotService.assign(action, entry);
      }
    } catch {
      /* invalid data */
    }
  }

  onClearSlot(event: MouseEvent, action: QuickSlotAction): void {
    event.preventDefault();
    this.quickSlotService.clear(action);
  }
}
