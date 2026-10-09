import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer, SkyLuma } from '../../support/game-player';
import { RoomSession } from '../../support/room';
import { E2eLightningView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';

const SKY_TOP: number = 0;
const SKY_BOTTOM: number = 300;

/** The host's sky decides when lightning strikes; every guest draws the same bolt and flash. */
test.describe('storm sky in co-op', { tag: ['@online', '@visual'] }, (): void => {
  test('a host strike lights the guest sky with the same bolt', async ({
    room,
  }: {
    room: RoomFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'storm',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await guest.probe.waitFor(
      'no strike yet',
      (s: E2eSnapshot): boolean => s.vfx.lightning === null,
    );
    const calm: SkyLuma = await guest.canvasLuma(SKY_TOP, SKY_BOTTOM);
    await guest.probe.clearVfxLog();

    const guestLit: Promise<SkyLuma> = guest.canvasLuma(SKY_TOP, SKY_BOTTOM, true);
    await host.probe.strikeLightningNow();
    const hostSaw: E2eSnapshot = await host.probe.waitFor(
      'the host strikes',
      (s: E2eSnapshot): boolean => s.vfx.lightning !== null,
      { timeoutMs: 3_000 },
    );
    const lit: SkyLuma = await guestLit;
    await guest.attachCanvas(testInfo, 'guest during the strike');

    const strike: E2eLightningView = hostSaw.vfx.lightning!;
    expect(lit.strike, 'the guest sky struck').not.toBeNull();
    expect({ x: lit.strike!.x, seed: lit.strike!.seed }, 'the same bolt on both screens').toEqual({
      x: strike.x,
      seed: strike.seed,
    });
    const log: E2eVfxLogEntry[] = await guest.probe.vfxLog();
    expect(
      log.some(
        (e: E2eVfxLogEntry): boolean =>
          e.direction === 'replayed' && e.type === 'lightning' && !e.skippedOwn,
      ),
      'the guest replayed the host strike',
    ).toBe(true);
    expect(lit.luma, `guest sky brighter (${lit.strike!.ageMs} ms in)`).toBeGreaterThan(
      calm.luma + 8,
    );
  });
});
