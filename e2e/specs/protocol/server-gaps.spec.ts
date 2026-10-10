import { test, expect } from '../../support/fixtures';
import { RawClient, RawMessage } from '../../support/raw-client';
import { uniqueRoomName } from '../../support/room';

/**
 * Server corners found in the 2026-10-10 edge-case sweep: resume tokens, kicks across sockets,
 * kicks and host leaves mid-game, chat and revive relays, name validation. The six resume, kick and
 * name bugs it found were fixed the same day.
 */

interface RoomPlayerView {
  id: string;
  name: string;
  classId: string;
  isHost: boolean;
  isReady: boolean;
}

interface RoomInfoView {
  id: string;
  status: string;
  players: RoomPlayerView[];
}

interface Hosted {
  client: RawClient;
  roomId: string;
  hostId: string;
}

interface Joined {
  client: RawClient;
  playerId: string;
}

interface ReconnectResultView {
  success: boolean;
  playerId: string;
  room: RoomInfoView | null;
  reason?: string;
}

const NO_REPLY_MS: number = 1_000;

function welcomeToken(c: RawClient): string {
  const welcome: RawMessage | undefined = c.received.find(
    (m: RawMessage): boolean => m.type === 'welcome',
  );
  return (welcome!.payload as { reconnectToken: string }).reconnectToken;
}

async function hostWithRoom(playerName: string = 'RawHost'): Promise<Hosted> {
  const client: RawClient = await RawClient.connect();
  client.send('create-room', { roomName: uniqueRoomName('gap'), playerName, classId: 'warrior' });
  const created: RawMessage = await client.waitFor('room-created');
  const payload: { room: RoomInfoView; playerId: string } = created.payload as {
    room: RoomInfoView;
    playerId: string;
  };
  return { client, roomId: payload.room.id, hostId: payload.playerId };
}

async function joinAs(
  roomId: string,
  playerName: string,
  classId: string = 'mage',
): Promise<Joined> {
  const client: RawClient = await RawClient.connect();
  client.send('join-room', { roomId, playerName, classId });
  const joined: RawMessage = await client.waitFor('room-joined');
  return { client, playerId: (joined.payload as { playerId: string }).playerId };
}

/** First reply of either type after `mark`: tells "accepted" from "rejected" without a fixed sleep. */
async function replyAfter(
  c: RawClient,
  mark: number,
  okType: string,
  timeoutMs: number = 3_000,
): Promise<RawMessage> {
  return Promise.race([
    c.waitFor(okType, (): boolean => true, timeoutMs, mark),
    c.waitFor('error', (): boolean => true, timeoutMs, mark),
  ]);
}

async function gone(c: RawClient): Promise<void> {
  c.close();
  await new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, 300);
  });
}

async function resume(
  token: string,
  playerName: string,
  classId: string,
): Promise<{
  client: RawClient;
  result: ReconnectResultView;
}> {
  const client: RawClient = await RawClient.connect();
  client.send('reconnect', { reconnectToken: token, playerName, classId });
  const r: RawMessage = await client.waitFor('reconnect-result');
  return { client, result: r.payload as ReconnectResultView };
}

async function startGame(host: Hosted, guests: RawClient[]): Promise<void> {
  const mark: number = host.client.received.length;
  for (const g of guests) g.send('toggle-ready', { roomId: host.roomId });
  await host.client.waitFor(
    'room-updated',
    (p: unknown): boolean =>
      (p as { room: RoomInfoView }).room.players.length === guests.length + 1 &&
      (p as { room: RoomInfoView }).room.players.every((pl: RoomPlayerView): boolean => pl.isReady),
    3_000,
    mark,
  );
  host.client.send('start-game', { roomId: host.roomId });
  for (const c of [host.client, ...guests]) await c.waitFor('game-started');
}

async function expectNothing(c: RawClient, type: string, mark: number): Promise<void> {
  await expect(c.waitFor(type, (): boolean => true, NO_REPLY_MS, mark)).rejects.toThrow();
}

test.describe('game server gaps', { tag: ['@protocol', '@external-safe'] }, (): void => {
  test(
    'a kicked player cannot rejoin from a fresh connection either',
    async (): Promise<void> => {
      const host: Hosted = await hostWithRoom();
      const guest: Joined = await joinAs(host.roomId, 'Pest');
      host.client.send('kick-player', { roomId: host.roomId, playerId: guest.playerId });
      await guest.client.waitFor('player-kicked');
      await gone(guest.client);

      const again: RawClient = await RawClient.connect();
      const mark: number = again.received.length;
      again.send('join-room', { roomId: host.roomId, playerName: 'Pest', classId: 'mage' });
      const reply: RawMessage = await replyAfter(again, mark, 'room-joined');
      again.close();
      host.client.close();
      expect(reply.type, 'the same player on a new socket is still kept out').toBe('error');
      expect((reply.payload as { code: string }).code).toBe('KICKED');
    },
  );

  test(
    'a resume refused because the name was taken can be retried once the name is free',
    async (): Promise<void> => {
      const host: Hosted = await hostWithRoom();
      const guest: Joined = await joinAs(host.roomId, 'Flaky');
      const token: string = welcomeToken(guest.client);
      await gone(guest.client);

      const impostor: Joined = await joinAs(host.roomId, 'Flaky', 'ranger');
      const first: { client: RawClient; result: ReconnectResultView } = await resume(
        token,
        'Flaky',
        'mage',
      );
      expect(first.result.success, 'refused while someone else holds the name').toBe(false);
      first.client.close();

      impostor.client.send('leave-room', {});
      await impostor.client.waitFor('room-left');
      const second: { client: RawClient; result: ReconnectResultView } = await resume(
        token,
        'Flaky',
        'mage',
      );
      second.client.close();
      impostor.client.close();
      host.client.close();
      expect(second.result.success, JSON.stringify(second.result)).toBe(true);
    },
  );

  test(
    'a resumed player keeps the name and class it had before the drop',
    async (): Promise<void> => {
      const host: Hosted = await hostWithRoom();
      const guest: Joined = await joinAs(host.roomId, 'Steady', 'mage');
      await startGame(host, [guest.client]);
      const token: string = welcomeToken(guest.client);
      await gone(guest.client);

      const back: { client: RawClient; result: ReconnectResultView } = await resume(
        token,
        'Renamed',
        'warrior',
      );
      back.client.close();
      host.client.close();
      expect(back.result.success).toBe(true);
      const me: RoomPlayerView | undefined = back.result.room!.players.find(
        (pl: RoomPlayerView): boolean => pl.id === guest.playerId,
      );
      expect({ name: me?.name, classId: me?.classId }).toEqual({ name: 'Steady', classId: 'mage' });
    },
  );

  test(
    'a player whose old socket is still half-open can resume from a new one',
    async (): Promise<void> => {
      const host: Hosted = await hostWithRoom();
      const guest: Joined = await joinAs(host.roomId, 'Commuter');
      const token: string = welcomeToken(guest.client);
      // The old socket is never closed: the network vanished, the server has not noticed yet.
      const back: { client: RawClient; result: ReconnectResultView } = await resume(
        token,
        'Commuter',
        'mage',
      );
      back.client.close();
      guest.client.close();
      host.client.close();
      expect(back.result.success, JSON.stringify(back.result)).toBe(true);
      expect(back.result.playerId).toBe(guest.playerId);
    },
  );

  test(
    'a lone host that drops twice keeps its room for the whole second resume window',
    async (): Promise<void> => {
      test.setTimeout(120_000);
      const host: Hosted = await hostWithRoom();
      const firstToken: string = welcomeToken(host.client);
      const firstDrop: number = Date.now();
      await gone(host.client);

      const back: { client: RawClient; result: ReconnectResultView } = await resume(
        firstToken,
        'RawHost',
        'warrior',
      );
      expect(back.result.success, 'first resume').toBe(true);
      const secondToken: string = welcomeToken(back.client);
      // Play on for 20 s, so the second window ends well after the first drop's timer.
      await new Promise<void>((resolve: () => void): void => {
        setTimeout(resolve, 20_000);
      });
      await gone(back.client);

      // Past the first drop's 60 s, still well inside the second drop's window.
      const waitMs: number = Math.max(0, firstDrop + 62_000 - Date.now());
      await new Promise<void>((resolve: () => void): void => {
        setTimeout(resolve, waitMs);
      });
      const again: { client: RawClient; result: ReconnectResultView } = await resume(
        secondToken,
        'RawHost',
        'warrior',
      );
      again.client.close();
      expect(again.result.success, JSON.stringify(again.result)).toBe(true);
    },
  );

  test(
    'a name made only of invisible characters is refused',
    async (): Promise<void> => {
      const host: Hosted = await hostWithRoom();
      const ghost: RawClient = await RawClient.connect();
      const mark: number = ghost.received.length;
      ghost.send('join-room', { roomId: host.roomId, playerName: '​ㅤ', classId: 'mage' });
      const reply: RawMessage = await replyAfter(ghost, mark, 'room-joined');
      ghost.close();
      host.client.close();
      expect(reply.type).toBe('error');
    },
  );

  test('two sockets racing with the same resume token: exactly one gets the seat', async (): Promise<void> => {
    const host: Hosted = await hostWithRoom();
    const guest: Joined = await joinAs(host.roomId, 'Twin');
    const token: string = welcomeToken(guest.client);
    await gone(guest.client);

    const [a, b]: RawClient[] = await Promise.all([RawClient.connect(), RawClient.connect()]);
    a.send('reconnect', { reconnectToken: token, playerName: 'Twin', classId: 'mage' });
    b.send('reconnect', { reconnectToken: token, playerName: 'Twin', classId: 'mage' });
    const results: ReconnectResultView[] = (
      await Promise.all([a.waitFor('reconnect-result'), b.waitFor('reconnect-result')])
    ).map((m: RawMessage): ReconnectResultView => m.payload as ReconnectResultView);
    expect(results.filter((r: ReconnectResultView): boolean => r.success)).toHaveLength(1);

    const hostMark: number = host.client.received.length;
    host.client.send('list-rooms', {});
    const list: RawMessage = await host.client.waitFor(
      'room-list',
      (): boolean => true,
      3_000,
      hostMark,
    );
    const room: RoomInfoView | undefined = (list.payload as { rooms: RoomInfoView[] }).rooms.find(
      (r: RoomInfoView): boolean => r.id === host.roomId,
    );
    expect(room?.players.map((pl: RoomPlayerView): string => pl.name).sort()).toEqual([
      'RawHost',
      'Twin',
    ]);
    a.close();
    b.close();
    host.client.close();
  });

  test('a made-up token and your own live token are both refused', async (): Promise<void> => {
    const c: RawClient = await RawClient.connect();
    c.send('reconnect', { reconnectToken: 'no-such-token', playerName: 'X', classId: 'mage' });
    const made: RawMessage = await c.waitFor('reconnect-result');
    expect((made.payload as ReconnectResultView).success).toBe(false);

    const mark: number = c.received.length;
    c.send('reconnect', { reconnectToken: welcomeToken(c), playerName: 'X', classId: 'mage' });
    const own: RawMessage = await c.waitFor('reconnect-result', (): boolean => true, 3_000, mark);
    expect((own.payload as ReconnectResultView).success).toBe(false);
    c.close();
  });

  test('kicking a player mid-game: the others get player-left and a 2-player room', async (): Promise<void> => {
    const host: Hosted = await hostWithRoom();
    const a: Joined = await joinAs(host.roomId, 'Stays');
    const b: Joined = await joinAs(host.roomId, 'Goes', 'ranger');
    await startGame(host, [a.client, b.client]);

    const mark: number = a.client.received.length;
    host.client.send('kick-player', { roomId: host.roomId, playerId: b.playerId });
    await b.client.waitFor('player-kicked');
    await a.client.waitFor(
      'player-left',
      (p: unknown): boolean => (p as { playerId: string }).playerId === b.playerId,
      3_000,
      mark,
    );
    const updated: RawMessage = await a.client.waitFor(
      'room-updated',
      (p: unknown): boolean => (p as { room: RoomInfoView }).room.players.length === 2,
      3_000,
      mark,
    );
    expect((updated.payload as { room: RoomInfoView }).room.status).toBe('in-game');

    // The kicked player's game-sync-like traffic reaches nobody any more.
    const relayMark: number = a.client.received.length;
    b.client.send('player-state', { player: { id: b.playerId } });
    await expectNothing(a.client, 'player-state-broadcast', relayMark);
    for (const c of [host.client, a.client, b.client]) c.close();
  });

  test('the host leaving mid-game (leave-room) hands the game to the earliest guest', async (): Promise<void> => {
    const host: Hosted = await hostWithRoom();
    const first: Joined = await joinAs(host.roomId, 'First');
    const second: Joined = await joinAs(host.roomId, 'Second', 'priest');
    await startGame(host, [first.client, second.client]);

    const marks: number[] = [first.client.received.length, second.client.received.length];
    host.client.send('leave-room', {});
    await host.client.waitFor('room-left');
    for (const [i, c] of [first.client, second.client].entries()) {
      const migrated: RawMessage = await c.waitFor(
        'host-migrated',
        (): boolean => true,
        3_000,
        marks[i],
      );
      expect(migrated.payload).toEqual({ newHostId: first.playerId, previousHostId: host.hostId });
    }

    // The old host is out: its game-sync reaches nobody, the new host's does.
    const relayMark: number = second.client.received.length;
    host.client.send('game-sync', { player: { id: host.hostId } });
    await expectNothing(second.client, 'game-sync', relayMark);
    first.client.send('game-sync', { player: { id: first.playerId } });
    await second.client.waitFor('game-sync', (): boolean => true, 3_000, relayMark);
    for (const c of [host.client, first.client, second.client]) c.close();
  });

  test('revive: only the target hears it, and the server names the real reviver', async (): Promise<void> => {
    const host: Hosted = await hostWithRoom();
    const reviver: Joined = await joinAs(host.roomId, 'Medic');
    const downed: Joined = await joinAs(host.roomId, 'Downed', 'ranger');
    await startGame(host, [reviver.client, downed.client]);

    const hostMark: number = host.client.received.length;
    const mark: number = downed.client.received.length;
    reviver.client.send('revive-player', {
      roomId: host.roomId,
      targetPlayerId: downed.playerId,
      reviverId: 'spoofed-id',
    });
    const revived: RawMessage = await downed.client.waitFor(
      'player-revived',
      (): boolean => true,
      3_000,
      mark,
    );
    expect(revived.payload).toEqual({
      targetPlayerId: downed.playerId,
      reviverId: reviver.playerId,
    });
    await expectNothing(host.client, 'player-revived', hostMark);

    const selfMark: number = downed.client.received.length;
    downed.client.send('revive-player', { roomId: host.roomId, targetPlayerId: downed.playerId });
    const err: RawMessage = await downed.client.waitFor(
      'error',
      (): boolean => true,
      3_000,
      selfMark,
    );
    expect((err.payload as { code: string }).code).toBe('CANNOT_REVIVE_SELF');
    for (const c of [host.client, reviver.client, downed.client]) c.close();
  });

  test('chat: members hear it (sender too), outsiders cannot post, length is capped at 200', async (): Promise<void> => {
    const host: Hosted = await hostWithRoom();
    const guest: Joined = await joinAs(host.roomId, 'Talker');
    const other: Hosted = await hostWithRoom('Elsewhere');

    const marks: number[] = [
      host.client.received.length,
      guest.client.received.length,
      other.client.received.length,
    ];
    guest.client.send('chat-message', { roomId: host.roomId, message: 'hi' });
    for (const [i, c] of [host.client, guest.client].entries()) {
      const msg: RawMessage = await c.waitFor('chat-message', (): boolean => true, 3_000, marks[i]);
      expect(msg.payload).toEqual({
        playerId: guest.playerId,
        playerName: 'Talker',
        message: 'hi',
      });
    }
    await expectNothing(other.client, 'chat-message', marks[2]);

    // An outsider naming someone else's room is dropped silently.
    const outsiderMark: number = host.client.received.length;
    other.client.send('chat-message', { roomId: host.roomId, message: 'spam' });
    await expectNothing(host.client, 'chat-message', outsiderMark);

    const capMark: number = guest.client.received.length;
    guest.client.send('chat-message', { roomId: host.roomId, message: 'x'.repeat(201) });
    const err: RawMessage = await guest.client.waitFor(
      'error',
      (): boolean => true,
      3_000,
      capMark,
    );
    expect((err.payload as { code: string }).code).toBe('INVALID_PAYLOAD');
    for (const c of [host.client, guest.client, other.client]) c.close();
  });

  test('player names: 24 characters are fine, 25 and blank are refused', async (): Promise<void> => {
    const host: Hosted = await hostWithRoom();
    const cases: Array<{ name: string; ok: boolean }> = [
      { name: 'n'.repeat(24), ok: true },
      { name: 'm'.repeat(25), ok: false },
      { name: '   ', ok: false },
    ];
    for (const { name, ok } of cases) {
      const c: RawClient = await RawClient.connect();
      const mark: number = c.received.length;
      c.send('join-room', { roomId: host.roomId, playerName: name, classId: 'mage' });
      const reply: RawMessage = await replyAfter(c, mark, 'room-joined');
      expect(reply.type, `name of length ${name.length} ("${name.trim()}")`).toBe(
        ok ? 'room-joined' : 'error',
      );
      c.close();
    }
    host.client.close();
  });

  test('joining a room id that does not exist fails with JOIN_FAILED', async (): Promise<void> => {
    const c: RawClient = await RawClient.connect();
    const mark: number = c.received.length;
    c.send('join-room', { roomId: 'no-such-room', playerName: 'Lost', classId: 'mage' });
    const reply: RawMessage = await replyAfter(c, mark, 'room-joined');
    expect(reply.type).toBe('error');
    expect((reply.payload as { code: string }).code).toBe('JOIN_FAILED');
    c.close();
  });
});
