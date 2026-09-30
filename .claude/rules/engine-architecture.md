---
paths:
  - "src/app/engine/**"
---

# Game Engine Architecture

The engine is split into focused files under `src/app/engine/`.

## Files

| File | Responsibility |
|---|---|
| `engine-types.ts` | Shared engine interfaces (`IGameEngine`, `Platform`, `Rope`, `DamageNumber`, ...) |
| `game-engine.ts` | Orchestrator: owns all state, creates systems, runs the loop, multiplayer snapshot/apply |
| `physics-system.ts` | Player movement, gravity, platform/rope collision, climbing |
| `combat-system.ts` | Player attacks, skills, buffs, passives, damage to/from zombies, zombie death |
| `zombie-system.ts` | Zombie AI, spawning, waves, corpses, zombie collisions |
| `projectile-system.ts` | Dragon/spitter projectiles, poison effects |
| `drop-system.ts` | Loot drops, potion use, item pickup |
| `vfx-system.ts` | Particles, damage numbers, screen shake/flash, skill animations, hit marks |
| `render-system.ts` | All canvas drawing: background, players, zombies, projectiles, overlays |
| `map-renderer.ts` | Tile map / floor background drawing |
| `sprite-effect-system.ts` | Sprite-sheet effects (`EFFECT_CONFIGS`), standalone |
| `skill-animations.ts` | `SKILL_ANIMATIONS` particle definitions per skill |
| `particle-types.ts` | `Particle`, `ParticleShape`, `FadeMode` |
| `sprite-animator.ts` / `zombie-sprite-animator.ts` | Player / zombie sprite-sheet animation state |

## Dependency rules

- Systems reach engine state through `IGameEngine` (`engine-types.ts`). Systems never import `game-engine.ts`.
- No circular deps. Current graph:

```
PhysicsSystem, VfxSystem, SpriteEffectSystem, MapRenderer -> standalone
DropSystem       -> Physics, Vfx
CombatSystem     -> Physics, Vfx, Drop
ProjectileSystem -> Physics, Vfx
ZombieSystem     -> Physics, Combat, Projectile, Drop
RenderSystem     -> reads state only (no system deps)
```

## Adding logic

- Put gameplay logic in the matching system file. Keep `game-engine.ts` a thin orchestrator.
- New shared state: add to `IGameEngine` and `GameEngine`.
- New systems: constructor takes `IGameEngine` plus required peer systems, wired in `GameEngine`'s constructor.
- Any new visual effect: follow the `multiplayer-vfx-sync` skill.
