/**
 * Calls `onTick` every `intervalMs` from a worker's timer. In a background tab the browser stops
 * animation frames and slows page timers to about once a second (or once a minute after a few
 * minutes), but worker timers and their messages keep their pace. Online play runs on this so the
 * host's world and the sync go on while a player is in another tab.
 */
export class WorkerInterval {
  private readonly worker: Worker;
  private readonly scriptUrl: string;

  constructor(intervalMs: number, onTick: () => void) {
    // Plain JavaScript run by the worker, not TypeScript.
    const source: string = `setInterval(() => postMessage(0), ${intervalMs});`;
    this.scriptUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    this.worker = new Worker(this.scriptUrl);
    this.worker.onmessage = (): void => onTick();
  }

  stop(): void {
    this.worker.terminate();
    URL.revokeObjectURL(this.scriptUrl);
  }
}
