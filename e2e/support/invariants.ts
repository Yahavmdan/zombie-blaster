import { E2eSnapshot, E2eZombieView } from './probe';

/** Mirrors shared/game-constants.ts. Update here if the world size changes. */
export const WORLD: {
  width: number;
  height: number;
  groundY: number;
  playerWidth: number;
  playerHeight: number;
  maxParticles: number;
} = {
  width: 1280,
  height: 720,
  groundY: 620,
  playerWidth: 32,
  playerHeight: 48,
  maxParticles: 400,
};

/**
 * Upper bound for any "pending" outbound queue. They are drained every 50 ms sync
 * tick in multiplayer; anything bigger means nobody drains them (leak).
 */
export const PENDING_QUEUE_LIMIT: number = 300;

const MARGIN: number = 200;

function isFiniteNumber(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}

export interface InvariantOptions {
  /** Check outbound multiplayer queues for unbounded growth (default true). */
  checkPendingQueues?: boolean;
}

/**
 * Returns human-readable violations of rules that must always hold, whatever the
 * player does. Empty array = sane. Use after every chaos step.
 */
export function findInvariantViolations(s: E2eSnapshot, options: InvariantOptions = {}): string[] {
  const out: string[] = [];
  const p: E2eSnapshot['player'] = s.player;
  if (!p) {
    out.push('player is null');
    return out;
  }
  for (const [key, value] of Object.entries({
    x: p.x,
    y: p.y,
    vx: p.velocityX,
    vy: p.velocityY,
    hp: p.hp,
    mp: p.mp,
  })) {
    if (!isFiniteNumber(value)) out.push(`player.${key} is not finite (${value})`);
  }
  if (p.x < -MARGIN || p.x > WORLD.width + MARGIN) out.push(`player.x out of world: ${p.x}`);
  if (p.y < -MARGIN * 2 || p.y > WORLD.height + MARGIN) out.push(`player.y out of world: ${p.y}`);
  if (p.hp < 0) out.push(`player.hp negative: ${p.hp}`);
  if (p.hp > p.maxHp + 1) out.push(`player.hp ${p.hp} > maxHp ${p.maxHp}`);
  if (p.mp < 0) out.push(`player.mp negative: ${p.mp}`);
  if (p.mp > p.maxMp + 1) out.push(`player.mp ${p.mp} > maxMp ${p.maxMp}`);
  if (p.isDead && p.isDown) out.push('player is both dead and down');

  for (const z of s.zombies) {
    if (!isFiniteNumber(z.x) || !isFiniteNumber(z.y) || !isFiniteNumber(z.hp)) {
      out.push(`zombie ${z.id} has non-finite state x=${z.x} y=${z.y} hp=${z.hp}`);
    }
    if (z.y > WORLD.height + MARGIN) out.push(`zombie ${z.id} fell out of the world (y=${z.y})`);
  }
  const ids: string[] = s.zombies.map((z: E2eZombieView): string => z.id);
  if (new Set<string>(ids).size !== ids.length) out.push('duplicate zombie ids');

  if (s.vfx.particles > WORLD.maxParticles)
    out.push(`particles ${s.vfx.particles} > cap ${WORLD.maxParticles}`);
  if (!isFiniteNumber(s.floor) || s.floor < 1) out.push(`invalid floor ${s.floor}`);

  const checkQueues: boolean = options.checkPendingQueues ?? true;
  for (const [queue, length] of checkQueues ? Object.entries(s.pending) : []) {
    if (length > PENDING_QUEUE_LIMIT)
      out.push(`pending.${queue} grew to ${length} (never drained?)`);
  }
  return out;
}
