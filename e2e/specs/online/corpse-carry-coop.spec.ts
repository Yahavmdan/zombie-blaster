import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eCorpseView, E2eRemotePlayerView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';

/** The probe's foothold top sits this far above the corpse's feet (ZOMBIE_CORPSE_PLATFORM_HEIGHT). */
const FOOTHOLD_DEPTH: number = 5;

function corpseCenterX(c: E2eCorpseView): number {
  return c.footX + c.footWidth / 2;
}

function findCorpse(s: E2eSnapshot, id: string): E2eCorpseView | undefined {
  return s.corpseViews.find((c: E2eCorpseView): boolean => c.id === id);
}

/** The host drops one corpse at x (setup); returns it once the given player sees it lying. */
async function lyingCorpse(
  host: GamePlayer,
  observer: GamePlayer,
  x: number,
): Promise<E2eCorpseView> {
  const before: E2eSnapshot = await host.probe.state();
  const known: Set<string> = new Set<string>(
    before.corpseViews.map((c: E2eCorpseView): string => c.id),
  );
  await host.probe.dropCorpses(x, 1);
  const fresh: (s: E2eSnapshot) => E2eCorpseView | undefined = (
    s: E2eSnapshot,
  ): E2eCorpseView | undefined =>
    s.corpseViews.find((c: E2eCorpseView): boolean => !known.has(c.id) && c.isGrounded);
  const seen: E2eSnapshot = await observer.probe.waitFor(
    'the dropped corpse lies on the ground',
    (s: E2eSnapshot): boolean => fresh(s) !== undefined,
    { timeoutMs: 10_000 },
  );
  return fresh(seen)!;
}

async function standAt(p: GamePlayer, c: E2eCorpseView): Promise<void> {
  await p.face('right');
  await p.probe.teleport(
    corpseCenterX(c) - WORLD.playerWidth / 2,
    c.footY + FOOTHOLD_DEPTH - WORLD.playerHeight,
  );
  await p.wait(300);
}

test.describe('carrying corpses in co-op', { tag: '@online' }, (): void => {
  test('a guest picks up a corpse: the host grants it and sees it ride on the guest; the toss lands the same for both', async ({
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
      'carry',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    const corpse: E2eCorpseView = await lyingCorpse(host, guest, 500);
    await standAt(guest, corpse);
    await guest.press(KEYS.carry, 70);
    const guestId: string = (await guest.probe.state()).player!.id;

    await host.probe.waitFor(
      "the host grants the guest's pick-up",
      (s: E2eSnapshot): boolean => findCorpse(s, corpse.id)?.carrierId === guestId,
      { timeoutMs: 5_000 },
    );
    await guest.probe.waitFor(
      'the guest sees itself carrying it',
      (s: E2eSnapshot): boolean =>
        s.player!.carryingCorpseId === corpse.id && findCorpse(s, corpse.id)?.carrierId === guestId,
      { timeoutMs: 5_000 },
    );

    await guest.moveRight(500);
    await guest.wait(400);
    const hostView: E2eSnapshot = await host.probe.waitFor(
      'on the host screen the corpse follows the guest',
      (s: E2eSnapshot): boolean => {
        const c: E2eCorpseView | undefined = findCorpse(s, corpse.id);
        const g: E2eRemotePlayerView | undefined = s.remotePlayers.find(
          (rp: E2eRemotePlayerView): boolean => rp.id === guestId,
        );
        return (
          !!c &&
          !!g &&
          c.carrierId === guestId &&
          Math.abs(corpseCenterX(c) - (g.x + WORLD.playerWidth / 2)) < 2 &&
          corpseCenterX(c) > corpseCenterX(corpse) + 30
        );
      },
      { timeoutMs: 5_000 },
    );
    expect(findCorpse(hostView, corpse.id)!.isGrounded).toBe(false);
    await host.attachCanvas(testInfo, 'host sees the guest carrying');
    await guest.attachCanvas(testInfo, 'guest carrying');

    await guest.press(KEYS.carry, 70);
    const landedOnHost: E2eSnapshot = await host.probe.waitFor(
      'the host tosses it and it lands',
      (s: E2eSnapshot): boolean => {
        const c: E2eCorpseView | undefined = findCorpse(s, corpse.id);
        return !!c && c.carrierId === null && c.isGrounded;
      },
      { timeoutMs: 5_000 },
    );
    const landedX: number = corpseCenterX(findCorpse(landedOnHost, corpse.id)!);
    await guest.probe.waitFor(
      'the guest sees it land in the same spot',
      (s: E2eSnapshot): boolean => {
        const c: E2eCorpseView | undefined = findCorpse(s, corpse.id);
        return (
          s.player!.carryingCorpseId === null &&
          !!c &&
          c.carrierId === null &&
          c.isGrounded &&
          Math.abs(corpseCenterX(c) - landedX) < 1
        );
      },
      { timeoutMs: 5_000 },
    );
  });

  test('the host carries a corpse and the guest sees it ride on the host; a guest cannot take it away', async ({
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
      'carry-host',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    const corpse: E2eCorpseView = await lyingCorpse(host, host, 500);
    await standAt(host, corpse);
    await host.press(KEYS.carry, 70);
    const hostId: string = (await host.probe.state()).player!.id;
    await guest.probe.waitFor(
      'the guest sees the host carrying it, on the host',
      (s: E2eSnapshot): boolean => {
        const c: E2eCorpseView | undefined = findCorpse(s, corpse.id);
        const h: E2eRemotePlayerView | undefined = s.remotePlayers.find(
          (rp: E2eRemotePlayerView): boolean => rp.id === hostId,
        );
        return (
          !!c &&
          !!h &&
          c.carrierId === hostId &&
          Math.abs(corpseCenterX(c) - (h.x + WORLD.playerWidth / 2)) < 2
        );
      },
      { timeoutMs: 5_000 },
    );

    // The guest grabs at the same body: the host keeps it, the guest's hands stay empty.
    const h: E2eSnapshot = await host.probe.state();
    await guest.probe.teleport(h.player!.x + 10, h.player!.y);
    await guest.wait(300);
    await guest.press(KEYS.carry, 70);
    await guest.wait(1_000);
    const after: E2eSnapshot = await guest.probe.state();
    expect(after.player!.carryingCorpseId, 'the guest got nothing').toBeNull();
    expect(findCorpse(after, corpse.id)!.carrierId, 'still on the host').toBe(hostId);
  });
});
