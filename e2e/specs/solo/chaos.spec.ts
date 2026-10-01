import { Page, TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { ChaosReport, runChaos } from '../../support/chaos';
import { runBot } from '../../support/bot';
import { E2eSnapshot } from '../../support/probe';
import { PENDING_QUEUE_LIMIT, findInvariantViolations } from '../../support/invariants';

/** Counts requestAnimationFrame callbacks over `ms` to estimate the render rate. */
async function measureFps(page: Page, ms: number): Promise<number> {
  return page.evaluate(async (duration: number): Promise<number> => {
    let frames: number = 0;
    const start: number = performance.now();
    await new Promise<void>((resolve: () => void): void => {
      const step: () => void = (): void => {
        frames++;
        if (performance.now() - start < duration) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    return (frames * 1000) / (performance.now() - start);
  }, ms);
}

/** A queue drained every 50 ms sync tick never holds more than a handful of events. */
const DRAINED_QUEUE_MAX: number = 50;

async function attachChaos(testInfo: TestInfo, report: ChaosReport): Promise<void> {
  await testInfo.attach(`chaos seed ${report.seed}`, {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
}

test.describe('chaos: try to break the game', { tag: ['@solo', '@chaos'] }, (): void => {
  for (const seed of [1, 7, 42]) {
    test(`random input mashing keeps the world sane (seed ${seed})`, async ({
      solo,
    }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
      const player: GamePlayer = await solo(
        seed === 7 ? 'assassin' : seed === 42 ? 'mage' : 'warrior',
      );
      await player.probe.maxOutPlayer();
      await player.probe.setGodMode(true);
      const report: ChaosReport = await runChaos(player, {
        seed,
        durationMs: 25_000,
        checkPendingQueues: false,
      });
      await attachChaos(testInfo, report);
      await player.attachCanvas(testInfo, 'after chaos');
      expect(report.violations, `invariants broken (replay with seed ${seed})`).toEqual([]);
    });
  }

  test('dialog + resize storm while playing', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const player: GamePlayer = await solo('priest');
    await player.probe.setGodMode(true);
    const report: ChaosReport = await runChaos(player, {
      seed: 99,
      durationMs: 20_000,
      includeDialogs: true,
      includeResize: true,
      checkPendingQueues: false,
    });
    await attachChaos(testInfo, report);
    expect(report.violations).toEqual([]);
    await player.page.keyboard.press('Escape');
    await player.page.keyboard.press('Escape');
    const before: E2eSnapshot = await player.probe.state();
    // Walk toward open space: chaos can leave the player pressed against a wall.
    if (before.player!.x > 640) await player.moveLeft(400);
    else await player.moveRight(400);
    const after: E2eSnapshot = await player.probe.state();
    expect(
      Math.abs(after.player!.x - before.player!.x),
      `controls still respond after the storm: ${JSON.stringify({
        x: Math.round(before.player!.x),
        attacking: after.player!.isAttacking,
        climbing: after.player!.isClimbing,
        grounded: after.player!.isGrounded,
        down: after.player!.isDown,
        vx: after.player!.velocityX,
        hp: after.player!.hp,
      })}`,
    ).toBeGreaterThan(5);
  });

  test('mortal chaos: invariants hold through death and game over', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const player: GamePlayer = await solo('ranger');
    await player.probe.setFloor(8);
    const report: ChaosReport = await runChaos(player, {
      seed: 1234,
      durationMs: 25_000,
      checkPendingQueues: false,
    });
    await attachChaos(testInfo, report);
    expect(report.violations).toEqual([]);
  });

  test('frame rate stays playable during heavy skill spam', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const player: GamePlayer = await solo('mage');
    await player.probe.maxOutPlayer();
    await player.probe.setGodMode(true);
    await player.probe.setFloor(10);
    const spam: Promise<ChaosReport> = runChaos(player, {
      seed: 5,
      durationMs: 8_000,
      checkPendingQueues: false,
    });
    await player.wait(2_000);
    const fps: number = await measureFps(player.page, 3_000);
    await spam;
    await testInfo.attach('fps', { body: String(Math.round(fps)), contentType: 'text/plain' });
    expect(fps, 'render loop keeps >= 25 fps in headless Chrome').toBeGreaterThanOrEqual(25);
  });

  test('outbound multiplayer queues do not grow forever in single player', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setGodMode(true);
    await player.probe.setFloor(3);
    await runBot(player, { durationMs: 40_000, useSkills: true });
    const s: E2eSnapshot = await player.probe.state();
    await testInfo.attach('pending queues', {
      body: JSON.stringify(s.pending, null, 2),
      contentType: 'application/json',
    });
    const leaks: string[] = findInvariantViolations(s).filter((v: string): boolean =>
      v.startsWith('pending.'),
    );
    expect(leaks, `pending queues must stay under ${PENDING_QUEUE_LIMIT}`).toEqual([]);
    expect(
      s.pending.vfxEvents,
      'a drained queue holds at most a few ticks of events; in solo nothing drains it',
    ).toBeLessThan(DRAINED_QUEUE_MAX);
  });
});
