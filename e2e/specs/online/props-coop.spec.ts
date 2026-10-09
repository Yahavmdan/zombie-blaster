import { TestInfo } from '@playwright/test';
import { test, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eRemotePlayerView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { layoutWhere } from '../../support/navigation';
import {
  findProp,
  LevelProp,
  pickableOnGround,
  propCenterX,
  standLeftOf,
} from '../../support/props';

test.describe('map props in co-op', { tag: '@online' }, (): void => {
  test('a guest picks up a prop: the host grants it and sees it ride on the guest; the throw lands it solid in the same spot for both', async ({
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
      'props',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    const s0: E2eSnapshot = await layoutWhere(
      host,
      'a lone pickable prop on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s) !== undefined,
    );
    const prop: LevelProp = pickableOnGround(s0)!;
    const id: string = prop.id!;
    await guest.probe.waitFor(
      "the guest follows the host's layout",
      (s: E2eSnapshot): boolean => s.level.seed === s0.level.seed && findProp(s, id)?.x === prop.x,
      { timeoutMs: 5_000 },
    );

    await standLeftOf(guest, prop);
    const guestId: string = (await guest.probe.state()).player!.id;
    await guest.press(KEYS.carry, 70);
    await host.probe.waitFor(
      "the host grants the guest's pick-up",
      (s: E2eSnapshot): boolean => findProp(s, id)?.carrierId === guestId,
      { timeoutMs: 5_000 },
    );

    await guest.moveRight(400);
    await guest.wait(400);
    await host.probe.waitFor(
      `on the host screen the ${prop.kind} rides on the guest's head`,
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, id);
        const g: E2eRemotePlayerView | undefined = s.remotePlayers.find(
          (rp: E2eRemotePlayerView): boolean => rp.id === guestId,
        );
        return (
          !!q &&
          !!g &&
          q.carrierId === guestId &&
          Math.abs(propCenterX(q) - (g.x + WORLD.playerWidth / 2)) < 2 &&
          Math.abs(q.y + q.height - g.y) < 2 &&
          propCenterX(q) > propCenterX(prop) + 30
        );
      },
      { timeoutMs: 5_000 },
    );
    await host.attachCanvas(testInfo, 'host sees the guest carrying a prop');
    await guest.attachCanvas(testInfo, 'guest carrying a prop');

    await guest.press(KEYS.carry, 70);
    const landedOnHost: E2eSnapshot = await host.probe.waitFor(
      'the host throws it and it lands',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, id);
        return !!q && q.carrierId === null && q.isGrounded;
      },
      { timeoutMs: 5_000 },
    );
    const landed: LevelProp = findProp(landedOnHost, id)!;
    await guest.probe.waitFor(
      'the guest sees it land in the same spot',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, id);
        return (
          s.player!.carryingCorpseIds.length === 0 &&
          !!q &&
          q.carrierId === null &&
          q.isGrounded &&
          q.x === landed.x &&
          q.y === landed.y
        );
      },
      { timeoutMs: 5_000 },
    );
    await host.attachCanvas(testInfo, 'host: thrown prop');
    await guest.attachCanvas(testInfo, 'guest: thrown prop');

    // Solid for the guest where the host's simulation put it: the guest lands on its top.
    await guest.probe.teleport(
      propCenterX(landed) - WORLD.playerWidth / 2,
      landed.y - WORLD.playerHeight - 30,
    );
    await guest.probe.waitFor(
      'the guest lands on the thrown prop',
      (s: E2eSnapshot): boolean =>
        s.player!.isGrounded && s.player!.y + WORLD.playerHeight === landed.y,
      { timeoutMs: 5_000 },
    );
  });
});
