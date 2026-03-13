import { Component, ChangeDetectionStrategy, WritableSignal, Signal, signal, inject, OnInit, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { CharacterState } from '@shared/index';
import { GameStateService } from '../../services/game-state.service';
import { GameCanvasComponent } from '../../components/game-canvas/game-canvas.component';
import { HudComponent } from '../../components/hud/hud.component';
import { SettingsComponent } from '../../components/settings/settings.component';

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameCanvasComponent, HudComponent, SettingsComponent],
  host: {
    class: 'game-page',
  },
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
})
export class GameComponent implements OnInit {
  private readonly gameState: GameStateService = inject(GameStateService);
  private readonly router: Router = inject(Router);
  private readonly gameCanvas: Signal<GameCanvasComponent | undefined> = viewChild(GameCanvasComponent);

  readonly player: WritableSignal<CharacterState | null> = this.gameState.player;
  readonly wave: WritableSignal<number> = signal<number>(1);
  readonly score: WritableSignal<number> = signal<number>(0);
  readonly isGameOver: WritableSignal<boolean> = signal<boolean>(false);
  readonly settingsOpen: WritableSignal<boolean> = signal<boolean>(false);
  readonly currentPlayerDisplay: WritableSignal<CharacterState> = signal<CharacterState>(null!);

  ngOnInit(): void {
    this.syncPlayerDisplay();
  }

  onPlayerUpdate(enginePlayer: CharacterState): void {
    const current: CharacterState | null = this.gameState.player();
    if (current) {
      const merged: CharacterState = {
        ...enginePlayer,
        level: current.level,
        xp: current.xp,
        xpToNext: current.xpToNext,
        stats: current.stats,
        derived: current.derived,
      };
      this.gameState.player.set(merged);
      this.currentPlayerDisplay.set(merged);
    } else {
      this.gameState.player.set({ ...enginePlayer });
      this.currentPlayerDisplay.set({ ...enginePlayer });
    }
  }

  onXpGained(amount: number): void {
    this.gameState.addXp(amount);
    const updated: CharacterState | null = this.gameState.player();
    if (updated) {
      this.gameCanvas()?.syncProgression(updated);
      this.currentPlayerDisplay.set({ ...updated });
    }
  }

  onScoreUpdate(delta: number): void {
    this.score.update((s: number) => s + delta);
    this.gameState.score.set(this.score());
  }

  onWaveUpdate(event: { wave: number; remaining: number }): void {
    this.wave.set(event.wave);
    this.gameState.wave.set(event.wave);
    this.gameState.zombiesRemaining.set(event.remaining);
  }

  onSettingsOpenChanged(isOpen: boolean): void {
    this.settingsOpen.set(isOpen);
  }

  onGameOver(): void {
    this.isGameOver.set(true);
    this.gameState.gameOver.set(true);
  }

  retry(): void {
    const p: CharacterState | null = this.gameState.player();
    if (!p) return;
    this.gameState.createPlayer(p.name, p.classId);
    this.isGameOver.set(false);
    this.wave.set(1);
    this.score.set(0);
    this.syncPlayerDisplay();
  }

  backToMenu(): void {
    this.gameState.reset();
    this.router.navigate(['/']);
  }

  private syncPlayerDisplay(): void {
    const p: CharacterState | null = this.gameState.player();
    if (p) {
      this.currentPlayerDisplay.set({ ...p });
    }
  }
}
