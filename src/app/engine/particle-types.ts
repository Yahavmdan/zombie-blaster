export enum ParticleShape {
  Square = 'square',
  Circle = 'circle',
  Star = 'star',
  Line = 'line',
  Ring = 'ring',
}

export enum FadeMode {
  Linear = 'linear',
  Quick = 'quick',
  Late = 'late',
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  shape: ParticleShape;
  rotation: number;
  rotationSpeed: number;
  fadeMode: FadeMode;
  scaleOverLife: boolean;
}
