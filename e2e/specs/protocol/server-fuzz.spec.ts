import { test, expect } from '../../support/fixtures';
import { RawClient, RawMessage } from '../../support/raw-client';
import { uniqueRoomName } from '../../support/room';

/**
 * Talks to the game server directly with hand-crafted and malformed messages.
 * The server must survive anything and never trust the client (CLAUDE.md "Host authority").
 */

const CLIENT_MESSAGE_TYPES: string[] = [
  'create-room',
  'join-room',
  'leave-room',
  'list-rooms',
  'toggle-ready',
  'start-game',
  'player-input',
  'game-sync',
  'player-state',
  'kick-player',
  'chat-message',
  'zombie-damage',
  'zombie-attack-player',
  'revive-player',
  'reconnect',
];

const BAD_PAYLOADS: Array<{ label: string; value: unknown }> = [
  { label: 'null', value: null },
  { label: 'string', value: 'nope' },
  { label: 'number', value: 42 },
  { label: 'empty object', value: {} },
  {
    label: 'wrong field types',
    value: { roomId: 7, playerName: { x: 1 }, classId: [], events: 'x', targetPlayerId: null },
  },
];

async function hostWithRoom(): Promise<{ client: RawClient; roomId: string }> {
  const client: RawClient = await RawClient.connect();
  client.send('create-room', {
    roomName: uniqueRoomName('raw'),
    playerName: 'RawHost',
    classId: 'warrior',
  });
  const created: RawMessage = await client.waitFor('room-created');
  return { client, roomId: (created.payload as { room: { id: string } }).room.id };
}

test.describe('game server protocol', { tag: ['@protocol', '@external-safe'] }, (): void => {
  test('invalid JSON and unknown types get an error and the socket stays usable', async (): Promise<void> => {
    const c: RawClient = await RawClient.connect();
    c.sendRaw('{not json');
    await c.waitFor(
      'error',
      (p: unknown): boolean => (p as { code?: string }).code === 'INVALID_JSON',
    );
    c.send('definitely-not-a-type', {});
    await c.waitFor(
      'error',
      (p: unknown): boolean => (p as { code?: string }).code === 'UNKNOWN_TYPE',
    );
    expect(await c.ping()).toBe(true);
    c.close();
  });

  test('malformed payloads never take the server process down', async (): Promise<void> => {
    test.setTimeout(120_000);
    const bystander: { client: RawClient; roomId: string } = await hostWithRoom();
    for (const type of CLIENT_MESSAGE_TYPES) {
      const attacker: RawClient = await RawClient.connect();
      for (const bad of BAD_PAYLOADS) {
        attacker.send(type, bad.value);
      }
      attacker.close();
      const fresh: RawClient = await RawClient.connect();
      expect(await fresh.ping(), `server accepts new players after malformed "${type}"`).toBe(true);
      fresh.close();
    }
    expect(await bystander.client.ping(), 'players in other rooms are unaffected').toBe(true);
    bystander.client.close();
  });

  test('a malformed message does not leave the sender with a dead connection', async (): Promise<void> => {
    const deaf: string[] = [];
    for (const type of CLIENT_MESSAGE_TYPES) {
      const c: RawClient = await RawClient.connect();
      c.send(type, null);
      if (!(await c.ping(1_500))) deaf.push(type);
      c.close();
    }
    expect(deaf, 'message types whose null payload made the connection deaf').toEqual([]);
  });

  test('malformed payloads are rejected with an error reply', async (): Promise<void> => {
    const c: RawClient = await RawClient.connect();
    const unanswered: string[] = [];
    for (const type of [
      'create-room',
      'join-room',
      'toggle-ready',
      'start-game',
      'kick-player',
      'zombie-damage',
    ]) {
      const mark: number = c.received.length;
      c.send(type, null);
      try {
        await c.waitFor('error', (): boolean => true, 1_500, mark);
      } catch {
        unanswered.push(type);
      }
    }
    expect(unanswered, 'message types that silently accepted a null payload').toEqual([]);
    c.close();
  });

  test('only the host may broadcast game-sync', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const guest: RawClient = await RawClient.connect();
    guest.send('join-room', { roomId: host.roomId, playerName: 'RawGuest', classId: 'mage' });
    await guest.waitFor('room-joined');
    const mark: number = host.client.received.length;
    guest.send('game-sync', { player: { id: 'spoof' }, zombies: [], corpses: [], floor: 99 });
    await expect(
      host.client.waitFor('game-sync', (): boolean => true, 1_500, mark),
    ).rejects.toThrow();
    host.client.close();
    guest.close();
  });

  test('only the host may start the game', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const guest: RawClient = await RawClient.connect();
    guest.send('join-room', { roomId: host.roomId, playerName: 'RawGuest', classId: 'mage' });
    await guest.waitFor('room-joined');
    guest.send('start-game', { roomId: host.roomId });
    await guest.waitFor(
      'error',
      (p: unknown): boolean => (p as { code?: string }).code === 'NOT_HOST',
    );
    host.client.close();
    guest.close();
  });

  test('zombie-attack-player from a non-host is ignored', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const guest: RawClient = await RawClient.connect();
    guest.send('join-room', { roomId: host.roomId, playerName: 'RawGuest', classId: 'mage' });
    const joined: RawMessage = await guest.waitFor('room-joined');
    const hostId: string = (
      joined.payload as { room: { players: Array<{ id: string; isHost: boolean }> } }
    ).room.players.find((p: { id: string; isHost: boolean }): boolean => p.isHost)!.id;
    const mark: number = host.client.received.length;
    guest.send('zombie-attack-player', {
      targetPlayerId: hostId,
      damage: 99999,
      zombieX: 0,
      zombieY: 0,
      knockbackDir: 1,
      isPoisonAttack: false,
    });
    await expect(
      host.client.waitFor('zombie-attack-player', (): boolean => true, 1_500, mark),
    ).rejects.toThrow();
    host.client.close();
    guest.close();
  });

  test('a kicked player is fully released and can create a room', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    const guest: RawClient = await RawClient.connect();
    guest.send('join-room', { roomId: host.roomId, playerName: 'RawGuest', classId: 'mage' });
    const joined: RawMessage = await guest.waitFor('room-joined');
    const guestId: string = (joined.payload as { playerId: string }).playerId;
    host.client.send('kick-player', { roomId: host.roomId, playerId: guestId });
    await guest.waitFor('player-kicked');
    const mark: number = guest.received.length;
    guest.send('create-room', {
      roomName: uniqueRoomName('after-kick'),
      playerName: 'RawGuest',
      classId: 'mage',
    });
    const reply: RawMessage = await Promise.race([
      guest.waitFor('room-created', (): boolean => true, 3_000, mark),
      guest.waitFor('error', (): boolean => true, 3_000, mark),
    ]);
    expect(reply.type, `server answered ${JSON.stringify(reply.payload)}`).toBe('room-created');
    host.client.close();
    guest.close();
  });

  test('a multi-megabyte frame does not kill the server', async (): Promise<void> => {
    const host: { client: RawClient; roomId: string } = await hostWithRoom();
    host.client.send('player-state', { player: { id: 'x' }, junk: 'z'.repeat(3_000_000) });
    expect(await host.client.ping(5_000)).toBe(true);
    host.client.close();
  });
});
