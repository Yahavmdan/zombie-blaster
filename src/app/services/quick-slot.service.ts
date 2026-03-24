import { Injectable, WritableSignal, signal } from '@angular/core';
import { QuickSlotEntry, QuickSlotAction, QUICK_SLOT_ACTIONS } from '@shared/game-entities';
import { DEFAULT_QUICK_SLOTS } from '@shared/game-constants';

@Injectable({ providedIn: 'root' })
export class QuickSlotService {
  readonly slots: WritableSignal<Record<string, QuickSlotEntry | null>> = signal<Record<string, QuickSlotEntry | null>>(
    this.copyDefaults(),
  );

  loadFromSave(saved: Record<string, QuickSlotEntry | null>): void {
    const result: Record<string, QuickSlotEntry | null> = {};
    for (const action of QUICK_SLOT_ACTIONS) {
      result[action] = saved[action] ?? null;
    }
    this.slots.set(result);
  }

  resetToDefaults(): void {
    this.slots.set(this.copyDefaults());
  }

  assign(action: QuickSlotAction, entry: QuickSlotEntry): void {
    this.slots.update((s: Record<string, QuickSlotEntry | null>): Record<string, QuickSlotEntry | null> => {
      const current: QuickSlotEntry | null = s[action] ?? null;
      if (current && current.type === entry.type && current.id === entry.id) {
        return s;
      }

      const updated: Record<string, QuickSlotEntry | null> = { ...s };
      for (const slot of QUICK_SLOT_ACTIONS) {
        const existing: QuickSlotEntry | null = updated[slot] ?? null;
        if (existing && existing.type === entry.type && existing.id === entry.id) {
          updated[slot] = null;
        }
      }
      updated[action] = entry;
      return updated;
    });
  }

  clear(action: QuickSlotAction): void {
    this.slots.update((s: Record<string, QuickSlotEntry | null>): Record<string, QuickSlotEntry | null> => {
      return { ...s, [action]: null };
    });
  }

  getEntry(action: string): QuickSlotEntry | null {
    return this.slots()[action] ?? null;
  }

  private copyDefaults(): Record<string, QuickSlotEntry | null> {
    const result: Record<string, QuickSlotEntry | null> = {};
    for (const action of QUICK_SLOT_ACTIONS) {
      const defaultEntry: QuickSlotEntry | null = DEFAULT_QUICK_SLOTS[action] ?? null;
      result[action] = defaultEntry ? { ...defaultEntry } : null;
    }
    return result;
  }
}
