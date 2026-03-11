import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, of, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ManagedCredential, CredentialInput } from '../../shared/models/credential.model';
import { ApiResponse } from '../../shared/models/api.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CredentialManagerService {
  private readonly credentialsSubject = new BehaviorSubject<ManagedCredential[]>([]);
  readonly credentials$ = this.credentialsSubject.asObservable();

  private get apiBase(): string {
    return environment.apiBaseUrl;
  }

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {
    this.authService.currentUser$
      .pipe(
        switchMap((user) => {
          if (!user) {
            this.credentialsSubject.next([]);
            return of([] as ManagedCredential[]);
          }
          return this.refresh();
        })
      )
      .subscribe();
  }

  create(input: CredentialInput): Observable<ManagedCredential | null> {
    return this.http.post<ApiResponse<ManagedCredential>>(`${this.apiBase}/credentials`, input).pipe(
      switchMap((response) =>
        this.refresh().pipe(
          switchMap(() => of(response.data))
        )
      ),
      catchError(() => of(null))
    );
  }

  update(id: string, input: CredentialInput): Observable<ManagedCredential | null> {
    return this.http.put<ApiResponse<ManagedCredential>>(`${this.apiBase}/credentials/${id}`, input).pipe(
      switchMap((response) =>
        this.refresh().pipe(
          switchMap(() => of(response.data))
        )
      ),
      catchError(() => of(null))
    );
  }

  delete(id: string): Observable<boolean> {
    return this.http.delete<ApiResponse<{ deleted: boolean }>>(`${this.apiBase}/credentials/${id}`).pipe(
      switchMap(() => this.refresh()),
      switchMap(() => of(true)),
      catchError(() => of(false))
    );
  }

  refresh(): Observable<ManagedCredential[]> {
    return this.http.get<ApiResponse<ManagedCredential[]>>(`${this.apiBase}/credentials`).pipe(
      tap((response) => this.credentialsSubject.next(response.data)),
      switchMap((response) => of(response.data)),
      catchError(() => {
        this.credentialsSubject.next([]);
        return of([]);
      })
    );
  }

  ensureDefaults(_users = this.authService.getUsersSnapshot()): void {}
}
