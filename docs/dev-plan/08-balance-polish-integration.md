# Stage 8: Balance, Polish & Integration

## Goal

Final pass to balance the stat system, skill damage, XP curves, and overall gameplay feel. Integrate all systems together, fix edge cases, and ensure the full flow works end-to-end: start game → kill zombies → level up → allocate stats → invest skills → use skills → repeat.

---

## Prerequisites

- Stages 1-7 complete
- Full game playable with new systems

---

## Tasks

### 8.1 — Balance stat formulas

Play-test each class and adjust `CLASS_STAT_WEIGHTS` so that:

| Class    | Feel                                                       |
| -------- | ---------------------------------------------------------- |
| Warrior  | Hits hard with STR, tanky with high HP/DEF, slow but powerful |
| Ranger   | Fast attacks from range, DEX gives solid consistent damage  |
| Mage     | Glass cannon — INT gives massive magic damage but low HP    |
| Assassin | Crits frequently and for huge damage with LUK, squishy     |
| Priest   | Moderate damage, strong healing, good survivability         |

**Balance criteria**:
- At level 10 with optimal stat allocation, each class should kill a Walker in ~2-3 hits
- At level 1, a Walker should take ~5-8 melee hits to kill
- Wrong-stat builds (e.g., Warrior with all INT) should feel noticeably weaker (~50% less damage)
- No class should feel useless if given "bad" stats, but the optimal path should be 2-3x better

### 8.2 — Balance skill damage scaling

Ensure skill progression feels rewarding:

- **Level 1 skill**: ~50% stronger than basic melee attack
- **Level 10 skill**: ~3x stronger than basic melee attack
- **Level 20 skill**: ~6-8x stronger than basic melee attack
- **Ultimate skills** (Level 18 unlock): at max level should feel devastating but have long cooldowns
- **Passive skills**: should provide ~20-40% total stat improvement at max level

### 8.3 — XP curve adjustment

The XP curve may need rebalancing since players now need to level up more to unlock all skills:

- Players should reach level 5 (first wave of skill unlocks) within ~5-10 minutes of gameplay
- Level 10 (mid-tier skills) in ~20-30 minutes
- Level 18 (ultimate skill) should require significant grinding (~1-2 hours)
- Zombie XP rewards may need scaling with wave number

Consider adjusting:
```typescript
XP_BASE: 80,        // slightly lower to speed up early levels
XP_GROWTH: 1.4,     // slightly gentler curve
```

### 8.4 — MP economy balance

Skills should feel usable but not spammable:
- Players should be able to use their main attack skill ~10-15 times before running out of MP
- MP potions should restore enough for ~3-5 skill uses
- High-level skills with reduced MP cost (from leveling) should feel like a meaningful upgrade

### 8.5 — Edge case handling

Fix these potential issues:

1. **Level up during stat/skill panel open**: data should update live
2. **Player dies with unspent points**: points should persist (not lost on death)
3. **Multiple rapid level-ups**: all pending points should accumulate correctly
4. **Skill bar reordering**: if a player invests in skill #7 before skill #1, the bar should still work
5. **Passive + stat interaction**: passive that boosts critRate + LUK allocation both affect crit — ensure no double-counting
6. **Zero-damage edge case**: if player has extremely low stats, minimum damage should be 1

### 8.6 — UI polish

- **Stat allocation panel**: add quick "Auto-Allocate" button that puts all pending points into the class's primary stat (convenience feature)
- **Skill tree**: add "Recommended" badge on the class's most important skills (primary damage skill + main passive)
- **HUD**: show a pulsing notification dot when there are unspent points
- **Character select**: show the class's recommended stat focus (e.g., "Primary: STR" for Warrior)
- **Smooth number transitions**: stat values should count up smoothly when allocating

### 8.7 — Update character select screen

Add info about each class's stat focus:

```
⚔️ Warrior
Heavy melee fighter with high HP and defense.
Primary: STR | Secondary: DEX
"Put your points in Strength to hit harder!"
```

### 8.8 — Keyboard shortcut summary

Update the in-game controls display and any help text:

```
Movement:  A/D or Arrows
Jump:      W/Up or Space
Climb:     W/S on rope
Attack:    J (basic melee)
Skills:    1-6 (skill bar)
Stats:     P (open stat panel)
Skills:    O (open skill tree)
```

### 8.9 — Integration testing checklist

Manually verify the full flow for each class:

- [ ] **Warrior**: Create → Kill zombies → Level up → Put points in STR → Invest in Power Strike → Use skill → Feel stronger
- [ ] **Ranger**: Same flow, DEX focus, Arrow Blow skill
- [ ] **Mage**: Same flow, INT focus, Energy Bolt → Fireball progression
- [ ] **Assassin**: Same flow, LUK focus, Lucky Seven → Shadow Strike
- [ ] **Priest**: Same flow, INT focus, Holy Arrow → Heal for sustain

For each class verify:
- [ ] Wrong-stat builds deal noticeably less damage
- [ ] Correct-stat builds feel powerful
- [ ] Skills scale visibly with level
- [ ] Passive skills have noticeable effect
- [ ] No crashes or console errors
- [ ] All animations play correctly
- [ ] HUD displays correct information

### 8.10 — Performance check

- [ ] FPS stays above 55 with 20+ zombies and skill particles active
- [ ] No memory leaks from particle system or animations
- [ ] Particle cap (`MAX_PARTICLES`) is respected even during ultimate skills

### 8.11 — Final cleanup

- Remove any `console.log` debugging statements
- Ensure no unused variables or imports
- Run `npm run lint` and fix any issues
- Run `npm run build` for final compile check
- Remove any temporary test code

---

## Acceptance Criteria

- [ ] All 5 classes are balanced and feel distinct
- [ ] Stat allocation matters — right stats make you stronger, wrong stats don't
- [ ] Skill progression feels rewarding (level 1 → 20 is a big power jump)
- [ ] XP curve lets players reach key milestones in reasonable time
- [ ] All edge cases handled
- [ ] UI is polished with auto-allocate, recommendations, and smooth transitions
- [ ] Full integration test passes for all 5 classes
- [ ] Performance is solid
- [ ] No lint errors, no unused code
- [ ] `npm run build` passes
- [ ] `npm run lint` passes

---

## Files Modified

- `shared/game-constants.ts` (balance numbers)
- `src/app/services/game-state.service.ts` (edge cases)
- `src/app/engine/game-engine.ts` (balance + cleanup)
- `src/app/components/stat-allocation/*` (auto-allocate, polish)
- `src/app/components/skill-tree/*` (recommendations, polish)
- `src/app/components/hud/*` (notification dots, polish)
- `src/app/pages/character-select/*` (class info)
- `src/app/pages/game/*` (keyboard shortcuts)
