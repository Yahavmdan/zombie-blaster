import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { RoomSession } from '../../support/room';
import { runBot } from '../../support/bot';
import { NetSummary, TypeStats } from '../../support/net-monitor';

/**
 * Bandwidth and message-rate budgets for online play. Budgets are regression guards,
 * measured on this codebase and set with headroom: if a change blows through one,
 * either optimize or consciously raise it (and say why in the commit).
 */
const BUDGET: {
  syncRatePerSecond: { min: number; max: number };
  hostUpstreamBytesPerSecond: number;
  guestUpstreamBytesPerSecond: number;
  maxFrameBytes: number;
} = {
  syncRatePerSecond: { min: 12, max: 25 },
  hostUpstreamBytesPerSecond: 250_000,
  guestUpstreamBytesPerSecond: 60_000,
  maxFrameBytes: 128_000,
};

function stat(summary: NetSummary, dir: 'sent' | 'received', type: string): TypeStats {
  return (
    (dir === 'sent' ? summary.sent : summary.received)[type] ?? {
      count: 0,
      bytes: 0,
      avgBytes: 0,
      maxBytes: 0,
      perSecond: 0,
    }
  );
}

async function playAndMeasure(
  players: GamePlayer[],
  durationMs: number,
  testInfo: TestInfo,
): Promise<NetSummary[]> {
  for (const p of players) {
    await p.probe.setGodMode(true);
    p.net.reset();
  }
  await Promise.all(
    players.map((p: GamePlayer): Promise<unknown> => runBot(p, { durationMs, useSkills: true })),
  );
  const summaries: NetSummary[] = players.map((p: GamePlayer): NetSummary => p.net.summary());
  await testInfo.attach('network summaries', {
    body: JSON.stringify(
      players.map((p: GamePlayer, i: number): object => ({ player: p.name, ...summaries[i] })),
      null,
      2,
    ),
    contentType: 'application/json',
  });
  return summaries;
}

test.describe('network budget', { tag: ['@online', '@net'] }, (): void => {
  test('2 players: sync rate, upstream bandwidth and frame size stay within budget', async ({
    room,
  }: { room: RoomFactory }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'net2',
    );
    await session.host.probe.setFloor(5);
    const [host, guest]: NetSummary[] = await playAndMeasure(session.players, 20_000, testInfo);

    const hostSync: TypeStats = stat(host, 'sent', 'game-sync');
    const guestState: TypeStats = stat(guest, 'sent', 'player-state');
    expect
      .soft(hostSync.perSecond, 'host game-sync rate')
      .toBeGreaterThanOrEqual(BUDGET.syncRatePerSecond.min);
    expect
      .soft(hostSync.perSecond, 'host game-sync rate')
      .toBeLessThanOrEqual(BUDGET.syncRatePerSecond.max);
    expect
      .soft(guestState.perSecond, 'guest player-state rate')
      .toBeGreaterThanOrEqual(BUDGET.syncRatePerSecond.min);
    expect
      .soft(host.sentBytesPerSecond, 'host upstream bytes/s')
      .toBeLessThanOrEqual(BUDGET.hostUpstreamBytesPerSecond);
    expect
      .soft(guest.sentBytesPerSecond, 'guest upstream bytes/s')
      .toBeLessThanOrEqual(BUDGET.guestUpstreamBytesPerSecond);
    expect
      .soft(host.largestFrame?.bytes ?? 0, 'largest frame')
      .toBeLessThanOrEqual(BUDGET.maxFrameBytes);
    expect
      .soft(stat(guest, 'received', 'game-sync').count, 'guest receives host snapshots')
      .toBeGreaterThan(0);
  });

  test('4 players: server fan-out per guest stays within budget', async ({
    room,
  }: { room: RoomFactory }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(180_000);
    const session: RoomSession = await room(
      [
        { name: 'P1', classId: 'warrior' },
        { name: 'P2', classId: 'assassin' },
        { name: 'P3', classId: 'warrior' },
        { name: 'P4', classId: 'assassin' },
      ],
      'net4',
    );
    await session.host.probe.setFloor(5);
    const summaries: NetSummary[] = await playAndMeasure(session.players, 15_000, testInfo);
    for (let i: number = 1; i < summaries.length; i++) {
      const guestDown: number = summaries[i].receivedBytesPerSecond;
      await testInfo.attach(`P${i + 1} downstream bytes/s`, {
        body: String(guestDown),
        contentType: 'text/plain',
      });
      expect
        .soft(guestDown, `P${i + 1} downstream bytes/s`)
        .toBeLessThanOrEqual(
          BUDGET.hostUpstreamBytesPerSecond + 3 * BUDGET.guestUpstreamBytesPerSecond,
        );
    }
  });
});
