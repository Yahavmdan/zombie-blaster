export enum ParticleShape {
  Square = 'square',
  Circle = 'circle',
  Star = 'star',
  Line = 'line',
  Ring = 'ring',
  /** A square on the 2 px art grid, opacity in 4 steps: drops of bile, bubbles, fumes. */
  Pixel = 'pixel',
  /** A piece cut out of a puzzle part's art (`Particle.chunk`): wall stones, boulder shards. */
  Chunk = 'chunk',
}

/** Whose art a chunk is cut from: the boulder, or the cracked wall of this size and side. */
export type ChunkSource =
  | { kind: 'boulder' }
  | { kind: 'wall'; cols: number; rows: number; faceRight: boolean };

/** The part of the source art a chunk shows, in art cells (drawn at ART_PX per cell). */
export interface ParticleChunk {
  source: ChunkSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
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
  /** Extra opacity factor (e.g. softer effects replayed from other players). */
  alphaScale?: number;
  /** Share of PARTICLE_GRAVITY it feels (default 1; 0 floats, below 0 rises like smoke or flame). */
  gravityScale?: number;
  /** The art piece a `Chunk` particle draws. */
  chunk?: ParticleChunk;
  /** Ticks it waits in place, drawn, before it moves and ages (a wall stone not yet let go). */
  delay?: number;
  /** Ground it lands on: it bounces and slides to a stop there (DEBRIS_*) instead of falling through. */
  floorY?: number;
}
