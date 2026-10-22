import { Locator, Page } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { LevelProp } from '../../support/props';
import {
  closeDevTools,
  dragOnCanvas,
  liveZombies,
  openDevTools,
  pagePoint,
} from '../../support/dev-tools';

/** Opens the dev tools, presses one of its buttons and closes them again (a mouse tool closes them itself). */
async function devClick(page: Page, testId: string): Promise<void> {
  await openDevTools(page);
  await page.getByTestId(testId).click();
  if (/mouse-|spawn-[a-z]/.test(testId) && !testId.endsWith('mouse-attack')) {
    await expect(page.getByTestId('game-dev-button-close-dialog')).toBeHidden();
  } else {
    await closeDevTools(page);
  }
}

/** A quiet floor: god mode, no spawns, no zombies. */
async function quietFloor(p: GamePlayer): Promise<void> {
  await p.probe.setGodMode(true);
  await devClick(p.page, 'game-dev-button-zombie-spawns');
  await p.probe.clearZombies();
}

async function oneZombieAt(p: GamePlayer, x: number): Promise<E2eZombieView> {
  await p.probe.spawnZombieAt(x);
  const s: E2eSnapshot = await p.probe.waitFor(
    'the zombie climbed out',
    (st: E2eSnapshot): boolean =>
      st.zombies.some((z: E2eZombieView): boolean => !z.isDead && z.spawnTimer === 0),
    { timeoutMs: 10_000 },
  );
  return s.zombies.find((z: E2eZombieView): boolean => !z.isDead)!;
}

function zombieById(s: E2eSnapshot, id: string): E2eZombieView | undefined {
  return s.zombies.find((z: E2eZombieView): boolean => z.id === id);
}

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

    await devClick(p.page, 'game-dev-button-zombie-spawns');
    await p.probe.waitFor(
      'zombies spawn again',
      (s: E2eSnapshot): boolean => s.zombies.length > 0,
      { timeoutMs: 20_000 },
    );
  });

  test('one click on the floor input arrow steps the number once', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await openDevTools(p.page);
    const input: Locator = p.page.getByTestId('game-dev-input-floor');
    await expect(input).toHaveValue('1');
    await input.scrollIntoViewIfNeeded();
    const box: { x: number; y: number; width: number; height: number } | null =
      await input.boundingBox();
    expect(box, 'floor input is on screen').not.toBeNull();
    // The up arrow of the number spinner: inside the right padding, top half.
    await p.page.mouse.click(box!.x + box!.width - 17, box!.y + box!.height * 0.35);
    await p.wait(1_500);
    await expect(input, 'stepped once, no auto-repeat after letting go').toHaveValue('2');
  });

  test('the dev tools dialog moves by its title bar', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await openDevTools(p.page);
    const panel: Locator = p.page.getByTestId('game-dev-panel-window');
    const before: { x: number; y: number } = (await panel.boundingBox())!;
    const title: { x: number; y: number } = (await panel.locator('.px-header').boundingBox())!;
    await p.page.mouse.move(title.x + 60, title.y + 10);
    await p.page.mouse.down();
    await p.page.mouse.move(title.x + 60 - 120, title.y + 10 + 60, { steps: 6 });
    await p.page.mouse.up();
    const after: { x: number; y: number } = (await panel.boundingBox())!;
    expect(after.x - before.x).toBeCloseTo(-120, -1);
    expect(after.y - before.y).toBeCloseTo(60, -1);
  });

  test('drag tool: pressing empty space holds the player at the cursor, letting go drops them', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quietFloor(p);
    await openDevTools(p.page);
    await p.page.getByTestId('game-dev-button-mouse-drag').click();
    // Picking a tool closes the dialog so the canvas is free to grab.
    await expect(p.page.getByTestId('game-dev-button-close-dialog')).toBeHidden();

    const target: { x: number; y: number } = { x: 900, y: 150 };
    await dragOnCanvas(p.page, { x: 200, y: 120 }, target, false);
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

  test('drag tool: a zombie, a corpse and a prop go where the mouse takes them', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await solo('warrior');
    await quietFloor(p);
    await devClick(p.page, 'game-dev-button-freeze-zombies');
    await p.probe.teleport(60, WORLD.groundY - WORLD.playerHeight);

    // Zombie: grabbed by its middle, dropped high up, it falls from there.
    const z: E2eZombieView = await oneZombieAt(p, 640);
    await devClick(p.page, 'game-dev-button-mouse-drag');
    const zTo: { x: number; y: number } = { x: 400, y: 160 };
    await dragOnCanvas(p.page, { x: z.x + z.width / 2, y: z.y + z.height / 2 }, zTo, false);
    const zHeld: E2eSnapshot = await p.probe.waitFor(
      'the zombie hangs at the cursor',
      (s: E2eSnapshot): boolean => {
        const v: E2eZombieView | undefined = zombieById(s, z.id);
        return (
          !!v && Math.abs(v.x + v.width / 2 - zTo.x) < 4 && Math.abs(v.y + v.height / 2 - zTo.y) < 4
        );
      },
      { timeoutMs: 5_000 },
    );
    await p.page.mouse.up();
    await p.wait(300);
    const zLet: E2eZombieView = zombieById(await p.probe.state(), z.id)!;
    expect(zLet.y, 'frozen, it hangs where it was let go').toBeCloseTo(
      zombieById(zHeld, z.id)!.y,
      0,
    );
    await devClick(p.page, 'game-dev-button-freeze-zombies');
    await p.probe.waitFor(
      'unfrozen, the zombie falls',
      (s: E2eSnapshot): boolean => (zombieById(s, z.id)?.y ?? 0) > zombieById(zHeld, z.id)!.y + 20,
      { timeoutMs: 5_000 },
    );
    await p.probe.clearZombies();

    // Corpse.
    await p.probe.dropCorpses(800, 1);
    const lying: E2eSnapshot = await p.probe.waitFor(
      'the corpse lies on the ground',
      (s: E2eSnapshot): boolean =>
        s.corpseViews.some((c: E2eCorpseView): boolean => c.isGrounded && c.angle === 0),
      { timeoutMs: 10_000 },
    );
    const corpse: E2eCorpseView = lying.corpseViews.find(
      (c: E2eCorpseView): boolean => c.isGrounded,
    )!;
    const cTo: { x: number; y: number } = { x: 300, y: 200 };
    await dragOnCanvas(p.page, { x: corpse.footX, y: corpse.footY - 6 }, cTo, true);
    await p.probe.waitFor(
      'the corpse was carried off and fell near x 300',
      (s: E2eSnapshot): boolean => {
        const c: E2eCorpseView | undefined = s.corpseViews.find(
          (v: E2eCorpseView): boolean => v.id === corpse.id,
        );
        return !!c && c.isGrounded && Math.abs(c.footX - corpse.footX) > 200;
      },
      { timeoutMs: 10_000 },
    );

    // Prop.
    // Any lying pickable prop clear of the player (at x 60); ledges count too.
    const prop: LevelProp | undefined = (await p.probe.state()).level.props.find(
      (q: LevelProp): boolean => q.pickable && q.resting && q.carrierId === null && q.x > 150,
    );
    expect(prop, 'the floor has a pickable prop lying somewhere').toBeDefined();
    const pTo: { x: number; y: number } = { x: 640, y: 120 };
    await dragOnCanvas(
      p.page,
      { x: prop!.x + prop!.width / 2, y: prop!.y + prop!.height / 2 },
      pTo,
      false,
    );
    await p.probe.waitFor(
      'the prop hangs at the cursor',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = s.level.props.find(
          (v: LevelProp): boolean => v.id === prop!.id,
        );
        return (
          !!q && Math.abs(q.x + q.width / 2 - pTo.x) < 4 && Math.abs(q.y + q.height / 2 - pTo.y) < 4
        );
      },
      { timeoutMs: 5_000 },
    );
    await p.page.mouse.up();
  });

  test('spawn tool: each click places the chosen zombie type at the cursor', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quietFloor(p);
    await devClick(p.page, 'game-dev-button-spawn-tank');
    const at: { x: number; y: number } = await pagePoint(p.page, 500, 560);
    await p.page.mouse.click(at.x, at.y);
    const s: E2eSnapshot = await p.probe.waitFor(
      'a tank climbs out where the mouse clicked',
      (st: E2eSnapshot): boolean =>
        st.zombies.some((z: E2eZombieView): boolean => z.type === 'tank'),
      { timeoutMs: 5_000 },
    );
    const tank: E2eZombieView = s.zombies.find((z: E2eZombieView): boolean => z.type === 'tank')!;
    expect(Math.abs(tank.x + tank.width / 2 - 500)).toBeLessThan(4);
    expect(tank.y + tank.height, 'on the ground under the cursor').toBe(WORLD.groundY);
  });

  test('freeze holds every zombie in place, unfreeze lets them go', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quietFloor(p);
    await p.probe.teleport(60, WORLD.groundY - WORLD.playerHeight);
    const z: E2eZombieView = await oneZombieAt(p, 500);
    await devClick(p.page, 'game-dev-button-freeze-zombies');
    const frozen: E2eZombieView = zombieById(await p.probe.state(), z.id)!;
    await p.wait(1_500);
    const later: E2eZombieView = zombieById(await p.probe.state(), z.id)!;
    expect(later.x, 'frozen: it did not walk toward the player').toBe(frozen.x);

    await devClick(p.page, 'game-dev-button-freeze-zombies');
    await p.probe.waitFor(
      'unfrozen, it walks again',
      (s: E2eSnapshot): boolean => Math.abs((zombieById(s, z.id)?.x ?? frozen.x) - frozen.x) > 10,
      { timeoutMs: 10_000 },
    );
  });

  test('pause stops time, step runs one tick, slow motion runs a quarter speed', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await openDevTools(p.page);
    await p.page.getByTestId('game-dev-button-pause').click();
    const paused: number = (await p.probe.state()).ticks;
    await p.wait(500);
    expect((await p.probe.state()).ticks, 'no tick while paused').toBe(paused);
    for (let i: number = 0; i < 3; i++) await p.page.getByTestId('game-dev-button-step').click();
    await expect.poll(async (): Promise<number> => (await p.probe.state()).ticks).toBe(paused + 3);
    await p.page.getByTestId('game-dev-button-pause').click();

    await p.page.getByTestId('game-dev-button-slow-motion').click();
    const t0: number = (await p.probe.state()).ticks;
    await p.wait(2_000);
    const slowTicks: number = (await p.probe.state()).ticks - t0;
    // Full speed would be ~100 ticks in 2 s, a quarter ~25.
    expect(slowTicks).toBeGreaterThan(10);
    expect(slowTicks).toBeLessThan(50);
  });

  test('full heal, infinite MP and the teleports', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quietFloor(p);
    await p.probe.setVitals(10, 0);
    await devClick(p.page, 'game-dev-button-heal');
    await p.probe.waitFor(
      'full HP and MP',
      (s: E2eSnapshot): boolean =>
        !!s.player && s.player.hp === s.player.maxHp && s.player.mp === s.player.maxMp,
      { timeoutMs: 5_000 },
    );

    await devClick(p.page, 'game-dev-button-infinite-mp');
    await p.probe.setVitals(500, 0);
    await p.probe.waitFor(
      'MP stays full',
      (s: E2eSnapshot): boolean => !!s.player && s.player.mp === s.player.maxMp,
      { timeoutMs: 5_000 },
    );

    await devClick(p.page, 'game-dev-button-teleport-safe-spot');
    await p.probe.waitFor(
      'resting on the safe spot',
      (s: E2eSnapshot): boolean => !!s.player && s.restingPlayerIds.includes(s.player.id),
      { timeoutMs: 5_000 },
    );

    await devClick(p.page, 'game-dev-button-teleport-exit');
    await p.probe.waitFor(
      'standing on the exit finishes floor 1',
      (s: E2eSnapshot): boolean => s.floor === 2,
      { timeoutMs: 10_000 },
    );
  });

  test('pile corpses at exit drops bodies under the exit; next floor skips ahead', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await quietFloor(p);
    const before: number = (await p.probe.state()).exitPile.bodies;
    await devClick(p.page, 'game-dev-button-pile-exit');
    await p.probe.waitFor(
      'the bodies landed under the exit',
      (s: E2eSnapshot): boolean => s.exitPile.bodies >= before + 8,
      { timeoutMs: 15_000 },
    );

    await devClick(p.page, 'game-dev-button-next-floor');
    await p.probe.waitFor('floor 2', (s: E2eSnapshot): boolean => s.floor === 2, {
      timeoutMs: 5_000,
    });
  });

  test('solve puzzle does each puzzle floor its own way', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await quietFloor(p);
    const cases: Array<{ floor: number; desc: string; done: (s: E2eSnapshot) => boolean }> = [
      {
        floor: 2,
        desc: 'the boulder broke the wall',
        done: (s: E2eSnapshot): boolean => !!s.puzzle?.wallBroken,
      },
      {
        floor: 3,
        desc: 'the spring launched the player',
        done: (s: E2eSnapshot): boolean => (s.spring?.launches ?? 0) >= 1,
      },
      {
        floor: 4,
        desc: 'the exit cage fell and landed',
        done: (s: E2eSnapshot): boolean => !!s.cages?.cages[0]?.landed,
      },
      {
        floor: 5,
        desc: 'the plate holds the door open',
        done: (s: E2eSnapshot): boolean => !!s.plate?.doorOpen,
      },
    ];
    for (const c of cases) {
      await p.probe.setFloor(c.floor);
      await p.probe.clearZombies();
      await p.probe.teleport(WORLD.width / 2, WORLD.groundY - WORLD.playerHeight);
      await devClick(p.page, 'game-dev-button-solve-puzzle');
      await p.probe.waitFor(`floor ${c.floor}: ${c.desc}`, c.done, { timeoutMs: 15_000 });
    }
  });
});
