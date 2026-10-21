# Skill tree backlog

First design report: `docs/skill-tree-rework/index.html`. Its full gesture input was dropped. Today
three warrior attacks fire from the attack button (hold 1 s and let go = Power Dash, hold in the air =
Ground Slam, double tap = Slash Blast); every other active and buff sits on the skill bar (keys 1-6,
one key = one skill). Rules: `.claude/rules/skills.md`.
Flow: the `class-skill-tree` skill.

## Classes

- [x] **Warrior**: Combat / Agility / Grit, 19 skills (shipped 2026-10; moved to the skill bar
  2026-10-11, three attack combos the same day). 2026-10-21: Momentum renamed Agility, Brawn renamed Combat; Combat holds
  only the three attack-button moves (Power Dash root, Slash Blast, Ground Slam); Agility got Carry 1
  and Carry 2 (anyone carries 1 corpse or prop, each carry skill +1, max 3).
- [ ] **Warrior attacks, round 2**: parked for a rework, commented out in `WARRIOR_SKILL_TREE`
  (mechanics and animations still in the engine): Power Strike, Rising Uppercut, Heavy Hands,
  Executioner, Dragon Roar (Combat's old capstone). The user will rework them, likely onto the attack
  button, one clear combo each, never two skills on similar inputs.
- [ ] **Assassin** (next): Shadow / Blades / Agility. Port Lucky Seven, Double Jump (passive air
  jump), Claw Mastery (passive), Magic Twin and Dark Sight (buffs). New actives: Shadow Step
  (teleport behind), Caltrops, Smoke Bomb, Rising Kunai, Chain Hook, Shadow Drop (dive when
  airborne), Slide Slash. Corpse Disguise (works while carrying).
- [ ] **Ranger**: Marksman / Trapper / Scout. Charged Shot, Arrow Rain, Bear Trap, Roll Shot.
- [ ] **Mage**: Fire / Frost / Arcane. Bolt, Meteor, Blink, Mana Shield (buff).
- [ ] **Priest**: Light / Ward / Mercy. Holy Beam, Bless (party buff), Holy Shield (buff),
  Resurrection (passive: instant revive).

## Warrior follow-ups

- [ ] Practice dummy at the safe spot (a training zombie that can't die) for trying new moves.
- [ ] Move list tab in the tree window with each skill's looping demo.
- [ ] Drag a skill from the tree window onto a quick slot (today: click a bar slot in the window).
- [ ] Gamepad mapping (skill bar on the face buttons + a shoulder modifier).
- [ ] Balance pass with the playtest lab (floor-1 walkers die to one swing).
