import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/main-menu/main-menu.component').then(
        (m: typeof import('./pages/main-menu/main-menu.component')) => m.MainMenuComponent,
      ),
  },
  {
    path: 'character-select',
    loadComponent: () =>
      import('./pages/character-select/character-select.component').then(
        (m: typeof import('./pages/character-select/character-select.component')) => m.CharacterSelectComponent,
      ),
  },
  {
    path: 'game',
    loadComponent: () =>
      import('./pages/game/game.component').then(
        (m: typeof import('./pages/game/game.component')) => m.GameComponent,
      ),
  },
  {
    path: 'dev',
    loadComponent: () =>
      import('./pages/dev/dev.component').then(
        (m: typeof import('./pages/dev/dev.component')) => m.DevComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
