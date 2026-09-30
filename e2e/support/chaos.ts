import { GamePlayer, KEYS } from './game-player';
import { findInvariantViolations } from './invariants';
import { E2eSnapshot } from './probe';

export interface ChaosOptions {
  seed: number;
  durationMs: number;
  /** Include dialog keys (stats/skills/shop/inventory) and Escape. */
  includeDialogs?: boolean;
  /** Include viewport resizes. */
  includeResize?: boolean;
  /** Check invariants every N actions. */
  checkEvery?: number;
  /** Forwarded to findInvariantViolations. */
  checkPendingQueues?: boolean;
}

export interface ChaosReport {
  seed: number;
  actions: number;
  violations: string[];
  log: string[];
}

/** Deterministic PRNG so a failing chaos run can be replayed with the same seed. */
export function mulberry32(seed: number): () => number {
  let a: number = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t: number = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GAMEPLAY_KEYS: string[] = [
  KEYS.left,
  KEYS.right,
  KEYS.up,
  KEYS.down,
  KEYS.jump,
  KEYS.attack,
  KEYS.revive,
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  KEYS.hpPotion,
  KEYS.mpPotion,
  'Shift',
  'Insert',
  'Home',
  'PageUp',
  'Alt',
  'Delete',
  'End',
  'PageDown',
];
const DIALOG_KEYS: string[] = [
  KEYS.openStats,
  KEYS.openSkills,
  KEYS.openShop,
  KEYS.openInventory,
  'Escape',
];
const VIEWPORTS: Array<{ width: number; height: number }> = [
  { width: 1280, height: 800 },
  { width: 800, height: 600 },
  { width: 1920, height: 1080 },
  { width: 640, height: 900 },
];

/**
 * Random input fuzzer. Mashes keys (down/up/tap), optionally opens dialogs and
 * resizes the window, checking game invariants as it goes. Always releases keys at the end.
 */
export async function runChaos(player: GamePlayer, options: ChaosOptions): Promise<ChaosReport> {
  const rand: () => number = mulberry32(options.seed);
  function pick<T>(items: T[]): T {
    return items[Math.floor(rand() * items.length)];
  }
  const checkEvery: number = options.checkEvery ?? 10;
  const deadline: number = Date.now() + options.durationMs;
  const violations: string[] = [];
  const log: string[] = [];
  let actions: number = 0;

  while (Date.now() < deadline) {
    const roll: number = rand();
    actions++;
    if (options.includeDialogs && roll < 0.06) {
      const key: string = pick(DIALOG_KEYS);
      log.push(`tap ${key}`);
      await player.page.keyboard.press(key);
    } else if (options.includeResize && roll < 0.08) {
      const vp: { width: number; height: number } = pick(VIEWPORTS);
      log.push(`resize ${vp.width}x${vp.height}`);
      await player.page.setViewportSize(vp);
    } else if (roll < 0.55) {
      const key: string = pick(GAMEPLAY_KEYS);
      log.push(`down ${key}`);
      await player.hold(key);
    } else if (roll < 0.9) {
      const key: string = pick(GAMEPLAY_KEYS);
      log.push(`up ${key}`);
      await player.release(key);
    } else if (!(await player.probe.isGameOver())) {
      log.push('mouse click');
      await player.page.mouse.click(200 + rand() * 800, 200 + rand() * 400);
    }
    await player.wait(Math.floor(rand() * 60));

    if (!player.page.url().includes('/game')) {
      violations.push(`[action ${actions}] left the game page: ${player.page.url()}`);
      break;
    }
    if (actions % checkEvery === 0) {
      const s: E2eSnapshot = await player.probe.state();
      for (const v of findInvariantViolations(s, {
        checkPendingQueues: options.checkPendingQueues,
      })) {
        violations.push(`[action ${actions}] ${v}`);
      }
    }
  }

  await player.releaseAll();
  await player.page.setViewportSize({ width: 1280, height: 800 });
  return {
    seed: options.seed,
    actions,
    violations: [...new Set<string>(violations)],
    log: log.slice(-50),
  };
}
