import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eRemotePlayerView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { closeDevTools, dragOnCanvas, liveZombies, openDevTools } from '../../support/dev-tools';

/** World tools only the host may use (zombies, corpses, puzzles are the host's simulation). */
const HOST_ONLY: string[] = [
  'game-dev-button-kill-all',
  'game-dev-button-zombie-spawns',
  'game-dev-button-freeze-zombies',
  'game-dev-button-pile-exit',
  'game-dev-button-solve-puzzle',
  'game-dev-button-next-floor',
  'game-dev-button-spawn-walker',
];

async function twoWarriors(room: RoomFactory, prefix: string): Promise<RoomSession> {
  const session: RoomSession = await room(
    [
      { name: 'Host', classId: 'warrior' },
      { name: 'Guest', classId: 'warrior' },
    ],
    prefix,
  );
  await session.host.probe.setGodMode(true);
  await session.guests[0].probe.setGodMode(true);
  return session;
}

function zombieById(s: E2eSnapshot, id: string): E2eZombieView | undefined {
  return s.zombies.find((z: E2eZombieView): boolean => z.id === id);
}

test.describe('dev tools in co-op', { tag: '@online' }, (): void => {
  test("the host's kill all clears the guest's screen too; the guest can't run world tools", async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await twoWarriors(room, 'dev-kill-all');
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.clearZombies();
    for (const x of [300, 500, 700, 900]) await host.probe.spawnZombieAt(x);
    const before: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees the zombies',
      (s: E2eSnapshot): boolean => liveZombies(s) >= 4,
      { timeoutMs: 10_000 },
    );

    await openDevTools(guest.page);
    for (const id of HOST_ONLY) {
      await expect(guest.page.getByTestId(id), `${id} is host only`).toBeDisabled();
    }
    await closeDevTools(guest.page);

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
    const session: RoomSession = await twoWarriors(room, 'dev-drag');
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    const guestId: string = (await guest.probe.state()).player!.id;

    await openDevTools(guest.page);
    await guest.page.getByTestId('game-dev-button-mouse-drag').click();
    const target: { x: number; y: number } = { x: 640, y: 180 };
    await dragOnCanvas(guest.page, { x: 200, y: 120 }, target, false);

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

  test('the guest sees a zombie the host froze, then dragged', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await twoWarriors(room, 'dev-drag-zombie');
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await openDevTools(host.page);
    await host.page.getByTestId('game-dev-button-zombie-spawns').click();
    await host.page.getByTestId('game-dev-button-freeze-zombies').click();
    await closeDevTools(host.page);
    await host.probe.clearZombies();
    await host.probe.spawnZombieAt(800);
    const seen: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees the zombie up',
      (s: E2eSnapshot): boolean =>
        s.zombies.some((z: E2eZombieView): boolean => !z.isDead && z.spawnTimer === 0),
      { timeoutMs: 10_000 },
    );
    const z: E2eZombieView = seen.zombies.find((v: E2eZombieView): boolean => !v.isDead)!;
    await host.wait(1_000);
    expect(zombieById(await guest.probe.state(), z.id)!.x, 'frozen for the guest too').toBeCloseTo(
      z.x,
      0,
    );

    await openDevTools(host.page);
    await host.page.getByTestId('game-dev-button-mouse-drag').click();
    const target: { x: number; y: number } = { x: 400, y: 200 };
    await dragOnCanvas(host.page, { x: z.x + z.width / 2, y: z.y + z.height / 2 }, target, false);
    await guest.probe.waitFor(
      'the guest sees the zombie held where the host dragged it',
      (s: E2eSnapshot): boolean => {
        const v: E2eZombieView | undefined = zombieById(s, z.id);
        return (
          !!v &&
          Math.abs(v.x + v.width / 2 - target.x) < 10 &&
          Math.abs(v.y + v.height / 2 - target.y) < 10
        );
      },
      { timeoutMs: 5_000 },
    );
    await host.page.mouse.up();
  });
});
