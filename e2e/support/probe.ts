import { Page } from '@playwright/test';
import type { E2eSnapshot, E2eVfxEventView, E2eVfxLogEntry } from '../../src/app/testing/e2e-api';

export type { E2eSnapshot, E2eVfxEventView, E2eVfxLogEntry };
export type {
  E2ePlayerView,
  E2eRemotePlayerView,
  E2eSkillView,
  E2eZombieView,
} from '../../src/app/testing/e2e-api';

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

/**
 * Typed bridge to `window.__zbE2e` (dev builds only, see src/app/testing/e2e-hooks.ts).
 * Every call is a round trip into the page, so poll with `waitFor` instead of tight loops.
 */
export class GameProbe {
  constructor(private readonly page: Page) {}

  async isAvailable(): Promise<boolean> {
    return this.page.evaluate((): boolean => window.__zbE2e !== undefined);
  }

  async waitForReady(timeoutMs: number = 30_000): Promise<void> {
    await this.page.waitForFunction((): boolean => window.__zbE2e?.ready() === true, undefined, {
      timeout: timeoutMs,
    });
  }

  async state(): Promise<E2eSnapshot> {
    const snapshot: E2eSnapshot | null = await this.page.evaluate(
      (): E2eSnapshot | null => window.__zbE2e?.getState() ?? null,
    );
    if (!snapshot) {
      throw new Error('Game probe returned no state: is the game page open in a dev build?');
    }
    return snapshot;
  }

  /** Polls state until `predicate` passes. Throws with `description` and the last state on timeout. */
  async waitFor(
    description: string,
    predicate: (s: E2eSnapshot) => boolean,
    options: WaitOptions = {},
  ): Promise<E2eSnapshot> {
    const timeoutMs: number = options.timeoutMs ?? 10_000;
    const intervalMs: number = options.intervalMs ?? 100;
    const deadline: number = Date.now() + timeoutMs;
    let last: E2eSnapshot | null = null;
    while (Date.now() < deadline) {
      last = await this.state();
      if (predicate(last)) return last;
      await this.page.waitForTimeout(intervalMs);
    }
    const summary: string = last ? JSON.stringify(summarize(last)) : 'no state';
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for: ${description}\nLast state: ${summary}`,
    );
  }

  async vfxLog(): Promise<E2eVfxLogEntry[]> {
    return this.page.evaluate((): E2eVfxLogEntry[] => window.__zbE2e?.getVfxLog() ?? []);
  }

  async clearVfxLog(): Promise<void> {
    await this.page.evaluate((): void => window.__zbE2e?.clearVfxLog());
  }

  async peekPendingVfx(): Promise<E2eVfxEventView[]> {
    return this.page.evaluate(
      (): E2eVfxEventView[] => window.__zbE2e?.engine?.peekPendingVfx() ?? [],
    );
  }

  async teleport(x: number, y: number): Promise<void> {
    await this.page.evaluate(
      ({ px, py }: { px: number; py: number }): void => {
        window.__zbE2e?.engine?.teleport(px, py);
      },
      { px: x, py: y },
    );
  }

  async setGodMode(enabled: boolean): Promise<void> {
    await this.page.evaluate(
      (on: boolean): void => window.__zbE2e?.controls?.setGodMode(on),
      enabled,
    );
  }

  async setFloor(floor: number): Promise<void> {
    await this.page.evaluate((f: number): void => window.__zbE2e?.controls?.setFloor(f), floor);
  }

  async levelUp(times: number = 1): Promise<void> {
    await this.page.evaluate((n: number): void => window.__zbE2e?.controls?.levelUp(n), times);
  }

  async maxAllSkills(): Promise<void> {
    await this.page.evaluate((): void => window.__zbE2e?.controls?.maxAllSkills());
  }

  async maxOutPlayer(): Promise<void> {
    await this.page.evaluate((): void => {
      window.__zbE2e?.controls?.maxOutPlayer();
      window.__zbE2e?.controls?.maxAllSkills();
    });
  }

  async selectClass(classId: string): Promise<void> {
    await this.page.evaluate(
      (c: string): void => window.__zbE2e?.controls?.selectClass(c),
      classId,
    );
  }

  async activateSpecialDrop(type: string): Promise<void> {
    await this.page.evaluate(
      (t: string): void => window.__zbE2e?.controls?.activateSpecialDrop(t),
      type,
    );
  }

  async isGameOver(): Promise<boolean> {
    return this.page.evaluate((): boolean => window.__zbE2e?.controls?.isGameOver() ?? false);
  }
}

/** Compact state for error messages and report attachments. */
export function summarize(s: E2eSnapshot): Record<string, unknown> {
  return {
    role: s.role,
    floor: s.floor,
    player: s.player
      ? {
          id: s.player.id.slice(0, 8),
          x: Math.round(s.player.x),
          y: Math.round(s.player.y),
          hp: s.player.hp,
          mp: s.player.mp,
          level: s.player.level,
          attacking: s.player.isAttacking,
          down: s.player.isDown,
          dead: s.player.isDead,
        }
      : null,
    remotePlayers: s.remotePlayers.map(
      (rp: E2eSnapshot['remotePlayers'][number]): Record<string, unknown> => ({
        id: rp.id.slice(0, 8),
        x: Math.round(rp.x),
        y: Math.round(rp.y),
        anim: rp.animState,
      }),
    ),
    zombies: s.zombies.length,
    corpses: s.corpses,
    vfx: s.vfx,
    pending: s.pending,
  };
}
