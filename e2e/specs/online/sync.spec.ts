import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { RoomSession } from '../../support/room';
import { runBot } from '../../support/bot';
import { E2eRemotePlayerView, E2eSnapshot, E2eZombieView } from '../../support/probe';

function remoteView(s: E2eSnapshot, playerId: string): E2eRemotePlayerView | undefined {
  return s.remotePlayers.find((r: E2eRemotePlayerView): boolean => r.id === playerId);
}

async function myId(p: GamePlayer): Promise<string> {
  return (await p.probe.state()).player!.id;
}

test.describe('host-authoritative world sync', { tag: '@online' }, (): void => {
  let session: RoomSession;
  let host: GamePlayer;
  let guest: GamePlayer;

  test.beforeEach(async ({ room }: { room: RoomFactory }): Promise<void> => {
    session = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'sync',
    );
    host = session.host;
    guest = session.guests[0];
  });

  test('client zombies mirror the host simulation', async (): Promise<void> => {
    await host.probe.waitFor(
      'host has zombies',
      (s: E2eSnapshot): boolean => s.zombies.length >= 2,
      { timeoutMs: 20_000 },
    );
    await expect(async (): Promise<void> => {
      const [h, g]: E2eSnapshot[] = await Promise.all([host.probe.state(), guest.probe.state()]);
      const hostById: Map<string, E2eZombieView> = new Map<string, E2eZombieView>(
        h.zombies.map((z: E2eZombieView): [string, E2eZombieView] => [z.id, z]),
      );
      const shared: E2eZombieView[] = g.zombies.filter((z: E2eZombieView): boolean =>
        hostById.has(z.id),
      );
      expect(shared.length, 'client knows the host zombies').toBeGreaterThanOrEqual(
        Math.min(2, h.zombies.length),
      );
      expect(g.zombies.length, 'client has no phantom zombies').toBeLessThanOrEqual(
        h.zombies.length + 2,
      );
      for (const z of shared) {
        const hz: E2eZombieView = hostById.get(z.id)!;
        expect(Math.abs(z.x - hz.x), `zombie ${z.id} x drift`).toBeLessThan(80);
        expect(Math.abs(z.y - hz.y), `zombie ${z.id} y drift`).toBeLessThan(80);
      }
    }).toPass({ timeout: 15_000, intervals: [250] });
  });

  test('guest movement is visible to the host', async (): Promise<void> => {
    const guestId: string = await myId(guest);
    await guest.probe.setGodMode(true);
    await guest.moveRight(900);
    await guest.wait(300);
    const own: E2eSnapshot = await guest.probe.state();
    const seen: E2eSnapshot = await host.probe.waitFor(
      'host sees guest near its real position',
      (s: E2eSnapshot): boolean => {
        const r: E2eRemotePlayerView | undefined = remoteView(s, guestId);
        return r !== undefined && Math.abs(r.x - own.player!.x) < 40;
      },
    );
    expect(remoteView(seen, guestId)!.facing).toBe('right');
  });

  test('host floor changes reach the guest', async (): Promise<void> => {
    await host.probe.setFloor(3);
    await guest.probe.waitFor('guest on floor 3', (s: E2eSnapshot): boolean => s.floor === 3, {
      timeoutMs: 5_000,
    });
    await expect(guest.page.locator('app-hud')).toContainText('3');
  });

  test('guest hits damage zombies through the host', async ({}: object, testInfo: TestInfo): Promise<void> => {
    await guest.probe.setGodMode(true);
    await host.probe.setGodMode(true);
    await host.probe.waitFor(
      'zombies spawned',
      (s: E2eSnapshot): boolean => s.zombies.some((z: E2eZombieView): boolean => z.spawnTimer <= 0),
      { timeoutMs: 20_000 },
    );

    await runBot(guest, {
      durationMs: 40_000,
      onTick: (): boolean => host.net.ofType('received', 'zombie-damage').length < 3,
    });
    const sent: number = guest.net.ofType('sent', 'zombie-damage').length;
    const received: number = host.net.ofType('received', 'zombie-damage').length;
    await testInfo.attach('zombie-damage frames', {
      body: JSON.stringify({ sent, received }),
      contentType: 'application/json',
    });
    expect(sent, 'guest reported hits').toBeGreaterThan(0);
    expect(received, 'server relayed hits to the host').toBeGreaterThan(0);
  });

  test('zombies hurt guests (host decides, guest applies)', async (): Promise<void> => {
    test.setTimeout(120_000);
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(false);
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
    expect(hurt, 'guest took damage from host-simulated zombies').toBe(true);
    expect(
      host.net.ofType('sent', 'zombie-attack-player').length +
        host.net.ofType('sent', 'game-sync').length,
    ).toBeGreaterThan(0);
  });

  test('a downed guest can be revived by the host', async ({}: object, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(false);
    await host.probe.setFloor(6);
    const guestId: string = await myId(guest);

    const deadline: number = Date.now() + 90_000;
    while (Date.now() < deadline && !(await guest.probe.state()).player!.isDown) {
      const h: E2eSnapshot = await host.probe.state();
      const z: E2eZombieView | undefined = h.zombies.find(
        (zz: E2eZombieView): boolean => !zz.isDead && zz.spawnTimer <= 0,
      );
      if (z) await guest.probe.teleport(z.x, z.y + z.height - 48);
      await guest.wait(500);
    }
    await guest.attachCanvas(testInfo, 'guest downed');
    expect((await guest.probe.state()).player!.isDown, 'guest went down').toBe(true);
    await host.probe.waitFor(
      'host sees guest downed',
      (s: E2eSnapshot): boolean => remoteView(s, guestId)?.isDown === true,
      { timeoutMs: 5_000 },
    );

    const downed: E2eRemotePlayerView = remoteView(await host.probe.state(), guestId)!;
    await host.probe.teleport(downed.x, downed.y);
    await host.hold(KEYS.revive);
    try {
      await guest.probe.waitFor(
        'guest revived',
        (s: E2eSnapshot): boolean => !s.player!.isDown && !s.player!.isDead && s.player!.hp > 0,
        { timeoutMs: 10_000 },
      );
    } finally {
      await host.release(KEYS.revive);
    }
    await host.attachCanvas(testInfo, 'after revive');
  });
});
