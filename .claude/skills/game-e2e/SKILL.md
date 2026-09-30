---
name: game-e2e
description: Play-test Zombie Blaster in real browsers with the Playwright suite in e2e/ (solo, online multi-player, visual sync, chaos/fuzz, network budget, server protocol). Use when adding or changing any gameplay feature, skill, VFX, UI dialog, sync/netcode or server message; when asked to run, extend or debug the game tests; or to reproduce a gameplay bug.
---

# Game E2E (Playwright)

Real Chrome windows play the game through real key presses. A dev-build-only probe
(`window.__zbE2e`) lets tests read engine state and prove what each player sees.

## Commands (repo root)

| What                | Command                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Everything          | `npm run e2e`                                                                                             |
| One area            | `npm run e2e:smoke` · `e2e:solo` · `e2e:online` · `e2e:visual` · `e2e:chaos` · `e2e:net` · `e2e:protocol` |
| Known-bug pins      | `npm run e2e:bugs`                                                                                        |
| One file / one test | `npx playwright test e2e/specs/solo/skills.spec.ts` · `npx playwright test -g "revived"`                  |
| Watch it play       | `npm run e2e:headed` (add `E2E_SLOWMO=100` to slow down)                                                  |
| Report / traces     | `npm run e2e:report` · `npx playwright show-trace e2e/.results/<test>/trace.zip`                          |
| Type-check suite    | `npm run e2e:typecheck`                                                                                   |

The config starts `zombie-blaster-api` (`npm run dev`, :3001) and `ng serve` (:4200), or reuses
running ones. Uses installed Chrome (`E2E_CHANNEL=chrome`); Playwright's Chromium download is
blocked on this machine. Every page runs a 50 tps loop, so workers default to 2 (`E2E_WORKERS`).
Long runs: start them with `run_in_background` and wait for the notification.

**Online / deployed targets:** `E2E_BASE_URL=https://… E2E_WS_URL=wss://… npm run e2e`. No local
servers start. Production builds have no probe, so only tests tagged `@external-safe` run (DOM +
raw protocol). A staging build served in dev mode can set `E2E_EXTERNAL_HAS_PROBE=1` to run all.

## Layout

```
playwright.config.ts          servers, browser channel, reporters, baselines
e2e/support/
  env.ts                      E2E_* switches
  fixtures.ts                 test/expect + `solo(classId)` and `room(members)` fixtures (auto page-error check)
  game-player.ts              GamePlayer: navigation, lobby, keys (KEYS), dropConnection(), attachCanvas()
  probe.ts                    GameProbe: state(), waitFor(desc, pred), vfxLog(), controls (god mode, floor, level, skills, teleport)
  room.ts                     startRoom(): N browsers → lobby → ready → in game, roles verified
  bot.ts                      runBot(): hunts nearest zombie with real keys
  chaos.ts                    runChaos(): seeded key/dialog/resize fuzzer + invariant checks
  invariants.ts               findInvariantViolations(): rules that must always hold
  vfx-gate.ts                 vfxQueuedBy(): VFX events an action queued for other players
  net-monitor.ts              per-page WebSocket frame capture + summary (bytes, rates)
  raw-client.ts               RawClient: hand-crafted server messages (Node WebSocket)
e2e/specs/{smoke,solo,online,protocol}/*.spec.ts
src/app/testing/e2e-api.ts    probe contract (types only, import-free)
src/app/testing/e2e-hooks.ts  probe implementation (attached only when isDevMode())
```

Tags: `@smoke @solo @online @visual @chaos @net @protocol @bug @external-safe`. Run any subset with `--grep`.

## Adding a feature? Add its test (required)

1. Pick the spec by area (new file if it is a new area). Tag it.
2. Drive it like a player: `GamePlayer` keys/clicks. Use probe controls only to set up
   (god mode, floor, level, teleport), never to perform the behavior under test.
3. Assert on probe state (`waitFor` with a description), not on sleeps.
4. Multiplayer-visible? Add an online test: actor acts, observer's probe proves it arrived
   and rendered (see `visual-sync.spec.ts`: `vfxLog()` entries with `direction: 'replayed'`,
   `playerId` = actor, `particlesAdded`/`spriteEffectsAdded` > 0, or `remotePlayers[].animState`).
5. New VFX? Solo gate check with `vfxQueuedBy()` (the event must be queued) + online replay check.
6. New server message? Protocol test: valid path, non-host/non-member rejected, malformed payload.
7. New player/engine state a test needs? Extend `E2eSnapshot` in `e2e-api.ts` and fill it in
   `e2e-hooks.ts` (read-only; plain JSON; keep hooks out of production paths).
8. New UI element: `data-testid` per `.claude/rules/angular.md`; locate by test id.
9. Run the spec and `npm run e2e:typecheck`. Attach evidence (`attachCanvas`, JSON) for visual claims.

## Found a bug?

Per CLAUDE.md, reproduce first: write the failing test, tag `@bug`, and pin it with
`test.fail(true, 'KNOWN BUG: <cause>')`. The suite stays green while the bug exists and turns
red ("unexpected pass") once fixed: then delete the `test.fail` line and the `@bug` tag.
Fix production code only after the repro is agreed.

## Gotchas

- Headless pages still render; `attachCanvas` gives real frames. `KEYS.attack` is `Control`.
- Skills live in slots 1..6 = usable Active/Buff skills sorted by required level
  (`state().usableSkills[].slot`). Ranger/Mage/Priest currently have only passives (tests skip them).
- Particles cap at 400: wait for effects to fade before measuring "effect appeared".
- `vfxQueuedBy` reads the probe VFX log. Events leave the queue as `sent` (multiplayer) or
  `discarded` (solo, drained every tick), so it works in both modes.
- `dropConnection()` closes the app's sockets (init-script tracked) to test reconnect.
- Budgets in `network-budget.spec.ts` are regression guards. Raise them only deliberately.
  Baseline numbers + optimization backlog: `docs/netcode-optimizations.md` (update after netcode changes).
- Chaos failures print their seed; rerun with the same seed to reproduce.
