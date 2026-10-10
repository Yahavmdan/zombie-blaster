import { Browser, expect as baseExpect } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { WORLD } from '../../support/invariants';
import { E2eSkillView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { RoomSession, uniqueRoomName } from '../../support/room';

/**
 * Online corners found in the 2026-10-10 edge-case sweep: a double-clicked Create, browser Back
 * out of a game, a downed body on the exit and Dark Sight on a guest. All four were bugs, fixed the
 * same day.
 */

const DARK_SIGHT: string = 'assassin-dark-sight';

test.describe('online edge sweep', { tag: '@online' }, (): void => {
  test('double-clicking Create opens the room without an error banner', async ({
    browser,
  }: {
    browser: Browser;
  }): Promise<void> => {
    const p: GamePlayer = await GamePlayer.open(browser, { name: 'Clicky', classId: 'warrior' });
    try {
      await p.enterLobby();
      await p.page.getByTestId('lobby-create-input-roomname').fill(uniqueRoomName('dbl'));
      await p.page.getByTestId('lobby-create-button-create').dblclick();
      await baseExpect(p.page.getByTestId('lobby-room-button-start')).toBeVisible();
      await p.wait(800);
      await baseExpect(p.page.locator('.error-banner')).toBeHidden();
    } finally {
      await p.close();
    }
  });

  test('browser Back from a game to the lobby leaves exactly one game socket', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room([
      { name: 'Host', classId: 'warrior' },
      { name: 'Leaver', classId: 'mage' },
    ]);
    const guest: GamePlayer = session.guests[0];
    await guest.page.goBack();
    await guest.page.waitForURL(/\/lobby/);
    await guest.wait(3_000);
    expect(await guest.openGameSocketCount(), 'open game sockets after Back').toBe(1);
  });

  test('a downed guest whose body lands on the exit does not finish the floor', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const session: RoomSession = await room([
      { name: 'Host', classId: 'warrior' },
      { name: 'Limp', classId: 'mage' },
    ]);
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.knockOut();
    await guest.probe.waitFor('guest downed', (s: E2eSnapshot): boolean => s.player!.isDown);

    const s0: E2eSnapshot = await guest.probe.state();
    await guest.probe.teleport(
      s0.exit.x + s0.exit.width / 2 - WORLD.playerWidth / 2,
      s0.exit.y - WORLD.playerHeight - 20,
    );
    await guest.probe.waitFor(
      'the downed body lies on the exit',
      (s: E2eSnapshot): boolean =>
        s.floor > 1 ||
        (s.player!.isDown && s.player!.isGrounded && s.player!.y + WORLD.playerHeight === s.exit.y),
    );
    await host.wait(1_500);
    expect((await host.probe.state()).floor, 'nobody standing walked out').toBe(1);
  });

  test('Dark Sight keeps a guest from being hit, as it does the host', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room([
      { name: 'Host', classId: 'warrior' },
      { name: 'Shade', classId: 'assassin' },
    ]);
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.maxOutPlayer();
    await guest.probe.setGodMode(false);
    await host.probe.setFloor(6);

    const skill: E2eSkillView | undefined = (await guest.probe.state()).usableSkills.find(
      (k: E2eSkillView): boolean => k.id === DARK_SIGHT,
    );
    expect(skill, 'Dark Sight is on the skill bar').toBeDefined();
    await guest.castSkill(skill!.slot);
    await guest.probe.waitFor('Dark Sight on', (s: E2eSnapshot): boolean =>
      s.usableSkills.some((k: E2eSkillView): boolean => k.id === DARK_SIGHT && k.cooldownTicks > 0),
    );
    const hp0: number = (await guest.probe.state()).player!.maxHp;
    await guest.probe.setVitals(hp0, (await guest.probe.state()).player!.maxMp);

    // Stand among the zombies while hidden (a maxed Dark Sight lasts far longer than this), until one swings.
    const end: number = Date.now() + 45_000;
    while (Date.now() < end && (await guest.probe.state()).player!.hp === hp0) {
      const h: E2eSnapshot = await host.probe.state();
      const z: E2eZombieView | undefined = h.zombies.find(
        (zz: E2eZombieView): boolean => !zz.isDead && zz.spawnTimer <= 0 && zz.type !== 'eater',
      );
      if (z) await guest.probe.teleport(z.x - 30, z.y + z.height - WORLD.playerHeight);
      await guest.wait(500);
    }
    const after: E2eSnapshot = await guest.probe.state();
    expect(after.player!.hp, 'no zombie hit the hidden guest').toBe(hp0);
  });
});
