import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import {
  E2eFloorVerdict,
  E2eGadgetView,
  E2eSnapshot,
  E2eSolverAction,
  E2eSolverMove,
  E2eSolverSpot,
} from '../../support/probe';

/**
 * Every designed floor, played through in the real game the way the floor solver
 * (src/app/testing/floor-solver.ts, unit spec floor-solvability.spec.ts) found: each move's keys go
 * into the engine tick by tick, from the floor's start to its exit, with no teleport and no god
 * mode. Only the bodies are a stand-in: corpses are laid on a button where the solver leaves
 * weight (killing zombies and carrying them there is covered by the carry specs).
 * A new designed floor goes in DESIGNED_FLOORS (stage-puzzle skill, "Designed layouts").
 */
const DESIGNED_FLOORS: number[] = [1, 2, 3, 4];
/** Where a floor starts every player (ZombieSystem.resetPlayerToGround): the middle, on the ground. */
const START_X: number = 624;
/** A move that lands this far from the solver's spot is noted (the replay goes on from where it is). */
const SPOT_SLOP_PX: number = 24;
/** Same as FLOOR_SOLVER_STAND_TICKS (300) at 50 ticks a second. */
const STAND_MS: number = 6_000;
/** Same as FLOOR_SOLVER_SWING_HOLD_TICKS. */
const SWING_HOLD_TICKS: number = 400;
/** The world counts as settled once nothing moved over this many polls in a row. */
const QUIET_POLLS: number = 4;
/** Feet this close to a spot's are on its surface (corpses on a button lift a player a few px). */
const SAME_SURFACE_PX: number = 10;
const POLL_MS: number = 250;
const SETTLE_TIMEOUT_MS: number = 20_000;

function near(a: E2eSolverSpot, b: E2eSolverSpot): boolean {
  return Math.abs(a.x - b.x) <= SPOT_SLOP_PX && Math.abs(a.y - b.y) <= SPOT_SLOP_PX;
}

/** Where every gadget is and how open it is: unchanged over a few polls = settled. */
function motion(s: E2eSnapshot): string {
  return s.gadgets
    .map(
      (g: E2eGadgetView): string =>
        `${g.openTicks}:${g.body ? `${Math.round(g.body.x)},${Math.round(g.body.y)}` : ''}`,
    )
    .join(';');
}

async function settle(p: GamePlayer): Promise<void> {
  let last: string = '';
  let quiet: number = 0;
  const deadline: number = Date.now() + SETTLE_TIMEOUT_MS;
  while (quiet < QUIET_POLLS && Date.now() < deadline) {
    const now: string = motion(await p.probe.state());
    quiet = now === last ? quiet + 1 : 0;
    last = now;
    await p.page.waitForTimeout(POLL_MS);
  }
}

/** On the spot's surface but not quite on it: walks there. */
async function reach(p: GamePlayer, spot: E2eSolverSpot): Promise<void> {
  const at: E2eSnapshot['player'] = (await p.probe.state()).player;
  if (!at || Math.abs(at.y - spot.y) > SAME_SURFACE_PX || Math.abs(at.x - spot.x) <= 2) return;
  await p.probe.walkTo(spot.x);
}

/** Plays the moves; notes each landing off the solver's spot. False once the floor is left. */
async function replay(
  p: GamePlayer,
  floor: number,
  moves: E2eSolverMove[],
  log: string[],
): Promise<boolean> {
  for (const m of moves) {
    if ((await p.probe.state()).floor !== floor) return false;
    await reach(p, m.from);
    const to: E2eSolverSpot = await p.probe.playMove(m);
    if (!near(to, m.to)) {
      log.push(
        `${m.kind} ${m.dir} from (${Math.round(m.from.x)}, ${Math.round(m.from.y)}) landed at (${Math.round(to.x)}, ${Math.round(to.y)}), solver: (${Math.round(m.to.x)}, ${Math.round(m.to.y)})`,
      );
    }
  }
  return (await p.probe.state()).floor === floor;
}

async function act(p: GamePlayer, a: E2eSolverAction): Promise<void> {
  switch (a.kind) {
    case 'hold':
      await p.probe.layCorpsesOn(a.area.x, a.area.y, a.area.width, a.bodies);
      break;
    case 'release':
      await p.probe.clearCorpsesOn(a.area.x, a.area.y, a.area.width);
      break;
    case 'stand':
      await p.page.waitForTimeout(STAND_MS);
      break;
    case 'swing':
      await p.probe.swingFacing(a.dir, 1);
      break;
    case 'swing-on':
      await p.probe.swingFacing(a.dir, SWING_HOLD_TICKS);
      break;
  }
  await settle(p);
}

for (const floor of DESIGNED_FLOORS) {
  test(
    `designed floor ${floor}: a new player plays the solver's way through to the next floor`,
    { tag: '@solo' },
    async ({ solo }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
      test.setTimeout(300_000);
      const p: GamePlayer = await solo('warrior');
      await p.probe.setDesignedFloors(true);
      await p.probe.pauseZombieSpawns(true);
      await p.probe.setFloor(floor);
      await p.probe.waitFor(`floor ${floor}`, (st: E2eSnapshot): boolean => st.floor === floor);
      await p.probe.skipClueScene();
      await p.probe.clearZombies();
      await p.probe.walkTo(START_X);
      await settle(p);

      const verdict: E2eFloorVerdict = await p.probe.solveFloor(floor);
      expect(verdict.solvable, `floor ${floor}: the solver finds no way out`).toBe(true);
      if (verdict.skippable) {
        testInfo.annotations.push({
          type: 'puzzle skipped',
          description: `floor ${floor}: the exit is in reach from the start`,
        });
      }

      const log: string[] = [];
      let onFloor: boolean = true;
      for (const a of verdict.solution) {
        onFloor = await replay(p, floor, a.route, log);
        if (!onFloor) break;
        await reach(p, a.spot);
        await act(p, a);
      }
      if (onFloor && (await replay(p, floor, verdict.exitRoute, log)) && verdict.exitSpot)
        await reach(p, verdict.exitSpot);
      if (log.length > 0)
        testInfo.annotations.push({ type: 'off the solver route', description: log.join('\n') });

      await p.probe.waitFor(
        `floor ${floor} is left (${log.length} landings off the solver's spots: ${log.join('; ')})`,
        (st: E2eSnapshot): boolean => st.floor === floor + 1,
        { timeoutMs: 10_000 },
      );
    },
  );
}
