import { v4 as uuidv4 } from 'uuid';
import type {
  RoomInfo,
  RoomPlayer,
  RoomStatus,
} from '../../shared/multiplayer.js';
import type { CharacterClass } from '../../shared/character.js';

const MAX_PLAYERS: number = 6;

/** How names are compared: trimmed and case-insensitive. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Whether `key` is still barred at `now`; forgets it once its time is up. */
function isStillBarred(barred: Map<string, number>, key: string, now: number): boolean {
  const until: number | undefined = barred.get(key);
  if (until === undefined) return false;
  if (now < until) return true;
  barred.delete(key);
  return false;
}

export class Room {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  private _status: RoomStatus = 'waiting' as RoomStatus;
  private readonly _players: Map<string, RoomPlayer> = new Map<string, RoomPlayer>();
  /** Kicked player id -> time (ms) until which they may not join again. */
  private readonly kickedUntil: Map<string, number> = new Map<string, number>();
  /**
   * Kicked player name (normalized) -> time (ms) until which it may not join again. A new socket
   * gets a new id, so the id alone would let a kicked player straight back in by reconnecting.
   */
  private readonly kickedNamesUntil: Map<string, number> = new Map<string, number>();

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
    };
    this._players.set(id, player);
    return player;
  }

  removePlayer(id: string): boolean {
    const player: RoomPlayer | undefined = this._players.get(id);
    if (!player) return false;

    this._players.delete(id);

    if (player.isHost && this._players.size > 0) {
      const newHost: RoomPlayer = this._players.values().next().value!;
      newHost.isHost = true;
      newHost.isReady = true;
    }

    return true;
  }

  /** Keeps a kicked player (its id and its name) out until `until` (ms). Removing them from the room is the caller's job. */
  kick(id: string, name: string, until: number): void {
    this.kickedUntil.set(id, until);
    this.kickedNamesUntil.set(normalizeName(name), until);
  }

  /** Names are compared trimmed and case-insensitive: "Bob" and " bob " can't share a room. */
  isNameTaken(name: string): boolean {
    const wanted: string = normalizeName(name);
    return this.players.some((p: RoomPlayer): boolean => normalizeName(p.name) === wanted);
  }

  /** Kicked by this id or under this name, and the cooldown still runs. */
  isKicked(id: string, name: string, now: number): boolean {
    return isStillBarred(this.kickedUntil, id, now) || isStillBarred(this.kickedNamesUntil, normalizeName(name), now);
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
