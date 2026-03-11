import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const session = authService.getSession();

  if (req.url.includes('/auth/login') || req.url.includes('/auth/refresh')) {
    return next(req);
  }

  if (!session?.token) {
    return next(req);
  }

  const authorizedRequest = req.clone({ setHeaders: { Authorization: `Bearer ${session.token}` } });
  return next(authorizedRequest).pipe(
    catchError((error) => {
      if (error.status !== 401 || !session.refreshToken) {
        if (error.status === 401) {
          authService.handleAuthFailure();
        }
        return throwError(() => error);
      }

      return authService.tryRefreshSession().pipe(
        switchMap((refreshed) => {
          if (!refreshed) {
            authService.handleAuthFailure();
            return throwError(() => error);
          }

          const updatedSession = authService.getSession();
          if (!updatedSession?.token) {
            return throwError(() => error);
          }

          return next(req.clone({ setHeaders: { Authorization: `Bearer ${updatedSession.token}` } }));
        }),
        catchError((refreshError) => {
          authService.handleAuthFailure();
          return throwError(() => refreshError);
        })
      );
    })
  );
};
