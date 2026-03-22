import {
  Component,
  ChangeDetectionStrategy,
  WritableSignal,
  Signal,
  signal,
  computed,
  inject,
  OnInit,
  OnDestroy,
  DestroyRef,
  NgZone,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CharacterClass,
  GameMode,
  RoomInfo,
  RoomPlayer,
  ServerMessageType,
  ClientMessageType,
  MAX_PLAYERS_PER_ROOM,
} from '@shared/index';
import type {
  ServerMessage,
  RoomCreatedPayload,
  RoomJoinedPayload,
  RoomUpdatedPayload,
  RoomListPayload,
  GameStartedPayload,
  ErrorPayload,
  ServerShuttingDownPayload,
  ReconnectResultPayload,
} from '@shared/multiplayer';
import { WebSocketService, ConnectionStatus } from '../../services/websocket.service';
import { GameStateService } from '../../services/game-state.service';

type LobbyView = 'browser' | 'room';

@Component({
  selector: 'app-lobby',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, UpperCasePipe],
  host: {
    class: 'lobby-page',
  },
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.css',
})
export class LobbyComponent implements OnInit, OnDestroy {
  private readonly router: Router = inject(Router);
  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly ws: WebSocketService = inject(WebSocketService);
  private readonly gameState: GameStateService = inject(GameStateService);
  private readonly destroyRef: DestroyRef = inject(DestroyRef);
  private readonly zone: NgZone = inject(NgZone);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private gameStarting: boolean = false;

  readonly view: WritableSignal<LobbyView> = signal<LobbyView>('browser');
  readonly connectionStatus: WritableSignal<ConnectionStatus> = signal<ConnectionStatus>('disconnected');
  readonly rooms: WritableSignal<RoomInfo[]> = signal<RoomInfo[]>([]);
  readonly currentRoom: WritableSignal<RoomInfo | null> = signal<RoomInfo | null>(null);
  readonly playerId: WritableSignal<string> = signal<string>('');
  readonly errorMessage: WritableSignal<string> = signal<string>('');
  readonly shutdownWarning: WritableSignal<string> = signal<string>('');

  readonly playerName: WritableSignal<string> = signal<string>('');
  readonly playerClass: WritableSignal<CharacterClass> = signal<CharacterClass>(CharacterClass.Warrior);

  readonly maxPlayers: number = MAX_PLAYERS_PER_ROOM;

  readonly isHost: Signal<boolean> = computed((): boolean => {
    const room: RoomInfo | null = this.currentRoom();
    const id: string = this.playerId();
    if (!room || !id) return false;
    return room.players.some((p: RoomPlayer): boolean => p.id === id && p.isHost);
  });

  readonly allReady: Signal<boolean> = computed((): boolean => {
    const room: RoomInfo | null = this.currentRoom();
    if (!room) return false;
    return room.players.every((p: RoomPlayer): boolean => p.isReady);
  });

  readonly isConnected: Signal<boolean> = computed((): boolean => {
    return this.connectionStatus() === 'connected';
  });

  newRoomNameInput: string = '';

  ngOnInit(): void {
    const name: string = this.route.snapshot.queryParamMap.get('name') ?? 'Player';
    const classId: string = this.route.snapshot.queryParamMap.get('classId') ?? CharacterClass.Warrior;
    this.playerName.set(name);
    this.playerClass.set(classId as CharacterClass);

    this.ws.status$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((status: ConnectionStatus): void => {
      this.connectionStatus.set(status);
      if (status === 'connected') {
        this.requestRoomList();
      }
    });

    this.ws.onMessage(ServerMessageType.RoomList)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: RoomListPayload = msg.payload as RoomListPayload;
        this.rooms.set(payload.rooms);
      });

    this.ws.onMessage(ServerMessageType.RoomCreated)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: RoomCreatedPayload = msg.payload as RoomCreatedPayload;
        this.playerId.set(payload.playerId);
        this.currentRoom.set(payload.room);
        this.view.set('room');
        this.clearError();
        this.ws.setSessionInfo({
          roomId: payload.room.id,
          playerName: this.playerName(),
          classId: this.playerClass(),
        });
      });

    this.ws.onMessage(ServerMessageType.RoomJoined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: RoomJoinedPayload = msg.payload as RoomJoinedPayload;
        this.playerId.set(payload.playerId);
        this.currentRoom.set(payload.room);
        this.view.set('room');
        this.clearError();
        this.ws.setSessionInfo({
          roomId: payload.room.id,
          playerName: this.playerName(),
          classId: this.playerClass(),
        });
      });

    this.ws.onMessage(ServerMessageType.RoomUpdated)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: RoomUpdatedPayload = msg.payload as RoomUpdatedPayload;
        this.currentRoom.set(payload.room);
      });

    this.ws.onMessage(ServerMessageType.RoomLeft)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((): void => {
        this.currentRoom.set(null);
        this.view.set('browser');
        this.requestRoomList();
      });

    this.ws.onMessage(ServerMessageType.PlayerKicked)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((): void => {
        this.currentRoom.set(null);
        this.view.set('browser');
        this.errorMessage.set('You were kicked from the room');
        this.requestRoomList();
      });

    this.ws.onMessage(ServerMessageType.GameStarted)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: GameStartedPayload = msg.payload as GameStartedPayload;
        this.gameStarting = true;
        this.gameState.createPlayer(this.playerName(), this.playerClass(), this.playerId());
        void this.router.navigate(['/game'], {
          queryParams: {
            roomId: payload.roomId,
            mode: GameMode.Multiplayer,
            playerId: this.playerId(),
            isHost: this.isHost() ? '1' : '0',
          },
        });
      });

    this.ws.onMessage(ServerMessageType.Error)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: ErrorPayload = msg.payload as ErrorPayload;
        this.errorMessage.set(payload.message);
      });

    this.ws.serverShutdown$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload: ServerShuttingDownPayload): void => {
        const seconds: number = Math.ceil(payload.gracePeriodMs / 1000);
        this.shutdownWarning.set(`Server restarting in ${seconds}s — you will be reconnected automatically.`);
      });

    this.ws.onMessage(ServerMessageType.ReconnectResult)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg: ServerMessage): void => {
        const payload: ReconnectResultPayload = msg.payload as ReconnectResultPayload;
        this.shutdownWarning.set('');
        if (payload.success && payload.room) {
          this.playerId.set(payload.playerId);
          this.currentRoom.set(payload.room);
          this.view.set('room');
          this.clearError();
        }
      });

    this.ws.connect();

    this.zone.runOutsideAngular((): void => {
      this.refreshTimer = setInterval((): void => {
        if (this.view() === 'browser' && this.ws.currentStatus === 'connected') {
          this.zone.run((): void => {
            this.requestRoomList();
          });
        }
      }, 5000);
    });
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.currentRoom() && !this.gameStarting) {
      this.ws.send(ClientMessageType.LeaveRoom, { roomId: this.currentRoom()!.id });
    }
  }

  requestRoomList(): void {
    this.ws.send(ClientMessageType.ListRooms, {});
  }

  createRoom(): void {
    const roomName: string = this.newRoomNameInput.trim() || `${this.playerName()}'s Room`;
    this.ws.send(ClientMessageType.CreateRoom, {
      roomName,
      playerName: this.playerName(),
      classId: this.playerClass(),
    });
  }

  joinRoom(roomId: string): void {
    this.ws.send(ClientMessageType.JoinRoom, {
      roomId,
      playerName: this.playerName(),
      classId: this.playerClass(),
    });
  }

  leaveRoom(): void {
    const room: RoomInfo | null = this.currentRoom();
    if (!room) return;
    this.ws.send(ClientMessageType.LeaveRoom, { roomId: room.id });
    this.ws.setSessionInfo(null);
    this.currentRoom.set(null);
    this.view.set('browser');
    this.requestRoomList();
  }

  toggleReady(): void {
    const room: RoomInfo | null = this.currentRoom();
    if (!room) return;
    this.ws.send(ClientMessageType.ToggleReady, { roomId: room.id });
  }

  startGame(): void {
    const room: RoomInfo | null = this.currentRoom();
    if (!room) return;
    this.ws.send(ClientMessageType.StartGame, { roomId: room.id });
  }

  kickPlayer(targetPlayerId: string): void {
    const room: RoomInfo | null = this.currentRoom();
    if (!room) return;
    this.ws.send(ClientMessageType.KickPlayer, { roomId: room.id, playerId: targetPlayerId });
  }

  goBack(): void {
    this.ws.disconnect();
    void this.router.navigate(['/character-select'], {
      queryParams: { mode: GameMode.Multiplayer },
    });
  }

  getClassIcon(classId: CharacterClass): string {
    const icons: Record<CharacterClass, string> = {
      [CharacterClass.Warrior]: '⚔️',
      [CharacterClass.Ranger]: '🏹',
      [CharacterClass.Mage]: '🔮',
      [CharacterClass.Assassin]: '🗡️',
      [CharacterClass.Priest]: '✨',
    };
    return icons[classId] ?? '❓';
  }

  private clearError(): void {
    this.errorMessage.set('');
  }
}
