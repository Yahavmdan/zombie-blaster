import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, SkyLuma } from '../../support/game-player';
import { E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { typesOf, vfxQueuedBy } from '../../support/vfx-gate';

/** The sky band above the play area: clouds, moon and the refinery's top. */
const SKY_TOP: number = 0;
const SKY_BOTTOM: number = 300;

test.describe('storm sky', { tag: '@solo' }, (): void => {
  test('lightning lights up the sky, queues its event for other players, then fades', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setGodMode(true);
    await player.probe.waitFor(
      'no strike yet',
      (s: E2eSnapshot): boolean => s.vfx.lightning === null,
    );
    const calm: SkyLuma = await player.canvasLuma(SKY_TOP, SKY_BOTTOM);
    await player.attachCanvas(testInfo, 'calm');

    let lit: SkyLuma = { luma: 0, strike: null };
    const queued: E2eVfxLogEntry[] = await vfxQueuedBy(player, async (): Promise<void> => {
      await player.probe.strikeLightningNow();
      lit = await player.canvasLuma(SKY_TOP, SKY_BOTTOM, true);
      await player.attachCanvas(testInfo, 'strike');
    });

    expect(typesOf(queued), 'the strike is queued for other players').toContain('lightning');
    expect(lit.strike, 'a strike lit the sky').not.toBeNull();
    expect(lit.luma, `sky brighter during the strike (${lit.strike?.ageMs} ms in)`).toBeGreaterThan(
      calm.luma + 8,
    );
    await player.probe.waitFor(
      'the strike fades',
      (s: E2eSnapshot): boolean => s.vfx.lightning === null,
      { timeoutMs: 3_000 },
    );
  });
});
