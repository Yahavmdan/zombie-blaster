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
  const baseCount: number = count + Math.floor(level / 4);
  for (let i: number = 0; i < baseCount; i++) {
    const angle: number = ((i / baseCount) * Math.PI) - Math.PI / 2;
    const speed: number = 4 + Math.random() * 3;
    particles.push(makeParticle({
      x: x + dir * 10, y,
      vx: Math.cos(angle) * speed * dir,
      vy: Math.sin(angle) * speed,
      life: 20 + Math.floor(level / 2),
      maxLife: 25,
      color,
      size: 3 + Math.random() * 2,
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
  const total: number = count + Math.floor(level / 3);
  for (let i: number = 0; i < total; i++) {
    const angle: number = (i / total) * Math.PI * 2;
    const speed: number = 3 + Math.random() * 4;
    particles.push(makeParticle({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 25 + Math.floor(level / 2),
      maxLife: 30,
      color,
      size: 3 + Math.random() * 3,
      shape,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.15,
      fadeMode: FadeMode.Linear,
      scaleOverLife: true,
    }));
  }
  return particles;
}

function projectileTrailParticles(x: number, y: number, facing: Direction, level: number, color: string, count: number): Particle[] {
  const dir: number = facingSign(facing);
  const particles: Particle[] = [];
  const total: number = count + Math.floor(level / 5);
  for (let i: number = 0; i < total; i++) {
    const offset: number = i * dir * 12;
    particles.push(makeParticle({
      x: x + offset, y: y + (Math.random() - 0.5) * 8,
      vx: dir * (1 + Math.random()),
      vy: (Math.random() - 0.5) * 1.5,
      life: 15 + Math.floor(Math.random() * 10),
      maxLife: 25,
      color,
      size: 2 + Math.random() * 2,
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
  const ringCount: number = 2 + Math.floor(level / 8);
  for (let r: number = 0; r < ringCount; r++) {
    const count: number = 10 + Math.floor(level / 2);
    for (let i: number = 0; i < count; i++) {
      const angle: number = (i / count) * Math.PI * 2;
      const speed: number = 2 + r * 2 + Math.random() * 2;
      particles.push(makeParticle({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.3 - 1,
        life: 20 + r * 5,
        maxLife: 30,
        color,
        size: 2 + Math.random() * 2,
        shape: ParticleShape.Ring,
        rotation: 0, rotationSpeed: 0,
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

export const SKILL_ANIMATIONS: Record<string, SkillAnimation> = {

  // ═══ WARRIOR ═══
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
  'warrior-war-leap': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      const count: number = 8 + Math.floor(level / 3);
      for (let i: number = 0; i < count; i++) {
        particles.push(makeParticle({
          x: x - dir * i * 8, y: y + (Math.random() - 0.5) * 10,
          vx: -dir * (1 + Math.random()), vy: (Math.random() - 0.5) * 2,
          life: 15 + Math.floor(Math.random() * 10), maxLife: 25,
          color: '#ff8844',
          size: 4 + Math.random() * 3,
          shape: ParticleShape.Square,
          rotation: Math.random() * Math.PI, rotationSpeed: 0.1,
          fadeMode: FadeMode.Quick, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 4, screenShakeIntensity: 4, flashColor: null, flashFrames: 0,
    spriteEffect: 'brightfire',
  },
  'warrior-rage': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] =>
      radialBurstParticles(x, y, level, '#ff2222', 10, ParticleShape.Circle),
    screenShake: 0, screenShakeIntensity: 0, flashColor: '#ff220033', flashFrames: 6,
    spriteEffect: 'vortex',
  },
  'warrior-ground-smash': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] =>
      shockwaveRingParticles(x, y, level, '#aa6633'),
    screenShake: 8, screenShakeIntensity: 6, flashColor: null, flashFrames: 0,
    spriteEffect: 'sunburn',
  },
  'warrior-armor-crash': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] =>
      arcSlashParticles(x, y, facing, level, '#996644', 6),
    screenShake: 3, screenShakeIntensity: 3, flashColor: null, flashFrames: 0,
    spriteEffect: 'weaponhit',
  },
  'warrior-brandish': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const particles: Particle[] = radialBurstParticles(x, y, level, '#ffaa00', 20, ParticleShape.Star);
      const rayCount: number = 8;
      for (let i: number = 0; i < rayCount; i++) {
        const angle: number = (i / rayCount) * Math.PI * 2;
        particles.push(makeParticle({
          x, y,
          vx: Math.cos(angle) * 6, vy: Math.sin(angle) * 6 - 2,
          life: 35 + Math.floor(level / 2), maxLife: 40,
          color: '#ffffff',
          size: 6 + Math.random() * 4,
          shape: ParticleShape.Line,
          rotation: angle, rotationSpeed: 0,
          fadeMode: FadeMode.Late, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 12, screenShakeIntensity: 8, flashColor: '#ffffff', flashFrames: 8,
    spriteEffect: 'flamelash',
  },

  // ═══ RANGER ═══
  'ranger-arrow-blow': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] =>
      projectileTrailParticles(x, y, facing, level, '#44cc44', 6),
    screenShake: 0, screenShakeIntensity: 0, flashColor: null, flashFrames: 0,
    spriteEffect: 'phantom',
  },
  'ranger-double-shot': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const top: Particle[] = projectileTrailParticles(x, y - 6, facing, level, '#44ee44', 5);
      const bottom: Particle[] = projectileTrailParticles(x, y + 6, facing, level, '#44ee44', 5);
      return [...top, ...bottom];
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: null, flashFrames: 0,
    spriteEffect: 'phantom',
  },
  'ranger-arrow-bomb': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const impactX: number = x + dir * 80;
      const trail: Particle[] = projectileTrailParticles(x, y, facing, level, '#ff8844', 4);
      const explosion: Particle[] = radialBurstParticles(impactX, y, level, '#ff6622', 10, ParticleShape.Circle);
      return [...trail, ...explosion];
    },
    screenShake: 5, screenShakeIntensity: 4, flashColor: '#ff4400', flashFrames: 4,
    spriteEffect: 'brightfire',
  },
  'ranger-arrow-rain': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const particles: Particle[] = [];
      const count: number = 12 + level;
      for (let i: number = 0; i < count; i++) {
        const offsetX: number = (Math.random() - 0.5) * 200;
        particles.push(makeParticle({
          x: x + offsetX, y: y - 200 - Math.random() * 100,
          vx: (Math.random() - 0.5) * 1.5, vy: 6 + Math.random() * 4,
          life: 30 + Math.floor(Math.random() * 15), maxLife: 45,
          color: '#44aacc',
          size: 2 + Math.random() * 2,
          shape: ParticleShape.Line,
          rotation: Math.PI / 2 + (Math.random() - 0.5) * 0.3, rotationSpeed: 0,
          fadeMode: FadeMode.Late, scaleOverLife: false,
        }));
      }
      return particles;
    },
    screenShake: 3, screenShakeIntensity: 2, flashColor: null, flashFrames: 0,
    spriteEffect: 'bluefire',
  },
  'ranger-strafe': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      const count: number = 4 + Math.floor(level / 5);
      for (let i: number = 0; i < count; i++) {
        const spread: number = (i - count / 2) * 8;
        particles.push(makeParticle({
          x, y: y + spread,
          vx: dir * (8 + Math.random() * 3), vy: spread * 0.2,
          life: 15, maxLife: 15,
          color: '#44ff88',
          size: 3, shape: ParticleShape.Line,
          rotation: 0, rotationSpeed: 0,
          fadeMode: FadeMode.Quick, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: null, flashFrames: 0,
    spriteEffect: 'phantom',
  },
  'ranger-hurricane': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      const count: number = 16 + level;
      for (let i: number = 0; i < count; i++) {
        particles.push(makeParticle({
          x: x + (Math.random() - 0.3) * dir * 40,
          y: y + (Math.random() - 0.5) * 30,
          vx: dir * (6 + Math.random() * 5), vy: (Math.random() - 0.5) * 3,
          life: 12 + Math.floor(Math.random() * 10), maxLife: 22,
          color: i % 3 === 0 ? '#22ff44' : '#44cc44',
          size: 2 + Math.random() * 2,
          shape: ParticleShape.Line,
          rotation: Math.random() * 0.3, rotationSpeed: 0,
          fadeMode: FadeMode.Quick, scaleOverLife: true,
        }));
      }
      // Wind particles
      for (let i: number = 0; i < 6; i++) {
        particles.push(makeParticle({
          x: x - dir * 20, y: y + (Math.random() - 0.5) * 60,
          vx: dir * (3 + Math.random() * 2), vy: (Math.random() - 0.5) * 2,
          life: 20, maxLife: 20,
          color: '#aaffaa',
          size: 8 + Math.random() * 6,
          shape: ParticleShape.Ring,
          rotation: 0, rotationSpeed: 0.2,
          fadeMode: FadeMode.Late, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 10, screenShakeIntensity: 5, flashColor: '#22ff44', flashFrames: 5,
    spriteEffect: 'felspell',
  },

  // ═══ MAGE ═══
  'mage-energy-bolt': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const trail: Particle[] = projectileTrailParticles(x, y, facing, level, '#6644ff', 6);
      for (const p of trail) { p.shape = ParticleShape.Circle; }
      return trail;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: null, flashFrames: 0,
    spriteEffect: 'magicspell',
  },
  'mage-fire-arrow': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const impactX: number = x + dir * 60;
      const trail: Particle[] = projectileTrailParticles(x, y, facing, level, '#ff6622', 5);
      const explosion: Particle[] = radialBurstParticles(impactX, y, level, '#ff4400', 10, ParticleShape.Circle);
      const embers: Particle[] = [];
      const emberCount: number = 5 + Math.floor(level / 3);
      for (let i: number = 0; i < emberCount; i++) {
        embers.push(makeParticle({
          x: impactX + (Math.random() - 0.5) * 40,
          y: y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 3,
          life: 25 + Math.floor(Math.random() * 15), maxLife: 40,
          color: Math.random() > 0.5 ? '#ffaa22' : '#ff6622',
          size: 2 + Math.random() * 2,
          shape: ParticleShape.Circle,
          rotation: 0, rotationSpeed: 0,
          fadeMode: FadeMode.Late, scaleOverLife: true,
        }));
      }
      return [...trail, ...explosion, ...embers];
    },
    screenShake: 4, screenShakeIntensity: 3, flashColor: '#ff4400', flashFrames: 4,
    spriteEffect: 'fire',
  },
  'mage-cold-beam': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      const count: number = 10 + Math.floor(level / 2);
      for (let i: number = 0; i < count; i++) {
        const dist: number = Math.random() * 180;
        particles.push(makeParticle({
          x: x + dir * dist, y: y + (Math.random() - 0.5) * 16,
          vx: dir * (1 + Math.random()), vy: (Math.random() - 0.5) * 2 - 1,
          life: 20 + Math.floor(Math.random() * 10), maxLife: 30,
          color: i % 3 === 0 ? '#ffffff' : '#88ccff',
          size: 2 + Math.random() * 3,
          shape: i % 4 === 0 ? ParticleShape.Star : ParticleShape.Circle,
          rotation: Math.random() * Math.PI * 2, rotationSpeed: 0.1,
          fadeMode: FadeMode.Linear, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: '#88ccff', flashFrames: 3,
    spriteEffect: 'freezing',
  },
  'mage-teleport': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] =>
      radialBurstParticles(x, y, level, '#cc88ff', 8, ParticleShape.Circle),
    screenShake: 0, screenShakeIntensity: 0, flashColor: '#cc88ff', flashFrames: 3,
    spriteEffect: 'casting',
  },
  'mage-thunder-bolt': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      const segments: number = 6 + Math.floor(level / 3);
      let cx: number = x;
      let cy: number = y;
      for (let i: number = 0; i < segments; i++) {
        const nx: number = cx + dir * (20 + Math.random() * 15);
        const ny: number = cy + (Math.random() - 0.5) * 40;
        particles.push(makeParticle({
          x: cx, y: cy,
          vx: (nx - cx) * 0.05, vy: (ny - cy) * 0.05,
          life: 12 + Math.floor(Math.random() * 8), maxLife: 20,
          color: Math.random() > 0.3 ? '#ffff44' : '#ffffff',
          size: 3 + Math.random() * 2,
          shape: ParticleShape.Line,
          rotation: Math.atan2(ny - cy, nx - cx), rotationSpeed: 0,
          fadeMode: FadeMode.Quick, scaleOverLife: false,
        }));
        // Sparks
        particles.push(makeParticle({
          x: nx, y: ny,
          vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
          life: 8, maxLife: 8,
          color: '#ffff88', size: 2,
          shape: ParticleShape.Star,
          rotation: Math.random() * Math.PI, rotationSpeed: 0.3,
          fadeMode: FadeMode.Quick, scaleOverLife: true,
        }));
        cx = nx;
        cy = ny;
      }
      return particles;
    },
    screenShake: 3, screenShakeIntensity: 3, flashColor: '#ffff44', flashFrames: 3,
    spriteEffect: 'weaponhit',
  },
  'mage-meteor-shower': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const particles: Particle[] = [];
      const meteorCount: number = 4 + Math.floor(level / 4);
      for (let m: number = 0; m < meteorCount; m++) {
        const mx: number = x + (Math.random() - 0.5) * 250;
        const startY: number = y - 250 - Math.random() * 100;
        // Meteor body
        particles.push(makeParticle({
          x: mx, y: startY,
          vx: (Math.random() - 0.5) * 2, vy: 8 + Math.random() * 4,
          life: 30 + Math.floor(Math.random() * 10), maxLife: 40,
          color: '#ff4400',
          size: 6 + Math.random() * 4,
          shape: ParticleShape.Circle,
          rotation: 0, rotationSpeed: 0,
          fadeMode: FadeMode.Late, scaleOverLife: false,
        }));
        // Flame trail
        for (let t: number = 0; t < 4; t++) {
          particles.push(makeParticle({
            x: mx + (Math.random() - 0.5) * 10,
            y: startY - t * 8,
            vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random(),
            life: 15 + Math.floor(Math.random() * 10), maxLife: 25,
            color: t % 2 === 0 ? '#ffaa22' : '#ff6622',
            size: 3 + Math.random() * 2,
            shape: ParticleShape.Circle,
            rotation: 0, rotationSpeed: 0,
            fadeMode: FadeMode.Quick, scaleOverLife: true,
          }));
        }
      }
      return particles;
    },
    screenShake: 15, screenShakeIntensity: 10, flashColor: '#ff4400', flashFrames: 8,
    spriteEffect: 'sunburn',
  },
  'mage-infinity': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const particles: Particle[] = [];
      const count: number = 12 + level;
      for (let i: number = 0; i < count; i++) {
        const angle: number = (i / count) * Math.PI * 2;
        const radius: number = 20 + Math.random() * 15;
        particles.push(makeParticle({
          x: x + Math.cos(angle) * radius,
          y: y + Math.sin(angle) * radius,
          vx: Math.cos(angle + Math.PI / 2) * 1.5,
          vy: Math.sin(angle + Math.PI / 2) * 1.5 - 1,
          life: 40 + Math.floor(Math.random() * 20), maxLife: 60,
          color: i % 3 === 0 ? '#aa44ff' : '#6644ff',
          size: 3 + Math.random() * 2,
          shape: ParticleShape.Star,
          rotation: angle, rotationSpeed: 0.08,
          fadeMode: FadeMode.Late, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: '#aa44ff', flashFrames: 6,
    spriteEffect: 'magic8',
  },

  // ═══ ASSASSIN ═══
  'assassin-lucky-seven': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      for (let s: number = 0; s < 2; s++) {
        const sy: number = y + (s === 0 ? -5 : 5);
        const count: number = 3 + Math.floor(level / 6);
        for (let i: number = 0; i < count; i++) {
          particles.push(makeParticle({
            x: x + dir * i * 15, y: sy + (Math.random() - 0.5) * 4,
            vx: dir * (5 + Math.random() * 2), vy: (Math.random() - 0.5),
            life: 12, maxLife: 12,
            color: '#cc44cc',
            size: 3 + Math.random(),
            shape: ParticleShape.Star,
            rotation: Math.random() * Math.PI * 2, rotationSpeed: 0.4,
            fadeMode: FadeMode.Quick, scaleOverLife: true,
          }));
        }
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: null, flashFrames: 0,
    spriteEffect: 'phantom',
  },
  'assassin-disorder': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      // Shadow afterimage
      const count: number = 6 + Math.floor(level / 4);
      for (let i: number = 0; i < count; i++) {
        particles.push(makeParticle({
          x: x - dir * i * 6, y: y + (Math.random() - 0.5) * 10,
          vx: -dir * 0.5, vy: (Math.random() - 0.5),
          life: 18, maxLife: 18,
          color: '#aa33aa',
          size: 5 + Math.random() * 3,
          shape: ParticleShape.Square,
          rotation: 0, rotationSpeed: 0,
          fadeMode: FadeMode.Late, scaleOverLife: true,
        }));
      }
      // Slash mark on target area
      particles.push(makeParticle({
        x: x + dir * 40, y,
        vx: 0, vy: 0,
        life: 15, maxLife: 15,
        color: '#ff44ff',
        size: 12,
        shape: ParticleShape.Line,
        rotation: Math.PI / 4, rotationSpeed: 0,
        fadeMode: FadeMode.Quick, scaleOverLife: true,
      }));
      return particles;
    },
    screenShake: 2, screenShakeIntensity: 3, flashColor: null, flashFrames: 0,
    spriteEffect: 'midnight',
  },
  'assassin-dark-sight': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const particles: Particle[] = [];
      const count: number = 8 + Math.floor(level / 3);
      for (let i: number = 0; i < count; i++) {
        const angle: number = Math.random() * Math.PI * 2;
        const dist: number = 10 + Math.random() * 20;
        particles.push(makeParticle({
          x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist,
          vx: Math.cos(angle) * 0.5, vy: -1 - Math.random(),
          life: 25 + Math.floor(Math.random() * 15), maxLife: 40,
          color: '#442244',
          size: 4 + Math.random() * 3,
          shape: ParticleShape.Circle,
          rotation: 0, rotationSpeed: 0,
          fadeMode: FadeMode.Late, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: '#220022', flashFrames: 4,
    spriteEffect: 'midnight',
  },
  'assassin-haste': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      const count: number = 6 + Math.floor(level / 4);
      for (let i: number = 0; i < count; i++) {
        particles.push(makeParticle({
          x: x - dir * (10 + Math.random() * 20), y: y + (Math.random() - 0.5) * 30,
          vx: -dir * (3 + Math.random() * 2), vy: (Math.random() - 0.5),
          life: 15, maxLife: 15,
          color: '#88ff88',
          size: 6 + Math.random() * 4,
          shape: ParticleShape.Line,
          rotation: 0, rotationSpeed: 0,
          fadeMode: FadeMode.Quick, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: null, flashFrames: 0,
    spriteEffect: 'protectioncircle',
  },
  'assassin-savage-blow': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      const hitCount: number = 6;
      for (let h: number = 0; h < hitCount; h++) {
        const hx: number = x + dir * 20 + (Math.random() - 0.5) * 20;
        const hy: number = y + (Math.random() - 0.5) * 30;
        const slashAngle: number = Math.random() * Math.PI;
        particles.push(makeParticle({
          x: hx, y: hy,
          vx: 0, vy: 0,
          life: 10 + h * 2, maxLife: 15,
          color: '#dd44dd',
          size: 10 + Math.floor(level / 4),
          shape: ParticleShape.Line,
          rotation: slashAngle, rotationSpeed: 0,
          fadeMode: FadeMode.Quick, scaleOverLife: true,
        }));
        // Burst per hit
        particles.push(makeParticle({
          x: hx, y: hy,
          vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
          life: 10, maxLife: 10,
          color: '#ee88ee',
          size: 3, shape: ParticleShape.Star,
          rotation: Math.random() * Math.PI, rotationSpeed: 0.2,
          fadeMode: FadeMode.Quick, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 4, screenShakeIntensity: 3, flashColor: null, flashFrames: 0,
    spriteEffect: 'magickahit',
  },
  'assassin-shadow-partner': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      const count: number = 8 + Math.floor(level / 3);
      for (let i: number = 0; i < count; i++) {
        particles.push(makeParticle({
          x: x - dir * 25 + (Math.random() - 0.5) * 15,
          y: y + (Math.random() - 0.5) * 30,
          vx: (Math.random() - 0.5), vy: -0.5 - Math.random(),
          life: 30 + Math.floor(Math.random() * 15), maxLife: 45,
          color: '#6622aa',
          size: 4 + Math.random() * 4,
          shape: ParticleShape.Square,
          rotation: 0, rotationSpeed: 0,
          fadeMode: FadeMode.Late, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: '#440066', flashFrames: 4,
    spriteEffect: 'midnight',
  },
  'assassin-assassinate': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const targetX: number = x + dir * 30;
      const particles: Particle[] = [];
      // X slash
      const slashSize: number = 14 + level;
      particles.push(makeParticle({
        x: targetX, y, vx: 0, vy: 0,
        life: 20, maxLife: 20,
        color: '#cc44cc', size: slashSize,
        shape: ParticleShape.Line,
        rotation: Math.PI / 4, rotationSpeed: 0,
        fadeMode: FadeMode.Late, scaleOverLife: true,
      }));
      particles.push(makeParticle({
        x: targetX, y, vx: 0, vy: 0,
        life: 20, maxLife: 20,
        color: '#cc44cc', size: slashSize,
        shape: ParticleShape.Line,
        rotation: -Math.PI / 4, rotationSpeed: 0,
        fadeMode: FadeMode.Late, scaleOverLife: true,
      }));
      // Purple explosion
      const burst: Particle[] = radialBurstParticles(targetX, y, level, '#880088', 14, ParticleShape.Star);
      return [...particles, ...burst];
    },
    screenShake: 12, screenShakeIntensity: 8, flashColor: '#440044', flashFrames: 6,
    spriteEffect: 'vortex',
  },

  // ═══ PRIEST ═══
  'priest-holy-arrow': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] =>
      projectileTrailParticles(x, y, facing, level, '#ffcc44', 6),
    screenShake: 0, screenShakeIntensity: 0, flashColor: null, flashFrames: 0,
    spriteEffect: 'brightfire',
  },
  'priest-heal': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const particles: Particle[] = [];
      const count: number = 10 + Math.floor(level / 2);
      for (let i: number = 0; i < count; i++) {
        particles.push(makeParticle({
          x: x + (Math.random() - 0.5) * 40,
          y: y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 1.5, vy: -2 - Math.random() * 2,
          life: 25 + Math.floor(Math.random() * 15), maxLife: 40,
          color: i % 3 === 0 ? '#ffffff' : '#44ff88',
          size: 2 + Math.random() * 3,
          shape: ParticleShape.Star,
          rotation: Math.random() * Math.PI * 2, rotationSpeed: 0.08,
          fadeMode: FadeMode.Late, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: '#44ff88', flashFrames: 4,
    spriteEffect: 'magicbubbles',
  },
  'priest-holy-symbol': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const particles: Particle[] = [];
      const count: number = 8 + Math.floor(level / 3);
      for (let i: number = 0; i < count; i++) {
        const angle: number = (i / count) * Math.PI * 2;
        const dist: number = 15 + Math.random() * 10;
        particles.push(makeParticle({
          x: x + Math.cos(angle) * dist,
          y: y - 30 + Math.sin(angle) * dist,
          vx: Math.cos(angle) * 0.5, vy: -0.5 - Math.random() * 0.5,
          life: 40 + Math.floor(Math.random() * 20), maxLife: 60,
          color: '#ffdd66',
          size: 2 + Math.random() * 2,
          shape: ParticleShape.Star,
          rotation: Math.random() * Math.PI * 2, rotationSpeed: 0.05,
          fadeMode: FadeMode.Late, scaleOverLife: false,
        }));
      }
      return particles;
    },
    screenShake: 0, screenShakeIntensity: 0, flashColor: '#ffdd66', flashFrames: 3,
    spriteEffect: 'sunburn',
  },
  'priest-shining-ray': {
    spawnParticles: (x: number, y: number, facing: Direction, level: number): Particle[] => {
      const dir: number = facingSign(facing);
      const particles: Particle[] = [];
      const beamLen: number = 180 + level * 3;
      const count: number = 12 + Math.floor(level / 2);
      for (let i: number = 0; i < count; i++) {
        const dist: number = Math.random() * beamLen;
        particles.push(makeParticle({
          x: x + dir * dist, y: y + (Math.random() - 0.5) * 12,
          vx: dir * (1 + Math.random()), vy: (Math.random() - 0.5) * 2,
          life: 18 + Math.floor(Math.random() * 10), maxLife: 28,
          color: i % 3 === 0 ? '#ffffff' : '#ffffaa',
          size: 2 + Math.random() * 3,
          shape: ParticleShape.Circle,
          rotation: 0, rotationSpeed: 0,
          fadeMode: FadeMode.Linear, scaleOverLife: true,
        }));
      }
      return particles;
    },
    screenShake: 2, screenShakeIntensity: 2, flashColor: '#ffffaa', flashFrames: 3,
    spriteEffect: 'nebula',
  },
  'priest-dispel': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] =>
      radialBurstParticles(x, y, level, '#eedd88', 10, ParticleShape.Ring),
    screenShake: 2, screenShakeIntensity: 2, flashColor: '#ffffff', flashFrames: 3,
    spriteEffect: 'protectioncircle',
  },
  'priest-genesis': {
    spawnParticles: (x: number, y: number, _facing: Direction, level: number): Particle[] => {
      const particles: Particle[] = [];
      // Golden light rays from above
      const rayCount: number = 8 + Math.floor(level / 3);
      for (let i: number = 0; i < rayCount; i++) {
        const ox: number = (Math.random() - 0.5) * 200;
        particles.push(makeParticle({
          x: x + ox, y: y - 300,
          vx: (Math.random() - 0.5), vy: 8 + Math.random() * 4,
          life: 35 + Math.floor(Math.random() * 15), maxLife: 50,
          color: i % 2 === 0 ? '#ffff88' : '#ffcc44',
          size: 4 + Math.random() * 3,
          shape: ParticleShape.Line,
          rotation: Math.PI / 2, rotationSpeed: 0,
          fadeMode: FadeMode.Late, scaleOverLife: false,
        }));
      }
      // Holy explosion
      const burst: Particle[] = radialBurstParticles(x, y, level, '#ffff88', 16, ParticleShape.Star);
      return [...particles, ...burst];
    },
    screenShake: 15, screenShakeIntensity: 10, flashColor: '#ffffff', flashFrames: 10,
    spriteEffect: 'nebula',
  },
};
