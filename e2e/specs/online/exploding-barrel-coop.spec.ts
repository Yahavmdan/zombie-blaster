import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { layoutWhere } from '../../support/navigation';
import { findProp, isBarrel, LevelProp, pickableOnGround, standLeftOf } from '../../support/props';

test.describe('exploding barrels in co-op', { tag: '@online' }, (): void => {
  test('a guest lights a barrel: both see the fuse burn, and both see it blow up and vanish', async ({
    room,
  }: {
    room: RoomFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'barrels',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    const s0: E2eSnapshot = await layoutWhere(
      host,
      'a lone barrel on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s, isBarrel) !== undefined,
    );
    const barrel: LevelProp = pickableOnGround(s0, isBarrel)!;
    const id: string = barrel.id!;
    await guest.probe.waitFor(
      "the guest follows the host's layout",
      (s: E2eSnapshot): boolean =>
        s.level.seed === s0.level.seed && findProp(s, id)?.x === barrel.x,
      { timeoutMs: 5_000 },
    );
    const hostId: string = (await host.probe.state()).player!.id;

    // The guest swings; the host decides the hit and lights the fuse.
    await standLeftOf(guest, barrel);
    await guest.press(KEYS.attack, 70);
    await host.probe.waitFor(
      "the host lights the fuse from the guest's swing",
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) > 0,
      { timeoutMs: 5_000 },
    );
    await guest.probe.waitFor(
      'the guest sees the fuse burning',
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) > 0,
      { timeoutMs: 5_000 },
    );
    await guest.attachCanvas(testInfo, 'guest sees the lit barrel');

    await host.probe.waitFor(
      'the barrel blows up on the host',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === true,
      { timeoutMs: 10_000 },
    );
    await guest.probe.waitFor(
      'the barrel is gone on the guest too',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === true,
      { timeoutMs: 5_000 },
    );
    await expectReplayed(
      guest,
      'barrel-blast',
      hostId,
      "the guest replays and draws the host's blast",
    );
    await guest.attachCanvas(testInfo, 'guest sees the blast');

    // 10 s later the host puts it back on its spawn spot, and so does the guest.
    await host.probe.waitFor(
      'the barrel is back on the host',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === false,
      { timeoutMs: 20_000 },
    );
    const back: E2eSnapshot = await guest.probe.waitFor(
      'the barrel is back on the guest',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === false,
      { timeoutMs: 5_000 },
    );
    expect(findProp(back, id)).toMatchObject({ x: barrel.x, y: barrel.y, fuseTicks: 0 });
    await expectReplayed(guest, 'barrel-respawn', hostId, 'the guest sees it drop back in');
  });
});

/** The guest replayed (and drew particles for) an effect of this type from the host. */
async function expectReplayed(
  guest: GamePlayer,
  type: string,
  hostId: string,
  message: string,
): Promise<void> {
  await expect
    .poll(
      async (): Promise<boolean> =>
        (await guest.probe.vfxLog()).some(
          (e: E2eVfxLogEntry): boolean =>
            e.type === type &&
            e.direction === 'replayed' &&
            e.playerId === hostId &&
            (e.particlesAdded ?? 0) > 0,
        ),
      { message, timeout: 5_000 },
    )
    .toBe(true);
}
