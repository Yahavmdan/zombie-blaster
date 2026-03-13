# Stat & Skill System — Development Plan Overview

## Feature Summary

Transform the character progression system from auto-leveling into a MapleStory-inspired manual allocation system where players make meaningful choices about how to build their character.

### Core Changes

1. **Every class starts with only a simple melee attack** — no skills available at level 1
2. **On level up**: +5 stat points + 3 skill points added to a pending pool
3. **Stat points**: player manually allocates into STR, DEX, INT, LUK
4. **Skill points**: player manually invests into class skills (10 per class, max level 20 each)
5. **Stat-to-damage formulas are class-specific** — only the "right" stats make a class stronger (MapleStory-style)
6. **Skills are active or passive**, each with per-level scaling (damage, cooldown, MP cost)
7. **Unique animations and visual effects** for every skill

---

## Class-Stat Priority (MapleStory Reference)

| Class    | Primary Stat | Secondary Stat | Damage Formula Emphasis                     |
| -------- | ------------ | -------------- | ------------------------------------------- |
| Warrior  | STR          | DEX            | STR drives attack; DEX adds accuracy/speed  |
| Ranger   | DEX          | STR            | DEX drives attack; STR adds stability       |
| Mage     | INT          | LUK            | INT drives magic attack; LUK adds crit      |
| Assassin | LUK          | DEX            | LUK drives attack + crit; DEX adds accuracy |
| Priest   | INT          | LUK            | INT drives magic + healing; LUK adds crit   |

---

## Execution Stages

| #  | File                                    | Summary                                           |
| -- | --------------------------------------- | ------------------------------------------------- |
| 01 | `01-shared-types-data-foundation.md`    | Redesign shared types, define all 50 skills        |
| 02 | `02-stat-system-overhaul.md`            | Stat point allocation logic, class-specific damage |
| 03 | `03-skill-point-system.md`              | Skill point allocation, per-level scaling, passives|
| 04 | `04-stat-allocation-ui.md`              | Angular component for stat point allocation        |
| 05 | `05-skill-tree-ui.md`                   | Angular component for skill tree / skill list      |
| 06 | `06-game-engine-skill-integration.md`   | Engine updates for new skill system + skill bar    |
| 07 | `07-skill-animations-vfx.md`           | Unique particle effects and visual polish per skill|
| 08 | `08-balance-polish-integration.md`      | Balance tuning, integration testing, final polish  |

---

## Rules to Follow (Every Stage)

- All shared types in `shared/` — never duplicate between client and server
- Explicit types everywhere (no inference)
- Angular: OnPush, signals, separate template/style files, no ngModel
- No unused variables/imports
- Follow all workspace rules and skills
