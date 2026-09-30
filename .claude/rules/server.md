---
paths:
  - "zombie-blaster-api/**"
---

# Game Server (zombie-blaster-api)

Node.js + TypeScript + `ws`. Files in `src/`: `index.ts` (entry), `ws-server.ts` (transport + message handlers), `room-manager.ts` / `room.ts` (rooms, up to 4 players, host migration).

The server is a lobby + relay. It runs no game loop: the host client simulates, the server routes messages (`game-sync` to room, `zombie-damage` to host, ...). See "Multiplayer model" in `CLAUDE.md`.

- Keep room/state logic in `room*.ts`; message parsing and routing in `ws-server.ts`.
- Validate every incoming message (type + payload shape). Never trust client data.
- Message payload types come from `shared/`. Import them relatively with a `.js` extension: `import type { RoomInfo } from '../../shared/multiplayer.js';`. Don't use `@shared/*` here: `tsc` doesn't rewrite path aliases, so it breaks at runtime.
- `async/await` over raw promises/callbacks. Catch rejections in handlers; never send stack traces to clients.
- Config from env vars. No hardcoded secrets.
- Keep dependencies minimal; justify any new one.
- No tests exist yet. Verify with `cd zombie-blaster-api && npm run build`.
