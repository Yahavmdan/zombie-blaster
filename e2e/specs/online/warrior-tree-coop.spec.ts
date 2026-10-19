import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot, E2eVfxLogEntry, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import {
  TOUGH_FLOOR,
  WARRIOR,
  castSkill,
  cooldownOf,
  openArena,
  walkUpTo,
  zombieById,
} from '../../support/warrior';

/**
 * A guest warrior's tree skills in co-op, fired from its skill bar. Zombies are the host's, so a
 * guest's launch is a request the host simulates; its dash plays on the host's screen; Hyper Body
 * buffs the ally.
 */
test.describe('warrior skill tree in co-op', { tag: '@online' }, (): void => {
  test("a guest's uppercut launches the host's zombie, its dash shows, hyper body buffs the host", async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'assassin' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'tree',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    const guestId: string = (await guest.probe.state()).player!.id;
    await host.probe.setFloor(TOUGH_FLOOR);
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await guest.probe.setTreeSkills([
      WARRIOR.powerStrike,
      WARRIOR.uppercut,
      WARRIOR.powerDash,
      WARRIOR.autoPotion,
      WARRIOR.hyperBody,
    ]);
    await guest.probe.waitFor(
      'the guest is on the tough floor',
      (s: E2eSnapshot): boolean => s.floor === TOUGH_FLOOR,
      { timeoutMs: 10_000 },
    );

    const left: number = await openArena(host, false);
    const guestX: number = left + 100;
    await guest.probe.teleport(guestX, WORLD.groundY - WORLD.playerHeight);
    await host.probe.teleport(guestX - 60, WORLD.groundY - WORLD.playerHeight);
    await guest.probe.waitFor(
      'the guest stands on the ground',
      (s: E2eSnapshot): boolean => s.player!.isGrounded,
      { timeoutMs: 5_000 },
    );
    await guest.face('right');

    // Uppercut: the guest asks, the host launches and stuns its own zombie, the guest sees it.
    const before: Set<string> = new Set<string>(
      (await host.probe.state()).zombies.map((z: E2eZombieView): string => z.id),
    );
    await host.probe.spawnZombieAt(guestX + WORLD.playerWidth / 2 + 50);
    const spawned: E2eSnapshot = await host.probe.waitFor(
      'the zombie is up',
      (s: E2eSnapshot): boolean =>
        s.zombies.some((z: E2eZombieView): boolean => !before.has(z.id) && z.spawnTimer <= 0),
      { timeoutMs: 8_000 },
    );
    const zombie: string = spawned.zombies.find(
      (z: E2eZombieView): boolean => !before.has(z.id),
    )!.id;
    await guest.probe.waitFor(
      'the guest sees the zombie',
      (s: E2eSnapshot): boolean => !!zombieById(s, zombie),
      { timeoutMs: 3_000 },
    );
    // The floor is crowded: the uppercut takes the nearest zombie in front, whichever it is (only
    // the uppercut stuns here), and the target may wander off first, so walk up and try again.
    let launched: string | null = null;
    for (let attempt: number = 0; attempt < 4 && !launched; attempt++) {
      await walkUpTo(guest, zombie);
      await guest.probe.waitFor(
        'uppercut ready',
        (s: E2eSnapshot): boolean => cooldownOf(s, WARRIOR.uppercut) === 0,
        { timeoutMs: 5_000 },
      );
      await castSkill(guest, WARRIOR.uppercut);
      launched = await host.probe
        .waitFor(
          'the host launched and stunned a zombie',
          (s: E2eSnapshot): boolean =>
            s.zombies.some((z: E2eZombieView): boolean => z.stunTicks > 0 && !z.isGrounded),
          { timeoutMs: 2_500, intervalMs: 20 },
        )
        .then(
          (s: E2eSnapshot): string =>
            s.zombies.find((z: E2eZombieView): boolean => z.stunTicks > 0 && !z.isGrounded)!.id,
          (): null => null,
        );
    }
    expect(launched, "the host launched the guest's uppercut target").not.toBeNull();
    await guest.probe.waitFor(
      'the guest sees it stunned',
      (s: E2eSnapshot): boolean => (zombieById(s, launched!)?.stunTicks ?? 0) > 0,
      { timeoutMs: 3_000, intervalMs: 20 },
    );

    // Power dash: the guest holds attack and lets go; the host sees it move and plays its streak.
    await guest.probe.waitFor(
      'dash ready',
      (st: E2eSnapshot): boolean => cooldownOf(st, WARRIOR.powerDash) === 0,
      { timeoutMs: 5_000 },
    );
    const hostLog: number = (await host.probe.vfxLog()).reduce(
      (m: number, e: E2eVfxLogEntry): number => Math.max(m, e.seq),
      0,
    );
    const fromX: number = (await guest.probe.state()).player!.x;
    // Hold attack past a second: the host sees the guest's charge bar fill, then the dash on release.
    await guest.hold(KEYS.attack);
    await host.probe.waitFor(
      "the host sees the guest's charge",
      (st: E2eSnapshot): boolean =>
        st.remotePlayers.some(
          (rp: { id: string; skillCharge: number | null }): boolean =>
            rp.id === guestId && (rp.skillCharge ?? 0) > 0,
        ),
      { timeoutMs: 4_000, intervalMs: 30 },
    );
    await guest.wait(500);
    await guest.release(KEYS.attack);
    await host.probe.waitFor(
      "the host sees the guest dash",
      (st: E2eSnapshot): boolean =>
        st.remotePlayers.some(
          (rp: { id: string; x: number }): boolean =>
            rp.id === guestId && Math.abs(rp.x - fromX) > 100,
        ),
      { timeoutMs: 3_000, intervalMs: 30 },
    );
    const replayed: E2eVfxLogEntry[] = (await host.probe.vfxLog()).filter(
      (e: E2eVfxLogEntry): boolean =>
        e.seq > hostLog && e.direction === 'replayed' && e.playerId === guestId,
    );
    expect(replayed.length, "the guest's dash effects replayed on the host").toBeGreaterThan(0);

    // Hyper body: the guest's stance buffs the host standing next to it.
    await guest.wait(1_500);
    await guest.probe.waitFor(
      'the guest stands still after the dash',
      (s: E2eSnapshot): boolean =>
        s.player!.isGrounded && !s.player!.isAttacking && Math.abs(s.player!.velocityX) < 1,
      { timeoutMs: 5_000 },
    );
    const guestNow: E2eSnapshot = await guest.probe.state();
    await host.probe.teleport(guestNow.player!.x - 40, WORLD.groundY - WORLD.playerHeight);
    await guest.wait(300);
    await castSkill(guest, WARRIOR.hyperBody);
    await guest.probe.waitFor(
      'the guest cast hyper body',
      (s: E2eSnapshot): boolean =>
        s.buffs.some((b: { skillId: string }): boolean => b.skillId === WARRIOR.hyperBody),
      { timeoutMs: 3_000 },
    );
    await host.probe.waitFor(
      'the host got hyper body',
      (s: E2eSnapshot): boolean =>
        s.buffs.some(
          (b: { skillId: string; stat: string }): boolean =>
            b.skillId === WARRIOR.hyperBody && b.stat === 'maxHpMaxMpPercent',
        ),
      { timeoutMs: 4_000 },
    );
  });
});
