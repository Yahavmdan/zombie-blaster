import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CharacterClass,
  CharacterState,
  Direction,
  GAME_CONSTANTS,
  ZOMBIE_TYPES,
} from '@shared/index';
import { GadgetState, ZombieState, ZombieType } from '@shared/game-entities';
import { ClueSceneLayout, Gadget } from './engine-types';
import {
  ClueAction,
  ClueSceneState,
  clueGoalX,
  newClueScene,
  standsOnGoal,
  stepClueScene,
} from './clue-scene';
import { GameEngine } from './game-engine';
import { DESIGNED_LEVELS } from './designed-levels';
import { stateOf } from './gadgets';

const GROUND_Y: number = GAME_CONSTANTS.GROUND_Y;
const PH: number = GAME_CONSTANTS.PLAYER_HEIGHT;
const SCENE: ClueSceneLayout = { spawnX: 240, spawnY: 228, gadgetId: 'b' };
const BUTTON: Gadget = {
  id: 'b',
  kind: 'button',
  kg: 10,
  targets: [],
  x: 104,
  y: GROUND_Y,
  width: 48,
  height: 6,
};

function makeZombie(centerX: number, overrides: Partial<ZombieState> = {}): ZombieState {
  const def: (typeof ZOMBIE_TYPES)[ZombieType.Walker] = ZOMBIE_TYPES[ZombieType.Walker];
  return {
    id: 'z1',
    type: ZombieType.Walker,
    hp: 100,
    maxHp: 100,
    x: centerX - 20,
    y: GROUND_Y - 50,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    isDead: false,
    target: null,
    knockbackFrames: 0,
    jumpCooldown: 0,
    attackCooldown: 0,
    attackAnimTimer: 0,
    attackHasHit: false,
    attackHesitation: def.hesitationMin,
    hesitationRange: 0,
    facing: -1,
    instanceSpeed: 1,
    instanceDamageMin: 10,
    instanceDamageMax: 15,
    instanceKnockbackForce: 5,
    instanceXpReward: 10,
    instanceWidth: 40,
    instanceHeight: 50,
    orbitOffset: 0,
    platformDropTimer: 0,
    spawnTimer: 0,
    reactionDelay: 0,
    eatingTargetId: null,
    eatingTimer: 0,
    magnetPull: null,
    stunTicks: 0,
    angle: 0,
    spin: 0,
    ...overrides,
  };
}

describe('clue scene rules', () => {
  it('starts done without a scene and waiting with one', (): void => {
    expect(newClueScene(null).phase).toBe('done');
    expect(newClueScene(SCENE).phase).toBe('waiting');
  });

  it('walks to the middle of its gadget', (): void => {
    expect(clueGoalX(SCENE, [BUTTON])).toBe(128);
    expect(clueGoalX(SCENE, [])).toBeNull();
  });

  it('stands on the goal only grounded and within reach', (): void => {
    expect(standsOnGoal(makeZombie(128 + GAME_CONSTANTS.CLUE_SCENE_ARRIVE_PX), 128)).toBe(true);
    expect(standsOnGoal(makeZombie(128 + GAME_CONSTANTS.CLUE_SCENE_ARRIVE_PX + 1), 128)).toBe(
      false,
    );
    expect(standsOnGoal(makeZombie(128, { isGrounded: false }), 128)).toBe(false);
  });

  it('spawns after the delay, holds on the goal, then releases', (): void => {
    const state: ClueSceneState = newClueScene(SCENE);
    const actions: ClueAction[] = [];
    for (let t: number = 0; t < GAME_CONSTANTS.CLUE_SCENE_START_DELAY_TICKS; t++) {
      actions.push(stepClueScene(state, null, 128));
    }
    expect(actions.filter((a: ClueAction): boolean => a === 'spawn').length).toBe(1);
    expect(actions[actions.length - 1]).toBe('spawn');
    expect(state.phase).toBe('walking');

    const z: ZombieState = makeZombie(300);
    expect(stepClueScene(state, z, 128)).toBeNull();
    expect(state.phase).toBe('walking');
    z.x = 128 - 20;
    stepClueScene(state, z, 128);
    expect(state.phase).toBe('holding');
    for (let t: number = 1; t < GAME_CONSTANTS.CLUE_SCENE_HOLD_TICKS; t++) {
      expect(stepClueScene(state, z, 128)).toBeNull();
    }
    expect(stepClueScene(state, z, 128)).toBe('release');
    expect(state.phase).toBe('done');
    expect(stepClueScene(state, z, 128)).toBeNull();
  });

  it('ends when the zombie dies on the way', (): void => {
    const state: ClueSceneState = { phase: 'walking', ticks: 0, zombieId: 'z1' };
    expect(stepClueScene(state, makeZombie(300, { isDead: true }), 128)).toBe('release');
    expect(state.phase).toBe('done');
  });
});

function createMockCanvas(): HTMLCanvasElement {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  const noop: () => void = vi.fn();
  const ctx: Record<string, unknown> = {
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    strokeText: noop,
    measureText: vi.fn().mockReturnValue({ width: 10 }),
    drawImage: noop,
    beginPath: noop,
    rect: noop,
    clip: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    setTransform: noop,
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    canvas,
  };
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return canvas;
}

function makePlayer(): CharacterState {
  return {
    id: 'player-1',
    name: 'Test',
    classId: CharacterClass.Warrior,
    level: 1,
    xp: 0,
    xpToNext: 100,
    hp: 200,
    mp: 50,
    stats: { str: 10, dex: 5, int: 5, luk: 5 },
    derived: {
      maxHp: 200,
      maxMp: 50,
      attack: 20,
      defense: 5,
      speed: 3,
      critRate: 5,
      critDamage: 150,
    },
    allocatedStats: { str: 0, dex: 0, int: 0, luk: 0 },
    unallocatedStatPoints: 0,
    unallocatedSkillPoints: 0,
    skillLevels: {},
    activeBuffs: [],
    inventory: { potions: {}, gold: 0, autoPotionHpId: null, autoPotionMpId: null },
    x: 950,
    y: GROUND_Y - PH,
    velocityX: 0,
    velocityY: 0,
    isGrounded: true,
    isDead: false,
    isDown: false,
    downTimer: 0,
    isAttacking: false,
    isDoubleJumping: false,
    isClimbing: false,
    facing: Direction.Right,
  };
}

describe('floor 1 clue scene on a real engine', () => {
  let engine: GameEngine;

  beforeEach((): void => {
    engine = new GameEngine(createMockCanvas());
    engine.player = makePlayer();
    engine.zombies = [];
    engine.zombieSpawnsPaused = true;
  });

  /** Top of floor 1's door button (its surface). */
  function stateButtonY(): number {
    return engine.gadgets.find((g: Gadget): boolean => g.id === 'g2')!.y;
  }

  function tick(): void {
    engine['update']();
  }

  function tickUntil(done: () => boolean, max: number): void {
    for (let t: number = 0; t < max && !done(); t++) tick();
  }

  it('floor 1 has the scene on its door button', (): void => {
    expect(DESIGNED_LEVELS[1].clueScene?.gadgetId).toBe('g2');
    expect(engine.clueSceneSystem.state.phase).toBe('waiting');
  });

  it('a zombie rises on the ledge, holds the button (door opens), then hunts', (): void => {
    tickUntil(
      (): boolean => engine.zombies.length > 0,
      GAME_CONSTANTS.CLUE_SCENE_START_DELAY_TICKS + 1,
    );
    expect(engine.zombies.length).toBe(1);
    const z: ZombieState = engine.zombies[0];
    expect(z.y + z.instanceHeight).toBe(DESIGNED_LEVELS[1].clueScene!.spawnY);
    expect(engine.clueSceneSystem.state.zombieId).toBe(z.id);

    tickUntil((): boolean => engine.clueSceneSystem.state.phase === 'holding', 2000);
    expect(engine.clueSceneSystem.state.phase).toBe('holding');
    expect(z.y + z.instanceHeight).toBeCloseTo(stateButtonY(), 0);

    for (let t: number = 0; t < GAME_CONSTANTS.GADGET_DOOR_TICKS + 2; t++) tick();
    const door: GadgetState | undefined = stateOf(engine.gadgetStates, 'g1');
    expect(door?.openTicks).toBe(GAME_CONSTANTS.GADGET_DOOR_TICKS);

    tickUntil(
      (): boolean => engine.clueSceneSystem.state.phase === 'done',
      GAME_CONSTANTS.CLUE_SCENE_HOLD_TICKS + 1,
    );
    expect(engine.clueSceneSystem.state.phase).toBe('done');
    const heldX: number = z.x;
    engine.player!.x = 700;
    for (let t: number = 0; t < 200; t++) tick();
    expect(z.x).toBeGreaterThan(heldX + 20);
  });

  it('a guest never runs the scene', (): void => {
    engine.isMultiplayerClient = true;
    for (let t: number = 0; t < GAME_CONSTANTS.CLUE_SCENE_START_DELAY_TICKS + 10; t++) tick();
    expect(engine.zombies.length).toBe(0);
    expect(engine.clueSceneSystem.state.phase).toBe('done');
  });
});
