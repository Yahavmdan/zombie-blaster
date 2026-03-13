import { Injectable, WritableSignal, signal } from '@angular/core';
import { GameAction, KeyBindings } from '@shared/messages';
import { DEFAULT_KEY_BINDINGS } from '@shared/game-constants';

const STORAGE_KEY: string = 'zombie-blaster-key-bindings';

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
};

export function formatKeyName(key: string): string {
  return KEY_DISPLAY_MAP[key.toLowerCase()] ?? key.toUpperCase();
}

@Injectable({ providedIn: 'root' })
export class KeyBindingsService {
  readonly bindings: WritableSignal<KeyBindings> = signal<KeyBindings>(this.loadBindings());

  private loadBindings(): KeyBindings {
    try {
      const stored: string | null = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: KeyBindings = JSON.parse(stored) as KeyBindings;
        return this.mergeWithDefaults(parsed);
      }
    } catch {
      /* corrupt data — fall through to defaults */
    }
    return this.copyDefaults();
  }

  rebind(action: GameAction, key: string): void {
    const normalizedKey: string = key.toLowerCase();
    this.bindings.update((b: KeyBindings): KeyBindings => {
      const updated: KeyBindings = { ...b, [action]: [normalizedKey] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  resetToDefaults(): void {
    const defaults: KeyBindings = this.copyDefaults();
    this.bindings.set(defaults);
    localStorage.removeItem(STORAGE_KEY);
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

  private copyDefaults(): KeyBindings {
    const copy: KeyBindings = {} as KeyBindings;
    const actions: GameAction[] = Object.keys(DEFAULT_KEY_BINDINGS) as GameAction[];
    for (const action of actions) {
      copy[action] = [...DEFAULT_KEY_BINDINGS[action]];
    }
    return copy;
  }

  private mergeWithDefaults(stored: Partial<KeyBindings>): KeyBindings {
    const merged: KeyBindings = this.copyDefaults();
    const actions: GameAction[] = Object.keys(DEFAULT_KEY_BINDINGS) as GameAction[];
    for (const action of actions) {
      if (stored[action] && Array.isArray(stored[action]) && stored[action].length > 0) {
        merged[action] = [...stored[action]];
      }
    }
    return merged;
  }
}
