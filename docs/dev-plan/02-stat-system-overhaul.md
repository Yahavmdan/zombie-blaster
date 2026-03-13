# Stage 2: Stat System Overhaul

## Goal

Replace the automatic stat growth system with manual stat point allocation. Update `calculateDerived` to use the new class-specific `ClassStatWeights`. On level up, players receive 5 stat points to distribute manually. Stats only increase when the player spends points.

---

## Prerequisites

- Stage 1 complete (shared types updated)
- Read `src/app/services/game-state.service.ts`
- Read `shared/game-constants.ts` (for `CLASS_STAT_WEIGHTS`, `STAT_POINTS_PER_LEVEL`)

---

## Tasks

### 2.1 — Update `GameStateService.createPlayer()`

When creating a new player:
- `allocatedStats` starts as `{ str: 0, dex: 0, int: 0, luk: 0 }`
- `unallocatedStatPoints` starts at `0`
- `unallocatedSkillPoints` starts at `0`
- `skillLevels` starts as `{}`
- Total stats = `baseStats + allocatedStats` (compute and pass to `calculateDerived`)

### 2.2 — Update `GameStateService.calculateDerived()`

Replace the current generic formula with class-specific stat weights:

```typescript
calculateDerived(baseStats: CharacterStats, allocatedStats: CharacterStats, classId: CharacterClass): CharacterDerived {
  const weights: ClassStatWeights = CLASS_STAT_WEIGHTS[classId];
  const totalStats: CharacterStats = {
    str: baseStats.str + allocatedStats.str,
    dex: baseStats.dex + allocatedStats.dex,
    int: baseStats.int + allocatedStats.int,
    luk: baseStats.luk + allocatedStats.luk,
  };

  const primaryValue: number = totalStats[weights.primaryStat];
  const secondaryValue: number = totalStats[weights.secondaryStat];

  return {
    maxHp: GAME_CONSTANTS.PLAYER_BASE_HP + totalStats.str * weights.hpPerStr,
    maxMp: GAME_CONSTANTS.PLAYER_BASE_MP + totalStats.int * weights.mpPerInt,
    attack: Math.floor(primaryValue * weights.attackFromPrimary + secondaryValue * weights.attackFromSecondary),
    defense: Math.floor(totalStats.str * weights.defenseFromStr + totalStats.dex * weights.defenseFromDex),
    speed: GAME_CONSTANTS.PLAYER_MOVE_SPEED + totalStats.dex * GAME_CONSTANTS.PLAYER_SPEED_PER_DEX,
    critRate: Math.min(totalStats.luk * weights.critFromLuk, GAME_CONSTANTS.PLAYER_CRIT_RATE_CAP),
    critDamage: GAME_CONSTANTS.PLAYER_CRIT_DAMAGE_BASE + totalStats.luk * weights.critDmgFromLuk,
  };
}
```

This ensures:
- A Warrior gains the most attack from STR
- A Ranger gains the most attack from DEX
- A Mage gains the most attack from INT
- An Assassin gains the most attack from LUK
- A Priest gains the most attack from INT (with bonus healing from INT later in Stage 3)

### 2.3 — Update `GameStateService.addXp()`

Change the level-up logic:
- **Remove** automatic stat growth (`growth.str`, etc.)
- **Add** `STAT_POINTS_PER_LEVEL` (5) to `unallocatedStatPoints` on each level-up
- **Add** `SKILL_POINTS_PER_LEVEL` (3) to `unallocatedSkillPoints` on each level-up
- Recalculate derived stats (they may not change since stats didn't change, but HP/MP should still refill)
- Still refill HP/MP on level-up

```typescript
while (xp >= xpToNext) {
  xp -= xpToNext;
  level++;
  pendingStatPoints += GAME_CONSTANTS.STAT_POINTS_PER_LEVEL;
  pendingSkillPoints += GAME_CONSTANTS.SKILL_POINTS_PER_LEVEL;
  xpToNext = Math.floor(GAME_CONSTANTS.XP_BASE * Math.pow(GAME_CONSTANTS.XP_GROWTH, level - 1));
}
```

### 2.4 — Add `allocateStatPoint()` method

```typescript
allocateStatPoint(stat: keyof CharacterStats): void {
  this.player.update((p: CharacterState | null) => {
    if (!p || p.unallocatedStatPoints <= 0) return p;

    const newAllocated: CharacterStats = {
      ...p.allocatedStats,
      [stat]: p.allocatedStats[stat] + 1,
    };

    const derived: CharacterDerived = this.calculateDerived(
      CHARACTER_CLASSES[p.classId].baseStats,
      newAllocated,
      p.classId,
    );

    return {
      ...p,
      allocatedStats: newAllocated,
      unallocatedStatPoints: p.unallocatedStatPoints - 1,
      stats: {
        str: CHARACTER_CLASSES[p.classId].baseStats.str + newAllocated.str,
        dex: CHARACTER_CLASSES[p.classId].baseStats.dex + newAllocated.dex,
        int: CHARACTER_CLASSES[p.classId].baseStats.int + newAllocated.int,
        luk: CHARACTER_CLASSES[p.classId].baseStats.luk + newAllocated.luk,
      },
      derived,
    };
  });
}
```

### 2.5 — Add `getTotalStats()` helper

Utility to compute `baseStats + allocatedStats` for use anywhere:

```typescript
getTotalStats(p: CharacterState): CharacterStats {
  const base: CharacterStats = CHARACTER_CLASSES[p.classId].baseStats;
  return {
    str: base.str + p.allocatedStats.str,
    dex: base.dex + p.allocatedStats.dex,
    int: base.int + p.allocatedStats.int,
    luk: base.luk + p.allocatedStats.luk,
  };
}
```

### 2.6 — Remove old stat formula constants (cleanup)

Remove from `GAME_CONSTANTS` (now replaced by `CLASS_STAT_WEIGHTS`):
- `PLAYER_ATTACK_STR_MULT`
- `PLAYER_ATTACK_DEX_MULT`
- `PLAYER_DEFENSE_STR_MULT`
- `PLAYER_DEFENSE_DEX_DIVISOR`
- `PLAYER_CRIT_PER_LUK`
- `PLAYER_CRIT_DAMAGE_PER_LUK`

Keep:
- `PLAYER_BASE_HP`, `PLAYER_BASE_MP`
- `PLAYER_SPEED_PER_DEX`
- `PLAYER_CRIT_RATE_CAP`, `PLAYER_CRIT_DAMAGE_BASE`

### 2.7 — Update `GameEngine.syncProgression()`

The engine's `syncProgression` method needs to pass the new player data correctly. Ensure it copies `allocatedStats`, `unallocatedStatPoints`, `unallocatedSkillPoints`, and `skillLevels`.

### 2.8 — Fix compile errors

After these changes, fix any compile errors in:
- `game-state.service.ts`
- `game-engine.ts`
- Any component that references the old `calculateDerived` signature

---

## Acceptance Criteria

- [ ] Level-up no longer auto-grows stats
- [ ] Level-up grants 5 stat points and 3 skill points to pending pool
- [ ] `allocateStatPoint('str')` increases STR by 1 and recalculates derived stats
- [ ] Derived stats use `CLASS_STAT_WEIGHTS` — a Warrior putting points into STR gets much more attack than putting points into INT
- [ ] Old formula constants removed
- [ ] `npm run build` passes
- [ ] Existing game still runs (melee attack works, zombies spawn, player takes damage)

---

## Files Changed

- `src/app/services/game-state.service.ts`
- `src/app/engine/game-engine.ts`
- `shared/game-constants.ts` (cleanup old constants)

## Important Notes

- The stat allocation **UI** is in Stage 4. This stage only adds the logic/service methods.
- After this stage, players will level up but stats won't increase until the UI is built. That is fine — the service method works, it just has no UI trigger yet.
- Test by calling `allocateStatPoint()` from the browser console if needed.
