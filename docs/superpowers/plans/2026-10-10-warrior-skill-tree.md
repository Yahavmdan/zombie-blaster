# Warrior skill tree and gestures: implementation plan

Design: `docs/skill-tree-rework/index.html` (approved 2026-10-10, "go, warrior first, assassin later").

## Decisions

- **Two systems side by side.** Classes with a tree (`SKILL_TREES[classId]`, warrior only for now) use
  1 point per level, owned-or-not skills and gestures. Other classes keep `SKILLS`, skill levels
  and keys 1-6 until each is ported (assassin next).
- **Ownership lives in `skillLevels`**: an owned tree skill has `skillLevels[id] === 1`. No new
  save or sync field. A level 1 tree character starts with 1 point.
- **Open questions answered with the report's recommendations**: `XP_GROWTH` 1.6 to 1.3; owning a hold
  skill turns held attack into charge (auto-swing otherwise); respec anywhere, first one free, then
  `RESPEC_GOLD_PER_LEVEL × level`; stat points unchanged; MP regen 1 per second.
- Gestures are read per game tick (50 tps). `setKeys` latches edges so a tap shorter than a tick
  still counts.

## Tasks

1. **Shared data**: `shared/skill-tree.ts` (GestureSlot, StatCurve, TreeSkill, helpers),
   `SkillType.Reactive`, `ZombieState.stunTicks`, `CharacterState.charge`, `ZombieEffectRequest`,
   `VfxEventType.AllyBuff`; `WARRIOR_SKILL_TREE` + `SKILL_TREES` + `GESTURE_*` / tree constants in
   game-constants; warrior entries removed from `SKILLS`. Unit specs for helpers.
2. **GestureReader** (`engine/gesture-reader.ts`), pure, with a unit spec.
3. **Zombie stun + effects** (`engine/zombie-effects.ts`): stun ticks freeze AI and attacks, launch,
   knockdown; host applies guest requests (`zombieEffects` in player-state), clamped.
4. **TreeSkillSystem** (`engine/tree-skill-system.ts`): gesture to skill, charge, combo finisher, all 22
   warrior mechanics, passives and reactives, cooldowns, VFX events. Hooks in CombatSystem (basic hit,
   kill, damage mult), PhysicsSystem (charge root, hang), ZombieSystem (stun), GameEngine (update order,
   floor reset, remote effects, ally buffs).
5. **Rendering**: charge pips and pose (local and remote), stun stars on zombies, new skill animations.
6. **Progression**: GameStateService learn/respec/points per class; e2e probe (`learnSkill`, tree view).
7. **UI**: skill tree window for tree classes (three branches, detail panel, learn, respec), HUD cooldown
   row instead of the skill bar, new-move toast. Legacy view stays for other classes.
8. **Server**: validate `zombieEffects` and sanitize tree `skillLevels` in `player-state`.
9. **Tests**: unit (reader, tree helpers, tree system), e2e solo gestures, online visibility, protocol,
   bot brain uses gestures.
10. **Claude files**: `.claude/rules/skills.md`, `class-skill-tree` skill, CLAUDE.md lines, game-e2e notes.
