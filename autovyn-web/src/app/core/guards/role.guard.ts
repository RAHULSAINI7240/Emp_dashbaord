import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const role = route.data['role'] as string | undefined;
  const roles = route.data['roles'] as string[] | undefined;
  if (roles?.length) {
    return roles.some((item) => auth.hasRole(item)) ? true : router.createUrlTree(['/auth/login']);
  }
  if (!role) return true;
  return auth.hasRole(role) ? true : router.createUrlTree(['/auth/login']);
};
