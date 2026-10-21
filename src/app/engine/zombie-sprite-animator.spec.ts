import { describe, it, expect } from 'vitest';
import { GAME_CONSTANTS, ZOMBIE_TYPES } from '@shared/game-constants';
import { ZombieDefinition, ZombieType } from '@shared/game-entities';
import { eaterJumpFrame, zombieSpriteSize } from './zombie-sprite-animator';

describe('eater pounce frames', (): void => {
  const force: number = GAME_CONSTANTS.ZOMBIE_EATER_JUMP_FORCE;

  it('launches on the first frame and lands on the last', (): void => {
    expect(eaterJumpFrame(force)).toBe(0);
    expect(eaterJumpFrame(-force)).toBe(7);
    expect(eaterJumpFrame(-force * 3), 'a long fall holds the landing frame').toBe(7);
    expect(eaterJumpFrame(force * 2)).toBe(0);
  });

  it('spreads its claws at the apex, which is where a drop off a ledge starts', (): void => {
    expect(eaterJumpFrame(-0.1)).toBe(3);
    expect(eaterJumpFrame(0)).toBe(4);
  });

  it('moves forward through the pounce as the jump slows and turns into a fall', (): void => {
    const frames: number[] = [];
    for (let vy: number = force; vy <= -force; vy += GAME_CONSTANTS.GRAVITY)
      frames.push(eaterJumpFrame(vy));
    for (let i: number = 1; i < frames.length; i++)
      expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1]);
    expect(new Set<number>(frames).size, 'every frame shows').toBe(8);
  });
});

describe('zombie sprite size', (): void => {
  function averageHeight(type: ZombieType): number {
    const def: ZombieDefinition = ZOMBIE_TYPES[type];
    return (def.heightMin + def.heightMax) / 2;
  }

  it('draws an Eater smaller than the walkers', (): void => {
    const eater: number = zombieSpriteSize(ZombieType.Eater, averageHeight(ZombieType.Eater));
    expect(eater).toBe(GAME_CONSTANTS.ZOMBIE_EATER_SPRITE_PX);
    expect(eater).toBeLessThan(
      zombieSpriteSize(ZombieType.Walker, averageHeight(ZombieType.Walker)),
    );
  });

  it('grows with the body it draws', (): void => {
    const def: ZombieDefinition = ZOMBIE_TYPES[ZombieType.Eater];
    expect(zombieSpriteSize(ZombieType.Eater, def.heightMax)).toBeGreaterThan(
      zombieSpriteSize(ZombieType.Eater, def.heightMin),
    );
  });
});
