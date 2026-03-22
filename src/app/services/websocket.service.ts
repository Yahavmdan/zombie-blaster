import { Injectable } from '@angular/core';
import { Subject, Observable, ReplaySubject } from 'rxjs';
import type {
  ServerMessage,
  ServerMessageType,
  ClientMessage,
  ClientMessageType,
  WelcomePayload,
  ServerShuttingDownPayload,
  ReconnectPayload,
  ReconnectResultPayload,
} from '@shared/multiplayer';
import type { CharacterClass } from '@shared/character';
import { environment } from '../../environments/environment';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface SessionInfo {
  roomId: string;
  playerName: string;
  classId: CharacterClass;
}

const DEFAULT_WS_URL: string = environment.wsUrl;
const PING_INTERVAL_MS: number = 25_000;
const RECONNECT_BASE_DELAY_MS: number = 1_000;
const RECONNECT_MAX_DELAY_MS: number = 15_000;
const RECONNECT_MAX_ATTEMPTS: number = 10;

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt: number = 0;
  private autoReconnect: boolean = true;
  private wsUrl: string = DEFAULT_WS_URL;

  private reconnectToken: string | null = null;
  private pendingReconnectToken: string | null = null;
  private sessionInfo: SessionInfo | null = null;
  private intentionalDisconnect: boolean = false;

  private readonly _messages$: Subject<ServerMessage> = new Subject<ServerMessage>();
  private readonly _status$: ReplaySubject<ConnectionStatus> = new ReplaySubject<ConnectionStatus>(1);
  private readonly _serverShutdown$: Subject<ServerShuttingDownPayload> = new Subject<ServerShuttingDownPayload>();
  private _currentStatus: ConnectionStatus = 'disconnected';

  readonly messages$: Observable<ServerMessage> = this._messages$.asObservable();
  readonly status$: Observable<ConnectionStatus> = this._status$.asObservable();
  readonly serverShutdown$: Observable<ServerShuttingDownPayload> = this._serverShutdown$.asObservable();

  get currentStatus(): ConnectionStatus {
    return this._currentStatus;
  }

  setSessionInfo(info: SessionInfo | null): void {
    this.sessionInfo = info;
  }

  connect(url: string = DEFAULT_WS_URL): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this._status$.next(this._currentStatus);
      return;
    }

    this.wsUrl = url;
    this.intentionalDisconnect = false;
    this.openSocket();
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.cancelReconnect();
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectToken = null;
    this.sessionInfo = null;
    this.reconnectAttempt = 0;
    this.setStatus('disconnected');
  }

  send<T>(type: ClientMessageType, payload: T): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send, not connected');
      return;
    }

    const msg: ClientMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };

    this.ws.send(JSON.stringify(msg));
  }

  onMessage(type: ServerMessageType): Observable<ServerMessage> {
    return new Observable<ServerMessage>((subscriber): (() => void) => {
      const sub: import('rxjs').Subscription = this._messages$.subscribe((msg: ServerMessage): void => {
        if (msg.type === type) {
          subscriber.next(msg);
        }
      });
      return (): void => sub.unsubscribe();
    });
  }

  private openSocket(): void {
    const isReconnect: boolean = this.reconnectAttempt > 0;
    this.setStatus(isReconnect ? 'reconnecting' : 'connecting');

    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = (): void => {
      this.setStatus('connected');
      this.reconnectAttempt = 0;
      this.startPing();
    };

    this.ws.onmessage = (event: MessageEvent): void => {
      try {
        const msg: ServerMessage = JSON.parse(event.data as string) as ServerMessage;
        this.handleInternalMessage(msg);
        this._messages$.next(msg);
      } catch {
        console.error('[WS] Failed to parse server message');
      }
    };

    this.ws.onclose = (): void => {
      this.stopPing();
      if (!this.intentionalDisconnect && this.autoReconnect) {
        if (this.reconnectToken && this.sessionInfo) {
          this.pendingReconnectToken = this.reconnectToken;
        }
        this.scheduleReconnect();
      } else {
        this.setStatus('disconnected');
      }
    };

    this.ws.onerror = (): void => {
      /* onclose fires after onerror — reconnect logic lives there */
    };
  }

  private handleInternalMessage(msg: ServerMessage): void {
    if (msg.type === ('welcome' as ServerMessageType)) {
      const payload: WelcomePayload = msg.payload as WelcomePayload;
      const oldToken: string | null = this.pendingReconnectToken;
      this.reconnectToken = payload.reconnectToken;
      this.pendingReconnectToken = null;

      if (oldToken && this.sessionInfo) {
        this.attemptSessionResume(oldToken);
      }
    }

    if (msg.type === ('server-shutting-down' as ServerMessageType)) {
      const payload: ServerShuttingDownPayload = msg.payload as ServerShuttingDownPayload;
      this._serverShutdown$.next(payload);
    }

    if (msg.type === ('reconnect-result' as ServerMessageType)) {
      const payload: ReconnectResultPayload = msg.payload as ReconnectResultPayload;
      if (payload.success) {
        console.log('[WS] Session resumed successfully');
      } else {
        console.warn('[WS] Session resume failed:', payload.reason);
        this.sessionInfo = null;
      }
    }
  }

  private attemptSessionResume(token: string): void {
    if (!this.sessionInfo) return;

    const payload: ReconnectPayload = {
      reconnectToken: token,
      playerName: this.sessionInfo.playerName,
      classId: this.sessionInfo.classId,
    };

    this.send('reconnect' as ClientMessageType, payload);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      console.warn('[WS] Max reconnect attempts reached');
      this.setStatus('error');
      return;
    }

    const delay: number = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_DELAY_MS,
    );

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt + 1}/${RECONNECT_MAX_ATTEMPTS})`);
    this.setStatus('reconnecting');

    this.reconnectTimer = setTimeout((): void => {
      this.reconnectAttempt++;
      this.openSocket();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this._currentStatus = status;
    this._status$.next(status);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval((): void => {
      this.send('ping' as ClientMessageType, {});
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
