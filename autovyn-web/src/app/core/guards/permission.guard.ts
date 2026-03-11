import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const permissionGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const permission = route.data['permission'] as string | undefined;
  const roles = route.data['roles'] as string[] | undefined;

  if (roles?.some((role) => auth.hasRole(role))) {
    return true;
  }

  if (!permission) return true;
  return auth.hasPermission(permission) ? true : router.createUrlTree(['/employee/dashboard']);
};
