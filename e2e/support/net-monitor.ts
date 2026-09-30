import { Page, WebSocket } from '@playwright/test';

export type FrameDirection = 'sent' | 'received';

export interface CapturedFrame {
  direction: FrameDirection;
  type: string;
  bytes: number;
  at: number;
  payload: unknown;
}

export interface TypeStats {
  count: number;
  bytes: number;
  avgBytes: number;
  maxBytes: number;
  perSecond: number;
}

export interface NetSummary {
  durationMs: number;
  sent: Record<string, TypeStats>;
  received: Record<string, TypeStats>;
  sentBytesPerSecond: number;
  receivedBytesPerSecond: number;
  largestFrame: { direction: FrameDirection; type: string; bytes: number } | null;
}

const MAX_KEPT_PAYLOADS: number = 5000;

/**
 * Records every WebSocket frame a page sends/receives (parsed `{ type, payload }` JSON).
 * Attach before navigating so the socket opened by the lobby is captured.
 * No app code involved: this also works against deployed builds.
 */
export class NetMonitor {
  private frames: CapturedFrame[] = [];
  private startedAt: number = Date.now();

  constructor(page: Page) {
    page.on('websocket', (ws: WebSocket): void => {
      ws.on('framesent', (frame: { payload: string | Buffer }): void =>
        this.record('sent', frame.payload),
      );
      ws.on('framereceived', (frame: { payload: string | Buffer }): void =>
        this.record('received', frame.payload),
      );
    });
  }

  reset(): void {
    this.frames = [];
    this.startedAt = Date.now();
  }

  all(): CapturedFrame[] {
    return [...this.frames];
  }

  ofType(direction: FrameDirection, type: string): CapturedFrame[] {
    return this.frames.filter(
      (f: CapturedFrame): boolean => f.direction === direction && f.type === type,
    );
  }

  summary(): NetSummary {
    const durationMs: number = Math.max(1, Date.now() - this.startedAt);
    const sent: Record<string, TypeStats> = this.aggregate('sent', durationMs);
    const received: Record<string, TypeStats> = this.aggregate('received', durationMs);
    let largest: CapturedFrame | null = null;
    for (const f of this.frames) {
      if (!largest || f.bytes > largest.bytes) largest = f;
    }
    return {
      durationMs,
      sent,
      received,
      sentBytesPerSecond: Math.round(sumBytes(sent) / (durationMs / 1000)),
      receivedBytesPerSecond: Math.round(sumBytes(received) / (durationMs / 1000)),
      largestFrame: largest
        ? { direction: largest.direction, type: largest.type, bytes: largest.bytes }
        : null,
    };
  }

  private record(direction: FrameDirection, raw: string | Buffer): void {
    const text: string = typeof raw === 'string' ? raw : raw.toString('utf8');
    let type: string = 'unparsed';
    let payload: unknown = null;
    try {
      const parsed: { type?: unknown; payload?: unknown } = JSON.parse(text) as {
        type?: unknown;
        payload?: unknown;
      };
      type = typeof parsed.type === 'string' ? parsed.type : 'untyped';
      payload = parsed.payload ?? null;
    } catch {
      type = 'unparsed';
    }
    const keepPayload: boolean = this.frames.length < MAX_KEPT_PAYLOADS;
    this.frames.push({
      direction,
      type,
      bytes: Buffer.byteLength(text, 'utf8'),
      at: Date.now(),
      payload: keepPayload ? payload : null,
    });
  }

  private aggregate(direction: FrameDirection, durationMs: number): Record<string, TypeStats> {
    const result: Record<string, TypeStats> = {};
    for (const f of this.frames) {
      if (f.direction !== direction) continue;
      const stats: TypeStats = result[f.type] ?? {
        count: 0,
        bytes: 0,
        avgBytes: 0,
        maxBytes: 0,
        perSecond: 0,
      };
      stats.count++;
      stats.bytes += f.bytes;
      stats.maxBytes = Math.max(stats.maxBytes, f.bytes);
      result[f.type] = stats;
    }
    for (const key of Object.keys(result)) {
      const stats: TypeStats = result[key];
      stats.avgBytes = Math.round(stats.bytes / stats.count);
      stats.perSecond = Math.round((stats.count / (durationMs / 1000)) * 10) / 10;
    }
    return result;
  }
}

function sumBytes(stats: Record<string, TypeStats>): number {
  return Object.values(stats).reduce((acc: number, s: TypeStats): number => acc + s.bytes, 0);
}
