> **SUPERSEDED.** This describes the first, rail-based boulder design, which was replaced after playtesting
> (ledge + gate + chute + corpse climb). The current design is in the code and in
> `.claude/skills/stage-puzzle/SKILL.md`.

# Floor 2 puzzle: boulder on a rail breaks the side wall

Date: 2026-10-06. Status: draft for review.

## Goal

Every floor should feel different, not only "kill zombies, climb the pile, reach the exit".
Floor 2 is the first puzzle floor: climb to a high rail, hit a boulder so it rolls along the
rail, it smashes a wall at the screen edge, and the party leaves through the opening.

Success: solo and co-op players can finish floor 2 only through the puzzle. Every player sees
the same boulder and the same wall break. The boulder never leaves the rail or the screen.

## What the player sees (floor 2 only)

- No hanging exit platform and no corpse-pile exit.
- One screen edge (the exit side the layout picks) has a **cracked stone wall**: solid, two tiles
  wide, from the screen top down to the ground. Cracks hint that it can break.
- A **rail** (a walkable tier-3 platform drawn with rail tracks on top) runs from the wall inward.
  Wooden **stoppers** sit at both rail ends.
- A **boulder** (48 px stone ball) rests near the back end of the rail, with at least 2 tiles of
  rail behind it so a player can always stand behind it.
- Players climb the tiers/ropes to the rail. The boulder is not solid: players walk through it.

## Mechanic

- **Hit:** a player attacks (basic attack or skill) while next to the boulder (center within
  `BOULDER_HIT_REACH_PX` horizontally, overlapping vertically) and facing it. The boulder gets
  `BOULDER_PUSH_SPEED` in the direction the player faces. A push counts while the player's attack
  animation is on (`isAttacking`, which is what guests sync), at most once per
  `BOULDER_HIT_COOLDOWN_TICKS`; a held attack keeps pushing, one push per swing or so.
- **Both directions work.** Hitting from the wall side pushes it backward, away from the wall.
- **Rolling:** speed decays by `BOULDER_FRICTION` per tick (one hit from the back end carries it
  the whole rail; a weak/late hit may need a second). It spins with distance travelled.
- **Never lost:** the boulder's x is clamped between the two stoppers every tick. Hitting a stopper
  zeroes its speed. It never falls off the rail and never leaves the screen, also after the wall
  is gone (the wall-side stopper stays).
- **Crush:** zombies the rolling boulder overlaps take `BOULDER_CRUSH_DAMAGE` (host-side, once per
  zombie per roll) and are knocked in the roll direction. Players are never hurt by it.
- **Break:** when the boulder reaches the wall-side stopper while moving toward the wall, the wall
  breaks: debris particles, dust, screen shake, sound-free. The wall's collision is removed.
- **Leave:** after the break, an "EXIT" arrow shows at the opening. A grounded player whose box
  enters the old wall area completes the floor (replaces the exit-platform check on floor 2).
- Other floors are unchanged.

## Level layout

- `LevelLayout` gains optional `boulderPuzzle?: BoulderPuzzleLayout`:
  `{ rail: Platform; wall: Platform; boulderStartX: number; backStopX: number; wallStopX: number }`.
- Floor 2 in `generateLevel`: pick exit side as today; place the wall at that edge
  (2 tiles wide, x 0 or `CANVAS_WIDTH - 64`, from the screen top down to the ground, so nobody
  stands on it); the rail on tier 3
  touching the wall, 14-18 tiles long; tier 1/2 platforms and ropes as today so the rail is
  reachable; the safe spot keeps its rules but may not overlap the rail or wall.
- The hanging exit (`exitPlatform`) is parked off-screen on floor 2, so no code collides with it.
- The wall is a `Platform` with `solid: true` in physics while unbroken (same side-collision
  path as props, zombies included). The rail is a normal platform.
- New `levelViolations` rules (unit-tested over many seeds):
  - floor 2 has exactly one boulder puzzle; other floors have none;
  - the rail is reachable from the ground (existing reachability check covers it);
  - the rail touches the wall and is fully on screen;
  - at least 2 tiles of rail behind the boulder start;
  - no prop, rope or other platform inside the wall, on the rail, or in the opening path;
  - the wall spans the screen top to the ground (nothing walks over it).
- Zombies never spawn inside the wall area.

## Multiplayer

- Host owns `BoulderState { x: number; velocityX: number; wallBroken: boolean }` (type in
  `shared/game-entities.ts`). It rides in the `game-sync` snapshot as optional `boulder`.
- Guests apply it: draw the boulder at the synced x, remove the wall collision when
  `wallBroken` turns true.
- **No new server message.** Host decides hits for everyone: for the local player and each remote
  player, a rising edge of `isAttacking` within reach and facing the boulder pushes it. Guests'
  hits arrive through their existing `player-state`.
- Wall break pushes a `VfxEvent` (new type `wall-break`) so every player sees the burst and shake;
  rolling dust is derived locally from synced velocity.
- Host migration: the new host already holds the latest synced boulder state and keeps simulating.

## Code

| File | Change |
|---|---|
| `shared/game-entities.ts` | `BoulderState` |
| `shared/game-constants.ts` | `BOULDER_*` constants, `PUZZLE_BOULDER_FLOOR = 2` |
| `shared/multiplayer.ts` | `VfxEventType` `wall-break` |
| `src/app/engine/level-generator.ts` | floor-2 puzzle layout + rules |
| `src/app/engine/boulder-puzzle.ts` (new) | hit detection, rolling, clamp, crush, wall break, exit check |
| `src/app/engine/engine-types.ts` / `game-engine.ts` | `boulder` state, wire system, snapshot/apply, reset per floor |
| `src/app/engine/zombie-system.ts` | floor completion uses the opening on floor 2; no spawns in the wall |
| `src/app/engine/map-renderer.ts` | rail tracks, stoppers, wall tiles + cracks from the layout |
| `src/app/engine/render-system.ts` | boulder, opening arrow |
| `src/app/engine/vfx-system.ts` | `wall-break` effect (local + replayed) |
| `src/app/pages/game/game.component.ts` | carry `boulder` in game-sync |
| `src/app/testing/*` | probe: `boulder`, `level.boulderPuzzle`, helper to jump to floor 2 |

Server: no change (it relays `game-sync` as-is; check the payload validator allows the field).

## Tests

- Unit: `level-generator.spec.ts` floor-2 rules over many seeds; `boulder-puzzle.spec.ts` for push
  direction, clamp at both stoppers (never out of bounds), wall break only toward the wall,
  crush once per roll, exit only after the break.
- E2E solo `boulder-puzzle.spec.ts`: floor 2 has wall + rail + boulder and no hanging exit; hit from
  the wall side moves it back and it stops at the back stopper; hit from behind breaks the wall;
  walking through the opening loads floor 3.
- E2E online `boulder-puzzle-coop.spec.ts`: the guest hits the boulder, host and guest both see it
  roll and the wall break, and the guest can walk out.
- Must pass: `level-geometry.spec.ts`, `level-sync.spec.ts` (wall/rail art == collision).

## Out of scope

Other puzzle floors, sound, boulder art from a sprite sheet (drawn on canvas for now).
