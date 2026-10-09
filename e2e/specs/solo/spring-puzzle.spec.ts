import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSpringView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { WORLD } from '../../support/invariants';

const SPRING_FLOOR: number = 3;
/** A player's own weight (GAME_CONSTANTS.PLAYER_WEIGHT_KG). */
const PLAYER_KG: number = 80;

async function springFloor(p: GamePlayer): Promise<E2eSnapshot> {
  await p.probe.setGodMode(true);
  await p.probe.setFloor(SPRING_FLOOR);
  return p.probe.waitFor(
    'the spring floor',
    (st: E2eSnapshot): boolean => st.floor === SPRING_FLOOR && st.spring !== null,
  );
}

/** Puts the player on the ground beside the button (screen-center side), facing it. */
async function standAtButton(p: GamePlayer, spring: E2eSpringView): Promise<void> {
  const x: number =
    spring.side === 1
      ? spring.button.x - WORLD.playerWidth - 4
      : spring.button.x + spring.button.width + 4;
  // Face first: the turning key-press walks a step.
  await p.face(spring.side === 1 ? 'right' : 'left');
  await p.probe.teleport(x, WORLD.groundY - WORLD.playerHeight);
  await p.wait(300);
}

/** Drops corpses onto the scale's pan until it holds enough (they land by normal physics). */
async function loadScale(p: GamePlayer, spring: E2eSpringView): Promise<E2eSnapshot> {
  const cx: number = spring.scale.x + spring.scale.width / 2;
  let s: E2eSnapshot = await p.probe.state();
  for (let batch: number = 0; batch < 6 && s.spring!.scaleKg < spring.scaleKgNeeded; batch++) {
    await p.probe.dropCorpses(cx, 6);
    await p.wait(3_000);
    s = await p.probe.state();
  }
  return s;
}

test.describe('spring puzzle (floor 3)', { tag: '@solo' }, (): void => {
  test('floor 3: the exit hangs at the top over a solid spring; the scale lies in the ground on the far side and weighs the player', async ({
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
    expect(spring.scale.y, 'the pan is flush with the ground').toBe(WORLD.groundY);
    const panCenter: number = spring.scale.x + spring.scale.width / 2;
    expect(Math.sign(panCenter - WORLD.width / 2), 'the scale is on the far half').toBe(-spring.side);
    expect(spring.buttonTicks, 'the button starts sunk').toBe(0);

    await p.probe.teleport(
      panCenter - WORLD.playerWidth / 2,
      WORLD.groundY - WORLD.playerHeight - 20,
    );
    const weighed: E2eSnapshot = await p.probe.waitFor(
      'the scale weighs the player',
      (st: E2eSnapshot): boolean => st.player!.isGrounded && st.spring!.scaleKg >= PLAYER_KG,
    );
    expect(weighed.spring!.buttonTicks, 'one player is far too light').toBe(0);

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

  test('a sunk button does nothing; load the scale with corpses, the cable raises the button, hit it, hop on: 3-2-1 and up to the exit', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await springFloor(p);
    const spring: E2eSpringView = s0.spring!;

    await standAtButton(p, spring);
    await p.hold(KEYS.attack);
    await p.wait(1_500);
    await p.release(KEYS.attack);
    const idle: E2eSnapshot = await p.probe.state();
    expect(idle.spring!.countdownTicks, 'no countdown while the button is sunk').toBe(0);

    const loaded: E2eSnapshot = await loadScale(p, spring);
    expect(loaded.spring!.scaleKg, 'corpses on the pan weigh it down').toBeGreaterThanOrEqual(
      spring.scaleKgNeeded,
    );
    const up: E2eSnapshot = await p.probe.waitFor(
      'the cable pulls the button fully up',
      (st: E2eSnapshot): boolean => st.spring!.buttonTicks >= spring.buttonRiseTicks,
      { timeoutMs: 10_000 },
    );
    expect(up.spring!.countdownTicks).toBe(0);
    await p.attachCanvas(testInfo, 'loaded scale, button up');

    await standAtButton(p, spring);
    await p.probe.clearVfxLog();
    await p.hold(KEYS.attack);
    await p.probe.waitFor(
      'the press starts the 3-2-1',
      (st: E2eSnapshot): boolean => st.spring!.countdownTicks > 0,
      { timeoutMs: 5_000 },
    );
    await p.release(KEYS.attack);
    await p.attachCanvas(testInfo, 'countdown');
    // Setup: drop onto the spring from below the exit (walking there is covered elsewhere).
    await p.probe.teleport(
      spring.spring.x + spring.spring.width / 2 - WORLD.playerWidth / 2,
      spring.spring.y - 200,
    );
    await p.probe.waitFor(
      'the spring launches the player',
      (st: E2eSnapshot): boolean => st.spring!.launches === 1 && st.player!.y < 300,
      { timeoutMs: 8_000 },
    );
    const log: E2eVfxLogEntry[] = await p.probe.vfxLog();
    expect(log.some((e: E2eVfxLogEntry): boolean => e.type === 'spring-launch')).toBe(true);
    const after: E2eSnapshot = await p.probe.state();
    expect(after.spring!.scaleKg, 'the launch leaves the scale loaded').toBeGreaterThanOrEqual(
      spring.scaleKgNeeded,
    );

    await p.probe.waitFor(
      'landing on the exit ends the floor',
      (st: E2eSnapshot): boolean => st.floor === SPRING_FLOOR + 1,
      { timeoutMs: 10_000 },
    );
  });
});
