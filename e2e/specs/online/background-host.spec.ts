import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { RoomSession } from '../../support/room';
import { BotReport, runBot } from '../../support/bot';
import { E2eSnapshot, E2eZombieView } from '../../support/probe';

function zombiePositions(s: E2eSnapshot): string {
  return s.zombies
    .map((z: E2eZombieView): string => `${z.id}:${Math.round(z.x)}:${Math.round(z.y)}`)
    .sort()
    .join('|');
}

/** How many different zombie layouts the player sees while sampling every 100 ms for `ms`. */
async function distinctWorldsOver(player: GamePlayer, ms: number): Promise<number> {
  const seen: Set<string> = new Set<string>();
  const end: number = Date.now() + ms;
  while (Date.now() < end) {
    seen.add(zombiePositions(await player.probe.state()));
    await player.wait(100);
  }
  return seen.size;
}

test.describe('host tab in the background', { tag: '@online' }, (): void => {
  test('the guest keeps playing while the host has another tab open', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'bgtab',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await guest.probe.waitFor(
      'zombies on the guest',
      (s: E2eSnapshot): boolean => s.zombies.length > 0,
      {
        timeoutMs: 20_000,
      },
    );

    // Walking while switching tabs: the key-up never reaches the game.
    await host.hold(KEYS.right);
    await host.wait(150);
    await host.setBackgroundTab(true);
    await guest.wait(1_500);

    const hostXBefore: number = (await host.probe.state()).player!.x;
    const worlds: number = await distinctWorldsOver(guest, 3_000);
    expect(worlds, 'the guest sees the zombies keep moving (~30 samples)').toBeGreaterThanOrEqual(
      15,
    );
    const hostXAfter: number = (await host.probe.state()).player!.x;
    expect(
      Math.abs(hostXAfter - hostXBefore),
      'the host stopped walking when leaving the tab',
    ).toBeLessThan(5);
    await host.release(KEYS.right);

    const report: BotReport = await runBot(guest, { durationMs: 25_000, stopAfterKills: 1 });
    expect(
      report.kills,
      'the guest still kills zombies: the hidden host applies the hits',
    ).toBeGreaterThanOrEqual(1);

    await host.setBackgroundTab(false);
    const hostWorlds: number = await distinctWorldsOver(host, 2_000);
    expect(hostWorlds, 'the host plays on normally once back on the tab').toBeGreaterThanOrEqual(
      10,
    );
  });
});
