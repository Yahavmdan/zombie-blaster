import { test, expect, RoomFactory } from '../../support/fixtures';
import { CapturedFrame } from '../../support/net-monitor';
import { GamePlayer } from '../../support/game-player';
import { E2eRemotePlayerView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { RoomSession } from '../../support/room';

/**
 * Three players in one room: one of them leaves (a guest quits, or the host's tab closes) and the
 * two who stay keep playing one shared world.
 */

function zombieIds(s: E2eSnapshot): string {
  return s.zombies
    .map((z: E2eZombieView): string => z.id)
    .sort()
    .join('|');
}

function zombiePositions(s: E2eSnapshot): string {
  return s.zombies
    .map((z: E2eZombieView): string => `${z.id}:${Math.round(z.x)}:${Math.round(z.y)}`)
    .sort()
    .join('|');
}

function remoteNames(s: E2eSnapshot): string[] {
  return s.remotePlayers.map((rp: E2eRemotePlayerView): string => rp.name).sort();
}

/** Both screens show the same zombies (the host's world reaches the guest). */
async function expectSameZombies(a: GamePlayer, b: GamePlayer, message: string): Promise<void> {
  await expect
    .poll(
      async (): Promise<boolean> => {
        const [sa, sb]: E2eSnapshot[] = await Promise.all([a.probe.state(), b.probe.state()]);
        return sa.zombies.length > 0 && zombieIds(sa) === zombieIds(sb);
      },
      { timeout: 15_000, message },
    )
    .toBe(true);
}

/** The world on `player`'s screen keeps moving: zombies move, spawn or die. */
async function expectWorldMoves(player: GamePlayer, message: string): Promise<void> {
  const a: E2eSnapshot = await player.probe.waitFor(
    `${player.name} has zombies`,
    (s: E2eSnapshot): boolean => s.zombies.length > 0,
    { timeoutMs: 20_000 },
  );
  await player.wait(1_500);
  const b: E2eSnapshot = await player.probe.state();
  expect(zombiePositions(b), message).not.toBe(zombiePositions(a));
}

test.describe('three-player room', { tag: '@online' }, (): void => {
  test('a guest who quits mid-game is gone for both others, who keep playing', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Stayer', classId: 'mage' },
        { name: 'Quitter', classId: 'ranger' },
      ],
      'quit3',
    );
    const [host, stayer, quitter]: GamePlayer[] = session.players;
    await host.probe.setGodMode(true);
    await stayer.probe.setGodMode(true);

    await quitter.page.getByTestId('game-settings-button-toggle').click();
    await quitter.page.getByTestId('game-settings-button-quit').click();
    await quitter.page.getByTestId('game-settings-button-quit').click();
    await expect(quitter.page.getByTestId('menu-main-button-multiplayer')).toBeVisible();
    expect(await quitter.openGameSocketCount(), 'quitter socket closed').toBe(0);

    await host.probe.waitFor(
      'host sees only the stayer',
      (s: E2eSnapshot): boolean => remoteNames(s).join() === 'Stayer',
      { timeoutMs: 10_000 },
    );
    await stayer.probe.waitFor(
      'stayer sees only the host',
      (s: E2eSnapshot): boolean => remoteNames(s).join() === 'Host',
      { timeoutMs: 10_000 },
    );
    expect((await host.probe.state()).role, 'host is still host').toBe('host');
    expect((await stayer.probe.state()).role, 'stayer is still a guest').toBe('client');

    const syncsBefore: number = stayer.net.ofType('received', 'game-sync').length;
    await expectWorldMoves(host, 'host still simulates the world');
    expect(
      stayer.net.ofType('received', 'game-sync').length,
      'stayer still receives game-sync',
    ).toBeGreaterThan(syncsBefore + 10);
    await expectSameZombies(host, stayer, 'host and stayer show the same zombies');

    // The room is still running for the two who stayed: the quitter finds it, in game, with 2 players.
    await quitter.enterLobby();
    await expect(async (): Promise<void> => {
      await quitter.page.getByTestId('lobby-rooms-button-refresh').click();
      await expect(quitter.roomCard(session.roomName)).toContainText('2 /', { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await expect(quitter.roomCard(session.roomName)).toContainText('In game');
  });

  test('when the host leaves, exactly one guest takes over and the other follows it', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'GuestA', classId: 'assassin' },
        { name: 'GuestB', classId: 'priest' },
      ],
      'migrate3',
    );
    const guests: GamePlayer[] = session.guests;
    for (const g of guests) await g.probe.setGodMode(true);
    await session.host.probe.waitFor('zombies', (s: E2eSnapshot): boolean => s.zombies.length > 0, {
      timeoutMs: 20_000,
    });
    for (const g of guests) g.net.reset();

    await session.host.close();

    await expect
      .poll(
        async (): Promise<number> => {
          const states: E2eSnapshot[] = await Promise.all(
            guests.map((g: GamePlayer): Promise<E2eSnapshot> => g.probe.state()),
          );
          return states.filter((s: E2eSnapshot): boolean => s.role === 'host').length;
        },
        { timeout: 15_000, message: 'a guest is promoted to host' },
      )
      .toBe(1);
    const migratedAt: number = Date.now();
    const roles: E2eSnapshot[] = await Promise.all(
      guests.map((g: GamePlayer): Promise<E2eSnapshot> => g.probe.state()),
    );
    const newHost: GamePlayer =
      guests[roles.findIndex((s: E2eSnapshot): boolean => s.role === 'host')];
    const follower: GamePlayer = guests.find((g: GamePlayer): boolean => g !== newHost)!;
    const newHostId: string = (await newHost.probe.state()).player!.id;

    // The old host is gone; the two who stay still see each other.
    await newHost.probe.waitFor(
      'new host sees only the other guest',
      (s: E2eSnapshot): boolean => remoteNames(s).join() === follower.name,
      { timeoutMs: 10_000 },
    );
    await follower.probe.waitFor(
      'the other guest sees the new host as its only remote player',
      (s: E2eSnapshot): boolean => remoteNames(s).join() === newHost.name,
      { timeoutMs: 10_000 },
    );

    // The world goes on: the new host simulates it, the follower gets it from the new host.
    await expectWorldMoves(newHost, 'new host simulates zombies (they move / spawn)');
    await expectWorldMoves(follower, 'the follower sees the world move');
    await expectSameZombies(newHost, follower, 'new host and follower show the same zombies');
    const syncs: CapturedFrame[] = follower.net.ofType('received', 'game-sync');
    expect(
      syncs.filter(
        (f: CapturedFrame): boolean =>
          (f.payload as { player?: { id?: string } } | null)?.player?.id === newHostId,
      ).length,
      'the follower receives game-sync from the new host',
    ).toBeGreaterThan(10);

    // Still exactly one host a while later: the follower was never promoted too.
    await follower.wait(1_000);
    expect((await follower.probe.state()).role, 'the other guest stays a client').toBe('client');
    expect((await newHost.probe.state()).role).toBe('host');
    expect(
      newHost.net
        .ofType('received', 'game-sync')
        .filter((f: CapturedFrame): boolean => f.at > migratedAt),
      'nobody else sends game-sync to the new host',
    ).toEqual([]);
  });
});
