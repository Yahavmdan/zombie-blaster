import { Page, TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { closeDevTools, openDevTools } from '../../support/dev-tools';

/**
 * The dragon boss is a boss: it turns to face the player (also one who slips behind it), a hit only
 * nudges it (DRAGON_KNOCKBACK_TAKEN_MULT, no tilt), and once slain it falls, fades out and is gone
 * (DRAGON_CORPSE_LINGER_TICKS) while ordinary corpses stay for piles.
 */

/** Mirrors DRAGON_CORPSE_LINGER_TICKS / TICK_RATE in shared/game-constants.ts (200 ticks at 50/s). */
const DRAGON_CORPSE_LINGER_MS: number = 4_000;
/** Mirrors DRAGON_KNOCKBACK_FRAMES. */
const DRAGON_KNOCKBACK_FRAMES: number = 4;

function dragonOf(s: E2eSnapshot): E2eZombieView | undefined {
  return s.zombies.find((z: E2eZombieView): boolean => z.type === 'dragon-boss' && !z.isDead);
}

/** God mode, spawns off, no zombies; then a dragon climbs out at x and takes to the air. */
async function dragonAt(p: GamePlayer, x: number): Promise<E2eZombieView> {
  await p.probe.setGodMode(true);
  await devClick(p.page, 'game-dev-button-zombie-spawns');
  await p.probe.clearZombies();
  await p.probe.spawnZombieAt(x, 'dragon-boss');
  const s: E2eSnapshot = await p.probe.waitFor(
    'the dragon is up and hovering',
    (st: E2eSnapshot): boolean => {
      const d: E2eZombieView | undefined = dragonOf(st);
      return !!d && d.spawnTimer <= 0 && d.y + d.height < WORLD.groundY - 60;
    },
    { timeoutMs: 15_000 },
  );
  return dragonOf(s)!;
}

async function devClick(page: Page, testId: string): Promise<void> {
  await openDevTools(page);
  await page.getByTestId(testId).click();
  await closeDevTools(page);
}

test.describe('dragon boss', { tag: '@solo' }, (): void => {
  test('it turns to face a player who gets behind it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const d: E2eZombieView = await dragonAt(p, 640);
    const groundY: number = WORLD.groundY - WORLD.playerHeight;

    await p.probe.teleport(Math.max(20, d.x - 260), groundY);
    await p.probe.waitFor(
      'it faces the player on its left',
      (s: E2eSnapshot): boolean => dragonOf(s)?.facing === -1,
      { timeoutMs: 5_000 },
    );

    const now: E2eZombieView = dragonOf(await p.probe.state())!;
    await p.probe.teleport(Math.min(WORLD.width - 60, now.x + now.width + 120), groundY);
    await p.probe.waitFor(
      'it turns around to face the player on its right',
      (s: E2eSnapshot): boolean => dragonOf(s)?.facing === 1,
      { timeoutMs: 5_000 },
    );
    await p.attachCanvas(testInfo, 'dragon facing the player behind it');
  });

  test('a hit only nudges it and never tilts it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const start: E2eZombieView = await dragonAt(p, 640);
    let hits: number = 0;
    for (let i: number = 0; i < 12 && hits < 3; i++) {
      const before: E2eZombieView = dragonOf(await p.probe.state())!;
      // Up beside it, on its left, facing it: the swing reaches its body.
      await p.probe.teleport(
        before.x - WORLD.playerWidth - 4,
        before.y + before.height / 2 - WORLD.playerHeight / 2,
      );
      await p.face('right');
      await p.attack();
      const after: E2eSnapshot = await p.probe.state();
      const d: E2eZombieView | undefined = dragonOf(after);
      if (!d || d.hp >= before.hp) continue;
      hits++;
      expect(d.angle, 'the dragon never tilts').toBe(0);
      expect(d.knockbackFrames, 'knocked only for a moment').toBeLessThanOrEqual(
        DRAGON_KNOCKBACK_FRAMES,
      );
      // A zombie flies ~80 px from a swing; the dragon moves a few px (plus its own steering).
      expect(Math.abs(d.x - before.x), 'barely pushed').toBeLessThan(30);
    }
    expect(hits, `landed hits on the dragon (hp ${start.hp})`).toBeGreaterThan(0);
  });

  test('slain, it falls, fades and is gone; other corpses stay', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const d: E2eZombieView = await dragonAt(p, 640);
    await p.probe.spawnZombieAt(250);
    await p.probe.waitFor(
      'a walker climbed out',
      (s: E2eSnapshot): boolean =>
        s.zombies.some((z: E2eZombieView): boolean => z.type === 'walker' && z.spawnTimer <= 0),
      { timeoutMs: 10_000 },
    );

    await devClick(p.page, 'game-dev-button-kill-all');
    const fallen: E2eSnapshot = await p.probe.waitFor(
      'the dragon corpse lies on the ground',
      (s: E2eSnapshot): boolean =>
        s.corpseViews.some((c: E2eCorpseView): boolean => c.id === d.id && c.isGrounded),
      { timeoutMs: 5_000 },
    );
    await p.attachCanvas(testInfo, 'slain dragon on the ground');
    const walkers: number = fallen.corpseViews.filter(
      (c: E2eCorpseView): boolean => c.id !== d.id,
    ).length;
    expect(walkers, 'the walker left a corpse').toBeGreaterThan(0);

    const gone: E2eSnapshot = await p.probe.waitFor(
      'the dragon corpse is gone',
      (s: E2eSnapshot): boolean =>
        !s.corpseViews.some((c: E2eCorpseView): boolean => c.id === d.id),
      { timeoutMs: DRAGON_CORPSE_LINGER_MS + 3_000 },
    );
    await p.wait(1_000);
    const later: E2eSnapshot = await p.probe.state();
    expect(
      later.corpseViews.filter((c: E2eCorpseView): boolean => c.id !== d.id).length,
      'ordinary corpses stay',
    ).toBe(gone.corpseViews.length);
  });
});
