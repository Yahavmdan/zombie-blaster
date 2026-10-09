import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot, E2eVfxLogEntry, E2eZombieView } from '../../support/probe';
import { mealGroundX } from '../../support/navigation';
import { WORLD } from '../../support/invariants';

/** Lying corpses that draw an Eater (ZOMBIE_EATER_SPAWN_MIN_CORPSES). */
const MEALS: number = 3;
const PILE_SPAN: number = 160;
/** Hit particles of an Eater biting a zombie (ZOMBIE_EATER_BITE_COLOR). */
const BITE_COLOR: string = '#b02a22';

function eaters(s: E2eSnapshot): E2eZombieView[] {
  return s.zombies.filter((z: E2eZombieView): boolean => z.type === 'eater' && !z.isDead);
}

test.describe('eater zombie in co-op', { tag: '@online' }, (): void => {
  test('the guest sees the Eater come, eat with its eating animation, and the corpse vanish', async ({
    room,
  }: {
    room: RoomFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'eater',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    let x: number | null = mealGroundX(await host.probe.state(), PILE_SPAN);
    for (let seed: number = 1; x === null && seed <= 20; seed++) {
      await host.probe.setLayoutSeed(seed);
      await host.wait(300);
      x = mealGroundX(await host.probe.state(), PILE_SPAN);
    }
    expect(x, 'a floor layout with open ground').not.toBeNull();

    // Both rest on the safe spot: the hungry Eater can only go for zombies.
    const spot: { x: number; y: number; width: number } = (await host.probe.state()).level
      .safeSpot!;
    for (const p of session.players) {
      await p.probe.teleport(
        spot.x + spot.width / 2 - WORLD.playerWidth / 2,
        spot.y - WORLD.playerHeight,
      );
    }
    await host.probe.waitFor(
      'both players rest on the safe spot',
      (s: E2eSnapshot): boolean => s.restingPlayerIds.length === 2,
    );

    const known: Set<string> = new Set<string>(
      (await host.probe.state()).corpseViews.map((c: E2eCorpseView): string => c.id),
    );
    const meals: (s: E2eSnapshot) => E2eCorpseView[] = (s: E2eSnapshot): E2eCorpseView[] =>
      s.corpseViews.filter((c: E2eCorpseView): boolean => !known.has(c.id));
    await host.probe.dropCorpses(x! + PILE_SPAN / 2, MEALS);
    await guest.probe.waitFor(
      `the guest sees the ${MEALS} corpses lying`,
      (s: E2eSnapshot): boolean =>
        meals(s).filter((c: E2eCorpseView): boolean => c.isGrounded).length === MEALS,
      { timeoutMs: 15_000 },
    );

    const eating: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees an Eater eating, drawn with its eating animation',
      (s: E2eSnapshot): boolean =>
        eaters(s).some((z: E2eZombieView): boolean => z.eating && z.animState === 'eating'),
      { timeoutMs: 60_000 },
    );
    await guest.attachCanvas(testInfo, 'guest sees the eater eating');
    const lying: number = meals(eating).length;

    await guest.probe.waitFor(
      'the eaten corpse vanishes for the guest too',
      (s: E2eSnapshot): boolean => meals(s).length < lying,
      { timeoutMs: 10_000 },
    );

    // Once nothing is left to eat it hunts: the guest sees its bites land (replayed hit effects).
    const deadline: number = Date.now() + 60_000;
    let replayed: E2eVfxLogEntry[] = [];
    while (replayed.length === 0 && Date.now() < deadline) {
      await guest.wait(250);
      replayed = (await guest.probe.vfxLog()).filter(
        (e: E2eVfxLogEntry): boolean =>
          e.direction === 'replayed' &&
          e.type === 'hit-particles' &&
          e.color === BITE_COLOR &&
          (e.particlesAdded ?? 0) > 0,
      );
    }
    expect(replayed.length, "the guest drew the Eater's bite").toBeGreaterThan(0);
  });
});
