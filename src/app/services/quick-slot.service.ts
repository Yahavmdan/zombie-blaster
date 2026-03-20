import { Injectable, WritableSignal, signal } from '@angular/core';
import { QuickSlotEntry, QUICK_SLOT_ACTIONS, QuickSlotAction } from '@shared/game-entities';

const STORAGE_KEY: string = 'zombie-blaster-quick-slots';

@Injectable({ providedIn: 'root' })
export class QuickSlotService {
  readonly slots: WritableSignal<Record<string, QuickSlotEntry | null>> = signal<Record<string, QuickSlotEntry | null>>(
    this.load(),
  );

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
      this.save(updated);
      return updated;
    });
  }

  clear(action: QuickSlotAction): void {
    this.slots.update((s: Record<string, QuickSlotEntry | null>): Record<string, QuickSlotEntry | null> => {
      const updated: Record<string, QuickSlotEntry | null> = { ...s, [action]: null };
      this.save(updated);
      return updated;
    });
  }

  getEntry(action: string): QuickSlotEntry | null {
    return this.slots()[action] ?? null;
  }

  private load(): Record<string, QuickSlotEntry | null> {
    try {
      const stored: string | null = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: Record<string, QuickSlotEntry | null> = JSON.parse(stored) as Record<string, QuickSlotEntry | null>;
        const result: Record<string, QuickSlotEntry | null> = {};
        for (const action of QUICK_SLOT_ACTIONS) {
          result[action] = parsed[action] ?? null;
        }
        return result;
      }
    } catch {
      /* corrupt data */
    }
    return this.defaults();
  }

  private defaults(): Record<string, QuickSlotEntry | null> {
    const result: Record<string, QuickSlotEntry | null> = {};
    for (const action of QUICK_SLOT_ACTIONS) {
      result[action] = null;
    }
    return result;
  }

  private save(data: Record<string, QuickSlotEntry | null>): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}
