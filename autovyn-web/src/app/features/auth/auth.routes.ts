import { Routes } from '@angular/router';
import { redirectIfAuthenticatedGuard } from '../../core/guards/redirect-if-authenticated.guard';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    canActivate: [redirectIfAuthenticatedGuard],
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent)
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' }
];
