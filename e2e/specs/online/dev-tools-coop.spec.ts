import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eRemotePlayerView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { liveZombies, openDevTools, pagePoint } from '../../support/dev-tools';

test.describe('dev tools in co-op', { tag: '@online' }, (): void => {
  test("the host's kill all clears the guest's screen too; the guest can't run it", async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'dev-kill-all',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.clearZombies();
    for (const x of [300, 500, 700, 900]) await host.probe.spawnZombieAt(x);
    const before: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees the zombies',
      (s: E2eSnapshot): boolean => liveZombies(s) >= 4,
      { timeoutMs: 10_000 },
    );

    await openDevTools(guest.page);
    await expect(
      guest.page.getByTestId('game-dev-button-kill-all'),
      'world tools are host only',
    ).toBeDisabled();
    await expect(guest.page.getByTestId('game-dev-button-zombie-spawns')).toBeDisabled();

    await openDevTools(host.page);
    await host.page.getByTestId('game-dev-button-kill-all').click();
    const after: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees them all dead',
      (s: E2eSnapshot): boolean => liveZombies(s) === 0 && s.corpses >= before.corpses + 4,
      { timeoutMs: 10_000 },
    );
    expect(after.corpses).toBeGreaterThanOrEqual(before.corpses + 4);
  });

  test('a guest dragged by the mouse shows up there on the host', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'dev-drag',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    const guestId: string = (await guest.probe.state()).player!.id;

    await openDevTools(guest.page);
    await guest.page.getByTestId('game-dev-button-drag-player').click();
    const target: { x: number; y: number } = { x: 640, y: 180 };
    const start: { x: number; y: number } = await pagePoint(guest.page, 200, 500);
    const end: { x: number; y: number } = await pagePoint(guest.page, target.x, target.y);
    await guest.page.mouse.move(start.x, start.y);
    await guest.page.mouse.down();
    await guest.page.mouse.move(end.x, end.y, { steps: 10 });

    await host.probe.waitFor(
      'the host sees the guest held at the cursor',
      (s: E2eSnapshot): boolean => {
        const rp: E2eRemotePlayerView | undefined = s.remotePlayers.find(
          (r: E2eRemotePlayerView): boolean => r.id === guestId,
        );
        return (
          !!rp &&
          Math.abs(rp.x + WORLD.playerWidth / 2 - target.x) < 8 &&
          Math.abs(rp.y + WORLD.playerHeight / 2 - target.y) < 8
        );
      },
      { timeoutMs: 5_000 },
    );
    await guest.page.mouse.up();
  });
});
