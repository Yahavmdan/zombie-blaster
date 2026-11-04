import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';
import { layoutWhere } from '../../support/navigation';
import {
  clearSpot,
  findProp,
  LevelProp,
  Overhang,
  overhangSetup,
  stackPair,
  StackPair,
  throwOnto,
} from '../../support/props';

test.describe('tumbling props in co-op', { tag: '@online' }, (): void => {
  test('a rail tipping off a ledge on the host tips on the guest screen too and rests in the same spot', async ({
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
      'tumble',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    const s0: E2eSnapshot = await layoutWhere(
      host,
      'a rail and a ledge with room past its end',
      (s: E2eSnapshot): boolean => overhangSetup(s) !== undefined,
    );
    const setup: Overhang = overhangSetup(s0)!;
    const id: string = setup.rail.id!;
    await guest.probe.waitFor(
      "the guest follows the host's layout",
      (s: E2eSnapshot): boolean =>
        s.level.seed === s0.level.seed && findProp(s, id)?.x === setup.rail.x,
      { timeoutMs: 5_000 },
    );

    await host.probe.dropProp(id, setup.dropX, setup.dropY);
    let guestTurned: number = 0;
    await guest.probe.waitFor(
      'on the guest screen the rail turns as it tips off',
      (s: E2eSnapshot): boolean => {
        guestTurned = Math.max(guestTurned, findProp(s, id)?.angle ?? 0);
        return guestTurned > 0.3;
      },
      { timeoutMs: 5_000 },
    );
    const onHost: E2eSnapshot = await host.probe.waitFor(
      'the rail comes to rest upright below the ledge',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, id);
        return !!q && q.resting && q.y + q.height > setup.ledge.y;
      },
      { timeoutMs: 10_000 },
    );
    const rested: LevelProp = findProp(onHost, id)!;
    await guest.probe.waitFor(
      'the guest sees it rest upright in the same spot',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, id);
        return !!q && q.resting && q.angle === 0 && q.x === rested.x && q.y === rested.y;
      },
      { timeoutMs: 5_000 },
    );
    expect(rested.angle).toBe(0);
    await host.attachCanvas(testInfo, 'host: rail tipped off');
    await guest.attachCanvas(testInfo, 'guest: rail tipped off');
  });

  test('a prop the host throws onto another lies on top of it on the guest screen too', async ({
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
      'stack',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.pauseZombieSpawns(true);

    const s0: E2eSnapshot = await layoutWhere(
      host,
      'two loose props and open ground',
      (s: E2eSnapshot): boolean => stackPair(s) !== undefined,
    );
    const pair: StackPair = stackPair(s0)!;
    const base: LevelProp = await clearSpot(host, pair);
    const stacked: LevelProp = await throwOnto(host, pair.thrown.id!, base);
    expect(stacked.y + stacked.height).toBe(base.y);

    await guest.probe.waitFor(
      'the guest sees it rest on top in the same spot',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, stacked.id!);
        return !!q && q.resting && q.x === stacked.x && q.y === stacked.y;
      },
      { timeoutMs: 5_000 },
    );
    await host.attachCanvas(testInfo, 'host: prop stacked');
    await guest.attachCanvas(testInfo, 'guest: prop stacked');
  });
});
