# Level puzzle ideas

Every stage should ask players for more than "kill zombies, climb the pile, reach the exit".
Each stage gets one main puzzle plus one twist, and every puzzle has to work solo and in co-op.
Where possible, reaching the puzzle should again mean killing zombies and climbing the corpse pile.

**To build one:** ask Claude to "build the next stage puzzle: <idea>". The
`.claude/skills/stage-puzzle` skill has the workflow, architecture, multiplayer rules, test recipe
and pitfalls, with the floor-2 boulder puzzle as the reference implementation. When a stage
ships, tick its box here and rewrite its line to match what was built.

## Physics and props

- [x] **Boulder on a chute** (floor 2): climb the corpse pile to the boulder's ledge, break the
      gate holding it, and the boulder rolls down the chute, smashes the side wall, and you leave
      through the opening.
- [x] **Spring** (floor 3; was "seesaw"): the exit hangs at the very top (y 100), straight over a
      big solid spring at the screen edge. Kill zombies so 30 corpses land on the spring (they
      charge it), pull the lever beside it: a 3-2-1 gives everyone time to hop on, then the spring
      launches them straight up onto the exit while its corpses scatter through the air (spent:
      charge it again for another launch). Too little charge only jiggles
      the lever.
- [x] **Hanging cage** (floor 4): an empty cage hangs under the exit, a cage full of zombies
      mid-screen. Their chains run from two cleats on a high ledge up to the ceiling and over to
      the cages (random order, sometimes crossing): follow them. Three hits on a cleat snap its
      chain. The empty cage lands under the exit as a solid step (the pile there rides up onto
      it), so far fewer corpses are needed; the zombie cage smashes and lets 6 zombies loose.
- [ ] **Explosive barrels**: lure zombies next to a cracked wall, shoot the barrel, and the wall
      breaks.
- [ ] **Push crates**: push crates into stairs. Zombies can knock them over.

## Switches and co-op

- [ ] **Pressure plates**: the door is open only while something stands on the plate (a player, a
      corpse or a crate). Players carry a corpse onto it (carry key, E) or drag one with the monster magnet.
- [ ] **Two levers far apart**: both must be pulled within 3 seconds. Solo needs a timed dash or a
      ranged skill hit.
- [ ] **Weight-limited elevator**: it needs enough weight to go down and a counterweight to come
      back up.
- [ ] **Rotating gears**: each lever hit rotates the platforms 90°. Find the order that makes a
      path.

## Zombies as tools

- [ ] **Special zombie type**: its corpse becomes a temporary bridge, a bomb or a glowing key.
- [ ] **Key carrier**: one zombie carries the exit key and runs away. Chase it down.
- [ ] **Brute charge**: lure a brute into a weak wall and it breaks through.
- [ ] **Frozen corpses**: an ice skill turns a corpse into a solid block to stack.

## Environment hazards

- [ ] **Rising water or acid**: climb before it reaches you (a built-in timer).
- [ ] **Darkness stage**: light torches in sequence to show hidden platforms. Only lit platforms
      are solid.
- [ ] **Wind vents**: shoot fans on or off to steer your jumps.
- [ ] **Collapsing floor**: each platform breaks after you stand on it, so plan your route.

## Logic and exploration

- [ ] **Symbol code**: symbols painted on the walls give the order to hit 3 bells.
- [ ] **Mirror beam**: rotate mirrors so a light beam burns down the barricade.
- [ ] **Generator power**: zombies drop fuel cans. Carry 3 to the generator to power the
      elevator.
- [ ] **Hidden breakable wall**: a crack hints where it is, and a secret route skips the puzzle.

## Waves and defense

- [ ] **Hold the zone**: defend a drill or radio for 60 seconds while zombies swarm, then the door
      opens.
- [ ] **Escort a survivor**: walk an NPC survivor to the exit, and they open the door.

## Making each stage unique

- [ ] **One puzzle per stage**: each stage gets one main puzzle plus one twist (for example,
      boulder plus rising water).
- [ ] **Puzzle pool per biome**: the sewer gets water and valves, the factory gets gears and
      elevators, the graveyard gets darkness and torches.
- [ ] **Teach, then test**: introduce a mechanic safely first, then combine it with zombie
      pressure on later stages.
- [x] **Multiplayer fit**: the host owns puzzle state and sends it in `game-sync`, and every
      trigger sends a VFX event so all players see it (done for the boulder puzzle; it's the
      rule for the rest).

### Suggested next

- [ ] Pressure plate with a carried corpse (uses corpse carrying, or the monster magnet)
- [ ] Explosive barrel (uses the solid props)
