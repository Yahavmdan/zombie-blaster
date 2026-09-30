---
paths:
  - "zombie-blaster-api/**"
---

# Game Server (zombie-blaster-api)

Node.js + TypeScript + `ws`. Files: `index.ts` (entry), `ws-server.ts` (transport), `room-manager.ts` / `room.ts` (rooms, up to 4 players).

- Keep game logic separate from transport: message handling in `ws-server.ts`, room/game state in `room*.ts`.
- Validate every incoming message. Never trust client data.
- Server is authoritative for position, HP, damage, loot.
- Message payload types come from `@shared/*` (`../shared`). Never define them locally.
- `async/await` over raw promises/callbacks. Catch rejections in handlers; never send stack traces to clients.
- Config from env vars. No hardcoded secrets.
- Keep dependencies minimal; justify any new one.
- Build check: `cd zombie-blaster-api && npm run build`.
