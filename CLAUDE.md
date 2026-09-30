# Zombie Blaster

Browser multiplayer zombie platformer RPG (MapleStory-inspired). Up to 4 players per room over WebSockets.

## Layout

- `src/app/` — Angular 21 frontend (standalone components, signals, Tailwind 4)
  - `engine/` — canvas game engine, split into systems (see `.claude/rules/engine-architecture.md`)
  - `components/`, `pages/`, `services/` — UI, HUD, menus, WebSocket client
- `shared/` — types and constants used by both client and server, imported as `@shared/*`
- `zombie-blaster-api/` — Node.js `ws` game server (separate `package.json`)
- `public/` — sprites, tiles, effects. Root sprite-pack folders are raw source art.

## Commands

| What | Command (repo root unless noted) |
|---|---|
| Frontend dev server | `npm start` |
| Tests (Vitest via `@angular/build:unit-test`) | `npm test` |
| Frontend build | `npm run build` |
| Server dev (watch) | `cd zombie-blaster-api && npm run dev` |
| Server build | `cd zombie-blaster-api && npm run build` |

No ESLint and no lint script. Prettier is installed (`npx prettier --write <file>`).

## Hard rules

- **Explicit types everywhere.** Every `const`/`let`, parameter, return type, class field, callback parameter and loop variable gets an annotation. Signals: `readonly x: WritableSignal<T> = signal<T>(...)`. Details: `.claude/rules/explicit-types.md`.
- **No unused** variables, imports or parameters. Remove them; don't keep dead code.
- **Shared types live in `shared/`.** Never duplicate a type between client and server.
- **Multiplayer VFX gate.** Every visual effect must be seen by all players. Push a `VfxEvent` to `pendingVfxEvents` alongside every local VFX call. Use the `multiplayer-vfx-sync` skill before touching any effect.
- **Server authority.** Never trust client-computed damage, loot or position.
- **Repro bugs with tests first.** When asked to repro, change only tests (a failing test that documents the bug). Fix production code only after the repro is agreed.
- **Components use `templateUrl` + `styleUrl`**, with co-located `.component.html` and `.component.css`. No inline `template`/`styles`.
- **No new `console.*`** in production code. Existing uses are legacy; don't add more.
- **Rules beat nearby code.** If surrounding code violates a rule, follow the rule, not the local pattern. Before finishing, re-check edited files against these rules.
