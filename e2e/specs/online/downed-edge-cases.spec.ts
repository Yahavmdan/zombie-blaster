import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { WORLD } from '../../support/invariants';
import { platformUnder } from '../../support/navigation';
import { E2eSnapshot, E2eZombieView } from '../../support/probe';
import { RoomSession } from '../../support/room';

/**
 * A player downed online: where the body ends up.
 */

test.describe('downed players', { tag: '@online' }, (): void => {
  test('a player downed in mid-air falls to the ground', async ({
    room,
  }: { room: RoomFactory }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room([
      { name: 'Host', classId: 'warrior' },
      { name: 'Jumper', classId: 'mage' },
    ]);
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(false);
    await host.probe.setFloor(6);

    // Hop among the zombies (held Space hops on every landing) until a hit downs the guest.
    await guest.hold(KEYS.jump);
    const deadline: number = Date.now() + 100_000;
    try {
      while (Date.now() < deadline && !(await guest.probe.state()).player!.isDown) {
        const h: E2eSnapshot = await host.probe.state();
        const z: E2eZombieView | undefined = h.zombies.find(
          (zz: E2eZombieView): boolean => !zz.isDead && zz.spawnTimer <= 0,
        );
        if (z) await guest.probe.teleport(z.x, z.y + z.height - 48);
        await guest.wait(600);
      }
    } finally {
      await guest.release(KEYS.jump);
    }
    expect((await guest.probe.state()).player!.isDown, 'guest went down').toBe(true);

    await guest.wait(1_500);
    const s: E2eSnapshot = await guest.probe.state();
    await guest.attachCanvas(testInfo, 'downed body');
    const feet: number = s.player!.y + WORLD.playerHeight;
    const surface: number = platformUnder(s, s.player!.x + WORLD.playerWidth / 2, feet).y;
    // Landed: on the platform, or on corpses lying on it (those are not in the level map).
    expect(
      { isGrounded: s.player!.isGrounded, velocityY: s.player!.velocityY },
      'the downed body rests on what is under it',
    ).toEqual({ isGrounded: true, velocityY: 0 });
    expect(Math.round(feet), `feet over the platform at ${surface}`).toBeLessThanOrEqual(surface);
  });

  test('a downed player picks up nothing', async ({ room }: { room: RoomFactory }): Promise<void> => {
    const session: RoomSession = await room([
      { name: 'Host', classId: 'warrior' },
      { name: 'Downed', classId: 'mage' },
    ]);
    const guest: GamePlayer = session.guests[0];
    await session.host.probe.setGodMode(true);
    await guest.probe.knockOut();
    await guest.probe.waitFor('guest is down', (s: E2eSnapshot): boolean => s.player!.isDown, {
      timeoutMs: 3_000,
    });
    await guest.wait(800);

    const before: E2eSnapshot = await guest.probe.state();
    const p: NonNullable<E2eSnapshot['player']> = before.player!;
    await guest.probe.spawnDrop('gold', p.x, p.y);
    await guest.probe.spawnDrop('special', p.x, p.y, 'low-gravity');
    await guest.wait(1_000);

    const after: E2eSnapshot = await guest.probe.state();
    expect(after.player!.gold, 'no gold picked up while down').toBe(before.player!.gold);
    expect(after.hasPendingSpecialDrop, 'no special-drop prompt while down').toBe(false);
    expect(
      after.drops.map((d: E2eSnapshot['drops'][number]): string => d.type).sort(),
      'both drops still lie there',
    ).toEqual(['gold', 'special']);
  });

  test('a special drop whose prompt is open when the player goes down stays in the world', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room([
      { name: 'Host', classId: 'warrior' },
      { name: 'Downed', classId: 'mage' },
    ]);
    const guest: GamePlayer = session.guests[0];
    await session.host.probe.setGodMode(true);
    const p: NonNullable<E2eSnapshot['player']> = (await guest.probe.state()).player!;
    await guest.probe.spawnDrop('special', p.x, p.y, 'low-gravity');
    await guest.probe.waitFor('prompt open', (s: E2eSnapshot): boolean => s.hasPendingSpecialDrop, {
      timeoutMs: 3_000,
    });
    await guest.probe.knockOut();
    await guest.probe.waitFor('guest is down', (s: E2eSnapshot): boolean => s.player!.isDown, {
      timeoutMs: 3_000,
    });
    const s: E2eSnapshot = await guest.probe.waitFor(
      'prompt closed',
      (st: E2eSnapshot): boolean => !st.hasPendingSpecialDrop,
      { timeoutMs: 2_000 },
    );
    expect(
      s.drops.filter((d: E2eSnapshot['drops'][number]): boolean => d.type === 'special'),
      'the special drop is back in the world, not destroyed',
    ).toHaveLength(1);
  });
});
