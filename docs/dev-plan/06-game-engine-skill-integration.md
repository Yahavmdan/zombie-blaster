# Stage 6: Game Engine Skill Integration

## Goal

Update the game engine to fully support the new skill system: variable-count skill bar, passive bonus application, per-level damage computation, and expanded key bindings for up to 6 active skill slots. Players start with only a basic melee attack and unlock skills by investing points.

---

## Prerequisites

- Stages 1-5 complete
- Read `src/app/engine/game-engine.ts`
- Read `src/app/services/key-bindings.service.ts`
- Read `shared/skill-utils.ts`
- Read `shared/messages.ts` (for `InputKeys`, `KeyBindings`)

---

## Tasks

### 6.1 — Expand `InputKeys` and `KeyBindings`

Update `shared/messages.ts` to support more skill slots:

```typescript
export interface InputKeys {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  attack: boolean;
  skill1: boolean;
  skill2: boolean;
  skill3: boolean;
  skill4: boolean;
  skill5: boolean;
  skill6: boolean;
  openStats: boolean;   // hotkey to open stat panel
  openSkills: boolean;  // hotkey to open skill tree
}
```

Update `DEFAULT_KEY_BINDINGS`:
```typescript
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  jump: [' '],
  attack: ['j'],
  skill1: ['1'],
  skill2: ['2'],
  skill3: ['3'],
  skill4: ['4'],
  skill5: ['5'],
  skill6: ['6'],
  openStats: ['p'],
  openSkills: ['o'],
};
```

### 6.2 — Update `GameEngine` skill slot system

Replace the current 2-slot skill system with a dynamic skill bar:

```typescript
private playerActiveSkills: SkillDefinition[] = []; // up to 6 active skills the player has invested in
private skillCooldowns: Map<string, number> = new Map();
```

Update `start()`:
```typescript
this.playerActiveSkills = SKILLS.filter(
  (s: SkillDefinition) =>
    s.classId === player.classId &&
    s.type === SkillType.Active &&
    (player.skillLevels[s.id] ?? 0) > 0,
).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel)
 .slice(0, 6);
```

### 6.3 — Update skill execution in `update()`

Map skill key presses to the dynamic skill list:

```typescript
if (this.keys.skill1) this.tryPerformSkill(0);
if (this.keys.skill2) this.tryPerformSkill(1);
if (this.keys.skill3) this.tryPerformSkill(2);
if (this.keys.skill4) this.tryPerformSkill(3);
if (this.keys.skill5) this.tryPerformSkill(4);
if (this.keys.skill6) this.tryPerformSkill(5);
```

### 6.4 — Update `tryPerformSkill()` for leveled skills

Use `skill-utils.ts` functions:

```typescript
private tryPerformSkill(slotIndex: number): void {
  if (!this.player) return;
  const skill: SkillDefinition | undefined = this.playerActiveSkills[slotIndex];
  if (!skill) return;

  const skillLevel: number = this.player.skillLevels[skill.id] ?? 0;
  if (skillLevel <= 0) return;

  const cooldownRemaining: number = this.skillCooldowns.get(skill.id) ?? 0;
  if (cooldownRemaining > 0) return;

  const mpCost: number = getSkillMpCost(skill, skillLevel);
  if (this.player.mp < mpCost) return;

  this.player.mp -= mpCost;

  const cooldownMs: number = getSkillCooldown(skill, skillLevel);
  this.skillCooldowns.set(skill.id, Math.floor(cooldownMs / this.fixedDt));

  const damageMultiplier: number = getSkillDamageMultiplier(skill, skillLevel);
  const range: number = getSkillRange(skill, skillLevel);

  // Handle heal skills
  if (damageMultiplier < 0) {
    this.performHealSkill(skill, skillLevel, Math.abs(damageMultiplier));
    return;
  }

  // Handle damage skills
  this.performDamageSkill(skill, damageMultiplier, range);
}
```

### 6.5 — Apply passive bonuses in engine

When syncing progression, ensure passive bonuses are reflected in the player's derived stats. The derived stats should already be computed with passives by `GameStateService`, but the engine should also respect them:

```typescript
syncProgression(player: CharacterState): void {
  if (!this.player) return;
  const leveled: boolean = player.level > this.player.level;

  // Copy all progression data
  this.player.level = player.level;
  this.player.xp = player.xp;
  this.player.xpToNext = player.xpToNext;
  this.player.stats = { ...player.stats };
  this.player.derived = { ...player.derived };
  this.player.allocatedStats = { ...player.allocatedStats };
  this.player.skillLevels = { ...player.skillLevels };
  this.player.unallocatedStatPoints = player.unallocatedStatPoints;
  this.player.unallocatedSkillPoints = player.unallocatedSkillPoints;

  if (leveled) {
    this.player.hp = player.hp;
    this.player.mp = player.mp;
  }

  // Refresh active skill list
  this.playerActiveSkills = SKILLS.filter(
    (s: SkillDefinition) =>
      s.classId === this.player!.classId &&
      s.type === SkillType.Active &&
      (this.player!.skillLevels[s.id] ?? 0) > 0,
  ).sort((a: SkillDefinition, b: SkillDefinition) => a.requiredCharacterLevel - b.requiredCharacterLevel)
   .slice(0, 6);
}
```

### 6.6 — Update controls display

The in-canvas "HOW TO PLAY" box should show the current skill bar bindings:

```typescript
private renderControls(ctx: CanvasRenderingContext2D): void {
  // ... existing control hints ...

  // Dynamic skill slot display
  for (let i: number = 0; i < this.playerActiveSkills.length; i++) {
    const skill: SkillDefinition = this.playerActiveSkills[i];
    const slotKey: string = `${i + 1}`;
    ctx.fillStyle = '#44ccff';
    ctx.fillText(`${slotKey}  ${skill.name}`, x, y);
    y += lineH;
  }

  if (this.playerActiveSkills.length === 0) {
    ctx.fillStyle = '#666688';
    ctx.fillText('No skills yet - invest skill points!', x, y);
  }
}
```

### 6.7 — Update `KeyBindingsService`

If the key bindings service needs updating to support the new keys, add support for `skill3`-`skill6`, `openStats`, `openSkills`.

### 6.8 — Ensure basic melee attack always works

The basic melee attack (J key) should always work regardless of skill investments. It's the player's only attack at the start. Make sure `performAttack()` is independent of the skill system and always available.

### 6.9 — Update HUD skill bar for 6 slots

The HUD bottom bar should now display up to 6 skill slots with keys 1-6:

```typescript
const keys: string[] = ['1', '2', '3', '4', '5', '6'];
```

Show only invested skills, with their current level displayed.

---

## Acceptance Criteria

- [ ] Players start with only basic melee attack (J key)
- [ ] After investing skill points, skills appear in the skill bar (keys 1-6)
- [ ] Each skill uses the correct leveled damage/cooldown/MP cost
- [ ] Passive bonuses are reflected in gameplay
- [ ] Controls display updates dynamically with acquired skills
- [ ] Key bindings for skill3-skill6 work
- [ ] `syncProgression` syncs all new fields
- [ ] `npm run build` passes
- [ ] Game is playable end-to-end with the new system

---

## Files Modified

- `shared/messages.ts` (expanded `InputKeys`, `KeyBindings`)
- `shared/game-constants.ts` (update `DEFAULT_KEY_BINDINGS`)
- `src/app/engine/game-engine.ts` (major refactor)
- `src/app/services/key-bindings.service.ts` (new key support)
- `src/app/components/hud/hud.component.ts` (6-slot skill bar)
- `src/app/components/hud/hud.component.html` (update template)
- `src/app/components/hud/hud.component.css` (adjust styles for 6 slots)
