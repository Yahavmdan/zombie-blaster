import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eGadgetView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import {
  binAt,
  cageAt,
  crackWallAt,
  doorAt,
  gadgetRoom,
  leverAt,
  springAt,
} from '../../support/gadget-layouts';

function gadget(s: E2eSnapshot, id: string): E2eGadgetView {
  const g: E2eGadgetView | undefined = s.gadgets.find((x: E2eGadgetView): boolean => x.id === id);
  if (!g) throw new Error(`no gadget ${id}`);
  return g;
}

function replayed(log: E2eVfxLogEntry[], type: string): boolean {
  return log.some(
    (e: E2eVfxLogEntry): boolean =>
      e.direction === 'replayed' && e.type === type && (e.particlesAdded ?? 0) > 0,
  );
}

test.describe('designed floor gadgets in co-op', { tag: '@online' }, (): void => {
  test("the host runs a guest's lever, crack band and spring: the guest sees the door open, the band break and flies off the spring", async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'gadgets',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.clearZombies();
    // A designed floor is the same constant on every client: load it on both pages.
    const layout: string = gadgetRoom(1, [
      leverAt('g1', 300, ['g2']),
      doorAt('g2', 500),
      crackWallAt('g3', 800),
      springAt('g4', 1100),
    ]);
    await host.probe.loadLayout(layout);
    await guest.probe.loadLayout(layout);
    await guest.probe.waitFor(
      'the guest follows the host gadgets',
      (s: E2eSnapshot): boolean => s.gadgets.length === 4,
      { timeoutMs: 10_000 },
    );

    // The lever: the guest swings, the host flips it, both see the door slide open.
    await guest.face('right');
    await guest.probe.teleport(300 - WORLD.playerWidth - 4, WORLD.groundY - WORLD.playerHeight);
    await guest.wait(400);
    await guest.press(KEYS.attack, 120);
    await host.probe.waitFor(
      "the host counts the guest's swing on the lever",
      (s: E2eSnapshot): boolean => gadget(s, 'g1').on,
      { timeoutMs: 8_000 },
    );
    await guest.probe.waitFor(
      'the guest sees the door open',
      (s: E2eSnapshot): boolean => gadget(s, 'g1').on && gadget(s, 'g2').openTicks >= 30,
      { timeoutMs: 8_000 },
    );

    // The crack band: only the host breaks it; the guest sees it go and its debris fly.
    await guest.probe.clearVfxLog();
    await guest.probe.teleport(800 - WORLD.playerWidth - 4, WORLD.groundY - WORLD.playerHeight);
    await guest.wait(400);
    await guest.hold(KEYS.attack);
    await host.probe.waitFor(
      "the guest's swings break the band on the host",
      (s: E2eSnapshot): boolean => gadget(s, 'g3').broken,
      { timeoutMs: 15_000 },
    );
    await guest.release(KEYS.attack);
    await guest.probe.waitFor(
      'the guest sees the band broken',
      (s: E2eSnapshot): boolean => gadget(s, 'g3').broken,
      { timeoutMs: 5_000 },
    );
    expect(
      replayed(await guest.probe.vfxLog(), 'crack-break'),
      'the guest saw the band break',
    ).toBe(true);

    // The spring: the host fires it, the guest (who owns its player) launches itself.
    await guest.probe.clearVfxLog();
    await guest.probe.teleport(1116, WORLD.groundY - 32 - WORLD.playerHeight - 30);
    await guest.probe.waitFor(
      'the guest flies off the spring',
      (s: E2eSnapshot): boolean => gadget(s, 'g4').launches >= 1 && s.player!.y < 300,
      { timeoutMs: 8_000 },
    );
    expect(replayed(await guest.probe.vfxLog(), 'gadget-launch'), 'the guest saw the launch').toBe(
      true,
    );
  });

  test("a guest pushes a rolling bin: the host rolls it, both see it move", async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'bin',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.clearZombies();
    const layout: string = gadgetRoom(1, [binAt('g1', 600)]);
    await host.probe.loadLayout(layout);
    await guest.probe.loadLayout(layout);
    await guest.probe.waitFor(
      'the guest follows the host gadgets',
      (s: E2eSnapshot): boolean => s.gadgets.length === 1,
      { timeoutMs: 10_000 },
    );
    await guest.probe.teleport(500, WORLD.groundY - WORLD.playerHeight);
    await guest.wait(400);
    await guest.hold(KEYS.right);
    await host.probe.waitFor(
      "the host rolls the bin from the guest's push",
      (s: E2eSnapshot): boolean => (gadget(s, 'g1').body?.x ?? 0) > 700,
      { timeoutMs: 8_000 },
    );
    await guest.probe.waitFor(
      'the guest sees it rolled',
      (s: E2eSnapshot): boolean => (gadget(s, 'g1').body?.x ?? 0) > 700,
      { timeoutMs: 5_000 },
    );
    await guest.release(KEYS.right);
  });

  test('a guest swings a cage and cuts its cable: the host decides, both see the swing and the fall', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'cage',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.clearZombies();
    const layout: string = gadgetRoom(1, [cageAt('g1', 600, WORLD.groundY - 100, 'zombies')]);
    await host.probe.loadLayout(layout);
    await guest.probe.loadLayout(layout);
    // The host stands well away; the cage hangs low enough for a swing to reach it.
    await host.probe.teleport(1000, WORLD.groundY - WORLD.playerHeight);
    await guest.probe.clearVfxLog();
    await guest.face('right');
    await guest.probe.teleport(600 - WORLD.playerWidth - 4, WORLD.groundY - WORLD.playerHeight);
    await guest.wait(400);
    await guest.press(KEYS.attack, 120);
    const swung: E2eSnapshot = await host.probe.waitFor(
      "the guest's hit on the cage swings it on the host",
      (s: E2eSnapshot): boolean => gadget(s, 'g1').swingAngle > 0.01,
      { timeoutMs: 4_000, intervalMs: 20 },
    );
    expect(gadget(swung, 'g1').dropped, 'a hit on the cage only swings it').toBe(false);
    await guest.probe.waitFor(
      'the guest sees the cage swing',
      (s: E2eSnapshot): boolean => gadget(s, 'g1').cage!.x > 605,
      { timeoutMs: 4_000, intervalMs: 20 },
    );

    // Onto the cage, left of its cable, facing it: this swing meets the cable.
    const at: E2eSnapshot = await guest.probe.state();
    await guest.probe.teleport(
      gadget(at, 'g1').cage!.x + 28 - WORLD.playerWidth,
      gadget(at, 'g1').cage!.y - WORLD.playerHeight - 2,
    );
    await guest.wait(900); // Past the hit cooldown of the first swing.
    await guest.press(KEYS.attack, 120);
    await host.probe.waitFor(
      "the host drops the cage on the guest's swing at the cable",
      (s: E2eSnapshot): boolean => gadget(s, 'g1').dropped,
      { timeoutMs: 8_000 },
    );
    await guest.probe.waitFor(
      'the guest sees it landed and its zombies out',
      (s: E2eSnapshot): boolean => gadget(s, 'g1').landed && s.zombies.length >= 2,
      { timeoutMs: 8_000 },
    );
    expect(replayed(await guest.probe.vfxLog(), 'cage-land'), 'the guest saw it land').toBe(true);
  });
});
