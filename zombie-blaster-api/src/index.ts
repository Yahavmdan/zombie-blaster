import { GameWebSocketServer } from './ws-server.js';

const PORT: number = parseInt(process.env['PORT'] ?? '3001', 10);

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
