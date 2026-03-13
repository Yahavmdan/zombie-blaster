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
import { KeyBindingsService, formatKeyName } from '../../services/key-bindings.service';

interface BindingRow {
  action: GameAction;
  label: string;
  keys: string[];
}

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'settings',
  },
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnDestroy {
  private readonly keyBindingsService: KeyBindingsService = inject(KeyBindingsService);

  readonly isOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly rebindingAction: WritableSignal<GameAction | null> = signal<GameAction | null>(null);
  readonly openChanged: OutputEmitterRef<boolean> = output<boolean>();

  private rebindHandler: ((e: KeyboardEvent) => void) | null = null;

  private readonly actionLabels: Record<GameAction, string> = {
    left: 'Move Left',
    right: 'Move Right',
    up: 'Move Up / Climb',
    down: 'Move Down',
    jump: 'Jump',
    attack: 'Attack',
    skill1: 'Skill 1',
    skill2: 'Skill 2',
  };

  readonly bindingRows: Signal<BindingRow[]> = computed((): BindingRow[] => {
    const bindings: KeyBindings = this.keyBindingsService.bindings();
    const actions: GameAction[] = Object.keys(this.actionLabels) as GameAction[];
    return actions.map((action: GameAction): BindingRow => ({
      action,
      label: this.actionLabels[action],
      keys: bindings[action],
    }));
  });

  ngOnDestroy(): void {
    this.cancelRebind();
  }

  toggleSettings(): void {
    const next: boolean = !this.isOpen();
    this.isOpen.set(next);
    this.openChanged.emit(next);
    if (!next) {
      this.cancelRebind();
    }
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

  resetDefaults(): void {
    this.keyBindingsService.resetToDefaults();
    this.cancelRebind();
  }

  formatKey(key: string): string {
    return formatKeyName(key);
  }

  private cancelRebind(): void {
    this.rebindingAction.set(null);
    if (this.rebindHandler) {
      window.removeEventListener('keydown', this.rebindHandler, { capture: true });
      this.rebindHandler = null;
    }
  }
}
