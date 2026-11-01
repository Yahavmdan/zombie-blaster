import { ZombieState, ZombieType } from '@shared/game-entities';
import { ClueSceneLayout, Gadget, IGameEngine } from './engine-types';
import { LevelLayout } from './level-generator';
import { ZombieSystem } from './zombie-system';
import { ClueAction, ClueSceneState, clueGoalX, newClueScene, stepClueScene } from './clue-scene';

/**
 * A designed floor's clue scene (floor 1: a zombie shows that the button opens the door). The host
 * (or solo) raises a zombie on its ledge, walks it onto the gadget ignoring players, holds it there,
 * then lets it hunt like any other. The zombie syncs as usual, so guests need nothing new; a guest
 * never runs the scene (nor replays it if it becomes the host).
 */
export class ClueSceneSystem {
  private scene: ClueSceneLayout | null = null;
  private gadgets: Gadget[] = [];
  state: ClueSceneState = newClueScene(null);

  constructor(
    private readonly e: IGameEngine,
    private readonly zombieSystem: ZombieSystem,
  ) {}

  reset(level: LevelLayout): void {
    this.scene = level.clueScene ?? null;
    this.gadgets = level.gadgets ?? [];
    this.state = newClueScene(this.scene);
  }

  update(): void {
    const scene: ClueSceneLayout | null = this.scene;
    if (!scene || this.state.phase === 'done') return;
    const goalX: number | null = clueGoalX(scene, this.gadgets);
    if (goalX === null) {
      this.state.phase = 'done';
      return;
    }
    const zombie: ZombieState | null =
      this.e.zombies.find((z: ZombieState): boolean => z.id === this.state.zombieId) ?? null;
    const action: ClueAction = stepClueScene(this.state, zombie, goalX);
    if (action === 'spawn') {
      const risen: ZombieState = this.zombieSystem.spawnZombieAt(
        scene.spawnX,
        scene.spawnY,
        ZombieType.Walker,
      );
      this.state.zombieId = risen.id;
      this.zombieSystem.scriptedGoals.set(risen.id, goalX);
    } else if (action === 'release' && this.state.zombieId !== null) {
      this.zombieSystem.scriptedGoals.delete(this.state.zombieId);
    }
  }

  /** Ends the scene now (e2e setup): the zombie, if risen, hunts as usual. */
  skip(): void {
    if (this.state.zombieId !== null) this.zombieSystem.scriptedGoals.delete(this.state.zombieId);
    this.state.phase = 'done';
  }

  /** Clients never run the scene; a guest promoted to host must not replay it. */
  tickClient(): void {
    this.state.phase = 'done';
  }
}
