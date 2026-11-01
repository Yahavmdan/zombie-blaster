import { GAME_CONSTANTS } from '@shared/index';
import { ZombieState } from '@shared/game-entities';
import { ClueSceneLayout, Gadget } from './engine-types';

/** waiting: the delay runs; walking: the zombie heads for the gadget; holding: it stands on it; done. */
export type CluePhase = 'waiting' | 'walking' | 'holding' | 'done';

export interface ClueSceneState {
  phase: CluePhase;
  /** Ticks spent in the phase (waiting, holding). */
  ticks: number;
  /** The scripted zombie, once it rose. */
  zombieId: string | null;
}

/** What the system must do after a step: raise the zombie, let it go, or nothing. */
export type ClueAction = 'spawn' | 'release' | null;

/** A floor without a scene starts done. */
export function newClueScene(scene: ClueSceneLayout | null): ClueSceneState {
  return { phase: scene ? 'waiting' : 'done', ticks: 0, zombieId: null };
}

/** The x the zombie's middle walks to: the middle of the scene's gadget (null: no such gadget). */
export function clueGoalX(scene: ClueSceneLayout, gadgets: readonly Gadget[]): number | null {
  const target: Gadget | undefined = gadgets.find((g: Gadget): boolean => g.id === scene.gadgetId);
  return target ? target.x + target.width / 2 : null;
}

/** The zombie stands with its middle on the goal. */
export function standsOnGoal(z: ZombieState, goalX: number): boolean {
  return (
    z.isGrounded &&
    Math.abs(z.x + z.instanceWidth / 2 - goalX) <= GAME_CONSTANTS.CLUE_SCENE_ARRIVE_PX
  );
}

/**
 * One tick of the scene. `zombie` is the scripted zombie (null before it rose or once it is gone).
 * A zombie killed or gone ends the scene; after CLUE_SCENE_HOLD_TICKS on the goal it is released.
 */
export function stepClueScene(
  state: ClueSceneState,
  zombie: ZombieState | null,
  goalX: number,
): ClueAction {
  switch (state.phase) {
    case 'waiting':
      state.ticks++;
      if (state.ticks < GAME_CONSTANTS.CLUE_SCENE_START_DELAY_TICKS) return null;
      state.phase = 'walking';
      state.ticks = 0;
      return 'spawn';
    case 'walking':
      if (!zombie || zombie.isDead) return endScene(state);
      if (standsOnGoal(zombie, goalX)) {
        state.phase = 'holding';
        state.ticks = 0;
      }
      return null;
    case 'holding':
      if (!zombie || zombie.isDead) return endScene(state);
      state.ticks++;
      return state.ticks >= GAME_CONSTANTS.CLUE_SCENE_HOLD_TICKS ? endScene(state) : null;
    case 'done':
      return null;
  }
}

function endScene(state: ClueSceneState): ClueAction {
  state.phase = 'done';
  return 'release';
}
