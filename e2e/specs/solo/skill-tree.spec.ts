import { Locator, Page } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';

const SHOULDER_CHARGE: string = 'warrior-shoulder-charge';
const SLASH_BLAST: string = 'warrior-slash-blast';
const BACKSTEP: string = 'warrior-backstep';
const POWER_DASH: string = 'warrior-power-dash';

async function openTree(page: Page): Promise<Locator> {
  await page.keyboard.press(KEYS.openSkills);
  const root: Locator = page.locator('app-tree-skill-window');
  await expect(root).toBeVisible();
  return root;
}

/** Clicks a node, then Learn, like a player would. */
async function learn(page: Page, skillId: string): Promise<void> {
  await page.getByTestId(`tree-node-${skillId}`).click();
  await page.getByTestId('tree-learn-button').click();
  await expect(page.getByTestId(`tree-node-${skillId}`)).toHaveAttribute('data-state', 'owned');
}

test.describe('warrior skill tree', { tag: '@solo' }, (): void => {
  let player: GamePlayer;

  test.beforeEach(async ({ solo }: { solo: SoloFactory }): Promise<void> => {
    player = await solo('warrior');
    await player.probe.setGodMode(true);
  });

  test('a fresh warrior has 1 point and learns a tier-1 skill from the tree', async (): Promise<void> => {
    const page: Page = player.page;
    await openTree(page);
    await expect(page.locator('app-skill-tree')).toHaveCount(0);
    await expect(page.getByTestId('tree-points')).toContainText('1');
    await expect(page.getByTestId(`tree-node-${SHOULDER_CHARGE}`)).toHaveAttribute(
      'data-state',
      'available',
    );
    await expect(page.getByTestId(`tree-node-${SHOULDER_CHARGE}`)).not.toHaveAttribute(
      'draggable',
      'true',
    );

    await learn(page, SHOULDER_CHARGE);

    await expect(page.getByTestId('tree-points')).toContainText('0');
    await expect(page.getByTestId('tree-owned-chip')).toBeVisible();
    await player.probe.waitFor(
      'shoulder charge owned, point spent',
      (s: E2eSnapshot): boolean =>
        s.player!.skillLevels[SHOULDER_CHARGE] === 1 && s.player!.unallocatedSkillPoints === 0,
    );
    // The other roots now say there is no point left.
    await page.getByTestId(`tree-node-${POWER_DASH}`).click();
    await expect(page.getByTestId('tree-lock-reason')).toHaveText('No skill points left');
    await expect(page.getByTestId('tree-learn-button')).toBeDisabled();
  });

  test('a tier-2 node needs level 4, then its parent', async (): Promise<void> => {
    const page: Page = player.page;
    await openTree(page);
    const node: Locator = page.getByTestId(`tree-node-${SLASH_BLAST}`);
    await expect(node).toHaveAttribute('data-state', 'locked');
    await node.click();
    await expect(page.getByTestId('tree-lock-reason')).toHaveText('Needs level 4');
    await expect(page.getByTestId('tree-learn-button')).toBeDisabled();

    await player.probe.levelUp(3);
    await player.probe.waitFor('level 4', (s: E2eSnapshot): boolean => s.player!.level === 4);
    await expect(page.getByTestId('tree-lock-reason')).toHaveText('Needs Power Dash');

    await learn(page, POWER_DASH);
    await node.click();
    await expect(node).toHaveAttribute('data-state', 'available');
    await expect(page.getByTestId('tree-learn-button')).toBeEnabled();
    await expect(page.getByTestId('tree-lock-reason')).toHaveCount(0);
  });

  test('respec forgets the skills and gives the points back, the next one costs gold', async (): Promise<void> => {
    const page: Page = player.page;
    await openTree(page);
    const respec: Locator = page.getByTestId('tree-respec-button');
    await expect(respec).toBeDisabled();

    await learn(page, SHOULDER_CHARGE);
    await expect(respec).toHaveText('Respec');
    await respec.click();

    await expect(page.getByTestId(`tree-node-${SHOULDER_CHARGE}`)).toHaveAttribute(
      'data-state',
      'available',
    );
    await expect(page.getByTestId('tree-points')).toContainText('1');
    await player.probe.waitFor(
      'shoulder charge forgotten, point back',
      (s: E2eSnapshot): boolean =>
        (s.player!.skillLevels[SHOULDER_CHARGE] ?? 0) === 0 && s.player!.unallocatedSkillPoints === 1,
    );
    // The first respec was free; the next one has a price and nothing to forget yet.
    await expect(respec).toContainText('gold');
    await expect(respec).toBeDisabled();
  });

  test('a learned active goes on the skill bar: the HUD shows its key and the key fires it', async (): Promise<void> => {
    const page: Page = player.page;
    await player.probe.levelUp(3);
    await openTree(page);
    await learn(page, SHOULDER_CHARGE);

    const toast: Locator = page.getByTestId('new-move-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Shoulder Charge');
    await expect(page.getByTestId('new-move-key')).toHaveText('1');
    await expect(page.getByTestId('tree-detail-use')).toContainText('Press');

    await learn(page, BACKSTEP);
    await expect(toast).toContainText('Backstep');
    await expect(page.getByTestId('new-move-key')).toHaveText('2');
    await expect(page.getByTestId('tree-bar-slot-1')).toHaveAttribute('data-skill', BACKSTEP);
    await page.keyboard.press('Escape');
    await expect(page.locator('app-tree-skill-window')).toBeHidden();

    await expect(page.getByTestId('hud-bar-slot-0')).toHaveAttribute('data-skill', SHOULDER_CHARGE);
    await expect(page.getByTestId('hud-bar-slot-1')).toHaveAttribute('data-skill', BACKSTEP);
    await expect(page.getByTestId('hud-bar-slot-2')).toHaveAttribute('data-skill', '');

    await player.castSkill(2);
    await player.probe.waitFor(
      'key 2 fired the backstep',
      (s: E2eSnapshot): boolean =>
        (s.treeSkills.find((t: { id: string }): boolean => t.id === BACKSTEP)?.cooldownTicks ?? 0) > 0,
      { timeoutMs: 2_000 },
    );
    await expect(toast).toBeHidden({ timeout: 10_000 });
  });

  test('power dash is an attack combo: the plate and the window say how, the bar stays empty', async (): Promise<void> => {
    const page: Page = player.page;
    await openTree(page);
    await learn(page, POWER_DASH);

    const toast: Locator = page.getByTestId('new-move-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Power Dash');
    await expect(page.getByTestId('new-move-note')).toHaveText('Hold attack 1 s, then let go');
    await expect(page.getByTestId('new-move-key')).toHaveCount(0);
    await expect(page.getByTestId('tree-detail-use')).toContainText('Hold attack 1 s, then let go');
    await expect(page.getByTestId('tree-bar-slot-0')).toHaveAttribute('data-skill', '');
    await player.probe.waitFor('power dash owned, off the bar', (s: E2eSnapshot): boolean =>
      s.player!.skillLevels[POWER_DASH] === 1 && s.player!.skillBar.every((id: string | null): boolean => id === null),
    );
  });

  test('the tree window moves a skill to another key, swaps two, and takes one off', async (): Promise<void> => {
    const page: Page = player.page;
    await player.probe.levelUp(3);
    const tree: Locator = await openTree(page);
    await learn(page, SHOULDER_CHARGE);
    await learn(page, BACKSTEP);
    const bar: Locator = tree.getByTestId('tree-skill-bar');
    await expect(bar).toBeVisible();

    // The backstep is selected (just learned): click slot 5 to move it there.
    await tree.getByTestId('tree-bar-slot-4').click();
    await expect(tree.getByTestId('tree-bar-slot-4')).toHaveAttribute('data-skill', BACKSTEP);
    await expect(tree.getByTestId('tree-bar-slot-1')).toHaveAttribute('data-skill', '');
    await expect(page.getByTestId('tree-detail-use')).toContainText('5');

    // Shoulder charge onto the backstep's slot: the two swap keys.
    await page.getByTestId(`tree-node-${SHOULDER_CHARGE}`).click();
    await tree.getByTestId('tree-bar-slot-4').click();
    await expect(tree.getByTestId('tree-bar-slot-4')).toHaveAttribute('data-skill', SHOULDER_CHARGE);
    await expect(tree.getByTestId('tree-bar-slot-0')).toHaveAttribute('data-skill', BACKSTEP);
    await player.probe.waitFor(
      'the engine has the new bar',
      (s: E2eSnapshot): boolean =>
        s.player!.skillBar[0] === BACKSTEP && s.player!.skillBar[4] === SHOULDER_CHARGE,
    );

    // Clicking the selected skill's own slot takes it off the bar.
    await tree.getByTestId('tree-bar-slot-4').click();
    await expect(tree.getByTestId('tree-bar-slot-4')).toHaveAttribute('data-skill', '');
    await expect(page.getByTestId('tree-detail-use')).toContainText('Not on your skill bar');
    await page.keyboard.press('Escape');

    // Key 1 now fires the backstep; key 5 is empty.
    await player.castSkill(5);
    await player.castSkill(1);
    const s: E2eSnapshot = await player.probe.waitFor(
      'key 1 fired the backstep',
      (st: E2eSnapshot): boolean =>
        (st.treeSkills.find((t: { id: string }): boolean => t.id === BACKSTEP)?.cooldownTicks ?? 0) > 0,
      { timeoutMs: 2_000 },
    );
    expect(
      s.treeSkills.find((t: { id: string }): boolean => t.id === SHOULDER_CHARGE)?.cooldownTicks,
      'nothing fired shoulder charge',
    ).toBe(0);
  });
});
