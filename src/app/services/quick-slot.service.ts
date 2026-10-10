import { Injectable, WritableSignal, effect, signal } from '@angular/core';
import { QuickSlotEntry, QuickSlotAction, QUICK_SLOT_ACTIONS } from '@shared/game-entities';
import { DEFAULT_QUICK_SLOTS, SKILLS } from '@shared/game-constants';
import { CharacterClass } from '@shared/character';
import { SkillDefinition } from '@shared/skill';

const STORAGE_KEY: string = 'zb.quickSlots';
const ENTRY_TYPES: Set<string> = new Set<string>(['skill', 'potion', 'keybind']);

function isEntry(value: unknown): value is QuickSlotEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v: Record<string, unknown> = value as Record<string, unknown>;
  return typeof v['type'] === 'string' && ENTRY_TYPES.has(v['type']) && typeof v['id'] === 'string';
}

@Injectable({ providedIn: 'root' })
export class QuickSlotService {
  readonly slots: WritableSignal<Record<string, QuickSlotEntry | null>> = signal<Record<string, QuickSlotEntry | null>>(
    this.loadSaved(),
  );

  constructor() {
    // Quick slots outlive the tab like key bindings: saved on every change, loaded at startup.
    effect((): void => {
      const slots: Record<string, QuickSlotEntry | null> = this.slots();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
      } catch {
        // Storage blocked: slots just last for this session.
      }
    });
  }

  resetToDefaults(): void {
    this.slots.set(this.copyDefaults());
  }

  /** A new character: empties slots holding another class's skills, keeps everything else. */
  dropOtherClassSkills(classId: CharacterClass): void {
    this.slots.update((s: Record<string, QuickSlotEntry | null>): Record<string, QuickSlotEntry | null> => {
      const updated: Record<string, QuickSlotEntry | null> = { ...s };
      for (const action of QUICK_SLOT_ACTIONS) {
        const entry: QuickSlotEntry | null = updated[action] ?? null;
        if (!entry || entry.type !== 'skill') continue;
        const skill: SkillDefinition | undefined = SKILLS.find((k: SkillDefinition): boolean => k.id === entry.id);
        if (!skill || skill.classId !== classId) updated[action] = null;
      }
      return updated;
    });
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

  private loadSaved(): Record<string, QuickSlotEntry | null> {
    const result: Record<string, QuickSlotEntry | null> = this.copyDefaults();
    let saved: unknown = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      return result;
    }
    if (typeof saved !== 'object' || saved === null) return result;
    const savedRecord: Record<string, unknown> = saved as Record<string, unknown>;
    for (const action of QUICK_SLOT_ACTIONS) {
      if (!(action in savedRecord)) continue;
      const entry: unknown = savedRecord[action];
      if (entry === null) result[action] = null;
      else if (isEntry(entry)) result[action] = { type: entry.type, id: entry.id };
    }
    return result;
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
