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
  srcY: number;
  frameDurationTicks: number;
  loop: boolean;
}

interface ZombieSpriteConfig {
  src: string;
  frameCount: number;
  frameDurationTicks: number;
  loop: boolean;
  frameWidth?: number;
  frameHeight?: number;
  srcY?: number;
}

type ZombieAnimConfigs = Record<ZombieAnimState, ZombieSpriteConfig>;

const ZOMBIE_FRAME_SIZE: number = 128;

export interface ZombieSpriteAnchor {
  anchorX: number;
  anchorY: number;
}

const DEFAULT_ANCHOR: ZombieSpriteAnchor = { anchorX: 0.5, anchorY: 1.0 };

const ZOMBIE_SPRITE_ANCHORS: Record<string, ZombieSpriteAnchor> = {
  zombie_1: { anchorX: 0.49, anchorY: 0.992 },
  zombie_2: { anchorX: 0.45, anchorY: 0.992 },
  zombie_3: { anchorX: 0.47, anchorY: 0.992 },
  zombie_4: { anchorX: 0.49, anchorY: 0.992 },
  dragon_boss: { anchorX: 0.50, anchorY: 0.994 },
};

const ZOMBIE_SPRITE_KEY_MAP: Record<ZombieType, string> = {
  [ZombieType.Walker]: 'zombie_1',
  [ZombieType.Runner]: 'zombie_2',
  [ZombieType.Spitter]: 'zombie_3',
  [ZombieType.Tank]: 'zombie_4',
  [ZombieType.Boss]: 'zombie_3',
  [ZombieType.DragonBoss]: 'dragon_boss',
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
  dragon_boss: {
    [ZombieAnimState.Idle]: { src: 'sprites/zombies/dragon_boss/Flying.png', frameCount: 6, frameDurationTicks: 8, loop: true, frameWidth: 172, frameHeight: 159 },
    [ZombieAnimState.Walk]: { src: 'sprites/zombies/dragon_boss/Flying.png', frameCount: 6, frameDurationTicks: 6, loop: true, frameWidth: 172, frameHeight: 159 },
    [ZombieAnimState.Attack]: { src: 'sprites/zombies/dragon_boss/SpiralAttack.png', frameCount: 6, frameDurationTicks: 6, loop: false, frameWidth: 218, frameHeight: 169 },
    [ZombieAnimState.Dead]: { src: 'sprites/zombies/dragon_boss/Dead.png', frameCount: 5, frameDurationTicks: 10, loop: false, frameWidth: 172, frameHeight: 177 },
    [ZombieAnimState.Hurt]: { src: 'sprites/zombies/dragon_boss/Hurt.png', frameCount: 1, frameDurationTicks: 8, loop: false, frameWidth: 170, frameHeight: 168 },
  },
};

interface ZombieAnimInstance {
  state: ZombieAnimState;
  currentFrame: number;
  tickCounter: number;
  reverse: boolean;
  frameDurationOverride: number;
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
            frameWidth: config.frameWidth ?? ZOMBIE_FRAME_SIZE,
            frameHeight: config.frameHeight ?? ZOMBIE_FRAME_SIZE,
            srcY: config.srcY ?? 0,
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

  getAnchor(spriteKey: string): ZombieSpriteAnchor {
    return ZOMBIE_SPRITE_ANCHORS[spriteKey] ?? DEFAULT_ANCHOR;
  }

  setState(zombieId: string, state: ZombieAnimState): void {
    const instance: ZombieAnimInstance | undefined = this.instances.get(zombieId);
    if (instance) {
      if (instance.state === state && !instance.reverse) return;
      instance.state = state;
      instance.currentFrame = 0;
      instance.tickCounter = 0;
      instance.reverse = false;
      instance.frameDurationOverride = 0;
    } else {
      this.instances.set(zombieId, {
        state,
        currentFrame: 0,
        tickCounter: 0,
        reverse: false,
        frameDurationOverride: 0,
      });
    }
  }

  setStateAtFrame(zombieId: string, state: ZombieAnimState, frame: number): void {
    const instance: ZombieAnimInstance | undefined = this.instances.get(zombieId);
    if (instance) {
      instance.state = state;
      instance.currentFrame = frame;
      instance.tickCounter = 0;
      instance.reverse = false;
      instance.frameDurationOverride = 0;
    } else {
      this.instances.set(zombieId, {
        state,
        currentFrame: frame,
        tickCounter: 0,
        reverse: false,
        frameDurationOverride: 0,
      });
    }
  }

  getFrameCount(spriteKey: string, state: ZombieAnimState): number {
    const animMap: Map<ZombieAnimState, ZombieSpriteAnimation> | undefined = this.spriteCache.get(spriteKey);
    const anim: ZombieSpriteAnimation | undefined = animMap?.get(state);
    return anim ? anim.frameCount : 1;
  }

  setStateReversed(zombieId: string, state: ZombieAnimState, spriteKey: string, totalTicks: number): void {
    const animMap: Map<ZombieAnimState, ZombieSpriteAnimation> | undefined = this.spriteCache.get(spriteKey);
    const anim: ZombieSpriteAnimation | undefined = animMap?.get(state);
    const lastFrame: number = anim ? anim.frameCount - 1 : 0;
    const frameCount: number = anim ? anim.frameCount : 1;
    const perFrameTicks: number = Math.max(1, Math.floor(totalTicks / frameCount));

    const instance: ZombieAnimInstance | undefined = this.instances.get(zombieId);
    if (instance) {
      instance.state = state;
      instance.currentFrame = lastFrame;
      instance.tickCounter = 0;
      instance.reverse = true;
      instance.frameDurationOverride = perFrameTicks;
    } else {
      this.instances.set(zombieId, {
        state,
        currentFrame: lastFrame,
        tickCounter: 0,
        reverse: true,
        frameDurationOverride: perFrameTicks,
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

    const effectiveDuration: number = instance.frameDurationOverride > 0
      ? instance.frameDurationOverride
      : anim.frameDurationTicks;
    instance.tickCounter++;
    if (instance.tickCounter >= effectiveDuration) {
      instance.tickCounter = 0;
      if (instance.reverse) {
        if (instance.currentFrame > 0) {
          instance.currentFrame--;
        }
      } else {
        if (instance.currentFrame < anim.frameCount - 1) {
          instance.currentFrame++;
        } else if (anim.loop) {
          instance.currentFrame = 0;
        }
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
    const srcY: number = anim.srcY;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (flipX) {
      ctx.translate(x + renderWidth, y);
      ctx.scale(-1, 1);
      ctx.drawImage(
        anim.image,
        srcX, srcY, anim.frameWidth, anim.frameHeight,
        0, 0, renderWidth, renderHeight,
      );
    } else {
      ctx.drawImage(
        anim.image,
        srcX, srcY, anim.frameWidth, anim.frameHeight,
        x, y, renderWidth, renderHeight,
      );
    }

    ctx.restore();
  }

  removeInstance(zombieId: string): void {
    this.instances.delete(zombieId);
  }
}
