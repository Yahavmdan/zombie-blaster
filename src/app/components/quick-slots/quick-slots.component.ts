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
  SkillType,
  ClassSkillTree,
  TreeSkill,
  getPotionById,
  getSkillTree,
  isSlottable,
  ownsTreeSkill,
} from '@shared/index';
import {
  QuickSlotEntry,
  QuickSlotAction,
  QUICK_SLOT_ACTIONS,
  PotionDefinition,
  ACTION_INFO,
  ActionInfo,
} from '@shared/game-entities';
import { GameAction, KeyBindings, SKILL_KEY_ACTIONS } from '@shared/messages';
import { QuickSlotService } from '../../services/quick-slot.service';
import { KeyBindingsService, formatKeyName } from '../../services/key-bindings.service';
import { PixelIconComponent } from '../../ui/pixel-icon/pixel-icon.component';
import { PixelIconId } from '@shared/pixel-icon';

const SKILL_KEY_SET: ReadonlySet<string> = new Set<string>(SKILL_KEY_ACTIONS);

export interface QuickSlotDisplay {
  action: QuickSlotAction;
  entry: QuickSlotEntry | null;
  keyLabel: string;
  icon: PixelIconId;
  label: string;
  count: number | null;
  isEmpty: boolean;
  isBuff: boolean;
}

@Component({
  selector: 'app-quick-slots',
  imports: [PixelIconComponent],
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
    // Skill-tree classes: a skill key shows the skill on that bar slot, a skill entry the tree skill.
    const tree: ClassSkillTree | null = getSkillTree(p.classId);

    return QUICK_SLOT_ACTIONS.map((action: QuickSlotAction): QuickSlotDisplay => {
      const assigned: QuickSlotEntry | null = assignments[action] ?? null;
      const boundKeys: string[] = bindings[action] ?? [];
      const keyLabel: string = boundKeys.length > 0 ? formatKeyName(boundKeys[0]) : '—';
      const skillOnly: boolean =
        assigned !== null && (assigned.type === 'skill' || (assigned.type === 'keybind' && SKILL_KEY_SET.has(assigned.id)));
      if (tree && assigned && skillOnly) {
        const id: string | null =
          assigned.type === 'skill' ? assigned.id : (p.skillBar?.[SKILL_KEY_ACTIONS.indexOf(assigned.id as GameAction)] ?? null);
        const skill: TreeSkill | undefined = tree.skills.find(
          (s: TreeSkill): boolean => s.id === id && isSlottable(s) && ownsTreeSkill(p.skillLevels, s.id),
        );
        if (!skill) {
          return { action, entry: null, keyLabel, icon: 'spark', label: '', count: null, isEmpty: true, isBuff: false };
        }
        return {
          action,
          entry: assigned,
          keyLabel,
          icon: skill.icon,
          label: skill.name,
          count: null,
          isEmpty: false,
          isBuff: skill.type === SkillType.Buff,
        };
      }
      const entry: QuickSlotEntry | null = assigned;
      if (!entry) {
        return { action, entry: null, keyLabel, icon: 'spark', label: '', count: null, isEmpty: true, isBuff: false };
      }

      if (entry.type === 'keybind') {
        const info: ActionInfo | undefined = ACTION_INFO[entry.id];
        return {
          action,
          entry,
          keyLabel,
          icon: info?.icon ?? 'spark',
          label: info?.label ?? entry.id,
          count: null,
          isEmpty: false,
          isBuff: false,
        };
      }

      if (entry.type === 'potion') {
        const def: PotionDefinition | undefined = getPotionById(entry.id);
        const count: number = p.inventory.potions[entry.id] ?? 0;
        return {
          action,
          entry,
          keyLabel,
          icon: def?.icon ?? 'spark',
          label: def?.name ?? entry.id,
          count,
          isEmpty: false,
          isBuff: false,
        };
      }

      const skillDef: SkillDefinition | undefined = SKILLS.find(
        (s: SkillDefinition): boolean => s.id === entry.id,
      );
      return {
        action,
        entry,
        keyLabel,
        icon: skillDef?.icon ?? 'spark',
        label: skillDef?.name ?? entry.id,
        count: null,
        isEmpty: false,
        isBuff: skillDef?.type === SkillType.Buff,
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
