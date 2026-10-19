import { test, expect } from '../../support/fixtures';
import { RawClient, RawMessage } from '../../support/raw-client';
import { uniqueRoomName } from '../../support/room';

/**
 * Skill-tree rules on the server: a relayed player keeps only tree skills its class, level and
 * parents allow (and a skill bar of those), and a guest's zombie pushes/launches/stuns must have a sane shape. The host
 * applies effects (clamped); the server never trusts the client.
 */

interface RunningGame {
  host: RawClient;
  guest: RawClient;
}

async function startWarriorGame(): Promise<RunningGame> {
  const host: RawClient = await RawClient.connect();
  host.send('create-room', {
    roomName: uniqueRoomName('tree'),
    playerName: 'RawHost',
    classId: 'warrior',
  });
  const created: RawMessage = await host.waitFor('room-created');
  const roomId: string = (created.payload as { room: { id: string } }).room.id;
  const guest: RawClient = await RawClient.connect();
  guest.send('join-room', { roomId, playerName: 'RawGuest', classId: 'warrior' });
  await guest.waitFor('room-joined');
  host.send('toggle-ready', { roomId });
  guest.send('toggle-ready', { roomId });
  await guest.waitFor('room-updated', (p: unknown): boolean =>
    (p as { room: { players: Array<{ isReady: boolean }> } }).room.players.every(
      (pl: { isReady: boolean }): boolean => pl.isReady,
    ),
  );
  host.send('start-game', { roomId });
  await host.waitFor('game-started');
  await guest.waitFor('game-started');
  return { host, guest };
}

/** The skill levels the host receives after the guest sends these. */
async function relayedSkills(
  game: RunningGame,
  level: number,
  skillLevels: Record<string, number>,
): Promise<Record<string, number>> {
  const mark: number = game.host.received.length;
  game.guest.send('player-state', { player: { classId: 'warrior', level, skillLevels } });
  const msg: RawMessage = await game.host.waitFor(
    'player-state-broadcast',
    (): boolean => true,
    3_000,
    mark,
  );
  return (msg.payload as { data: { player: { skillLevels: Record<string, number> } } }).data.player
    .skillLevels;
}

test.describe('skill tree on the server', { tag: ['@protocol', '@external-safe'] }, (): void => {
  test('a relayed warrior keeps only tree skills it can own', async (): Promise<void> => {
    const game: RunningGame = await startWarriorGame();

    expect(
      await relayedSkills(game, 4, {
        'warrior-power-strike': 1,
        'warrior-uppercut': 1,
        'assassin-lucky-seven': 1,
        'made-up-skill': 1,
      }),
      'foreign and unknown ids are dropped',
    ).toEqual({ 'warrior-power-strike': 1, 'warrior-uppercut': 1 });

    expect(
      await relayedSkills(game, 4, { 'warrior-uppercut': 1 }),
      'a skill without its parent is dropped',
    ).toEqual({});

    expect(
      await relayedSkills(game, 3, { 'warrior-power-strike': 1, 'warrior-uppercut': 1 }),
      'a tier above the level is dropped',
    ).toEqual({ 'warrior-power-strike': 1 });

    expect(
      await relayedSkills(game, 1, {
        'warrior-power-strike': 1,
        'warrior-power-dash': 1,
        'warrior-iron-recovery': 1,
      }),
      'no more skills than levels',
    ).toEqual({ 'warrior-power-strike': 1 });

    expect(
      await relayedSkills(game, 10, { 'warrior-power-strike': 7 }),
      'a tree skill is owned (1) or not: no levels',
    ).toEqual({});

    game.host.close();
    game.guest.close();
  });

  test("a relayed warrior's skill bar names only its owned actives, once, in 6 slots", async (): Promise<void> => {
    const game: RunningGame = await startWarriorGame();
    const barOf: (skillBar: unknown) => Promise<unknown> = async (skillBar: unknown): Promise<unknown> => {
      const mark: number = game.host.received.length;
      game.guest.send('player-state', {
        player: {
          classId: 'warrior',
          level: 4,
          skillLevels: {
            'warrior-power-strike': 1,
            'warrior-uppercut': 1,
            'warrior-iron-recovery': 1,
            'warrior-power-dash': 1,
          },
          skillBar,
        },
      });
      const msg: RawMessage = await game.host.waitFor(
        'player-state-broadcast',
        (): boolean => true,
        3_000,
        mark,
      );
      return (msg.payload as { data: { player: { skillBar: unknown } } }).data.player.skillBar;
    };

    expect(
      await barOf([
        'warrior-uppercut',
        'assassin-lucky-seven',
        'warrior-uppercut',
        'warrior-dragon-roar',
        'warrior-power-strike',
        'warrior-iron-recovery',
        'warrior-power-strike',
        42,
      ]),
      'foreign, unowned, passive and repeated ids become empty slots; the bar is cut to 6',
    ).toEqual(['warrior-uppercut', null, null, null, 'warrior-power-strike', null]);
    expect(
      await barOf(['warrior-power-dash', 'warrior-uppercut']),
      'an owned attack-combo skill (power dash: hold attack) never takes a slot',
    ).toEqual([null, 'warrior-uppercut', null, null, null, null]);
    expect(await barOf('not-a-bar'), 'a bar that is no array is an empty bar').toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);

    game.host.close();
    game.guest.close();
  });

  test('zombie effects with a bad shape are rejected; good ones are relayed to the host', async (): Promise<void> => {
    const game: RunningGame = await startWarriorGame();
    const good: Record<string, unknown> = {
      zombieId: 'z1',
      kind: 'launch',
      dir: 1,
      force: 9,
      stunMs: 900,
    };

    const okMark: number = game.host.received.length;
    game.guest.send('player-state', {
      player: { classId: 'warrior', level: 1, skillLevels: {} },
      zombieEffects: [good],
    });
    const relayed: RawMessage = await game.host.waitFor(
      'player-state-broadcast',
      (): boolean => true,
      3_000,
      okMark,
    );
    expect((relayed.payload as { data: { zombieEffects: unknown[] } }).data.zombieEffects).toEqual([
      good,
    ]);

    for (const bad of [
      { ...good, kind: 'teleport' },
      { ...good, force: 1_000 },
      { ...good, stunMs: 999_999 },
      { ...good, zombieId: '' },
      'not-an-object',
    ]) {
      const hostMark: number = game.host.received.length;
      const guestMark: number = game.guest.received.length;
      game.guest.send('player-state', {
        player: { classId: 'warrior', level: 1, skillLevels: {} },
        zombieEffects: [bad],
      });
      await game.guest.waitFor('error', (): boolean => true, 3_000, guestMark);
      await expect(
        game.host.waitFor('player-state-broadcast', (): boolean => true, 600, hostMark),
        `rejected: ${JSON.stringify(bad)}`,
      ).rejects.toThrow();
    }

    game.host.close();
    game.guest.close();
  });
});
