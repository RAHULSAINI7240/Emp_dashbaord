import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ARSRequest, MissingType } from '../../shared/models/ars.model';
import { ApiResponse, PaginatedData } from '../../shared/models/api.model';
import { RequestStatus } from '../../shared/models/leave.model';
import { AuthService } from './auth.service';
import { User } from '../../shared/models/user.model';

interface BackendArsRequest {
  id: string;
  employeeId: string;
  approverId: string;
  date: string;
  missingType: 'MISSING_IN' | 'MISSING_OUT' | 'BOTH';
  reason: string;
  status: RequestStatus;
  createdAt: string;
  comment?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ArsService {
  private readonly requestsSubject = new BehaviorSubject<ARSRequest[]>([]);
  requests$ = this.requestsSubject.asObservable();

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
            this.requestsSubject.next([]);
            return of([] as ARSRequest[]);
          }
          return this.refreshRequestsForCurrentUser();
        })
      )
      .subscribe();
  }

  getByEmployee(employeeId: string): Observable<ARSRequest[]> {
    const current = this.authService.getCurrentUserSnapshot();
    if (!current) return of([]);

    if (employeeId === current.id) {
      return this.fetchMyRequests().pipe(map((items) => items.filter((item) => item.employeeId === employeeId)));
    }

    const canViewApprovals = this.canViewApprovals(current);
    const source$ = canViewApprovals ? this.fetchPendingApprovals() : this.fetchMyRequests();

    return source$.pipe(map((items) => items.filter((item) => item.employeeId === employeeId)));
  }

  getByApprover(approverId: string): Observable<ARSRequest[]> {
    const current = this.authService.getCurrentUserSnapshot();
    if (!current) return of([]);

    const canViewApprovals = this.canViewApprovals(current);
    if (!canViewApprovals) return of([]);

    return this.fetchPendingApprovals().pipe(map((items) => items.filter((item) => item.approverId === approverId)));
  }

  create(payload: Omit<ARSRequest, 'id' | 'createdAt' | 'status'>): Observable<ARSRequest> {
    return this.http
      .post<ApiResponse<BackendArsRequest>>(`${this.apiBase}/ars/request`, {
        date: payload.date,
        missingType: this.toBackendMissingType(payload.missingType),
        reason: payload.reason,
        ...(payload.approverId ? { approverId: payload.approverId } : {})
      })
      .pipe(
        map((response) => this.mapArs(response.data)),
        tap(() => {
          void this.refreshRequestsForCurrentUser().subscribe();
        }),
        catchError((error: HttpErrorResponse) =>
          throwError(() => new Error(this.resolveApiErrorMessage(error, 'Unable to submit ARS request.')))
        )
      );
  }

  updateStatus(id: string, status: RequestStatus, comment?: string): void {
    if (status !== 'APPROVED' && status !== 'DECLINED') return;

    const endpoint = status === 'APPROVED' ? 'approve' : 'decline';

    this.http
      .post<ApiResponse<BackendArsRequest>>(`${this.apiBase}/ars/${id}/${endpoint}`, {
        comment
      })
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        void this.refreshRequestsForCurrentUser().subscribe();
      });
  }

  private refreshRequestsForCurrentUser(): Observable<ARSRequest[]> {
    const current = this.authService.getCurrentUserSnapshot();
    if (!current) {
      this.requestsSubject.next([]);
      return of([]);
    }

    const canViewApprovals = this.canViewApprovals(current);
    const source$ = canViewApprovals ? this.fetchPendingApprovals() : this.fetchMyRequests();

    return source$.pipe(
      tap((requests) => this.requestsSubject.next(requests)),
      catchError(() => {
        this.requestsSubject.next([]);
        return of([]);
      })
    );
  }

  private fetchMyRequests(): Observable<ARSRequest[]> {
    return this.http
      .get<ApiResponse<PaginatedData<BackendArsRequest>>>(`${this.apiBase}/ars/my`, {
        params: new HttpParams().set('page', '1').set('limit', '200')
      })
      .pipe(
        map((response) => response.data.items.map((item) => this.mapArs(item))),
        catchError(() => of([]))
      );
  }

  private fetchPendingApprovals(): Observable<ARSRequest[]> {
    return this.http
      .get<ApiResponse<PaginatedData<BackendArsRequest>>>(`${this.apiBase}/ars/approvals/pending`, {
        params: new HttpParams().set('page', '1').set('limit', '200')
      })
      .pipe(
        map((response) => response.data.items.map((item) => this.mapArs(item))),
        catchError(() => of([]))
      );
  }

  private mapArs(raw: BackendArsRequest): ARSRequest {
    return {
      id: raw.id,
      employeeId: raw.employeeId,
      approverId: raw.approverId,
      date: raw.date.slice(0, 10),
      missingType: this.toFrontendMissingType(raw.missingType),
      reason: raw.reason,
      status: raw.status,
      createdAt: raw.createdAt,
      comment: raw.comment ?? undefined
    };
  }

  private toFrontendMissingType(type: BackendArsRequest['missingType']): MissingType {
    if (type === 'MISSING_IN') return 'MISSING_PUNCH_IN';
    if (type === 'MISSING_OUT') return 'MISSING_PUNCH_OUT';
    return 'BOTH';
  }

  private toBackendMissingType(type: MissingType): 'MISSING_IN' | 'MISSING_OUT' | 'BOTH' {
    if (type === 'MISSING_PUNCH_IN') return 'MISSING_IN';
    if (type === 'MISSING_PUNCH_OUT') return 'MISSING_OUT';
    return 'BOTH';
  }

  private canViewApprovals(user: User): boolean {
    return (
      user.roles.includes('ADMIN') ||
      ['APPROVE_ARS', 'MANAGER', 'TEAM_LEAD'].some((permission) => user.permissions.includes(permission as any))
    );
  }

  private resolveApiErrorMessage(error: HttpErrorResponse, fallback: string): string {
    const messageFromApi =
      (error.error && typeof error.error === 'object' && 'message' in error.error ? (error.error.message as string) : '') || '';
    const message = messageFromApi || error.message || fallback;
    return typeof message === 'string' && message.trim() ? message.trim() : fallback;
  }
}
