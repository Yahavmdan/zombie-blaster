# Workspace Rule Compliance Report — New Multiplayer Code

**Date:** 2025-03-19  
**Scope:** Recently changed files (multiplayer sync, remote players, corpses)

---

## 1. Explicit Types Everywhere

### game-engine.ts

| Location | Issue | Rule |
|----------|-------|------|
| L405 `for (const [prevId] of this.previousZombieStates)` | `prevId` is inferred from `Map<string, boolean>` iterator | Destructured variables must be typed |
| L412 `for (const z of zombies)` | `z` is inferred from `zombies` array | Loop variable must be explicitly typed |
| L334 `for (const killId of this.pendingLocalKills)` | `killId` is inferred from `Set<string>` | Loop variable must be explicitly typed |
| L377 `for (const [id] of this.remotePlayerAnimators)` | `id` is inferred from Map iterator | Destructured variable must be typed |
| L402 `for (const existing of this.zombieCorpses)` | `existing` is inferred | Loop variable must be explicitly typed |
| L408 `for (const c of corpses)` | `c` is inferred | Loop variable must be explicitly typed |
| L416 `for (const rp of this.remotePlayers)` | `rp` is inferred | Loop variable must be explicitly typed |
| L353 `for (const evt of events)` | `evt` is inferred from `Array<{ zombieId: string; damage: number; killed: boolean }>` | Loop variable must be explicitly typed |

**Compliant:** All callback parameters (`(z: ZombieState)`, `(c: ZombieCorpse)`, etc.), return types, and most `const` declarations are explicitly typed.

---

### render-system.ts — `renderRemotePlayers`

| Location | Issue | Rule |
|----------|-------|------|
| L179 `for (const rp of this.e.remotePlayers)` | `rp` is inferred as `CharacterState` | Loop variable must be explicitly typed |
| L185 `animator: import('./sprite-animator').SpriteAnimator \| undefined` | Uses inline type import instead of top-level import | Prefer explicit import; SpriteAnimator could be imported at top |

**Compliant:** All other variables (`classDef`, `classColor`, `flipX`, `spriteSize`, `playerAnchorX`, etc.) are explicitly typed.

---

### game-canvas.component.ts

| Location | Issue | Rule |
|----------|-------|------|
| L114–116 `getStateSnapshot` return type | Uses `import('@shared/game-entities').ZombieState[]` and `import('@shared/game-entities').ZombieCorpse[]` inline | Prefer top-level imports; add `ZombieState, ZombieCorpse` to existing `@shared/game-entities` import |
| L118 `applyRemoteZombies(zombies: import(...).ZombieState[])` | Same inline import | Same fix |
| L122 `applyRemoteCorpses(corpses: import(...).ZombieCorpse[])` | Same inline import | Same fix |

---

### game.component.ts

| Location | Issue | Rule |
|----------|-------|------|
| L184 `for (const [id, state] of this.remotePlayerStates)` | `id` and `state` are inferred from `Map<string, CharacterState>` | Destructured variables must be typed |
| L124–125, L166–167 | Snapshot type `{ player: CharacterState; zombies: ZombieState[]; corpses: ZombieCorpse[]; level: number }` duplicated | Consider shared type (see Shared Types section) |

**Compliant:** Callback parameters (`(msg: ServerMessage)`, `(s: number)`, etc.) and most variables are explicitly typed.

---

## 2. No Unused Variables

**Status:** No unused imports, variables, or parameters found in the reviewed new code.

---

## 3. Shared Types

| Location | Issue | Rule |
|----------|-------|------|
| GameSync payload | Type `{ player: CharacterState; zombies: ZombieState[]; corpses: ZombieCorpse[]; level: number }` is duplicated in `game-engine.ts`, `game-canvas.component.ts`, and `game.component.ts` | Types used by client (and potentially server) should live in `shared/` |
| ZombieCorpse | Already in `shared/game-entities.ts` | Compliant |
| ZombieState | Already in `shared/game-entities.ts` | Compliant |

**Recommendation:** Add `GameSyncPayload` (or equivalent) to `shared/multiplayer.ts`:

```typescript
export interface GameSyncPayload {
  player: CharacterState;
  zombies: import('./game-entities').ZombieState[];
  corpses: import('./game-entities').ZombieCorpse[];
  level: number;
}
```

Then use `GameSyncPayload` in game-engine, game-canvas, and game.component instead of inline object types.

---

## 4. engine-types.ts

**Status:** Compliant. The `remotePlayerAnimators: Map<string, SpriteAnimator>` field and `ZombieCorpse` re-export are correctly typed.

---

## 5. shared/game-entities.ts — ZombieCorpse

**Status:** Compliant. All properties of `ZombieCorpse` are explicitly typed.

---

## Summary of Required Fixes

1. **Explicit types:** Add explicit types to all `for...of` loop variables and destructured variables in the listed locations.
2. **Imports:** Replace inline `import('@shared/game-entities').*` and `import('./sprite-animator').SpriteAnimator` with top-level imports.
3. **Shared types:** Introduce `GameSyncPayload` in `shared/multiplayer.ts` and use it where the snapshot/payload type is duplicated.
