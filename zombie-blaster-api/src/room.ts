import { v4 as uuidv4 } from 'uuid';
import type {
  RoomInfo,
  RoomPlayer,
  RoomStatus,
} from '../../shared/multiplayer.js';
import type { CharacterClass } from '../../shared/character.js';

const MAX_PLAYERS: number = 6;

export class Room {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  private _status: RoomStatus = 'waiting' as RoomStatus;
  private readonly _players: Map<string, RoomPlayer> = new Map<string, RoomPlayer>();
  /** Kicked player id -> time (ms) until which they may not join again. */
  private readonly kickedUntil: Map<string, number> = new Map<string, number>();

  constructor(name: string) {
    this.id = uuidv4();
    this.name = name;
    this.createdAt = Date.now();
  }

  get status(): RoomStatus {
    return this._status;
  }

  get playerCount(): number {
    return this._players.size;
  }

  get isFull(): boolean {
    return this._players.size >= MAX_PLAYERS;
  }

  get hostId(): string | null {
    for (const [id, player] of this._players) {
      if (player.isHost) return id;
    }
    return null;
  }

  get players(): RoomPlayer[] {
    return Array.from(this._players.values());
  }

  addPlayer(id: string, name: string, classId: CharacterClass, isHost: boolean): RoomPlayer | null {
    if (this.isFull) return null;
    if (this._status !== ('waiting' as RoomStatus) && this._status !== ('in-game' as RoomStatus)) return null;

    // A room kept open for reconnects can be empty: whoever comes back first hosts it.
    const host: boolean = isHost || this._players.size === 0;
    const player: RoomPlayer = {
      id,
      name,
      classId,
      isHost: host,
      isReady: host || this._status === ('in-game' as RoomStatus),
      isAfk: false,
    };
    this._players.set(id, player);
    return player;
  }

  removePlayer(id: string): boolean {
    const player: RoomPlayer | undefined = this._players.get(id);
    if (!player) return false;

    this._players.delete(id);

    if (player.isHost && this._players.size > 0) {
      // An active player runs the world if there is one; an away one only when everyone is away.
      const active: RoomPlayer | undefined = this.players.find((p: RoomPlayer): boolean => !p.isAfk);
      this.makeHost(active ?? this._players.values().next().value!);
    }

    return true;
  }

  /**
   * Marks a player away or back. The host role never stays on an away player while someone is
   * active: returns the new host's id when it moved, else null.
   */
  setAfk(id: string, afk: boolean): string | null {
    const player: RoomPlayer | undefined = this._players.get(id);
    if (!player) return null;
    player.isAfk = afk;
    const host: RoomPlayer | undefined = this.players.find((p: RoomPlayer): boolean => p.isHost);
    if (!host || !host.isAfk) return null;
    const active: RoomPlayer | undefined = this.players.find((p: RoomPlayer): boolean => !p.isAfk);
    if (!active) return null;
    host.isHost = false;
    this.makeHost(active);
    return active.id;
  }

  private makeHost(player: RoomPlayer): void {
    player.isHost = true;
    player.isReady = true;
  }

  /** Keeps a kicked player out until `until` (ms). Removing them from the room is the caller's job. */
  kick(id: string, until: number): void {
    this.kickedUntil.set(id, until);
  }

  /** Names are compared trimmed and case-insensitive: "Bob" and " bob " can't share a room. */
  isNameTaken(name: string): boolean {
    const wanted: string = name.trim().toLowerCase();
    return this.players.some((p: RoomPlayer): boolean => p.name.trim().toLowerCase() === wanted);
  }

  isKicked(id: string, now: number): boolean {
    const until: number | undefined = this.kickedUntil.get(id);
    if (until === undefined) return false;
    if (now < until) return true;
    this.kickedUntil.delete(id);
    return false;
  }

  getPlayer(id: string): RoomPlayer | undefined {
    return this._players.get(id);
  }

  toggleReady(id: string): boolean {
    const player: RoomPlayer | undefined = this._players.get(id);
    if (!player || player.isHost) return false;
    player.isReady = !player.isReady;
    return true;
  }

  canStart(): boolean {
    if (this._players.size < 1) return false;
    for (const player of this._players.values()) {
      if (!player.isReady) return false;
    }
    return true;
  }

  startGame(): boolean {
    if (this._status !== ('waiting' as RoomStatus) || !this.canStart()) return false;
    this._status = 'in-game' as RoomStatus;
    return true;
  }

  finish(): void {
    this._status = 'finished' as RoomStatus;
  }

  toInfo(): RoomInfo {
    return {
      id: this.id,
      name: this.name,
      hostName: this.getHostName(),
      players: this.players,
      maxPlayers: MAX_PLAYERS,
      status: this._status,
      createdAt: this.createdAt,
    };
  }

  private getHostName(): string {
    for (const player of this._players.values()) {
      if (player.isHost) return player.name;
    }
    return 'Unknown';
  }
}
