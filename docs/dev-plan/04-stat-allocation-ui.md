# Stage 4: Stat Allocation UI

## Goal

Create an Angular component that lets players allocate their pending stat points. The panel shows current stats, how each stat affects their character (with preview of the next point), and a clear visual indication of which stat is primary for their class.

---

## Prerequisites

- Stage 2 complete (stat allocation logic in `GameStateService`)
- Read skill files: `ac-base-angular-workflow/SKILL.md`, `angular-component/SKILL.md`
- Read workspace rules: `explicit-types-everywhere`, `separate-template-style-files`

---

## Tasks

### 4.1 — Create `StatAllocationComponent`

**Location**: `src/app/components/stat-allocation/`

**Files**:
- `stat-allocation.component.ts`
- `stat-allocation.component.html`
- `stat-allocation.component.css`

**Component requirements**:
- Selector: `app-stat-allocation`
- ChangeDetection: `OnPush`
- Standalone (default Angular v20+)
- Separate template and style files
- Signal inputs/outputs
- Host class: `stat-allocation`

**Inputs**:
- `player: InputSignal<CharacterState>` (required)

**Outputs**:
- `statAllocated: OutputEmitterRef<keyof CharacterStats>` — emitted when player clicks a +1 button
- `closed: OutputEmitterRef<void>` — emitted when player closes the panel

**Computed signals**:
- `hasPoints: Signal<boolean>` — whether player has unallocated stat points
- `statRows: Signal<StatRow[]>` — one row per stat (STR, DEX, INT, LUK) with current value, whether it's primary/secondary, and preview of what +1 would do
- `classWeights: Signal<ClassStatWeights>` — the weights for this class

### 4.2 — Define `StatRow` interface

```typescript
export interface StatRow {
  key: keyof CharacterStats;
  label: string;
  icon: string;
  currentValue: number;
  baseValue: number;
  allocatedValue: number;
  isPrimary: boolean;
  isSecondary: boolean;
  previewDelta: StatPreviewDelta;
}

export interface StatPreviewDelta {
  attack: number;
  defense: number;
  maxHp: number;
  maxMp: number;
  speed: number;
  critRate: number;
  critDamage: number;
}
```

### 4.3 — Implement stat preview logic

For each stat, compute what the derived stats would be if the player added +1 to that stat, then show the delta:

```typescript
private computePreview(player: CharacterState, stat: keyof CharacterStats): StatPreviewDelta {
  const previewAllocated: CharacterStats = {
    ...player.allocatedStats,
    [stat]: player.allocatedStats[stat] + 1,
  };
  const currentDerived: CharacterDerived = player.derived;
  const previewDerived: CharacterDerived = this.gameState.calculateDerivedWithPassives(
    CHARACTER_CLASSES[player.classId].baseStats,
    previewAllocated,
    player.classId,
    player.skillLevels,
  );

  return {
    attack: previewDerived.attack - currentDerived.attack,
    defense: previewDerived.defense - currentDerived.defense,
    maxHp: previewDerived.maxHp - currentDerived.maxHp,
    maxMp: previewDerived.maxMp - currentDerived.maxMp,
    speed: +(previewDerived.speed - currentDerived.speed).toFixed(2),
    critRate: +(previewDerived.critRate - currentDerived.critRate).toFixed(1),
    critDamage: +(previewDerived.critDamage - currentDerived.critDamage).toFixed(1),
  };
}
```

### 4.4 — Template design

The panel should be a floating overlay (modal-like) with:

```
┌──────────────────────────────────────┐
│  ⚔️ ALLOCATE STAT POINTS            │
│  Points remaining: 15               │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ 💪 STR   25 (base 15 + 10)  │   │
│  │ ★ PRIMARY                    │   │
│  │ +1 → ATK +3.5  HP +12  DEF +1│  │
│  │                     [+] btn  │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ 🏃 DEX   18 (base 8 + 10)   │   │
│  │ ☆ SECONDARY                  │   │
│  │ +1 → ATK +1.0  SPD +0.05    │   │
│  │                     [+] btn  │   │
│  └──────────────────────────────┘   │
│                                      │
│  ... INT, LUK rows ...              │
│                                      │
│  [Close]                             │
└──────────────────────────────────────┘
```

Key design:
- Primary stat row has a gold/highlighted border
- Secondary stat row has a silver border
- Other stats have muted borders
- Preview deltas are shown in green (+) for beneficial changes
- `+` button is disabled when no points remain
- Use `@for` for stat rows, `@if` for conditional preview display
- `data-testid` on all interactive elements

### 4.5 — Styling

- Dark semi-transparent background overlay
- Panel centered on screen
- Tailwind utility classes for layout
- Custom CSS for stat-specific colors:
  - STR: `#ff4444` (red)
  - DEX: `#44cc44` (green)
  - INT: `#4488ff` (blue)
  - LUK: `#ffaa22` (gold)
- Smooth transitions on value changes
- `pointer-events: all` on the panel (since HUD has `pointer-events: none`)

### 4.6 — Integrate into game page

In the game component (or HUD), conditionally show the stat allocation panel:
- Show a small "SP: X" indicator in the HUD when there are unallocated stat points
- Clicking the indicator (or pressing a hotkey like `P`) opens the panel
- The game should **pause** (or the panel overlays) while allocating
- When closed, resume game

### 4.7 — Add level-up notification

When a player levels up and receives stat/skill points, show a brief toast/notification:
- "LEVEL UP! Lv.X → Lv.Y"
- "+5 Stat Points, +3 Skill Points"
- Gold text with glow effect
- Auto-dismiss after 3 seconds

---

## Acceptance Criteria

- [ ] Stat allocation panel renders with all 4 stats
- [ ] Each stat shows base value + allocated value
- [ ] Primary/secondary stats are visually highlighted per class
- [ ] Preview shows what +1 to each stat would change
- [ ] Clicking `+` calls `gameStateService.allocateStatPoint()` and updates immediately
- [ ] Panel disables `+` buttons when no points remain
- [ ] Panel can be opened/closed from the game screen
- [ ] Level-up notification appears on level up
- [ ] All interactive elements have `data-testid`
- [ ] OnPush, signals, separate files, explicit types
- [ ] `npm run build` passes

---

## Files Created

- `src/app/components/stat-allocation/stat-allocation.component.ts`
- `src/app/components/stat-allocation/stat-allocation.component.html`
- `src/app/components/stat-allocation/stat-allocation.component.css`

## Files Modified

- `src/app/pages/game/game.component.ts` (integrate panel toggle)
- `src/app/pages/game/game.component.html` (add panel + SP indicator)
- `src/app/components/hud/hud.component.ts` (add SP indicator)
- `src/app/components/hud/hud.component.html` (add SP indicator)
- `src/app/components/hud/hud.component.css` (SP indicator styles)
