import { Browser, TestInfo, expect, test as base } from '@playwright/test';
import { ClassId, GamePlayer } from './game-player';
import { RoomMember, RoomSession, startRoom } from './room';

export interface SoloFactory {
  (classId?: ClassId, name?: string): Promise<GamePlayer>;
}

export interface RoomFactory {
  (members: RoomMember[], roomPrefix?: string): Promise<RoomSession>;
}

interface GameFixtures {
  /** Opens a single-player game. Every player opened is checked for page errors at teardown. */
  solo: SoloFactory;
  /** Opens an N-player online room (members[0] hosts). Checked for page errors at teardown. */
  room: RoomFactory;
  /**
   * Auto: when E2E_BASE_URL targets an external (production) build there is no probe,
   * so every test not tagged `@external-safe` is skipped. Set E2E_EXTERNAL_HAS_PROBE=1
   * for a staging build served in dev mode.
   */
  requireProbe: void;
}

async function assertNoPageErrors(players: GamePlayer[], testInfo: TestInfo): Promise<void> {
  const errors: string[] = players.flatMap((p: GamePlayer): string[] =>
    p.errors.map((e: string): string => `${p.name}: ${e}`),
  );
  if (errors.length > 0) {
    await testInfo.attach('page errors', { body: errors.join('\n'), contentType: 'text/plain' });
  }
  expect(errors, 'no uncaught page errors or console.error during the test').toEqual([]);
}

async function closeAll(players: GamePlayer[]): Promise<void> {
  await Promise.all(
    players.map((p: GamePlayer): Promise<void> => p.close().catch((): void => undefined)),
  );
}

export const test = base.extend<GameFixtures>({
  solo: async (
    { browser }: { browser: Browser },
    use: (f: SoloFactory) => Promise<void>,
    testInfo: TestInfo,
  ): Promise<void> => {
    const opened: GamePlayer[] = [];
    const factory: SoloFactory = async (
      classId: ClassId = 'warrior',
      name: string = 'Solo',
    ): Promise<GamePlayer> => {
      const player: GamePlayer = await GamePlayer.open(browser, { name, classId });
      opened.push(player);
      await player.startSolo();
      return player;
    };
    await use(factory);
    try {
      await assertNoPageErrors(opened, testInfo);
    } finally {
      await closeAll(opened);
    }
  },

  room: async (
    { browser }: { browser: Browser },
    use: (f: RoomFactory) => Promise<void>,
    testInfo: TestInfo,
  ): Promise<void> => {
    const sessions: RoomSession[] = [];
    const factory: RoomFactory = async (
      members: RoomMember[],
      roomPrefix?: string,
    ): Promise<RoomSession> => {
      const session: RoomSession = await startRoom(browser, members, roomPrefix);
      sessions.push(session);
      return session;
    };
    await use(factory);
    const players: GamePlayer[] = sessions.flatMap((s: RoomSession): GamePlayer[] => s.players);
    try {
      await assertNoPageErrors(players, testInfo);
    } finally {
      await closeAll(players);
    }
  },

  requireProbe: [
    async ({}: object, use: () => Promise<void>, testInfo: TestInfo): Promise<void> => {
      const external: boolean = (process.env['E2E_BASE_URL'] ?? '').trim() !== '';
      const probeOptIn: boolean = process.env['E2E_EXTERNAL_HAS_PROBE'] === '1';
      const externalSafe: boolean = testInfo.tags.includes('@external-safe');
      testInfo.skip(
        external && !probeOptIn && !externalSafe,
        'Needs the dev-build probe (window.__zbE2e); the external target has none',
      );
      await use();
    },
    { auto: true },
  ],
});

export { expect };
