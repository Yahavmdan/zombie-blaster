import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eGadgetView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import {
  BOULDER_PX,
  boulderAt,
  buttonAt,
  crackWallAt,
  doorAt,
  gadgetRoom,
  leverAt,
  springAt,
  slopeAt,
  cageAt,
  exitDoorAt,
} from '../../support/gadget-layouts';

function gadget(s: E2eSnapshot, id: string): E2eGadgetView {
  const g: E2eGadgetView | undefined = s.gadgets.find((x: E2eGadgetView): boolean => x.id === id);
  if (!g) throw new Error(`no gadget ${id}`);
  return g;
}

/** A designed floor on the current floor, god mode, no zombies around yet. */
async function designed(p: GamePlayer, json: string): Promise<void> {
  await p.probe.setGodMode(true);
  await p.probe.clearZombies();
  await p.probe.loadLayout(json);
}

test.describe('designed floor gadgets', { tag: '@solo' }, (): void => {
  test('a swing rolls the boulder: it crushes the zombie in its way and breaks the crack band', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await designed(p, gadgetRoom(1, [boulderAt('g1', 600), crackWallAt('g2', 780)]));
    await p.probe.spawnZombieAt(700, 'walker');
    const victim: E2eZombieView = (
      await p.probe.waitFor(
        'a walker stands between the boulder and the wall',
        (s: E2eSnapshot): boolean =>
          s.zombies.some((z: E2eZombieView): boolean => z.x > 640 && z.x < 780 && z.isGrounded),
        { timeoutMs: 5_000 },
      )
    ).zombies.find((z: E2eZombieView): boolean => z.x > 640 && z.x < 780)!;

    // Face first: the turning key-press walks a step.
    await p.face('right');
    await p.probe.teleport(600 - WORLD.playerWidth - 6, WORLD.groundY - WORLD.playerHeight);
    await p.wait(300);
    await p.hold(KEYS.attack);
    await p.probe.waitFor(
      'the swing rolls the boulder away',
      (s: E2eSnapshot): boolean => (gadget(s, 'g1').body?.vx ?? 0) > 0,
      { timeoutMs: 5_000 },
    );
    await p.release(KEYS.attack);
    const after: E2eSnapshot = await p.probe.waitFor(
      'the crack band broke out',
      (s: E2eSnapshot): boolean => gadget(s, 'g2').broken,
      { timeoutMs: 6_000 },
    );
    expect(
      after.zombies.some((z: E2eZombieView): boolean => z.id === victim.id),
      'the walker in its way was crushed',
    ).toBe(false);
    expect(gadget(after, 'g1').body!.x, 'the boulder rolls on through the hole').toBeGreaterThan(
      780 - BOULDER_PX,
    );
  });

  test('a lever wired to a door and the exit: a swing opens both, the player walks through', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await designed(
      p,
      gadgetRoom(1, [leverAt('g1', 400, ['g2', 'exit']), doorAt('g2', 640)], 'Hit the lever.'),
    );
    const s0: E2eSnapshot = await p.probe.state();
    expect(s0.exitLocked, 'the wired exit starts locked').toBe(true);

    await p.face('right');
    await p.probe.teleport(400 - WORLD.playerWidth - 4, WORLD.groundY - WORLD.playerHeight);
    await p.wait(300);
    await p.press(KEYS.attack, 120);
    await p.probe.waitFor(
      'the lever flips, the door and the exit open',
      (s: E2eSnapshot): boolean =>
        gadget(s, 'g1').on && gadget(s, 'g2').openTicks >= 30 && !s.exitLocked,
      { timeoutMs: 5_000 },
    );
    await p.probe.teleport(560, WORLD.groundY - WORLD.playerHeight);
    await p.wait(300);
    await p.hold(KEYS.right);
    await p.probe.waitFor(
      'the player walks under the open door',
      (s: E2eSnapshot): boolean => s.player!.x > 640 + 32,
      { timeoutMs: 5_000 },
    );
    await p.release(KEYS.right);
  });

  test('a closed door blocks; a button holds it open while the player stands on it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await designed(p, gadgetRoom(1, [buttonAt('g1', 300, ['g2']), doorAt('g2', 700)]));
    await p.probe.teleport(600, WORLD.groundY - WORLD.playerHeight);
    await p.wait(300);
    await p.hold(KEYS.right);
    await p.wait(1_200);
    await p.release(KEYS.right);
    expect(
      (await p.probe.state()).player!.x + WORLD.playerWidth,
      'the shut door stops it',
    ).toBeLessThanOrEqual(702);
    await p.probe.teleport(310, WORLD.groundY - WORLD.playerHeight);
    await p.probe.waitFor(
      'standing on the button opens the door',
      (s: E2eSnapshot): boolean =>
        gadget(s, 'g1').on && gadget(s, 'g1').kg >= 80 && gadget(s, 'g2').openTicks >= 30,
      { timeoutMs: 5_000 },
    );
    await p.probe.teleport(100, WORLD.groundY - WORLD.playerHeight);
    await p.probe.waitFor(
      'stepping off shuts it again',
      (s: E2eSnapshot): boolean => !gadget(s, 'g1').on && gadget(s, 'g2').openTicks === 0,
      { timeoutMs: 5_000 },
    );
  });

  test('an unwired spring launches the player who lands on it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await designed(p, gadgetRoom(1, [springAt('g1', 900)]));
    await p.probe.teleport(916, WORLD.groundY - 32 - WORLD.playerHeight - 40);
    await p.probe.waitFor(
      'the spring fires and throws the player high',
      (s: E2eSnapshot): boolean => gadget(s, 'g1').launches === 1 && s.player!.y < 300,
      { timeoutMs: 5_000 },
    );
  });
});

test.describe('designed floor slopes, cages and exit doors', { tag: '@solo' }, (): void => {
  test('the player walks up a slope with the arrow key; a boulder left on one rolls down', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await designed(
      p,
      gadgetRoom(1, [
        slopeAt('g1', 400),
        slopeAt('g2', 800, false),
        { ...boulderAt('g3', 804), y: WORLD.groundY - 96 - BOULDER_PX + 2 },
      ]),
    );
    await p.probe.teleport(340, WORLD.groundY - WORLD.playerHeight);
    await p.wait(300);
    await p.hold(KEYS.right);
    const up: E2eSnapshot = await p.probe.waitFor(
      'the player is up on the slope',
      (s: E2eSnapshot): boolean =>
        s.player!.isGrounded && s.player!.y + WORLD.playerHeight < WORLD.groundY - 60,
      { timeoutMs: 5_000 },
    );
    await p.release(KEYS.right);
    expect(up.player!.x, 'on the slope, not over the ground').toBeGreaterThan(400);
    await p.probe.waitFor(
      'the boulder rolled down off the other slope',
      (s: E2eSnapshot): boolean => (gadget(s, 'g3').body?.x ?? 0) > 1000,
      { timeoutMs: 6_000 },
    );
  });

  test('zombies walk up a slope after a player standing on it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await designed(p, gadgetRoom(1, [slopeAt('g1', 400)]));
    // The slope rises from x 400 (ground) to x 592, 96 px up: stand near its top.
    await p.probe.teleport(540, WORLD.groundY - 96 - WORLD.playerHeight - 20);
    await p.probe.waitFor(
      'the player stands on the slope',
      (s: E2eSnapshot): boolean =>
        s.player!.isGrounded && s.player!.y + WORLD.playerHeight < WORLD.groundY - 60,
      { timeoutMs: 5_000 },
    );
    // Walkers are slow: start one just off the slope's foot.
    await p.probe.spawnZombieAt(340, 'walker');
    await p.probe.waitFor(
      'a zombie walked up the slope',
      (s: E2eSnapshot): boolean =>
        s.zombies.some(
          (z: E2eZombieView): boolean =>
            z.isGrounded && z.x > 420 && z.x < 592 && z.y + z.height < WORLD.groundY - 20,
        ),
      { timeoutMs: 15_000 },
    );
  });

  test('a lever drops a cage: it lands as a step and lets its zombies out', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await designed(
      p,
      gadgetRoom(1, [leverAt('g1', 300, ['g2']), cageAt('g2', 800, 150, 'zombies')]),
    );
    await p.face('right');
    await p.probe.teleport(300 - WORLD.playerWidth - 4, WORLD.groundY - WORLD.playerHeight);
    await p.wait(300);
    await p.press(KEYS.attack, 120);
    const landed: E2eSnapshot = await p.probe.waitFor(
      'the cage fell and stands on the ground',
      (s: E2eSnapshot): boolean => gadget(s, 'g2').landed,
      { timeoutMs: 6_000 },
    );
    expect(gadget(landed, 'g2').body!.y + 64, 'on the ground').toBe(WORLD.groundY);
    expect(
      landed.zombies.filter((z: E2eZombieView): boolean => Math.abs(z.x - 820) < 80).length,
      'its zombies came out',
    ).toBeGreaterThanOrEqual(2);
  });

  test('walking into an open exit door finishes the floor', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await designed(p, gadgetRoom(1, [exitDoorAt('g1', 700)]));
    await p.probe.teleport(600, WORLD.groundY - WORLD.playerHeight);
    await p.wait(300);
    await p.hold(KEYS.right);
    await p.probe.waitFor('the floor is done', (s: E2eSnapshot): boolean => s.floor === 2, {
      timeoutMs: 6_000,
    });
    await p.release(KEYS.right);
  });
});
