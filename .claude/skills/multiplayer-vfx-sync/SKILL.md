---
name: multiplayer-vfx-sync
description: Ensure all visual effects (particles, skill animations, level-up, buffs, sprite effects) are broadcast to every player in a multiplayer session. Use when adding or modifying any visual effect, particle system, sprite animation, screen shake, or overlay in the game engine.
---

# Multiplayer VFX Sync

`VfxSystem` / `SpriteEffectSystem` calls only draw locally. Other players see an effect only if the originating client also emits a `VfxEvent` and every receiver replays it.

**Rule: every local VFX call on the originating path gets a matching `pendingVfxEvents.push(...)`.**

## Where things live

| Piece | Location |
|---|---|
| `VfxEventType` enum, `VfxEvent` interface | `shared/multiplayer.ts` (read it first; reuse a type when one fits) |
| `pendingVfxEvents` queue | `IGameEngine` (`engine-types.ts`), field on `GameEngine` |
| Drain queue into payload | `GameEngine.getStateSnapshot()` |
| Send | `src/app/pages/game/game.component.ts` sync loop: host sends `game-sync`, non-host sends `player-state` (both carry `vfxEvents`) |
| Receive + replay | same component calls `gameCanvas().replayRemoteVfxEvents()`, which forwards to `GameEngine.replayRemoteVfxEvents()` (`switch` on `evt.type`, skips own `playerId`) |
| Emit examples | `combat-system.ts` (skill animation, buffs, shake/flash), `drop-system.ts` (potion buffs), `game-engine.ts` (level-up) |

Transport and replay plumbing already exist. A new effect needs only: enum value (if none fits) + optional fields on `VfxEvent` + emit + replay `case`.

## Emit pattern

```typescript
// BAD — only the local player sees it
this.vfx.triggerSkillAnimation(skill.animationKey, cx, cy, p.facing, skillLevel);

// GOOD — local call + broadcast
this.vfx.triggerSkillAnimation(skill.animationKey, cx, cy, p.facing, skillLevel);
this.e.pendingVfxEvents.push({
  type: VfxEventType.SkillAnimation,
  playerId: this.e.player!.id,
  x: cx,
  y: cy,
  animationKey: skill.animationKey,
  facing: p.facing,
  level: skillLevel,
});
```

## Replay pattern

Add a `case` in `GameEngine.replayRemoteVfxEvents()`:

```typescript
case VfxEventType.BuffActivation:
  this.vfxSystem.spawnBuffActivationParticles(evt.x, evt.y, evt.color!);
  break;
```

If the local effect reads `this.e.player` for position, add a coordinate-taking variant for replay (like `spawnLevelUpEffect()` / `spawnLevelUpEffectAt(cx, cy)` in `vfx-system.ts`).

## Checklist

```
VFX Multiplayer Sync:
- [ ] Effect plays locally on the originating client
- [ ] VfxEvent pushed to pendingVfxEvents with correct type, playerId and absolute world coords
- [ ] New VfxEventType / VfxEvent fields added in shared/multiplayer.ts (not locally)
- [ ] replayRemoteVfxEvents has a case for the type
- [ ] Replay doesn't read local player state for the originator's position
- [ ] Test in multiplayer-sync.spec.ts covering the replay case
- [ ] E2E: solo vfxQueuedBy() shows the event queued; online spec shows the observer replayed AND rendered it (game-e2e skill, e2e/specs/online/visual-sync.spec.ts)
- [ ] Tested with 2+ players: effect visible on all screens
```

## Already reconstructed from state (don't double-emit)

- Damage numbers + hit marks from zombie HP deltas: `applyRemoteZombies` (`previousZombieHp`).
- Floor transitions: `syncRemoteFloor` (`floorTransitionTimer`).
- Zombie corpse animations: `applyRemoteCorpses`.

## Finding gaps

Grep engine files for local VFX calls (`triggerSkillAnimation`, `spawnLevelUpEffect`, `spawnBuffActivationParticles`, `spriteEffectSystem.spawn`, `triggerScreenShake`, `triggerScreenFlash`, particle pushes) and confirm each originating path has a matching `pendingVfxEvents.push`.

## Player status tints (hurt / poison)

Never draw a rect/circle over the hitbox for a player status. `VfxSystem.flashPlayerHurt(p)` (red, queues
`PlayerHurt`) and `tintPlayerPoisoned(id)` (green, synced through `PoisonTrigger`) set `engine.playerTints`;
`RenderSystem.renderStatusTint` draws them with `SpriteAnimator.drawTint`, a silhouette of the current frame.
Every new local player-damage path calls `flashPlayerHurt`. Probe: `player.tint` / `remotePlayers[].tint`.

## Payload size

- Events are per sync tick and cleared after send. Send only the fields replay needs.
- Never sync continuously-updating particles (e.g. poison bubbles per frame). Sync the trigger; each client spawns its own particles.
