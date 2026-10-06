import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSpringView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { WORLD } from '../../support/invariants';

const SPRING_FLOOR: number = 3;

async function springFloor(p: GamePlayer): Promise<E2eSnapshot> {
  await p.probe.setGodMode(true);
  await p.probe.setFloor(SPRING_FLOOR);
  return p.probe.waitFor(
    'the spring floor',
    (st: E2eSnapshot): boolean => st.floor === SPRING_FLOOR && st.spring !== null,
  );
}

/** Puts the player on the ground beside the lever (screen-center side), facing it. */
async function standAtLever(p: GamePlayer, spring: E2eSpringView): Promise<void> {
  const x: number =
    spring.side === 1
      ? spring.lever.x - WORLD.playerWidth - 4
      : spring.lever.x + spring.lever.width + 4;
  // Face first: the turning key-press walks a step.
  await p.face(spring.side === 1 ? 'right' : 'left');
  await p.probe.teleport(x, WORLD.groundY - WORLD.playerHeight);
  await p.wait(300);
}

/** Drops corpses across the spring until it is charged (they land by normal physics). */
async function chargeSpring(p: GamePlayer, spring: E2eSpringView): Promise<E2eSnapshot> {
  const xs: number[] = [0.25, 0.5, 0.75].map(
    (f: number): number => spring.spring.x + spring.spring.width * f,
  );
  let s: E2eSnapshot = await p.probe.state();
  for (let batch: number = 0; batch < 6 && s.spring!.charge < spring.chargeNeeded; batch++) {
    for (const x of xs) await p.probe.dropCorpses(x, 4);
    await p.wait(3_000);
    s = await p.probe.state();
  }
  return s;
}

test.describe('spring puzzle (floor 3)', { tag: '@solo' }, (): void => {
  test('floor 3: the exit hangs at the top, straight over a solid spring at the screen edge', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await springFloor(p);
    const spring: E2eSpringView = s0.spring!;
    expect(s0.exit.y, 'the exit hangs at the spring floor height').toBe(100);
    expect(spring.spring.x, 'under the whole exit').toBeLessThanOrEqual(s0.exit.x);
    expect(spring.spring.x + spring.spring.width).toBeGreaterThanOrEqual(s0.exit.x + s0.exit.width);
    expect(spring.charge).toBe(0);

    await p.probe.teleport(
      spring.spring.x + spring.spring.width / 2 - WORLD.playerWidth / 2,
      spring.spring.y - 120,
    );
    const landed: E2eSnapshot = await p.probe.waitFor(
      'landed on the spring',
      (st: E2eSnapshot): boolean =>
        st.player!.isGrounded && st.player!.y + WORLD.playerHeight > spring.spring.y - 20,
    );
    expect(landed.player!.y + WORLD.playerHeight, 'stands on the drawn plate').toBe(
      spring.spring.y,
    );
  });

  test('an uncharged lever only jiggles; charge the spring with corpses, pull, hop on: 3-2-1 and up to the exit', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await springFloor(p);
    const spring: E2eSpringView = s0.spring!;

    await standAtLever(p, spring);
    await p.hold(KEYS.attack);
    const jiggled: E2eSnapshot = await p.probe.waitFor(
      'the uncharged lever jiggles',
      (st: E2eSnapshot): boolean => st.spring!.wobbleTicks > 0,
      { timeoutMs: 5_000 },
    );
    await p.release(KEYS.attack);
    expect(jiggled.spring!.countdownTicks, 'no countdown without a charge').toBe(0);

    const charged: E2eSnapshot = await chargeSpring(p, spring);
    expect(charged.spring!.charge, 'corpses on the spring charge it').toBeGreaterThanOrEqual(
      spring.chargeNeeded,
    );
    await p.attachCanvas(testInfo, 'charged spring');

    await standAtLever(p, spring);
    await p.probe.clearVfxLog();
    await p.hold(KEYS.attack);
    await p.probe.waitFor(
      'the pull starts the 3-2-1',
      (st: E2eSnapshot): boolean => st.spring!.countdownTicks > 0,
      { timeoutMs: 5_000 },
    );
    await p.release(KEYS.attack);
    await p.attachCanvas(testInfo, 'countdown');
    // Setup: drop onto the pile on the spring from below the exit (climbing piles is covered elsewhere).
    await p.probe.teleport(
      spring.spring.x + spring.spring.width / 2 - WORLD.playerWidth / 2,
      spring.spring.y - 200,
    );
    const flying: E2eSnapshot = await p.probe.waitFor(
      'the spring launches the player',
      (st: E2eSnapshot): boolean => st.spring!.launches === 1 && st.player!.y < 300,
      { timeoutMs: 8_000 },
    );
    expect(flying.spring!.charge, 'the spring stays charged').toBeGreaterThanOrEqual(
      spring.chargeNeeded,
    );
    const log: E2eVfxLogEntry[] = await p.probe.vfxLog();
    expect(log.some((e: E2eVfxLogEntry): boolean => e.type === 'spring-launch')).toBe(true);

    await p.probe.waitFor(
      'landing on the exit ends the floor',
      (st: E2eSnapshot): boolean => st.floor === SPRING_FLOOR + 1,
      { timeoutMs: 10_000 },
    );
  });
});
