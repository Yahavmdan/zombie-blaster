import { Room } from './room.js';
import type { RoomInfo } from '../../shared/multiplayer.js';
import type { CharacterClass } from '../../shared/character.js';

export class RoomManager {
  private readonly rooms: Map<string, Room> = new Map<string, Room>();
  private readonly playerToRoom: Map<string, string> = new Map<string, string>();

  createRoom(roomName: string, playerId: string, playerName: string, classId: CharacterClass): Room {
    const room: Room = new Room(roomName);
    room.addPlayer(playerId, playerName, classId, true);
    this.rooms.set(room.id, room);
    this.playerToRoom.set(playerId, room.id);
    return room;
  }

  joinRoom(roomId: string, playerId: string, playerName: string, classId: CharacterClass): Room | null {
    const room: Room | undefined = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.addPlayer(playerId, playerName, classId, false);
    if (!player) return null;

    this.playerToRoom.set(playerId, roomId);
    return room;
  }

  /** `keepIfEmpty`: a dropped connection keeps its emptied room open for the reconnect window. */
  leaveRoom(playerId: string, keepIfEmpty: boolean = false): { room: Room; wasEmpty: boolean } | null {
    const roomId: string | undefined = this.playerToRoom.get(playerId);
    if (!roomId) return null;

    const room: Room | undefined = this.rooms.get(roomId);
    if (!room) return null;

    room.removePlayer(playerId);
    this.playerToRoom.delete(playerId);

    const wasEmpty: boolean = room.playerCount === 0;
    if (wasEmpty && !keepIfEmpty) {
      this.rooms.delete(roomId);
    }

    return { room, wasEmpty };
  }

  /** Deletes a room kept open for reconnects once nobody came back. */
  removeIfEmpty(roomId: string): void {
    const room: Room | undefined = this.rooms.get(roomId);
    if (room && room.playerCount === 0) {
      this.rooms.delete(roomId);
    }
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomForPlayer(playerId: string): Room | undefined {
    const roomId: string | undefined = this.playerToRoom.get(playerId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  listRooms(): RoomInfo[] {
    const result: RoomInfo[] = [];
    for (const room of this.rooms.values()) {
      if (room.playerCount === 0) continue;
      if (room.status === ('waiting' as unknown) || room.status === ('in-game' as unknown)) {
        result.push(room.toInfo());
      }
    }
    return result;
  }

  listAllRooms(): RoomInfo[] {
    const result: RoomInfo[] = [];
    for (const room of this.rooms.values()) {
      result.push(room.toInfo());
    }
    return result;
  }

  removeRoom(roomId: string): void {
    const room: Room | undefined = this.rooms.get(roomId);
    if (!room) return;

    for (const player of room.players) {
      this.playerToRoom.delete(player.id);
    }
    this.rooms.delete(roomId);
  }

  /**
   * Removes old rooms nobody is in. A room with players stays, however old: they are connected and
   * using it. So does one in `heldRoomIds`: a dropped player may still resume a seat there.
   */
  cleanupStaleRooms(maxAgeMs: number, heldRoomIds: Set<string>): number {
    const now: number = Date.now();
    let removed: number = 0;

    for (const [id, room] of this.rooms) {
      if (now - room.createdAt > maxAgeMs && room.playerCount === 0 && !heldRoomIds.has(id)) {
        this.removeRoom(id);
        removed++;
      }
    }

    return removed;
  }
}
