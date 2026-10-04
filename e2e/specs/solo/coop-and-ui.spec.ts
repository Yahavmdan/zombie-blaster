import { Page, TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot, E2eZombieView } from '../../support/probe';

/** Controls, onboarding and menu safety changes from the second playtest round. */
test.describe('controls, onboarding and menus', { tag: '@solo' }, (): void => {
  test(
    'How to Play lists the real default keys',
    { tag: '@external-safe' },
    async ({ page }: { page: Page }): Promise<void> => {
      await page.goto('/');
      await page.getByTestId('menu-main-button-howtoplay').click();
      const help: string = await page.locator('.help-panel').innerText();
      for (const expected of ['J / CLICK', 'Attack', '1 – 6', 'Skills', 'F', 'Revive', 'EXIT']) {
        expect(help).toContain(expected);
      }
      expect(help).not.toContain('Pause');
    },
  );

  test('J attacks by default and Ctrl does nothing', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    await p.press('Control', 300);
    expect((await p.probe.state()).player!.isAttacking, 'Ctrl is not an attack key').toBe(false);
    await p.hold(KEYS.attack);
    await p.probe.waitFor('attacking', (s: E2eSnapshot): boolean => s.player!.isAttacking, {
      timeoutMs: 2_000,
    });
    await p.release(KEYS.attack);
  });

  test('a new warrior can learn an attack skill with the first skill points', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.levelUp(1);
    await p.probe.waitFor(
      'skill points',
      (s: E2eSnapshot): boolean => s.player!.unallocatedSkillPoints > 0,
    );
    await p.page.keyboard.press(KEYS.openSkills);
    await expect(p.page.getByTestId('skill-tree-button-invest-warrior-power-strike')).toBeEnabled();
    await p.page.getByTestId('skill-tree-button-invest-warrior-power-strike').click();
    await p.page.keyboard.press('Escape');
    const s: E2eSnapshot = await p.probe.waitFor(
      'power strike usable',
      (st: E2eSnapshot): boolean =>
        st.usableSkills.some(
          (k: E2eSnapshot['usableSkills'][number]): boolean => k.id === 'warrior-power-strike',
        ),
    );
    expect(s.player!.level).toBe(2);
  });

  test('opening a menu mid-fight shields you from most damage for a few seconds', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.levelUp(5);
    await p.probe.setFloor(4);
    const hitsTaken: (menuOpen: boolean, ms: number) => Promise<number[]> = async (
      menuOpen: boolean,
      ms: number,
    ): Promise<number[]> => {
      if (menuOpen) await p.page.keyboard.press(KEYS.openShop);
      const hits: number[] = [];
      let last: number = (await p.probe.state()).player!.hp;
      const end: number = Date.now() + ms;
      let lastTeleport: number = 0;
      while (Date.now() < end) {
        const s: E2eSnapshot = await p.probe.state();
        const z: E2eZombieView | undefined = s.zombies.find(
          (zz: E2eZombieView): boolean => !zz.isDead && zz.spawnTimer <= 0,
        );
        if (z && !menuOpen && Date.now() - lastTeleport > 1_000) {
          lastTeleport = Date.now();
          await p.probe.teleport(z.x, z.y + z.height - 48);
        }
        if (s.player!.hp < last) hits.push(last - s.player!.hp);
        last = s.player!.hp;
        await p.wait(40);
      }
      if (menuOpen) await p.page.keyboard.press('Escape');
      return hits;
    };
    const avg: (xs: number[]) => number = (xs: number[]): number =>
      xs.reduce((a: number, b: number): number => a + b, 0) / Math.max(1, xs.length);
    let open: number[] = [];
    let closed: number[] = [];
    for (let round: number = 0; round < 4 && (open.length < 2 || closed.length < 2); round++) {
      closed = closed.concat(await hitsTaken(false, 6_000));
      open = open.concat(await hitsTaken(true, 3_500));
    }
    await testInfo.attach('hits', {
      body: JSON.stringify({ open, closed }),
      contentType: 'application/json',
    });
    expect(closed.length, 'took hits while fighting').toBeGreaterThan(0);
    expect(open.length, 'took hits with the shop open').toBeGreaterThan(0);
    expect(avg(open), 'average hit with a menu open').toBeLessThan(avg(closed) * 0.6);
  });
});
