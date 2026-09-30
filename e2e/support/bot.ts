import { GamePlayer, KEYS } from './game-player';
import { E2eSnapshot, E2eZombieView } from './probe';

export interface BotOptions {
  durationMs: number;
  /** Stop early once this many zombies died (0 = run full duration). */
  stopAfterKills?: number;
  /** Also cast skills 1..6 when off cooldown. */
  useSkills?: boolean;
  /** Called every decision tick; return false to stop. */
  onTick?: (s: E2eSnapshot) => boolean | void;
}

export interface BotReport {
  decisions: number;
  attacks: number;
  skillCasts: number;
  kills: number;
  seenZombieIds: number;
  finalState: E2eSnapshot;
}

const ATTACK_REACH_X: number = 55;
const SAME_LEVEL_Y: number = 70;
const DECISION_MS: number = 120;

function nearestZombie(s: E2eSnapshot): E2eZombieView | null {
  const p: E2eSnapshot['player'] = s.player;
  if (!p) return null;
  let best: E2eZombieView | null = null;
  let bestScore: number = Infinity;
  for (const z of s.zombies) {
    if (z.isDead || z.spawnTimer > 0) continue;
    const dx: number = Math.abs(z.x + z.width / 2 - (p.x + 16));
    const dy: number = Math.abs(z.y + z.height - (p.y + 48));
    const score: number = dx + dy * 3;
    if (score < bestScore) {
      bestScore = score;
      best = z;
    }
  }
  return best;
}

/**
 * A simple "hunt the nearest zombie" player. Plays through real key presses:
 * walks toward the target, faces it, attacks, jumps when the target is above.
 */
export async function runBot(player: GamePlayer, options: BotOptions): Promise<BotReport> {
  const deadline: number = Date.now() + options.durationMs;
  const aliveIds: Set<string> = new Set<string>();
  const seenIds: Set<string> = new Set<string>();
  let kills: number = 0;
  let decisions: number = 0;
  let attacks: number = 0;
  let skillCasts: number = 0;
  let state: E2eSnapshot = await player.probe.state();

  while (Date.now() < deadline) {
    state = await player.probe.state();
    decisions++;

    const currentIds: Set<string> = new Set<string>(
      state.zombies
        .filter((z: E2eZombieView): boolean => !z.isDead)
        .map((z: E2eZombieView): string => z.id),
    );
    for (const id of aliveIds) {
      if (!currentIds.has(id)) kills++;
    }
    aliveIds.clear();
    for (const id of currentIds) {
      aliveIds.add(id);
      seenIds.add(id);
    }

    if (options.onTick && options.onTick(state) === false) break;
    if (options.stopAfterKills && kills >= options.stopAfterKills) break;

    const p: E2eSnapshot['player'] = state.player;
    const target: E2eZombieView | null = nearestZombie(state);
    if (!p || p.isDead || p.isDown || !target) {
      await player.releaseAll();
      await player.wait(DECISION_MS);
      continue;
    }

    const playerCx: number = p.x + 16;
    const targetCx: number = target.x + target.width / 2;
    const dx: number = targetCx - playerCx;
    const dy: number = target.y + target.height - (p.y + 48);
    const wantFacing: string = dx >= 0 ? 'right' : 'left';

    if (Math.abs(dx) > ATTACK_REACH_X || Math.abs(dy) > SAME_LEVEL_Y) {
      await player.release(KEYS.attack);
      await player.release(dx >= 0 ? KEYS.left : KEYS.right);
      await player.hold(dx >= 0 ? KEYS.right : KEYS.left);
      if (dy < -SAME_LEVEL_Y && p.isGrounded) {
        await player.press(KEYS.jump, 60);
      }
    } else {
      await player.release(KEYS.left);
      await player.release(KEYS.right);
      if (p.facing !== wantFacing) {
        await player.face(wantFacing === 'left' ? 'left' : 'right');
      }
      await player.hold(KEYS.attack);
      attacks++;
      if (options.useSkills) {
        const ready: E2eSnapshot['usableSkills'] = state.usableSkills.filter(
          (sk: E2eSnapshot['usableSkills'][number]): boolean =>
            sk.cooldownTicks === 0 && sk.mechanic === 'damage',
        );
        if (ready.length > 0) {
          await player.castSkill(ready[0].slot);
          skillCasts++;
        }
      }
    }
    await player.wait(DECISION_MS);
  }

  await player.releaseAll();
  return { decisions, attacks, skillCasts, kills, seenZombieIds: seenIds.size, finalState: state };
}
