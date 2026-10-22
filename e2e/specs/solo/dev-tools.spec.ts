import { Locator } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { closeDevTools, liveZombies, openDevTools, pagePoint } from '../../support/dev-tools';

test.describe('dev tools', { tag: '@solo' }, (): void => {
  test('kill all zombies leaves a corpse for each one', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    await p.probe.clearZombies();
    for (const x of [300, 500, 700, 900]) await p.probe.spawnZombieAt(x);
    const before: E2eSnapshot = await p.probe.waitFor(
      'four zombies are up',
      (s: E2eSnapshot): boolean => liveZombies(s) >= 4,
      { timeoutMs: 10_000 },
    );

    await openDevTools(p.page);
    await p.page.getByTestId('game-dev-button-kill-all').click();

    const after: E2eSnapshot = await p.probe.waitFor(
      'every zombie is dead',
      (s: E2eSnapshot): boolean => liveZombies(s) === 0,
      { timeoutMs: 5_000 },
    );
    expect(after.corpses, 'each one left a body').toBeGreaterThanOrEqual(
      before.corpses + liveZombies(before),
    );
  });

  test('spawns off keeps the floor empty, spawns on brings them back', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);

    await openDevTools(p.page);
    const toggle: Locator = p.page.getByTestId('game-dev-button-zombie-spawns');
    await expect(toggle).toHaveText('Spawns on');
    await toggle.click();
    await expect(toggle).toHaveText('Spawns off');
    await p.page.getByTestId('game-dev-button-kill-all').click();
    await p.probe.clearZombies();
    await closeDevTools(p.page);

    // Floor 1 spawns about every 2 s; 6 s with none is plenty.
    await p.wait(6_000);
    expect(liveZombies(await p.probe.state()), 'nothing spawned while off').toBe(0);

    await openDevTools(p.page);
    await toggle.click();
    await expect(toggle).toHaveText('Spawns on');
    await closeDevTools(p.page);
    await p.probe.waitFor(
      'zombies spawn again',
      (s: E2eSnapshot): boolean => s.zombies.length > 0,
      { timeoutMs: 20_000 },
    );
  });

  test('drag mode moves the player with the mouse and lets go to fall', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    await p.probe.clearZombies();

    await openDevTools(p.page);
    await p.page.getByTestId('game-dev-button-drag-player').click();
    // Turning it on closes the dialog so the canvas is free to grab.
    await expect(p.page.getByTestId('game-dev-button-close-dialog')).toBeHidden();

    const start: { x: number; y: number } = await pagePoint(p.page, 200, 500);
    const target: { x: number; y: number } = { x: 900, y: 150 };
    const end: { x: number; y: number } = await pagePoint(p.page, target.x, target.y);
    await p.page.mouse.move(start.x, start.y);
    await p.page.mouse.down();
    await p.page.mouse.move(end.x, end.y, { steps: 10 });

    const held: E2eSnapshot = await p.probe.waitFor(
      'the player hangs at the cursor',
      (s: E2eSnapshot): boolean =>
        !!s.player &&
        Math.abs(s.player.x + WORLD.playerWidth / 2 - target.x) < 4 &&
        Math.abs(s.player.y + WORLD.playerHeight / 2 - target.y) < 4,
      { timeoutMs: 5_000 },
    );
    await p.wait(300);
    const still: E2eSnapshot = await p.probe.state();
    expect(still.player!.y, 'held in the air, no falling').toBeCloseTo(held.player!.y, 0);

    await p.page.mouse.up();
    await p.probe.waitFor(
      'let go, the player falls',
      (s: E2eSnapshot): boolean => !!s.player && s.player.y > held.player!.y + 20,
      { timeoutMs: 5_000 },
    );
  });
});
