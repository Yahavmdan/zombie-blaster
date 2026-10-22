import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { closeDevTools, openDevTools } from '../../support/dev-tools';

/**
 * The host simulates the dragon: the guest sees it turn to face a player behind it, and sees its
 * corpse fade out and leave (DRAGON_CORPSE_LINGER_TICKS, 4 s) while ordinary corpses stay.
 */

const DRAGON_CORPSE_LINGER_MS: number = 4_000;

function dragonOf(s: E2eSnapshot): E2eZombieView | undefined {
  return s.zombies.find((z: E2eZombieView): boolean => z.type === 'dragon-boss' && !z.isDead);
}

test.describe('dragon boss in co-op', { tag: '@online' }, (): void => {
  test("the guest sees the host's dragon turn to the player behind it, and its corpse fade away", async ({
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
      'dragon-sync',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await openDevTools(host.page);
    await host.page.getByTestId('game-dev-button-zombie-spawns').click();
    await closeDevTools(host.page);
    await host.probe.clearZombies();

    // Both players on the left: the dragon in the middle faces left.
    const groundY: number = WORLD.groundY - WORLD.playerHeight;
    await host.probe.teleport(200, groundY);
    await guest.probe.teleport(240, groundY);
    await host.probe.spawnZombieAt(800, 'dragon-boss');
    const up: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees the dragon hovering, facing left',
      (s: E2eSnapshot): boolean => {
        const d: E2eZombieView | undefined = dragonOf(s);
        return !!d && d.spawnTimer <= 0 && d.y + d.height < WORLD.groundY - 60 && d.facing === -1;
      },
      { timeoutMs: 20_000 },
    );
    const d: E2eZombieView = dragonOf(up)!;

    // Both slip behind it, to its right: the guest sees it turn around.
    const behind: number = Math.min(WORLD.width - 80, d.x + d.width + 120);
    await host.probe.teleport(behind, groundY);
    await guest.probe.teleport(behind + 30, groundY);
    await guest.probe.waitFor(
      'the guest sees the dragon turn to face right',
      (s: E2eSnapshot): boolean => dragonOf(s)?.facing === 1,
      { timeoutMs: 10_000 },
    );

    await host.probe.spawnZombieAt(300);
    await host.probe.waitFor(
      'a walker climbed out',
      (s: E2eSnapshot): boolean =>
        s.zombies.some((z: E2eZombieView): boolean => z.type === 'walker' && z.spawnTimer <= 0),
      { timeoutMs: 10_000 },
    );
    await openDevTools(host.page);
    await host.page.getByTestId('game-dev-button-kill-all').click();
    await closeDevTools(host.page);
    await guest.probe.waitFor(
      'the guest sees the dragon corpse on the ground',
      (s: E2eSnapshot): boolean =>
        s.corpseViews.some((c: E2eCorpseView): boolean => c.id === d.id && c.isGrounded),
      { timeoutMs: 10_000 },
    );
    const gone: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees the dragon corpse gone',
      (s: E2eSnapshot): boolean =>
        !s.corpseViews.some((c: E2eCorpseView): boolean => c.id === d.id),
      { timeoutMs: DRAGON_CORPSE_LINGER_MS + 5_000 },
    );
    expect(gone.corpseViews.length, 'the walker corpse stays').toBeGreaterThan(0);
  });
});
