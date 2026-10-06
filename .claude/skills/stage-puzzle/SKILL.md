---
name: stage-puzzle
description: Build a new stage/level puzzle for Zombie Blaster (a floor that needs more than "kill zombies, climb the pile, reach the exit"), or brainstorm, change or extend one. Holds the puzzle backlog (docs/level-puzzle-ideas.md), the proven architecture from the floor-2 boulder puzzle, the multiplayer rules, the test recipe and the pitfalls already hit. Use when the user asks for a new stage, level, floor puzzle, obstacle, or picks an idea from the checklist.
---

# Stage puzzles

Every floor should feel different. The floor-2 **boulder puzzle** is the reference
implementation: copy its shape. The floor-3 **spring** (`spring-puzzle.ts`,
`spring-puzzle-system.ts`) is the second one: a solid moving part, a countdown, a player-affecting effect
on guests, and state derived from synced corpses. It started as a seesaw; after playtesting the
user wanted a big spring, a 3-2-1 to get on, 30 corpses and the exit at the very top. The floor-4 **hanging cages**
(`cage-puzzle.ts`, `cage-puzzle-system.ts`) are the third: a choice (follow the chains to the
right cleat), a solid that falls and lands, and a punishment that spawns zombies. The backlog of ideas is **`docs/level-puzzle-ideas.md`** (a
checklist). Pick from it, build one, then tick its box and fix its description to match what
shipped.

## How the user works (follow this)

- The user often talks by voice and waits on every step: keep replies short and few tool calls.
- The flow that worked:
  1. Brainstorm when asked: ideas only, no code.
  2. Show a short design in chat.
  3. Ask 1–2 real decisions with `AskUserQuestion`, with a recommended option and an ASCII preview.
  4. The user answers "go" or "build", and you implement straight away.
- The user then playtests and asks for changes ("make it slanted", "corpses must help climb").
  Expect a redesign round and keep the code easy to change.
- **Recurring concept the user wants:** reaching the puzzle should again need **killing zombies
  and climbing the corpse pile**. On floor 2 the exit platform became the boulder's ledge, so the
  pile climbs to it.
- Don't commit unless asked in that message, and work on a feature branch. The user may stop a
  tool call to redirect; then wait.
- Don't change gameplay tuning just to make testing easier. For manual testing the user has
  quick-climb corpse values, kept as a comment above `ZOMBIE_CORPSE_PLATFORM_HEIGHT` in
  `shared/game-constants.ts` (50 / 50 / 1). Put normal values back when done.

## Architecture recipe (copy the boulder puzzle)

| Piece | Where | Boulder example |
|---|---|---|
| Which floor, tuning | `shared/game-constants.ts` | `PUZZLE_BOULDER_FLOOR`, `BOULDER_*` |
| Synced state type | `shared/game-entities.ts` | `BoulderState { gateHits, progress, speed, wallBroken }` |
| New VFX event types | `shared/multiplayer.ts` `VfxEventType` | `GateBreak`, `WallBreak` |
| Layout data | `engine-types.ts` + `LevelLayout.<puzzle>?` in `level-generator.ts` | `BoulderPuzzleLayout { wall, wallDir, ledgeX }` |
| Seeded placement + rules | `level-generator.ts` (`placeX`, `xProblems` called from `levelViolations`) | `placeBoulderPuzzle`, `boulderPuzzleProblems` |
| Pure rules (no engine) | `src/app/engine/<puzzle>.ts` | `boulder-puzzle.ts` |
| Host simulation system | `src/app/engine/<puzzle>-system.ts`, `update()` (host/solo) + `tickClient()` | `BoulderPuzzleSystem` |
| Engine state + wiring | `engine-types.ts` `IGameEngine`, `game-engine.ts` | `boulderPuzzle`, `boulder`, `breakPuzzleGate/Wall`, `puzzleWall()` |
| Per-frame art | `render-system.ts` | `renderBoulderPuzzle` (chute, gate, boulder, EXIT sign) |
| Collidable art | `map-renderer.ts` geometry layer | `drawPuzzleWall` |
| Floor exit override | `zombie-system.ts` `checkFloorCompletion` | `leavesThroughOpening` |
| Floor intro hint | `boulder-puzzle.ts` `floorHint()` used by `render-system.ts` | "Climb to the boulder and break its gate" |
| Probe for tests | `src/app/testing/e2e-api.ts` + `e2e-hooks.ts` + `e2e/support/probe.ts` re-export | `state().puzzle` |

Rules that came out of building it:

- **The layout is optional and floor-gated.** Normal floors must leave the key out of the
  `LevelLayout` object, so other floors' layouts compare equal to before.
- **Keep the logic pure and testable.** Geometry, hit checks, rolling and the exit check live in
  the pure module (inputs → outputs). The system class only applies them to engine state, pushes
  VFX and calls the engine.
- **Things the dynamic exit height moves must be derived every tick.** The exit/ledge height
  comes from `exitPlatformY(floor, remotePlayers.length)` and changes when players join or leave.
  Anything that depends on it (gate box, roll path) is computed from `exitPlatform.y` each tick.
  Solids tied to it are re-placed in `repositionExitPlatform()` (see `placeGate`). The roll must
  still finish if the path shrinks mid-roll.
- **Solids** are `Platform`s with `solid: true` and `puzzlePart: 'wall' | 'gate'` (add a new
  member for new parts). Remove them by filtering `puzzlePart`. Geometry tests skip
  `puzzlePart` solids in the prop loop and measure the wall on its own.
- **A solid touching a screen edge** must push actors back onto the screen
  (`solid-blocks.ts` does this now). Otherwise a dash can trap a player inside it.
- **Nothing may end up inside a standing wall.** Pass spawns (`pickSpawnSpot`), falling corpses
  and drops through `keepOutOfWall`.
- **Art equals collision.** Anything that looks walkable must be walkable. Boulder-only tracks
  are drawn per frame as clearly non-walkable (trough plus guard rail). The generator keeps every
  platform and rope out of the chute's horizontal span.
- **Exits:** standing on a puzzle-floor exit platform must not complete the floor if the puzzle
  says so. Corpse footholds sit about 5 px above the ground, so an exit check must not demand
  feet exactly on `GROUND_Y`.
- **Players' hits:** detect them on the host from every player's synced `isAttacking`, position
  and facing: the local player plus `remotePlayers` (guests send them in `player-state`).
  - Use a cooldown of about one swing (`BOULDER_HIT_COOLDOWN_TICKS = 36`; the attack animation
    lasts 720 ms, so a held attack keeps hitting).
  - Require the player to stand on the right surface: feet within `PLATFORM_SNAP_TOLERANCE` of
    the ledge, never through a one-way floor from below.
  - Count a swing at the obvious target too: hitting the boulder resting on the gate counts as
    hitting the gate.

Lessons from the spring:

- **A moving puzzle part** (the spring) is a `puzzlePart` platform kept in `engine.platforms`
  (solid: walk onto it like a prop), drawn per frame (its plate moves when it fires) and measured
  at rest in `geometry-report.ts`. Solid ground blocks need ground spawns kept out of them
  (`pickSpawnSpot`), like the boulder wall.
- **Derive what you can from synced state.** The spring charge is counted from `zombieCorpses`
  (already in game-sync), so clients draw the same "CHARGE n/30" with nothing new to sync.
- **Countdowns:** the host runs the countdown and launches; clients tick it down but hold it at
  its last tick (`tickSpringClient`) so only the host decides when it fires.
- **Effects on players:** the host can't move a guest (guests own their state). Sync a counter
  (`launches`) plus a freshness window (`bounceTicks`); each client applies the effect to its own
  player when it sees a fresh change (`applyRemoteSpring`), never on a late join.
- **Fling straight up = zero velocityX.** Air drag is 0.99, so walking speed at launch carried the
  player ~170 px off the ledge. Unit-test the full flight with the real `PhysicsSystem`.
- **Fixed exit height** on a puzzle floor: override in `repositionExitPlatform`, not in
  `exitPlatformY` (tests use it for normal floors).

## Lessons from the cages

- **No swinging on the safe spot.** Attacks are disabled there (`restsOnSafeSpot`), so a hit
  target must stand on a regular ledge. The cleats pick the highest ledge with open sky above
  (`cleatLedge`); 1 seed in 80 has none, so there is a fallback. Measure such odds with a
  throwaway spec over 2000 seeds before relying on a layout feature.
- **A falling solid** has no collision while it falls (removed from `platforms`), is solid again
  where it lands, and `placeCages()` re-derives all of it from state (hanging / falling /
  landed). Call it from `repositionExitPlatform` when it hangs off the exit.
- **Landing on things:** what rests in the landing column rides up by the block's height
  (`yAfterCageLands`), so a corpse pile keeps its shape and ends up on top. The host lifts
  corpses, zombies, drops and its own player; guests lift themselves on the synced landing.
- **Spawning from a puzzle:** `ZombieSystem.spawnZombieAt(x, groundY)` (no bosses), so the
  puzzle system takes `ZombieSystem` as a peer.
- **`exitPile.baseY`** is the top of any puzzle block standing on the ground under the exit, and
  the e2e Brain hops onto that block before climbing the pile.
- **Teleport then land checks:** wait ~500 ms after a teleport; `isGrounded` reads true for a tick.

## Multiplayer checklist (host authority)

- [ ] The host decides puzzle state, damage and breaks. Guests send nothing new; their
      attacks/positions already sync.
- [ ] Add the state to the game-sync snapshot. The snapshot type is written inline in **4 places**:
      `GameEngine.getStateSnapshot`, `GameCanvasComponent.getStateSnapshot`, and in
      `game.component.ts` both the outgoing type and the incoming GameSync payload type (2
      copies).
- [ ] On the client, apply it right after `syncRemoteFloor` (order: `syncLayoutSeed`, then
      `syncRemoteFloor`, which rebuilds the floor, then apply the puzzle state). Validate
      everything:
  - The server relays game-sync without checking its shape (`isStateSnapshotPayload`), so check
    `Number.isFinite` and clamp ranges.
  - Booleans count only when `=== true`.
  - Breaks are one-way.
- [ ] Every effect (hits, breaks, crush damage numbers) does its local VFX **and** pushes a
      `VfxEvent`. Add a case in `replayRemoteVfxEvents`. Replay skips events whose `playerId` is
      the local player. Use the `multiplayer-vfx-sync` skill.
- [ ] Clients can extrapolate motion between snapshots (`tickClient`) but never decide outcomes.
- [ ] Known gap: system-local sets (e.g. `crushed`) are not synced, so a host migration mid-event
      can repeat it. Keep that harmless.

## Generator checklist

- [ ] Place the puzzle before the tiers when other placement depends on it. `TierRules.avoid`
      keeps platforms out of a horizontal span.
- [ ] If the puzzle uses the exit spot, set `layout.exitX` to it: the existing exit-gap rules
      (tier gaps, rope clearance, safe-spot gap) then protect the corpse climb automatically.
      Give the safe spot a gap that still fits (`placeSafeSpot(rand, exitX, exitGap, …)`).
- [ ] Add `xProblems(layout, puzzle)` rules to `levelViolations`, plus a floor ↔ puzzle presence
      check. `level-generator.spec.ts` runs every rule over 200 seeds × 10 floors.
- [ ] Props: `propProblems` takes the puzzle through `PropContext`; keep openings clear
      (`BOULDER_OPENING_CLEAR_PX`).
- [ ] Remember: the double-jump test and `exit.spec` already check that the exit/ledge is out of
      reach on floors 1–4.

## Test recipe (TDD; all must be green)

1. **Unit, pure rules** (`<puzzle>.spec.ts`): geometry both mirror sides (wall right/left), hit
   rules (facing, reach, below, downed), motion, breaks once, crush once, exit check, hint text.
2. **Unit, generator** (`level-generator.spec.ts`): presence only on its floor, invariants over
   seeds, and the rules catching a broken layout.
3. **Unit, engine** (`multiplayer-sync.spec.ts` builds a real `GameEngine` with
   `createMockCanvas()`):
   - Build the system with real `CombatSystem` and `VfxSystem` on that engine.
   - Cover: a full solo run, a guest's hits counted on the host, client clamp/NaN/one-way breaks,
     VFX replay, snapshot field, next floor clean.
4. **Mock engines.** Every new `IGameEngine` member must be added to both `makeMockEngine`s
   (`zombie-system.spec.ts`, `multiplayer-sync.spec.ts`).
5. **E2E solo** (`e2e/specs/solo/<puzzle>.spec.ts`):
   - Build a pile with `probe.dropCorpses(exitPile.centerX, 10)` until `exitPile.reachable`.
   - Climb with `new Brain(p, { goal: 'exit', stopWhen })`.
   - Act with keys (`hold(KEYS.attack)`), then assert the probe state and the VFX log
     (`probe.vfxLog()`).
   - Walk out from **inside the prop-free strip** next to the opening. Props may sit just outside
     it and block a straight walk.
6. **E2E online** (`e2e/specs/online/<puzzle>-coop.spec.ts`):
   - A guest performs the action.
   - The host's state changes, and the guest sees it: probe state, plus a VFX log entry with
     `direction === 'replayed'` and `particlesAdded > 0`.
7. **Regression:**
   - `npm test -- --watch=false`, `npm run build`, `cd zombie-blaster-api && npm run build`
     (`shared/` changed), `npm run e2e:typecheck`.
   - Browser: `level-geometry.spec.ts`, `level-sync.spec.ts`, `exit.spec.ts`, then
     `npm run e2e:solo` and `npm run e2e:online`.
8. **Look at it.** Floor screenshots are attachments in the html report (`e2e/.report/data/*.png`,
   oldest first = floor 1…). `--reporter=line` drops attachments, so run without it when you need
   images.

Mutation spot-checks were cheap and caught weak tests: break one line, see the test fail,
restore.

## Pitfalls already hit

- **The Angular test build compiles the whole app.** One TypeScript error fails every spec. Change
  types, the engine and specs together, then run.
- **"Dev server shows a compile error overlay"** right after an edit means the reused dev server
  caught a half-saved file. Check `npm run build` and rerun.
- `level-geometry`'s "land on every platform" check failed once while running alongside the online
  suite and passed on reruns alone (flaky under load, cause not found).
- **No Python on this machine.** Use Edit, or `sed`/heredocs in the Bash tool.
- **Stale docs mislead later sessions.** When a design changes, update this skill, the
  engine-architecture rule (`.claude/rules/engine-architecture.md`), the `game-e2e` skill
  (puzzle probe paragraph) and the checklist.
- The e2e AI Brain climbs to the ledge but has **no puzzle goals** (`npm run e2e:demo` stalls on
  floor 2 and floor 3). New puzzles should add a Brain goal or note the gap.
- The first boulder design (flat rail, push both ways, ladder) was replaced after playtesting. The
  user wanted a slope, a gate, and the corpse climb. `docs/superpowers/specs|plans/2026-10-06-boulder-*`
  describe that **old** design; trust the code and this skill.

## Finishing a stage

1. All tests above are green and you have looked at the screenshot.
2. Tick the idea in `docs/level-puzzle-ideas.md` and rewrite its line to describe what shipped
   (floor number, how it plays).
3. Add the new files to the table in `.claude/rules/engine-architecture.md` and the probe fields
   to the `game-e2e` skill.
4. Report briefly. Commit only if asked.
