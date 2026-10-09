import { GamePlayer, KEYS } from './game-player';
import { E2eSnapshot } from './probe';
import { WORLD } from './invariants';

/**
 * Level geometry (read live from the probe: every floor is generated) and a tiny route planner:
 * walk, jump up onto a low platform, climb a rope, or drop through a platform. Every step is
 * real key input, so the AI moves like a player.
 */

export interface LevelPlatform {
  name: string;
  x: number;
  y: number;
  width: number;
}

export interface LevelRope {
  x: number;
  topY: number;
  bottomY: number;
}

export const GROUND: LevelPlatform = {
  name: 'ground',
  x: -100,
  y: WORLD.groundY,
  width: WORLD.width + 200,
};

/** This floor's platforms, ground first (from the live collision geometry). */
export function levelPlatforms(s: E2eSnapshot): LevelPlatform[] {
  return [
    GROUND,
    ...s.level.platforms.map(
      (p: { x: number; y: number; width: number }): LevelPlatform => ({
        name: `${p.x},${p.y}`,
        x: p.x,
        y: p.y,
        width: p.width,
      }),
    ),
    // Props are solid: you can stand on their tops too.
    ...s.level.props.map(
      (p: { x: number; y: number; width: number }): LevelPlatform => ({
        name: `prop ${p.x},${p.y}`,
        x: p.x,
        y: p.y,
        width: p.width,
      }),
    ),
  ];
}

/** This floor's ropes (from the live collision geometry). */
export function levelRopes(s: E2eSnapshot): LevelRope[] {
  return s.level.ropes;
}

const FEET_TOLERANCE: number = 8;

function spans(p: LevelPlatform, x: number): boolean {
  return x >= p.x && x <= p.x + p.width;
}

/** Platform whose surface the player stands on right now, or null when airborne/climbing. */
export function currentPlatform(s: E2eSnapshot): LevelPlatform | null {
  const p: E2eSnapshot['player'] = s.player;
  if (!p || p.isClimbing || !p.isGrounded) return null;
  const feet: number = p.y + WORLD.playerHeight;
  return (
    levelPlatforms(s).filter(
      (pl: LevelPlatform): boolean =>
        Math.abs(feet - pl.y) < FEET_TOLERANCE &&
        p.x + WORLD.playerWidth > pl.x &&
        p.x < pl.x + pl.width,
    )[0] ?? null
  );
}

/** The platform directly under x at or below y (the one a stack or player at x rests on). */
export function platformUnder(s: E2eSnapshot, x: number, y: number): LevelPlatform {
  return (
    levelPlatforms(s).filter((pl: LevelPlatform): boolean => pl.y >= y - 1 && spans(pl, x)).sort(
      (a: LevelPlatform, b: LevelPlatform): number => a.y - b.y,
    )[0] ?? GROUND
  );
}

export type NavResult = 'arrived' | 'moving';

/** Highest jump that lands reliably (single jump reaches ~116 px). */
const JUMP_UP_PX: number = 100;
const EDGE_MARGIN_PX: number = 30;

/**
 * One navigation decision toward standing on `target` at `targetX` (call every AI tick).
 * Rules, in order: climb while on a rope; walk once on the target; jump straight up onto a
 * target at most JUMP_UP_PX above; take the rope that tops out on the target (reaching its
 * base first); otherwise drop down through the current platform.
 */
export async function stepToward(
  player: GamePlayer,
  s: E2eSnapshot,
  target: LevelPlatform,
  targetX: number,
): Promise<NavResult> {
  const p: NonNullable<E2eSnapshot['player']> = s.player!;
  const cx: number = p.x + WORLD.playerWidth / 2;
  const here: LevelPlatform | null = currentPlatform(s);

  if (p.isClimbing) {
    await player.hold(KEYS.up);
    return 'moving';
  }
  await player.release(KEYS.up);
  if (!here) return 'moving';

  if (here.name === target.name) {
    const clampedX: number = Math.max(
      target.x + 12,
      Math.min(target.x + target.width - 12, targetX),
    );
    const dx: number = clampedX - cx;
    if (Math.abs(dx) < 10) {
      await stopWalking(player);
      return 'arrived';
    }
    await walk(player, dx);
    return 'moving';
  }

  const rise: number = here.y - target.y;
  if (rise > 0 && rise <= JUMP_UP_PX) {
    const lo: number = Math.max(target.x, here.x) + EDGE_MARGIN_PX;
    const hi: number = Math.min(target.x + target.width, here.x + here.width) - EDGE_MARGIN_PX;
    const underX: number = Math.max(lo, Math.min(hi, cx));
    if (Math.abs(underX - cx) > 8) {
      await walk(player, underX - cx);
      return 'moving';
    }
    await stopWalking(player);
    await player.press(KEYS.jump, 200);
    return 'moving';
  }

  const rope: LevelRope | undefined = levelRopes(s).find(
    (r: LevelRope): boolean => r.topY === target.y && spans(target, r.x),
  );
  if (rise > 0 && rope) {
    const base: LevelPlatform = platformUnder(s, rope.x, rope.bottomY);
    if (here.name === base.name) {
      const dx: number = rope.x - cx;
      if (Math.abs(dx) > 6) {
        await walk(player, dx);
        return 'moving';
      }
      await stopWalking(player);
      await player.hold(KEYS.up);
      return 'moving';
    }
    if (here.y > base.y) return stepToward(player, s, base, rope.x);
  }

  if (here.name !== GROUND.name) {
    // Pressing down on a rope grabs it instead of dropping: step away from ropes first.
    const ropeNear: LevelRope | undefined = levelRopes(s).find(
      (r: LevelRope): boolean => Math.abs(r.x - cx) < 45 && r.topY <= here.y && r.bottomY >= here.y,
    );
    if (ropeNear) {
      const away: number = cx >= ropeNear.x ? 1 : -1;
      const edgeRoom: boolean = away > 0 ? cx + 60 < here.x + here.width : cx - 60 > here.x;
      await walk(player, edgeRoom ? away : -away);
      return 'moving';
    }
    await dropThrough(player);
    return 'moving';
  }
  return 'moving';
}

async function walk(player: GamePlayer, dx: number): Promise<void> {
  await player.release(dx > 0 ? KEYS.left : KEYS.right);
  await player.hold(dx > 0 ? KEYS.right : KEYS.left);
}

async function stopWalking(player: GamePlayer): Promise<void> {
  await player.release(KEYS.left);
  await player.release(KEYS.right);
}

async function dropThrough(player: GamePlayer): Promise<void> {
  await stopWalking(player);
  await player.hold(KEYS.down);
  await player.press(KEYS.jump, 60);
  await player.release(KEYS.down);
}

/**
 * Floors are generated, so tests that need a feature (a rope, a platform on some tier) walk the
 * floors until one has it. Returns the matching snapshot.
 */
export async function goToFloorWhere(
  player: GamePlayer,
  description: string,
  wanted: (s: E2eSnapshot) => boolean,
  maxFloor: number = 10,
): Promise<E2eSnapshot> {
  for (let floor: number = 1; floor <= maxFloor; floor++) {
    if (floor > 1 || (await player.probe.state()).floor !== 1) await player.probe.setFloor(floor);
    const s: E2eSnapshot = await player.probe.waitFor(
      `floor ${floor}`,
      (st: E2eSnapshot): boolean => st.floor === floor,
    );
    if (wanted(s)) return s;
  }
  throw new Error(`no floor up to ${maxFloor} has ${description}`);
}

/**
 * Setup (solo/host): pins the first layout seed whose current floor has what a test needs, and
 * returns the state on it.
 */
export async function layoutWhere(
  player: GamePlayer,
  description: string,
  wanted: (s: E2eSnapshot) => boolean,
  maxSeed: number = 300,
): Promise<E2eSnapshot> {
  for (let seed: number = 1; seed <= maxSeed; seed++) {
    await player.probe.setLayoutSeed(seed);
    const s: E2eSnapshot = await player.probe.state();
    if (s.level.seed === seed && wanted(s)) return s;
  }
  throw new Error(`no layout seed up to ${maxSeed} has ${description}`);
}
