import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { BotReport, runBot } from '../../support/bot';
import { E2eSnapshot, E2eVfxLogEntry, E2eZombieView } from '../../support/probe';
import { typesOf, vfxQueuedBy } from '../../support/vfx-gate';

test.describe('combat', { tag: '@solo' }, (): void => {
  test('bot hunts and kills zombies; kills yield corpses and score', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setGodMode(true);
    await player.probe.waitFor(
      'zombies spawned',
      (s: E2eSnapshot): boolean => s.zombies.some((z: E2eZombieView): boolean => z.spawnTimer <= 0),
      { timeoutMs: 20_000 },
    );

    const report: BotReport = await runBot(player, { durationMs: 60_000, stopAfterKills: 3 });
    await testInfo.attach('bot report', {
      body: JSON.stringify({ ...report, finalState: undefined }, null, 2),
      contentType: 'application/json',
    });
    await player.attachCanvas(testInfo, 'after bot run');

    expect(report.kills, 'bot should kill at least one zombie').toBeGreaterThanOrEqual(1);
    expect(report.attacks).toBeGreaterThan(0);
  });

  test('a landed hit queues hit particles, damage number and hit mark for other players', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setGodMode(true);
    await player.probe.waitFor(
      'zombies spawned',
      (s: E2eSnapshot): boolean => s.zombies.some((z: E2eZombieView): boolean => z.spawnTimer <= 0),
      { timeoutMs: 20_000 },
    );

    let queued: E2eVfxLogEntry[] = [];
    await expect(async (): Promise<void> => {
      queued = await vfxQueuedBy(
        player,
        async (): Promise<void> => {
          await runBot(player, { durationMs: 3_000 });
        },
        100,
      );
      expect(typesOf(queued)).toEqual(
        expect.arrayContaining(['damage-number', 'hit-mark', 'hit-particles']),
      );
    }).toPass({ timeout: 45_000 });
  });

  test('dying in solo shows game over, and retry restarts from floor 1', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const player: GamePlayer = await solo('mage');
    await player.probe.setGodMode(false);

    const deadline: number = Date.now() + 120_000;
    while (Date.now() < deadline && !(await player.probe.isGameOver())) {
      const s: E2eSnapshot = await player.probe.state();
      const target: E2eZombieView | undefined = s.zombies.find(
        (z: E2eZombieView): boolean => !z.isDead && z.spawnTimer <= 0,
      );
      if (target) {
        await player.probe.teleport(target.x, target.y + target.height - 48);
      }
      await player.wait(700);
    }
    await player.attachCanvas(testInfo, 'game over');
    expect(
      await player.probe.isGameOver(),
      'player should eventually die while standing in zombies',
    ).toBe(true);
    await expect(player.page.getByTestId('game-gameover-button-retry')).toBeVisible();

    await player.page.getByTestId('game-gameover-button-retry').click();
    const fresh: E2eSnapshot = await player.probe.waitFor(
      'respawned',
      (s: E2eSnapshot): boolean => s.player !== null && !s.player.isDead,
    );
    expect(fresh.floor).toBe(1);
    expect(fresh.player!.level).toBe(1);
    expect(fresh.player!.hp).toBe(fresh.player!.maxHp);
    expect(await player.probe.isGameOver()).toBe(false);
  });
});
