import { Direction } from '@shared/index';
import { Particle, ParticleShape, FadeMode } from './particle-types';

export interface SkillAnimation {
  spawnParticles: (x: number, y: number, facing: Direction, level: number) => Particle[];
  screenShake: number;
  screenShakeIntensity: number;
  flashColor: string | null;
  flashFrames: number;
  spriteEffect: string | null;
}

function makeParticle(overrides: Partial<Particle> & { x: number; y: number; color: string }): Particle {
  return {
    vx: 0, vy: 0,
    life: 30, maxLife: 30,
    size: 3,
    shape: ParticleShape.Square,
    rotation: 0, rotationSpeed: 0,
    fadeMode: FadeMode.Linear,
    scaleOverLife: false,
    ...overrides,
  };
}

function facingSign(facing: Direction): number {
  return facing === Direction.Right ? 1 : -1;
}

function arcSlashParticles(x: number, y: number, facing: Direction, level: number, color: string, count: number): Particle[] {
  const dir: number = facingSign(facing);
  const particles: Particle[] = [];
  const baseCount: number = (count + Math.floor(level / 4)) * 2;
  for (let i: number = 0; i < baseCount; i++) {
    const angle: number = ((i / baseCount) * Math.PI) - Math.PI / 2;
    const speed: number = 6 + Math.random() * 5;
    particles.push(makeParticle({
      x: x + dir * 10, y,
      vx: Math.cos(angle) * speed * dir,
      vy: Math.sin(angle) * speed,
      life: 30 + Math.floor(level / 2),
      maxLife: 35,
      color,
      size: 5 + Math.random() * 4,
      shape: ParticleShape.Line,
      rotation: angle,
      rotationSpeed: 0,
      fadeMode: FadeMode.Quick,
      scaleOverLife: true,
    }));
  }
  return particles;
}

function radialBurstParticles(x: number, y: number, level: number, color: string, count: number, shape: ParticleShape): Particle[] {
  const particles: Particle[] = [];
  const total: number = (count + Math.floor(level / 3)) * 2;
  for (let i: number = 0; i < total; i++) {
    const angle: number = (i / total) * Math.PI * 2;
    const speed: number = 5 + Math.random() * 6;
    particles.push(makeParticle({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 35 + Math.floor(level / 2),
      maxLife: 40,
      color,
      size: 5 + Math.random() * 5,
      shape,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      fadeMode: FadeMode.Linear,
      scaleOverLife: true,
    }));
  }
  return particles;
}

function projectileTrailParticles(x: number, y: number, facing: Direction, level: number, color: string, count: number): Particle[] {
  const dir: number = facingSign(facing);
  const particles: Particle[] = [];
  const total: number = (count + Math.floor(level / 5)) * 2;
  for (let i: number = 0; i < total; i++) {
    const offset: number = i * dir * 10;
    particles.push(makeParticle({
      x: x + offset, y: y + (Math.random() - 0.5) * 14,
      vx: dir * (2 + Math.random() * 2),
      vy: (Math.random() - 0.5) * 2.5,
      life: 22 + Math.floor(Math.random() * 12),
      maxLife: 34,
      color,
      size: 4 + Math.random() * 3,
      shape: ParticleShape.Circle,
      rotation: 0, rotationSpeed: 0,
      fadeMode: FadeMode.Quick,
      scaleOverLife: true,
    }));
  }
  return particles;
}

function shockwaveRingParticles(x: number, y: number, level: number, color: string): Particle[] {
  const particles: Particle[] = [];
  const ringCount: number = 3 + Math.floor(level / 6);
  for (let r: number = 0; r < ringCount; r++) {
    const count: number = 14 + Math.floor(level / 2);
    for (let i: number = 0; i < count; i++) {
      const angle: number = (i / count) * Math.PI * 2;
      const speed: number = 3 + r * 3 + Math.random() * 3;
      particles.push(makeParticle({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.3 - 1.5,
        life: 30 + r * 6,
        maxLife: 40,
        color,
        size: 4 + Math.random() * 4,
        shape: ParticleShape.Ring,
        rotation: 0, rotationSpeed: 0,
        fadeMode: FadeMode.Late,
        scaleOverLife: true,
      }));
    }
  }
  return particles;
}

function inwardVortexParticles(x: number, y: number, level: number, color: string): Particle[] {
  const particles: Particle[] = [];
  const ringCount: number = 2 + Math.floor(level / 8);
  for (let r: number = 0; r < ringCount; r++) {
    const count: number = 12 + Math.floor(level / 3);
    const radius: number = 80 + r * 60;
    for (let i: number = 0; i < count; i++) {
      const angle: number = (i / count) * Math.PI * 2;
      const startX: number = x + Math.cos(angle) * radius;
      const startY: number = y + Math.sin(angle) * radius;
      const speed: number = 4 + r * 2 + Math.random() * 3;
      particles.push(makeParticle({
        x: startX, y: startY,
        vx: -Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        life: 25 + r * 8,
        maxLife: 35 + r * 8,
        color,
        size: 4 + Math.random() * 4,
        shape: ParticleShape.Star,
        rotation: angle,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        fadeMode: FadeMode.Late,
        scaleOverLife: true,
      }));
    }
  }
  return particles;
}

// ═══════════════════════════════════════════════════
//  SKILL ANIMATION DEFINITIONS
// ═══════════════════════════════════════════════════
// Add your custom skill animation entries here.
// Each key must match the animationKey on a SkillDefinition in SKILLS (shared/game-constants.ts).
//
// Available particle helpers you can use:
//   arcSlashParticles(x, y, facing, level, color, count)       — melee slash arc
//   radialBurstParticles(x, y, level, color, count, shape)     — radial explosion
//   projectileTrailParticles(x, y, facing, level, color, count) — projectile trail
//   shockwaveRingParticles(x, y, level, color)                  — ground shockwave rings
//   makeParticle({ ...overrides })                              — single custom particle
//
// Available spriteEffect values (from sprite sheets):
//   'weaponhit', 'firespin', 'brightfire', 'vortex', 'sunburn', 'flamelash',
//   'phantom', 'bluefire', 'felspell', 'magicspell', 'fire', 'freezing',
//   'casting', 'magic8', 'midnight', 'protectioncircle', 'magickahit',
//   'nebula', 'magicbubbles'

export const SKILL_ANIMATIONS: Record<string, SkillAnimation> = {

  'warrior-power-strike': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] =>
      arcSlashParticles(x, y, facing, level, '#ff4444', 7),
    screenShake: 0, screenShakeIntensity: 0, flashColor: null, flashFrames: 0,
    spriteEffect: 'weaponhit',
  },

  'warrior-slash-blast': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] =>
      radialBurstParticles(x, y, level, '#ff6644', 12, ParticleShape.Line),
    screenShake: 3, screenShakeIntensity: 3, flashColor: null, flashFrames: 0,
    spriteEffect: 'firespin',
  },

  'warrior-monster-magnet': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] =>
      inwardVortexParticles(x, y, level, '#cc44ff'),
    screenShake: 4, screenShakeIntensity: 3, flashColor: '#cc44ff', flashFrames: 4,
    spriteEffect: 'vortex',
  },

  'warrior-power-stance': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const particles: Particle[] = [];
      const ringCount: number = 8 + Math.floor(level / 5);
      for (let i: number = 0; i < ringCount; i++) {
        const angle: number = (i / ringCount) * Math.PI * 2;
        const radius: number = 20 + Math.random() * 10;
        particles.push(makeParticle({
          x: x + Math.cos(angle) * radius,
          y: y + 20,
          vx: Math.cos(angle) * 0.5,
          vy: -(2 + Math.random() * 3),
          life: 35 + Math.floor(level / 3),
          maxLife: 45,
          color: '#ff9944',
          size: 4 + Math.random() * 3,
          shape: ParticleShape.Star,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.15,
          fadeMode: FadeMode.Late,
          scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: '#ff9944', flashFrames: 3,
    spriteEffect: 'protectioncircle',
  },

  'warrior-hyper-body': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const particles: Particle[] = [];
      const columnCount: number = 10 + Math.floor(level / 4);
      for (let i: number = 0; i < columnCount; i++) {
        const angle: number = (i / columnCount) * Math.PI * 2;
        const radius: number = 25 + Math.random() * 15;
        particles.push(makeParticle({
          x: x + Math.cos(angle) * radius,
          y: y + 24,
          vx: Math.cos(angle) * 0.3,
          vy: -(3 + Math.random() * 4),
          life: 40 + Math.floor(level / 3),
          maxLife: 50,
          color: i % 2 === 0 ? '#44ddaa' : '#88ffcc',
          size: 4 + Math.random() * 3,
          shape: ParticleShape.Star,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.12,
          fadeMode: FadeMode.Late,
          scaleOverLife: true,
        }));
      }
      const ringCount: number = 6 + Math.floor(level / 6);
      for (let i: number = 0; i < ringCount; i++) {
        const angle: number = (i / ringCount) * Math.PI * 2;
        const speed: number = 2 + Math.random() * 2;
        particles.push(makeParticle({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.4 - 1,
          life: 28 + Math.floor(level / 4),
          maxLife: 36,
          color: '#66eebb',
          size: 5 + Math.random() * 3,
          shape: ParticleShape.Ring,
          rotation: 0,
          rotationSpeed: 0,
          fadeMode: FadeMode.Late,
          scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: '#44ddaa', flashFrames: 4,
    spriteEffect: 'nebula',
  },

  'warrior-dragon-roar': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const shockwave: Particle[] = shockwaveRingParticles(x, y, level, '#ff2200');
      const burst: Particle[] = radialBurstParticles(x, y, level, '#ff6600', 16, ParticleShape.Star);
      const fire: Particle[] = [];
      const flameCount: number = 8 + Math.floor(level / 3);
      for (let i: number = 0; i < flameCount; i++) {
        const angle: number = (i / flameCount) * Math.PI * 2;
        const speed: number = 1 + Math.random() * 2;
        fire.push(makeParticle({
          x: x + Math.cos(angle) * 15,
          y: y + 10,
          vx: Math.cos(angle) * speed,
          vy: -(4 + Math.random() * 5),
          life: 40 + Math.floor(level / 2),
          maxLife: 50,
          color: i % 3 === 0 ? '#ffcc00' : '#ff4400',
          size: 6 + Math.random() * 5,
          shape: ParticleShape.Circle,
          rotation: 0,
          rotationSpeed: 0,
          fadeMode: FadeMode.Late,
          scaleOverLife: true,
        }));
      }
      return [...shockwave, ...burst, ...fire];
    },
    screenShake: 12, screenShakeIntensity: 8, flashColor: '#ff2200', flashFrames: 8,
    spriteEffect: 'sunburn',
  },

  'warrior-double-jump': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      const trailCount: number = 8 + Math.floor(level / 3);
      for (let i: number = 0; i < trailCount; i++) {
        particles.push(makeParticle({
          x: x - dir * (i * 6),
          y: y + 10 + (Math.random() - 0.5) * 12,
          vx: -dir * (3 + Math.random() * 2),
          vy: 1 + Math.random() * 2,
          life: 18 + Math.floor(Math.random() * 10),
          maxLife: 28,
          color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffaa44' : '#ff6622',
          size: 4 + Math.random() * 3,
          shape: ParticleShape.Circle,
          rotation: 0,
          rotationSpeed: 0,
          fadeMode: FadeMode.Quick,
          scaleOverLife: true,
        }));
      }
      const burstCount: number = 5 + Math.floor(level / 5);
      for (let i: number = 0; i < burstCount; i++) {
        const angle: number = (i / burstCount) * Math.PI + Math.PI / 2;
        const speed: number = 3 + Math.random() * 3;
        particles.push(makeParticle({
          x, y: y + 15,
          vx: Math.cos(angle) * speed * 0.5,
          vy: Math.sin(angle) * speed,
          life: 15 + Math.floor(level / 4),
          maxLife: 22,
          color: '#ffcc66',
          size: 3 + Math.random() * 2,
          shape: ParticleShape.Star,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.3,
          fadeMode: FadeMode.Quick,
          scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: null, flashFrames: 0,
    spriteEffect: null,
  },

  'warrior-power-dash': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const particles: Particle[] = [];
      const spiralCount: number = 16 + Math.floor(level / 3);
      for (let i: number = 0; i < spiralCount; i++) {
        const angle: number = (i / spiralCount) * Math.PI * 2;
        const radius: number = 45 + Math.random() * 25;
        const tangent: number = angle + Math.PI / 2;
        particles.push(makeParticle({
          x: x + Math.cos(angle) * radius,
          y: y + Math.sin(angle) * radius,
          vx: -Math.cos(angle) * 3 + Math.cos(tangent) * 2,
          vy: -Math.sin(angle) * 3 + Math.sin(tangent) * 2,
          life: 24 + Math.floor(level / 3),
          maxLife: 32,
          color: i % 4 === 0 ? '#ffffff' : i % 4 === 1 ? '#bb66ff' : i % 4 === 2 ? '#6644ff' : '#ff8844',
          size: 5 + Math.random() * 4,
          shape: ParticleShape.Star,
          rotation: angle,
          rotationSpeed: 0.35,
          fadeMode: FadeMode.Late,
          scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: null, flashFrames: 0,
    spriteEffect: null,
  },

};
