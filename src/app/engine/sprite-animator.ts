import { CharacterClass } from '@shared/character';

export function classToSpriteSet(classId: CharacterClass): SpriteSet {
  switch (classId) {
    case CharacterClass.Assassin:
      return 'punk';
    default:
      return 'biker';
  }
}

export enum PlayerAnimState {
  Idle = 'idle',
  Run = 'run',
  Jump = 'jump',
  DoubleJump = 'doubleJump',
  Attack = 'attack',
  Death = 'death',
  Climb = 'climb',
}

export type SpriteSet = 'biker' | 'punk';

interface SpriteAnimation {
  image: HTMLImageElement;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  frameDurationTicks: number;
  loop: boolean;
}

interface SpriteConfig {
  src: string;
  frameCount: number;
  frameDurationTicks: number;
  loop: boolean;
}

const SPRITE_FRAME_SIZE: number = 48;

const BIKER_SPRITE_CONFIGS: Record<PlayerAnimState, SpriteConfig> = {
  [PlayerAnimState.Idle]: {
    src: 'sprites/biker/Biker_idle.png',
    frameCount: 4,
    frameDurationTicks: 12,
    loop: true,
  },
  [PlayerAnimState.Run]: {
    src: 'sprites/biker/Biker_run.png',
    frameCount: 6,
    frameDurationTicks: 8,
    loop: true,
  },
  [PlayerAnimState.Jump]: {
    src: 'sprites/biker/Biker_jump.png',
    frameCount: 4,
    frameDurationTicks: 10,
    loop: false,
  },
  [PlayerAnimState.Attack]: {
    src: 'sprites/biker/Biker_attack3.png',
    frameCount: 8,
    frameDurationTicks: 3,
    loop: false,
  },
  [PlayerAnimState.Death]: {
    src: 'sprites/biker/Biker_death.png',
    frameCount: 6,
    frameDurationTicks: 12,
    loop: false,
  },
  [PlayerAnimState.Climb]: {
    src: 'sprites/biker/Biker_climb.png',
    frameCount: 6,
    frameDurationTicks: 10,
    loop: true,
  },
  [PlayerAnimState.DoubleJump]: {
    src: 'sprites/biker/Biker_doublejump.png',
    frameCount: 6,
    frameDurationTicks: 5,
    loop: false,
  },
};

const PUNK_SPRITE_CONFIGS: Record<PlayerAnimState, SpriteConfig> = {
  [PlayerAnimState.Idle]: {
    src: 'sprites/punk/Punk_idle.png',
    frameCount: 4,
    frameDurationTicks: 12,
    loop: true,
  },
  [PlayerAnimState.Run]: {
    src: 'sprites/punk/Punk_run.png',
    frameCount: 6,
    frameDurationTicks: 8,
    loop: true,
  },
  [PlayerAnimState.Jump]: {
    src: 'sprites/punk/Punk_jump.png',
    frameCount: 4,
    frameDurationTicks: 10,
    loop: false,
  },
  [PlayerAnimState.Attack]: {
    src: 'sprites/punk/Punk_attack3.png',
    frameCount: 8,
    frameDurationTicks: 3,
    loop: false,
  },
  [PlayerAnimState.Death]: {
    src: 'sprites/punk/Punk_death.png',
    frameCount: 6,
    frameDurationTicks: 12,
    loop: false,
  },
  [PlayerAnimState.Climb]: {
    src: 'sprites/punk/Punk_climb.png',
    frameCount: 6,
    frameDurationTicks: 10,
    loop: true,
  },
  [PlayerAnimState.DoubleJump]: {
    src: 'sprites/punk/Punk_doublejump.png',
    frameCount: 6,
    frameDurationTicks: 5,
    loop: false,
  },
};

const SPRITE_SET_CONFIGS: Record<SpriteSet, Record<PlayerAnimState, SpriteConfig>> = {
  biker: BIKER_SPRITE_CONFIGS,
  punk: PUNK_SPRITE_CONFIGS,
};

export class SpriteAnimator {
  private animations: Map<PlayerAnimState, SpriteAnimation> = new Map();
  private currentState: PlayerAnimState = PlayerAnimState.Idle;
  private currentFrame: number = 0;
  private tickCounter: number = 0;
  private loaded: boolean = false;
  private loadCount: number = 0;
  private totalCount: number = 0;

  load(spriteSet: SpriteSet = 'biker'): void {
    const configs: Record<PlayerAnimState, SpriteConfig> = SPRITE_SET_CONFIGS[spriteSet];
    const entries: [string, SpriteConfig][] = Object.entries(configs);
    this.totalCount = entries.length;
    this.loadCount = 0;
    this.loaded = false;
    this.animations.clear();
    for (const [stateKey, config] of entries) {
      const state: PlayerAnimState = stateKey as PlayerAnimState;
      const img: HTMLImageElement = new Image();
      img.src = config.src;
      img.onload = (): void => {
        this.animations.set(state, {
          image: img,
          frameCount: config.frameCount,
          frameWidth: SPRITE_FRAME_SIZE,
          frameHeight: SPRITE_FRAME_SIZE,
          frameDurationTicks: config.frameDurationTicks,
          loop: config.loop,
        });
        this.loadCount++;
        if (this.loadCount >= this.totalCount) {
          this.loaded = true;
        }
      };
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  setState(newState: PlayerAnimState): void {
    if (newState === this.currentState) return;
    this.currentState = newState;
    this.currentFrame = 0;
    this.tickCounter = 0;
  }

  restart(): void {
    this.currentFrame = 0;
    this.tickCounter = 0;
  }

  isAnimationFinished(): boolean {
    const anim: SpriteAnimation | undefined = this.animations.get(this.currentState);
    if (!anim) return false;
    return !anim.loop && this.currentFrame >= anim.frameCount - 1;
  }

  tick(): void {
    const anim: SpriteAnimation | undefined = this.animations.get(this.currentState);
    if (!anim) return;

    this.tickCounter++;
    if (this.tickCounter >= anim.frameDurationTicks) {
      this.tickCounter = 0;
      if (this.currentFrame < anim.frameCount - 1) {
        this.currentFrame++;
      } else if (anim.loop) {
        this.currentFrame = 0;
      }
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    renderWidth: number,
    renderHeight: number,
    flipX: boolean,
  ): void {
    const anim: SpriteAnimation | undefined = this.animations.get(this.currentState);
    if (!anim) return;

    const srcX: number = this.currentFrame * anim.frameWidth;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (flipX) {
      ctx.translate(x + renderWidth, y);
      ctx.scale(-1, 1);
      ctx.drawImage(
        anim.image,
        srcX, 0, anim.frameWidth, anim.frameHeight,
        0, 0, renderWidth, renderHeight,
      );
    } else {
      ctx.drawImage(
        anim.image,
        srcX, 0, anim.frameWidth, anim.frameHeight,
        x, y, renderWidth, renderHeight,
      );
    }

    ctx.restore();
  }
}
