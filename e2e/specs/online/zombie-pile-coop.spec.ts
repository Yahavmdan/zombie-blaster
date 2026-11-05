import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot } from '../../support/probe';
import { zombiePileRoom } from '../../support/gadget-layouts';

const BODIES: number = 6;
const PILE_X: number = 236;

function ids(s: E2eSnapshot): string[] {
  return s.corpseViews.map((c: E2eCorpseView): string => c.id).sort();
}

test.describe('zombie pile in co-op', { tag: '@online' }, (): void => {
  test('the host lays the pile once: the guest sees the same bodies', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'zombiepile',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.pauseZombieSpawns(true);
    await host.probe.clearZombies();
    const layout: string = zombiePileRoom(PILE_X, BODIES);
    await guest.probe.loadLayout(layout);
    await host.probe.loadLayout(layout);

    const hosted: E2eSnapshot = await host.probe.waitFor(
      'the host laid the pile',
      (s: E2eSnapshot): boolean =>
        s.corpseViews.length === BODIES &&
        s.corpseViews.every((c: E2eCorpseView): boolean => c.isGrounded),
      { timeoutMs: 10_000 },
    );
    const seen: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees the same bodies',
      (s: E2eSnapshot): boolean => s.corpseViews.length === BODIES,
      { timeoutMs: 10_000 },
    );
    expect(ids(seen)).toEqual(ids(hosted));
  });
});
