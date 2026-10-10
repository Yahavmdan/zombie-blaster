import { test, expect } from '../../support/fixtures';
import { RawClient, RawMessage } from '../../support/raw-client';
import { uniqueRoomName } from '../../support/room';

/**
 * Room, reconnect and authority edge cases the UI never produces on its own: a second drop,
 * a reconnect from inside another room, a repeated start, a guest-sent revive, full rooms.
 * Each test guards a server rule a raw client could otherwise break.
 */

interface RoomInfoView {
  id: string;
  name: string;
  playerCount?: number;
  players: Array<{ id: string; isHost: boolean; name: string }>;
}

function welcomeToken(c: RawClient): string {
  const welcome: RawMessage | undefined = c.received.find(
    (m: RawMessage): boolean => m.type === 'welcome',
  );
  return (welcome!.payload as { reconnectToken: string }).reconnectToken;
}

async function hostWithRoom(
  name: string = uniqueRoomName('edge'),
): Promise<{ client: RawClient; roomId: string }> {
  const client: RawClient = await RawClient.connect();
  client.send('create-room', { roomName: name, playerName: 'RawHost', classId: 'warrior' });
  const created: RawMessage = await client.waitFor('room-created');
  return { client, roomId: (created.payload as { room: RoomInfoView }).room.id };
}

async function joinAs(
  roomId: string,
  playerName: string,
): Promise<{ client: RawClient; playerId: string }> {
  const client: RawClient = await RawClient.connect();
  client.send('join-room', { roomId, playerName, classId: 'mage' });
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

async function roomList(c: RawClient): Promise<RoomInfoView[]> {
  const mark: number = c.received.length;
  c.send('list-rooms', {});
  const list: RawMessage = await c.waitFor('room-list', (): boolean => true, 3_000, mark);
  return (list.payload as { rooms: RoomInfoView[] }).rooms;
}

async function gone(c: RawClient): Promise<void> {
  c.close();
  await new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, 300);
  });
}

test.describe('game server edge cases', { tag: ['@protocol', '@external-safe'] }, (): void => {
  test('creating or joining a second room while in one is refused', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const other: { client: RawClient; roomId: string } = await hostWithRoom();
    let mark: number = host.client.received.length;
    host.client.send('create-room', {
      roomName: uniqueRoomName('dup'),
      playerName: 'RawHost',
      classId: 'warrior',
    });
    const createReply: RawMessage = await replyAfter(host.client, mark, 'room-created');
    expect(createReply.type).toBe('error');
    expect((createReply.payload as { code: string }).code).toBe('ALREADY_IN_ROOM');

    mark = host.client.received.length;
    host.client.send('join-room', {
      roomId: other.roomId,
      playerName: 'RawHost',
      classId: 'warrior',
    });
    const joinReply: RawMessage = await replyAfter(host.client, mark, 'room-joined');
    expect((joinReply.payload as { code: string }).code).toBe('ALREADY_IN_ROOM');
    host.client.close();
    other.client.close();
  });

  test('a full room (6 players) refuses the 7th', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const guests: RawClient[] = [];
    for (let i: number = 0; i < 5; i++) {
      guests.push((await joinAs(host.roomId, `G${i}`)).client);
    }
    const late: RawClient = await RawClient.connect();
    const mark: number = late.received.length;
    late.send('join-room', { roomId: host.roomId, playerName: 'Late', classId: 'mage' });
    const reply: RawMessage = await replyAfter(late, mark, 'room-joined');
    expect(reply.type).toBe('error');
    expect((reply.payload as { code: string }).code).toBe('JOIN_FAILED');
    for (const g of [host.client, late, ...guests] as RawClient[]) g.close();
  });

  test('a guest cannot kick, and the host cannot kick itself', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const guest: { client: RawClient; playerId: string } = await joinAs(host.roomId, 'Guest');
    const created: RawMessage = host.client.received.find(
      (m: RawMessage): boolean => m.type === 'room-created',
    )!;
    const hostId: string = (created.payload as { room: RoomInfoView }).room.players[0].id;

    let mark: number = guest.client.received.length;
    guest.client.send('kick-player', { roomId: host.roomId, playerId: hostId });
    expect(
      (
        (await guest.client.waitFor('error', (): boolean => true, 3_000, mark)).payload as {
          code: string;
        }
      ).code,
    ).toBe('NOT_HOST');

    mark = host.client.received.length;
    host.client.send('kick-player', { roomId: host.roomId, playerId: hostId });
    expect(
      (
        (await host.client.waitFor('error', (): boolean => true, 3_000, mark)).payload as {
          code: string;
        }
      ).code,
    ).toBe('CANNOT_KICK_SELF');
    host.client.close();
    guest.client.close();
  });

  test('host migration in the lobby: the guest becomes host and can start alone', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const guest: { client: RawClient; playerId: string } = await joinAs(host.roomId, 'Heir');
    const mark: number = guest.client.received.length;
    await gone(host.client);
    await guest.client.waitFor(
      'room-updated',
      (p: unknown): boolean =>
        (p as { room: RoomInfoView }).room.players.some(
          (pl: { id: string; isHost: boolean }): boolean => pl.isHost && pl.id === guest.playerId,
        ),
      3_000,
      mark,
    );
    guest.client.send('toggle-ready', { roomId: host.roomId });
    const startMark: number = guest.client.received.length;
    guest.client.send('start-game', { roomId: host.roomId });
    await guest.client.waitFor('game-started', (): boolean => true, 3_000, startMark);
    guest.client.close();
  });

  test('a guest can resume after a second connection drop', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const first: { client: RawClient; playerId: string } = await joinAs(host.roomId, 'Flaky');
    const token1: string = welcomeToken(first.client);
    await gone(first.client);

    const second: RawClient = await RawClient.connect();
    second.send('reconnect', { reconnectToken: token1, playerName: 'Flaky', classId: 'mage' });
    const r1: RawMessage = await second.waitFor('reconnect-result');
    expect((r1.payload as { success: boolean }).success, 'first resume works').toBe(true);
    // The real client (websocket.service.ts) keeps the token of the welcome it got on this socket.
    const token2: string = welcomeToken(second);
    await gone(second);

    const third: RawClient = await RawClient.connect();
    third.send('reconnect', { reconnectToken: token2, playerName: 'Flaky', classId: 'mage' });
    const r2: RawMessage = await third.waitFor('reconnect-result');
    expect(
      (r2.payload as { success: boolean; reason?: string }).success,
      JSON.stringify(r2.payload),
    ).toBe(true);
    third.close();
    host.client.close();
  });

  test('a lone host whose connection blips can resume its room', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const token: string = welcomeToken(host.client);
    await gone(host.client);
    const back: RawClient = await RawClient.connect();
    back.send('reconnect', { reconnectToken: token, playerName: 'RawHost', classId: 'warrior' });
    const r: RawMessage = await back.waitFor('reconnect-result');
    expect(
      (r.payload as { success: boolean; reason?: string }).success,
      JSON.stringify(r.payload),
    ).toBe(true);
    back.close();
  });

  test('reconnecting while already in another room is refused (no ghost player)', async (): Promise<void> => {
    const hostA: { client: RawClient; roomId: string } = await hostWithRoom();
    const guest: { client: RawClient; playerId: string } = await joinAs(hostA.roomId, 'Drifter');
    const token: string = welcomeToken(guest.client);
    await gone(guest.client);

    const back: RawClient = await RawClient.connect();
    const roomBName: string = uniqueRoomName('roomB');
    back.send('create-room', { roomName: roomBName, playerName: 'Drifter', classId: 'mage' });
    await back.waitFor('room-created');
    const mark: number = back.received.length;
    back.send('reconnect', { reconnectToken: token, playerName: 'Drifter', classId: 'mage' });
    await back
      .waitFor('reconnect-result', (): boolean => true, 3_000, mark)
      .catch((): undefined => undefined);
    await gone(back);

    const lister: RawClient = await RawClient.connect();
    const rooms: RoomInfoView[] = await roomList(lister);
    expect(
      rooms.find((r: RoomInfoView): boolean => r.name === roomBName),
      'room B lost its only player and must be gone, not kept alive by a ghost',
    ).toBeUndefined();
    lister.close();
    hostA.client.close();
  });

  test('start-game during a running game is refused', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const guest: { client: RawClient; playerId: string } = await joinAs(host.roomId, 'Guest');
    host.client.send('toggle-ready', { roomId: host.roomId });
    guest.client.send('toggle-ready', { roomId: host.roomId });
    await guest.client.waitFor('room-updated', (p: unknown): boolean =>
      (p as { room: { players: Array<{ isReady: boolean }> } }).room.players.every(
        (pl: { isReady: boolean }): boolean => pl.isReady,
      ),
    );
    host.client.send('start-game', { roomId: host.roomId });
    await guest.client.waitFor('game-started');
    const mark: number = guest.client.received.length;
    host.client.send('start-game', { roomId: host.roomId });
    await expect(
      guest.client.waitFor('game-started', (): boolean => true, 1_500, mark),
    ).rejects.toThrow();
    host.client.close();
    guest.client.close();
  });

  test('a guest cannot revive itself (revive is decided by the host)', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const guest: { client: RawClient; playerId: string } = await joinAs(host.roomId, 'Cheater');
    const mark: number = guest.client.received.length;
    guest.client.send('revive-player', { targetPlayerId: guest.playerId });
    await expect(
      guest.client.waitFor('player-revived', (): boolean => true, 1_500, mark),
    ).rejects.toThrow();
    host.client.close();
    guest.client.close();
  });

  test('toggle-ready for a room you are not in is rejected and broadcasts nothing', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const outsider: RawClient = await RawClient.connect();
    const hostMark: number = host.client.received.length;
    const mark: number = outsider.received.length;
    outsider.send('toggle-ready', { roomId: host.roomId });
    await outsider.waitFor('error', (): boolean => true, 1_500, mark);
    await expect(
      host.client.waitFor('room-updated', (): boolean => true, 1_000, hostMark),
    ).rejects.toThrow();
    host.client.close();
    outsider.close();
  });

  test('a blank room name is rejected', async (): Promise<void> => {
    const c: RawClient = await RawClient.connect();
    const mark: number = c.received.length;
    c.send('create-room', { roomName: '   ', playerName: 'Blank', classId: 'warrior' });
    const reply: RawMessage = await replyAfter(c, mark, 'room-created');
    expect(reply.type).toBe('error');
    c.close();
  });
});
