import { e2eEnv } from './env';

export interface RawMessage {
  type: string;
  payload: unknown;
}

/**
 * Minimal game-server client over Node's built-in WebSocket. Used by protocol tests
 * to send hand-crafted (and malformed) messages that the real UI never would.
 */
export class RawClient {
  readonly received: RawMessage[] = [];
  private closed: boolean = false;

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (event: MessageEvent): void => {
      try {
        const parsed: RawMessage = JSON.parse(String(event.data)) as RawMessage;
        this.received.push(parsed);
      } catch {
        this.received.push({ type: 'unparsed', payload: String(event.data) });
      }
    });
    ws.addEventListener('close', (): void => {
      this.closed = true;
    });
  }

  static async connect(url: string = e2eEnv.wsUrl): Promise<RawClient> {
    const ws: WebSocket = new WebSocket(url);
    const client: RawClient = new RawClient(ws);
    await new Promise<void>((resolve: () => void, reject: (err: Error) => void): void => {
      ws.addEventListener('open', (): void => resolve(), { once: true });
      ws.addEventListener('error', (): void => reject(new Error(`Cannot connect to ${url}`)), {
        once: true,
      });
    });
    await client.waitFor('welcome');
    return client;
  }

  get isOpen(): boolean {
    return !this.closed && this.ws.readyState === WebSocket.OPEN;
  }

  send(type: string, payload: unknown): void {
    this.ws.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
  }

  sendRaw(text: string): void {
    this.ws.send(text);
  }

  /** Resolves with the first message of `type` received after `fromIndex` that matches `predicate`. */
  async waitFor(
    type: string,
    predicate: (payload: unknown) => boolean = (): boolean => true,
    timeoutMs: number = 5_000,
    fromIndex: number = 0,
  ): Promise<RawMessage> {
    const deadline: number = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found: RawMessage | undefined = this.received
        .slice(fromIndex)
        .find((m: RawMessage): boolean => m.type === type && predicate(m.payload));
      if (found) return found;
      await new Promise<void>((resolve: () => void): void => {
        setTimeout(resolve, 25);
      });
    }
    throw new Error(
      `No "${type}" message within ${timeoutMs}ms. Got: ${this.received.map((m: RawMessage): string => m.type).join(', ')}`,
    );
  }

  /** Round-trips a ping. Proves the server is still alive and processing this socket. */
  async ping(timeoutMs: number = 3_000): Promise<boolean> {
    const mark: number = this.received.length;
    this.send('ping', {});
    try {
      await this.waitFor('pong', (): boolean => true, timeoutMs, mark);
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.ws.close();
  }
}
