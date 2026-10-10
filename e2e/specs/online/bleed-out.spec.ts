import { Locator } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eRemotePlayerView, E2eSnapshot } from '../../support/probe';
import { RoomSession } from '../../support/room';

/** Mirrors REVIVE_WINDOW_TICKS in shared/game-constants.ts: 1500 ticks = 30 s at 50 tps. */
const REVIVE_WINDOW_TICKS: number = 1500;
/** Bleed-out wall time plus slack for a loaded machine. */
const BLEED_OUT_TIMEOUT_MS: number = 50_000;

/**
 * Co-op death: a downed player bleeds out after the revive window, and the game is over only
 * once every player in the room is dead, on every screen.
 */

async function expectNoGameOver(players: GamePlayer[], why: string): Promise<void> {
  for (const p of players) {
    expect(await p.probe.isGameOver(), `${p.name}: no game over while ${why}`).toBe(false);
    const menuButton: Locator = p.page.getByTestId('game-gameover-button-menu');
    await expect(menuButton, `${p.name}: no game-over screen while ${why}`).toBeHidden();
  }
}

async function knockOutAndCheckTimer(player: GamePlayer): Promise<void> {
  await player.probe.knockOut();
  const s: E2eSnapshot = await player.probe.waitFor(
    `${player.name} is down`,
    (st: E2eSnapshot): boolean => st.player!.isDown,
    { timeoutMs: 3_000 },
  );
  expect(s.player!.isDead, `${player.name} is down, not dead yet`).toBe(false);
  expect(
    s.player!.downTimer,
    'the bleed-out timer starts at the revive window',
  ).toBeLessThanOrEqual(REVIVE_WINDOW_TICKS);
  expect(s.player!.downTimer, 'the bleed-out timer just started').toBeGreaterThan(
    REVIVE_WINDOW_TICKS - 250,
  );
}

async function waitBledOut(player: GamePlayer, observer: GamePlayer): Promise<void> {
  const s: E2eSnapshot = await player.probe.waitFor(
    `${player.name} bled out`,
    (st: E2eSnapshot): boolean => st.player!.isDead,
    { timeoutMs: BLEED_OUT_TIMEOUT_MS, intervalMs: 500 },
  );
  expect(s.player!.isDown, 'a dead player is no longer down').toBe(false);
  const id: string = s.player!.id;
  await observer.probe.waitFor(
    `${observer.name} sees ${player.name} dead`,
    (st: E2eSnapshot): boolean =>
      st.remotePlayers.some((rp: E2eRemotePlayerView): boolean => rp.id === id && rp.isDead),
    { timeoutMs: 5_000 },
  );
}

test.describe('co-op bleed-out and game over', { tag: '@online' }, (): void => {
  for (const lastAlive of ['guest', 'host'] as const) {
    test(`the game is over on every screen once all players bled out (${lastAlive} dies last)`, async ({
      room,
    }: {
      room: RoomFactory;
    }): Promise<void> => {
      test.setTimeout(180_000);
      const session: RoomSession = await room(
        [
          { name: 'Host', classId: 'warrior' },
          { name: 'Guest', classId: 'mage' },
        ],
        `bleed-${lastAlive}`,
      );
      const { host }: { host: GamePlayer } = session;
      const guest: GamePlayer = session.guests[0];
      const first: GamePlayer = lastAlive === 'guest' ? host : guest;
      const last: GamePlayer = lastAlive === 'guest' ? guest : host;
      // Zombies must not decide who goes down when: the survivor stays up until its own knock-out.
      await last.probe.setGodMode(true);

      await knockOutAndCheckTimer(first);
      await expectNoGameOver(session.players, `${first.name} is down`);
      await waitBledOut(first, last);
      const lastState: E2eSnapshot = await last.probe.state();
      expect(
        lastState.player!.isDown || lastState.player!.isDead,
        `${last.name} still stands`,
      ).toBe(false);
      await last.wait(1_500);
      await expectNoGameOver(session.players, `${last.name} is still alive`);

      await knockOutAndCheckTimer(last);
      await last.wait(1_000);
      await expectNoGameOver(session.players, `${last.name} is only down`);
      await waitBledOut(last, first);

      for (const p of session.players) {
        await expect(
          p.page.getByTestId('game-gameover-button-menu'),
          `${p.name}: game-over screen once everyone is dead`,
        ).toBeVisible({ timeout: 5_000 });
        expect(await p.probe.isGameOver(), `${p.name}: game over`).toBe(true);
      }
    });
  }
});
