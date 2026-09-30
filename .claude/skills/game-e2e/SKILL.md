---
name: game-e2e
description: Play-test Zombie Blaster in real browsers with the Playwright suite in e2e/ (solo, online multi-player, visual sync, chaos/fuzz, network budget, server protocol) and watch AI players play co-op (npm run e2e:demo). Use when adding or changing any gameplay feature, skill, VFX, UI dialog, sync/netcode or server message; when asked to run, extend or debug the game tests; to reproduce a gameplay bug; or when asked to play the game or make the AI players better.
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
| Playtest lab        | `npm run e2e:lab` (design experiments → `e2e/.results/lab/findings.jsonl` + PNGs; `-- -g rope`)           |
| Watch AI co-op      | `npm run e2e:demo` (2 windows side by side, ports 4200+4201; `DEMO_MINUTES`, `DEMO_HOST_CLASS`)           |
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
  bot.ts                      runBot(): simple "hunt nearest zombie" (tests only need hits/kills)
  brain.ts                    Brain: plays well (potions, flee, revive, kite, loot, shop, spend points)
  chaos.ts                    runChaos(): seeded key/dialog/resize fuzzer + invariant checks
  invariants.ts               findInvariantViolations(): rules that must always hold
  vfx-gate.ts                 vfxQueuedBy(): VFX events an action queued for other players
  net-monitor.ts              per-page WebSocket frame capture + summary (bytes, rates)
  raw-client.ts               RawClient: hand-crafted server messages (Node WebSocket)
e2e/specs/{smoke,solo,online,protocol}/*.spec.ts
e2e/demo/                     watchable demos (own config, headed, not in the suite)
e2e/lab/                      playtest lab: measurements that answer design questions (own config)
docs/playtest-feedback.md     latest design findings + prioritized improvements (update after each lab run)
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

## Playing well (Brain) — learned the hard way

Mechanics that matter (verify in shared/game-constants.ts if changed):

- Zombies: melee reach 35 px, attack cooldown 40–70 ticks, hit lands 6 ticks into a 12-tick swing,
  floor-1 hits deal 24–85. A crowd kills a level-1 assassin (120 HP) in one burst.
- Player: 90 ticks (1.8 s) invincible after a hit; move speed 3 (faster than most zombies).
- Potions: key 7 (HP +50) / 8 (MP +30), 30-tick cooldown, start with 3 each, 30/20 gold.
  Auto-potion needs the class's auto-potion passive; without it nothing drinks for you.
  Dev builds start with 1,000,000 gold (`game-state.service.ts`), prod with 0.
- Menus (stats/skills/shop) do NOT pause the game: open them only when no zombie is within ~200 px.
- Revive: hold F within 60 px for 150 ticks (3 s); any hit cancels. Downed window 1500 ticks.
- Skills unlock with skill points (3 per level) and required levels (warrior slot 1 at level 3).
- Floors never end by killing: zombies spawn forever and a floor completes only when a player
  stands on the EXIT platform (y 130, x moves per floor). Its rope was removed ("deleted test
  rope"), so it is reachable only by double jump / low gravity / zombie piles. The brain does
  not climb yet, so demos stay on floor 1.

Driving tips:

- Hold keys for >= 60 ms (`player.press(key, 70)`). A bare `keyboard.press` can fall between two
  20 ms engine ticks and never register (the potion key silently failed this way).
- Count kills as "zombie ids ever seen minus alive now"; the client zombie list flickers.
- Menus: after the open key, wait for the component to render before clicking or pressing
  Escape (`Brain.withMenu`). Escape sent too early hits nothing, the menu appears afterwards
  and blocks all input while zombies keep hitting. `closeStrayDialogs` logs any leak.
- Skill points: auto-potion passive first (it drinks for you), then damage actives, then buffs.
- Special drops open a Y/N prompt with a timer; the brain presses Y.

Running demos/visual checks:

- `npm run e2e:demo` saves both canvases every `DEMO_COMPARE_EVERY_S` (45 s) to
  `e2e/.results/demo/compare-NN-<player>.png` and logs `worldDifferences` (floor, zombie ids,
  corpse count, corpse pose/facing). Read a pair of PNGs yourself now and then: humans spot what
  the numbers miss (the corpse pose bug and the Ctrl+A text selection were both seen this way).
- Never edit `src/` while a demo or e2e run is live: the dev servers hot-reload the pages and
  the run dies with "Execution context was destroyed".
- A dev server that compiled a half-saved edit shows an error overlay that eats every click;
  `GamePlayer.gotoMenu` now fails fast with its text. Fix: touch/re-save the file.
- When the user watches, run servers on 4200 + 4201 and use `placeWindow` so the two windows sit
  side by side in front of the IDE (verify z-order with a quick PowerShell window list, no screenshot).
- Drink early (< 55 % or when adjacent zombies could burst you), keep ~10 potions, flee with
  hysteresis (resume above 45 %), clear zombies off a downed teammate before channeling a revive.
- Tune by watching `npm run e2e:demo` logs (kills, drank, fled, revived, downs per player).

## Playtesting for design feedback

When the user asks to "play the game", the goal is to find ways to improve it, not only to win:

1. Run `npm run e2e:demo` (watchable) and `npm run e2e:lab` (measurements). Look at saved PNGs.
2. Try the whole feature surface: skills (level up / `maxOutPlayer`), shop, stats, settings,
   ropes, platforms, reaching the exit, revives, special drops, idling (AFK spots).
3. Compare against game-feel principles (summary + sources in `docs/playtest-feedback.md`):
   coyote time ~100 ms, jump buffer, variable jump, hit-stop 35–90 ms, trauma screen shake,
   hit flash, 0.4–0.6 s enemy telegraphs, attack tokens, early attack skill, visible buffs.
4. Write findings with numbers + a suggested fix into `docs/playtest-feedback.md`; propose, don't
   silently change game design. Real bugs follow the repro-first rule.
5. Add a lab experiment for every new question so it can be re-measured later.

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
