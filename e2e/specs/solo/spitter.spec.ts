import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { typesOf, vfxQueuedBy } from '../../support/vfx-gate';

/**
 * Spitters (art: tools/spitter-sprites/build.mjs): bile sprays out of the mouth (`spit-spray`),
 * the glob is lobbed in an arc at the nearest player and bursts (`spit-splat`) on whatever it
 * hits. On a surface it leaves an acid puddle for a while (drawing only); on a player it poisons
 * them (`poison-trigger`): a sickly green sprite that bubbles and drips bile.
 */

/** Mirrors GROUND_Y and PLAYER_HEIGHT in shared/game-constants.ts. */
const GROUND_Y: number = 620;
const PLAYER_HEIGHT: number = 48;
const PLAYER_X: number = 300;
/** Inside SPITTER_ATTACK_RANGE (280) and outside the spitter's back-off distance (100). */
const SPITTER_X: number = 520;
/** Mirror SPITTER_ATTACK_RANGE, SPITTER_PROJECTILE_SPEED and SPITTER_PROJECTILE_GRAVITY. */
const SPITTER_RANGE: number = 280;
const SPIT_SPEED: number = 4.5;
const SPIT_GRAVITY: number = 0.08;

async function faceASpitter(p: GamePlayer, godMode: boolean): Promise<void> {
  await p.probe.setGodMode(godMode);
  await p.probe.clearZombies();
  await p.probe.teleport(PLAYER_X, GROUND_Y - PLAYER_HEIGHT);
}

test.describe('spitter spit and poison', { tag: '@solo' }, (): void => {
  test('a glob that misses splats into an acid puddle on the surface it hit', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    // God mode: globs fly through the player, so each one lands somewhere.
    await faceASpitter(p, true);

    const queued: E2eVfxLogEntry[] = await vfxQueuedBy(
      p,
      async (): Promise<void> => {
        await p.probe.spawnZombieAt(SPITTER_X, 'spitter');
        await p.probe.waitFor(
          'a glob splatted into a puddle',
          (s: E2eSnapshot): boolean => s.acidPuddles.length > 0,
          { timeoutMs: 25_000, intervalMs: 50 },
        );
      },
      100,
    );
    await p.attachCanvas(testInfo, 'spit puddle');

    expect(typesOf(queued), 'the spray and the splat are queued for the others').toEqual(
      expect.arrayContaining(['spit-spray', 'spit-splat']),
    );
    const s: E2eSnapshot = await p.probe.state();
    // The ground, a ledge, or the top of a barrel or box lying there.
    const surfaces: number[] = [
      GROUND_Y,
      ...s.level.platforms.map((pl: { y: number }): number => pl.y),
      ...s.level.props.map((pr: { y: number }): number => pr.y),
    ];
    for (const puddle of s.acidPuddles) {
      expect(surfaces, 'a puddle lies on a surface').toContain(puddle.y);
      expect(puddle.width).toBeGreaterThanOrEqual(16);
    }
  });

  test('a player on a ledge right above a spitter gets a lob, not a near-instant shot', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    await p.probe.clearZombies();
    const ledge: { x: number; y: number; width: number } | undefined = (await p.probe.state()).level.platforms.find(
      (pl: { y: number; width: number }): boolean =>
        pl.y > GROUND_Y - SPITTER_RANGE + 40 && pl.y < GROUND_Y - 80 && pl.width >= 60,
    );
    test.skip(!ledge, 'this layout has no ledge within spitting height');
    const ledgeMid: number = ledge!.x + ledge!.width / 2;
    await p.probe.teleport(ledgeMid - 10, ledge!.y - PLAYER_HEIGHT);

    // Launch speed of every glob seen: vx never changes, vy gains gravity every tick.
    const launchSpeeds: number[] = [];
    await p.probe.spawnZombieAt(ledgeMid, 'spitter');
    await p.probe.waitFor(
      'a few globs in flight',
      (s: E2eSnapshot): boolean => {
        for (const g of s.spitGlobs) {
          launchSpeeds.push(Math.hypot(g.vx, g.vy - SPIT_GRAVITY * g.ticksFlown));
        }
        return launchSpeeds.length >= 20;
      },
      { timeoutMs: 25_000, intervalMs: 16 },
    );
    await p.attachCanvas(testInfo, 'spit at a ledge overhead');

    // Before: aimed by horizontal distance only, so a glob straight up arrived in about 1 tick.
    expect(Math.max(...launchSpeeds), 'no glob shoots out suddenly fast').toBeLessThan(SPIT_SPEED * 2);
  });

  test('a glob that hits poisons the player: green tint, bubbles and drips', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await faceASpitter(p, false);
    const hp: number = (await p.probe.state()).player!.hp;

    const queued: E2eVfxLogEntry[] = await vfxQueuedBy(
      p,
      async (): Promise<void> => {
        await p.probe.spawnZombieAt(SPITTER_X, 'spitter');
        await p.probe.waitFor(
          'the player is poisoned',
          (s: E2eSnapshot): boolean => (s.player?.tint.poisonTicks ?? 0) > 0,
          { timeoutMs: 25_000, intervalMs: 25 },
        );
      },
      600,
    );
    await p.attachCanvas(testInfo, 'poisoned player');

    expect((await p.probe.state()).player!.hp, 'the glob hurt').toBeLessThan(hp);
    expect(typesOf(queued), 'splat on the player and the poison are queued for the others').toEqual(
      expect.arrayContaining(['spit-spray', 'spit-splat', 'poison-trigger']),
    );
  });
});
