# Zombie Blaster

Browser multiplayer zombie platformer RPG (MapleStory-inspired). Up to 4 players per room over WebSockets.

## Layout

- `src/app/` — Angular 21 frontend (standalone components, signals, Tailwind 4)
  - `engine/` — canvas game engine, split into systems (see `.claude/rules/engine-architecture.md`)
  - `components/`, `pages/`, `services/` — UI, HUD, menus, WebSocket client
- `shared/` — types and constants used by both client and server. Frontend imports `@shared/*`; server imports relative `../../shared/*.js` (tsc doesn't rewrite aliases)
- `zombie-blaster-api/` — Node.js `ws` server (separate `package.json`): lobby, rooms, message relay
- `public/` — sprites, tiles, effects. Root sprite-pack folders are raw source art.

## Multiplayer model

Host-client. The host player's browser runs the full simulation (`GameEngine`: zombies, damage, drops) and sends `game-sync` snapshots every 50 ms. Other clients render those snapshots and send only their own player state (`player-state`) plus requests like `zombie-damage` (sync loop in `src/app/pages/game/game.component.ts`). The server validates and relays messages (e.g. forwards `zombie-damage` to the host) and manages rooms and host migration. It runs no game loop.

## Commands

| What | Command (repo root unless noted) |
|---|---|
| Frontend dev server | `npm start` |
| Tests (Vitest via `@angular/build:unit-test`) | `npm test -- --watch=false` |
| Single spec | `npm test -- --watch=false --include src/app/engine/zombie-system.spec.ts` |
| Frontend build | `npm run build` |
| Server dev (watch) | `cd zombie-blaster-api && npm run dev` |
| Server build | `cd zombie-blaster-api && npm run build` |

No ESLint and no lint script. Prettier is installed, but most existing files aren't formatted yet. Run `npx prettier --write <file>` only on files you create, so diffs stay reviewable. Server has no unit tests; `e2e/specs/protocol` covers it end to end.

Changed `shared/`? It compiles into both apps: run the frontend build and the server build.

New or restyled UI (screen, dialog, HUD element, icon, canvas text)? Use the `pixel-ui` skill. New icons are drawn in `tools/pixel-icons/drafts.mjs` and built with `npm run icons`.

New stage or floor puzzle? Use the `stage-puzzle` skill. Its backlog is `docs/level-puzzle-ideas.md`, and the floor-2 boulder puzzle is the reference implementation.

## Hard rules

- **Explicit types everywhere.** Every `const`/`let`, parameter, return type, class field and callback parameter gets an annotation (`for...of` variables can't; type the iterable). Signals: `readonly x: WritableSignal<T> = signal<T>(...)`. Details: `.claude/rules/explicit-types.md`.
- **No unused** variables, imports or parameters. Remove them; don't keep dead code.
- **Shared types live in `shared/`.** Never duplicate a type between client and server.
- **Game data lives in `shared/game-constants.ts`** (the global variables file). Every tunable number and physical property of a new feature (sizes, speeds, timings, thresholds) goes there, not into the module that uses it. Every body and object has a weight in kg there (`PLAYER_WEIGHT_KG`, `ZOMBIE_TYPES[type].weightKg`, `PROP_WEIGHT_KG`); a new zombie type, prop or other physical thing gets its weight in the same change (helpers: `src/app/engine/weight.ts`). When you add a new kind of data, document it here and in the skill that covers the feature.
- **What you see is what you stand on.** Level art (platforms, ladders, exit, ground) is drawn only from the level layout that physics collides with, never hard-coded in a renderer. Changing art, tiles, layouts or collision requires `level-geometry.spec.ts` + `level-sync.spec.ts` to pass (they compare rendered pixels with collision). Details: `.claude/rules/engine-architecture.md`.
- **Pixel UI kit.** UI is pixel art, not a generic dark dashboard: colours, font sizes and shadows come from `src/styles/tokens.css`, shared pieces from the `.px-*` classes in `src/styles/ui-kit.css` (panel, header, btn, bar, chip, input, overlay). Square corners, hard offset shadows, no blur/glow, sentence-case copy. Icons are `PixelIconId`s (`shared/pixel-icon.ts`) drawn with `<app-pixel-icon>` in templates and `drawPixelIcon` on canvas; never emoji. New icon = a 16x16 grid in `tools/pixel-icons/drafts.mjs`, built into the generated `src/app/ui/pixel-icons.ts` by `npm run icons`. Canvas text uses `pixelFont`/`fillOutlinedText` from `src/app/engine/canvas-text.ts`. `e2e/specs/smoke/ui-style.spec.ts` guards this. Use the `pixel-ui` skill before designing or restyling any UI.
- **Multiplayer VFX gate.** Every visual effect must be seen by all players. Push a `VfxEvent` to `pendingVfxEvents` alongside every local VFX call. Use the `multiplayer-vfx-sync` skill before touching any effect.
- **Host authority.** Zombie state, damage and loot are decided by the host's simulation. Non-host clients own only their own player state; for the shared world they send requests, never results. The server validates every incoming message and never trusts its shape.
- **Every gameplay feature gets E2E coverage.** New or changed mechanics, skills, VFX, dialogs, sync or server messages ship with a spec in `e2e/` in the same change; anything other players should see gets an online test proving they see it. Use the `game-e2e` skill. Details: `.claude/rules/e2e.md`.
- **Repro bugs with tests first.** When asked to repro, change only tests (a failing test that documents the bug; for gameplay, an `e2e/` spec tagged `@bug` and pinned with `test.fail`). Fix production code only after the repro is agreed.
- **Components use `templateUrl` + `styleUrl`**, with co-located `.component.html` and `.component.css`. No inline `template`/`styles`.
- **No new `console.*`** in production code. Existing uses are legacy; don't add more.
- **Rules beat nearby code.** If surrounding code violates a rule, follow the rule, not the local pattern. Before finishing, re-check edited files against these rules.
