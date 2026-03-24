import { Injectable } from '@angular/core';
import { SaveGameData, SaveGameSlot, MAX_SAVE_SLOTS } from '@shared/save-game';

const STORAGE_PREFIX: string = 'zombie-blaster-save-';
const AUTO_SAVE_KEY: string = `${STORAGE_PREFIX}__auto__`;

const LEGACY_KEYS: string[] = [
  'zombie-blaster-quick-slots',
  'zombie-blaster-key-bindings',
];

@Injectable({ providedIn: 'root' })
export class SaveGameService {

  clearLegacyStorage(): void {
    for (const key of LEGACY_KEYS) {
      localStorage.removeItem(key);
    }
  }

  save(data: SaveGameData): boolean {
    const key: string = this.buildKey(data.saveName);
    const isOverwrite: boolean = localStorage.getItem(key) !== null;
    if (!isOverwrite && this.saveSlotCount() >= MAX_SAVE_SLOTS) {
      return false;
    }
    const json: string = JSON.stringify(data);
    localStorage.setItem(key, json);
    return true;
  }

  saveSlotCount(): number {
    let count: number = 0;
    for (let i: number = 0; i < localStorage.length; i++) {
      const key: string | null = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX) && key !== AUTO_SAVE_KEY) {
        count++;
      }
    }
    return count;
  }

  autoSave(data: SaveGameData): void {
    const autoData: SaveGameData = { ...data, saveName: '__auto__' };
    const json: string = JSON.stringify(autoData);
    localStorage.setItem(AUTO_SAVE_KEY, json);
  }

  loadAutoSave(): SaveGameData | null {
    return this.readSlot(AUTO_SAVE_KEY);
  }

  load(saveName: string): SaveGameData | null {
    const key: string = this.buildKey(saveName);
    return this.readSlot(key);
  }

  deleteSlot(saveName: string): void {
    const key: string = this.buildKey(saveName);
    localStorage.removeItem(key);
  }

  deleteAutoSave(): void {
    localStorage.removeItem(AUTO_SAVE_KEY);
  }

  listSaves(): SaveGameSlot[] {
    const slots: SaveGameSlot[] = [];
    for (let i: number = 0; i < localStorage.length; i++) {
      const key: string | null = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      if (key === AUTO_SAVE_KEY) continue;
      const data: SaveGameData | null = this.readSlot(key);
      if (data) {
        slots.push({ key, data });
      }
    }
    slots.sort((a: SaveGameSlot, b: SaveGameSlot): number => b.data.timestamp - a.data.timestamp);
    return slots;
  }

  hasAutoSave(): boolean {
    return localStorage.getItem(AUTO_SAVE_KEY) !== null;
  }

  hasSaves(): boolean {
    for (let i: number = 0; i < localStorage.length; i++) {
      const key: string | null = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) return true;
    }
    return false;
  }

  private buildKey(saveName: string): string {
    return `${STORAGE_PREFIX}${saveName}`;
  }

  private readSlot(key: string): SaveGameData | null {
    try {
      const raw: string | null = localStorage.getItem(key);
      if (!raw) return null;
      const parsed: SaveGameData = JSON.parse(raw) as SaveGameData;
      if (!this.isValid(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private isValid(data: unknown): data is SaveGameData {
    if (!data || typeof data !== 'object') return false;
    const d: Record<string, unknown> = data as Record<string, unknown>;
    return (
      typeof d['saveName'] === 'string' &&
      typeof d['timestamp'] === 'number' &&
      typeof d['floor'] === 'number' &&
      typeof d['classId'] === 'string' &&
      typeof d['playerName'] === 'string' &&
      typeof d['level'] === 'number' &&
      typeof d['inventory'] === 'object' &&
      d['inventory'] !== null
    );
  }
}
