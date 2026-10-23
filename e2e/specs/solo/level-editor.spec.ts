import { Locator, Page } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eGadgetView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { openDevTools, pagePoint } from '../../support/dev-tools';

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

/** Clicks the map at a world point (`button` right erases). */
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

/** A quiet floor to design on: no zombies, god mode. */
async function quiet(p: GamePlayer): Promise<void> {
  await p.probe.setGodMode(true);
  await p.probe.clearZombies();
}

test.describe('dev level editor', { tag: '@solo' }, (): void => {
  test('place a platform, drag it, erase it with a right click', async ({
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

    await clickMap(p.page, 960, 220, 'right');
    await p.probe.waitFor(
      'right click erased it',
      (s: E2eSnapshot): boolean => s.level.platforms.length === 0,
      {
        timeoutMs: 5_000,
      },
    );
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

  test('a middle click opens a thing to adjust it: scale weight, wall height, slingshot angle', async ({
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
    await clickMap(p.page, 424, 618, 'middle');
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

    await clickMap(p.page, 916, 560, 'middle');
    await expect(popup.getByTestId('level-editor-text-props-title')).toHaveText('Wall');
    await popup.getByTestId('level-editor-props-input-height').fill('256');
    await popup.getByTestId('level-editor-props-input-height').press('Enter');
    const tall: E2eSnapshot = await p.probe.waitFor(
      'the wall grew up from its foot',
      (s: E2eSnapshot): boolean => s.level.walls[0]?.height === 256,
      { timeoutMs: 5_000 },
    );
    expect(tall.level.walls[0].y + 256).toBe(WORLD.groundY);

    await clickMap(p.page, 680, 610, 'middle');
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
