# Zombie Blaster — Fix List

Work through these one at a time in separate sessions.

---

## 1. Reduce HP/MP potion drop rates - done ✅
- Potions drop way too frequently — player never needs to spend gold on them.
- Lower `DROP_HP_POTION_CHANCE` and `DROP_MP_POTION_CHANCE` in `shared/game-constants.ts` so buying potions from the shop becomes necessary.

## 2. Slow down player leveling - done ✅
- Player levels up too fast; XP curve needs to be steeper.
- Adjust `XP_BASE`, `XP_GROWTH`, and/or zombie `xpReward` values in `shared/game-constants.ts`.

## 3. Monster Magnet cannot pull bosses - done ✅
- The "Monster Magnet" pull skill should not affect Boss or DragonBoss zombie types.
- Add a boss check in `performPullSkill()` in `game-engine.ts` to skip `ZombieType.Boss` and `ZombieType.DragonBoss`.

## 4. Prevent enemies from leaving map bounds - done ✅
- Zombies can walk or get knocked off the edges of the canvas.
- Clamp zombie `x` position within `[0, CANVAS_WIDTH - zDef.width]` each tick in `updateZombies()`.
- Spawn zombies randomly in the entire map (on floor or platform) and do not spawn them out of bounds

## 5. Fix UI overlapping the floor - done ✅
- HUD elements render on top of the floor/platforms area so player cannot see whats going on on the ground.
- Adjust positioning or layering so UI does not cover gameplay.
- Make skill view only icon and cooldown
- HP/MP potions are not reflecting the correct key bindings choosen by player

## 6. Fix UI layout for keyboard bindings display - done ✅
- The keyboard bindings UI layout is broken/misaligned.
- Review and fix the layout in the relevant Angular component.

## 7. Fix potions count + key display in UI - done ✅
- The potion count and associated hotkey shown in the HUD are incorrect or mismatched.
- Verify the HUD component displays the correct inventory count and the correct key binding for HP/MP potions.

## 8. Rework Dragon Boss behavior and attacks
- **Flying pattern:** Dragon should fly horizontally in one direction above the ground (not hover in place) but make it a little bit above ground.
- **Ground-only attacks:** use the attack.png sprites from Special-sprites/attack.png make sure dragon is same size in both flying and attacking states.
- dragon should not 'wake up' from death sprite like other zombies it should just fade in in flying mode

## 9. Player defense is too much, zombies needs to make much more damage

##  - done ✅ 10. Make all zombie types vary in all stats so it will be randomly range in speed/damge/knockback force/ hp/ hesitate etc etc but ofcurse keep the logic behind zombies class so if a walker is stronger than spiter make walker hp like 30-40 and spitter 10-20 and each zombie that spawns will be randomly render in this range, (these are only examples do not actually use these numbers)

##  - done ✅ 11. Take the attack-effect-1.png and make it on any zombie or boss when it gets hit by the player its like a mark that the player has hit it

## 12. Make zombies tackle each other and also wont go over each other in z-index so they will be pushed by each other and it will look more real - done ✅

## 13. Make zombies bodies stay on the ground and pile and player could walk on them and climb
