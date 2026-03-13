# Stage 1: Shared Types & Data Foundation

## Goal

Redesign the shared type system to support manual stat/skill point allocation, 10 skills per class (active + passive, max level 20), and class-specific stat scaling. This stage is **data only** — no UI or engine changes.

---

## Prerequisites

- Read `shared/character.ts`, `shared/skill.ts`, `shared/game-constants.ts`, `shared/messages.ts`, `shared/index.ts`
- Read workspace rules: `explicit-types-everywhere`, `shared-types`, `no-unused-vars`

---

## Tasks

### 1.1 — Update `CharacterState` in `shared/character.ts`

Add these fields to `CharacterState`:

```typescript
unallocatedStatPoints: number;   // pending stat points to spend
unallocatedSkillPoints: number;  // pending skill points to spend
allocatedStats: CharacterStats;  // points the player manually added (separate from base)
skillLevels: Record<string, number>; // skill id -> invested level (0-20)
```

### 1.2 — Redesign `SkillDefinition` in `shared/skill.ts`

Replace the current flat `SkillDefinition` with a richer structure:

```typescript
export enum SkillType {
  Active = 'active',
  Passive = 'passive',
}

export interface SkillScaling {
  baseDamage: number;          // damage multiplier at level 1
  damagePerLevel: number;      // additional multiplier per skill level
  baseMpCost: number;          // MP cost at level 1
  mpCostPerLevel: number;      // additional MP cost per level (can be negative for efficiency)
  baseCooldown: number;        // cooldown (ms) at level 1
  cooldownReductionPerLevel: number; // ms reduced per level
  baseRange: number;           // range at level 1
  rangePerLevel: number;       // additional range per level
}

export interface PassiveBonus {
  stat: keyof CharacterDerived | 'allDamagePercent'; // which derived stat this passive boosts
  baseValue: number;           // value at level 1
  valuePerLevel: number;       // additional value per level
}

export interface SkillDefinition {
  id: string;
  name: string;
  classId: CharacterClass;
  type: SkillType;
  description: string;
  maxLevel: number;            // always 20
  requiredCharacterLevel: number; // character level to unlock skill point investment
  icon: string;
  color: string;               // skill color for particles/effects
  scaling: SkillScaling;       // only meaningful for active skills
  passiveBonus: PassiveBonus | null; // only meaningful for passive skills
  hitCount: number;            // number of hits per activation (e.g., 1 for single-hit, 6 for multi-hit)
  aoeRadius: number;           // 0 = single target, >0 = area of effect radius
  animationKey: string;        // key to identify which animation to play
}
```

### 1.3 — Add class-specific stat weight constants to `shared/game-constants.ts`

Define per-class damage formulas. Each class should have a `StatWeights` configuration:

```typescript
export interface ClassStatWeights {
  primaryStat: keyof CharacterStats;
  secondaryStat: keyof CharacterStats;
  attackFromPrimary: number;    // attack gained per point of primary stat
  attackFromSecondary: number;  // attack gained per point of secondary stat
  defenseFromStr: number;
  defenseFromDex: number;
  hpPerStr: number;             // HP gained per STR point (class-specific multiplier)
  mpPerInt: number;             // MP gained per INT point (class-specific multiplier)
  critFromLuk: number;          // crit rate per LUK
  critDmgFromLuk: number;       // crit damage per LUK
}

export const CLASS_STAT_WEIGHTS: Record<CharacterClass, ClassStatWeights> = {
  [CharacterClass.Warrior]: {
    primaryStat: 'str',
    secondaryStat: 'dex',
    attackFromPrimary: 3.5,    // STR heavily boosts warrior attack
    attackFromSecondary: 1.0,  // DEX gives minor attack boost
    defenseFromStr: 1.5,
    defenseFromDex: 0.5,
    hpPerStr: 12,
    mpPerInt: 4,
    critFromLuk: 0.5,
    critDmgFromLuk: 1.0,
  },
  [CharacterClass.Ranger]: {
    primaryStat: 'dex',
    secondaryStat: 'str',
    attackFromPrimary: 3.5,    // DEX heavily boosts ranger attack
    attackFromSecondary: 1.0,
    defenseFromStr: 0.5,
    defenseFromDex: 1.0,
    hpPerStr: 8,
    mpPerInt: 6,
    critFromLuk: 1.0,
    critDmgFromLuk: 1.5,
  },
  [CharacterClass.Mage]: {
    primaryStat: 'int',
    secondaryStat: 'luk',
    attackFromPrimary: 4.0,    // INT massively boosts mage attack
    attackFromSecondary: 0.5,
    defenseFromStr: 0.3,
    defenseFromDex: 0.3,
    hpPerStr: 6,
    mpPerInt: 14,
    critFromLuk: 1.0,
    critDmgFromLuk: 2.0,
  },
  [CharacterClass.Assassin]: {
    primaryStat: 'luk',
    secondaryStat: 'dex',
    attackFromPrimary: 3.0,    // LUK drives assassin attack
    attackFromSecondary: 1.5,  // DEX significant secondary
    defenseFromStr: 0.5,
    defenseFromDex: 1.0,
    hpPerStr: 7,
    mpPerInt: 5,
    critFromLuk: 2.0,          // assassins get extra crit from LUK
    critDmgFromLuk: 3.0,       // and extra crit damage
  },
  [CharacterClass.Priest]: {
    primaryStat: 'int',
    secondaryStat: 'luk',
    attackFromPrimary: 3.5,    // INT drives priest holy damage
    attackFromSecondary: 0.8,
    defenseFromStr: 0.5,
    defenseFromDex: 0.5,
    hpPerStr: 8,
    mpPerInt: 12,
    critFromLuk: 0.8,
    critDmgFromLuk: 1.5,
  },
};
```

### 1.4 — Update leveling constants

Add to `GAME_CONSTANTS`:

```typescript
STAT_POINTS_PER_LEVEL: 5,
SKILL_POINTS_PER_LEVEL: 3,
MAX_SKILL_LEVEL: 20,
```

### 1.5 — Define all 50 skills (10 per class)

Replace the current `SKILLS` array in `game-constants.ts` with the full set. Below is the complete list based on MapleStory research.

#### Warrior Skills (STR-based, melee, tanky)
| # | Name              | Type    | Unlock Lv | Inspiration                | Description |
|---|-------------------|---------|-----------|----------------------------|-------------|
| 1 | Power Strike      | Active  | 3         | Power Strike               | Strong single-target melee hit |
| 2 | Slash Blast       | Active  | 5         | Slash Blast                | Wide arc slash hitting nearby enemies |
| 3 | Iron Body         | Passive | 2         | Iron Body                  | Increases defense and max HP |
| 4 | War Leap          | Active  | 8         | War Leap                   | Dash forward dealing damage on contact |
| 5 | Weapon Mastery    | Passive | 4         | Sword/Axe Mastery          | Increases min damage consistency |
| 6 | Rage              | Active  | 10        | Rage                       | Temporary attack boost, costs HP |
| 7 | Ground Smash      | Active  | 12        | Ground Smash               | AoE shockwave around player |
| 8 | Armor Crash       | Active  | 15        | Armor Crash                | Debuff enemies, reducing their defense |
| 9 | Power Stance      | Passive | 6         | Power Stance               | Chance to resist knockback |
| 10| Valhalla          | Active  | 18        | Enrage / Rush              | Ultimate: massive damage + brief invincibility |

#### Ranger Skills (DEX-based, ranged)
| # | Name              | Type    | Unlock Lv | Inspiration                | Description |
|---|-------------------|---------|-----------|----------------------------|-------------|
| 1 | Arrow Blow        | Active  | 3         | Arrow Blow                 | Quick single arrow shot |
| 2 | Double Shot       | Active  | 5         | Double Shot                | Fire two arrows rapidly |
| 3 | Critical Shot     | Passive | 2         | Critical Shot              | Increases crit rate for ranged attacks |
| 4 | Arrow Bomb        | Active  | 8         | Arrow Bomb                 | Explosive arrow, AoE damage |
| 5 | Archery Mastery   | Passive | 4         | Bow Mastery                | Increases ranged damage consistency |
| 6 | Focus             | Passive | 6         | Focus                      | Increases accuracy and avoidability |
| 7 | Arrow Rain        | Active  | 10        | Arrow Rain                 | Arrows fall from sky in a zone |
| 8 | Strafe            | Active  | 12        | Strafe                     | Rapid 4-hit combo on single target |
| 9 | Evasion Boost     | Passive | 15        | Evasion Boost              | Dodge chance + speed bonus |
| 10| Hurricane         | Active  | 18        | Hurricane                  | Ultimate: rapid-fire stream of arrows |

#### Mage Skills (INT-based, AoE magic)
| # | Name              | Type    | Unlock Lv | Inspiration                | Description |
|---|-------------------|---------|-----------|----------------------------|-------------|
| 1 | Energy Bolt       | Active  | 3         | Energy Bolt                | Basic magic projectile |
| 2 | Fireball          | Active  | 5         | Fire Arrow                 | Fireball with splash damage |
| 3 | MP Boost          | Passive | 2         | Improving MP Recovery      | Increases max MP and MP regen |
| 4 | Ice Beam          | Active  | 8         | Cold Beam                  | Freezing projectile, slows enemies |
| 5 | Spell Mastery     | Passive | 4         | Spell Mastery              | Increases magic damage consistency |
| 6 | Teleport          | Active  | 6         | Teleport                   | Short-range blink |
| 7 | Chain Lightning   | Active  | 10        | Chain Lightning             | Lightning bounces between enemies |
| 8 | Meteor Shower     | Active  | 15        | Meteor                     | Massive AoE fire from sky |
| 9 | Magic Guard       | Passive | 12        | Magic Guard                | Portion of damage taken from MP instead |
| 10| Infinity          | Active  | 18        | Infinity                   | Ultimate: unlimited MP + damage boost for duration |

#### Assassin Skills (LUK-based, fast melee + thrown)
| # | Name              | Type    | Unlock Lv | Inspiration                | Description |
|---|-------------------|---------|-----------|----------------------------|-------------|
| 1 | Lucky Seven       | Active  | 3         | Lucky Seven                | Throw two quick projectiles |
| 2 | Shadow Strike     | Active  | 5         | Disorder / Steal           | Dash-strike with high crit chance |
| 3 | Nimble Body       | Passive | 2         | Nimble Body                | Increases speed and avoidability |
| 4 | Dark Sight        | Active  | 6         | Dark Sight                 | Brief invisibility, next attack crits |
| 5 | Dagger Mastery    | Passive | 4         | Dagger Mastery             | Increases min damage with daggers |
| 6 | Haste             | Active  | 8         | Haste                      | Temporarily boosts speed and jump |
| 7 | Savage Blow       | Active  | 10        | Savage Blow                | Rapid 6-hit combo attack |
| 8 | Shadow Partner    | Active  | 12        | Shadow Partner             | Summon shadow that mimics attacks |
| 9 | Venomous Stab     | Passive | 15        | Venom                      | Attacks have chance to poison |
| 10| Assassinate       | Active  | 18        | Assassinate / Nightlord    | Ultimate: massive single-target burst |

#### Priest Skills (INT-based, support + holy)
| # | Name              | Type    | Unlock Lv | Inspiration                | Description |
|---|-------------------|---------|-----------|----------------------------|-------------|
| 1 | Holy Arrow        | Active  | 3         | Holy Arrow                 | Light projectile, bonus vs undead |
| 2 | Heal              | Active  | 5         | Heal                       | Restore HP to self and nearby allies |
| 3 | Bless             | Passive | 2         | Bless                      | Increases all stats slightly |
| 4 | Holy Symbol       | Active  | 8         | Holy Symbol                | Temporary XP boost for party |
| 5 | Spell Mastery     | Passive | 4         | Spell Mastery              | Increases magic damage consistency |
| 6 | Invincible        | Passive | 6         | Invincible                 | Reduces incoming damage by flat amount |
| 7 | Shining Ray       | Active  | 10        | Shining Ray                | Beam of light hitting enemies in a line |
| 8 | Dispel            | Active  | 12        | Dispel                     | Remove debuffs, damage undead in area |
| 9 | Holy Shield       | Passive | 15        | Holy Shield                | Chance to block incoming damage entirely |
| 10| Genesis           | Active  | 18        | Genesis                    | Ultimate: massive holy AoE, heals allies |

### 1.6 — Update `shared/index.ts`

Make sure all new exports are re-exported from the barrel file.

### 1.7 — Remove `growthPerLevel` from `CharacterClassDefinition`

Since stat growth is now manual (player allocates stat points), remove the `growthPerLevel` field from `CharacterClassDefinition`. Only `baseStats` should remain as the starting stats.

---

## Acceptance Criteria

- [ ] `CharacterState` has `unallocatedStatPoints`, `unallocatedSkillPoints`, `allocatedStats`, `skillLevels`
- [ ] `SkillDefinition` supports `SkillType.Active` / `SkillType.Passive`, `maxLevel: 20`, `scaling`, `passiveBonus`
- [ ] `CLASS_STAT_WEIGHTS` defined for all 5 classes
- [ ] 50 skills defined (10 per class) with proper scaling values
- [ ] `GAME_CONSTANTS` has `STAT_POINTS_PER_LEVEL`, `SKILL_POINTS_PER_LEVEL`, `MAX_SKILL_LEVEL`
- [ ] `growthPerLevel` removed from class definitions
- [ ] All types explicitly annotated, no unused vars
- [ ] Project compiles: `npm run build` passes

---

## Files Changed

- `shared/character.ts`
- `shared/skill.ts`
- `shared/game-constants.ts`
- `shared/index.ts`

## Important Notes

- Do NOT touch any UI components or game engine code yet — that comes in later stages.
- After editing shared types, other files will have compile errors. That is expected. Fix ONLY the compile errors caused by the type changes in the files listed above. Services and components will be fixed in subsequent stages.
- When defining skill `scaling` values, use reasonable numbers. At level 1, skills should be noticeably weaker than level 20. For example: a skill with `baseDamage: 1.5` and `damagePerLevel: 0.15` would do `1.5x` at level 1 and `4.35x` at level 20.
