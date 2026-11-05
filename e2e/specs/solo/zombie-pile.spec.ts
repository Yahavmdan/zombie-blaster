import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eCorpseView, E2eGadgetView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { zombiePileRoom } from '../../support/gadget-layouts';

const BODIES: number = 6;
const PILE_X: number = 236;
const DOOR_ID: string = 'g2';
/** Mirrors GADGET_DOOR_TICKS in shared/game-constants.ts. */
const DOOR_TICKS: number = 30;

function door(s: E2eSnapshot): E2eGadgetView {
  const g: E2eGadgetView | undefined = s.gadgets.find(
    (x: E2eGadgetView): boolean => x.id === DOOR_ID,
  );
  if (!g) throw new Error('no door');
  return g;
}

async function quiet(p: GamePlayer): Promise<void> {
  await p.probe.setGodMode(true);
  await p.probe.pauseZombieSpawns(true);
  await p.probe.clearZombies();
}

test.describe('zombie pile (designed floors)', { tag: '@solo' }, (): void => {
  test('its bodies lie there from the start: they weigh down a button and can be carried', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quiet(p);
    await p.probe.loadLayout(zombiePileRoom(PILE_X, BODIES));

    const settled: E2eSnapshot = await p.probe.waitFor(
      'every body of the pile has landed and the button holds the door open',
      (s: E2eSnapshot): boolean =>
        s.corpseViews.length === BODIES &&
        s.corpseViews.every((c: E2eCorpseView): boolean => c.isGrounded && c.frozen) &&
        door(s).openTicks >= DOOR_TICKS,
      { timeoutMs: 10_000 },
    );
    const footYs: Set<number> = new Set<number>(
      settled.corpseViews.map((c: E2eCorpseView): number => Math.round(c.footY)),
    );
    expect(footYs.size, 'they lie in a heap, not in a line').toBeGreaterThan(1);

    await p.probe.teleport(PILE_X - WORLD.playerWidth, WORLD.groundY - WORLD.playerHeight);
    await p.wait(500);
    await p.press(KEYS.carry);
    await p.probe.waitFor(
      'the player picked a body off the pile',
      (s: E2eSnapshot): boolean =>
        s.corpseViews.some((c: E2eCorpseView): boolean => c.carrierId !== null),
      { timeoutMs: 5_000 },
    );
  });
});
