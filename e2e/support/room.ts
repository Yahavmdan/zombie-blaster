import { Browser, Locator, expect } from '@playwright/test';
import { ClassId, GamePlayer } from './game-player';
import { E2eSnapshot } from './probe';

export interface RoomMember {
  name: string;
  classId: ClassId;
}

export interface RoomSession {
  roomName: string;
  /** players[0] is the host. */
  players: GamePlayer[];
  host: GamePlayer;
  guests: GamePlayer[];
  closeAll(): Promise<void>;
}

let roomCounter: number = 0;

export function uniqueRoomName(prefix: string): string {
  roomCounter++;
  return `${prefix}-${process.pid}-${Date.now().toString(36)}-${roomCounter}`.slice(0, 30);
}

/**
 * Opens one browser context per member, creates a room with members[0] as host,
 * joins/readies everyone else, starts the game and waits until every probe reports
 * its role and sees all other players.
 */
export async function startRoom(
  browser: Browser,
  members: RoomMember[],
  roomPrefix: string = 'e2e',
): Promise<RoomSession> {
  if (members.length < 1) throw new Error('startRoom needs at least one member');
  const roomName: string = uniqueRoomName(roomPrefix);
  const players: GamePlayer[] = [];
  for (const m of members) {
    players.push(await GamePlayer.open(browser, { name: m.name, classId: m.classId }));
  }

  const [host, ...guests]: GamePlayer[] = players;
  await Promise.all(players.map((p: GamePlayer): Promise<void> => p.enterLobby()));
  await host.createRoom(roomName);
  for (const guest of guests) {
    await guest.joinRoom(roomName);
    await expect(guest.page.getByTestId('lobby-room-button-ready')).toBeVisible();
    await guest.toggleReady();
  }

  const start: Locator = host.page.getByTestId('lobby-room-button-start');
  await expect(start).toBeEnabled({ timeout: 15_000 });
  await start.click();

  await Promise.all(players.map((p: GamePlayer): Promise<void> => p.page.waitForURL(/\/game/)));
  await Promise.all(players.map((p: GamePlayer): Promise<void> => p.probe.waitForReady()));

  await host.probe.waitFor('host role', (s: E2eSnapshot): boolean => s.role === 'host');
  for (const guest of guests) {
    await guest.probe.waitFor('client role', (s: E2eSnapshot): boolean => s.role === 'client');
  }
  const others: number = players.length - 1;
  for (const p of players) {
    await p.probe.waitFor(
      `${p.name} sees ${others} remote players`,
      (s: E2eSnapshot): boolean => s.remotePlayers.length === others,
      { timeoutMs: 15_000 },
    );
  }

  return {
    roomName,
    players,
    host,
    guests,
    async closeAll(): Promise<void> {
      await Promise.all(players.map((p: GamePlayer): Promise<void> => p.close()));
    },
  };
}
