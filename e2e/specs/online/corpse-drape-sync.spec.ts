import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot } from '../../support/probe';
import { openGroundX } from '../../support/navigation';

const PILE: number = 8;
const PILE_SPAN: number = 160;

test.describe('corpse piles in co-op', { tag: '@online' }, (): void => {
  test('the guest sees the pile draped exactly like the host does', async ({
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
      'drape',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    let x: number | null = openGroundX(await host.probe.state(), PILE_SPAN);
    for (let seed: number = 1; x === null && seed <= 20; seed++) {
      await host.probe.setLayoutSeed(seed);
      await host.wait(300);
      x = openGroundX(await host.probe.state(), PILE_SPAN);
    }
    expect(x, 'a floor layout with open ground').not.toBeNull();

    const known: Set<string> = new Set<string>(
      (await host.probe.state()).corpseViews.map((c: E2eCorpseView): string => c.id),
    );
    const pileOf: (s: E2eSnapshot) => E2eCorpseView[] = (s: E2eSnapshot): E2eCorpseView[] =>
      s.corpseViews.filter((c: E2eCorpseView): boolean => !known.has(c.id) && c.isGrounded);
    await host.probe.dropCorpses(x! + PILE_SPAN / 2, PILE);
    const onHost: E2eSnapshot = await host.probe.waitFor(
      `the ${PILE} bodies land in a pile`,
      (s: E2eSnapshot): boolean => pileOf(s).length === PILE,
      { timeoutMs: 15_000 },
    );
    const hostDrapes: Map<string, number> = new Map<string, number>(
      pileOf(onHost).map((c: E2eCorpseView): [string, number] => [c.id, c.drape!]),
    );
    expect(Math.max(...hostDrapes.values()), 'the host drapes the pile').toBeGreaterThan(4);

    await guest.probe.waitFor(
      'the guest drapes every body the same',
      (s: E2eSnapshot): boolean => {
        const pile: E2eCorpseView[] = pileOf(s);
        return (
          pile.length === PILE &&
          pile.every(
            (c: E2eCorpseView): boolean =>
              c.drape !== null && Math.abs(c.drape - (hostDrapes.get(c.id) ?? NaN)) < 1,
          )
        );
      },
      { timeoutMs: 10_000 },
    );
    await host.attachCanvas(testInfo, 'host pile');
    await guest.attachCanvas(testInfo, 'guest pile');
  });
});
