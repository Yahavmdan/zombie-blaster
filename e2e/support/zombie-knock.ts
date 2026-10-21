import { GamePlayer, KEYS } from './game-player';
import { E2eSnapshot, E2eZombieView } from './probe';
import { walkUpTo, zombieById } from './warrior';

/** Mirrors ZOMBIE_KNOCK_MAX_TILT in shared/game-constants.ts: a knocked zombie staggers, never cartwheels. */
export const KNOCK_MAX_TILT: number = 0.7;
/** One tick of turning past the limit is allowed (it stops turning once over it). */
export const KNOCK_TILT_SLACK: number = 0.1;

/** Swings at the zombie until a hit knocks it (a press can fall between ticks or land on cooldown). */
export async function knockIt(p: GamePlayer, id: string): Promise<void> {
  for (let attempt: number = 0; attempt < 4; attempt++) {
    await walkUpTo(p, id);
    await p.press(KEYS.attack, 70);
    try {
      await p.probe.waitFor(
        'the hit knocks the zombie',
        (s: E2eSnapshot): boolean => (zombieById(s, id)?.knockbackFrames ?? 0) > 0,
        { timeoutMs: 1_000, intervalMs: 10 },
      );
      return;
    } catch {
      // Missed: swing again.
    }
  }
  throw new Error('no swing knocked the zombie');
}

/** Watches `watcher`'s view of the knocked zombie until it stands upright again: the most it tilted. */
export async function peakTilt(watcher: GamePlayer, id: string): Promise<number> {
  let most: number = 0;
  await watcher.probe.waitFor(
    'the knocked zombie flies tilted and stands back up',
    (s: E2eSnapshot): boolean => {
      const z: E2eZombieView | undefined = zombieById(s, id);
      if (!z) return false;
      most = Math.max(most, Math.abs(z.angle));
      return most > 0 && z.isGrounded && z.angle === 0;
    },
    { timeoutMs: 6_000, intervalMs: 10 },
  );
  return most;
}
