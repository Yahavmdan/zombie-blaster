import { Component, ChangeDetectionStrategy, inject, OnInit, Signal, WritableSignal, signal, computed } from '@angular/core';
import { CharacterClass, CharacterClassDefinition, CharacterState, CHARACTER_CLASSES } from '@shared/index';
import { GameStateService } from '../../services/game-state.service';
import { GameComponent } from '../game/game.component';

@Component({
  selector: 'app-dev',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameComponent],
  host: {
    class: 'dev-page',
  },
  templateUrl: './dev.component.html',
  styleUrl: './dev.component.css',
})
export class DevComponent implements OnInit {
  private readonly gameState: GameStateService = inject(GameStateService);

  readonly selectedClass: WritableSignal<CharacterClass> = signal<CharacterClass>(CharacterClass.Warrior);

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
}
