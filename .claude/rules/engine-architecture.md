---
paths:
  - "src/app/engine/**"
---

# Game Engine Architecture

The engine is split into focused files under `src/app/engine/`.

## Files

| File | Responsibility |
|---|---|
| `engine-types.ts` | Shared engine interfaces (`IGameEngine`, `Platform`, `Rope`, `DamageNumber`, ...) |
| `game-engine.ts` | Orchestrator: owns all state, creates systems, runs the loop, multiplayer snapshot/apply |
| `physics-system.ts` | Player movement, gravity, platform/rope collision, climbing |
| `combat-system.ts` | Player attacks, skills, buffs, passives, damage to/from zombies, zombie death |
| `zombie-system.ts` | Zombie AI, spawning, waves, corpses, zombie collisions |
| `projectile-system.ts` | Dragon/spitter projectiles, poison effects |
| `drop-system.ts` | Loot drops, potion use, item pickup |
| `vfx-system.ts` | Particles, damage numbers, screen shake/flash, skill animations, hit marks |
| `render-system.ts` | All canvas drawing: background, players, zombies, projectiles, overlays |
| `map-renderer.ts` | Draws scenery (backgrounds) and the level geometry layer (ground, platforms, ladders) **from the layout data only** |
| `level-generator.ts` | Seeded per-floor layouts (platforms, ropes, exit side, safe spot + its ladder, floor-2 boulder puzzle: wall + ledge position, platforms kept out of the chute) + `levelViolations` rules; host picks the seed, clients follow it via game-sync |
| `boulder-puzzle.ts` | Floor-2 puzzle rules (pure): gate box + hits, boulder path (ledge → chute → wall), rolling, crush targets, debris, `keepOutOfWall`, leaving through the opening |
| `spring-puzzle.ts` | Floor-3 puzzle rules (pure): spring span, scale pan + what rests on it and its kg (`scaleLoadKg`), cable path, button box + rise (`tickButton`) + presses, 3-2-1 countdown + launch tick, on-spring check + fling, corpse scatter, plate offset |
| `spring-puzzle-system.ts` | Floor-3 puzzle simulation: host weighs the scale (corpses, props, zombies, every player + carried load), raises/lowers the button, watches every player's presses, runs the countdown, launches the local player; guests launch themselves from the synced launch, clients move the button from the synced kg |
| `weight.ts` | Weight helpers (kg): `zombieWeightKg(type)`, `playerLoadKg` (body + carried corpses/props). The numbers live in `shared/game-constants.ts` |
| `cage-puzzle.ts` | Floor-4 puzzle rules (pure), cages by index (`EXIT_CAGE` = 0): hanging / falling / landed cage boxes and collision, landing top, cleat box + hits, tangled chain path through its kinks, fall ticks (host lands, client only falls), what the landing exit cage lifts (`yAfterCageLands`), release spots |
| `cage-puzzle-system.ts` | Floor-4 puzzle simulation: host counts every player's cleat hits, snaps chains, drops and lands cages (exit cage: lift the pile, zombies, drops and its own player onto it; others smash where they land), then spills the hidden content (`spawnZombieAt` x4, `DropSystem.spawnCageLoot`, or nothing); guests lift themselves from the synced landing |
| `plate-puzzle.ts` | Floor-5 puzzle rules (pure): plate box, what presses on it (lying corpses, standing players) and its weight, open/shut changes, door slide + door box, zombie kicks |
| `plate-puzzle-system.ts` | Floor-5 puzzle simulation: host weighs the plate from the corpses and every player, slides the exit door, lets walking zombies kick corpses off; clients slide the door from the synced weight |
| `boulder-puzzle-system.ts` | Floor-2 puzzle simulation: host counts gate hits (all players), rolls the boulder, crushes, breaks the wall; clients extrapolate the synced roll |
| `magnet-pull.ts` | Monster-magnet drag (host-simulated, synced as `ZombieState.magnetPull`) |
| `corpse-carry.ts` | Carrying rules (pure), corpses and loose props alike (`Carriable`): what is in reach, a stack of up to `CORPSE_CARRY_MAX` overhead, tossing the stack so it lands as a pile, host grants/releases (`assignCarriers`), carried-body sway (`carrySway`/`easeCarryPose`, drawing only, corpses) |
| `corpse-carry-system.ts` | Carry key (pick up one more / toss the stack; attack also tosses), host grants every player's requests, every client holds carried corpses/props on their carriers; guests hold their own pick-ups while the host answers; eases `carryPoses` of carried corpses each tick (RenderSystem bends the sprite in strips by it) |
| `corpse-drape.ts` | Limp bodies on piles (pure, drawing only): each lying body's strips sag onto what is under it (ground, platforms, bodies lower in the pile as draped), curving no steeper than `MAX_SLOPE` and pulled toward the feet to keep their length; sprite size/flip/body span helpers. ZombieSystem re-drapes into `corpseDrapes` when a corpse or platform moved; RenderSystem draws lying bodies bent by it, each strip turned along the bend (shearing made limbs thin spikes). A body never rises above its feet or steeper than it bends (an unclamped rise drew dashed lines shooting up) |
| `corpse-surface.ts` | Walkable surface of a corpse (the same for every corpse, the exit pile included) |
| `safe-spot.ts` | `restsOnSafeSpot`: who rests on the floor's safe spot (zombies can't target/hit/land; no attacking from it) |
| `solid-blocks.ts` | Side collision with solid props (players and zombies); `stepUpOnto`: players step onto props up to `PROP_STEP_UP_PX` tall |
| `loose-prop-system.ts` | Pickable props (barrels, boxes): host flies/drops/lands them, every client turns lying ones into solid platforms (`Platform.propId`); game-sync sends only props away from their spawn spot |
| `worker-interval.ts` | `WorkerInterval`: a timer that keeps its pace in background tabs (online engine ticks while hidden, game-sync send loop) |
| `sprite-effect-system.ts` | Sprite-sheet effects (`EFFECT_CONFIGS`), standalone |
| `skill-animations.ts` | `SKILL_ANIMATIONS` particle definitions per skill |
| `particle-types.ts` | `Particle`, `ParticleShape`, `FadeMode` |
| `sprite-animator.ts` / `zombie-sprite-animator.ts` | Player / zombie sprite-sheet animation state |

## Level geometry: what you see is what you stand on

- The floor layout from `generateLevel(seed, floor)` is the single source of truth. `GameEngine.applyLevel()`
  feeds the same data to physics (`platforms`, `ropes`) and to `MapRenderer.setLevel()`.
- Never hard-code a platform, ladder or prop in a renderer, and never draw scenery that looks walkable.
  Platforms are whole tiles (`LEVEL_TILE_PX`) wide and one tile tall, so art == collision box.
- Props (barrels, boxes, lockers, rails) are placed by the generator and are solid (`Platform.solid`):
  stand on top; players walking into one up to `PROP_STEP_UP_PX` (26) tall step onto it, taller
  stacks and puzzle solids block (`solid-blocks.ts`, zombies hop over). Barrels and boxes are
  pickable (`isPickable`): carried and thrown like corpses, state `LooseProp` (id
  `prop-<floor>-<index>`), drawn per frame (`MapRenderer.drawLooseProp`, not in the geometry layer)
  and measured where they lie in the geometry report. Rails and lockers stay put. A prop's box is its
  image's measured visible pixels (`PROP_ART`); the renderer offsets the image so the art lands on the
  box. Rails are one prop of random length: left cap + 0..`RAIL_MAX_MIDDLES` middles + right cap
  (`RAIL_ART`, drawn piece by piece). New prop art: measure its opaque bounds and add it to `PROP_ART`.
- Any change to level art, tiles, layouts or collision must pass `e2e/specs/solo/level-geometry.spec.ts`
  and `e2e/specs/online/level-sync.spec.ts`. They measure the drawn pixels against the collision
  data, land on every platform and climb every ladder. Also look at the attached floor screenshots.
- New layout rules go into `levelViolations` (unit-tested over thousands of seeds in `level-generator.spec.ts`).
- Puzzle floors: on floor 2 the exit platform is the boulder's ledge (`layout.exitX = ledgeX`, same
  height rules, climbed by the corpse pile; standing on it does not finish the floor). Its gate is a
  solid `puzzlePart: 'gate'` platform re-placed with the ledge (`placeGate`) until it breaks; the
  side wall is a solid `puzzlePart: 'wall'` platform drawn in the geometry layer, and
  `breakPuzzleWall()` removes collision and art together. The chute is boulder-only art (per frame),
  so the generator keeps every platform and rope out of its span. Ledge height (player count)
  changes the path, so everything is derived from `exitPlatform.y` each tick. Leaving is
  `leavesThroughOpening`; corpses, drops and spawns go through `keepOutOfWall`.
- Floor 3 is the spring: the exit hangs at a screen edge at the fixed `SPRING_LEDGE_Y` (100, any
  party size), straight over a solid `puzzlePart: 'spring'` block from that screen edge (walk onto
  its plate like a prop). It is drawn per frame (`MapRenderer.drawSpring`, the plate moves while
  it fires) and measured at rest in the geometry report. Ground spawns are kept out of it. The
  generator keeps platforms, ropes and props `SPRING_CLEAR_PX` clear of it (the button stands
  there). The scale's pan is per-frame art set into the ground on the far side (`scaleX`, no new
  collision; the generator keeps props off it), and the cable is per-frame non-walkable art. The
  host weighs the scale and syncs `scaleKg`; every client raises the button from it.
- Floor 4 is the hanging cages (4-5, `CagePuzzleState.cages[]`, index 0 the exit cage): the exit
  cage (`puzzlePart: 'cage'`) hangs under the exit and is re-placed with it (`placeCages`, called
  from `repositionExitPlatform`); the others (`puzzlePart: 'hanging-cage'`) hang mid-screen, clear
  of the exit and the safe spot, and fall onto the highest platform under them (`landY`, else the
  ground). All are solid while they hang, have no collision while falling, and the exit cage is
  solid on the ground once landed. They are drawn per frame under tarps (`MapRenderer.drawCage`,
  bare once the exit cage landed) and measured where their collision is in the geometry report.
  Chains are per-frame, non-walkable art, all alike and tangled through seeded kinks in the
  ceiling band. Cleats stand on regular ledges, highest first (`cleatSpots`; the ground only as a
  fallback): attacks are off on the safe spot. Contents are seeded layout data, never drawn.
  Ground spawns are kept out of the landed cage.
- Floor 5 is the pressure plate: a barred door stands on the exit (scenery drawn per frame, not
  collision) and the floor completes only while it is fully open (`checkFloorCompletion`). The
  plate is a strip drawn inside the top of the highest regular ledge on the far half from the exit
  (the ground there when none fits), so it changes no collision. Props keep clear of it. Its
  weight comes from the synced corpses and players' positions; the host sends it with the door in
  `plate`.

## Dependency rules

- Systems reach engine state through `IGameEngine` (`engine-types.ts`). Systems never import `game-engine.ts`.
- No circular deps. Current graph:

```
PhysicsSystem, VfxSystem, SpriteEffectSystem, MapRenderer -> standalone
DropSystem       -> Physics, Vfx
CombatSystem     -> Physics, Vfx, Drop
ProjectileSystem -> Physics, Vfx
ZombieSystem     -> Physics, Combat, Projectile, Drop
BoulderPuzzleSystem -> Combat, Vfx
SpringPuzzleSystem  -> Vfx
CagePuzzleSystem    -> Vfx, Zombie, Drop
PlatePuzzleSystem   -> Vfx
CorpseCarrySystem   -> standalone
LoosePropSystem     -> Drop
RenderSystem     -> reads state only (no system deps)
```

## Adding logic

- Put gameplay logic in the matching system file. Keep `game-engine.ts` a thin orchestrator.
- New shared state: add to `IGameEngine` and `GameEngine`.
- New systems: constructor takes `IGameEngine` plus required peer systems, wired in `GameEngine`'s constructor.
- Any new visual effect: follow the `multiplayer-vfx-sync` skill.
