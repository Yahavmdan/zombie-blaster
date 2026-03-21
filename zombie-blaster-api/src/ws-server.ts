import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { RoomManager } from './room-manager.js';
import { Room } from './room.js';
import type {
  ClientMessage,
  ClientMessageType,
  ServerMessage,
  ServerMessageType,
  CreateRoomPayload,
  JoinRoomPayload,
  LeaveRoomPayload,
  ToggleReadyPayload,
  StartGamePayload,
  KickPlayerPayload,
  LobbyPlayerInputPayload,
  LobbyChatPayload,
  RoomCreatedPayload,
  RoomJoinedPayload,
  RoomUpdatedPayload,
  RoomListPayload,
  ErrorPayload,
  GameStartedPayload,
  ChatBroadcastPayload,
  RoomPlayer,
} from '../../shared/multiplayer.js';
import type { CharacterState } from '../../shared/character.js';

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
}

const HEARTBEAT_INTERVAL_MS: number = 30_000;
const STALE_ROOM_MAX_AGE_MS: number = 3_600_000;
const STALE_CLEANUP_INTERVAL_MS: number = 300_000;

export class GameWebSocketServer {
  private readonly httpServer: HttpServer;
  private readonly wss: WebSocketServer;
  private readonly roomManager: RoomManager = new RoomManager();
  private readonly clients: Map<string, ConnectedClient> = new Map<string, ConnectedClient>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(port: number) {
    this.httpServer = createServer((req: IncomingMessage, res: ServerResponse): void => {
      console.log(`[HTTP] ${req.method} ${req.url} from ${req.headers['host']}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });

    this.httpServer.on('error', (err: Error): void => {
      console.error('[HTTP] Server error:', err);
    });

    this.wss = new WebSocketServer({ server: this.httpServer });
    this.setupServer();
    this.startHeartbeat();
    this.startCleanup();

    this.httpServer.listen(port, '0.0.0.0', (): void => {
      console.log(`[WS] Zombie Blaster API running on 0.0.0.0:${port}`);
    });
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket): void => {
      const clientId: string = uuidv4();
      const client: ConnectedClient = { id: clientId, ws, isAlive: true };
      this.clients.set(clientId, client);

      console.log(`[WS] Client connected: ${clientId}`);

      ws.on('pong', (): void => {
        client.isAlive = true;
      });

      ws.on('message', (data: Buffer): void => {
        this.handleMessage(clientId, data);
      });

      ws.on('close', (): void => {
        this.handleDisconnect(clientId);
      });

      ws.on('error', (err: Error): void => {
        console.error(`[WS] Client ${clientId} error:`, err.message);
      });
    });
  }

  private handleMessage(clientId: string, raw: Buffer): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      this.sendError(clientId, 'INVALID_JSON', 'Could not parse message');
      return;
    }

    const type: string = msg.type;

    switch (type) {
      case 'create-room':
        this.handleCreateRoom(clientId, msg.payload as CreateRoomPayload);
        break;
      case 'join-room':
        this.handleJoinRoom(clientId, msg.payload as JoinRoomPayload);
        break;
      case 'leave-room':
        this.handleLeaveRoom(clientId);
        break;
      case 'list-rooms':
        this.handleListRooms(clientId);
        break;
      case 'toggle-ready':
        this.handleToggleReady(clientId, msg.payload as ToggleReadyPayload);
        break;
      case 'start-game':
        this.handleStartGame(clientId, msg.payload as StartGamePayload);
        break;
      case 'player-input':
        this.handlePlayerInput(clientId, msg.payload as LobbyPlayerInputPayload);
        break;
      case 'game-sync':
        this.handleGameSync(clientId, msg.payload);
        break;
      case 'player-state':
        this.handlePlayerState(clientId, msg.payload);
        break;
      case 'kick-player':
        this.handleKickPlayer(clientId, msg.payload as KickPlayerPayload);
        break;
      case 'chat-message':
        this.handleChatMessage(clientId, msg.payload as LobbyChatPayload);
        break;
      case 'zombie-damage':
        this.handleZombieDamage(clientId, msg.payload);
        break;
      case 'zombie-attack-player':
        this.handleZombieAttackPlayer(clientId, msg.payload);
        break;
      case 'revive-player':
        this.handleRevivePlayer(clientId, msg.payload);
        break;
      case 'ping':
        this.send(clientId, 'pong' as ServerMessageType, {});
        break;
      default:
        this.sendError(clientId, 'UNKNOWN_TYPE', `Unknown message type: ${type}`);
    }
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

    room.toggleReady(clientId);
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

  private handlePlayerInput(clientId: string, payload: LobbyPlayerInputPayload): void {
    const room: Room | undefined = this.roomManager.getRoom(payload.roomId);
    if (!room) return;

    this.broadcastToRoom(room, 'player-input' as ServerMessageType, {
      playerId: clientId,
      keys: payload.keys,
      attackSkillId: payload.attackSkillId,
    }, clientId);
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

    room.removePlayer(payload.playerId);
    this.send(payload.playerId, 'player-kicked' as ServerMessageType, { roomId: room.id });
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

  private handleZombieDamage(clientId: string, payload: unknown): void {
    const room: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    if (!room) return;
    if (room.hostId === clientId) return;

    const hostId: string | null = room.hostId;
    if (!hostId) return;

    const wrapped: { playerId: string; events: unknown } = {
      playerId: clientId,
      events: (payload as { events: unknown }).events,
    };
    this.send(hostId, 'zombie-damage' as ServerMessageType, wrapped);
  }

  private handleZombieAttackPlayer(clientId: string, payload: unknown): void {
    const room: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    if (!room) return;
    if (room.hostId !== clientId) return;

    const typed: { targetPlayerId: string } = payload as { targetPlayerId: string };
    const targetId: string = typed.targetPlayerId;
    if (!room.getPlayer(targetId)) return;

    this.send(targetId, 'zombie-attack-player' as ServerMessageType, payload);
  }

  private handleRevivePlayer(clientId: string, payload: unknown): void {
    const room: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    if (!room) return;

    const typed: { targetPlayerId: string; roomId: string } =
      payload as { targetPlayerId: string; roomId: string };
    const targetId: string = typed.targetPlayerId;
    if (!room.getPlayer(targetId)) return;

    this.send(targetId, 'player-revived' as ServerMessageType, {
      targetPlayerId: targetId,
      reviverId: clientId,
    });
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

  private handleDisconnect(clientId: string): void {
    console.log(`[WS] Client disconnected: ${clientId}`);

    const room: Room | undefined = this.roomManager.getRoomForPlayer(clientId);
    const wasInGame: boolean = room !== undefined && room.status === ('in-game' as string);

    if (wasInGame && room) {
      this.broadcastToRoom(room, 'player-left' as ServerMessageType, { playerId: clientId }, clientId);
    }

    const result = this.roomManager.leaveRoom(clientId);
    if (result && !result.wasEmpty) {
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
          this.handleDisconnect(id);
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
    }, STALE_CLEANUP_INTERVAL_MS);
  }

  shutdown(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.wss.close();
    this.httpServer.close();
    console.log('[WS] Server shut down');
  }
}
