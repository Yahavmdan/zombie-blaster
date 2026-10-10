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

**In a worktree, use its own ports** or Playwright reuses another slot's servers and silently tests
THEIR code. Worktree N uses WEB_PORT=N*1111, API_PORT=N*1111+1 (`.claude\skills\worktrees\wt.ps1 ports`):
`$env:WEB_PORT=2224; $env:API_PORT=2223; npm run e2e:solo` (slot 2; 2222 is reserved here) - the config starts (or reuses) the API on
API_PORT and `ng serve --port WEB_PORT`, whose `/ws` proxies to API_PORT (`proxy.conf.mjs`). Kill both after.
Canvas attachments land in `e2e/.report/data/*.png` (not `e2e/.results`).

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
  brain.ts                    Brain: plays well (potions, flee, revive, kite, loot, shop, spend points, exit pile)
  navigation.ts               level map + route planner (walk, jump up, climb ropes, drop down)
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

- Zombies: melee reach 35 px, attack cooldown 40–70 ticks. Every melee swing is telegraphed: a
  15-tick wind-up (big pulsing "!" over the head, no body glow; `windingUp` in the probe) before the swing, ~0.5 s total.
  At most 2 zombies swing at one player at once (attack tokens). Damage ramps from 40% on floor 1
  to full by floor 5. Zombies only chase players within 640 px (`ZOMBIE_DETECTION_RANGE`);
  nobody is waiting for them at the exit (no lure, spawns spread over the map).
  Types by floor: runners from 2, tanks from 3, spitters from 4, a boss on floors 5/10/15...
  (4% per spawn), the dragon on 10/20... (2%), one boss at a time. Natural spawns are too slow
  for rare types: `probe.spawnRolledZombies(n)` runs the real spawn roll n times now (no timer,
  no alive cap); `setFloor` clears them. `state().zombieProjectiles` {spitter, dragon} counts
  shots in flight. Spec: `solo/zombie-types.spec.ts`.
- **Eaters** (crawl on all fours, art from `generate-eater-sprites.cjs`) never come with the regular
  spawns: from floor 1, while >= 3 lying unclaimed corpses exist, one rises every 10-20 s (max 2
  per player) near a corpse, smells corpses across the whole screen, runs to them (3.5x speed,
  steering every tick; each claims its corpse, so two Eaters split up) and eats each in 2 s (100
  ticks, then the corpse is gone). Corpses on ledges: it jumps (~144 px, other zombies ~90) up
  through the ledge overhead or leaps from a ledge's end, ledge by ledge (`eater-path.ts`); on a head
  or a pile it steps off toward a lower goal (only platforms are dropped through) and it never rides
  other zombies. Never food (`eater-meals.ts`): the pile under the exit, the floor-3 scale, the floor-5
  plate, the safe spot; piles are eaten from the top. Drop test meals with `mealGroundX` (clear of
  the exit column), not `openGroundX`. With corpses
  around they bite a player in reach only rarely (0.4%/tick, never mid-meal). With **no corpse
  left they turn hungry**: run at the nearest player or zombie (not Eaters, not the dragon) and
  attack like any zombie; bites on zombies knock back, show red hit effects (VFX log `color`
  `#b02a22`, replayed for guests) and a kill leaves a corpse (no XP/loot): the next meal. Probe:
  `zombies[].type === 'eater'`, `eating`, `animState` (`eating`, `run`, ...). Lab:
  `npm run e2e:lab -- -g eater` (stuck spells, meals, puzzle side effects, host/guest). Rest players on the safe spot so a hungry Eater only has zombies to hunt.
  Specs: `solo/eater.spec.ts`, `online/eater-coop.spec.ts`.
- Player: 90 ticks (1.8 s) invincible after a hit; move speed 3 (faster than most zombies).
- Potions: key 7 (HP +50) / 8 (MP +30), 30-tick cooldown, start with 3 each, 30/20 gold.
  Auto-potion needs the class's auto-potion passive; without it nothing drinks for you.
  Dev builds start with 1,000,000 gold (`game-state.service.ts`), prod with 0.
  Setup: `probe.setGold(n)` (shop budget), `probe.setVitals(hp, mp)` (hurt/drained; set them
  healthy BEFORE `maxAllSkills`, or the freshly learned auto-potion drinks in the gap).
  Specs: `solo/shop.spec.ts` (buy, qty, no gold), `solo/passives.spec.ts` (every class's
  auto-potion, warrior HP recovery: +50 per 10 s standing still, none while hopping).
- Menus (stats/skills/shop) do NOT pause the game and give NO damage reduction: open them only when
  no zombie is within ~200 px, or rest on the safe spot first.
- Revive: hold F within 60 px for 100 ticks (2 s); a hit cancels it; the downed player's bleed-out
  timer pauses while someone channels (`revivingPlayerId` on the reviver's state).
- **Safe spot**: every floor has one high ledge (y 230, 5 tiles, `Platform.safe`) with its own ladder,
  on the far side from the exit (`state().level.safeSpot`; also in `level.platforms`/`ropes`, so
  `stepToward` routes to it). Resting there (`restingPlayerIds`): zombies don't target, hit or land
  on you (spitter/dragon shots too), and you can't attack or use Active skills (buffs work).
  Zombies wander when everyone rests. Climbing there is the "earned" part: the ladder is exposed.
- Skills unlock with skill points (3 per level); warrior power-strike and assassin lucky-seven
  are level-1 skills. Ranger/Mage/Priest still have no active skills.
- Controls: attack is J or left mouse (Ctrl is unbound, all game keys preventDefault). Mouse buttons are
  bindings like keys (`mouseleft`/`mousemiddle`/`mouseright`/`mouseback`/`mouseforward`, presses count on the
  canvas only); quick slots 9-12 sit on RMB/MMB/M4/M5, empty. `solo/mouse-controls.spec.ts` drags a
  skill/potion onto the settings mouse and clicks the canvas with `page.mouse`. Air control, coyote
  time (5 ticks), variable jump (release early = short hop), apex hang. Only Space jumps;
  held Space hops again on every landing. W/up never jumps: it grabs a ladder (from the
  floor too) and climbs. A test that holds jump past landing gets extra hops. On ropes: left/right
  turns, jump alone does nothing, direction + jump lets go, climbing past the top dismounts.
- **Levels are generated per floor** (`level-generator.ts`, seed from the host): never hard-code
  platform/rope coordinates in tests. Read them from `state().level` (`levelPlatforms(s)`,
  `levelRopes(s)`, `goToFloorWhere(player, 'a rope', pred)`), or pin a layout with
  `probe.setLayoutSeed(n)` (solo/host). Tiers at y 530 / 430 / 330; ropes only where the layout
  has them (floor 1 may have none, later floors always have one). Props (`state().level.props`) are
  solid: you stand on them; walking into one up to 26 px tall steps you onto it, a stack (or
  taller) blocks (the Brain hops when a held direction stalls). Barrels and boxes are `pickable`:
  their entry has the game-state `id`, current x/y, `isGrounded`, `carrierId`. Find a test layout
  with `layoutWhere(player, desc, pred)` (navigation.ts: loops `setLayoutSeed`); prop helpers in
  `support/props.ts` (`pickableOnGround`, `standLeftOf`). Specs: `solo/props.spec.ts`,
  `online/props-coop.spec.ts`.
- **Visual == collision:** `probe.geometryReport()` measures the drawn level pixels against the
  collision data; `expectArtMatchesCollision` (support/level-geometry.ts) asserts it. Any art/layout
  change must keep `level-geometry.spec` and `level-sync.spec` green. Look at their floor screenshots.
- Floor exit: hangs out of jump reach (y 310 on floor 1 solo, 12 px higher per floor, 64 px higher
  per extra player, min y 150) at the left or right screen edge (the layout picks). No double jump
  from the ground or any platform reaches it (`exit.spec` checks floors 1–4). The way up is the
  pile of the dead under it, and it is **ordinary**: corpses there behave exactly like anywhere else
  (5 px per body, narrow 0.55-width footholds, death fling kept, never fade). Floor 1 solo needs
  ~40+ bodies landing under the exit. Walking into a pile lifts you (corpse snap 10 px > 5 px step),
  so a tall enough pile is climbed by walking into it and jumping. `exitPile` (probe-computed from
  corpse footholds over the exit span): bodies, topY, reachY, reachable.
  `probe.dropCorpses(x, n)` drops n corpses from above x for setup; they pile by normal physics.
- **Floor 2 is the boulder puzzle**: the exit platform is the boulder's ledge (mid-screen, same
  height rules, climbed by the corpse pile: `exitPile` works as usual), but standing on it does not
  finish the floor. A small solid gate on its downhill edge holds the boulder; 3 hits (attack while
  beside the gate or the boulder resting against it, facing it, feet on the ledge) break it, the
  boulder rolls down a boulder-only chute, breaks the full-height wall at the screen edge and
  shatters. Walk into the opening on the ground to finish. Probe: `state().puzzle` (wall, wallDir,
  ledge, gate, gateHits/gateHitsNeeded, boulder box or null, progress/pathLength/speed, wallBroken,
  wallStanding); null on other floors. Specs: `solo/boulder-puzzle.spec.ts` (Brain climbs the
  pile, then hold attack at the gate), `online/boulder-puzzle-coop.spec.ts`. The Brain climbs to the
  ledge but has no gate/wall goal yet: AI players stall on floor 2.
- **Floor 3 is the spring puzzle**: the exit hangs at y 100 (no pile reaches it) straight over a
  solid spring block at the screen edge (`spring.spring`, `side`). A scale's pan lies in the ground
  on the far half (`spring.scale`, top = ground). The host weighs it (`scaleKg` /
  `scaleKgNeeded`, 1000 kg; synced): lying corpses by zombie type, props, standing zombies, players
  plus what they carry. While loaded the cable raises the button beside the spring's open side
  (`button`, `buttonTicks` up to `buttonRiseTicks`, 200 ticks); it sinks back as slowly when the
  weight goes. Attacking the fully raised button (facing it) starts a 3-2-1 (`countdownTicks`),
  then everyone standing on the spring flies straight up onto the exit (`launches`,
  `bounceTicks`); corpses lying on the spring scatter, the scale's load stays. A sunk button does
  nothing. `probe.dropCorpses(scale center, n)` loads it (walker 70 kg: ~15). Don't teleport
  above the exit to get on the spring: you land on the exit. Specs: `solo/spring-puzzle.spec.ts`,
  `online/spring-puzzle-coop.spec.ts`. The Brain has no spring goal yet: AI players stall on floor 3.
- **Floor 4 is the hanging-cage puzzle** (`state().cages`): `cages[]`, [0] the exit cage under the
  exit (`exit: true`), the rest mid-screen. Each has `content` (zombies / loot / empty: hidden from
  players, visible to tests), `box` (as drawn, null once a mid cage smashed), `solid` (collision:
  hanging, or the exit cage once landed; null while falling), `landY`, `cleat` (on a regular
  ledge, never the safe spot: no swinging there), `cleatHits` / `hitsNeeded`, `cut`, `fallTicks`,
  `landed`; `zombiesPerCage`. Face the cleat, teleport beside it on its surface, hold attack (only
  the faced cleat is hit). Once the
  exit cage landed, `exitPile.baseY` is its top, so `dropCorpses(exitPile.centerX)` builds the pile
  on it; the Brain hops onto the cage first (`climbPile`). Specs: `solo/cage-puzzle.spec.ts`,
  `online/cage-puzzle-coop.spec.ts`. The Brain has no cleat goal: AI players only climb normally.
- **Floor 5 is the pressure plate** (`state().plate`): `box` (the strip set into its ledge's top;
  feet on `box.y` stand on it), `weight` (lying corpses 1 each, a standing player `playerWeight`),
  `needed`, `held`, `doorTicks`, `doorOpen` (only a fully open door lets players out) and `door`
  (the barred door standing on the exit). Stand on it (teleport) or carry corpses onto it (drop
  one with `dropCorpses`, teleport to it, `KEYS.carry`, teleport beside the plate facing it,
  `KEYS.attack` to throw: E beside corpses on the plate picks one up). Zombies kick corpses off it, so carry until `held`. Specs:
  `solo/plate-puzzle.spec.ts`, `online/plate-puzzle-coop.spec.ts`. The Brain has no plate goal.
- After `teleport`, `isGrounded` can still read true from before: wait for the feet to reach the
  surface, not just `isGrounded`.
- A failure "dev server shows a compile error overlay" right after editing source is usually the
  reused dev server catching a half-saved edit: check `npm run build`, then rerun the spec.
- Monster magnet (warrior) drags zombies, it doesn't teleport them: each braces ~3 ticks per
  100 px, then flies along a lifted, accelerating arc to the caster's spot (12–40 ticks). The host
  simulates it (`magnet-pull.ts`); `zombies[].magnetPull` in the probe is null / 0 (bracing) /
  0..1 (dragging). Pulled zombies ignore knockback. Great for piling bodies under the exit.

Driving tips:

- Hold keys for >= 60 ms (`player.press(key, 70)`). A bare `keyboard.press` can fall between two
  20 ms engine ticks and never register (the potion key silently failed this way).
- Count kills as "zombie ids ever seen minus alive now"; the client zombie list flickers.
- Menus: after the open key, wait for the component to render before clicking or pressing
  Escape (`Brain.withMenu`). Escape sent too early hits nothing, the menu appears afterwards
  and blocks all input while zombies keep hitting. `closeStrayDialogs` logs any leak.
- Skill points: 1 point in every active first, then auto-potion to 3, then damage skills.
  (All-in on auto-potion left the AI with zero active skills for a whole game.)
- Exit goal (`goal: 'exit'`): `navigation.ts` walks/jumps/climbs ropes to a platform; on the
  ground under the exit, stay inside the column (melee: far side facing the horde; ranged: center)
  and fight anything in reach so bodies land under the exit; no dash there (monster-magnet pull is
  great: it drags zombies in). Standing on the growing pile counts as being at the base.
  A killing blow knocks the zombie back before it dies, so its body lands ~100 px beyond it, away
  from the killer: the Brain waits with its back to the wall under the exit and strikes only
  zombies within `PILE_STRIKE_PX` (80), no skills (they kill far away and pile bodies elsewhere).
  Climbing (`Brain.climbPile`): walk to the highest foothold (the pile lifts you), then jump.
  Align with `walkTo` (closed loop: hold, poll x, release early for the slide). Fixed-length
  taps oscillated ±40 px forever once the player was fast (maxed stats, super speed).
  - Hold jump until the apex (`fullJump`, polls `velocityY`). A fixed 240 ms press is cut short by
    variable jump height when parallel workers drop frames: passes alone, fails in the suite.
  - A ready pile beats `escapeSurround`: running from the crowd walked the bot onto a ladder.
  - Always validate exit/climb specs with `--workers=5` (plus fairness specs) to reproduce suite load.
  - The brain restocks MP potions (5) for classes with skills; the game has no MP regen.
- Special drops open a prompt with a timer; the brain presses Y. Its keys are the bindable `confirmDrop` / `declineDrop` actions (Y / N by default), answered with the stats/skills/shop/inventory open too; a key the player bound to another action keeps that action. A downed player neither picks up nor pulls drops, and an open prompt's drop goes back into the world when they go down. Setup: `probe.spawnDrop(type, x, y, specialType)` (on the player: the magnet pulls it in) and `probe.knockOut()` (lethal hit through the normal path: downed online). Specs: `solo/buffs-and-drops.spec.ts`, `online/downed-edge-cases.spec.ts`.
- Buffs on derived stats (Hyper Body max HP/MP, Claw Mastery crit) apply at once: the engine recomputes `derived` when a buff starts or ends (`engine/derived-stats.ts`) and owns `activeBuffs`; `syncProgression` keeps them. `state().player.critRate`, `maxHp`, `maxMp` show it. A maxed-out assassin already sits at the crit cap (60): test crit buffs on a low-level one.
- **Exploding barrels**: an attack on a lying barrel (beside it, facing it, within 24 px, level
  with it; any player, the host decides) lights its fuse: `level.props[].fuseTicks` counts 150
  ticks (3 s, "3-2-1" over it), then it blows up: `exploded: true`, gone from the world and
  collision (`pickable: false`), zombies whose center is within 110 px lose 60% max HP (bosses
  10%) and fly away, barrels in reach go up 12 ticks later (chain). 500 ticks (10 s) after the
  blast it is back on its spawn spot, unlit (`exploded: false`); it waits while a player or prop
  stands there. A lit barrel can still be carried and thrown. Boxes never light. Every floor has
  5-10 barrels (generator places them first; on crowded floors, e.g. cages, the last ones may
  sit under a ledge, where nobody can stand on them). VFX: `hit-particles` on lighting,
  `barrel-blast` (animated fireball/shockwave in `engine.barrelBlasts`, scorch mark, sprite
  `sunburn` + `brightfire` flames; solo hit-stop) and `barrel-respawn` (dust puff), all
  replayed for guests. Tunables `BARREL_*` in game-constants. With this many barrels no layout
  leaves a wide span free of props: a test that needs E to find only corpses clears the span
  first with `clearPickablesBetween(host, observers, from, to)` (probe `clearPickables`, synced,
  no respawn) instead of searching layouts. Find one with
  `pickableOnGround(s, isBarrel)` (support/props.ts). Specs: `solo/exploding-barrel.spec.ts`,
  `online/exploding-barrel-coop.spec.ts`.
- **Carrying corpses (and barrels/boxes)**: `KEYS.carry` (E) picks up the nearest lying corpse or pickable prop within 50 px
  (center to center; a "[E] Carry" prompt shows over it) and stacks it overhead, up to 3
  (`CORPSE_CARRY_MAX`, 5 px per level: bodies rest on each other). E with nothing more to pick up (or a full stack; prompt
  "[E] Throw") tosses the whole stack forward and it lands as a pile (each body's `footY` 5 px
  above the one below). `KEYS.attack` always throws while carrying: use it next to a pile, where E
  would pick up another body instead. While carrying: 0.75x walk speed, no attacks or skills. The
  request is the player's own state (`player.carryingCorpseIds`, bottom first); the host grants
  each as `corpseViews[].carrierId` (first come; a down carrier drops the stack). Carried bodies sway (drawing only, box unchanged): `corpseViews[].carryPose` {bob, sag, tilt} eases each tick toward `carrySway(carrier, level)` (bob per footfall by distance walked, droop at the ends, rock; in the air pressed down going up). Specs: `solo/corpse-carry.spec.ts`, `online/corpse-carry-coop.spec.ts`.
  Piles drape (drawing only): `corpseViews[].drape` is a lying body's deepest sag (px) onto what is under it, 0 flat on the ground; host and guests compute the same. `openGroundX(s, span)` (navigation.ts) finds ground with nothing above it for a pile. Specs: `solo/corpse-drape.spec.ts`, `online/corpse-drape-sync.spec.ts`.
  Setup: `dropCorpses(x, 1)`, then teleport the player onto the corpse's own spot (feet =
  `footY + 5`). Dropped corpses often land on a platform edge, so "stand 30 px beside it" flakes.

Running demos/visual checks:

- `npm run e2e:demo` saves both canvases every `DEMO_COMPARE_EVERY_S` (45 s) to
  `e2e/.results/demo/compare-NN-<player>.png` and logs `worldDifferences` (floor, zombie ids,
  corpse count, corpse pose/facing). Read a pair of PNGs yourself now and then: humans spot what
  the numbers miss (the corpse pose bug and the Ctrl+A text selection were both seen this way).
- Every Playwright run wipes `e2e/.results/` (demo PNGs included). Look at or copy the compare
  PNGs before running any other test.
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

- Headless pages still render; `attachCanvas` gives real frames. `KEYS.attack` is `j`.
- `attachCanvas` images live only in the HTML report: `--reporter=line` drops them, and
  `--reporter=html` writes a stray `playwright-report/` (delete it). Run with no `--reporter`
  flag (config: list + html into `e2e/.report/data/*.png`). To eyeball small art (carried corpses), a throwaway spec can `page.screenshot({ path, clip })` around `state().player` and you upscale the crop (System.Drawing, NearestNeighbor); delete the spec after.
- Physics gotcha: tiny velocities snap to 0 (`PLAYER_MIN_VELOCITY`); any per-tick acceleration
  smaller than that must skip the snap (air control was silently dead until fixed).
- Skills live in slots 1..6 = usable Active/Buff skills sorted by required level
  (`state().usableSkills[].slot`). Ranger/Mage/Priest currently have only passives (tests skip them).
- Particles cap at 400: wait for effects to fade before measuring "effect appeared".
- Probe setup helpers that inject entities (`dropCorpses`) must also register sprite instances
  (`setState`/`setFinalFrame`), or the entities are invisible in screenshots while physics still works.
- Look at the attached "pile built" canvas after exit changes: numbers can pass while the art is wrong.
- Unit-test engine mocks (`zombie-system.spec.ts`, `multiplayer-sync.spec.ts`) must gain every new
  animator method; a missing one throws only on a random branch and looks like a flake.
- `vfxQueuedBy` reads the probe VFX log. Events leave the queue as `sent` (multiplayer) or
  `discarded` (solo, drained every tick), so it works in both modes.
- The lab config (`e2e/lab/playwright.lab.config.ts`) always reuses whatever answers on 4200/3001,
  which may be another worktree's server or a dev server serving stale code (an old run once
  "measured" bugs that were already fixed). Start your own: API `PORT=5551 npm run dev` (the server
  reads `PORT`, not `API_PORT`) and `API_PORT=5551 npx ng serve --port 5550`, then run the lab with
  `WEB_PORT=5550 API_PORT=5551`. Stopping the background shell can leave the node processes
  listening: check the ports and kill them after.
- Worktree slot: ports 4200/3001 may belong to the primary checkout. Run the slot's frontend on
  another port (`npx ng serve --port 4210`) and point the suite at it with
  `E2E_BASE_URL=http://localhost:4210 E2E_EXTERNAL_HAS_PROBE=1` (online specs use whatever API
  listens on 3001; the frontend wsUrl is fixed). An API in watch mode restarting shows up as a
  disabled lobby CREATE button: retry.
- Background tabs: Playwright keeps every page visible (new tab, minimize, removing the
  anti-throttling launch flags, raw Chrome over CDP: all still `visible`, rAF at full speed).
  `player.setBackgroundTab(true/false)` emulates Chrome instead (init script): window blur,
  `document.hidden` + `visibilitychange`, rAF parked, page timers capped at 1/s; worker timers
  untouched. Online, the engine ticks from a `WorkerInterval` while hidden and the sync timer is
  always one; solo pauses. Specs: `online/background-host.spec.ts`, `solo/background-tab.spec.ts`.
- Key bindings and quick slots persist in localStorage (`zb.keyBindings`, `zb.quickSlots`); every Playwright context starts empty, so tests still see defaults. A new character keeps them (only another class's skills leave the quick slots).
- A multiplayer tab saves its game to sessionStorage on `pagehide` (`SessionResumeService`); `page.reload()` resumes the same player through the server's reconnect window (role follows `reconnect-result`). Settings has a two-click "Quit to menu" (`game-settings-button-quit`). A co-op player who died respawns on the next floor (`FLOOR_RESPAWN_HP_PERCENT`). Specs: `solo/session-and-settings.spec.ts`, `online/resilience.spec.ts`.
- Co-op death: `knockOut()` each player (god mode on the survivor until its turn); each bleeds out in 30 s (`downTimer` from 1500) and the game-over screen shows on every screen only once all are dead: `online/bleed-out.spec.ts` (~80 s per test). Guest leaving / host migration with 3 players: `online/three-player-room.spec.ts` (`net.reset()` before the drop: frame payloads are kept for the first 5000 frames only), lobby guest leave in `online/lobby.spec.ts`, raw leave/migration in `protocol/server-edge-cases.spec.ts`.
- Playwright never sends `KeyboardEvent.repeat`; to test a held key, dispatch `new KeyboardEvent('keydown', { key, repeat: true })` on `window`. Panel keys and prompt answers ignore repeats.
- Integer rolls use `randomInt(min, max)` from `shared/random.ts` (both ends included).
- `dropConnection()` closes the app's sockets (init-script tracked) to test reconnect. A resumed session keeps its player id, and the client follows the role in `reconnect-result` / `room-updated` (a host that dropped while the room migrated comes back as a guest). Leaving the game page disconnects the socket and clears the session. `probe.showGameOver()` opens the game-over screen to test its buttons.
- Budgets in `network-budget.spec.ts` are regression guards. Raise them only deliberately.
  Baseline numbers + optimization backlog: `docs/netcode-optimizations.md` (update after netcode changes).
- Chaos failures print their seed; rerun with the same seed to reproduce.
- God mode makes skills free (no MP/HP cost): a test that measures MP spent must leave it off.
- Full suite: ~15 min at 2 workers (155 tests). Under that load `cage-puzzle` "cut the other chains",
  `exit` "zombies slain under the exit pile up" and `movement` "air control" have failed and then
  passed alone: rerun a failure alone before calling it a bug.
- A `test.fail` pin can fail for the wrong reason (wrong message name, god mode, a setup timeout).
  Before trusting one, read why it failed: `--grep @bug --reporter=json` and print each
  `results[].errors[0].message`.
  Pins that need something to happen by chance (a zombie swing) must loop until it happens with a
  generous deadline, or they "unexpectedly pass" under load. Timer pins: check the arithmetic of
  every window involved (the 60 s room timer pin first failed on the *second* window expiring).
- Never start a second `playwright test` in the same slot while one runs: each run wipes
  `e2e/.results`, and the other run then fails with trace ENOENT and stray console errors.
- Shop test ids use the shop item id, which is `shop-` + the potion id
  (`shop-item-button-buy-shop-hp-potion-2`, `shop-item-input-qty-shop-hp-potion-1`).
- Edge-case sweep (2026-10-10) pins: `protocol/server-gaps.spec.ts`, `solo/edge-sweep.spec.ts`,
  `solo/ui-sweep.spec.ts`, `online/edge-sweep-coop.spec.ts`, unit `engine/skill-level-data.spec.ts`.
- Protocol edge cases (reconnect twice, reconnect from another room, repeat start, guest revive,
  full room): `protocol/server-edge-cases.spec.ts`. UI edge cases: `solo/ui-edge-cases.spec.ts`.
- A room whose last player drops stays open (hidden from `room-list`) for the 60 s reconnect
  window; the first player back becomes host. Only `leave-room` deletes an empty room at once.
- Dialog keys (P/O/B/I) work while a dialog is open: the same key closes it, another switches. They do
  nothing while settings or the game-over screen show. Rebinding a key takes it from its old action.
  Settings keyboard: click `game-settings-key-<key>` then an action chip (`game-settings-action-<action>`,
  Clear = `game-settings-action-clear`), right-click a key clears it, `game-settings-button-reset`
  restores (and saves) the defaults. Spec: `solo/settings-keys.spec.ts`.
  "Try again" keeps bindings and quick slots; a quick-slot potion obeys the potion cooldown.
