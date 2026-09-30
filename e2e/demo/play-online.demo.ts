import { Browser, test } from '@playwright/test';
import { ClassId, GamePlayer } from '../support/game-player';
import { Brain, BrainStats } from '../support/brain';
import { E2eSnapshot } from '../support/probe';
import { uniqueRoomName } from '../support/room';
import { captureSideBySide, groundedInBoth, worldDifferences } from '../support/world-compare';

/**
 * Two AI players (support/brain.ts) on two frontend ports play one online co-op game in
 * visible windows side by side. Real key presses only; probe used for reading state.
 * Knobs: DEMO_MINUTES (default 8), DEMO_LINGER_S (default 60), DEMO_SCREEN_W/H,
 * DEMO_HOST_CLASS / DEMO_GUEST_CLASS.
 */

const MINUTES: number = Number(process.env['DEMO_MINUTES'] ?? 8);
const LINGER_S: number = Number(process.env['DEMO_LINGER_S'] ?? 60);
/** Every N seconds: save both canvases side by side and log what the two players see differently. */
const COMPARE_EVERY_S: number = Number(process.env['DEMO_COMPARE_EVERY_S'] ?? 45);
const COMPARE_DIR: string = 'e2e/.results/demo';
const SCREEN: { width: number; height: number } = {
  width: Number(process.env['DEMO_SCREEN_W'] ?? 1920),
  height: Number(process.env['DEMO_SCREEN_H'] ?? 1032),
};

interface Seat {
  name: string;
  classId: ClassId;
  baseUrl: string;
  left: number;
}

const SEATS: Seat[] = [
  {
    name: 'ClaudeHost',
    classId: (process.env['DEMO_HOST_CLASS'] as ClassId | undefined) ?? 'warrior',
    baseUrl: 'http://localhost:4200',
    left: 0,
  },
  {
    name: 'ClaudeGuest',
    classId: (process.env['DEMO_GUEST_CLASS'] as ClassId | undefined) ?? 'assassin',
    baseUrl: 'http://localhost:4201',
    left: SCREEN.width / 2,
  },
];

function line(p: GamePlayer, s: E2eSnapshot, st: BrainStats): string {
  const pl: E2eSnapshot['player'] = s.player;
  const hp: string = pl ? `${pl.hp}/${pl.maxHp}` : '-';
  const pots: number = pl ? (pl.potions['hp-potion-1'] ?? 0) : 0;
  return (
    `${p.name} lvl ${pl?.level ?? '-'} hp ${hp} pots ${pots} gold ${pl?.gold ?? 0} ` +
    `kills ${st.kills} skills ${st.skillCasts} drank ${st.potionsUsed} bought ${st.potionsBought} ` +
    `fled ${st.retreats} revived ${st.revives} downs ${st.downs}`
  );
}

test('two players play online side by side', async ({
  browser,
}: {
  browser: Browser;
}): Promise<void> => {
  const log: (message: string) => void = (message: string): void =>
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
  const players: GamePlayer[] = [];
  for (const seat of SEATS) {
    const player: GamePlayer = await GamePlayer.open(browser, {
      name: seat.name,
      classId: seat.classId,
      baseUrl: seat.baseUrl,
      viewport: null,
    });
    await player.placeWindow({
      left: seat.left,
      top: 0,
      width: SCREEN.width / 2,
      height: SCREEN.height,
    });
    players.push(player);
  }
  const [host, guest]: GamePlayer[] = players;

  await Promise.all(players.map((p: GamePlayer): Promise<void> => p.enterLobby()));
  const roomName: string = uniqueRoomName('claude-coop');
  await host.createRoom(roomName);
  await guest.joinRoom(roomName);
  await guest.toggleReady();
  await host.page.getByTestId('lobby-room-button-start').click();
  await Promise.all(players.map((p: GamePlayer): Promise<void> => p.probe.waitForReady()));
  for (const p of players) await p.page.bringToFront();

  const deadline: number = Date.now() + MINUTES * 60_000;
  const brains: Brain[] = players.map((p: GamePlayer): Brain => new Brain(p, { deadline, log }));
  const ticker: ReturnType<typeof setInterval> = setInterval((): void => {
    void Promise.all(players.map((p: GamePlayer): Promise<E2eSnapshot> => p.probe.state()))
      .then((states: E2eSnapshot[]): void =>
        log(
          `floor ${states[0].floor} | ` +
            players
              .map((p: GamePlayer, i: number): string => line(p, states[i], brains[i].stats))
              .join(' | '),
        ),
      )
      .catch((): void => undefined);
  }, 20_000);

  let compareRound: number = 0;
  let settled: Set<string> = new Set<string>();
  const comparer: ReturnType<typeof setInterval> = setInterval((): void => {
    compareRound++;
    const label: string = `compare-${String(compareRound).padStart(2, '0')}`;
    void Promise.all(players.map((p: GamePlayer): Promise<E2eSnapshot> => p.probe.state()))
      .then(async (states: E2eSnapshot[]): Promise<void> => {
        const files: string[] = await captureSideBySide(players, COMPARE_DIR, label);
        const diffs: string[] = worldDifferences(states[0], states[1], settled, ['host', 'guest']);
        settled = groundedInBoth(states[0], states[1]);
        log(
          `${label}: ${diffs.length === 0 ? 'screens consistent' : `${diffs.length} difference(s)`} (${files.join(', ')})`,
        );
        for (const d of diffs.slice(0, 8)) log(`  ${label} diff: ${d}`);
      })
      .catch((): void => undefined);
  }, COMPARE_EVERY_S * 1000);

  try {
    await Promise.all(brains.map((b: Brain): Promise<void> => b.run()));
  } finally {
    clearInterval(ticker);
    clearInterval(comparer);
  }

  const final: E2eSnapshot[] = await Promise.all(
    players.map((p: GamePlayer): Promise<E2eSnapshot> => p.probe.state()),
  );
  log(`FINAL floor ${final[0].floor} gameOver=${await host.probe.isGameOver()}`);
  players.forEach((p: GamePlayer, i: number): void =>
    log(`FINAL ${line(p, final[i], brains[i].stats)}`),
  );
  log(`page errors: ${JSON.stringify(players.map((p: GamePlayer): string[] => p.errors))}`);
  await host.wait(LINGER_S * 1000);
});
