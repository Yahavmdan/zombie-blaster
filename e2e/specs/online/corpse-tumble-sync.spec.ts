import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { clearPickablesBetween, dropLyingCorpses } from '../../support/props';

/** The probe's foothold top sits this far above the corpse's feet (ZOMBIE_CORPSE_PLATFORM_HEIGHT). */
const FOOTHOLD_DEPTH: number = 5;

function findCorpse(s: E2eSnapshot, id: string): E2eCorpseView | undefined {
  return s.corpseViews.find((c: E2eCorpseView): boolean => c.id === id);
}

test.describe('tumbling corpses in co-op', { tag: '@online' }, (): void => {
  test("a corpse the host tosses tilts on the guest's screen too and lies flat in the same spot", async ({
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
      'corpse-tumble',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await clearPickablesBetween(host, [guest], 300, 1000);

    const [corpse]: E2eCorpseView[] = await dropLyingCorpses(host, [guest], 500, 1);
    await host.face('right');
    await host.probe.teleport(
      corpse.footX + corpse.footWidth / 2 - WORLD.playerWidth / 2,
      corpse.footY + FOOTHOLD_DEPTH - WORLD.playerHeight,
    );
    await host.wait(300);
    await host.press(KEYS.carry, 70);
    await guest.probe.waitFor(
      'the guest sees the host carrying it',
      (s: E2eSnapshot): boolean => findCorpse(s, corpse.id)?.carrierId !== null,
      { timeoutMs: 5_000 },
    );
    await host.wait(200);
    await host.press(KEYS.carry, 70);

    let most: number = 0;
    let wasFlying: boolean = false;
    const seen: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees the tossed corpse fly tilting and lie flat',
      (s: E2eSnapshot): boolean => {
        const c: E2eCorpseView | undefined = findCorpse(s, corpse.id);
        if (!c || c.carrierId !== null) return false;
        most = Math.max(most, Math.abs(c.angle));
        if (!c.isGrounded) wasFlying = true;
        return wasFlying && c.isGrounded && c.angle === 0;
      },
      { timeoutMs: 8_000, intervalMs: 10 },
    );
    expect(most, 'the guest drew it tilted in flight').toBeGreaterThan(0.05);
    await guest.attachCanvas(testInfo, 'guest: tossed corpse lying flat');

    const onGuest: E2eCorpseView = findCorpse(seen, corpse.id)!;
    const onHost: E2eCorpseView = findCorpse(await host.probe.state(), corpse.id)!;
    expect(onHost.angle).toBe(0);
    expect(Math.abs(onHost.x - onGuest.x), 'it lies in the same spot for both').toBeLessThan(1);
    expect(onHost.y).toBe(onGuest.y);
  });
});
