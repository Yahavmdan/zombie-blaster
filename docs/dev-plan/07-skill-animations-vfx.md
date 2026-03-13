# Stage 7: Skill Animations & Visual Effects

## Goal

Add unique, visually appealing animations and particle effects for every skill. Each skill should feel distinct and satisfying. Higher-level skills should have more impressive effects. Include screen shake, flash effects, and special visual treatments for ultimate abilities.

---

## Prerequisites

- Stages 1-6 complete (full skill system functional)
- Read `src/app/engine/game-engine.ts` (particle system, render methods)
- Read `shared/game-constants.ts` (particle constants)

---

## Tasks

### 7.1 — Create skill animation system

Add a new animation module in the engine or as a utility. Each skill's `animationKey` maps to a specific visual effect function:

```typescript
export interface SkillAnimation {
  spawnParticles: (ctx: CanvasRenderingContext2D, x: number, y: number, facing: Direction, level: number) => Particle[];
  renderEffect: (ctx: CanvasRenderingContext2D, x: number, y: number, facing: Direction, progress: number, level: number) => void;
  duration: number;        // animation duration in ms
  screenShake: boolean;    // whether to shake screen
  flashColor: string | null; // brief screen flash color, null = no flash
}
```

Create a map:
```typescript
const SKILL_ANIMATIONS: Record<string, SkillAnimation> = { ... };
```

### 7.2 — Warrior skill animations

| Skill           | Animation Description                                                |
| --------------- | -------------------------------------------------------------------- |
| Power Strike    | Large red arc slash effect, 6-8 red/orange particles burst forward   |
| Slash Blast     | 360° red arc sweep, particles fly outward in all directions          |
| War Leap        | Dash trail of red afterimages, impact sparks on hit                  |
| Rage            | Red aura pulses around player, screen tints slightly red             |
| Ground Smash    | Shockwave rings expand from player feet, debris particles fly up     |
| Armor Crash     | Purple/dark crack effect on enemies, armor fragment particles        |
| Valhalla        | Screen flash white, massive golden explosion, **screen shake**, rays of light from player |

### 7.3 — Ranger skill animations

| Skill           | Animation Description                                                |
| --------------- | -------------------------------------------------------------------- |
| Arrow Blow      | Green arrow projectile with trail, small burst on impact             |
| Double Shot     | Two green arrows in quick succession, parallel trails                |
| Arrow Bomb      | Glowing red arrow that explodes on impact, expanding fire ring       |
| Arrow Rain      | Green arrows falling from top of screen in a zone, multiple impacts  |
| Strafe          | Rapid 4 green arrows in a cone pattern, each with short trail        |
| Hurricane       | Stream of glowing green arrows, continuous trail, **screen shake** on start, wind particles |

### 7.4 — Mage skill animations

| Skill           | Animation Description                                                |
| --------------- | -------------------------------------------------------------------- |
| Energy Bolt     | Blue magic orb with spiral trail, small blue burst on impact         |
| Fireball        | Orange/red fireball with flame trail, explosion with ember particles |
| Ice Beam        | Cyan beam with snowflake particles, ice crystal burst on hit         |
| Teleport        | Blue flash at start, particle trail to destination, blue flash at end|
| Chain Lightning | Yellow/white lightning bolt zigzag between enemies, electric sparks  |
| Meteor Shower   | Large fireballs descending from sky, massive explosion, **screen shake**, fire and debris |
| Infinity        | Purple/blue aura swirls around player, magic runes float, glowing eyes |

### 7.5 — Assassin skill animations

| Skill           | Animation Description                                                |
| --------------- | -------------------------------------------------------------------- |
| Lucky Seven     | Two purple shurikens with spin animation and trail                   |
| Shadow Strike   | Purple dash blur, shadow afterimage at origin, slash mark on target  |
| Dark Sight      | Player becomes translucent, dark mist particles surround             |
| Haste           | Green speed lines behind player, brief wind burst                    |
| Savage Blow     | Rapid 6 slash marks appearing on target, purple burst each hit       |
| Shadow Partner  | Dark translucent clone appears beside player, mimics poses           |
| Assassinate     | Screen darkens briefly, massive purple X slash on target, **screen shake**, purple explosion |

### 7.6 — Priest skill animations

| Skill           | Animation Description                                                |
| --------------- | -------------------------------------------------------------------- |
| Holy Arrow      | Golden arrow with light trail, holy burst on impact                  |
| Heal            | Green/white sparkles rise from player, healing number in green       |
| Holy Symbol     | Golden symbol appears above player, rotating slowly, golden particles|
| Shining Ray     | Wide golden beam from player forward, light particles along beam     |
| Dispel          | White pulse expanding from player, purifies with sparkle effect      |
| Genesis         | Sky opens with golden light, **screen shake**, massive holy explosion, heals shown on allies |

### 7.7 — Implement particle types

Add new particle variants for visual variety:

```typescript
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  shape: ParticleShape;     // new: circle, square, star, line, ring
  rotation: number;         // new: for star/line rotation
  rotationSpeed: number;    // new: rotation per tick
  fadeMode: FadeMode;       // new: linear, quick, late
  scaleOverLife: boolean;   // new: shrink as life decreases
}

export enum ParticleShape {
  Square = 'square',
  Circle = 'circle',
  Star = 'star',
  Line = 'line',
  Ring = 'ring',
}

export enum FadeMode {
  Linear = 'linear',
  Quick = 'quick',     // fades fast at start
  Late = 'late',       // stays opaque then fades at end
}
```

### 7.8 — Render particle shapes

Update `renderParticles()` to support different shapes:

```typescript
private renderParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const alpha: number = this.getParticleAlpha(p);
  const scale: number = p.scaleOverLife ? p.life / p.maxLife : 1;
  const size: number = p.size * scale;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);

  switch (p.shape) {
    case ParticleShape.Circle:
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case ParticleShape.Star:
      this.drawStar(ctx, 0, 0, size);
      break;
    case ParticleShape.Line:
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(-size / 2, 0);
      ctx.lineTo(size / 2, 0);
      ctx.stroke();
      break;
    case ParticleShape.Ring:
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    default:
      ctx.fillRect(-size / 2, -size / 2, size, size);
  }

  ctx.restore();
}
```

### 7.9 — Screen effects system

Add to `GameEngine`:

```typescript
private screenShakeFrames: number = 0;
private screenShakeIntensity: number = 0;
private screenFlashColor: string | null = null;
private screenFlashFrames: number = 0;

triggerScreenShake(frames: number, intensity: number): void { ... }
triggerScreenFlash(color: string, frames: number): void { ... }
```

Apply during render:
```typescript
private render(): void {
  ctx.save();

  // Apply screen shake offset
  if (this.screenShakeFrames > 0) {
    const shakeX: number = (Math.random() - 0.5) * this.screenShakeIntensity;
    const shakeY: number = (Math.random() - 0.5) * this.screenShakeIntensity;
    ctx.translate(shakeX, shakeY);
    this.screenShakeFrames--;
  }

  // ... all rendering ...

  ctx.restore();

  // Screen flash overlay
  if (this.screenFlashFrames > 0) {
    ctx.globalAlpha = this.screenFlashFrames / 10;
    ctx.fillStyle = this.screenFlashColor!;
    ctx.fillRect(0, 0, GAME_CONSTANTS.CANVAS_WIDTH, GAME_CONSTANTS.CANVAS_HEIGHT);
    ctx.globalAlpha = 1;
    this.screenFlashFrames--;
  }
}
```

### 7.10 — Skill level affects animation intensity

Higher skill levels should produce more impressive visuals:
- More particles (e.g., `particleCount = baseCount + level * 2`)
- Larger effect size
- Brighter colors / more glow
- Ultimate skills at level 15+ get extra screen shake

### 7.11 — Passive skill activation visuals

When a passive procs (e.g., Power Stance resists knockback, Venomous Stab poisons):
- Brief icon flash above player
- Small particle burst in the passive's color
- Subtle glow pulse on the player

### 7.12 — Level-up celebration effect

When the player levels up:
- Golden particles burst outward from player
- "LEVEL UP!" text with golden glow
- Brief screen flash
- Sound placeholder (if sound system exists)

---

## Acceptance Criteria

- [ ] Every active skill has a unique visual effect when used
- [ ] Particle shapes include circle, star, line, ring (not just squares)
- [ ] Screen shake triggers on ultimate abilities
- [ ] Screen flash triggers on major skills
- [ ] Higher skill levels produce more intense visuals
- [ ] Passive procs have subtle visual feedback
- [ ] Level-up has a celebration animation
- [ ] Performance stays smooth (particle cap respected)
- [ ] `npm run build` passes

---

## Files Modified / Created

- `src/app/engine/game-engine.ts` (major: animation system, particle upgrade, screen effects)
- `src/app/engine/skill-animations.ts` (new: animation definitions per skill)
- `shared/game-constants.ts` (add animation-related constants if needed)

## Important Notes

- Keep all animation logic in the engine (canvas side), not in Angular components.
- Respect `MAX_PARTICLES` — if too many particles exist, skip spawning new ones.
- Use the skill's `color` field from the definition as the primary color for its effects.
- Animations should be pure visual — they don't affect game logic or damage calculations.
