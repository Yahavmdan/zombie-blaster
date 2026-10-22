import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import {
  E2eCorpseView,
  E2ePlayerView,
  E2eRemotePlayerView,
  E2eSnapshot,
  E2eVfxLogEntry,
} from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { layoutWhere } from '../../support/navigation';
import {
  barrelWithOpenSkyBeside,
  CORPSE_DROP_DX,
  dropLyingCorpses,
  findProp,
  isBarrel,
  LevelProp,
  pickableOnGround,
  propCenterX,
  standLeftOf,
} from '../../support/props';

/** Mirrors BARREL_BLAST_PLAYER_DAMAGE_PERCENT in shared/game-constants.ts (point blank: the guest stands right beside it). */
const BLAST_PLAYER_PERCENT: number = 40;
/** God mode goes off this many ticks before the blast (sync lag included; i-frames last 90). */
const MORTAL_TICKS: number = 40;

test.describe('exploding barrels in co-op', { tag: '@online' }, (): void => {
  test('a guest lights a barrel: both see the fuse burn, and both see it blow up and vanish', async ({
    room,
  }: {
    room: RoomFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(160_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'barrels',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    const s0: E2eSnapshot = await layoutWhere(
      host,
      'a lone barrel on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s, isBarrel) !== undefined,
    );
    const barrel: LevelProp = pickableOnGround(s0, isBarrel)!;
    const id: string = barrel.id!;
    await guest.probe.waitFor(
      "the guest follows the host's layout",
      (s: E2eSnapshot): boolean =>
        s.level.seed === s0.level.seed && findProp(s, id)?.x === barrel.x,
      { timeoutMs: 5_000 },
    );
    const hostId: string = (await host.probe.state()).player!.id;

    // The guest swings; the host decides the hit and lights the fuse.
    await standLeftOf(guest, barrel);
    await guest.press(KEYS.attack, 70);
    await host.probe.waitFor(
      "the host lights the fuse from the guest's swing",
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) > 0,
      { timeoutMs: 5_000 },
    );
    await guest.probe.waitFor(
      'the guest sees the fuse burning',
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) > 0,
      { timeoutMs: 5_000 },
    );
    await guest.attachCanvas(testInfo, 'guest sees the lit barrel');

    await host.probe.waitFor(
      'the barrel blows up on the host',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === true,
      { timeoutMs: 10_000 },
    );
    await guest.probe.waitFor(
      'the barrel is gone on the guest too',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === true,
      { timeoutMs: 5_000 },
    );
    await expectReplayed(
      guest,
      'barrel-blast',
      hostId,
      "the guest replays and draws the host's blast",
    );
    await guest.attachCanvas(testInfo, 'guest sees the blast');

    // 45 s later (BARREL_RESPAWN_TICKS) the host puts it back on its spawn spot, and so does the guest.
    await host.probe.waitFor(
      'the barrel is back on the host',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === false,
      { timeoutMs: 60_000 },
    );
    const back: E2eSnapshot = await guest.probe.waitFor(
      'the barrel is back on the guest',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === false,
      { timeoutMs: 5_000 },
    );
    expect(findProp(back, id)).toMatchObject({ x: barrel.x, y: barrel.y, fuseTicks: 0 });
    await expectReplayed(guest, 'barrel-respawn', hostId, 'the guest sees it drop back in');
  });

  test('a guest throws a barrel with the attack key: the host lights it, both see it fly off burning', async ({
    room,
  }: {
    room: RoomFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'barrel-throw',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    const s0: E2eSnapshot = await layoutWhere(
      host,
      'a lone barrel on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s, isBarrel) !== undefined,
    );
    const barrel: LevelProp = pickableOnGround(s0, isBarrel)!;
    const id: string = barrel.id!;
    await guest.probe.waitFor(
      "the guest follows the host's layout",
      (s: E2eSnapshot): boolean =>
        s.level.seed === s0.level.seed && findProp(s, id)?.x === barrel.x,
      { timeoutMs: 5_000 },
    );
    const hostId: string = (await host.probe.state()).player!.id;
    const guestId: string = (await guest.probe.state()).player!.id;

    await standLeftOf(guest, barrel);
    await guest.press(KEYS.carry, 70);
    await host.probe.waitFor(
      'the host grants the guest the barrel',
      (s: E2eSnapshot): boolean => findProp(s, id)?.carrierId === guestId,
      { timeoutMs: 5_000 },
    );
    expect(findProp(await host.probe.state(), id)!.fuseTicks, 'carried unlit').toBe(0);

    await guest.press(KEYS.attack, 70);
    await host.probe.waitFor(
      "the host lights the guest's thrown barrel",
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, id);
        return !!q && q.carrierId === null && q.fuseTicks > 0;
      },
      { timeoutMs: 5_000 },
    );
    await guest.probe.waitFor(
      'the guest sees its thrown barrel burning',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, id);
        return !!q && q.carrierId === null && q.fuseTicks > 0;
      },
      { timeoutMs: 5_000 },
    );
    await expectReplayed(guest, 'hit-particles', hostId, 'the guest sees the fuse catch');
    await guest.attachCanvas(testInfo, 'guest sees its thrown barrel lit');

    await host.probe.waitFor(
      'the thrown barrel blows up on the host',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === true,
      { timeoutMs: 10_000 },
    );
    await guest.probe.waitFor(
      'the barrel is gone on the guest too',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === true,
      { timeoutMs: 5_000 },
    );
  });

  test("the host's blast hurts and throws the guest beside it, and both see the corpses there fly", async ({
    room,
  }: {
    room: RoomFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'barrel-blast',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    const s0: E2eSnapshot = await layoutWhere(
      host,
      'a lone barrel on open ground, open sky beside it',
      (s: E2eSnapshot): boolean => barrelWithOpenSkyBeside(s) !== undefined,
    );
    const barrel: LevelProp = barrelWithOpenSkyBeside(s0)!;
    const id: string = barrel.id!;
    await guest.probe.waitFor(
      "the guest follows the host's layout",
      (s: E2eSnapshot): boolean =>
        s.level.seed === s0.level.seed && findProp(s, id)?.x === barrel.x,
      { timeoutMs: 5_000 },
    );
    // The host waits on the far side of the screen, out of the blast.
    const farX: number = propCenterX(barrel) > WORLD.width / 2 ? 40 : WORLD.width - 80;
    await host.probe.teleport(farX, WORLD.groundY - WORLD.playerHeight);
    const corpses: E2eCorpseView[] = await dropLyingCorpses(
      host,
      [guest],
      propCenterX(barrel) + CORPSE_DROP_DX,
      2,
    );

    await standLeftOf(guest, barrel);
    await guest.press(KEYS.attack, 70);
    await host.probe.waitFor(
      "the host lights the fuse from the guest's swing",
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) > 0,
      { timeoutMs: 5_000 },
    );
    // Mortal only for the fuse's last moment: a zombie hit before it would leave the guest
    // invincible through the blast.
    await host.probe.waitFor(
      'the fuse is almost out',
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) <= MORTAL_TICKS,
      { timeoutMs: 5_000 },
    );
    await host.probe.clearZombies();
    await guest.probe.setGodMode(false);
    const before: E2ePlayerView = (await guest.probe.state()).player!;
    await guest.probe.setVitals(before.maxHp, before.mp);

    await host.probe.waitFor(
      'the barrel blows up on the host',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === true,
      { timeoutMs: 10_000 },
    );
    const thrown: E2eSnapshot = await guest.probe.waitFor(
      "the host's blast throws the guest back, away from the barrel",
      (s: E2eSnapshot): boolean => s.player!.x < before.x - 30,
      { timeoutMs: 3_000 },
    );
    const lost: number = Math.ceil((before.maxHp * BLAST_PLAYER_PERCENT) / 100);
    expect(thrown.player!.hp, `${BLAST_PLAYER_PERCENT}% of max HP`).toBeLessThanOrEqual(
      before.maxHp - lost,
    );
    await guest.attachCanvas(testInfo, 'guest thrown by the blast');
    await host.probe.waitFor(
      "the host sees the guest's HP drop",
      (s: E2eSnapshot): boolean =>
        (s.remotePlayers.find((r: E2eRemotePlayerView): boolean => r.id === before.id)?.hp ??
          before.maxHp) <= before.maxHp - lost,
      { timeoutMs: 5_000 },
    );

    for (const p of [host, guest]) {
      await p.probe.waitFor(
        'the corpses fly off away from the barrel and land again',
        (s: E2eSnapshot): boolean =>
          corpses.every((c: E2eCorpseView): boolean => {
            const now: E2eCorpseView | undefined = s.corpseViews.find(
              (v: E2eCorpseView): boolean => v.id === c.id,
            );
            return now !== undefined && now.isGrounded && now.x > c.x + 30;
          }),
        { timeoutMs: 5_000 },
      );
    }
    await guest.attachCanvas(testInfo, 'guest sees the corpses thrown');
  });
});

/** The guest replayed (and drew particles for) an effect of this type from the host. */
async function expectReplayed(
  guest: GamePlayer,
  type: string,
  hostId: string,
  message: string,
): Promise<void> {
  await expect
    .poll(
      async (): Promise<boolean> =>
        (await guest.probe.vfxLog()).some(
          (e: E2eVfxLogEntry): boolean =>
            e.type === type &&
            e.direction === 'replayed' &&
            e.playerId === hostId &&
            (e.particlesAdded ?? 0) > 0,
        ),
      { message, timeout: 5_000 },
    )
    .toBe(true);
}
