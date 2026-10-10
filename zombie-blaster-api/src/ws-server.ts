import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { RoomManager } from './room-manager.js';
import { Room } from './room.js';
import {
  isChatPayload,
  isClientMessage,
  isCreateRoomPayload,
  isJoinRoomPayload,
  isKickPlayerPayload,
  isReconnectPayload,
  isRevivePlayerPayload,
  isRoomIdPayload,
  isStateSnapshotPayload,
  isZombieAttackPlayerPayload,
  isZombieDamagePayload,
} from './validation.js';
import type {
  ServerMessage,
  ServerMessageType,
  CreateRoomPayload,
  JoinRoomPayload,
  ToggleReadyPayload,
  StartGamePayload,
  KickPlayerPayload,
  LobbyChatPayload,
  RoomCreatedPayload,
  RoomJoinedPayload,
  RoomUpdatedPayload,
  RoomListPayload,
  ErrorPayload,
  GameStartedPayload,
  ChatBroadcastPayload,
  RoomPlayer,
  ServerShuttingDownPayload,
  ReconnectPayload,
  ReconnectResultPayload,
  HostMigratedPayload,
  RemoteZombieDamagePayload,
  RevivePlayerPayload,
  ZombieAttackPlayerPayload,
  ZombieDamagePayload,
} from '../../shared/multiplayer.js';
import type { CharacterState } from '../../shared/character.js';

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
  reconnectToken: string;
}

interface DisconnectedSession {
  clientId: string;
  roomId: string;
  playerName: string;
  classId: string;
  disconnectedAt: number;
}

const HEARTBEAT_INTERVAL_MS: number = 30_000;
const STALE_ROOM_MAX_AGE_MS: number = 3_600_000;
const STALE_CLEANUP_INTERVAL_MS: number = 300_000;
const GRACEFUL_SHUTDOWN_MS: number = 10_000;
const RECONNECT_WINDOW_MS: number = 60_000;
/** Largest frame accepted; ws closes the socket (1009) on anything bigger. A 4-player game-sync is ~21 KB. */
const MAX_PAYLOAD_BYTES: number = 256 * 1024;
/** How long a kicked player is kept out of the room they were kicked from. */
const KICK_REJOIN_COOLDOWN_MS: number = 5 * 60_000;

export class GameWebSocketServer {
  private readonly httpServer: HttpServer;
  private readonly wss: WebSocketServer;
  private readonly roomManager: RoomManager = new RoomManager();
  private readonly clients: Map<string, ConnectedClient> = new Map<string, ConnectedClient>();
  private readonly disconnectedSessions: Map<string, DisconnectedSession> = new Map<string, DisconnectedSession>();
  /** Room id -> the timer that deletes it if still empty. One per room: a newer drop restarts the wait. */
  private readonly emptyRoomTimers: Map<string, ReturnType<typeof setTimeout>> = new Map<string, ReturnType<typeof setTimeout>>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown: boolean = false;

  constructor(port: number) {
    this.httpServer = createServer((req: IncomingMessage, res: ServerResponse): void => {
      console.log(`[HTTP] ${req.method} ${req.url} from ${req.headers['host']}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });

    this.httpServer.on('error', (err: Error): void => {
      console.error('[HTTP] Server error:', err);
    });

    this.wss = new WebSocketServer({ server: this.httpServer, maxPayload: MAX_PAYLOAD_BYTES });
    this.setupServer();
    this.startHeartbeat();
    this.startCleanup();

    this.httpServer.listen(port, '0.0.0.0', (): void => {
      console.log(`[WS] Zombie Blaster API running on 0.0.0.0:${port}`);
    });
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket): void => {
      if (this.isShuttingDown) {
        ws.close(1001, 'Server is shutting down');
        return;
      }

      const clientId: string = uuidv4();
      const reconnectToken: string = uuidv4();
      const client: ConnectedClient = { id: clientId, ws, isAlive: true, reconnectToken };
      this.clients.set(clientId, client);

      console.log(`[WS] Client connected: ${clientId}`);

      this.send(clientId, 'welcome' as ServerMessageType, { reconnectToken: reconnectToken });

      ws.on('pong', (): void => {
        client.isAlive = true;
      });

      // client.id, not clientId: a resumed session takes over its old id (handleReconnect).
      ws.on('message', (data: Buffer): void => {
        this.handleMessage(client.id, data);
      });

      ws.on('close', (): void => {
        this.handleDisconnect(client);
      });

      ws.on('error', (err: Error): void => {
        console.error(`[WS] Client ${client.id} error:`, err.message);
      });
    });
  }

  private handleMessage(clientId: string, raw: Buffer): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      this.sendError(clientId, 'INVALID_JSON', 'Could not parse message');
      return;
    }

    if (!isClientMessage(parsed)) {
      this.sendError(clientId, 'INVALID_MESSAGE', 'Message must be an object with a string "type"');
      return;
    }

    // A handler that throws must never break this socket's message loop.
    try {
      this.dispatch(clientId, parsed.type, parsed.payload);
    } catch {
      this.sendError(clientId, 'INTERNAL_ERROR', `Could not handle "${parsed.type}"`);
    }
  }

  private dispatch(clientId: string, type: string, payload: unknown): void {
    switch (type) {
      case 'create-room':
        if (!isCreateRoomPayload(payload)) return this.rejectPayload(clientId, type);
        this.handleCreateRoom(clientId, payload);
        break;
      case 'join-room':
        if (!isJoinRoomPayload(payload)) return this.rejectPayload(clientId, type);
        this.handleJoinRoom(clientId, payload);
        break;
      case 'leave-room':
        this.handleLeaveRoom(clientId);
        break;
      case 'list-rooms':
        this.handleListRooms(clientId);
        break;
      case 'toggle-ready':
        if (!isRoomIdPayload(payload)) return this.rejectPayload(clientId, type);
        this.handleToggleReady(clientId, payload);
        break;
      case 'start-game':
        if (!isRoomIdPayload(payload)) return this.rejectPayload(clientId, type);
        this.handleStartGame(clientId, payload);
        break;
      case 'game-sync':
        if (!isStateSnapshotPayload(payload)) return this.rejectPayload(clientId, type);
        this.handleGameSync(clientId, payload);
        break;
      case 'player-state':
        if (!isStateSnapshotPayload(payload)) return this.rejectPayload(clientId, type);
        this.handlePlayerState(clientId, payload);
        break;
      case 'kick-player':
        if (!isKickPlayerPayload(payload)) return this.rejectPayload(clientId, type);
        this.handleKickPlayer(clientId, payload);
        break;
      case 'chat-message':
        if (!isChatPayload(payload)) return this.rejectPayload(clientId, type);
        this.handleChatMessage(clientId, payload);
        break;
      case 'zombie-damage':
        if (!isZombieDamagePayload(payload)) return this.rejectPayload(clientId, type);
        this.handleZombieDamage(clientId, payload);
        break;
      case 'zombie-attack-player':
        if (!isZombieAttackPlayerPayload(payload)) return this.rejectPayload(clientId, type);
        this.handleZombieAttackPlayer(clientId, payload);
        break;
      case 'revive-player':
        if (!isRevivePlayerPayload(payload)) return this.rejectPayload(clientId, type);
        this.handleRevivePlayer(clientId, payload);
        break;
      case 'reconnect':
        if (!isReconnectPayload(payload)) return this.rejectPayload(clientId, type);
        this.handleReconnect(clientId, payload);
        break;
      case 'ping':
        this.send(clientId, 'pong' as ServerMessageType, {});
        break;
      default:
        this.sendError(clientId, 'UNKNOWN_TYPE', `Unknown message type: ${type}`);
    }
  }

  private rejectPayload(clientId: string, type: string): void {
    this.sendError(clientId, 'INVALID_PAYLOAD', `Invalid payload for "${type}"`);
  }

  private handleCreateRoom(clientId: string, payload: CreateRoomPayload): void {
    const existing: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    if (existing) {
      this.sendError(clientId, 'ALREADY_IN_ROOM', 'You are already in a room');
      return;
    }

    const room: Room = this.roomManager.createRoom(
      payload.roomName,
      clientId,
      payload.playerName,
      payload.classId,
    );

    console.log(`[Room] Created "${room.name}" (${room.id}) by ${payload.playerName}`);

    const response: RoomCreatedPayload = {
      room: room.toInfo(),
      playerId: clientId,
    };
    this.send(clientId, 'room-created' as ServerMessageType, response);
    this.broadcastRoomListToLobby();
  }

  private handleJoinRoom(clientId: string, payload: JoinRoomPayload): void {
    const existing: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    if (existing) {
      this.sendError(clientId, 'ALREADY_IN_ROOM', 'Leave your current room first');
      return;
    }

    if (this.roomManager.getRoom(payload.roomId)?.isKicked(clientId, payload.playerName, Date.now())) {
      this.sendError(clientId, 'KICKED', 'You were kicked from this room; try again later');
      return;
    }

    if (this.roomManager.getRoom(payload.roomId)?.isNameTaken(payload.playerName)) {
      this.sendError(clientId, 'NAME_TAKEN', 'Someone in this room already goes by that name');
      return;
    }

    const room: Room | null = this.roomManager.joinRoom(
      payload.roomId,
      clientId,
      payload.playerName,
      payload.classId,
    );

    if (!room) {
      this.sendError(clientId, 'JOIN_FAILED', 'Room not found or full');
      return;
    }

    console.log(`[Room] ${payload.playerName} joined "${room.name}" (${room.id})`);

    const joinedPayload: RoomJoinedPayload = {
      room: room.toInfo(),
      playerId: clientId,
    };
    this.send(clientId, 'room-joined' as ServerMessageType, joinedPayload);
    this.broadcastRoomUpdate(room, clientId);
    this.broadcastRoomListToLobby();

    if (room.status === ('in-game' as string)) {
      const gamePayload: GameStartedPayload = {
        roomId: room.id,
        players: [],
      };
      this.send(clientId, 'game-started' as ServerMessageType, gamePayload);
    }
  }

  private handleLeaveRoom(clientId: string): void {
    const room: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    const wasInGame: boolean = room !== undefined && room.status === ('in-game' as string);
    const wasHost: boolean = room !== undefined && room.hostId === clientId;

    if (wasInGame && room) {
      this.broadcastToRoom(room, 'player-left' as ServerMessageType, { playerId: clientId }, clientId);
    }

    const result = this.roomManager.leaveRoom(clientId);
    if (!result) {
      this.sendError(clientId, 'NOT_IN_ROOM', 'You are not in any room');
      return;
    }

    this.send(clientId, 'room-left' as ServerMessageType, {});

    if (!result.wasEmpty) {
      if (wasHost && wasInGame) {
        const newHostId: string | null = result.room.hostId;
        if (newHostId) {
          const migrationPayload: HostMigratedPayload = {
            newHostId,
            previousHostId: clientId,
          };
          this.broadcastToRoom(result.room, 'host-migrated' as ServerMessageType, migrationPayload);
          console.log(`[Room] Host migrated from ${clientId} to ${newHostId} in room "${result.room.name}"`);
        }
      }
      this.broadcastRoomUpdate(result.room);
    }
    this.broadcastRoomListToLobby();
  }

  private handleListRooms(clientId: string): void {
    const payload: RoomListPayload = {
      rooms: this.roomManager.listRooms(),
    };
    this.send(clientId, 'room-list' as ServerMessageType, payload);
  }

  private handleToggleReady(clientId: string, payload: ToggleReadyPayload): void {
    const room: Room | undefined = this.roomManager.getRoom(payload.roomId);
    if (!room) {
      this.sendError(clientId, 'ROOM_NOT_FOUND', 'Room does not exist');
      return;
    }

    if (!room.getPlayer(clientId)) {
      this.sendError(clientId, 'NOT_IN_ROOM', 'You are not in this room');
      return;
    }

    if (!room.toggleReady(clientId)) return;
    this.broadcastRoomUpdate(room);
  }

  private handleStartGame(clientId: string, payload: StartGamePayload): void {
    const room: Room | undefined = this.roomManager.getRoom(payload.roomId);
    if (!room) {
      this.sendError(clientId, 'ROOM_NOT_FOUND', 'Room does not exist');
      return;
    }

    if (room.hostId !== clientId) {
      this.sendError(clientId, 'NOT_HOST', 'Only the host can start the game');
      return;
    }

    if (room.status !== ('waiting' as string)) {
      this.sendError(clientId, 'ALREADY_STARTED', 'The game has already started');
      return;
    }

    if (!room.canStart()) {
      this.sendError(clientId, 'NOT_READY', 'Not all players are ready');
      return;
    }

    const started: boolean = room.startGame();
    if (!started) {
      this.sendError(clientId, 'START_FAILED', 'Could not start the game');
      return;
    }

    console.log(`[Room] Game started in "${room.name}" (${room.id})`);

    const players: CharacterState[] = room.players.map((rp: RoomPlayer): CharacterState => ({
      id: rp.id,
      name: rp.name,
      classId: rp.classId,
      level: 1,
      xp: 0,
      xpToNext: 120,
      stats: { str: 0, dex: 0, int: 0, luk: 0 },
      derived: { maxHp: 100, maxMp: 50, attack: 10, defense: 5, speed: 5, critRate: 5, critDamage: 150 },
      hp: 100,
      mp: 50,
      x: 640,
      y: 572,
      velocityX: 0,
      velocityY: 0,
      facing: 'right' as CharacterState['facing'],
      isGrounded: true,
      isAttacking: false,
      isDoubleJumping: false,
      isClimbing: false,
      isDead: false,
      isDown: false,
      downTimer: 0,
      unallocatedStatPoints: 0,
      unallocatedSkillPoints: 0,
      allocatedStats: { str: 0, dex: 0, int: 0, luk: 0 },
      skillLevels: {},
      activeBuffs: [],
      inventory: { potions: { 'hp-potion-1': 3, 'mp-potion-1': 3 }, gold: 0, autoPotionHpId: 'hp-potion-1', autoPotionMpId: 'mp-potion-1' },
    }));

    const gamePayload: GameStartedPayload = {
      roomId: room.id,
      players,
    };

    this.broadcastToRoom(room, 'game-started' as ServerMessageType, gamePayload);
  }

  private handleKickPlayer(clientId: string, payload: KickPlayerPayload): void {
    const room: Room | undefined = this.roomManager.getRoom(payload.roomId);
    if (!room) return;

    if (room.hostId !== clientId) {
      this.sendError(clientId, 'NOT_HOST', 'Only the host can kick players');
      return;
    }

    if (payload.playerId === clientId) {
      this.sendError(clientId, 'CANNOT_KICK_SELF', 'Cannot kick yourself');
      return;
    }

    if (!room.getPlayer(payload.playerId)) {
      this.sendError(clientId, 'NOT_IN_ROOM', 'That player is not in this room');
      return;
    }

    const wasInGame: boolean = room.status === ('in-game' as string);
    const kickedName: string = room.getPlayer(payload.playerId)!.name;
    // Leave through the RoomManager so the player-to-room mapping is released too.
    this.roomManager.leaveRoom(payload.playerId);
    room.kick(payload.playerId, kickedName, Date.now() + KICK_REJOIN_COOLDOWN_MS);
    this.send(payload.playerId, 'player-kicked' as ServerMessageType, { roomId: room.id });
    if (wasInGame) {
      this.broadcastToRoom(room, 'player-left' as ServerMessageType, { playerId: payload.playerId });
    }
    this.broadcastRoomUpdate(room);
    this.broadcastRoomListToLobby();
  }

  private handleChatMessage(clientId: string, payload: LobbyChatPayload): void {
    const room: Room | undefined = this.roomManager.getRoom(payload.roomId);
    if (!room) return;

    const player: RoomPlayer | undefined = room.getPlayer(clientId);
    if (!player) return;

    const chatPayload: ChatBroadcastPayload = {
      playerId: clientId,
      playerName: player.name,
      message: payload.message,
    };

    this.broadcastToRoom(room, 'chat-message' as ServerMessageType, chatPayload);
  }

  private handleZombieDamage(clientId: string, payload: Pick<ZombieDamagePayload, 'events'>): void {
    const room: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    if (!room) return;
    if (room.hostId === clientId) return;

    const hostId: string | null = room.hostId;
    if (!hostId) return;

    const wrapped: RemoteZombieDamagePayload = {
      playerId: clientId,
      events: payload.events,
    };
    this.send(hostId, 'zombie-damage' as ServerMessageType, wrapped);
  }

  private handleZombieAttackPlayer(clientId: string, payload: ZombieAttackPlayerPayload): void {
    const room: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    if (!room) return;
    if (room.hostId !== clientId) return;

    const targetId: string = payload.targetPlayerId;
    if (!room.getPlayer(targetId)) return;

    this.send(targetId, 'zombie-attack-player' as ServerMessageType, payload);
  }

  private handleRevivePlayer(clientId: string, payload: Pick<RevivePlayerPayload, 'targetPlayerId'>): void {
    const room: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    if (!room) return;

    const targetId: string = payload.targetPlayerId;
    if (!room.getPlayer(targetId)) return;
    if (targetId === clientId) {
      this.sendError(clientId, 'CANNOT_REVIVE_SELF', 'A teammate has to revive you');
      return;
    }

    this.send(targetId, 'player-revived' as ServerMessageType, {
      targetPlayerId: targetId,
      reviverId: clientId,
    });
  }

  private handleReconnect(clientId: string, payload: ReconnectPayload): void {
    if (this.roomManager.getRoomForPlayer(clientId)) {
      this.refuseResume(clientId, 'Leave your current room first');
      return;
    }

    // The old socket may still look alive (the network vanished; the heartbeat notices only after
    // up to a minute). The token proves it is the same player: drop the old socket now, as if closed.
    this.takeOverHalfOpenSocket(clientId, payload.reconnectToken);

    const session: DisconnectedSession | undefined = this.disconnectedSessions.get(payload.reconnectToken);

    if (!session) {
      this.refuseResume(clientId, 'No session found for this token — it may have expired');
      return;
    }

    const now: number = Date.now();
    if (now - session.disconnectedAt > RECONNECT_WINDOW_MS) {
      this.disconnectedSessions.delete(payload.reconnectToken);
      this.refuseResume(clientId, 'Reconnect window expired');
      return;
    }

    const room: Room | undefined = this.roomManager.getRoom(session.roomId);
    if (!room) {
      this.disconnectedSessions.delete(payload.reconnectToken);
      this.refuseResume(clientId, 'Room no longer exists');
      return;
    }

    // Refusals below are temporary: the session (and its token) stays, so the player can retry.
    if (room.isNameTaken(session.playerName)) {
      this.refuseResume(clientId, 'Someone in the room took that name meanwhile');
      return;
    }

    if (room.isFull) {
      this.refuseResume(clientId, 'Could not rejoin room (room may be full)');
      return;
    }

    this.disconnectedSessions.delete(payload.reconnectToken);

    // The player comes back under its old id, so every client (and its own game state) still knows it.
    const playerId: string = this.adoptId(clientId, session.clientId);

    // Name and class are the ones the player had: a resume is not a way to rename or switch class.
    const rejoined: Room | null = this.roomManager.joinRoom(
      session.roomId,
      playerId,
      session.playerName,
      session.classId as import('../../shared/character.js').CharacterClass,
    );

    if (!rejoined) {
      this.refuseResume(playerId, 'Could not rejoin room (room may be full)');
      return;
    }

    // The token for the next drop is the one this socket's welcome already handed out.
    console.log(`[WS] Client ${playerId} reconnected to room "${room.name}" (${room.id})`);

    const result: ReconnectResultPayload = {
      success: true,
      room: rejoined.toInfo(),
      playerId,
    };
    this.send(playerId, 'reconnect-result' as ServerMessageType, result);
    this.broadcastRoomUpdate(rejoined, playerId);
    this.broadcastRoomListToLobby();

    if (rejoined.status === ('in-game' as string)) {
      const gamePayload: GameStartedPayload = {
        roomId: rejoined.id,
        players: [],
      };
      this.send(playerId, 'game-started' as ServerMessageType, gamePayload);
    }
  }

  /**
   * Deletes a room emptied by a drop once the reconnect window has passed with nobody back. An
   * earlier timer is replaced: it would delete the room inside the newest drop's window.
   */
  private scheduleEmptyRoomRemoval(roomId: string): void {
    const previous: ReturnType<typeof setTimeout> | undefined = this.emptyRoomTimers.get(roomId);
    if (previous) clearTimeout(previous);
    const timer: ReturnType<typeof setTimeout> = setTimeout((): void => {
      this.emptyRoomTimers.delete(roomId);
      this.roomManager.removeIfEmpty(roomId);
    }, RECONNECT_WINDOW_MS);
    timer.unref();
    this.emptyRoomTimers.set(roomId, timer);
  }

  private refuseResume(clientId: string, reason: string): void {
    const result: ReconnectResultPayload = {
      success: false,
      room: null,
      playerId: clientId,
      reason,
    };
    this.send(clientId, 'reconnect-result' as ServerMessageType, result);
  }

  /**
   * Another live socket whose welcome handed out `token` is the same player on a dead connection:
   * it is dropped now (handleDisconnect opens its resume session). Your own socket's token resumes nothing.
   */
  private takeOverHalfOpenSocket(clientId: string, token: string): void {
    for (const other of this.clients.values()) {
      if (other.reconnectToken !== token || other.id === clientId) continue;
      if (!this.roomManager.getRoomForPlayer(other.id)) return;
      this.handleDisconnect(other);
      other.ws.terminate();
      return;
    }
  }

  /** Moves a socket to a resumed session's id. Keeps the current id if that one is somehow still connected. */
  private adoptId(currentId: string, resumedId: string): string {
    const client: ConnectedClient | undefined = this.clients.get(currentId);
    if (!client || this.clients.has(resumedId)) return currentId;
    this.clients.delete(currentId);
    client.id = resumedId;
    this.clients.set(resumedId, client);
    return resumedId;
  }

  private handleGameSync(clientId: string, payload: unknown): void {
    const room: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    if (!room) return;
    if (room.hostId !== clientId) return;

    this.broadcastToRoom(room, 'game-sync' as ServerMessageType, payload, clientId);
  }

  private handlePlayerState(clientId: string, payload: unknown): void {
    const room: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    if (!room) return;

    const wrapped: { playerId: string; data: unknown } = {
      playerId: clientId,
      data: payload,
    };
    this.broadcastToRoom(room, 'player-state-broadcast' as ServerMessageType, wrapped, clientId);
  }

  private handleDisconnect(client: ConnectedClient): void {
    // The heartbeat may already have handled this socket before its close event fires.
    if (this.clients.get(client.id) !== client) return;
    const clientId: string = client.id;
    console.log(`[WS] Client disconnected: ${clientId}`);

    const room: Room | undefined = this.roomManager.getRoomForPlayer(clientId);

    if (room) {
      const player: RoomPlayer | undefined = room.getPlayer(clientId);
      if (player) {
        const session: DisconnectedSession = {
          clientId,
          roomId: room.id,
          playerName: player.name,
          classId: player.classId,
          disconnectedAt: Date.now(),
        };
        this.disconnectedSessions.set(client.reconnectToken, session);
      }
    }

    const wasInGame: boolean = room !== undefined && room.status === ('in-game' as string);
    const wasHost: boolean = room !== undefined && room.hostId === clientId;

    if (wasInGame && room) {
      this.broadcastToRoom(room, 'player-left' as ServerMessageType, { playerId: clientId }, clientId);
    }

    const result = this.roomManager.leaveRoom(clientId, true);
    if (result?.wasEmpty) {
      this.scheduleEmptyRoomRemoval(result.room.id);
    }
    if (result && !result.wasEmpty) {
      if (wasHost && wasInGame) {
        const newHostId: string | null = result.room.hostId;
        if (newHostId) {
          const migrationPayload: HostMigratedPayload = {
            newHostId,
            previousHostId: clientId,
          };
          this.broadcastToRoom(result.room, 'host-migrated' as ServerMessageType, migrationPayload);
          console.log(`[Room] Host migrated from ${clientId} to ${newHostId} in room "${result.room.name}"`);
        }
      }
      this.broadcastRoomUpdate(result.room);
    }

    this.clients.delete(clientId);
    this.broadcastRoomListToLobby();
  }

  private send(clientId: string, type: ServerMessageType, payload: unknown): void {
    const client: ConnectedClient | undefined = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    const msg: ServerMessage = {
      type,
      payload,
      timestamp: Date.now(),
    };

    client.ws.send(JSON.stringify(msg));
  }

  private sendError(clientId: string, code: string, message: string): void {
    const payload: ErrorPayload = { code, message };
    this.send(clientId, 'error' as ServerMessageType, payload);
  }

  private broadcastToRoom(room: Room, type: ServerMessageType, payload: unknown, excludeId?: string): void {
    for (const player of room.players) {
      if (player.id !== excludeId) {
        this.send(player.id, type, payload);
      }
    }
  }

  private broadcastRoomUpdate(room: Room, excludeId?: string): void {
    const payload: RoomUpdatedPayload = { room: room.toInfo() };
    this.broadcastToRoom(room, 'room-updated' as ServerMessageType, payload, excludeId);
  }

  private broadcastRoomListToLobby(): void {
    const payload: RoomListPayload = { rooms: this.roomManager.listRooms() };
    for (const [clientId] of this.clients) {
      const inRoom: boolean = this.roomManager.getRoomForPlayer(clientId) !== undefined;
      if (!inRoom) {
        this.send(clientId, 'room-list' as ServerMessageType, payload);
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval((): void => {
      for (const [id, client] of this.clients) {
        if (!client.isAlive) {
          console.log(`[WS] Client ${id} timed out`);
          client.ws.terminate();
          this.handleDisconnect(client);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval((): void => {
      const removed: number = this.roomManager.cleanupStaleRooms(STALE_ROOM_MAX_AGE_MS);
      if (removed > 0) {
        console.log(`[Cleanup] Removed ${removed} stale rooms`);
      }
      this.pruneExpiredSessions(Date.now());
    }, STALE_CLEANUP_INTERVAL_MS);
  }

  /** Forgets sessions nobody resumed within the reconnect window. */
  private pruneExpiredSessions(now: number): void {
    for (const [token, session] of this.disconnectedSessions) {
      if (now - session.disconnectedAt > RECONNECT_WINDOW_MS) {
        this.disconnectedSessions.delete(token);
      }
    }
  }

  shutdown(): void {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(`[WS] Graceful shutdown started — ${GRACEFUL_SHUTDOWN_MS}ms grace period`);

    const payload: ServerShuttingDownPayload = {
      reason: 'Server is restarting for an update',
      gracePeriodMs: GRACEFUL_SHUTDOWN_MS,
    };

    for (const [clientId] of this.clients) {
      this.send(clientId, 'server-shutting-down' as ServerMessageType, payload);
    }

    setTimeout((): void => {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      if (this.cleanupTimer) clearInterval(this.cleanupTimer);

      for (const client of this.clients.values()) {
        client.ws.close(1012, 'Server restarting');
      }

      this.wss.close();
      this.httpServer.close();
      console.log('[WS] Server shut down');
    }, GRACEFUL_SHUTDOWN_MS);
  }
}
