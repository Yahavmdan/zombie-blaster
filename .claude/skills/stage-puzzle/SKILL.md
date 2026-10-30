---
name: stage-puzzle
description: Build a new stage/level puzzle for Zombie Blaster (a floor that needs more than "kill zombies, climb the pile, reach the exit"), or brainstorm, change or extend one. Holds the puzzle backlog (docs/level-puzzle-ideas.md), the proven architecture from the floor-2 boulder puzzle, the multiplayer rules, the test recipe and the pitfalls already hit. Use when the user asks for a new stage, level, floor puzzle, obstacle, or picks an idea from the checklist.
---

# Stage puzzles

Every floor should feel different. The floor-2 **boulder puzzle** is the reference
implementation: copy its shape. The floor-3 **spring** (`spring-puzzle.ts`,
`spring-puzzle-system.ts`) is the second one: a solid moving part, a countdown, a player-affecting effect
on guests, and a remote trigger. It started as a seesaw, then a spring charged by 30 corpses on it;
now a **scale** on the far side, linked by a cable over the ceiling, raises the spring's button once
it holds 1000 kg (everything has a weight in kg, see Weights below). The floor-4 **hanging cages**
(`cage-puzzle.ts`, `cage-puzzle-system.ts`) are the third: a gamble (4-5 covered cages on tangled
chains: which cleat drops the exit cage, and what does each cage hide?), a solid that falls and
lands, and hidden outcomes (zombies, loot, nothing). It started as two open cages with chains you
could follow; the user wanted more cages and no way to know the wiring or the contents. The floor-5 **pressure plate** (`plate-puzzle.ts`,
`plate-puzzle-system.ts`) is the fourth: no new collision at all (a door that is scenery plus an
exit gate, a plate drawn inside its ledge), weight derived from synced corpses and players, and
corpse carrying as the tool. The backlog of ideas is **`docs/level-puzzle-ideas.md`** (a
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
| Per-frame art | `render-system.ts` calls `puzzle-art.ts` (pixel art on the 2 px grid, `pixel-art.ts` helpers) | `renderBoulderPuzzle` → `drawChute`, `drawBoulder`, `drawGate`, `drawExitArrows` |
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
- **Breaking a part looks physical.** When a drawn solid goes away, cut its own art into pieces
  (`ParticleShape.Chunk` + `Particle.chunk`, drawn from the part's cached art canvas) and let them
  fall with `floorY` (bounce, slide, dust: `DEBRIS_*`); `delay` holds a piece in place, drawn,
  until it lets go. The floor-2 wall (`spawnWallBreak`, `WALL_BREAK_*`) is the reference: its
  stones (`crackedWallStones`) blast out near the impact (`wallImpactY`), crumble upward, settle.
  Derive everything from the event's coordinates so the replay draws the same pieces.
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
- **Derive what you can from synced state**, but weigh on the host: the scale counts corpses,
  props, zombies and every player (guests' positions only reach the host), so the host syncs one
  number (`scaleKg`) and every client moves the button from it (`tickButton`), like the plate door.
- **Countdowns:** the host runs the countdown and launches; clients tick it down but hold it at
  its last tick (`tickSpringClient`) so only the host decides when it fires.
- **Effects on players:** the host can't move a guest (guests own their state). Sync a counter
  (`launches`) plus a freshness window (`bounceTicks`); each client applies the effect to its own
  player when it sees a fresh change (`applyRemoteSpring`), never on a late join.
- **Fling straight up = zero velocityX.** Air drag is 0.99, so walking speed at launch carried the
  player ~170 px off the ledge. Unit-test the full flight with the real `PhysicsSystem`.
- **Fixed exit height** on a puzzle floor: override in `repositionExitPlatform`, not in
  `exitPlatformY` (tests use it for normal floors).

## Weights (kg): the data rule

- Every body and object has a weight in kg, and the numbers live in `shared/game-constants.ts`:
  `PLAYER_WEIGHT_KG`, `ZOMBIE_TYPES[type].weightKg` (a corpse weighs what its zombie did) and
  `PROP_WEIGHT_KG[material]` (props map kind to material in `PROP_MATERIAL`, `level-generator.ts`;
  `LooseProp.weightKg` is set from it, never trusted from the sync). Helpers: `weight.ts`
  (`zombieWeightKg`, `playerLoadKg` = body + carried corpses/props).
- A new zombie type, prop, or other thing that can rest on something gets a weight there in the
  same change. Weight puzzles weigh in kg (the floor-5 plate still counts unitless weight: port it
  to kg if you touch it).
- Scale-like parts: count what rests on them up to a stack height (`SPRING_SCALE_STACK_PX` 80 <
  the 90 px to a tier-1 ledge, so nothing on a ledge above counts). Draw a ground pan flush with the
  ground (not sinking: the dip would show feet floating), and show the load on a gauge/readout.

## Lessons from the cages

- **No swinging on the safe spot.** Attacks are disabled there (`restsOnSafeSpot`), so a hit
  target must stand on a regular ledge. The cleats take spots `CAGE_CLEAT_SPACING_PX` apart along
  the highest ledges (`cleatSpots`), the ground only as a rare fallback (asserted over 200 seeds).
  Measure such odds with a throwaway spec over 2000 seeds before relying on a layout feature.
- **Hidden information is layout data.** Contents and chain kinks are seeded in the layout, so
  every client has them with nothing new to sync; the renderer just never draws them. The user
  chose tangling by identical art (same-color chains) over hiding the routing in a ceiling beam.
- **Many falling things: land on platforms, don't clear columns.** Keeping 3-4 mid-screen columns
  free of platforms would empty the map, so each cage stores `landY` (the highest platform under
  it) and spills its content there.
- **Perl/sed multi-line edits on CRLF files** (docs, skills, rules) silently fail or, with a lazy
  `.*?` and `/s`, eat whole sections. Use the Edit tool for those files.
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


## Lessons from the pressure plate

- **Puzzles without new collision are cheap.** A door drawn on the exit plus a check in
  `checkFloorCompletion`, and a plate drawn inside its ledge's top: no `puzzlePart`, no geometry
  report changes, no `repositionExitPlatform` work (the door box is derived from the exit).
- **Zombie twists get harsh fast.** Zombies chase the player, so they crowd whatever the player
  works on. The first kick (every 45 ticks, any zombie) stripped the plate in seconds; now only a
  walking zombie kicks, once per 4 s. Watch failing e2e screenshots: they showed it.
- **E2e with zombie pressure:** loop until the goal state (`held`), then act at once; don't leave a
  long window (pile building) between setting a state and using it.
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

## Designed layouts (dev level editor)

The user designs floors by eye in the dev level editor (Dev > Open level editor, solo only) and
sends the JSON export, with notes (`notes`) that explain the puzzle: build the floor's hint and
instructions from them. The user wants **standalone gadgets**, never combos: a boulder is just a
boulder (not a chute + wall + ledge), a spring is not tied to a scale. Anything triggers anything
through wires (Portal-style: a button, scale or lever drives springs, slingshots, doors or the exit;
the dots show in the game and light up). Gadgets live in `gadgets.ts` / `gadget-system.ts` /
`gadget-art.ts`; what each does:
- **Boulder** (600 kg): a swing rolls it; moving fast it crushes zombies (bosses take a share) and
  breaks crack bands; it weighs on buttons/scales; launchers and blasts throw it. Still, it is solid.
- **Cracked wall**: stone, solid; only its crack band (y range set in the editor) breaks: 5 swings
  level with the band, a barrel blast in reach, or a fast boulder. The rest stands (a hole).
- **Button / scale**: on while their kg rest on them (corpses, props, zombies, players with what they
  carry, boulders). **Lever**: a swing flips it.
- **Spring / slingshot**: wired, they fire as the signal comes on; unwired, when something lands on
  them. They throw corpses, props, boulders and players (guests launch themselves on a fresh launch).
- **Door**: open while its input is on (`latch`: stays open); with no wire it stands open. An
  `exit` door finishes the floor for a player standing in it while fully open. A wire to `exit`
  locks the hanging exit behind a door; `exitHidden` on the layout removes the hanging exit (it
  hangs far above the screen) so a door is the way out.
- **Slope**: a one-way ramp across its box (`risesRight`). Players walk up and down it
  (`PhysicsSystem.standOnSlope`, down + jump drops through), boulders roll down it gathering speed.
  Zombies walk on them too (`ZombieSystem.standOnSlope`, the same `slopeTopUnder`); corpses, props
  and drops do not use slopes yet (they fall through). Struts are drawn down to what is under them.
- **Cage**: hangs on a chain from the ceiling, solid. A wire's signal (unwired: a swing; also a
  blast or a fast boulder) drops it; it crushes what is under it, lands as a step (or `smashes`),
  and lets out `zombies` zombies, `gold` gold and potions, or nothing (`content`).
- Physics added for them: players bump their heads on solids' undersides (`PhysicsSystem.bumpHead`).
- The editor's tool buttons are pictures (`tool-icons.ts`), names in tooltips and the hint line.
  Ctrl+Z / Ctrl+Shift+Z (and the Undo / Redo buttons) step through the last
  `DEV_EDITOR_HISTORY_STEPS` (30) changes (`LevelEditorSystem.play(tag)` records each; a drag or a
  slider is one step). Erasing the hanging exit hides it (`exitHidden`, its wires go); the Exit tool
  puts it back; the bar warns when the design has no way out (no exit and no exit door).
- **Middle click** in the editor opens a popup by the cursor to adjust the thing clicked (sliders
  and numbers, same list in the bar's selection): scale/button kg, spring/slingshot power and angle
  (the editor draws where a boulder would fly), boulder weight (heavier rolls slower off a swing or
  blast), wall/door/crack wall width and height (the foot stays), crack band height above the foot
  and its size, door latch, lever "starts on", platform/rail width, ladder length. New adjustable
  data goes in `fieldsOf`/`setField` (`level-editor.ts`). Pieces: `level-editor.ts` (pure rules), `level-editor-system.ts`
(`engine.levelEditor`), `level-editor-art.ts` (overlay), `components/level-editor-bar` (tool bar,
export/import, autosaved draft in localStorage `zb-level-editor-draft`). Every edit is played at once
through `GameEngine.useCustomLevel`, for the floor it was made on only.

- **The export is a `LevelLayout`**: `floor`, `exitX` + `exitY` (fixed exit height),
  `platforms` (`safe: true` = the safe spot), `ropes` (ladders), `walls` (solid tile blocks),
  `props`, `gadgets` (each `{ id, kind, x, y, width, height, ... }`: `kg`/`targets` on sources,
  `power`/`angle` on launchers, `crackTop`/`crackBottom` on cracked walls, `latch` on doors), and
  `notes`. Generated floors 2-5 still carry `boulderPuzzle`, `springPuzzle`, `cagePuzzle`,
  `platePuzzle` (editable in the editor, no longer placeable).
- **Derived parts are rebuilt on import** (`parseLayout` → `followExit`): the boulder ledge is the
  exit, the spring spans from the exit's nearer screen edge, cage `landY` and chain `kinks` (seeded
  from `seed`). Don't hand-edit those in an export.
- **Adding an export to the game:** add it as a typed constant to `DESIGNED_LEVELS`
  (`src/app/engine/designed-levels.ts`, keyed by floor; give it a `hint`: the subtitle under the
  floor title). The engine plays `levelFor(seed, floor)`: a copy of the designed floor, else
  `generateLevel` (which stays purely procedural, so its rule tests still sweep every floor).
  Floor 1 is designed (button + exit door). Engine unit tests that need a generated floor set
  `engine.floor = GENERATED_FLOOR` (6) and `applyLevel()`; a client engine copies the host's floor. Every client has the same constant,
  so nothing new syncs. Then: `levelViolations` holds generator rules (tiers, exit gaps, puzzle on its
  floor) that a designed floor may break on purpose: check them for that floor, keep the ones that
  still matter (art equals collision, a ladder under each high ledge, puzzles reachable) and skip the
  rest for designed floors only. `level-geometry.spec.ts` + `level-sync.spec.ts` must pass (walls are
  drawn whole tiles clipped to their box), and the Brain may need a route for the new floor.
  Gadget state already syncs (game-sync `gadgets`, VFX `CrackBreak`, `GadgetLaunch`), so a designed
  floor works in co-op as soon as every client has its layout.
- Probe: `state().level.walls`, `state().gadgets`, `state().exitLocked`, `probe.loadLayout`. E2E:
  `e2e/specs/solo/level-editor.spec.ts` (the editor UI), `e2e/specs/solo/gadgets.spec.ts`,
  `e2e/specs/online/gadgets-coop.spec.ts`; the dev-tools online spec checks the editor is disabled in
  co-op (designing there would split the world).

## Finishing a stage

1. All tests above are green and you have looked at the screenshot.
2. Tick the idea in `docs/level-puzzle-ideas.md` and rewrite its line to describe what shipped
   (floor number, how it plays).
3. Add the new files to the table in `.claude/rules/engine-architecture.md` and the probe fields
   to the `game-e2e` skill.
4. Report briefly. Commit only if asked.
