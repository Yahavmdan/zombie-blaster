import { Locator } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { RoomSession } from '../../support/room';
import { E2eRemotePlayerView, E2eSnapshot, E2eZombieView } from '../../support/probe';

/**
 * Chrome's Memory Saver discards a background tab: the page unloads (pagehide saves the game),
 * the socket closes, and coming back to the tab reloads it, which resumes the saved session.
 * This is how an AFK player lost the game after 20-30 minutes.
 */
async function discardTab(player: GamePlayer, observer: GamePlayer, awayMs: number): Promise<void> {
  const gameUrl: string = player.page.url();
  await player.page.goto('about:blank');
  await observer.probe.waitFor(
    'the server dropped the discarded tab',
    (s: E2eSnapshot): boolean => s.remotePlayers.length === 0,
    { timeoutMs: 15_000 },
  );
  await observer.wait(awayMs);
  await player.page.goto(gameUrl);
  await player.probe.waitForReady();
}

function afkOverlay(player: GamePlayer): Locator {
  return player.page.getByTestId('game-afk-overlay');
}

function remoteAfk(s: E2eSnapshot, name: string): boolean | null {
  const rp: E2eRemotePlayerView | undefined = s.remotePlayers.find(
    (p: E2eRemotePlayerView): boolean => p.name === name,
  );
  return rp ? rp.isAfk : null;
}

/** Proves world updates reach the player: game-sync frames keep arriving. */
async function expectGameSyncFlowing(player: GamePlayer, message: string): Promise<void> {
  const before: number = player.net.ofType('received', 'game-sync').length;
  await player.wait(2_000);
  expect(player.net.ofType('received', 'game-sync').length, message).toBeGreaterThan(before + 10);
}

test.describe('away from keyboard', { tag: '@online' }, (): void => {
  test('an idle guest is frozen behind an overlay, everyone sees it, Continue brings it back', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'mage' },
      ],
      'afk',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await guest.probe.setAfkTimeout(3_000);

    await expect(afkOverlay(guest), 'idle guest sees the away overlay').toBeVisible({
      timeout: 10_000,
    });
    expect((await guest.probe.state()).afk, 'the guest is marked away').toBe(true);
    await host.probe.waitFor(
      'host sees the guest away',
      (s: E2eSnapshot): boolean => remoteAfk(s, 'Guest') === true,
      { timeoutMs: 5_000 },
    );

    // Frozen: the game keys do nothing while the overlay is up.
    const xBefore: number = (await guest.probe.state()).player!.x;
    await guest.press(KEYS.right, 400);
    expect((await guest.probe.state()).player!.x, 'an away player does not move').toBe(xBefore);

    await guest.page.getByTestId('game-afk-button-continue').click();
    await expect(afkOverlay(guest), 'Continue closes the overlay').toBeHidden();
    expect((await guest.probe.state()).afk).toBe(false);
    await host.probe.waitFor(
      'host sees the guest back',
      (s: E2eSnapshot): boolean => remoteAfk(s, 'Guest') === false,
      { timeoutMs: 5_000 },
    );
    await guest.press(KEYS.right, 400);
    expect((await guest.probe.state()).player!.x, 'back from away, the player moves').not.toBe(
      xBefore,
    );
  });

  test('zombies leave an away player alone', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'mage' },
      ],
      'afkhurt',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await host.probe.setGodMode(true);
    await guest.probe.setAfkTimeout(1_000);
    await expect(afkOverlay(guest)).toBeVisible({ timeout: 10_000 });
    await host.probe.waitFor(
      'host sees the guest away',
      (s: E2eSnapshot): boolean => remoteAfk(s, 'Guest') === true,
      { timeoutMs: 5_000 },
    );

    const hp: number = (await guest.probe.state()).player!.hp;
    // Walk the host next to the guest: zombies follow it there, and still pick only the host.
    const target: E2eSnapshot = await guest.probe.state();
    await host.probe.teleport(target.player!.x + 40, target.player!.y);
    await host.probe.waitFor(
      'a zombie close to the away guest',
      (s: E2eSnapshot): boolean =>
        s.zombies.some(
          (z: E2eZombieView): boolean => !z.isDead && Math.abs(z.x - target.player!.x) < 60,
        ),
      { timeoutMs: 45_000 },
    );
    await guest.wait(5_000);
    expect((await guest.probe.state()).player!.hp, 'nothing hurt the away guest').toBe(hp);
  });

  test('the host going away hands the simulation to an active guest; Continue catches up as a guest', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'mage' },
      ],
      'afkhost',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await host.probe.setAfkTimeout(3_000);

    await expect(afkOverlay(host)).toBeVisible({ timeout: 10_000 });
    await guest.probe.waitFor(
      'the active guest runs the world now',
      (s: E2eSnapshot): boolean => s.role === 'host',
      { timeoutMs: 10_000 },
    );
    await host.probe.waitFor(
      'the away host follows as a guest',
      (s: E2eSnapshot): boolean => s.role === 'client',
      { timeoutMs: 10_000 },
    );

    await host.page.getByTestId('game-afk-button-continue').click();
    await expect(afkOverlay(host)).toBeHidden();
    await expectGameSyncFlowing(host, 'the old host gets the world from the new host');
    expect((await host.probe.state()).role, 'Continue does not take the host back').toBe('client');
  });

  test('an away guest whose tab the browser discarded comes back into its held seat and catches up', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(240_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'mage' },
      ],
      'afkdiscard',
    );
    const [host, guest]: GamePlayer[] = session.players;
    await guest.probe.setAfkTimeout(2_000);
    await expect(afkOverlay(guest)).toBeVisible({ timeout: 10_000 });
    await host.probe.waitFor(
      'host sees the guest away',
      (s: E2eSnapshot): boolean => remoteAfk(s, 'Guest') === true,
      { timeoutMs: 5_000 },
    );

    // Longer than the 60 s a dropped player normally gets: the seat of an away player is held.
    await discardTab(guest, host, 70_000);

    await expect(afkOverlay(guest), 'back into the held seat, still away').toHaveAttribute(
      'data-state',
      'away',
      { timeout: 30_000 },
    );
    await guest.page.getByTestId('game-afk-button-continue').click();
    await expect(afkOverlay(guest)).toBeHidden();
    await host.probe.waitFor(
      'host sees the guest back',
      (s: E2eSnapshot): boolean => remoteAfk(s, 'Guest') === false,
      { timeoutMs: 15_000 },
    );
    await guest.probe.waitFor(
      'the guest sees the host again',
      (s: E2eSnapshot): boolean => s.remotePlayers.length === 1,
      { timeoutMs: 15_000 },
    );
    await expectGameSyncFlowing(guest, 'game-sync flows to the returned guest');
  });

  test('a tab discarded mid-game says its seat is gone instead of silently playing alone', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(240_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'mage' },
      ],
      'afklost',
    );
    const [host, guest]: GamePlayer[] = session.players;
    // Gone before the away timer ran out: the server only holds the seat for 60 s.
    await discardTab(guest, host, 70_000);

    await expect(afkOverlay(guest), 'the returning guest is told its seat is gone').toHaveAttribute(
      'data-state',
      'lost',
      { timeout: 30_000 },
    );
    await guest.page.getByTestId('game-afk-button-menu').click();
    await expect(guest.page.getByTestId('menu-main-button-singleplayer')).toBeVisible();
  });
});
