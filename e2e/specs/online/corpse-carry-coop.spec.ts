import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eCorpseView, E2eRemotePlayerView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { clearPickablesBetween } from '../../support/props';

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
    await clearPickablesBetween(host, [guest], 300, 1000);

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
        s.player!.carryingCorpseIds.includes(corpse.id) &&
        findCorpse(s, corpse.id)?.carrierId === guestId,
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

    // The host draws it bouncing on the guest's steps, from the guest's synced motion.
    const swaying: number[] = [];
    await guest.hold(KEYS.left);
    for (let i: number = 0; i < 12; i++) {
      await host.wait(40);
      const s: E2eSnapshot = await host.probe.state();
      const bob: number | undefined = findCorpse(s, corpse.id)?.carryPose?.bob;
      if (bob !== undefined) swaying.push(bob);
    }
    await guest.release(KEYS.left);
    expect(swaying.length, 'the host draws it swaying on the guest').toBeGreaterThan(6);
    expect(Math.max(...swaying) - Math.min(...swaying), 'it bounces with the guest\'s steps').toBeGreaterThan(1);
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
          s.player!.carryingCorpseIds.length === 0 &&
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
    await clearPickablesBetween(host, [guest], 300, 1000);

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
    expect(after.player!.carryingCorpseIds, 'the guest got nothing').toEqual([]);
    expect(findCorpse(after, corpse.id)!.carrierId, 'still on the host').toBe(hostId);
  });

  test('a guest carries a stack of corpses: the host sees them stacked on the guest, and both see the thrown pile', async ({
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
      'carry-stack',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await clearPickablesBetween(host, [guest], 300, 1000);
    const guestId: string = (await guest.probe.state()).player!.id;

    const first: E2eCorpseView = await lyingCorpse(host, guest, 500);
    await standAt(guest, first);
    await guest.press(KEYS.carry, 70);
    await guest.probe.waitFor(
      'the guest carries the first',
      (s: E2eSnapshot): boolean => findCorpse(s, first.id)?.carrierId === guestId,
      { timeoutMs: 5_000 },
    );
    const second: E2eCorpseView = await lyingCorpse(host, guest, 700);
    await standAt(guest, second);
    await guest.press(KEYS.carry, 70);
    const ids: string[] = [first.id, second.id];

    const hostView: E2eSnapshot = await host.probe.waitFor(
      'on the host screen both ride on the guest, the second on top of the first',
      (s: E2eSnapshot): boolean => {
        const g: E2eRemotePlayerView | undefined = s.remotePlayers.find(
          (rp: E2eRemotePlayerView): boolean => rp.id === guestId,
        );
        const [a, b]: (E2eCorpseView | undefined)[] = ids.map(
          (id: string): E2eCorpseView | undefined => findCorpse(s, id),
        );
        return (
          !!g &&
          !!a &&
          !!b &&
          a.carrierId === guestId &&
          b.carrierId === guestId &&
          b.y < a.y &&
          Math.abs(corpseCenterX(b) - (g.x + WORLD.playerWidth / 2)) < 2
        );
      },
      { timeoutMs: 5_000 },
    );
    expect(findCorpse(hostView, second.id)!.isGrounded).toBe(false);
    await host.attachCanvas(testInfo, 'host sees the guest carrying two');

    await guest.press(KEYS.carry, 70);
    const landed: (s: E2eSnapshot) => E2eCorpseView[] | null = (
      s: E2eSnapshot,
    ): E2eCorpseView[] | null => {
      const pile: (E2eCorpseView | undefined)[] = ids.map((id: string): E2eCorpseView | undefined =>
        findCorpse(s, id),
      );
      return pile.every(
        (c: E2eCorpseView | undefined): boolean => !!c && c.carrierId === null && c.isGrounded,
      )
        ? (pile as E2eCorpseView[])
        : null;
    };
    const onHost: E2eSnapshot = await host.probe.waitFor(
      'the thrown stack lands on the host',
      (s: E2eSnapshot): boolean => landed(s) !== null,
      { timeoutMs: 5_000 },
    );
    const [bottom, top]: E2eCorpseView[] = landed(onHost)!;
    expect(bottom.footY - top.footY, 'the second lies on the first').toBeCloseTo(FOOTHOLD_DEPTH, 0);
    expect(Math.abs(corpseCenterX(top) - corpseCenterX(bottom))).toBeLessThan(top.footWidth);
    await guest.probe.waitFor(
      'the guest sees the same pile',
      (s: E2eSnapshot): boolean => {
        const pile: E2eCorpseView[] | null = landed(s);
        return (
          s.player!.carryingCorpseIds.length === 0 &&
          !!pile &&
          Math.abs(corpseCenterX(pile[0]) - corpseCenterX(bottom)) < 1 &&
          Math.abs(pile[1].footY - top.footY) < 1
        );
      },
      { timeoutMs: 5_000 },
    );
    await guest.attachCanvas(testInfo, 'guest sees the thrown pile');
  });
});
