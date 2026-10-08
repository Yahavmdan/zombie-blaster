import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eCorpseView, E2ePlateView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { WORLD } from '../../support/invariants';

const PLATE_FLOOR: number = 5;

async function plateFloor(p: GamePlayer): Promise<E2eSnapshot> {
  await p.probe.setGodMode(true);
  await p.probe.setFloor(PLATE_FLOOR);
  return p.probe.waitFor(
    'the plate floor',
    (st: E2eSnapshot): boolean => st.floor === PLATE_FLOOR && st.plate !== null,
  );
}

function logged(log: E2eVfxLogEntry[], type: string): boolean {
  return log.some((e: E2eVfxLogEntry): boolean => e.type === type);
}

/** Puts the player on the plate's surface, just left of it (not on it), facing it. */
async function besidePlate(p: GamePlayer, plate: E2ePlateView): Promise<void> {
  // Face first: the turning key-press walks a step.
  await p.face('right');
  await p.probe.teleport(plate.box.x - WORLD.playerWidth, plate.box.y - WORLD.playerHeight);
  await p.wait(500);
}

/** Drops a corpse at x, picks it up (E), carries it beside the plate and tosses it on (E). */
async function carryOntoPlate(p: GamePlayer, plate: E2ePlateView, x: number): Promise<void> {
  const before: E2eSnapshot = await p.probe.state();
  const known: Set<string> = new Set<string>(
    before.corpseViews.map((c: E2eCorpseView): string => c.id),
  );
  await p.probe.dropCorpses(x, 1);
  const landed: E2eSnapshot = await p.probe.waitFor(
    'the dropped corpse lands',
    (s: E2eSnapshot): boolean =>
      s.corpseViews.some((c: E2eCorpseView): boolean => !known.has(c.id) && c.isGrounded),
  );
  const corpse: E2eCorpseView = landed.corpseViews.find(
    (c: E2eCorpseView): boolean => !known.has(c.id) && c.isGrounded,
  )!;
  await p.probe.teleport(
    corpse.footX + corpse.footWidth / 2 - WORLD.playerWidth / 2,
    corpse.footY + 5 - WORLD.playerHeight,
  );
  await p.wait(300);
  await p.press(KEYS.carry, 70);
  await p.probe.waitFor(
    'carrying it',
    (s: E2eSnapshot): boolean => s.player!.carryingCorpseIds.includes(corpse.id),
    { timeoutMs: 3_000 },
  );
  await besidePlate(p, plate);
  // Attack throws: beside corpses already on the plate, E would pick one up instead.
  await p.press(KEYS.attack, 70);
  await p.probe.waitFor(
    'tossed, it lands',
    (s: E2eSnapshot): boolean =>
      s.player!.carryingCorpseIds.length === 0 &&
      s.corpseViews.some((c: E2eCorpseView): boolean => c.id === corpse.id && c.isGrounded),
    { timeoutMs: 3_000 },
  );
}

test.describe('pressure plate (floor 5)', { tag: '@solo' }, (): void => {
  test('floor 5: the exit door stays shut until something weighs down the plate on a far ledge', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await plateFloor(p);
    const plate: E2ePlateView = s0.plate!;
    await p.attachCanvas(testInfo, 'plate floor');
    expect(plate.weight).toBe(0);
    expect(plate.doorOpen).toBe(false);
    const exitCenter: number = s0.exit.x + s0.exit.width / 2;
    const plateCenter: number = plate.box.x + plate.box.width / 2;
    expect(plateCenter < WORLD.width / 2, 'across the screen from the exit').toBe(
      exitCenter >= WORLD.width / 2,
    );
    expect(plate.door.y + plate.door.height, 'the door stands on the exit').toBe(s0.exit.y);

    // Standing on the exit while the door is shut does nothing.
    await p.probe.teleport(s0.exit.x + 40, s0.exit.y - WORLD.playerHeight - 10);
    await p.wait(1_500);
    const shut: E2eSnapshot = await p.probe.state();
    expect(shut.player!.isGrounded).toBe(true);
    expect(shut.floor, 'the shut door keeps you in').toBe(PLATE_FLOOR);

    // Standing on the plate yourself is enough weight: the door opens.
    await p.probe.clearVfxLog();
    await p.probe.teleport(
      plateCenter - WORLD.playerWidth / 2,
      plate.box.y - WORLD.playerHeight - 10,
    );
    const open: E2eSnapshot = await p.probe.waitFor(
      'the door slides open',
      (st: E2eSnapshot): boolean => st.plate!.doorOpen,
      { timeoutMs: 5_000 },
    );
    expect(open.plate!.weight).toBe(plate.playerWeight);
    expect(logged(await p.probe.vfxLog(), 'door-open')).toBe(true);
    await p.attachCanvas(testInfo, 'standing on the plate, door open');

    // Step off and it slams shut.
    await p.probe.clearVfxLog();
    await besidePlate(p, plate);
    await p.probe.waitFor(
      'the door shuts',
      (st: E2eSnapshot): boolean => st.plate!.doorTicks === 0 && st.plate!.weight === 0,
      { timeoutMs: 5_000 },
    );
    expect(logged(await p.probe.vfxLog(), 'door-shut')).toBe(true);
  });

  test('carry corpses onto the plate (E to pick up, E to toss): the door opens and the exit lets you out', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await plateFloor(p);
    const plate: E2ePlateView = s0.plate!;
    // Corpses come from the open middle of the ground; zombies crowding the plate kick some off, so keep carrying.
    let st: E2eSnapshot = s0;
    for (let carried: number = 0; carried < 15 && !st.plate!.held; carried++) {
      await carryOntoPlate(p, plate, WORLD.width / 2);
      st = await p.probe.state();
    }
    expect(st.plate!.held, 'the corpses hold the plate down').toBe(true);
    expect(st.player!.carryingCorpseIds).toEqual([]);
    await p.probe.waitFor('the door opens', (s: E2eSnapshot): boolean => s.plate!.doorOpen, {
      timeoutMs: 5_000,
    });
    await p.attachCanvas(testInfo, 'corpses on the plate, door open');

    // Setup: straight onto the exit (climbing the pile is covered by the exit specs).
    await p.probe.teleport(s0.exit.x + 40, s0.exit.y - WORLD.playerHeight - 10);
    await p.probe.waitFor(
      'out through the open door',
      (s: E2eSnapshot): boolean => s.floor === PLATE_FLOOR + 1,
      { timeoutMs: 5_000 },
    );
  });
});
