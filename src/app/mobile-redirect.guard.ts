import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { isTouchDevice } from './ui/touch-device';

/** The game needs a keyboard: a phone opening any page lands in the mobile level editor. */
export const mobileRedirectGuard: CanActivateFn = (): boolean | UrlTree =>
  isTouchDevice() ? inject(Router).parseUrl('/mobile-editor') : true;
