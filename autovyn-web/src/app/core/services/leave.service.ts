import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginatedData } from '../../shared/models/api.model';
import { LeaveRequest, LeaveSummary, RequestStatus } from '../../shared/models/leave.model';
import { AuthService } from './auth.service';
import { User } from '../../shared/models/user.model';

interface BackendLeaveRequest {
  id: string;
  employeeId: string;
  approverId: string;
  type: LeaveRequest['type'];
  duration: LeaveRequest['duration'];
  halfDaySession?: LeaveRequest['halfDaySession'] | null;
  reason: string;
  dates: string[];
  status: RequestStatus;
  createdAt: string;
  comment?: string | null;
}

interface BackendApproverPayload {
  defaultApproverId: string | null;
  items: Array<{
    id: string;
    employeeId?: string | null;
    adminId?: string | null;
    name: string;
    designation?: string | null;
    city?: string | null;
    workMode?: 'WFO' | 'WFH' | 'HYBRID' | null;
    role: 'ADMIN' | 'EMPLOYEE' | 'HR';
    permissions: string[];
    managerId?: string | null;
    phone?: string | null;
    email?: string | null;
  }>;
}

@Injectable({ providedIn: 'root' })
export class LeaveService {
  private readonly requestsSubject = new BehaviorSubject<LeaveRequest[]>([]);
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
            return of([] as LeaveRequest[]);
          }
          return this.refreshRequestsForCurrentUser();
        })
      )
      .subscribe();
  }

  getByEmployee(employeeId: string): Observable<LeaveRequest[]> {
    const current = this.authService.getCurrentUserSnapshot();
    if (!current) return of([]);

    if (employeeId === current.id) {
      return this.fetchMyLeaves().pipe(map((items) => items.filter((item) => item.employeeId === employeeId)));
    }

    const canViewApprovals = current.roles.includes('ADMIN') || current.permissions.includes('APPROVE_LEAVE');

    const source$ = canViewApprovals ? this.fetchApprovalsCombined() : this.fetchMyLeaves();
    return source$.pipe(map((items) => items.filter((item) => item.employeeId === employeeId)));
  }

  getByApprover(approverId: string): Observable<LeaveRequest[]> {
    const current = this.authService.getCurrentUserSnapshot();
    if (!current) return of([]);

    const canViewApprovals = current.roles.includes('ADMIN') || current.permissions.includes('APPROVE_LEAVE');
    if (!canViewApprovals) return of([]);

    return this.fetchApprovalsCombined().pipe(map((items) => items.filter((item) => item.approverId === approverId)));
  }

  create(payload: Omit<LeaveRequest, 'id' | 'createdAt' | 'status'>): Observable<LeaveRequest> {
    return this.http
      .post<ApiResponse<BackendLeaveRequest>>(`${this.apiBase}/leaves/request`, {
        approverId: payload.approverId,
        type: payload.type,
        duration: payload.duration,
        halfDaySession: payload.halfDaySession,
        reason: payload.reason,
        dates: payload.dates
      })
      .pipe(
        map((response) => this.mapLeave(response.data)),
        tap(() => {
          void this.refreshRequestsForCurrentUser().subscribe();
        })
      );
  }

  getSummary(): Observable<LeaveSummary | null> {
    return this.http
      .get<ApiResponse<LeaveSummary>>(`${this.apiBase}/leaves/summary`)
      .pipe(
        map((response) => response.data),
        catchError(() => of(null))
      );
  }

  getEligibleApprovers(): Observable<{ defaultApproverId: string | null; items: User[] }> {
    return this.http
      .get<ApiResponse<BackendApproverPayload>>(`${this.apiBase}/leaves/approvers`)
      .pipe(
        map((response) => ({
          defaultApproverId: response.data.defaultApproverId,
          items: response.data.items.map((item) => ({
            id: item.id,
            employeeId: item.employeeId ?? undefined,
            adminId: item.adminId ?? undefined,
            name: item.name,
            designation: item.designation ?? '',
            roles: [item.role],
            permissions: (item.permissions ?? []) as any,
            city: item.city ?? 'Unknown',
            workMode: item.workMode ?? 'WFO',
            managerId: item.managerId ?? undefined,
            mobile: item.phone ?? undefined,
            email: item.email ?? undefined,
            teamMemberIds: []
          }))
        })),
        catchError(() => of({ defaultApproverId: null, items: [] }))
      );
  }

  updateStatus(id: string, status: RequestStatus, comment?: string): void {
    if (status !== 'APPROVED' && status !== 'DECLINED') return;

    const endpoint = status === 'APPROVED' ? 'approve' : 'decline';

    this.http
      .post<ApiResponse<BackendLeaveRequest>>(`${this.apiBase}/leaves/${id}/${endpoint}`, {
        comment
      })
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        void this.refreshRequestsForCurrentUser().subscribe();
      });
  }

  private refreshRequestsForCurrentUser(): Observable<LeaveRequest[]> {
    const current = this.authService.getCurrentUserSnapshot();
    if (!current) {
      this.requestsSubject.next([]);
      return of([]);
    }

    const canViewApprovals = current.roles.includes('ADMIN') || current.permissions.includes('APPROVE_LEAVE');
    const source$ = canViewApprovals ? this.fetchApprovalsCombined() : this.fetchMyLeaves();

    return source$.pipe(
      tap((requests) => this.requestsSubject.next(requests)),
      catchError(() => {
        this.requestsSubject.next([]);
        return of([]);
      })
    );
  }

  private fetchMyLeaves(): Observable<LeaveRequest[]> {
    return this.http
      .get<ApiResponse<PaginatedData<BackendLeaveRequest>>>(`${this.apiBase}/leaves/my`, {
        params: new HttpParams().set('page', '1').set('limit', '200')
      })
      .pipe(
        map((response) => response.data.items.map((item) => this.mapLeave(item))),
        catchError(() => of([]))
      );
  }

  private fetchApprovalsCombined(): Observable<LeaveRequest[]> {
    return forkJoin([this.fetchPendingApprovals(), this.fetchHistoryApprovals()]).pipe(
      map(([pending, history]) => this.mergeDistinctRequests([...pending, ...history]))
    );
  }

  private fetchPendingApprovals(): Observable<LeaveRequest[]> {
    return this.http
      .get<ApiResponse<PaginatedData<BackendLeaveRequest>>>(`${this.apiBase}/leaves/approvals/pending`, {
        params: new HttpParams().set('page', '1').set('limit', '200')
      })
      .pipe(
        map((response) => response.data.items.map((item) => this.mapLeave(item))),
        catchError(() => of([]))
      );
  }

  private fetchHistoryApprovals(): Observable<LeaveRequest[]> {
    return this.http
      .get<ApiResponse<PaginatedData<BackendLeaveRequest>>>(`${this.apiBase}/leaves/approvals/history`, {
        params: new HttpParams().set('page', '1').set('limit', '200')
      })
      .pipe(
        map((response) => response.data.items.map((item) => this.mapLeave(item))),
        catchError(() => of([]))
      );
  }

  private mergeDistinctRequests(requests: LeaveRequest[]): LeaveRequest[] {
    const mapById = new Map<string, LeaveRequest>();
    requests.forEach((request) => mapById.set(request.id, request));
    return Array.from(mapById.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private mapLeave(raw: BackendLeaveRequest): LeaveRequest {
    return {
      id: raw.id,
      employeeId: raw.employeeId,
      approverId: raw.approverId,
      type: raw.type,
      duration: raw.duration,
      halfDaySession: raw.halfDaySession ?? undefined,
      reason: raw.reason,
      dates: raw.dates,
      status: raw.status,
      createdAt: raw.createdAt,
      comment: raw.comment ?? undefined
    };
  }
}
