import {
  Component,
  ChangeDetectionStrategy,
  WritableSignal,
  Signal,
  OutputEmitterRef,
  signal,
  computed,
  inject,
  OnDestroy,
  output,
} from '@angular/core';
import { GameAction, KeyBindings } from '@shared/messages';
import {
  QUICK_SLOT_ACTIONS,
  QUICK_SLOT_ACTION_SET,
  QuickSlotAction,
  QuickSlotEntry,
  QuickSlotContentType,
  ACTION_INFO,
  ActionInfo,
  PotionDefinition,
} from '@shared/game-entities';
import {
  POTION_DEFINITIONS,
  SKILLS,
  SkillDefinition,
  CharacterState,
  getPotionById,
} from '@shared/index';
import { KeyBindingsService, formatKeyName } from '../../services/key-bindings.service';
import { QuickSlotService } from '../../services/quick-slot.service';
import { GameStateService } from '../../services/game-state.service';

export interface KbKey {
  code: string;
  label: string;
  w: number;
}

interface KeyBinding {
  action: GameAction;
  label: string;
  icon: string;
}

interface ActionChip {
  action: GameAction;
  label: string;
  icon: string;
}

interface QuickSlotBindingDisplay {
  action: QuickSlotAction;
  slotNumber: number;
  keyLabel: string;
  contentIcon: string;
  contentLabel: string;
  isEmpty: boolean;
}

export interface SidePanelItem {
  type: QuickSlotContentType;
  id: string;
  icon: string;
  label: string;
  sublabel: string;
  count: number | null;
}

const KB_STEP: number = 38;

function kw(units: number): number {
  return Math.round(KB_STEP * units - 2);
}

function k(code: string, label: string, w: number = 1): KbKey {
  return { code, label, w };
}

function gap(w: number = 0.5): KbKey {
  return { code: '', label: '', w };
}

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'settings',
    '(document:keydown.escape)': 'onEscapeKey()',
  },
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnDestroy {
  private readonly keyBindingsService: KeyBindingsService = inject(KeyBindingsService);
  private readonly quickSlotService: QuickSlotService = inject(QuickSlotService);
  private readonly gameStateService: GameStateService = inject(GameStateService);

  readonly isOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly selectedKey: WritableSignal<string | null> = signal<string | null>(null);
  readonly rebindingAction: WritableSignal<GameAction | null> = signal<GameAction | null>(null);
  readonly sidePanelTab: WritableSignal<'inventory' | 'skills' | null> = signal<'inventory' | 'skills' | null>(null);
  readonly openChanged: OutputEmitterRef<boolean> = output<boolean>();

  private rebindHandler: ((e: KeyboardEvent) => void) | null = null;

  readonly mainRows: ReadonlyArray<ReadonlyArray<KbKey>> = [
    [k('escape','Esc'), gap(0.5), k('f1','F1'), k('f2','F2'), k('f3','F3'), k('f4','F4'), gap(0.25), k('f5','F5'), k('f6','F6'), k('f7','F7'), k('f8','F8'), gap(0.25), k('f9','F9'), k('f10','F10'), k('f11','F11'), k('f12','F12')],
    [k('`','`'), k('1','1'), k('2','2'), k('3','3'), k('4','4'), k('5','5'), k('6','6'), k('7','7'), k('8','8'), k('9','9'), k('0','0'), k('-','-'), k('=','='), k('backspace','Bksp',2)],
    [k('tab','Tab',1.5), k('q','Q'), k('w','W'), k('e','E'), k('r','R'), k('t','T'), k('y','Y'), k('u','U'), k('i','I'), k('o','O'), k('p','P'), k('[','['), k(']',']'), k('\\','\\',1.5)],
    [k('capslock','Caps',1.75), k('a','A'), k('s','S'), k('d','D'), k('f','F'), k('g','G'), k('h','H'), k('j','J'), k('k','K'), k('l','L'), k(';',';'), k("'","'"), k('enter','Enter',2.25)],
    [k('shift','Shift',2.25), k('z','Z'), k('x','X'), k('c','C'), k('v','V'), k('b','B'), k('n','N'), k('m','M'), k(',',','), k('.','.'), k('/','/',), k('shift','Shift',2.75)],
    [k('control','Ctrl',1.5), k('alt','Alt',1.25), gap(0.25), k(' ','Space',8.75), gap(0.25), k('alt','Alt',1.25), k('control','Ctrl',1.5)],
  ];

  readonly navRows: ReadonlyArray<ReadonlyArray<KbKey>> = [
    [],
    [k('insert','Ins'), k('home','Hm'), k('pageup','PUp')],
    [k('delete','Del'), k('end','End'), k('pagedown','PDn')],
    [],
    [gap(1), k('arrowup','↑'), gap(1)],
    [k('arrowleft','←'), k('arrowdown','↓'), k('arrowright','→')],
  ];

  readonly actionChips: ReadonlyArray<ActionChip> = [
    { action: 'attack', label: 'Attack', icon: '⚔' },
    { action: 'jump', label: 'Jump', icon: '⬆' },
    { action: 'left', label: 'Left', icon: '←' },
    { action: 'right', label: 'Right', icon: '→' },
    { action: 'up', label: 'Up', icon: '↑' },
    { action: 'down', label: 'Down', icon: '↓' },
    { action: 'skill1', label: 'Skill 1', icon: '①' },
    { action: 'skill2', label: 'Skill 2', icon: '②' },
    { action: 'skill3', label: 'Skill 3', icon: '③' },
    { action: 'skill4', label: 'Skill 4', icon: '④' },
    { action: 'skill5', label: 'Skill 5', icon: '⑤' },
    { action: 'skill6', label: 'Skill 6', icon: '⑥' },
    { action: 'useHpPotion', label: 'HP Pot', icon: '❤' },
    { action: 'useMpPotion', label: 'MP Pot', icon: '💧' },
    { action: 'openStats', label: 'Stats', icon: '📊' },
    { action: 'openSkills', label: 'Skills', icon: '📖' },
    { action: 'openShop', label: 'Shop', icon: '🛒' },
    { action: 'openInventory', label: 'Inv', icon: '🎒' },
  ];

  readonly keyActionMap: Signal<Record<string, KeyBinding>> = computed((): Record<string, KeyBinding> => {
    const bindings: KeyBindings = this.keyBindingsService.bindings();
    const slotAssignments: Record<string, QuickSlotEntry | null> = this.quickSlotService.slots();
    const result: Record<string, KeyBinding> = {};
    const actions: GameAction[] = Object.keys(bindings) as GameAction[];
    for (const action of actions) {
      const info: ActionInfo | undefined = ACTION_INFO[action];
      if (!info) continue;
      for (const key of bindings[action]) {
        if (QUICK_SLOT_ACTION_SET.has(action)) {
          const slotEntry: QuickSlotEntry | null = slotAssignments[action] ?? null;
          if (slotEntry) {
            const resolved: { label: string; icon: string } = this.resolveSlotContent(slotEntry);
            result[key] = { action, label: resolved.label, icon: resolved.icon };
          } else {
            result[key] = { action, label: info.label, icon: info.icon };
          }
        } else {
          result[key] = { action, label: info.label, icon: info.icon };
        }
      }
    }
    return result;
  });

  readonly quickSlotBindings: Signal<QuickSlotBindingDisplay[]> = computed((): QuickSlotBindingDisplay[] => {
    const bindings: KeyBindings = this.keyBindingsService.bindings();
    const slotAssignments: Record<string, QuickSlotEntry | null> = this.quickSlotService.slots();
    return QUICK_SLOT_ACTIONS.map((action: QuickSlotAction, idx: number): QuickSlotBindingDisplay => {
      const keys: string[] = bindings[action] ?? [];
      const keyLabel: string = keys.length > 0 ? formatKeyName(keys[0]) : '—';
      const entry: QuickSlotEntry | null = slotAssignments[action] ?? null;
      if (!entry) {
        return { action, slotNumber: idx + 1, keyLabel, contentIcon: '', contentLabel: '', isEmpty: true };
      }
      const resolved: { label: string; icon: string } = this.resolveSlotContent(entry);
      return { action, slotNumber: idx + 1, keyLabel, contentIcon: resolved.icon, contentLabel: resolved.label, isEmpty: false };
    });
  });

  readonly potionItems: Signal<SidePanelItem[]> = computed((): SidePanelItem[] => {
    const p: CharacterState | null = this.gameStateService.player();
    if (!p) return [];
    return POTION_DEFINITIONS
      .filter((def: PotionDefinition): boolean => (p.inventory.potions[def.id] ?? 0) > 0)
      .map((def: PotionDefinition): SidePanelItem => ({
        type: 'potion' as QuickSlotContentType,
        id: def.id,
        icon: def.icon,
        label: def.name,
        sublabel: def.description,
        count: p.inventory.potions[def.id] ?? 0,
      }));
  });

  readonly skillItems: Signal<SidePanelItem[]> = computed((): SidePanelItem[] => {
    const p: CharacterState | null = this.gameStateService.player();
    if (!p) return [];
    const usable: SkillDefinition[] = this.gameStateService.getPlayerUsableSkills(p);
    return usable.map((skill: SkillDefinition): SidePanelItem => ({
      type: 'skill' as QuickSlotContentType,
      id: skill.id,
      icon: skill.icon,
      label: skill.name,
      sublabel: skill.description,
      count: null,
    }));
  });

  ngOnDestroy(): void {
    this.cancelRebind();
  }

  onEscapeKey(): void {
    if (this.isOpen()) {
      this.toggleSettings();
    }
  }

  toggleSettings(): void {
    const next: boolean = !this.isOpen();
    this.isOpen.set(next);
    this.openChanged.emit(next);
    if (!next) {
      this.selectedKey.set(null);
      this.sidePanelTab.set(null);
      this.cancelRebind();
    }
  }

  keyWidthPx(w: number): number {
    return kw(w);
  }

  getKeyBinding(code: string): KeyBinding | null {
    return this.keyActionMap()[code] ?? null;
  }

  isQuickSlotBinding(code: string): boolean {
    const binding: KeyBinding | null = this.getKeyBinding(code);
    return binding !== null && QUICK_SLOT_ACTION_SET.has(binding.action);
  }

  toggleSidePanel(tab: 'inventory' | 'skills'): void {
    this.sidePanelTab.set(this.sidePanelTab() === tab ? null : tab);
  }

  onKeyClick(code: string): void {
    if (!code) return;
    this.selectedKey.set(this.selectedKey() === code ? null : code);
  }

  onKeyRightClick(event: MouseEvent, code: string): void {
    event.preventDefault();
    if (!code) return;
    const binding: KeyBinding | null = this.getKeyBinding(code);
    if (binding && QUICK_SLOT_ACTION_SET.has(binding.action)) {
      this.quickSlotService.clear(binding.action as QuickSlotAction);
    }
    this.keyBindingsService.clearKey(code);
  }

  onActionChipClick(action: GameAction): void {
    const key: string | null = this.selectedKey();
    if (!key) return;
    this.keyBindingsService.assignKeyToAction(key, action);
    this.selectedKey.set(null);
  }

  onClearSelectedKey(): void {
    const key: string | null = this.selectedKey();
    if (!key) return;
    const binding: KeyBinding | null = this.getKeyBinding(key);
    if (binding && QUICK_SLOT_ACTION_SET.has(binding.action)) {
      this.quickSlotService.clear(binding.action as QuickSlotAction);
    }
    this.keyBindingsService.clearKey(key);
    this.selectedKey.set(null);
  }

  resetDefaults(): void {
    this.keyBindingsService.resetToDefaults();
    this.quickSlotService.resetToDefaults();
    this.selectedKey.set(null);
    this.sidePanelTab.set(null);
    this.cancelRebind();
  }

  startRebind(action: GameAction): void {
    this.cancelRebind();
    this.rebindingAction.set(action);
    this.rebindHandler = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key !== 'Escape') {
        this.keyBindingsService.rebind(action, e.key);
      }
      this.rebindingAction.set(null);
      this.rebindHandler = null;
    };
    window.addEventListener('keydown', this.rebindHandler, { capture: true, once: true });
  }

  onActionDragStart(event: DragEvent, action: GameAction): void {
    const payload: string = JSON.stringify({ type: 'keybind', id: action });
    event.dataTransfer?.setData('application/json', payload);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onSidePanelDragStart(event: DragEvent, item: SidePanelItem): void {
    const payload: string = JSON.stringify({ type: item.type, id: item.id });
    event.dataTransfer?.setData('application/json', payload);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onKeyDragOver(event: DragEvent): void {
    const types: readonly string[] = event.dataTransfer?.types ?? [];
    if (types.includes('application/json')) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    }
  }

  onKeyDrop(event: DragEvent, keyCode: string): void {
    event.preventDefault();
    const raw: string | undefined = event.dataTransfer?.getData('application/json');
    if (!raw) return;
    try {
      const entry: QuickSlotEntry = JSON.parse(raw) as QuickSlotEntry;
      if (!entry.type || !entry.id) return;

      if (entry.type === 'keybind') {
        this.keyBindingsService.assignKeyToAction(keyCode, entry.id as GameAction);
        return;
      }

      const binding: KeyBinding | null = this.getKeyBinding(keyCode);
      if (binding && QUICK_SLOT_ACTION_SET.has(binding.action)) {
        this.quickSlotService.assign(binding.action as QuickSlotAction, entry);
      } else {
        const slots: Record<string, QuickSlotEntry | null> = this.quickSlotService.slots();
        const emptySlot: QuickSlotAction | undefined = QUICK_SLOT_ACTIONS.find(
          (a: QuickSlotAction): boolean => !slots[a],
        );
        if (emptySlot) {
          this.keyBindingsService.assignKeyToAction(keyCode, emptySlot);
          this.quickSlotService.assign(emptySlot, entry);
        }
      }
    } catch {
      /* invalid data */
    }
  }

  onQuickSlotDragOver(event: DragEvent): void {
    const types: readonly string[] = event.dataTransfer?.types ?? [];
    if (types.includes('application/json')) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    }
  }

  onQuickSlotDrop(event: DragEvent, slotAction: QuickSlotAction): void {
    event.preventDefault();
    const raw: string | undefined = event.dataTransfer?.getData('application/json');
    if (!raw) return;
    try {
      const entry: QuickSlotEntry = JSON.parse(raw) as QuickSlotEntry;
      if (entry.type && entry.id) {
        this.quickSlotService.assign(slotAction, entry);
      }
    } catch {
      /* invalid data */
    }
  }

  onQuickSlotClear(event: MouseEvent, action: QuickSlotAction): void {
    event.preventDefault();
    this.quickSlotService.clear(action);
  }

  private resolveSlotContent(entry: QuickSlotEntry): { label: string; icon: string } {
    if (entry.type === 'potion') {
      const def: PotionDefinition | undefined = getPotionById(entry.id);
      return { label: def?.name ?? entry.id, icon: def?.icon ?? '?' };
    }
    if (entry.type === 'skill') {
      const skillDef: SkillDefinition | undefined = SKILLS.find(
        (s: SkillDefinition): boolean => s.id === entry.id,
      );
      return { label: skillDef?.name ?? entry.id, icon: skillDef?.icon ?? '?' };
    }
    const bindInfo: ActionInfo | undefined = ACTION_INFO[entry.id];
    return { label: bindInfo?.label ?? entry.id, icon: bindInfo?.icon ?? '?' };
  }

  private cancelRebind(): void {
    this.rebindingAction.set(null);
    if (this.rebindHandler) {
      window.removeEventListener('keydown', this.rebindHandler, { capture: true });
      this.rebindHandler = null;
    }
  }
}
