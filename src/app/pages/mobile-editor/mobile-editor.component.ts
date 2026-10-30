import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CharacterClass } from '@shared/index';
import { GameStateService } from '../../services/game-state.service';
import { GameComponent } from '../game/game.component';
import { PixelIconComponent } from '../../ui/pixel-icon/pixel-icon.component';

/**
 * The level editor for a phone (every phone is sent here): a solo floor with the editor open,
 * god mode on, and touch controls to walk the puzzle.
 */
@Component({
  selector: 'app-mobile-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameComponent, PixelIconComponent],
  host: {
    class: 'mobile-editor-page',
  },
  templateUrl: './mobile-editor.component.html',
  styleUrl: './mobile-editor.component.css',
})
export class MobileEditorComponent implements OnInit {
  private readonly gameState: GameStateService = inject(GameStateService);

  ngOnInit(): void {
    this.gameState.createPlayer('Dev', CharacterClass.Warrior);
    this.gameState.godMode.set(true);
  }
}
