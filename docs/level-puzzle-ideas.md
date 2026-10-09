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
- [x] **Spring + scale** (floor 3; was "seesaw", then a corpse-charged spring): the exit hangs at
      the very top (y 100), straight over a big solid spring at the screen edge. A scale's pan lies
      in the ground on the far side; a cable runs from it over the ceiling to the spring's button.
      Load 1000 kg onto the scale (corpses by zombie type, boxes and barrels, zombies, players and
      what they carry) and the cable slowly pulls the button up (it sinks back when the weight
      goes). Hit the raised button: a 3-2-1 gives everyone time to hop on, then the spring launches
      them straight up onto the exit; corpses lying on the spring scatter. The scale stays loaded,
      so it can launch again.
- [x] **Hanging cages** (floor 4): 4-5 tarp-covered cages hang on chains: one under the exit,
      the rest mid-screen. Every chain runs from its own cleat on a ledge up into the ceiling,
      where all the identical chains tangle, so nobody knows which cleat drops which cage, nor
      what each one hides (2 zombie cages, 1 loot, the rest empty; the exit cage too). Three hits
      on a cleat snap its chain. The exit cage lands under the exit as a solid step (the pile there
      rides up onto it) and spills its content on top; any other cage falls onto what is under it
      and smashes, letting 4 zombies loose, popping gold and potions, or nothing.
- [ ] **Explosive barrels**: lure zombies next to a cracked wall, shoot the barrel, and the wall
      breaks.
- [ ] **Push crates**: push crates into stairs. Zombies can knock them over.

## Switches and co-op

- [x] **Pressure plate** (floor 5): a barred door stands on the exit and slides open only while the
      plate on the highest ledge across the screen is weighed down: 3 lying corpses (carry them
      there with E and toss them on) or one player standing on it. Only a fully open door lets you
      out. Twist: a zombie walking over the plate kicks a corpse off (one per zombie every 4 s), so
      clear the zombies or bring spares. In co-op a friend can hold it while the others climb out.
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

- [x] Pressure plate with a carried corpse (floor 5)
- [ ] Explosive barrel (uses the solid props)
