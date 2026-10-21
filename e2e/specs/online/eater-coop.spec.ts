import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot, E2eVfxLogEntry, E2eZombieView } from '../../support/probe';
import { LevelPlatform, levelPlatforms, mealGroundX } from '../../support/navigation';
import { WORLD } from '../../support/invariants';

/** Lying corpses that draw an Eater (ZOMBIE_EATER_SPAWN_MIN_CORPSES). */
const MEALS: number = 3;
const PILE_SPAN: number = 160;
/** Hit particles of an Eater biting a zombie (ZOMBIE_EATER_BITE_COLOR). */
const BITE_COLOR: string = '#b02a22';
/** An Eater's jump (ZOMBIE_EATER_JUMP_FORCE) and the frames of its pounce (Jump.png). */
const EATER_JUMP_FORCE: number = -12;
const POUNCE_FRAMES: number = 8;

/** The pounce frame for a vertical speed: launch, apex at 0, touchdown at the jump's speed coming down. */
function pounceFrame(velocityY: number): number {
  const progress: number = (velocityY - EATER_JUMP_FORCE) / (-2 * EATER_JUMP_FORCE);
  return Math.min(POUNCE_FRAMES - 1, Math.max(0, Math.floor(progress * POUNCE_FRAMES)));
}

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

  test('the guest sees the Eater pounce up to a ledge: its frames follow the jump, rising then falling', async ({
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
      'eater-pounce',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    const s0: E2eSnapshot = await host.probe.state();
    const spot: { x: number; y: number; width: number } = s0.level.safeSpot!;
    const ledges: LevelPlatform[] = levelPlatforms(s0).filter(
      (pl: LevelPlatform): boolean =>
        pl.y < WORLD.groundY &&
        pl.y > spot.y &&
        pl.width >= 128 &&
        (pl.x >= s0.exitPile.columnRight || pl.x + pl.width <= s0.exitPile.columnLeft),
    );
    expect(ledges.length, 'a ledge above the ground').toBeGreaterThan(0);
    const ledge: LevelPlatform = ledges[0];
    for (const p of session.players) {
      await p.probe.teleport(
        spot.x + spot.width / 2 - WORLD.playerWidth / 2,
        spot.y - WORLD.playerHeight,
      );
    }
    await host.probe.dropCorpses(ledge.x + ledge.width / 2, MEALS);

    // Every airborne Eater the guest draws: the frame it shows and the frame its synced speed calls for.
    const seen: { frame: number; expected: number }[] = [];
    await guest.probe.waitFor(
      'the guest sees the Eater rise and fall through its pounce',
      (s: E2eSnapshot): boolean => {
        for (const z of eaters(s)) {
          if (z.isGrounded || z.animState !== 'jump' || z.animFrame === null) continue;
          seen.push({ frame: z.animFrame, expected: pounceFrame(z.velocityY) });
        }
        const frames: Set<number> = new Set<number>(
          seen.map((v: { frame: number }): number => v.frame),
        );
        return (
          [...frames].some((f: number): boolean => f < 3) &&
          [...frames].some((f: number): boolean => f > 4)
        );
      },
      { timeoutMs: 90_000, intervalMs: 40 },
    );
    await guest.attachCanvas(testInfo, 'guest sees the eater pounce');
    for (const v of seen)
      expect(v.frame, 'the pounce frame matches its vertical speed').toBe(v.expected);
  });
});
