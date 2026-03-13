# Stage 3: Skill Point System

## Goal

Implement the skill point allocation logic and per-level skill scaling. Each class has 10 skills (active + passive), each with max level 20. On level up, players receive 3 skill points. Active skills scale damage, cooldown, and MP cost with level. Passive skills permanently boost derived stats.

---

## Prerequisites

- Stage 1 complete (new `SkillDefinition` with `scaling`, `passiveBonus`)
- Stage 2 complete (stat system overhaul, `calculateDerived` updated)
- Read `shared/skill.ts`, `shared/game-constants.ts`
- Read `src/app/services/game-state.service.ts`
- Read `src/app/engine/game-engine.ts`

---

## Tasks

### 3.1 — Add skill utility functions to a new `shared/skill-utils.ts`

Create pure functions that compute effective skill values based on skill level:

```typescript
export function getSkillDamageMultiplier(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  return skill.scaling.baseDamage + skill.scaling.damagePerLevel * (level - 1);
}

export function getSkillMpCost(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  return Math.max(1, Math.floor(skill.scaling.baseMpCost + skill.scaling.mpCostPerLevel * (level - 1)));
}

export function getSkillCooldown(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  return Math.max(200, skill.scaling.baseCooldown - skill.scaling.cooldownReductionPerLevel * (level - 1));
}

export function getSkillRange(skill: SkillDefinition, level: number): number {
  if (level <= 0) return 0;
  return skill.scaling.baseRange + skill.scaling.rangePerLevel * (level - 1);
}

export function getPassiveBonusValue(skill: SkillDefinition, level: number): number {
  if (level <= 0 || !skill.passiveBonus) return 0;
  return skill.passiveBonus.baseValue + skill.passiveBonus.valuePerLevel * (level - 1);
}
```

Export from `shared/index.ts`.

### 3.2 — Add `allocateSkillPoint()` to `GameStateService`

```typescript
allocateSkillPoint(skillId: string): void {
  this.player.update((p: CharacterState | null) => {
    if (!p || p.unallocatedSkillPoints <= 0) return p;

    const skillDef: SkillDefinition | undefined = SKILLS.find(
      (s: SkillDefinition) => s.id === skillId && s.classId === p.classId
    );
    if (!skillDef) return p;

    const currentLevel: number = p.skillLevels[skillId] ?? 0;
    if (currentLevel >= GAME_CONSTANTS.MAX_SKILL_LEVEL) return p;
    if (p.level < skillDef.requiredCharacterLevel) return p;

    const newSkillLevels: Record<string, number> = {
      ...p.skillLevels,
      [skillId]: currentLevel + 1,
    };

    // Recalculate derived to include passive bonuses
    const derived: CharacterDerived = this.calculateDerivedWithPassives(
      CHARACTER_CLASSES[p.classId].baseStats,
      p.allocatedStats,
      p.classId,
      newSkillLevels,
    );

    return {
      ...p,
      skillLevels: newSkillLevels,
      unallocatedSkillPoints: p.unallocatedSkillPoints - 1,
      derived,
    };
  });
}
```

### 3.3 — Add `calculateDerivedWithPassives()`

Extend `calculateDerived` to apply passive skill bonuses:

```typescript
calculateDerivedWithPassives(
  baseStats: CharacterStats,
  allocatedStats: CharacterStats,
  classId: CharacterClass,
  skillLevels: Record<string, number>,
): CharacterDerived {
  const derived: CharacterDerived = this.calculateDerived(baseStats, allocatedStats, classId);

  // Apply passive skill bonuses
  const classSkills: SkillDefinition[] = SKILLS.filter(
    (s: SkillDefinition) => s.classId === classId && s.type === SkillType.Passive,
  );

  for (const skill of classSkills) {
    const level: number = skillLevels[skill.id] ?? 0;
    if (level <= 0 || !skill.passiveBonus) continue;

    const bonusValue: number = getPassiveBonusValue(skill, level);
    const target: string = skill.passiveBonus.stat;

    if (target === 'allDamagePercent') {
      derived.attack = Math.floor(derived.attack * (1 + bonusValue / 100));
    } else if (target in derived) {
      (derived as Record<string, number>)[target] += bonusValue;
    }
  }

  // Re-cap crit rate
  derived.critRate = Math.min(derived.critRate, GAME_CONSTANTS.PLAYER_CRIT_RATE_CAP);

  return derived;
}
```

### 3.4 — Update `allocateStatPoint()` to also apply passives

The existing `allocateStatPoint` from Stage 2 should call `calculateDerivedWithPassives` instead of `calculateDerived`, so passive bonuses aren't lost when allocating stats.

### 3.5 — Update `addXp()` to use `calculateDerivedWithPassives`

The level-up recalculation should also use the passives-aware version.

### 3.6 — Add `getPlayerActiveSkills()` helper to `GameStateService`

Returns a list of active skills the player has invested at least 1 point in, sorted by `requiredCharacterLevel`:

```typescript
getPlayerActiveSkills(p: CharacterState): SkillDefinition[] {
  return SKILLS.filter(
    (s: SkillDefinition) =>
      s.classId === p.classId &&
      s.type === SkillType.Active &&
      (p.skillLevels[s.id] ?? 0) > 0,
  ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel);
}
```

### 3.7 — Update engine `tryPerformSkill` to use skill levels

In `game-engine.ts`, update skill damage/cooldown/MP cost to be computed from the player's skill level:

```typescript
private tryPerformSkill(slotIndex: number): void {
  if (!this.player) return;
  const skill: SkillDefinition | undefined = this.playerSkills[slotIndex];
  if (!skill) return;

  const skillLevel: number = this.player.skillLevels[skill.id] ?? 0;
  if (skillLevel <= 0) return;

  const mpCost: number = getSkillMpCost(skill, skillLevel);
  const cooldownMs: number = getSkillCooldown(skill, skillLevel);
  const damageMultiplier: number = getSkillDamageMultiplier(skill, skillLevel);
  const range: number = getSkillRange(skill, skillLevel);

  // ... rest of skill logic using these computed values
}
```

### 3.8 — Update engine skill list management

The engine currently filters `SKILLS` by `unlockLevel`. Change to use the player's `skillLevels`:

```typescript
// Instead of filtering by unlockLevel, use skills the player has invested points in
this.playerSkills = SKILLS.filter(
  (s: SkillDefinition) =>
    s.classId === player.classId &&
    s.type === SkillType.Active &&
    (player.skillLevels[s.id] ?? 0) > 0,
);
```

### 3.9 — Add `getAvailableSkills()` computed signal

In `GameStateService`, add a signal that returns all skills available for the current player to see (including locked ones they haven't reached the level for yet):

```typescript
readonly availableSkills: Signal<SkillDefinition[]> = computed((): SkillDefinition[] => {
  const p: CharacterState | null = this.player();
  if (!p) return [];
  return SKILLS.filter((s: SkillDefinition) => s.classId === p.classId);
});
```

### 3.10 — Export `skill-utils.ts` from barrel

Update `shared/index.ts` to export the new utility file.

---

## Acceptance Criteria

- [ ] `allocateSkillPoint('warrior-slash-blast')` increases that skill to level 1 and deducts a skill point
- [ ] Passive skills (e.g., Iron Body) modify `CharacterDerived` when leveled
- [ ] Active skill damage, cooldown, MP cost, and range scale with skill level
- [ ] Skills with level 0 cannot be used in the engine
- [ ] Players start with no usable skills (all `skillLevels` empty)
- [ ] `getPlayerActiveSkills()` returns only invested active skills
- [ ] `npm run build` passes

---

## Files Changed

- `shared/skill-utils.ts` (new)
- `shared/index.ts`
- `src/app/services/game-state.service.ts`
- `src/app/engine/game-engine.ts`

## Important Notes

- The skill allocation **UI** is in Stage 5. This stage only adds the logic.
- After this stage, players start with no skills. Until the UI is built (Stage 5), you can test by calling `gameStateService.allocateSkillPoint('warrior-power-strike')` from the console.
- Keep the engine's key binding system (skill1 = K, skill2 = L) for now. Stage 6 will expand it to a full skill bar.
