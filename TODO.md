# Zombie Blaster — Fix List

Work through these one at a time in separate sessions.

---

## 1. Reduce HP/MP potion drop rates
- Potions drop way too frequently — player never needs to spend gold on them.
- Lower `DROP_HP_POTION_CHANCE` and `DROP_MP_POTION_CHANCE` in `shared/game-constants.ts` so buying potions from the shop becomes necessary.

## 2. Slow down player leveling
- Player levels up too fast; XP curve needs to be steeper.
- Adjust `XP_BASE`, `XP_GROWTH`, and/or zombie `xpReward` values in `shared/game-constants.ts`.

## 3. Monster Magnet cannot pull bosses
- The "Monster Magnet" pull skill should not affect Boss or DragonBoss zombie types.
- Add a boss check in `performPullSkill()` in `game-engine.ts` to skip `ZombieType.Boss` and `ZombieType.DragonBoss`.

## 4. Prevent enemies from leaving map bounds
- Zombies can walk or get knocked off the edges of the canvas.
- Clamp zombie `x` position within `[0, CANVAS_WIDTH - zDef.width]` each tick in `updateZombies()`.
- Spawn zombies randomly in the entire map (on floor or platform) and do not spawn them out of bounds

## 5. Fix UI overlapping the floor
- HUD elements render on top of the floor/platforms area.
- Adjust positioning or layering so UI does not cover gameplay.

## 6. Fix UI layout for keyboard bindings display
- The keyboard bindings UI layout is broken/misaligned.
- Review and fix the layout in the relevant Angular component.

## 7. Fix potions count + key display in UI
- The potion count and associated hotkey shown in the HUD are incorrect or mismatched.
- Verify the HUD component displays the correct inventory count and the correct key binding for HP/MP potions.

## 8. Rework Dragon Boss behavior and attacks
- **Flying pattern:** Dragon should fly horizontally in one direction above the ground (not hover in place). It should patrol/strafe across the map at a fixed altitude.
- **Ground-only attacks:** Dragon projectiles should travel in a straight line downward to hit the ground, not track the player directly.
- **Use both attack sprites:** Currently only one attack sprite sheet is used. Integrate the second attack sprite (`AttackEffect1` / `AttackEffect2`) so the dragon alternates or uses both attack visuals.

## 9. Player defense is too much, zombies needs to make much more damage
