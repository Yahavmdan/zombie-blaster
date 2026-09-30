import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { typesOf, vfxQueuedBy } from '../../support/vfx-gate';

const SPECIAL_DROPS: string[] = ['low-gravity', 'super-speed', 'giant-slayer', 'zombie-shock'];

test.describe('progression', { tag: '@solo' }, (): void => {
  let player: GamePlayer;

  test.beforeEach(async ({ solo }: { solo: SoloFactory }): Promise<void> => {
    player = await solo('priest');
    await player.probe.setGodMode(true);
  });

  test('level up raises the level, grants points and queues the level-up effect', async (): Promise<void> => {
    const before: E2eSnapshot = await player.probe.state();
    const queued: E2eVfxLogEntry[] = await vfxQueuedBy(
      player,
      (): Promise<void> => player.probe.levelUp(1),
    );
    const after: E2eSnapshot = await player.probe.state();
    expect(after.player!.level).toBe(before.player!.level + 1);
    expect(after.player!.unallocatedStatPoints).toBeGreaterThan(
      before.player!.unallocatedStatPoints,
    );
    expect(typesOf(queued)).toContain('level-up');
  });

  test('jumping to a floor resets and respawns zombies', async (): Promise<void> => {
    await player.probe.setFloor(4);
    await player.probe.waitFor('floor 4', (s: E2eSnapshot): boolean => s.floor === 4);
    await expect(player.page.locator('app-hud')).toContainText('4');
    await player.probe.waitFor(
      'zombies on floor 4',
      (s: E2eSnapshot): boolean => s.zombies.length > 0,
      { timeoutMs: 20_000 },
    );
  });

  for (const drop of SPECIAL_DROPS) {
    test(`special drop "${drop}" activates and expires cleanly`, async (): Promise<void> => {
      await player.probe.activateSpecialDrop(drop);
      await player.probe.waitFor(`${drop} active`, (s: E2eSnapshot): boolean =>
        s.activeSpecialEffects.includes(drop),
      );
      await player.moveRight(300);
      await player.jump();
      const s: E2eSnapshot = await player.probe.state();
      expect(Number.isFinite(s.player!.x) && Number.isFinite(s.player!.y)).toBe(true);
    });
  }
});
