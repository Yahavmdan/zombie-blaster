import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { GameMode } from '@shared/multiplayer';

interface FloatingZombie {
  id: number;
  x: number;
  y: number;
  delay: number;
  opacity: number;
  emoji: string;
}

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

  readonly floatingZombies: FloatingZombie[] = Array.from(
    { length: 8 },
    (_: unknown, i: number): FloatingZombie => ({
      id: i,
      x: Math.random() * 90 + 5 + (i % 2 === 0 ? 0 : 50),
      y: Math.random() * 80 + 10,
      delay: Math.random() * 5,
      opacity: 0.15 + Math.random() * 0.15,
      emoji: ['🧟', '💀', '☠️', '👻'][i % 4],
    }),
  ).map((z: FloatingZombie): FloatingZombie => ({
    ...z,
    x: (z.x / 100) * window.innerWidth,
    y: (z.y / 100) * window.innerHeight,
  }));

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
