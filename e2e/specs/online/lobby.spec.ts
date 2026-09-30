import { Browser, Locator } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { RoomSession, uniqueRoomName } from '../../support/room';
import { E2eSnapshot } from '../../support/probe';

test.describe('lobby and rooms', { tag: '@online' }, (): void => {
  let opened: GamePlayer[] = [];

  test.afterEach(async (): Promise<void> => {
    const errors: string[] = opened.flatMap((p: GamePlayer): string[] =>
      p.errors.map((e: string): string => `${p.name}: ${e}`),
    );
    await Promise.all(opened.map((p: GamePlayer): Promise<void> => p.close()));
    opened = [];
    expect(errors).toEqual([]);
  });

  async function openInLobby(
    browser: Browser,
    name: string,
    classId: GamePlayer['classId'],
  ): Promise<GamePlayer> {
    const p: GamePlayer = await GamePlayer.open(browser, { name, classId });
    opened.push(p);
    await p.enterLobby();
    return p;
  }

  test('host can start only when every guest is ready', async ({
    browser,
  }: {
    browser: Browser;
  }): Promise<void> => {
    const host: GamePlayer = await openInLobby(browser, 'Host', 'warrior');
    const guest: GamePlayer = await openInLobby(browser, 'Guest', 'mage');
    const room: string = uniqueRoomName('ready');
    await host.createRoom(room);
    await guest.joinRoom(room);

    const start: Locator = host.page.getByTestId('lobby-room-button-start');
    await expect(start).toBeDisabled();
    await guest.toggleReady();
    await expect(start).toBeEnabled();
    await guest.toggleReady();
    await expect(start).toBeDisabled();
  });

  test('room list shows new rooms and live player counts', async ({
    browser,
  }: {
    browser: Browser;
  }): Promise<void> => {
    const host: GamePlayer = await openInLobby(browser, 'Host', 'warrior');
    const watcher: GamePlayer = await openInLobby(browser, 'Watcher', 'priest');
    const room: string = uniqueRoomName('list');
    await host.createRoom(room);

    await expect(async (): Promise<void> => {
      await watcher.page.getByTestId('lobby-rooms-button-refresh').click();
      await expect(watcher.roomCard(room)).toContainText('1 /', { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });

    await host.page.getByTestId('lobby-room-button-leave').click();
    await expect(async (): Promise<void> => {
      await watcher.page.getByTestId('lobby-rooms-button-refresh').click();
      await expect(watcher.roomCard(room)).toHaveCount(0, { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
  });

  test('a kicked player returns to the browser and can host a new room', async ({
    browser,
  }: {
    browser: Browser;
  }): Promise<void> => {
    const host: GamePlayer = await openInLobby(browser, 'Host', 'warrior');
    const guest: GamePlayer = await openInLobby(browser, 'Kicked', 'ranger');
    const room: string = uniqueRoomName('kick');
    await host.createRoom(room);
    await guest.joinRoom(room);
    await expect(host.page.locator('.btn--kick')).toHaveCount(1);

    await host.page.locator('.btn--kick').click();
    await expect(guest.page.locator('.error-banner')).toContainText('kicked');
    await expect(guest.page.getByTestId('lobby-create-button-create')).toBeVisible();

    await guest.page.getByTestId('lobby-create-input-roomname').fill(uniqueRoomName('after-kick'));
    await guest.page.getByTestId('lobby-create-button-create').click();
    await expect(
      guest.page.getByTestId('lobby-room-button-start'),
      'kicked player can create a room',
    ).toBeVisible({ timeout: 5_000 });
  });

  test('a late joiner drops straight into a game in progress', async ({
    browser,
    room,
  }: {
    browser: Browser;
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room([{ name: 'Host', classId: 'warrior' }], 'late');
    const late: GamePlayer = await openInLobby(browser, 'Late', 'assassin');
    await late.joinRoom(session.roomName);
    await late.page.waitForURL(/\/game/);
    await late.probe.waitForReady();
    await late.probe.waitFor(
      'late joiner is a client',
      (s: E2eSnapshot): boolean => s.role === 'client',
    );
    await late.probe.waitFor(
      'late joiner sees the host',
      (s: E2eSnapshot): boolean => s.remotePlayers.length === 1,
      { timeoutMs: 15_000 },
    );
    await session.host.probe.waitFor(
      'host sees the late joiner',
      (s: E2eSnapshot): boolean => s.remotePlayers.length === 1,
      { timeoutMs: 15_000 },
    );
  });

  test('four players can start a game together', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room(
      [
        { name: 'P1', classId: 'warrior' },
        { name: 'P2', classId: 'mage' },
        { name: 'P3', classId: 'assassin' },
        { name: 'P4', classId: 'priest' },
      ],
      'four',
    );
    for (const p of session.players) {
      const s: E2eSnapshot = await p.probe.state();
      expect(
        s.remotePlayers.map((r: E2eSnapshot['remotePlayers'][number]): string => r.name).sort(),
      ).toEqual(
        session.players
          .filter((o: GamePlayer): boolean => o !== p)
          .map((o: GamePlayer): string => o.name)
          .sort(),
      );
    }
  });
});
