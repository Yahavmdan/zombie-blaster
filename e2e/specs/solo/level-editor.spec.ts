import { Locator, Page } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eGadgetView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { dragOnCanvas, liveZombies, openDevTools, pagePoint } from '../../support/dev-tools';

type Box = { x: number; y: number; width: number; height: number };

/** Opens the dev tools and, from there, the level editor's floating bar (the dialog closes). */
async function openEditor(p: GamePlayer): Promise<Locator> {
  await openDevTools(p.page);
  await p.page.getByTestId('game-dev-button-level-editor').click();
  await expect(p.page.getByTestId('game-dev-button-close-dialog')).toBeHidden();
  const bar: Locator = p.page.getByTestId('level-editor-panel-window');
  await expect(bar).toBeVisible();
  return bar;
}

async function tool(page: Page, id: string): Promise<void> {
  await page.getByTestId(`level-editor-tool-${id}`).click();
}

/** Clicks the map at a world point (`button` middle or right erases). */
async function clickMap(
  page: Page,
  x: number,
  y: number,
  button: 'left' | 'right' | 'middle' = 'left',
): Promise<void> {
  const at: { x: number; y: number } = await pagePoint(page, x, y);
  await page.mouse.click(at.x, at.y, { button });
}

async function dragMap(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const start: { x: number; y: number } = await pagePoint(page, from.x, from.y);
  const end: { x: number; y: number } = await pagePoint(page, to.x, to.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
}

function platformAround(s: E2eSnapshot, x: number, y: number): Box | undefined {
  return s.level.platforms.find(
    (pl: Box): boolean => x >= pl.x && x <= pl.x + pl.width && y >= pl.y && y <= pl.y + pl.height,
  );
}

/** The design as its autosaved draft. */
async function exported(page: Page): Promise<string> {
  return page.evaluate((): string => localStorage.getItem('zb-level-editor-draft') ?? '{}');
}

/** A quiet floor to design on: no zombies, god mode. */
async function quiet(p: GamePlayer): Promise<void> {
  await p.probe.setGodMode(true);
  await p.probe.clearZombies();
}

test.describe('dev level editor', { tag: '@solo' }, (): void => {
  test('F2 opens and closes the editor from play, but not while typing in it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const bar: Locator = p.page.getByTestId('level-editor-panel-window');

    await p.page.keyboard.press('F2');
    await expect(bar).toBeVisible();
    await expect(p.page.getByTestId('game-dev-button-close-dialog')).toBeHidden();

    // A key typed in the notes box is the box's.
    await p.page.getByTestId('level-editor-button-notes').click();
    await p.page.getByTestId('level-editor-textarea-notes').press('F2');
    await expect(bar).toBeVisible();
    await p.page.getByTestId('level-editor-button-notes').click();

    await p.page.keyboard.press('F2');
    await expect(bar).toBeHidden();

    // From under the dev dialog too: the dialog goes.
    await openDevTools(p.page);
    await p.page.keyboard.press('F2');
    await expect(bar).toBeVisible();
    await expect(p.page.getByTestId('game-dev-button-close-dialog')).toBeHidden();
  });

  test('helpers: kill all, spawns off, spawn and drag with the editor open; tools build again', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    await p.probe.clearZombies();
    const bar: Locator = await openEditor(p);
    const helper: (id: string) => Locator = (id: string): Locator =>
      p.page.getByTestId(`level-editor-helper-${id}`);

    await p.page.getByTestId('level-editor-tab-helpers').click();
    await expect(p.page.getByTestId('level-editor-tool-select')).toBeHidden();

    await helper('zombie-spawns').click();
    await expect(helper('zombie-spawns')).toHaveText('Spawns off');
    await p.probe.spawnZombieAt(600);
    await p.probe.waitFor('a zombie stands', (s: E2eSnapshot): boolean => liveZombies(s) > 0);
    await helper('kill-all').click();
    await p.probe.waitFor('all dead', (s: E2eSnapshot): boolean => liveZombies(s) === 0);

    // Spawn tool: a click on the map brings a walker, the editor stays open and places nothing.
    const before: string = await exported(p.page);
    await helper('spawn-walker').click();
    await clickMap(p.page, 500, WORLD.groundY - 40);
    await p.probe.waitFor('the walker rose', (s: E2eSnapshot): boolean => liveZombies(s) === 1);
    await expect(bar).toBeVisible();

    // Frozen it stays under the cursor; the drag tool carries it off.
    await helper('freeze-zombies').click();
    await helper('mouse-drag').click();
    const out: E2eSnapshot = await p.probe.waitFor(
      'the walker is out of the ground',
      (s: E2eSnapshot): boolean => liveZombies(s) === 1 && s.zombies[0].spawnTimer <= 0,
    );
    const zombie: E2eZombieView = out.zombies[0];
    const grab: { x: number; y: number } = {
      x: zombie.x + zombie.width / 2,
      y: zombie.y + zombie.height / 2,
    };
    await dragOnCanvas(p.page, grab, { x: 800, y: 200 }, true);
    await p.probe.waitFor('the walker moved', (s: E2eSnapshot): boolean => s.zombies[0].x > 700);

    // Drag on empty map brings the player, with nothing placed.
    await dragOnCanvas(p.page, { x: 600, y: 100 }, { x: 620, y: 120 }, true);
    await p.probe.waitFor(
      'the player came to the cursor',
      (s: E2eSnapshot): boolean => s.player !== null && Math.abs(s.player.x - 620) < 60,
    );
    expect(await exported(p.page), 'the helpers change no design').toBe(before);

    // The Build tab gives the mouse back to the editor: the picked tool places again.
    const platforms: number = (await p.probe.state()).level.platforms.length;
    await p.page.getByTestId('level-editor-tab-build').click();
    await tool(p.page, 'platform');
    await clickMap(p.page, 640, 260);
    await p.probe.waitFor(
      'a platform was placed',
      (s: E2eSnapshot): boolean => s.level.platforms.length > platforms,
    );

    // Close: the left mouse attacks again, whatever a helper left it on.
    await p.page.getByTestId('level-editor-tab-helpers').click();
    await helper('mouse-drag').click();
    await p.page.getByTestId('level-editor-button-close').click();
    await openDevTools(p.page);
    await expect(p.page.getByTestId('game-dev-button-mouse-attack')).toHaveClass(/px-btn--good/);
  });

  test('place a platform, drag it, erase it with a middle click, then a right click', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quiet(p);
    // Clear room first, so nothing else is under the clicks.
    const bar: Locator = await openEditor(p);
    await p.page.getByTestId('level-editor-button-clear').click();

    await tool(p.page, 'platform');
    await clickMap(p.page, 800, 300);
    const placed: E2eSnapshot = await p.probe.waitFor(
      'the platform is collision at once',
      (s: E2eSnapshot): boolean => platformAround(s, 800, 300) !== undefined,
      { timeoutMs: 5_000 },
    );
    expect(placed.level.platforms.length, 'only the new platform').toBe(1);
    await expect(bar.getByTestId('level-editor-text-selection')).toHaveText('Platform');

    await tool(p.page, 'select');
    await dragMap(p.page, { x: 800, y: 300 }, { x: 960, y: 220 });
    await p.probe.waitFor(
      'it moved with the mouse',
      (s: E2eSnapshot): boolean =>
        platformAround(s, 960, 220) !== undefined && platformAround(s, 800, 300) === undefined,
      { timeoutMs: 5_000 },
    );

    await clickMap(p.page, 960, 220, 'middle');
    await p.probe.waitFor(
      'middle click erased it',
      (s: E2eSnapshot): boolean => s.level.platforms.length === 0,
      { timeoutMs: 5_000 },
    );

    await tool(p.page, 'platform');
    await clickMap(p.page, 800, 300);
    await p.probe.waitFor(
      'a new platform',
      (s: E2eSnapshot): boolean => platformAround(s, 800, 300) !== undefined,
      { timeoutMs: 5_000 },
    );
    await clickMap(p.page, 800, 300, 'right');
    await p.probe.waitFor(
      'right click erased it',
      (s: E2eSnapshot): boolean => s.level.platforms.length === 0,
      {
        timeoutMs: 5_000,
      },
    );
  });

  test('a zombie pile: the tool lays real bodies, a right click takes them away', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quiet(p);
    const bar: Locator = await openEditor(p);
    await p.page.getByTestId('level-editor-button-clear').click();

    await tool(p.page, 'zombie-pile');
    await clickMap(p.page, 800, 300);
    await p.probe.waitFor(
      'the bodies lie there at once',
      (s: E2eSnapshot): boolean => s.corpseViews.length === 10,
      { timeoutMs: 5_000 },
    );
    await expect(bar.getByTestId('level-editor-text-selection')).toHaveText('Zombie pile');

    await tool(p.page, 'select');
    await clickMap(p.page, 800, WORLD.groundY - 20, 'right');
    await p.probe.waitFor(
      'the right click took the bodies too',
      (s: E2eSnapshot): boolean => s.corpseViews.length === 0,
      { timeoutMs: 5_000 },
    );
  });

  test('a no-spawn zone: drawn with its tool, resized, and no zombie rises in it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await solo('warrior');
    await quiet(p);
    const bar: Locator = await openEditor(p);
    await p.page.getByTestId('level-editor-button-clear').click();
    await tool(p.page, 'no-spawn');
    await clickMap(p.page, 640, 560);
    const placed: E2eSnapshot = await p.probe.waitFor(
      'the zone is in the floor at once',
      (s: E2eSnapshot): boolean => s.level.noSpawn.length === 1,
      { timeoutMs: 5_000 },
    );
    await expect(bar.getByTestId('level-editor-text-selection')).toHaveText('No-spawn zone');
    const zone: Box = placed.level.noSpawn[0];
    expect(zone.y + zone.height, 'it reaches down to the ground').toBe(WORLD.groundY);

    // Drag its right side out to 1000: the zone covers most of the ground.
    await tool(p.page, 'select');
    await dragMap(
      p.page,
      { x: zone.x + zone.width - 2, y: zone.y + zone.height / 2 },
      { x: 1000, y: zone.y + zone.height / 2 },
    );
    const wide: E2eSnapshot = await p.probe.waitFor(
      'the zone grew to the right',
      (s: E2eSnapshot): boolean => s.level.noSpawn[0].x + s.level.noSpawn[0].width >= 990,
      { timeoutMs: 5_000 },
    );
    const area: Box = wide.level.noSpawn[0];

    await p.probe.spawnRolledZombies(30);
    const s: E2eSnapshot = await p.probe.waitFor(
      'the zombies rose',
      (st: E2eSnapshot): boolean => st.zombies.length >= 30,
      { timeoutMs: 5_000 },
    );
    for (const z of s.zombies.filter((zz: E2eSnapshot['zombies'][number]): boolean => zz.spawnTimer > 0)) {
      const overlaps: boolean =
        z.x < area.x + area.width &&
        z.x + z.width > area.x &&
        z.y < area.y + area.height &&
        z.y + z.height > area.y;
      expect(overlaps, `zombie at ${Math.round(z.x)} rose inside the zone`).toBe(false);
    }
  });

  test('a wall is solid: walking into it stops the player', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quiet(p);
    await openEditor(p);
    await p.page.getByTestId('level-editor-button-clear').click();
    await tool(p.page, 'wall');
    await clickMap(p.page, 900, 600);
    const s: E2eSnapshot = await p.probe.waitFor(
      'a wall stands on the ground',
      (st: E2eSnapshot): boolean => st.level.walls.length === 1,
      { timeoutMs: 5_000 },
    );
    const wall: Box = s.level.walls[0];
    expect(wall.y + wall.height, 'standing on the ground').toBe(WORLD.groundY);

    await p.probe.teleport(wall.x - 120, WORLD.groundY - WORLD.playerHeight);
    await p.wait(400);
    await p.hold(KEYS.right);
    await p.wait(1_500);
    await p.release(KEYS.right);
    const after: E2eSnapshot = await p.probe.state();
    expect(after.player!.x + WORLD.playerWidth, 'stopped at the wall').toBeLessThanOrEqual(
      wall.x + 2,
    );
  });

  test('exit and gadgets: the exit moves, a lever wired with the link tool locks it, notes are kept', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quiet(p);
    await openEditor(p);
    await p.page.getByTestId('level-editor-button-clear').click();

    await tool(p.page, 'exit');
    await clickMap(p.page, 1000, 250);
    await p.probe.waitFor(
      'the exit hangs where clicked',
      (s: E2eSnapshot): boolean =>
        Math.abs(s.exit.x + s.exit.width / 2 - 1000) <= 4 && Math.abs(s.exit.y + 16 - 250) <= 4,
      { timeoutMs: 5_000 },
    );

    await tool(p.page, 'spring');
    await clickMap(p.page, 600, 600);
    const sprung: E2eSnapshot = await p.probe.waitFor(
      'a spring stands alone where clicked',
      (s: E2eSnapshot): boolean =>
        s.gadgets.some((g: E2eGadgetView): boolean => g.kind === 'spring'),
      { timeoutMs: 5_000 },
    );
    expect(sprung.spring, 'no floor-3 puzzle comes with it').toBeNull();

    await tool(p.page, 'lever');
    await clickMap(p.page, 800, 600);
    await tool(p.page, 'link');
    await clickMap(p.page, 808, 600);
    await clickMap(p.page, 1000, 250);
    const wired: E2eSnapshot = await p.probe.waitFor(
      'the lever is wired to the exit: it locks',
      (s: E2eSnapshot): boolean => s.exitLocked,
      { timeoutMs: 5_000 },
    );
    expect(wired.gadgets.find((g: E2eGadgetView): boolean => g.kind === 'lever')?.targets).toEqual([
      'exit',
    ]);
    await expect(p.page.getByTestId('level-editor-button-unwire-exit')).toBeVisible();

    await tool(p.page, 'slingshot');
    await clickMap(p.page, 400, 600);
    await p.page.getByTestId('level-editor-input-angle').fill('120');
    await p.page.getByTestId('level-editor-input-angle').press('Enter');
    await p.probe.waitFor(
      'the slingshot aims up-left',
      (s: E2eSnapshot): boolean =>
        s.gadgets.some((g: E2eGadgetView): boolean => g.kind === 'slingshot'),
      { timeoutMs: 5_000 },
    );

    await p.page.getByTestId('level-editor-button-notes').click();
    await p.page.getByTestId('level-editor-textarea-notes').fill('Hit the lever to open the exit.');
    const json: string = await p.page.evaluate(
      (): string => localStorage.getItem('zb-level-editor-draft') ?? '',
    );
    expect(json, 'the draft is autosaved with the notes').toContain(
      '"notes": "Hit the lever to open the exit."',
    );
    expect(json, 'and the slingshot angle').toContain('"angle": 120');
    await p.page.screenshot({ path: test.info().outputPath('editor.png') });
    await test
      .info()
      .attach('editor', { path: test.info().outputPath('editor.png'), contentType: 'image/png' });
  });

  test('a left click with select opens beside a thing, not on it, and picks its look from pictures', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quiet(p);
    const bar: Locator = await openEditor(p);
    await bar.getByTestId('level-editor-button-clear').click();
    await tool(p.page, 'button');
    await clickMap(p.page, 400, 600);
    await tool(p.page, 'door');
    await clickMap(p.page, 1200, 600);
    await tool(p.page, 'select');
    const gadgets: E2eGadgetView[] = (await p.probe.state()).gadgets;
    const button: E2eGadgetView = gadgets.find((g: E2eGadgetView): boolean => g.kind === 'button')!;
    const door: E2eGadgetView = gadgets.find((g: E2eGadgetView): boolean => g.kind === 'door')!;

    const popup: Locator = p.page.getByTestId('level-editor-panel-props');
    const clearOf = async (g: E2eGadgetView): Promise<void> => {
      const box: { x: number; y: number; width: number; height: number } | null =
        await popup.boundingBox();
      const a: { x: number; y: number } = await pagePoint(p.page, g.box.x, g.box.y);
      const b: { x: number; y: number } = await pagePoint(
        p.page,
        g.box.x + g.box.width,
        g.box.y + g.box.height,
      );
      const apart: boolean =
        box!.x >= b.x || box!.x + box!.width <= a.x || box!.y >= b.y || box!.y + box!.height <= a.y;
      expect(apart, `popup ${JSON.stringify(box)} covers ${g.kind}`).toBe(true);
    };

    await clickMap(p.page, button.box.x + button.box.width / 2, button.box.y);
    await expect(popup).toBeVisible();
    await clearOf(button);
    await expect(popup.locator('.le-look canvas')).toHaveCount(4);
    await popup.getByTestId('level-editor-props-look-green').click();
    await expect
      .poll(async (): Promise<string | undefined> => {
        const list: { kind: string; look?: string }[] = JSON.parse(await exported(p.page)).gadgets;
        return list.find((g: { kind: string }): boolean => g.kind === 'button')?.look;
      })
      .toBe('green');

    // A door at the window's right edge: the popup opens on its left.
    await clickMap(p.page, door.box.x + door.box.width / 2, door.box.y + door.box.height / 2);
    await expect(popup.getByTestId('level-editor-text-props-title')).toContainText('Door');
    await clearOf(door);
    await popup.getByTestId('level-editor-props-look-portcullis').click();
    await p.page.screenshot({ path: test.info().outputPath('looks.png') });
    await test
      .info()
      .attach('looks', { path: test.info().outputPath('looks.png'), contentType: 'image/png' });
  });

  test('a left click with select opens a thing to adjust it: scale weight, wall height, slingshot angle', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quiet(p);
    const bar: Locator = await openEditor(p);
    await bar.getByTestId('level-editor-button-clear').click();
    await tool(p.page, 'scale');
    await clickMap(p.page, 400, 600);
    await tool(p.page, 'wall');
    await clickMap(p.page, 900, 600);
    await tool(p.page, 'slingshot');
    await clickMap(p.page, 650, 600);
    await tool(p.page, 'select');

    const popup: Locator = p.page.getByTestId('level-editor-panel-props');
    await clickMap(p.page, 424, 618);
    await expect(popup).toBeVisible();
    await expect(popup.getByTestId('level-editor-text-props-title')).toHaveText('Scale g1');
    await popup.getByTestId('level-editor-props-input-kg').fill('300');
    await popup.getByTestId('level-editor-props-input-kg').press('Enter');
    await expect
      .poll(
        (): Promise<string> =>
          p.page.evaluate((): string => localStorage.getItem('zb-level-editor-draft') ?? ''),
        { timeout: 5_000 },
      )
      .toContain('"kg": 300');

    await clickMap(p.page, 916, 560);
    await expect(popup.getByTestId('level-editor-text-props-title')).toHaveText('Wall');
    await popup.getByTestId('level-editor-props-input-height').fill('256');
    await popup.getByTestId('level-editor-props-input-height').press('Enter');
    const tall: E2eSnapshot = await p.probe.waitFor(
      'the wall grew up from its foot',
      (s: E2eSnapshot): boolean => s.level.walls[0]?.height === 256,
      { timeoutMs: 5_000 },
    );
    expect(tall.level.walls[0].y + 256).toBe(WORLD.groundY);

    await clickMap(p.page, 680, 610);
    await expect(popup.getByTestId('level-editor-text-props-title')).toHaveText('Slingshot g2');
    await popup.getByTestId('level-editor-props-range-angle').fill('150');
    await expect
      .poll(
        (): Promise<string> =>
          p.page.evaluate((): string => localStorage.getItem('zb-level-editor-draft') ?? ''),
        { timeout: 5_000 },
      )
      .toContain('"angle": 150');
    await p.page.screenshot({ path: test.info().outputPath('props.png') });
    await test
      .info()
      .attach('props', { path: test.info().outputPath('props.png'), contentType: 'image/png' });

    // It drags by its title bar, out of the way of the map.
    const before: { x: number; y: number } | null = await popup.boundingBox();
    const title: { x: number; y: number; width: number; height: number } | null = await popup
      .getByTestId('level-editor-text-props-title')
      .boundingBox();
    await p.page.mouse.move(title!.x + 10, title!.y + title!.height / 2);
    await p.page.mouse.down();
    await p.page.mouse.move(title!.x - 190, title!.y - 150, { steps: 8 });
    await p.page.mouse.up();
    const after: { x: number; y: number } | null = await popup.boundingBox();
    expect(Math.round(after!.x - before!.x), 'dragged left').toBe(-200);
    expect(Math.round(after!.y - before!.y), 'dragged up').toBe(
      Math.round(-150 - title!.height / 2),
    );

    await popup.getByTestId('level-editor-button-props-close').click();
    await expect(popup).toBeHidden();
  });

  test('tools are pictures; Ctrl+Z / Ctrl+Shift+Z undo and redo; the hanging exit can be erased', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quiet(p);
    const bar: Locator = await openEditor(p);
    // Every tool button shows a picture of what it places (its name is the tooltip).
    const drawn: number = await bar.evaluate(
      (el: HTMLElement): number =>
        Array.from(el.querySelectorAll('canvas')).filter((c: HTMLCanvasElement): boolean => {
          const data: Uint8ClampedArray = c
            .getContext('2d')!
            .getImageData(0, 0, c.width, c.height).data;
          return data.some((v: number, i: number): boolean => i % 4 === 3 && v > 0);
        }).length,
    );
    expect(drawn, 'pictures on the tool buttons').toBeGreaterThanOrEqual(20);
    await expect(bar.getByTestId('level-editor-tool-slope')).toHaveAttribute('aria-label', 'Slope');
    await p.page.screenshot({ path: test.info().outputPath('palette.png') });
    await test
      .info()
      .attach('palette', { path: test.info().outputPath('palette.png'), contentType: 'image/png' });

    await bar.getByTestId('level-editor-button-clear').click();
    await tool(p.page, 'wall');
    await clickMap(p.page, 600, 600);
    await clickMap(p.page, 900, 600);
    await p.probe.waitFor('two walls', (s: E2eSnapshot): boolean => s.level.walls.length === 2, {
      timeoutMs: 5_000,
    });
    await p.page.keyboard.press('Control+z');
    await p.probe.waitFor('undone', (s: E2eSnapshot): boolean => s.level.walls.length === 1, {
      timeoutMs: 5_000,
    });
    await p.page.keyboard.press('Control+Shift+z');
    await p.probe.waitFor('redone', (s: E2eSnapshot): boolean => s.level.walls.length === 2, {
      timeoutMs: 5_000,
    });

    // Out in the open first (the exit may hang behind the editor bar).
    await tool(p.page, 'exit');
    await clickMap(p.page, 1000, 250);
    const exit: E2eSnapshot = await p.probe.waitFor(
      'the exit hangs in the open',
      (s: E2eSnapshot): boolean => Math.abs(s.exit.x + s.exit.width / 2 - 1000) <= 4,
      { timeoutMs: 5_000 },
    );
    await clickMap(p.page, exit.exit.x + 10, exit.exit.y + 4, 'right');
    await p.probe.waitFor('the hanging exit is gone', (s: E2eSnapshot): boolean => s.exit.y < 0, {
      timeoutMs: 5_000,
    });
    await expect(bar.getByTestId('level-editor-text-no-exit')).toBeVisible();
    await bar.getByTestId('level-editor-button-undo').click();
    await p.probe.waitFor('it is back', (s: E2eSnapshot): boolean => s.exit.y > 0, {
      timeoutMs: 5_000,
    });
    await expect(bar.getByTestId('level-editor-text-no-exit')).toBeHidden();
  });

  test('export, clear, import brings the design back; close gives the mouse back to attacks', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quiet(p);
    const bar: Locator = await openEditor(p);
    await bar.getByTestId('level-editor-button-clear').click();
    await tool(p.page, 'wall');
    await clickMap(p.page, 1000, 600);
    await tool(p.page, 'platform');
    await clickMap(p.page, 700, 330);
    await p.probe.waitFor(
      'both placed',
      (s: E2eSnapshot): boolean => s.level.walls.length === 1 && s.level.platforms.length === 1,
      {
        timeoutMs: 5_000,
      },
    );

    await bar.getByTestId('level-editor-button-export').click();
    const json: string = await bar.getByTestId('level-editor-textarea-export').inputValue();
    const exported: { walls: Box[]; platforms: Box[]; floor: number; exitY: number } =
      JSON.parse(json);
    expect(exported.walls.length).toBe(1);
    expect(exported.platforms.length).toBe(1);
    expect(exported.floor).toBe(1);
    expect(typeof exported.exitY).toBe('number');

    await bar.getByTestId('level-editor-button-clear').click();
    await p.probe.waitFor('cleared', (s: E2eSnapshot): boolean => s.level.walls.length === 0, {
      timeoutMs: 5_000,
    });

    await bar.getByTestId('level-editor-button-import').click();
    await bar.getByTestId('level-editor-textarea-import').fill(json);
    await bar.getByTestId('level-editor-button-apply-import').click();
    await expect(bar.getByTestId('level-editor-text-message')).toHaveText('Layout imported');
    const back: E2eSnapshot = await p.probe.waitFor(
      'the design is back',
      (s: E2eSnapshot): boolean => s.level.walls.length === 1 && s.level.platforms.length === 1,
      { timeoutMs: 5_000 },
    );
    expect(back.level.walls[0]).toEqual(exported.walls[0]);

    await bar.getByTestId('level-editor-button-import').click();
    await bar.getByTestId('level-editor-textarea-import').fill('{"floor": 1}');
    await bar.getByTestId('level-editor-button-apply-import').click();
    await expect(bar.getByTestId('level-editor-text-message')).toContainText('Import failed');

    await bar.getByTestId('level-editor-button-close').click();
    await expect(bar).toBeHidden();
    await clickMap(p.page, 500, 300);
    await p.wait(300);
    expect(
      (await p.probe.state()).level.platforms.length,
      'clicks attack again, they place nothing',
    ).toBe(1);
  });
});
