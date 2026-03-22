import { GameWebSocketServer } from './ws-server.js';

const PORT: number = parseInt(process.env['PORT'] ?? '3001', 10);

console.log(`[Boot] PORT=${PORT}, NODE_ENV=${process.env['NODE_ENV'] ?? 'unset'}`);

process.on('uncaughtException', (err: Error): void => {
  console.error('[Fatal] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason: unknown): void => {
  console.error('[Fatal] Unhandled rejection:', reason);
});

const server: GameWebSocketServer = new GameWebSocketServer(PORT);

const FORCE_EXIT_MS: number = 15_000;

process.on('SIGINT', (): void => {
  console.log('\n[Server] Graceful shutdown requested (SIGINT)...');
  server.shutdown();
  setTimeout((): void => process.exit(0), FORCE_EXIT_MS);
});

process.on('SIGTERM', (): void => {
  console.log('[Server] Graceful shutdown requested (SIGTERM)...');
  server.shutdown();
  setTimeout((): void => process.exit(0), FORCE_EXIT_MS);
});
