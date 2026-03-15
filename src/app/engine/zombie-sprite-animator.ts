import { ZombieType } from '@shared/game-entities';

export enum ZombieAnimState {
  Idle = 'idle',
  Walk = 'walk',
  Attack = 'attack',
  Dead = 'dead',
  Hurt = 'hurt',
}

interface ZombieSpriteAnimation {
  image: HTMLImageElement;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  frameDurationTicks: number;
  loop: boolean;
}

interface ZombieSpriteConfig {
  src: string;
  frameCount: number;
  frameDurationTicks: number;
  loop: boolean;
}

type ZombieAnimConfigs = Record<ZombieAnimState, ZombieSpriteConfig>;

const ZOMBIE_FRAME_SIZE: number = 128;

const ZOMBIE_SPRITE_KEY_MAP: Record<ZombieType, string> = {
  [ZombieType.Walker]: 'zombie_1',
  [ZombieType.Runner]: 'zombie_2',
  [ZombieType.Spitter]: 'zombie_3',
  [ZombieType.Tank]: 'zombie_4',
  [ZombieType.Boss]: 'zombie_3',
};

const ZOMBIE_ANIM_CONFIGS: Record<string, ZombieAnimConfigs> = {
  zombie_1: {
    [ZombieAnimState.Idle]: { src: 'sprites/zombies/zombie_1/Idle.png', frameCount: 6, frameDurationTicks: 10, loop: true },
    [ZombieAnimState.Walk]: { src: 'sprites/zombies/zombie_1/Walk.png', frameCount: 10, frameDurationTicks: 6, loop: true },
    [ZombieAnimState.Attack]: { src: 'sprites/zombies/zombie_1/Attack.png', frameCount: 5, frameDurationTicks: 4, loop: false },
    [ZombieAnimState.Dead]: { src: 'sprites/zombies/zombie_1/Dead.png', frameCount: 5, frameDurationTicks: 8, loop: false },
    [ZombieAnimState.Hurt]: { src: 'sprites/zombies/zombie_1/Hurt.png', frameCount: 4, frameDurationTicks: 6, loop: false },
  },
  zombie_2: {
    [ZombieAnimState.Idle]: { src: 'sprites/zombies/zombie_2/Idle.png', frameCount: 6, frameDurationTicks: 10, loop: true },
    [ZombieAnimState.Walk]: { src: 'sprites/zombies/zombie_2/Walk.png', frameCount: 10, frameDurationTicks: 5, loop: true },
    [ZombieAnimState.Attack]: { src: 'sprites/zombies/zombie_2/Attack.png', frameCount: 5, frameDurationTicks: 4, loop: false },
    [ZombieAnimState.Dead]: { src: 'sprites/zombies/zombie_2/Dead.png', frameCount: 5, frameDurationTicks: 8, loop: false },
    [ZombieAnimState.Hurt]: { src: 'sprites/zombies/zombie_2/Hurt.png', frameCount: 4, frameDurationTicks: 6, loop: false },
  },
  zombie_3: {
    [ZombieAnimState.Idle]: { src: 'sprites/zombies/zombie_3/Idle.png', frameCount: 6, frameDurationTicks: 10, loop: true },
    [ZombieAnimState.Walk]: { src: 'sprites/zombies/zombie_3/Walk.png', frameCount: 10, frameDurationTicks: 6, loop: true },
    [ZombieAnimState.Attack]: { src: 'sprites/zombies/zombie_3/Attack.png', frameCount: 4, frameDurationTicks: 5, loop: false },
    [ZombieAnimState.Dead]: { src: 'sprites/zombies/zombie_3/Dead.png', frameCount: 5, frameDurationTicks: 8, loop: false },
    [ZombieAnimState.Hurt]: { src: 'sprites/zombies/zombie_3/Hurt.png', frameCount: 4, frameDurationTicks: 6, loop: false },
  },
  zombie_4: {
    [ZombieAnimState.Idle]: { src: 'sprites/zombies/zombie_4/Idle.png', frameCount: 7, frameDurationTicks: 9, loop: true },
    [ZombieAnimState.Walk]: { src: 'sprites/zombies/zombie_4/Walk.png', frameCount: 12, frameDurationTicks: 5, loop: true },
    [ZombieAnimState.Attack]: { src: 'sprites/zombies/zombie_4/Attack.png', frameCount: 10, frameDurationTicks: 3, loop: false },
    [ZombieAnimState.Dead]: { src: 'sprites/zombies/zombie_4/Dead.png', frameCount: 5, frameDurationTicks: 8, loop: false },
    [ZombieAnimState.Hurt]: { src: 'sprites/zombies/zombie_4/Hurt.png', frameCount: 4, frameDurationTicks: 6, loop: false },
  },
};

interface ZombieAnimInstance {
  state: ZombieAnimState;
  currentFrame: number;
  tickCounter: number;
}

export class ZombieSpriteAnimator {
  private spriteCache: Map<string, Map<ZombieAnimState, ZombieSpriteAnimation>> = new Map();
  private instances: Map<string, ZombieAnimInstance> = new Map();
  private loaded: boolean = false;
  private loadCount: number = 0;
  private totalCount: number = 0;

  load(): void {
    const allKeys: string[] = Object.keys(ZOMBIE_ANIM_CONFIGS);
    for (const key of allKeys) {
      const configs: ZombieAnimConfigs = ZOMBIE_ANIM_CONFIGS[key];
      const stateEntries: [string, ZombieSpriteConfig][] = Object.entries(configs);
      this.totalCount += stateEntries.length;
    }

    for (const key of allKeys) {
      const configs: ZombieAnimConfigs = ZOMBIE_ANIM_CONFIGS[key];
      const animMap: Map<ZombieAnimState, ZombieSpriteAnimation> = new Map();
      this.spriteCache.set(key, animMap);

      const stateEntries: [string, ZombieSpriteConfig][] = Object.entries(configs);
      for (const [stateKey, config] of stateEntries) {
        const state: ZombieAnimState = stateKey as ZombieAnimState;
        const img: HTMLImageElement = new Image();
        img.src = config.src;
        img.onload = (): void => {
          animMap.set(state, {
            image: img,
            frameCount: config.frameCount,
            frameWidth: ZOMBIE_FRAME_SIZE,
            frameHeight: ZOMBIE_FRAME_SIZE,
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
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getSpriteKey(type: ZombieType): string {
    return ZOMBIE_SPRITE_KEY_MAP[type];
  }

  setState(zombieId: string, state: ZombieAnimState): void {
    const instance: ZombieAnimInstance | undefined = this.instances.get(zombieId);
    if (instance) {
      if (instance.state === state) return;
      instance.state = state;
      instance.currentFrame = 0;
      instance.tickCounter = 0;
    } else {
      this.instances.set(zombieId, {
        state,
        currentFrame: 0,
        tickCounter: 0,
      });
    }
  }

  tick(zombieId: string, spriteKey: string): void {
    const instance: ZombieAnimInstance | undefined = this.instances.get(zombieId);
    if (!instance) return;

    const animMap: Map<ZombieAnimState, ZombieSpriteAnimation> | undefined = this.spriteCache.get(spriteKey);
    if (!animMap) return;

    const anim: ZombieSpriteAnimation | undefined = animMap.get(instance.state);
    if (!anim) return;

    instance.tickCounter++;
    if (instance.tickCounter >= anim.frameDurationTicks) {
      instance.tickCounter = 0;
      if (instance.currentFrame < anim.frameCount - 1) {
        instance.currentFrame++;
      } else if (anim.loop) {
        instance.currentFrame = 0;
      }
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    zombieId: string,
    spriteKey: string,
    x: number,
    y: number,
    renderWidth: number,
    renderHeight: number,
    flipX: boolean,
  ): void {
    const instance: ZombieAnimInstance | undefined = this.instances.get(zombieId);
    if (!instance) return;

    const animMap: Map<ZombieAnimState, ZombieSpriteAnimation> | undefined = this.spriteCache.get(spriteKey);
    if (!animMap) return;

    const anim: ZombieSpriteAnimation | undefined = animMap.get(instance.state);
    if (!anim) return;

    const srcX: number = instance.currentFrame * anim.frameWidth;

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

  removeInstance(zombieId: string): void {
    this.instances.delete(zombieId);
  }

  getState(zombieId: string): ZombieAnimState | null {
    const instance: ZombieAnimInstance | undefined = this.instances.get(zombieId);
    return instance ? instance.state : null;
  }
}
