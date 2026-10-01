import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { Brain } from '../../support/brain';
import { E2eSnapshot } from '../../support/probe';

/** Mirrors EXIT_STACK_STEP_PX (floor 1, solo) in shared/game-constants.ts. */
const SOLO_FLOOR1_STEP_PX: number = 44;

test.describe('exit stack in co-op', { tag: '@online' }, (): void => {
  test('two players need twice the beam kills, and both screens agree on the goal', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'exitcoop',
    );
    const [h, g]: E2eSnapshot[] = await Promise.all([
      session.host.probe.waitFor(
        'host sees the guest',
        (s: E2eSnapshot): boolean => s.remotePlayers.length === 1,
      ),
      session.guests[0].probe.waitFor(
        'guest sees the host',
        (s: E2eSnapshot): boolean => s.remotePlayers.length === 1,
      ),
    ]);
    expect(h.exitStack.step, 'each kill adds half a solo step').toBeCloseTo(
      SOLO_FLOOR1_STEP_PX / 2,
      5,
    );
    const soloStepsNeeded: number = Math.ceil(
      (h.exitStack.baseY - h.exitStack.reachY) / SOLO_FLOOR1_STEP_PX,
    );
    expect(h.exitStack.stepsNeeded).toBeGreaterThanOrEqual(2 * soloStepsNeeded - 1);
    expect(g.exitStack.step, 'the guest HUD uses the same step').toBeCloseTo(h.exitStack.step, 5);
    expect(g.exitStack.stepsNeeded, 'the guest HUD shows the same goal').toBe(
      h.exitStack.stepsNeeded,
    );
  });

  test("a guest's kills from the beam build the host's stack, and both screens show it", async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'exitguest',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    // The host idles far from the beam; only the guest fights.
    await host.probe.teleport(40, 400);
    const brain: Brain = new Brain(guest, {
      deadline: Date.now() + 120_000,
      goal: 'exit',
      stopWhen: (s: E2eSnapshot): boolean => s.exitStack.steps >= 3,
    });
    await brain.run();
    const h: E2eSnapshot = await host.probe.waitFor(
      'host stack grew from guest kills',
      (s: E2eSnapshot): boolean => s.exitStack.steps >= 3,
      { timeoutMs: 10_000 },
    );
    const g: E2eSnapshot = await guest.probe.state();
    expect(g.exitStack.steps, 'the guest sees the same stack').toBe(h.exitStack.steps);
  });
});
