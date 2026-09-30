---
name: multiplayer-vfx-sync
description: Ensure all visual effects (particles, skill animations, level-up, buffs, sprite effects) are broadcast to every player in a multiplayer session. Use when adding or modifying any visual effect, particle system, sprite animation, screen shake, or overlay in the game engine.
---

# Multiplayer VFX Sync

## The Problem

In a host-client architecture the host runs the full game loop and clients receive state snapshots. Visual effects triggered by `VfxSystem` only fire locally — other players never see them. This means skill animations, level-up bursts, buff particles, and sprite effects are invisible to everyone except the player who triggered them.

## Core Principle

**Every call that creates a visual effect MUST also emit a `VfxEvent` so remote clients can replay it.**

---

## 1. Existing plumbing (already implemented)

- `VfxEventType` enum + `VfxEvent` interface: `shared/multiplayer.ts`. Read the current enum before adding a type; reuse an existing one when it fits.
- `pendingVfxEvents: VfxEvent[]` on `IGameEngine` (`engine-types.ts`), initialized in `GameEngine`.
- Broadcast: `MultiplayerSyncPayload.vfxEvents` built in `getStateSnapshot()`; replayed on clients (see sections 3–4).
- Working emit examples: `combat-system.ts` (SkillAnimation, BuffActivation, ScreenShake/Flash), `drop-system.ts` (potion buffs), `game-engine.ts` (LevelUp).

New effect = new `VfxEventType` value (if none fits) + optional fields on `VfxEvent` + emit + replay case.

## 2. Emit Pattern — Push a VfxEvent Alongside Every VFX Call

### BAD — host-only, no one else sees it

```typescript
// combat-system.ts — skill execution
this.vfx.triggerSkillAnimation(skill.animationKey, cx, cy, p.facing, skillLevel);
```

### GOOD — emit VfxEvent so it gets broadcast

```typescript
// combat-system.ts — skill execution
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

### BAD — level-up effect only on local player

```typescript
// game-engine.ts
this.vfxSystem.spawnLevelUpEffect();
```

### GOOD — level-up with broadcast

```typescript
// game-engine.ts
this.vfxSystem.spawnLevelUpEffect();

this.pendingVfxEvents.push({
  type: VfxEventType.LevelUp,
  playerId: this.player!.id,
  x: this.player!.x + GAME_CONSTANTS.PLAYER_WIDTH / 2,
  y: this.player!.y + GAME_CONSTANTS.PLAYER_HEIGHT / 2,
});
```

### BAD — buff activation particles only local

```typescript
this.vfx.spawnBuffActivationParticles(x, y, color);
```

### GOOD — buff activation with broadcast

```typescript
this.vfx.spawnBuffActivationParticles(x, y, color);

this.e.pendingVfxEvents.push({
  type: VfxEventType.BuffActivation,
  playerId: this.e.player!.id,
  x,
  y,
  color,
});
```

## 3. Broadcast — Include VfxEvents in the Sync Payload

### In `getStateSnapshot()` (game-engine.ts):

```typescript
getStateSnapshot(): { ...; vfxEvents: VfxEvent[] } | null {
  // ... existing code ...
  const vfxEvents: VfxEvent[] = [...this.pendingVfxEvents];
  this.pendingVfxEvents.length = 0;
  return {
    // ... existing fields ...
    vfxEvents,
  };
}
```

### In `MultiplayerSyncPayload` (shared/multiplayer.ts):

```typescript
export interface MultiplayerSyncPayload {
  // ... existing fields ...
  vfxEvents?: VfxEvent[];
}
```

### In `game.component.ts` — client-side handler for GameSync:

```typescript
if (!this.isHost && payload.vfxEvents) {
  this.gameCanvas()?.replayRemoteVfxEvents(payload.vfxEvents);
}
```

## 4. Replay — Client Replays Received VfxEvents

### In `GameEngine` (or `GameCanvasComponent` bridge):

```typescript
replayRemoteVfxEvents(events: VfxEvent[]): void {
  const myId: string = this.player?.id ?? '';
  for (const evt of events) {
    if (evt.playerId === myId) continue; // skip own events

    switch (evt.type) {
      case VfxEventType.SkillAnimation:
        this.vfxSystem.triggerSkillAnimation(
          evt.animationKey!, evt.x, evt.y, evt.facing!, evt.level!,
        );
        break;
      case VfxEventType.LevelUp:
        this.vfxSystem.spawnLevelUpEffectAt(evt.x, evt.y);
        break;
      case VfxEventType.BuffActivation:
        this.vfxSystem.spawnBuffActivationParticles(evt.x, evt.y, evt.color!);
        break;
      case VfxEventType.HitParticles:
        this.vfxSystem.spawnHitParticles(evt.x, evt.y, evt.color!);
        break;
      case VfxEventType.ScreenShake:
        this.vfxSystem.triggerScreenShake(evt.frames!, evt.intensity!);
        break;
      case VfxEventType.ScreenFlash:
        this.vfxSystem.triggerScreenFlash(evt.color!, evt.frames!);
        break;
      case VfxEventType.SpriteEffect:
        this.spriteEffectSystem.spawn(evt.spriteEffectKey!, evt.x, evt.y, evt.flipX!);
        break;
    }
  }
}
```

## 5. VfxSystem Helper — Position-Parameterized Level-Up

The existing `spawnLevelUpEffect()` reads `this.e.player` for position. For replaying remote level-ups you need a version that takes explicit coordinates:

```typescript
spawnLevelUpEffectAt(cx: number, cy: number): void {
  const count: number = 20;
  for (let i: number = 0; i < count; i++) {
    const angle: number = (i / count) * Math.PI * 2;
    const speed: number = 3 + Math.random() * 4;
    this.addParticle({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 40 + Math.floor(Math.random() * 20),
      maxLife: 60,
      color: Math.random() > 0.5 ? '#ffcc44' : '#ffffff',
      size: Math.random() * 4 + 2,
      shape: ParticleShape.Star,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      fadeMode: FadeMode.Late,
      scaleOverLife: true,
    });
  }
  this.triggerScreenFlash('#ffcc44', 8);
}
```

---

## Checklist For Every New Visual Effect

Copy this checklist when adding or modifying any visual effect:

```
VFX Multiplayer Sync:
- [ ] Effect plays locally on the originating client
- [ ] A VfxEvent is pushed to pendingVfxEvents with correct type and coordinates
- [ ] The VfxEvent includes the playerId of the originator
- [ ] The replay handler in replayRemoteVfxEvents has a case for this event type
- [ ] The receiving client skips its own events (playerId === myId)
- [ ] If the effect uses player position, coordinates are absolute world coords (not relative)
- [ ] Any new VfxEventType values are added to the shared enum
- [ ] Tested with 2+ players: effect visible on all screens
```

## What Already Works (No Extra Sync Needed)

These effects are already reconstructed on clients from state diffs:

- **Damage numbers from HP deltas** — `applyRemoteZombies` compares `previousZombieHp` and spawns damage numbers + hit marks.
- **Floor transitions** — `syncRemoteFloor` sets `floorTransitionTimer`.
- **Zombie corpse animations** — `applyRemoteCorpses` syncs corpse state.

Do NOT double-emit events for these.

## Checking coverage

Skill animations, level-up, buff activation, screen shake/flash, dash, hit marks, dragon impact, poison, throwing star and magic twin are already synced (see `VfxEventType`). To find gaps, grep engine files for local VFX calls (`triggerSkillAnimation`, `spawnLevelUpEffect`, `spriteEffectSystem.spawn`, `triggerScreenShake`, `triggerScreenFlash`, particle pushes) and confirm each has a matching `pendingVfxEvents.push` on the originating path.

## Performance Notes

- VfxEvents are ephemeral — they are collected per sync tick and cleared after broadcast.
- Keep payloads small: only the fields needed to replay the effect (enum + coords + key).
- Don't sync continuously-updating particles (e.g., poison bubbles that tick every frame). Only sync the *trigger* event; each client spawns its own particles from that trigger.
