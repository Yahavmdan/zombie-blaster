import { Locator } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';

interface DialogCase {
  name: string;
  key: string;
  selector: string;
}

const DIALOGS: DialogCase[] = [
  { name: 'stats', key: KEYS.openStats, selector: 'app-stat-allocation' },
  { name: 'skill tree', key: KEYS.openSkills, selector: 'app-skill-tree' },
  { name: 'shop', key: KEYS.openShop, selector: 'app-shop' },
  { name: 'inventory', key: KEYS.openInventory, selector: 'app-inventory' },
];

test.describe('in-game UI', { tag: '@solo' }, (): void => {
  let player: GamePlayer;

  test.beforeEach(async ({ solo }: { solo: SoloFactory }): Promise<void> => {
    player = await solo('ranger');
    await player.probe.setGodMode(true);
  });

  for (const dialog of DIALOGS) {
    test(`${dialog.name}: opens with its key, blocks movement, closes with Escape`, async (): Promise<void> => {
      const panel: Locator = player.page.locator(dialog.selector);
      await player.page.keyboard.press(dialog.key);
      await expect(panel).toBeVisible();

      const before: E2eSnapshot = await player.probe.state();
      await player.moveRight(500);
      const during: E2eSnapshot = await player.probe.state();
      expect(
        Math.abs(during.player!.x - before.player!.x),
        'movement is blocked while a dialog is open',
      ).toBeLessThan(3);

      await player.page.keyboard.press('Escape');
      await expect(panel).toBeHidden();

      await player.moveRight(400);
      const after: E2eSnapshot = await player.probe.state();
      expect(after.player!.x, 'movement works again after closing').toBeGreaterThan(
        during.player!.x + 10,
      );
    });
  }

  test('movement keys do not stick when a dialog opens mid-run', async (): Promise<void> => {
    await player.hold(KEYS.right);
    await player.wait(300);
    await player.page.keyboard.press(KEYS.openStats);
    await player.release(KEYS.right);
    await player.page.keyboard.press('Escape');
    await player.probe.waitFor(
      'player stopped',
      (s: E2eSnapshot): boolean => Math.abs(s.player!.velocityX) < 0.5,
      { timeoutMs: 2_000 },
    );
    const a: E2eSnapshot = await player.probe.state();
    await player.wait(500);
    const b: E2eSnapshot = await player.probe.state();
    expect(Math.abs(b.player!.x - a.player!.x)).toBeLessThan(3);
  });

  test('stat points can be allocated from the stats dialog', async (): Promise<void> => {
    await player.probe.levelUp(1);
    const before: E2eSnapshot = await player.probe.waitFor(
      'stat points granted',
      (s: E2eSnapshot): boolean => s.player!.unallocatedStatPoints > 0,
    );
    await player.page.keyboard.press(KEYS.openStats);
    await player.page.getByTestId('stat-allocation-button-add-dex').click();
    const after: E2eSnapshot = await player.probe.waitFor(
      'point spent',
      (s: E2eSnapshot): boolean =>
        s.player!.unallocatedStatPoints === before.player!.unallocatedStatPoints - 1,
    );
    expect(after.player!.unallocatedStatPoints).toBe(before.player!.unallocatedStatPoints - 1);
  });

  test('skill points can be invested from the skill tree', async (): Promise<void> => {
    await player.probe.levelUp(10);
    await player.probe.waitFor(
      'skill points granted',
      (s: E2eSnapshot): boolean => s.player!.unallocatedSkillPoints > 0,
    );
    await player.page.keyboard.press(KEYS.openSkills);
    const invest: Locator = player.page
      .locator('[data-testid^="skill-tree-button-invest-"]:enabled')
      .first();
    await expect(invest).toBeVisible();
    const testId: string = (await invest.getAttribute('data-testid')) ?? '';
    const skillId: string = testId.replace('skill-tree-button-invest-', '');
    const before: E2eSnapshot = await player.probe.state();
    await invest.click();
    const after: E2eSnapshot = await player.probe.waitFor(
      `${skillId} invested`,
      (s: E2eSnapshot): boolean =>
        (s.player!.skillLevels[skillId] ?? 0) > (before.player!.skillLevels[skillId] ?? 0),
    );
    expect(after.player!.unallocatedSkillPoints).toBe(before.player!.unallocatedSkillPoints - 1);
  });

  test('settings dialog opens and closes with Escape', async (): Promise<void> => {
    await player.page.getByTestId('game-settings-button-toggle').click();
    await expect(player.page.getByTestId('game-settings-button-close')).toBeVisible();
    await player.page.keyboard.press('Escape');
    await expect(player.page.getByTestId('game-settings-button-close')).toBeHidden();
  });
});
