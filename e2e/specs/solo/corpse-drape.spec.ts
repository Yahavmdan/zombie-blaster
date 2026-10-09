import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot } from '../../support/probe';
import { openGroundX } from '../../support/navigation';

/** Bodies dropped on one spot: they stack into a pile, some facing each way. */
const PILE: number = 8;
/** A body lies this far each side of its feet (sprite), so the pile needs this much open ground. */
const PILE_SPAN: number = 160;

/** Centre of a stretch of open ground on this floor (re-rolling the layout until it has one). */
async function openGround(p: GamePlayer): Promise<number> {
  for (let seed: number = 1; seed <= 20; seed++) {
    const x: number | null = openGroundX(await p.probe.state(), PILE_SPAN);
    if (x !== null) return x + PILE_SPAN / 2;
    await p.probe.setLayoutSeed(seed);
    await p.wait(200);
  }
  throw new Error('no floor layout with open ground');
}

test.describe('corpse piles', { tag: '@solo' }, (): void => {
  test('bodies on a pile drape over what is under them instead of floating', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const x: number = await openGround(p);

    const known: Set<string> = new Set<string>(
      (await p.probe.state()).corpseViews.map((c: E2eCorpseView): string => c.id),
    );
    const fresh: (s: E2eSnapshot) => E2eCorpseView[] = (s: E2eSnapshot): E2eCorpseView[] =>
      s.corpseViews.filter((c: E2eCorpseView): boolean => !known.has(c.id));
    await p.probe.dropCorpses(x, PILE);
    const landed: E2eSnapshot = await p.probe.waitFor(
      `the ${PILE} bodies land in a pile`,
      (s: E2eSnapshot): boolean =>
        fresh(s).length === PILE && fresh(s).every((c: E2eCorpseView): boolean => c.isGrounded),
      { timeoutMs: 15_000 },
    );
    const pile: E2eCorpseView[] = fresh(landed);
    expect(
      pile.every((c: E2eCorpseView): boolean => c.drape !== null),
      'every lying body is draped',
    ).toBe(true);
    const lowest: E2eCorpseView = pile.reduce(
      (a: E2eCorpseView, b: E2eCorpseView): E2eCorpseView => (b.footY > a.footY ? b : a),
    );
    expect(lowest.drape, 'the bottom body lies flat on the ground').toBe(0);
    const deepest: number = Math.max(...pile.map((c: E2eCorpseView): number => c.drape!));
    expect(deepest, 'bodies higher up sag down over the pile and the ground').toBeGreaterThan(4);
    await p.attachCanvas(testInfo, 'draped pile');
  });
});
