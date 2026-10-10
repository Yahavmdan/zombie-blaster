import { Injectable, WritableSignal, effect, signal } from '@angular/core';
import { GameAction, KeyBindings } from '@shared/messages';
import { DEFAULT_KEY_BINDINGS } from '@shared/game-constants';

const KEY_DISPLAY_MAP: Record<string, string> = {
  ' ': 'Space',
  'arrowleft': '←',
  'arrowright': '→',
  'arrowup': '↑',
  'arrowdown': '↓',
  'escape': 'Esc',
  'enter': 'Enter',
  'backspace': 'Bksp',
  'tab': 'Tab',
  'shift': 'Shift',
  'control': 'Ctrl',
  'alt': 'Alt',
  'meta': 'Meta',
  'capslock': 'CapsLk',
  'delete': 'Del',
  'insert': 'Ins',
  'home': 'Hm',
  'end': 'End',
  'pageup': 'Pg↑',
  'pagedown': 'Pg↓',
  'mouseleft': 'LMB',
  'mousemiddle': 'MMB',
  'mouseright': 'RMB',
  'mouseback': 'M4',
  'mouseforward': 'M5',
};

/** Binding names for mouse buttons, indexed by `MouseEvent.button`. They live in the same table as keyboard keys. */
export const MOUSE_BUTTON_KEYS: readonly string[] = ['mouseleft', 'mousemiddle', 'mouseright', 'mouseback', 'mouseforward'];

export function mouseButtonKey(button: number): string | null {
  return MOUSE_BUTTON_KEYS[button] ?? null;
}

const STORAGE_KEY: string = 'zb.keyBindings';

export function formatKeyName(key: string): string {
  return KEY_DISPLAY_MAP[key.toLowerCase()] ?? key.toUpperCase();
}

@Injectable({ providedIn: 'root' })
export class KeyBindingsService {
  readonly bindings: WritableSignal<KeyBindings> = signal<KeyBindings>(this.loadSaved());

  constructor() {
    // The player's bindings outlive the tab: saved on every change, loaded at startup.
    effect((): void => {
      const b: KeyBindings = this.bindings();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
      } catch {
        // Storage blocked: bindings just last for this session.
      }
    });
  }

  /** Makes `key` the action's only key and takes it from any other action: one key never does two things. */
  rebind(action: GameAction, key: string): void {
    this.clearKey(key);
    const normalizedKey: string = key.toLowerCase();
    this.bindings.update((b: KeyBindings): KeyBindings => {
      return { ...b, [action]: [normalizedKey] };
    });
  }

  resetToDefaults(): void {
    this.bindings.set(this.copyDefaults());
  }

  assignKeyToAction(key: string, action: GameAction): void {
    const normalizedKey: string = key.toLowerCase();
    this.bindings.update((b: KeyBindings): KeyBindings => {
      const updated: KeyBindings = {} as KeyBindings;
      const actions: GameAction[] = Object.keys(b) as GameAction[];
      for (const act of actions) {
        updated[act] = b[act].filter((k: string): boolean => k !== normalizedKey);
      }
      updated[action] = [...updated[action], normalizedKey];
      return updated;
    });
  }

  clearKey(key: string): void {
    const normalizedKey: string = key.toLowerCase();
    this.bindings.update((b: KeyBindings): KeyBindings => {
      const updated: KeyBindings = {} as KeyBindings;
      const actions: GameAction[] = Object.keys(b) as GameAction[];
      for (const act of actions) {
        updated[act] = b[act].filter((k: string): boolean => k !== normalizedKey);
      }
      return updated;
    });
  }

  getActionForKey(key: string): GameAction | null {
    const lowerKey: string = key.toLowerCase();
    const b: KeyBindings = this.bindings();
    const actions: GameAction[] = Object.keys(b) as GameAction[];
    for (const action of actions) {
      if (b[action].some((k: string) => k === lowerKey)) {
        return action;
      }
    }
    return null;
  }

  /**
   * Saved bindings over the defaults. An action added since the save gets its default keys,
   * unless the player already uses one of them for something else.
   */
  private loadSaved(): KeyBindings {
    const result: KeyBindings = this.copyDefaults();
    let saved: unknown = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      return result;
    }
    if (typeof saved !== 'object' || saved === null) return result;
    const savedRecord: Record<string, unknown> = saved as Record<string, unknown>;
    const actions: GameAction[] = Object.keys(result) as GameAction[];
    const used: Set<string> = new Set<string>();
    const restored: Set<GameAction> = new Set<GameAction>();
    for (const action of actions) {
      const keys: unknown = savedRecord[action];
      if (!Array.isArray(keys) || !keys.every((k: unknown): boolean => typeof k === 'string')) continue;
      result[action] = keys as string[];
      restored.add(action);
      for (const k of keys as string[]) used.add(k);
    }
    for (const action of actions) {
      if (restored.has(action)) continue;
      result[action] = result[action].filter((k: string): boolean => !used.has(k));
    }
    return result;
  }

  private copyDefaults(): KeyBindings {
    const copy: KeyBindings = {} as KeyBindings;
    const actions: GameAction[] = Object.keys(DEFAULT_KEY_BINDINGS) as GameAction[];
    for (const action of actions) {
      copy[action] = [...DEFAULT_KEY_BINDINGS[action]];
    }
    return copy;
  }
}
