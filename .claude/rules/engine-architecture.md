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
| `spring-puzzle.ts` | Floor-3 puzzle rules (pure): spring span, lever box + pulls, charge from corpses on the spring, 3-2-1 countdown + launch tick, on-spring check + fling, plate offset |
| `spring-puzzle-system.ts` | Floor-3 puzzle simulation: host watches every player's lever pulls, runs the countdown, launches the local player; guests launch themselves from the synced launch |
| `cage-puzzle.ts` | Floor-4 puzzle rules (pure): hanging / falling / landed cage boxes and collision, cleat box + hits, chain path, fall ticks (host lands, client only falls), what the landing exit cage lifts (`yAfterCageLands`), release spots |
| `cage-puzzle-system.ts` | Floor-4 puzzle simulation: host counts every player's cleat hits, snaps chains, drops and lands cages (exit cage: lift the pile, zombies, drops and its own player onto it; zombie cage: smash, `spawnZombieAt` x6); guests lift themselves from the synced landing |
| `boulder-puzzle-system.ts` | Floor-2 puzzle simulation: host counts gate hits (all players), rolls the boulder, crushes, breaks the wall; clients extrapolate the synced roll |
| `magnet-pull.ts` | Monster-magnet drag (host-simulated, synced as `ZombieState.magnetPull`) |
| `corpse-carry.ts` | Corpse carrying rules (pure): what is in reach, holding overhead, tossing, host grants/releases (`assignCarriers`) |
| `corpse-carry-system.ts` | Carry key (pick up / toss), host grants every player's request, every client holds carried corpses on their carriers; guests hold their own pick-up while the host answers |
| `corpse-surface.ts` | Walkable surface of a corpse (the same for every corpse, the exit pile included) |
| `safe-spot.ts` | `restsOnSafeSpot`: who rests on the floor's safe spot (zombies can't target/hit/land; no attacking from it) |
| `solid-blocks.ts` | Side collision with solid props (players and zombies) |
| `sprite-effect-system.ts` | Sprite-sheet effects (`EFFECT_CONFIGS`), standalone |
| `skill-animations.ts` | `SKILL_ANIMATIONS` particle definitions per skill |
| `particle-types.ts` | `Particle`, `ParticleShape`, `FadeMode` |
| `sprite-animator.ts` / `zombie-sprite-animator.ts` | Player / zombie sprite-sheet animation state |

## Level geometry: what you see is what you stand on

- The floor layout from `generateLevel(seed, floor)` is the single source of truth. `GameEngine.applyLevel()`
  feeds the same data to physics (`platforms`, `ropes`) and to `MapRenderer.setLevel()`.
- Never hard-code a platform, ladder or prop in a renderer, and never draw scenery that looks walkable.
  Platforms are whole tiles (`LEVEL_TILE_PX`) wide and one tile tall, so art == collision box.
- Props (barrels, boxes, lockers, fences) are placed by the generator and are solid (`Platform.solid`):
  stand on top, blocked at the sides (`solid-blocks.ts`, zombies hop over). A prop's box is its
  image's measured visible pixels (`PROP_ART`); the renderer offsets the image so the art lands on the
  box. New prop art: measure its opaque bounds and add it to `PROP_ART`.
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
  generator keeps platforms, ropes and props `SPRING_CLEAR_PX` clear of it (the lever stands
  there). The charge is derived from the synced corpses.
- Floor 4 is the hanging cages: the exit cage (`puzzlePart: 'cage'`) hangs under the exit and is
  re-placed with it (`placeCages`, called from `repositionExitPlatform`), the zombie cage
  (`puzzlePart: 'zombie-cage'`) hangs mid-screen over a column the generator keeps free of
  platforms. Both are solid while they hang, have no collision while falling, and the exit cage is
  solid on the ground once landed. They are drawn per frame (`MapRenderer.drawCage`) and measured
  where their collision is in the geometry report. Chains are per-frame, non-walkable art. Cleats
  stand on the highest regular ledge (open sky preferred): attacks are off on the safe spot.
  Ground spawns are kept out of the landed cage.

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
CagePuzzleSystem    -> Vfx, Zombie
CorpseCarrySystem   -> standalone
RenderSystem     -> reads state only (no system deps)
```

## Adding logic

- Put gameplay logic in the matching system file. Keep `game-engine.ts` a thin orchestrator.
- New shared state: add to `IGameEngine` and `GameEngine`.
- New systems: constructor takes `IGameEngine` plus required peer systems, wired in `GameEngine`'s constructor.
- Any new visual effect: follow the `multiplayer-vfx-sync` skill.
