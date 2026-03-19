import { Injectable } from '@angular/core';
import { Subject, Observable, ReplaySubject } from 'rxjs';
import type {
  ServerMessage,
  ServerMessageType,
  ClientMessage,
  ClientMessageType,
} from '@shared/multiplayer';
import { environment } from '../../environments/environment';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const DEFAULT_WS_URL: string = environment.wsUrl;
const PING_INTERVAL_MS: number = 25_000;

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private readonly _messages$: Subject<ServerMessage> = new Subject<ServerMessage>();
  private readonly _status$: ReplaySubject<ConnectionStatus> = new ReplaySubject<ConnectionStatus>(1);
  private _currentStatus: ConnectionStatus = 'disconnected';

  readonly messages$: Observable<ServerMessage> = this._messages$.asObservable();
  readonly status$: Observable<ConnectionStatus> = this._status$.asObservable();

  get currentStatus(): ConnectionStatus {
    return this._currentStatus;
  }

  connect(url: string = DEFAULT_WS_URL): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this._status$.next(this._currentStatus);
      return;
    }

    this.setStatus('connecting');

    this.ws = new WebSocket(url);

    this.ws.onopen = (): void => {
      this.setStatus('connected');
      this.startPing();
    };

    this.ws.onmessage = (event: MessageEvent): void => {
      try {
        const msg: ServerMessage = JSON.parse(event.data as string) as ServerMessage;
        this._messages$.next(msg);
      } catch {
        console.error('[WS] Failed to parse server message');
      }
    };

    this.ws.onclose = (): void => {
      this.stopPing();
      this.setStatus('disconnected');
    };

    this.ws.onerror = (): void => {
      this.setStatus('error');
    };
  }

  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
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
      const sub = this._messages$.subscribe((msg: ServerMessage): void => {
        if (msg.type === type) {
          subscriber.next(msg);
        }
      });
      return (): void => sub.unsubscribe();
    });
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
