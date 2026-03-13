import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CharacterClass } from '@shared/index';
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

  ngOnInit(): void {
    this.gameState.createPlayer('Dev', CharacterClass.Warrior);
  }
}
