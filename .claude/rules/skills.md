---
paths:
  - "shared/skill-tree.ts"
  - "shared/game-constants.ts"
  - "src/app/engine/tree-skill-system.ts"
  - "src/app/engine/combat-system.ts"
  - "src/app/engine/zombie-effects.ts"
  - "src/app/components/tree-skill-window/**"
---

# Skills and the skill tree

Classes listed in `SKILL_TREES` (warrior today, assassin next) use the skill tree. The others still
use `SKILLS` with levels and keys 1-6 until they are ported; don't add new skills to that system.

- One skill point per level, one at level 1 (`TREE_SKILL_POINTS_PER_LEVEL`, `TREE_STARTING_SKILL_POINTS`).
  A tree skill costs 1 point and has no levels: owned is `skillLevels[id] === 1`. Never add ranks,
  levels or `levelData` tables to a tree skill.
- Unlocking: the tier's level (`SKILL_TIER_LEVELS`) and any one owned parent (`treeSkillLockReason`).
  Each branch has one capstone at tier 5. `skill-tree.spec.ts` checks the data.
- Strength comes from stats only: `damageMult × attack`, plus `StatCurve`s read with `treeSkillValue`
  (`min + (max - min) × s / (s + half)`). Every curve, multiplier, timing and cost lives in
  `shared/game-constants.ts` (`WARRIOR_SKILL_TREE`, `TREE_SKILL_BAR_SLOTS`, `SKILL_*`).
- **Attack combos, then one key per skill.** A few attacks fire from the attack button
  (`TreeSkill.combo`, `AttackCombo`; `TreeSkillSystem.updateAttack` runs before the swing):
  - `Hold`: hold attack on the ground `ATTACK_HOLD_MS` (1 s), then a charge fills
    (`ATTACK_CHARGE_MS`, `CharacterState.skillCharge`, a bar over the head everyone sees); let go to
    fire (Power Dash: longer charge, farther). Before 1 s the held attack keeps swinging.
  - `AirHold`: a press that starts in the air and is held `ATTACK_AIR_HOLD_MS` (Ground Slam: only in
    the air).
  - `DoubleTap`: two presses within `ATTACK_DOUBLE_TAP_MS` (Slash Blast); the first is a normal swing.
  - Right after a dash, a press chains a Rampage dash.

  One skill per combo per tree, each combo clearly different from the others and from a plain swing.
  The user found a full gesture scheme (direction + attack, stances, combo finishers) messy, then
  found the pure 1-6 bar didn't feel right either. They picked these three combos and will rework the
  other attacks onto the button later, one at a time. Hint text: `ATTACK_COMBO_HINTS`.
- Every other active and every buff (`isSlottable`: no combo) fires from the skill bar:
  `CharacterState.skillBar`, `TREE_SKILL_BAR_SLOTS` (6) slots on the keys `skill1`..`skill6`
  (`SKILL_KEY_ACTIONS`). The press edge fires it; a quick slot holding the skill does too. Passives
  and reactives work by themselves and never take a slot.
- Learning an active puts it on the first free slot (`autoSlotSkill`). The tree window's bar strip
  moves, swaps or clears slots (`placeOnSkillBar`). A respec empties the bar. Every bar that comes
  in from storage, the engine or the network goes through `normalizeSkillBar`.
- Context first: no skills on the safe spot; on ropes and ladders only buffs. Carrying blocks skills.
  A skill that owns the body (`busy()`: dash, slam, charge run, leap, backstep, roar root) blocks
  swings and other skills.
- Host authority: a guest never moves zombies. Pushes, launches and stuns go through `affect()` →
  `ZombieEffectRequest` in `player-state`; the host applies them with `applyZombieEffect` (clamped by
  `SKILL_MAX_REMOTE_*`). Damage still goes as `zombie-damage`. Magnet pulls stay `MagnetPullRequest`.
- What other players must see: every cast pushes a `SkillAnimation` VfxEvent (animation key = skill
  id, entry in `skill-animations.ts`); ally buffs and Rally heals are `VfxEventType.AllyBuff` with
  `targetIds`.
- The server sanitizes relayed `skillLevels` and `skillBar` for tree classes (`sanitizeTreeSkills`)
  and rejects bad `zombieEffects`. Add a protocol test when the rules change
  (`e2e/specs/protocol/skill-tree.spec.ts`).
- Every skill ships with:
  - data and curves;
  - a mechanic;
  - an animation and a VfxEvent;
  - an e2e test that fires it from its key (`e2e/specs/solo/<class>-skills.spec.ts`);
  - online visibility when others should see it;
  - its place in the tree window (icon, how it is used, live values).

  Use the `class-skill-tree` skill.
