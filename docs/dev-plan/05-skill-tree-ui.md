# Stage 5: Skill Tree UI

## Goal

Create an Angular component that displays all 10 skills for the player's class in a visually appealing skill tree / skill list layout. Players can allocate skill points, see skill descriptions, level progress (0-20), and the effect of the next level.

---

## Prerequisites

- Stage 3 complete (skill point allocation logic in `GameStateService`)
- Stage 4 complete (stat allocation UI pattern established)
- Read skill files: `angular-component/SKILL.md`
- Read workspace rules: `explicit-types-everywhere`, `separate-template-style-files`

---

## Tasks

### 5.1 — Create `SkillTreeComponent`

**Location**: `src/app/components/skill-tree/`

**Files**:
- `skill-tree.component.ts`
- `skill-tree.component.html`
- `skill-tree.component.css`

**Component requirements**:
- Selector: `app-skill-tree`
- ChangeDetection: `OnPush`
- Separate template and style files
- Signal inputs/outputs

**Inputs**:
- `player: InputSignal<CharacterState>` (required)
- `skills: InputSignal<SkillDefinition[]>` (required — all 10 class skills)

**Outputs**:
- `skillAllocated: OutputEmitterRef<string>` — skill ID when player invests a point
- `closed: OutputEmitterRef<void>`

### 5.2 — Define `SkillTreeNode` interface

```typescript
export interface SkillTreeNode {
  skill: SkillDefinition;
  currentLevel: number;
  maxLevel: number;
  canInvest: boolean;       // has skill points + meets level req + not maxed
  isUnlocked: boolean;      // player meets the required character level
  isMaxed: boolean;         // currentLevel === maxLevel
  currentEffect: string;    // human-readable description of current level effect
  nextEffect: string;       // human-readable description of next level effect
  progressPercent: number;  // currentLevel / maxLevel * 100
}
```

### 5.3 — Compute skill tree nodes

```typescript
readonly skillNodes: Signal<SkillTreeNode[]> = computed((): SkillTreeNode[] => {
  const p: CharacterState = this.player();
  const skills: SkillDefinition[] = this.skills();
  const points: number = p.unallocatedSkillPoints;

  return skills.map((skill: SkillDefinition): SkillTreeNode => {
    const currentLevel: number = p.skillLevels[skill.id] ?? 0;
    const isUnlocked: boolean = p.level >= skill.requiredCharacterLevel;
    const isMaxed: boolean = currentLevel >= skill.maxLevel;
    const canInvest: boolean = points > 0 && isUnlocked && !isMaxed;

    return {
      skill,
      currentLevel,
      maxLevel: skill.maxLevel,
      canInvest,
      isUnlocked,
      isMaxed,
      currentEffect: this.describeEffect(skill, currentLevel),
      nextEffect: isMaxed ? 'MAX' : this.describeEffect(skill, currentLevel + 1),
      progressPercent: (currentLevel / skill.maxLevel) * 100,
    };
  });
});
```

### 5.4 — Effect description helpers

Generate human-readable effect strings:

For active skills:
```
"Lv.5: 2.1x damage, 12 MP, 2.8s CD, range 65"
```

For passive skills:
```
"Lv.3: +45 Max HP, +15 Defense"
```

### 5.5 — Template layout

The skill tree should display skills in two columns (active on left, passive on right) or as a vertical list grouped by type:

```
┌───────────────────────────────────────────────────┐
│  🗡️ WARRIOR SKILL TREE                            │
│  Skill Points: 9                                   │
│                                                     │
│  ── ACTIVE SKILLS ──────────────────               │
│                                                     │
│  ┌─────────────────────────────────┐               │
│  │ ⚔️ Power Strike  [████████░░] 8/20             │
│  │ Lv3+ | Strong single-target melee hit           │
│  │ Current: 2.55x dmg, 12MP, 1.8s CD              │
│  │ Next:    2.70x dmg, 12MP, 1.75s CD             │
│  │                               [+ Invest]        │
│  └─────────────────────────────────┘               │
│                                                     │
│  ┌─────────────────────────────────┐               │
│  │ 🔒 Valhalla  [░░░░░░░░░░] 0/20                │
│  │ Requires Lv.18 (locked)                         │
│  └─────────────────────────────────┘               │
│                                                     │
│  ── PASSIVE SKILLS ─────────────────               │
│                                                     │
│  ┌─────────────────────────────────┐               │
│  │ 🛡️ Iron Body  [██████░░░░] 6/20               │
│  │ Lv2+ | Increases defense and max HP             │
│  │ Current: +45 HP, +9 DEF                         │
│  │ Next:    +52 HP, +10.5 DEF                      │
│  │                               [+ Invest]        │
│  └─────────────────────────────────┘               │
│                                                     │
│  [Close]                                            │
└───────────────────────────────────────────────────┘
```

### 5.6 — Styling

- Same overlay pattern as stat allocation (dark bg, centered panel)
- Skill icons are large and colorful
- Progress bar for each skill level (0-20) with gradient fill
- Locked skills appear grayed out with a lock icon
- Maxed skills have a gold border / glow
- Active skills have a blue/cyan tint
- Passive skills have a green tint
- `pointer-events: all`
- Smooth hover effects showing the skill's next-level preview
- Each skill's `color` property from the definition used for its accent

### 5.7 — Skill tooltip on hover

When hovering over a skill, show an expanded tooltip with:
- Full description
- All scaling values at current and next level
- Required character level
- Skill type badge (Active / Passive)

Use CSS positioning (no external tooltip library needed).

### 5.8 — Integrate into game page

- Add a "Skills" button/indicator to the HUD (next to the stat points indicator)
- Show "SKP: X" when there are unallocated skill points
- Pressing a hotkey (e.g., `O`) or clicking opens the skill tree
- Game pauses while skill tree is open

### 5.9 — Update HUD skill slots

The HUD bottom skill bar should now show skills the player has actually invested in, not just class skills. Update the `skillSlots` computed signal in `HudComponent` to filter by `skillLevels > 0`:

```typescript
readonly skillSlots: Signal<SkillSlot[]> = computed((): SkillSlot[] => {
  const p: CharacterState = this.playerData();
  const activeSkills: SkillDefinition[] = SKILLS.filter(
    (s: SkillDefinition) =>
      s.classId === p.classId &&
      s.type === SkillType.Active &&
      (p.skillLevels[s.id] ?? 0) > 0,
  );
  // Map to skill slot display objects...
});
```

---

## Acceptance Criteria

- [ ] Skill tree panel shows all 10 class skills
- [ ] Skills are grouped by type (Active / Passive)
- [ ] Each skill shows its current level, progress bar, and effect description
- [ ] Locked skills (character level too low) are visually grayed out
- [ ] Maxed skills have special visual treatment (gold glow)
- [ ] Clicking "Invest" allocates a skill point and immediately updates the UI
- [ ] Button is disabled when no skill points remain or skill is locked/maxed
- [ ] Tooltip shows full skill details on hover
- [ ] HUD skill bar only shows skills the player has invested in
- [ ] HUD shows "SKP: X" indicator
- [ ] Panel can be opened/closed from the game screen
- [ ] All interactive elements have `data-testid`
- [ ] `npm run build` passes

---

## Files Created

- `src/app/components/skill-tree/skill-tree.component.ts`
- `src/app/components/skill-tree/skill-tree.component.html`
- `src/app/components/skill-tree/skill-tree.component.css`

## Files Modified

- `src/app/pages/game/game.component.ts` (skill tree toggle)
- `src/app/pages/game/game.component.html` (add skill tree panel)
- `src/app/components/hud/hud.component.ts` (update skill slots, add SKP indicator)
- `src/app/components/hud/hud.component.html` (skill point indicator)
- `src/app/components/hud/hud.component.css` (styles)
