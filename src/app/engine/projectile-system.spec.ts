import { describe, it, expect } from 'vitest';
import { CharacterState } from '@shared/index';
import { IGameEngine, PoisonEffect } from './engine-types';
import { PhysicsSystem } from './physics-system';
import { ProjectileSystem } from './projectile-system';
import { VfxSystem } from './vfx-system';

/** The parts of the engine a poison tick touches. */
interface PoisonEngine {
  player: CharacterState;
  poisonEffect: PoisonEffect | null;
  godMode: boolean;
  floor: number;
  isMultiplayerHost: boolean;
  isMultiplayerClient: boolean;
  gameOverCalls: number;
  downedCalls: number;
  onPlayerUpdate: (p: CharacterState) => void;
  onGameOver: () => void;
  onPlayerDowned: () => void;
}

function poisonedEngine(hp: number, isDown: boolean): PoisonEngine {
  const engine: PoisonEngine = {
    player: {
      id: 'p1',
      x: 100,
      y: 400,
      hp,
      isDead: false,
      isDown,
      downTimer: 0,
      activeBuffs: [],
    } as unknown as CharacterState,
    poisonEffect: { remainingTicks: 100, tickInterval: 10, tickTimer: 1, damagePerTick: 5 },
    godMode: false,
    floor: 3,
    isMultiplayerHost: true,
    isMultiplayerClient: false,
    gameOverCalls: 0,
    downedCalls: 0,
    onPlayerUpdate: (): void => undefined,
    onGameOver: (): void => {
      engine.gameOverCalls++;
    },
    onPlayerDowned: (): void => {
      engine.downedCalls++;
    },
  };
  return engine;
}

function projectiles(engine: PoisonEngine): ProjectileSystem {
  const vfx: VfxSystem = {
    spawnDamageNumber: (): void => undefined,
    spawnPoisonBubbles: (): void => undefined,
  } as unknown as VfxSystem;
  return new ProjectileSystem(engine as unknown as IGameEngine, {} as PhysicsSystem, vfx);
}

describe('poison in multiplayer', () => {
  it('a lethal poison tick downs an online player instead of killing them', () => {
    const engine: PoisonEngine = poisonedEngine(3, false);
    projectiles(engine).updatePoisonEffect();
    expect(engine.player.hp).toBe(0);
    expect(engine.player.isDead, 'dead outright: no revive possible').toBe(false);
    expect(engine.player.isDown).toBe(true);
    expect(engine.downedCalls).toBe(1);
    expect(engine.gameOverCalls, 'game-over screen while teammates still play').toBe(0);
  });

  it('poison does not hurt a downed player', () => {
    const engine: PoisonEngine = poisonedEngine(0, true);
    projectiles(engine).updatePoisonEffect();
    expect(engine.player.isDead).toBe(false);
    expect(engine.gameOverCalls).toBe(0);
  });
});
