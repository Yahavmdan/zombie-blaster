import { Routes } from '@angular/router';
import { mobileRedirectGuard } from './mobile-redirect.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [mobileRedirectGuard],
    loadComponent: () =>
      import('./pages/main-menu/main-menu.component').then(
        (m: typeof import('./pages/main-menu/main-menu.component')) => m.MainMenuComponent,
      ),
  },
  {
    path: 'character-select',
    canActivate: [mobileRedirectGuard],
    loadComponent: () =>
      import('./pages/character-select/character-select.component').then(
        (m: typeof import('./pages/character-select/character-select.component')) => m.CharacterSelectComponent,
      ),
  },
  {
    path: 'lobby',
    canActivate: [mobileRedirectGuard],
    loadComponent: () =>
      import('./pages/lobby/lobby.component').then(
        (m: typeof import('./pages/lobby/lobby.component')) => m.LobbyComponent,
      ),
  },
  {
    path: 'game',
    canActivate: [mobileRedirectGuard],
    loadComponent: () =>
      import('./pages/game/game.component').then(
        (m: typeof import('./pages/game/game.component')) => m.GameComponent,
      ),
  },
  {
    path: 'dev',
    canActivate: [mobileRedirectGuard],
    loadComponent: () =>
      import('./pages/dev/dev.component').then(
        (m: typeof import('./pages/dev/dev.component')) => m.DevComponent,
      ),
  },
  {
    path: 'mobile-editor',
    loadComponent: () =>
      import('./pages/mobile-editor/mobile-editor.component').then(
        (m: typeof import('./pages/mobile-editor/mobile-editor.component')) => m.MobileEditorComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
