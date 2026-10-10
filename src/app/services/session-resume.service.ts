import { Injectable } from '@angular/core';
import { CharacterState } from '@shared/index';

/** What a multiplayer game page needs to pick up where it was after the tab reloads. */
export interface ResumeState {
  roomId: string;
  reconnectToken: string;
  player: CharacterState;
}

const STORAGE_KEY: string = 'zb.resume';

/**
 * Keeps the running multiplayer game in sessionStorage (this tab only) while the page unloads,
 * so a reload resumes the session through the server's reconnect window instead of dropping
 * the player at "No character selected".
 */
@Injectable({ providedIn: 'root' })
export class SessionResumeService {
  save(state: ResumeState): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage blocked or full: a reload just can't resume.
    }
  }

  /** The saved state for this room, consumed: a second reload saves a fresh one. */
  take(roomId: string): ResumeState | null {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const state: Partial<ResumeState> = JSON.parse(raw) as Partial<ResumeState>;
      const valid: boolean =
        state.roomId === roomId &&
        typeof state.reconnectToken === 'string' &&
        typeof state.player === 'object' &&
        state.player !== null &&
        typeof state.player.id === 'string';
      return valid ? (state as ResumeState) : null;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing saved that could be read back anyway.
    }
  }
}
