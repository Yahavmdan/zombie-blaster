import { Locator } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSkillView, E2eSnapshot } from '../../support/probe';

type MouseButton = 'left' | 'right' | 'middle';

const POWER_STRIKE: string = 'warrior-power-strike';
const MP_POTION: string = 'mp-potion-1';

/** Moves the cursor over the middle of the game canvas, clear of the HUD. */
async function aimAtCanvas(player: GamePlayer): Promise<void> {
  const box: { x: number; y: number; width: number; height: number } | null = await player.page
    .locator('app-game-canvas canvas')
    .boundingBox();
  expect(box, 'game canvas is on screen').not.toBeNull();
  await player.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height * 0.4);
}

/** Presses a mouse button over the game canvas and lets go. */
async function clickCanvas(
  player: GamePlayer,
  button: MouseButton,
  holdMs: number = 120,
): Promise<void> {
  await aimAtCanvas(player);
  await player.page.mouse.down({ button });
  await player.wait(holdMs);
  await player.page.mouse.up({ button });
}

async function openSettings(player: GamePlayer): Promise<void> {
  await player.page.getByTestId('game-settings-button-toggle').click();
  await expect(player.page.getByTestId('game-settings-button-close')).toBeVisible();
}

async function closeSettings(player: GamePlayer): Promise<void> {
  await player.page.getByTestId('game-settings-button-close').click();
  await expect(player.page.getByTestId('game-settings-button-close')).toBeHidden();
}

/** Drags a skill or potion from the settings side panel onto a mouse button of the drawn mouse. */
async function dropOnMouseButton(
  player: GamePlayer,
  tab: 'skills' | 'inventory',
  itemId: string,
  mouseKey: string,
): Promise<void> {
  await player.page.getByTestId(`game-settings-button-${tab}`).click();
  const item: Locator = player.page.getByTestId(`game-settings-item-${itemId}`);
  const target: Locator = player.page.getByTestId(`game-settings-key-${mouseKey}`);
  await item.dragTo(target);
}

function skillCooldown(s: E2eSnapshot, skillId: string): number {
  return s.usableSkills.find((k: E2eSkillView): boolean => k.id === skillId)?.cooldownTicks ?? 0;
}

test.describe('mouse controls', { tag: '@solo' }, (): void => {
  let player: GamePlayer;

  test.beforeEach(async ({ solo }: { solo: SoloFactory }): Promise<void> => {
    player = await solo('warrior');
    // Low level keeps MP regen slow enough to see a skill spend it; maxed skills make Power Strike usable.
    await player.probe.maxAllSkills();
    await player.probe.waitFor(
      'player grounded',
      (s: E2eSnapshot): boolean => s.player!.isGrounded,
      {
        timeoutMs: 5_000,
      },
    );
  });

  test('left mouse button attacks by default', async (): Promise<void> => {
    await player.probe.setGodMode(true);
    await aimAtCanvas(player);
    await player.page.mouse.down({ button: 'left' });
    await player.probe.waitFor(
      'attacking while LMB is held',
      (s: E2eSnapshot): boolean => s.player!.isAttacking,
      {
        timeoutMs: 2_000,
      },
    );
    await player.page.mouse.up({ button: 'left' });
  });

  test('a skill dropped on the right mouse button casts with a right-click', async (): Promise<void> => {
    await player.probe.setGodMode(true);
    await openSettings(player);
    await dropOnMouseButton(player, 'skills', POWER_STRIKE, 'mouseright');
    await expect(player.page.getByTestId('game-settings-key-mouseright')).toContainText(
      'Power Strike',
    );
    await closeSettings(player);

    expect(skillCooldown(await player.probe.state(), POWER_STRIKE), 'skill starts ready').toBe(0);
    await clickCanvas(player, 'right');
    await player.probe.waitFor(
      'power strike cast by right-click',
      (s: E2eSnapshot): boolean => skillCooldown(s, POWER_STRIKE) > 0,
      { timeoutMs: 2_000 },
    );
    await expect(player.page.getByTestId('quickslot-slot-quickSlot9')).toHaveAttribute(
      'title',
      'Power Strike',
    );
  });

  test('a potion dropped on the middle mouse button drinks with a middle-click', async (): Promise<void> => {
    await openSettings(player);
    await dropOnMouseButton(player, 'inventory', MP_POTION, 'mousemiddle');
    await expect(player.page.getByTestId('game-settings-key-mousemiddle')).toContainText(
      'MP Potion',
    );
    await closeSettings(player);

    // Spend some MP on a skill so the potion has something to restore.
    const skills: E2eSkillView[] = (await player.probe.state()).usableSkills;
    const powerStrike: E2eSkillView | undefined = skills.find(
      (k: E2eSkillView): boolean => k.id === POWER_STRIKE,
    );
    expect(powerStrike, `usable skills: ${JSON.stringify(skills)}`).toBeDefined();
    await player.castSkill(powerStrike!.slot);
    const spent: E2eSnapshot = await player.probe.waitFor(
      'MP spent',
      (s: E2eSnapshot): boolean => s.player!.mp < s.player!.maxMp,
      { timeoutMs: 2_000 },
    );
    const potionsBefore: number = spent.player!.potions[MP_POTION] ?? 0;
    expect(potionsBefore, 'starts with MP potions').toBeGreaterThan(0);

    await clickCanvas(player, 'middle');
    await player.probe.waitFor(
      'MP potion drunk by middle-click',
      (s: E2eSnapshot): boolean => (s.player!.potions[MP_POTION] ?? 0) === potionsBefore - 1,
      { timeoutMs: 2_000 },
    );
  });

  test('a quick slot can be rebound to a mouse button by clicking it', async (): Promise<void> => {
    await openSettings(player);
    const slot3: Locator = player.page.getByTestId('game-settings-quickslot-quickSlot3');
    await expect(slot3).toHaveClass(/kb-qs-cell--filled/);

    // Right-clicking a slot clears it; the click that rebinds must not leak through and do that too.
    await player.page.getByTestId('game-settings-button-rebind-quickSlot1').click();
    await slot3.click({ button: 'right' });
    await expect(player.page.getByTestId('game-settings-quickslot-key-quickSlot1')).toHaveText(
      'RMB',
    );
    await expect(slot3).toHaveClass(/kb-qs-cell--filled/);

    // Nor may a left click start a second rebind on the button under the cursor.
    await player.page.getByTestId('game-settings-button-rebind-quickSlot2').click();
    await player.page.getByTestId('game-settings-button-rebind-quickSlot4').click();
    await expect(player.page.getByTestId('game-settings-quickslot-key-quickSlot2')).toHaveText(
      'LMB',
    );
    await expect(player.page.getByTestId('game-settings-button-rebind-quickSlot4')).toBeVisible();

    await closeSettings(player);
    await expect(player.page.getByTestId('quickslot-slot-quickSlot1')).toContainText('RMB');
  });
});
