import { Component, ChangeDetectionStrategy, inject, OnInit, Signal, WritableSignal, signal, computed, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CharacterClass, CharacterClassDefinition, CharacterState, CHARACTER_CLASSES } from '@shared/index';
import { GameStateService } from '../../services/game-state.service';
import { GameComponent } from '../game/game.component';

@Component({
  selector: 'app-dev',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameComponent, FormsModule],
  host: {
    class: 'dev-page',
  },
  templateUrl: './dev.component.html',
  styleUrl: './dev.component.css',
})
export class DevComponent implements OnInit {
  private readonly gameState: GameStateService = inject(GameStateService);
  private readonly gameComponent: Signal<GameComponent | undefined> = viewChild(GameComponent);

  readonly selectedClass: WritableSignal<CharacterClass> = signal<CharacterClass>(CharacterClass.Warrior);
  readonly waveInput: WritableSignal<number> = signal<number>(1);

  readonly classList: CharacterClassDefinition[] = Object.values(CHARACTER_CLASSES);

  readonly playerLevel: Signal<number> = computed((): number => {
    const p: CharacterState | null = this.gameState.player();
    return p ? p.level : 0;
  });

  ngOnInit(): void {
    this.gameState.createPlayer('Dev', this.selectedClass());
  }

  selectClass(classId: CharacterClass): void {
    this.selectedClass.set(classId);
    this.gameState.createPlayer('Dev', classId);
  }

  levelUp(): void {
    const p: CharacterState | null = this.gameState.player();
    if (!p) return;
    this.gameState.addXp(p.xpToNext);
  }

  maxAllSkills(): void {
    this.gameState.maxAllSkills();
    this.gameComponent()?.syncCanvasProgression();
  }

  maxOutPlayer(): void {
    this.gameState.maxOutPlayer();
    this.gameComponent()?.syncCanvasProgression();
  }

  setWave(): void {
    const wave: number = Math.max(1, this.waveInput());
    this.gameComponent()?.setWave(wave);
  }
}
