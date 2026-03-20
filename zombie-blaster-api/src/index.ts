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

process.on('SIGINT', (): void => {
  console.log('\n[Server] Shutting down...');
  server.shutdown();
  process.exit(0);
});

process.on('SIGTERM', (): void => {
  server.shutdown();
  process.exit(0);
});
