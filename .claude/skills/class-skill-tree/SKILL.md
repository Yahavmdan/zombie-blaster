---
name: class-skill-tree
description: Design, build or change a class's skill tree for Zombie Blaster (branches, nodes, stat curves, the skill bar, the tree window), or port a class from the old SKILLS levels and keys 1-6 to the tree (assassin is next). Use when the user asks for new skills, a new class, a skill rework or rebalance, how a skill is fired, or anything in the skill tree window.
---

# Class skill tree

Reference implementation: the **warrior** (`WARRIOR_SKILL_TREE` in `shared/game-constants.ts`).
Rules: `.claude/rules/skills.md`. Backlog: `docs/skill-ideas.md`. The first design report
(`docs/skill-tree-rework/index.html`) still holds the tree mock and the skill ideas. Its gesture
input was dropped (see below).

## How the user works

- The user talks by voice and waits on every step: few tool calls, short replies.
- New class or big rework: ideas first (an HTML report like `docs/skill-tree-rework`, with animated
  demos built from the game's own sprites), no code until the user says go.
- What the user liked:
  - one point per skill;
  - strength from stats;
  - Dying Light style branches;
  - a level-1 attack skill;
  - demos that show the keys being pressed.
- Input history (2026-10-11):
  1. A full gesture scheme (hold/charge stages, direction + attack, double taps, stances, combo
     finishers) was rejected: messy, skills got mixed up with each other and with plain swings.
  2. A pure hotbar (every active on keys 1-6) was rejected next: "it does not work".
  3. Now: a few attacks on the attack button, each with one clearly different combo (Power Dash =
     hold 1 s and let go, Ground Slam = hold in the air, Slash Blast = double tap); every other
     active and buff on the 1-6 bar; passives just work. The user will move more attacks onto the
     button later. Propose one combo per attack, never two similar inputs; ask before adding one.
  4. 2026-10-21: Combat (was Brawn) holds only those three combo attacks (Power Dash is its root); the other
     Combat skills are parked (commented out in `WARRIOR_SKILL_TREE`) for a rework. "Momentum" is now
     **Agility**, with Carry 1 / Carry 2 (passive `carry` mechanic: carry capacity
     `CORPSE_CARRY_BASE` 1, +`CORPSE_CARRY_SKILL_EXTRA` each, max `CORPSE_CARRY_MAX` 3, read with
     `carryCapacity` in `corpse-carry.ts`; the host uses each guest's relayed `skillLevels`).
     The user called it "attacks" and picked the name "Combat".

## Where things live

| Piece | Location |
|---|---|
| Types, curves, unlock rules, combos, bar helpers | `shared/skill-tree.ts` (`StatCurve`, `TreeSkill`, `AttackCombo`, `ownedComboSkill`, `treeSkillValue`, `treeSkillLockReason`, `isSlottable`, `normalizeSkillBar`, `placeOnSkillBar`, `autoSlotSkill`) |
| Data | `shared/game-constants.ts`: `<CLASS>_SKILL_TREE`, `SKILL_TREES`, `TREE_SKILL_BAR_SLOTS`, `ATTACK_*` (combo timing), `ATTACK_COMBO_HINTS`, `SKILL_*`, `SKILL_TIER_LEVELS` |
| Skill keys | `SKILL_KEY_ACTIONS` in `shared/messages.ts` (`skill1`..`skill6`, slot 0 first) |
| Combos, bar key → skill, mechanics, passives, reactions, combat hooks | `src/app/engine/tree-skill-system.ts` (`keysChanged` records attack edges and queues bar presses, `updateAttack` runs the combos before the swing, `queueSkill` for quick slots, `updateInput` fires the bar) |
| Hooks into combat | `CombatHooks` in `combat-system.ts` (hit multiplier, after-hit, kill, parry, zombie effects) |
| Zombie push/launch/stun (host-applied, clamped) | `src/app/engine/zombie-effects.ts`, `ZombieEffectRequest` |
| Body motion while a skill owns it | `IGameEngine.skillMotion` (rooted, momentum) read by `physics-system.ts` |
| Animations | `skill-animations.ts` (key = skill id), `TREE_SKILL_VFX_LEVEL` |
| Points, learn (auto-slot), respec, bar | `game-state.service.ts` (`allocateSkillPoint`, `respecSkills`, `respecPrice`, `setTreeSkills`, `setSkillBarSlot`); the app's `onPlayerUpdate` merge keeps `skillBar`, and `syncProgression` copies it to the engine |
| Window | `src/app/components/tree-skill-window/`: branch columns, detail ("Press 2" / combo hint / "Always on"), bar strip (click a slot to place the selected active) |
| HUD | skill bar (keys, icons, cooldown shades) and the "New move" plate (`press 2`) in `hud.component`; the quick-slot tray shows the bar skill on a `skillN` keybind slot |
| Server | `zombie-blaster-api/src/validation.ts` (`sanitizeTreeSkills` cleans `skillLevels` and `skillBar`, zombie effect shapes) |
| Tests | `src/app/engine/skill-tree.spec.ts` (data invariants, bar helpers), `game-state.service.spec.ts` (learn/slot/respec), `tree-skill-window.component.spec.ts`, plus e2e: `solo/warrior-skills.spec.ts`, `online/warrior-tree-coop.spec.ts`, `protocol/skill-tree.spec.ts`, `solo/skill-tree.spec.ts` (window) |

## Flow for a class (port or new)

1. **Identity**: 3 branches, one line each (offense / mobility-control / survival-co-op fits most),
   colours from `tokens.css`, a branch icon.
2. **Nodes**: ~20-24; tiers 1-5; 1-2 roots per branch (one should be an attack active, so a fresh
   character has a key to press); at most one capstone per branch, at tier 5 with a tier-4 parent. Port old
   skills into nodes, keep their ids. Mark each node Active / Buff (goes on the bar), Active with a
   `combo` (attack button; ask the user which) or Passive / Reactive (works by itself). Keep the bar
   actives a player wants at once to about six.
3. **Numbers**: `damageMult` + `StatCurve`s against the class's primary stat. Check values at
   level 5 / 10 / 20 builds; cooldown cut < 0.9; nothing that crosses the screen.
4. **Mechanics**: a key press or a combo fires the whole skill. Add a `TreeSkillMechanic` only when no existing
   one fits. Movement goes through `skillMotion`; zombie effects through `affect()`; damage through
   `combat.dealSkillDamage`. A skill that depends on context reads it at the press instead of asking
   for another input (Ground Slam dives when airborne; Leap Strike jumps from the ground and dives
   in the air).
5. **VFX**: animation entry per skill id; anything others must see goes through VfxEvents (see the
   `multiplayer-vfx-sync` skill).
6. **Register** the tree in `SKILL_TREES`. Points per level, the bar, the window, the HUD and the
   server switch over by themselves. Remove the class's entries from `SKILLS` and fix specs that used
   its keys.
7. **Tests**: `skill-tree.spec.ts` runs the invariants for every tree. Then add:
   - `<class>-skills.spec.ts`: one test per active fired from its bar key or combo, plus the learn →
     auto-slot → key flow and a test that a plain swing never fires a combo;
   - an online visibility test;
   - bot updates (`e2e/support/brain.ts`) so bots learn and use the tree.
8. **Docs**: tick the class in `docs/skill-ideas.md`, update this skill and the game-e2e skill notes.

## Pitfalls already hit

- Floor-1 walkers die to one level-1 warrior swing: tests that need a zombie to survive hits use
  `TOUGH_FLOOR` (30) and `warriorArena(p, skills, god, TOUGH_FLOOR)`.
- The probe's `vfxQueuedBy` waits a settle time: check fast state (a launch, i-frames) inside the
  action, not after it.
- A dash runs ~40 ticks (vanish, swish, appear): wait for it before positioning.
- Counter is a key with a short window (`windowMs`); one that closes unused locks it for
  `SKILL_PARRY_LOCKOUT_MS`. Tests press it when the zombie's swing is a few ticks from landing
  (`ticksToHit`).
- The app's `onPlayerUpdate` merge must keep tree fields the engine doesn't track (`skillLevels`,
  `skillBar`, `respecCount`).
- The legacy `.action-bar` in the HUD is hidden (the quick-slot tray replaced it); the tree bar
  lives in the player panel.
- Bash heredocs with quotes broke in this environment: write edit scripts with the Write tool.
