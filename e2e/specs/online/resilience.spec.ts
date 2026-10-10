import { ConsoleMessage } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { RoomSession } from '../../support/room';
import { E2eSnapshot, E2eVfxLogEntry, E2eZombieView } from '../../support/probe';

function zombiePositions(s: E2eSnapshot): string {
  return s.zombies
    .map((z: E2eZombieView): string => `${z.id}:${Math.round(z.x)}:${Math.round(z.y)}`)
    .sort()
    .join('|');
}

test.describe('connection resilience', { tag: '@online' }, (): void => {
  test('when the host leaves, the guest becomes host and the world keeps running', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'migrate',
    );
    const guest: GamePlayer = session.guests[0];
    await guest.probe.setGodMode(true);
    await session.host.probe.waitFor('zombies', (s: E2eSnapshot): boolean => s.zombies.length > 0, {
      timeoutMs: 20_000,
    });

    await session.host.close();
    await guest.probe.waitFor(
      'guest promoted to host',
      (s: E2eSnapshot): boolean => s.role === 'host',
      { timeoutMs: 15_000 },
    );
    await guest.probe.waitFor(
      'host gone from remote players',
      (s: E2eSnapshot): boolean => s.remotePlayers.length === 0,
      { timeoutMs: 10_000 },
    );

    const a: E2eSnapshot = await guest.probe.waitFor(
      'zombies after migration',
      (s: E2eSnapshot): boolean => s.zombies.length > 0,
      { timeoutMs: 20_000 },
    );
    await guest.wait(1_500);
    const b: E2eSnapshot = await guest.probe.state();
    expect(zombiePositions(b), 'new host simulates zombies (they move / spawn)').not.toBe(
      zombiePositions(a),
    );
  });

  test('when a guest leaves, the host drops them and continues', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'priest' },
        { name: 'Guest', classId: 'ranger' },
      ],
      'leave',
    );
    await session.guests[0].close();
    await session.host.probe.waitFor(
      'guest removed',
      (s: E2eSnapshot): boolean => s.remotePlayers.length === 0,
      { timeoutMs: 10_000 },
    );
    expect((await session.host.probe.state()).role).toBe('host');
  });

  test('a guest whose connection drops reconnects and is still synced', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'mage' },
      ],
      'reconnect',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await guest.probe.setGodMode(true);

    await guest.dropConnection();
    await expect
      .poll(async (): Promise<number> => guest.openGameSocketCount(), {
        timeout: 20_000,
        message: 'guest auto-reconnects',
      })
      .toBeGreaterThan(0);
    await expect
      .poll((): number => guest.net.ofType('received', 'reconnect-result').length, {
        timeout: 10_000,
        message: 'server answered the session resume',
      })
      .toBeGreaterThan(0);
    const result: unknown = guest.net.ofType('received', 'reconnect-result')[0].payload;
    expect(result, 'session resume succeeded').toMatchObject({ success: true });

    await host.probe.waitFor(
      'host sees the guest again',
      (s: E2eSnapshot): boolean => s.remotePlayers.length === 1,
      { timeoutMs: 15_000 },
    );
    await guest.probe.waitFor(
      'guest receives world state again',
      (s: E2eSnapshot): boolean => s.remotePlayers.length === 1,
      { timeoutMs: 15_000 },
    );
    const beforeFrames: number = guest.net.ofType('received', 'game-sync').length;
    await guest.wait(1_000);
    expect(
      guest.net.ofType('received', 'game-sync').length,
      'game-sync flows after reconnect',
    ).toBeGreaterThan(beforeFrames + 5);
  });

  test('after reconnecting, zombies can still hurt the guest', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'mage' },
      ],
      'recon-dmg',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await host.probe.setGodMode(true);

    await guest.dropConnection();
    await expect
      .poll((): number => guest.net.ofType('received', 'reconnect-result').length, {
        timeout: 25_000,
      })
      .toBeGreaterThan(0);
    await host.probe.waitFor(
      'host sees guest again',
      (s: E2eSnapshot): boolean => s.remotePlayers.length === 1,
      { timeoutMs: 15_000 },
    );

    const startHp: number = (await guest.probe.state()).player!.hp;
    const deadline: number = Date.now() + 60_000;
    let hurt: boolean = false;
    while (!hurt && Date.now() < deadline) {
      const h: E2eSnapshot = await host.probe.state();
      const z: E2eZombieView | undefined = h.zombies.find(
        (zz: E2eZombieView): boolean => !zz.isDead && zz.spawnTimer <= 0,
      );
      if (z) await guest.probe.teleport(z.x, z.y + z.height - 48);
      await guest.wait(800);
      hurt = (await guest.probe.state()).player!.hp < startHp;
    }
    expect(
      hurt,
      'reconnected guest (new server id) is still targetable by host-simulated zombies',
    ).toBe(true);
  });

  test('a host whose connection drops comes back as a guest, in sync with the new host', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'host-recon',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.waitFor('zombies', (s: E2eSnapshot): boolean => s.zombies.length > 0, {
      timeoutMs: 20_000,
    });

    await host.dropConnection();
    await guest.probe.waitFor('guest promoted to host', (s: E2eSnapshot): boolean => s.role === 'host', {
      timeoutMs: 15_000,
    });
    await expect
      .poll((): number => host.net.ofType('received', 'reconnect-result').length, {
        timeout: 25_000,
        message: 'old host resumes its session',
      })
      .toBeGreaterThan(0);
    await host.probe.waitFor('old host now runs as a guest', (s: E2eSnapshot): boolean => s.role === 'client', {
      timeoutMs: 10_000,
    });

    // One world: the old host shows the zombies the new host simulates.
    const zombieIds: (s: E2eSnapshot) => string = (s: E2eSnapshot): string =>
      s.zombies
        .map((z: E2eZombieView): string => z.id)
        .sort()
        .join('|');
    await expect
      .poll(
        async (): Promise<boolean> => {
          const [a, b]: E2eSnapshot[] = await Promise.all([host.probe.state(), guest.probe.state()]);
          return a.zombies.length > 0 && zombieIds(a) === zombieIds(b);
        },
        { timeout: 15_000, message: 'old host and new host show the same zombies' },
      )
      .toBe(true);
  });

  test('leaving a multiplayer game for the menu ends the connection and the session', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'mage' },
      ],
      'menu-exit',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await guest.probe.showGameOver();
    await guest.page.getByTestId('game-gameover-button-menu').click();
    await host.probe.waitFor('host sees the guest leave', (s: E2eSnapshot): boolean => s.remotePlayers.length === 0, {
      timeoutMs: 10_000,
    });
    await expect
      .poll(async (): Promise<number> => guest.openGameSocketCount(), {
        timeout: 5_000,
        message: 'the game socket is closed on the menu',
      })
      .toBe(0);

    // A later network drop must not try to resume the room the player left.
    await guest.dropConnection();
    await guest.wait(4_000);
    expect(guest.net.ofType('sent', 'reconnect'), 'no session resume for a left room').toEqual([]);
  });

  test('effects queued while disconnected are delivered after reconnecting', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'priest' },
      ],
      'recon-vfx',
    );
    const [host, guest]: GamePlayer[] = session.players;
    const guestId: string = (await guest.probe.state()).player!.id;
    const sendWarnings: string[] = [];
    guest.page.on('console', (msg: ConsoleMessage): void => {
      if (msg.text().includes('Cannot send')) sendWarnings.push(msg.text());
    });
    await host.probe.clearVfxLog();

    await guest.dropConnection();
    await guest.wait(150);
    await guest.probe.levelUp(1);

    await expect
      .poll(
        async (): Promise<boolean> =>
          (await host.probe.vfxLog()).some(
            (e: E2eVfxLogEntry): boolean => e.type === 'level-up' && e.playerId === guestId,
          ),
        { timeout: 20_000, message: 'host replays the level-up the guest gained while offline' },
      )
      .toBe(true);
    expect(sendWarnings, 'sync loop does not spam sends while the socket is down').toEqual([]);
  });

  test('a guest who reloads the page mid-game comes back into the same game', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Reloader', classId: 'mage' },
      ],
      'reload',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await host.probe.setGodMode(true);
    const before: E2eSnapshot = await guest.probe.state();

    await guest.page.reload();
    await expect(guest.page.getByTestId('game-nochar-button-select'), 'no "No character" page').toBeHidden();
    await guest.probe.waitForReady();
    const after: E2eSnapshot = await guest.probe.waitFor(
      'reloaded guest sees the host again',
      (s: E2eSnapshot): boolean => s.remotePlayers.length === 1,
      { timeoutMs: 20_000 },
    );
    expect(after.player!.id, 'same player').toBe(before.player!.id);
    expect(after.player!.classId).toBe('mage');
    expect(after.role).toBe('client');
    await host.probe.waitFor('host sees the guest again', (s: E2eSnapshot): boolean => s.remotePlayers.length === 1, {
      timeoutMs: 15_000,
    });
  });

  test('quitting from settings leaves the multiplayer game', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Quitter', classId: 'ranger' },
      ],
      'quit',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await guest.page.getByTestId('game-settings-button-toggle').click();
    await guest.page.getByTestId('game-settings-button-quit').click();
    await guest.page.getByTestId('game-settings-button-quit').click();
    await expect(guest.page.getByTestId('menu-main-button-multiplayer')).toBeVisible();
    await host.probe.waitFor('host sees the guest leave', (s: E2eSnapshot): boolean => s.remotePlayers.length === 0, {
      timeoutMs: 10_000,
    });
    expect(await guest.openGameSocketCount(), 'socket closed').toBe(0);
  });

  test('a co-op player who died is back on the next floor', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Fallen', classId: 'priest' },
      ],
      'respawn',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await host.probe.setGodMode(true);
    await guest.probe.knockOut();
    await guest.probe.waitFor('guest bled out', (s: E2eSnapshot): boolean => s.player!.isDead, {
      timeoutMs: 45_000,
    });

    await host.probe.setFloor(2);
    const s: E2eSnapshot = await guest.probe.waitFor(
      'guest alive again on floor 2',
      (st: E2eSnapshot): boolean => st.floor === 2 && !st.player!.isDead && !st.player!.isDown && st.player!.hp > 0,
      { timeoutMs: 10_000 },
    );
    expect(s.player!.hp).toBeLessThanOrEqual(s.player!.maxHp);
    await host.probe.waitFor(
      'host sees the guest alive',
      (st: E2eSnapshot): boolean => st.remotePlayers.some((rp: E2eSnapshot['remotePlayers'][number]): boolean => !rp.isDead),
      { timeoutMs: 10_000 },
    );
  });
});
