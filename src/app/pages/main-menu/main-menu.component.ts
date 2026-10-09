import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { GameMode } from '@shared/multiplayer';

@Component({
  selector: 'app-main-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'main-menu',
  },
  templateUrl: './main-menu.component.html',
  styleUrl: './main-menu.component.css',
})
export class MainMenuComponent {
  private readonly router: Router = inject(Router);

  showHelp: boolean = false;

  onSinglePlayer(): void {
    void this.router.navigate(['/character-select'], {
      queryParams: { mode: GameMode.SinglePlayer },
    });
  }

  onMultiplayer(): void {
    void this.router.navigate(['/character-select'], {
      queryParams: { mode: GameMode.Multiplayer },
    });
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }
}
