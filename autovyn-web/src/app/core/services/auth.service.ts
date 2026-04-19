import { HttpBackend, HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthSession } from '../../shared/models/auth.model';
import { ApiResponse, PaginatedData } from '../../shared/models/api.model';
import { Permission, Role, User, UserFlag } from '../../shared/models/user.model';
import { StorageUtil } from '../../shared/utils/storage.util';

const AUTH_KEY = 'autovyn_auth';
const AUTH_USER_KEY = 'autovyn_auth_user';
const AUTH_USERS_KEY = 'autovyn_users_cache';
const ROLE_SET = new Set<Role>(['ADMIN', 'EMPLOYEE', 'HR']);
const PERMISSION_SET = new Set<Permission>([
  'APPROVE_LEAVE',
  'APPROVE_ARS',
  'VIEW_TEAM',
  'MANAGE_EMPLOYEES',
  'CREATE_USER',
  'MANAGER',
  'TEAM_LEAD'
]);

interface BackendUser {
  id: string;
  employeeId?: string | null;
  adminId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  profilePhotoUrl?: string | null;
  joiningDate?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  emergencyContact?: string | null;
  address?: string | null;
  designation: string;
  city: string;
  workMode: 'WFO' | 'WFH' | 'HYBRID';
  role: Role;
  permissions: string[];
  managerId?: string | null;
  manager?: {
    id: string;
    name: string;
    employeeId?: string | null;
  } | null;
  teamMembers?: Array<{ id: string }>;
}

interface BackendAuthPayload {
  accessToken: string;
  refreshToken: string;
  user: BackendUser;
}

interface RegisterUserPayload {
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  city: string;
  joiningDate: string;
  dateOfBirth?: string;
  gender?: string;
  emergencyContact?: string;
  address?: string;
  role: Role;
  workMode: 'WFO' | 'WFH' | 'HYBRID';
}

export interface RegisterUserInput {
  name: string;
  email: string;
  mobile: string;
  department: string;
  designation: string;
  city: string;
  joiningDate: string;
  dateOfBirth?: string;
  gender?: string;
  emergencyContact?: string;
  address?: string;
  role: Role;
  workMode: 'WFO' | 'WFH' | 'HYBRID';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUserSubject = new BehaviorSubject<User | null>(null);
  private readonly usersSubject = new BehaviorSubject<User[]>([]);
  readonly currentUser$ = this.currentUserSubject.asObservable();
  readonly users$ = this.usersSubject.asObservable();
  private readonly rawHttp: HttpClient;
  private usersRefreshInFlight = false;
  private lastUsersRefreshAt = 0;

  private get apiBase(): string {
    return environment.apiBaseUrl;
  }

  constructor(
    private readonly http: HttpClient,
    httpBackend: HttpBackend
  ) {
    this.rawHttp = new HttpClient(httpBackend);
    this.hydrateCachedUser();
    this.hydrateCachedUsers();
    this.bootstrapSession();
  }

  login(loginId: string, password?: string): Observable<User | null> {
    const normalizedLoginId = loginId.trim().toUpperCase();
    const normalizedPassword = password?.trim() ?? '';
    if (!normalizedLoginId || !normalizedPassword) {
      return of(null);
    }

    const loginFlow$ = this.http
      .post<ApiResponse<BackendAuthPayload>>(`${this.apiBase}/auth/login`, {
        loginId: normalizedLoginId,
        password: normalizedPassword
      })
      .pipe(map((response) => response.data));

    return loginFlow$.pipe(
      tap((payload) => this.persistSession(payload)),
      switchMap(() => this.fetchCurrentUser()),
      map((user) => {
        this.currentUserSubject.next(user);
        this.persistCachedUser(user);
        this.refreshUsers();
        return user;
      }),
      catchError((error: HttpErrorResponse) =>
        throwError(() => new Error(this.resolveApiErrorMessage(error, 'Invalid login ID or password.')))
      )
    );
  }

  logout(): void {
    const refreshToken = this.getSession()?.refreshToken;
    if (refreshToken) {
      this.http
        .post<ApiResponse<{ loggedOut: boolean }>>(`${this.apiBase}/auth/logout`, { refreshToken })
        .pipe(catchError(() => of(null)))
        .subscribe();
    }

    this.clearSession();
  }

  handleAuthFailure(): void {
    // Keep the persisted session until the user explicitly logs out.
  }

  tryRefreshSession(): Observable<boolean> {
    const session = this.getSession();
    if (!session?.refreshToken) {
      return of(false);
    }

    return this.refreshSession(session.refreshToken).pipe(
      tap((payload) => this.persistSession(payload)),
      switchMap(() => this.fetchCurrentUser()),
      map((user) => {
        this.currentUserSubject.next(user);
        this.persistCachedUser(user);
        this.refreshUsers();
        return true;
      }),
      catchError(() => of(false))
    );
  }

  canViewTeamDirectory(): boolean {
    const currentUser = this.currentUserSubject.value;
    if (!currentUser) return false;
    return (
      currentUser.roles.includes('ADMIN') ||
      currentUser.roles.includes('HR') ||
      currentUser.permissions.includes('VIEW_TEAM') ||
      currentUser.permissions.includes('MANAGE_EMPLOYEES') ||
      currentUser.permissions.includes('CREATE_USER')
    );
  }

  getSession(): AuthSession | null {
    return StorageUtil.read<AuthSession | null>(AUTH_KEY, null);
  }

  hasRole(role: string): boolean {
    const roles = this.getSession()?.roles;
    return Array.isArray(roles) ? roles.includes(role as Role) : false;
  }

  hasPermission(permission: string): boolean {
    const permissions = this.getSession()?.permissions;
    return Array.isArray(permissions) ? permissions.includes(permission as Permission) : false;
  }

  getCurrentUserSnapshot(): User | null {
    return this.currentUserSubject.value;
  }

  getUsersSnapshot(): User[] {
    return [...this.usersSubject.value];
  }

  isAuthenticated(): boolean {
    const token = this.getSession()?.token;
    return typeof token === 'string' && token.length > 0;
  }

  getDefaultRoute(): string {
    const roles = this.currentUserSubject.value?.roles?.length
      ? this.currentUserSubject.value.roles
      : this.getSession()?.roles ?? [];

    return roles.includes('ADMIN') ? '/admin/dashboard' : '/employee/attendance';
  }

  usersByRole(role: Role): Observable<User[]> {
    this.refreshUsers();
    return this.users$.pipe(map((users) => users.filter((u) => u.roles.includes(role))));
  }

  getUsers(): Observable<User[]> {
    this.refreshUsers();
    return this.users$.pipe(map((users) => [...users]));
  }

  getApprovers(): Observable<User[]> {
    if (!this.isAuthenticated()) return of([]);

    return this.http
      .get<ApiResponse<BackendUser[]>>(`${this.apiBase}/users/approvers`, {
        params: new HttpParams().set('type', 'both')
      })
      .pipe(
        map((response) => response.data.map((item) => this.mapUser(item))),
        catchError(() => of([]))
      );
  }

  getTeamMembers(): Observable<User[]> {
    if (!this.isAuthenticated()) return of([]);
    return this.fetchAllTeamMembers();
  }

  updateMyProfilePhoto(profilePhotoUrl: string): Observable<User | null> {
    if (!this.isAuthenticated()) return of(null);
    return this.http
      .patch<ApiResponse<BackendUser>>(`${this.apiBase}/users/me/photo`, { profilePhotoUrl })
      .pipe(
        map((response) => this.mapUser(response.data)),
        tap((user) => {
          this.currentUserSubject.next(user);
          this.persistCachedUser(user);
          const existing = this.usersSubject.value;
          const updated = existing.some((item) => item.id === user.id)
            ? existing.map((item) => (item.id === user.id ? user : item))
            : [user, ...existing];
          this.usersSubject.next(updated);
        }),
        catchError(() => of(null))
      );
  }

  registerUser(input: RegisterUserInput): Observable<{ user: User; defaultPassword: string }> {
    if (!this.isAuthenticated()) {
      return of({
        user: {
          id: '',
          name: input.name,
          designation: input.designation,
          roles: [input.role],
          permissions: [],
          city: input.city,
          workMode: input.workMode,
          teamMemberIds: []
        },
        defaultPassword: ''
      });
    }

    const defaultPassword = input.joiningDate.trim();

    const payload: RegisterUserPayload & {
      password: string;
    } = {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.mobile.trim(),
      department: input.department.trim(),
      designation: input.designation.trim(),
      city: input.city.trim(),
      joiningDate: input.joiningDate.trim(),
      dateOfBirth: input.dateOfBirth?.trim() || undefined,
      gender: input.gender?.trim() || undefined,
      emergencyContact: input.emergencyContact?.trim() || undefined,
      address: input.address?.trim() || undefined,
      role: input.role,
      workMode: input.workMode,
      password: defaultPassword
    };

    return this.http.post<ApiResponse<BackendUser>>(`${this.apiBase}/users`, payload).pipe(
      map((response) => ({
        user: this.mapUser(response.data),
        defaultPassword
      })),
      tap(() => this.refreshUsers()),
      catchError(() =>
        of({
          user: {
            id: '',
            name: input.name,
            designation: input.designation,
            roles: [input.role],
            permissions: [],
            city: input.city,
            workMode: input.workMode,
            teamMemberIds: []
          },
          defaultPassword: ''
        })
      )
    );
  }

  private bootstrapSession(): void {
    const session = this.getSession();
    if (!session?.token) return;

    this.fetchCurrentUser()
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (!this.isAuthFailure(error)) {
            // Preserve session on temporary/network issues.
            return of(null);
          }

          if (!session.refreshToken) {
            return of(null);
          }

          return this.refreshSession(session.refreshToken).pipe(
            switchMap((payload) => {
              this.persistSession(payload);
              return this.fetchCurrentUser();
            }),
            catchError(() => of(null))
          );
        })
      )
      .subscribe((user) => {
        if (!user) return;
        this.currentUserSubject.next(user);
        this.persistCachedUser(user);
        this.refreshUsers();
      });
  }

  private isAuthFailure(error: HttpErrorResponse): boolean {
    return error.status === 401;
  }

  private resolveApiErrorMessage(error: HttpErrorResponse, fallback: string): string {
    const messageFromApi =
      (error.error && typeof error.error === 'object' && 'message' in error.error ? (error.error.message as string) : '') || '';
    const message = messageFromApi || error.message || fallback;
    return typeof message === 'string' && message.trim() ? message.trim() : fallback;
  }

  private fetchCurrentUser(): Observable<User> {
    return this.http.get<ApiResponse<BackendUser>>(`${this.apiBase}/users/me`).pipe(map((response) => this.mapUser(response.data)));
  }

  private refreshSession(refreshToken: string): Observable<BackendAuthPayload> {
    return this.rawHttp
      .post<ApiResponse<BackendAuthPayload>>(`${this.apiBase}/auth/refresh`, { refreshToken })
      .pipe(map((response) => response.data));
  }

  private refreshUsers(): void {
    if (!this.isAuthenticated()) {
      this.usersSubject.next([]);
      return;
    }

    if (!this.canViewTeamDirectory()) {
      const current = this.currentUserSubject.value;
      const fallbackUsers = current ? [current] : [];
      this.usersSubject.next(fallbackUsers);
      if (fallbackUsers.length) {
        this.persistCachedUsers(fallbackUsers);
      }
      return;
    }

    const now = Date.now();
    if (this.usersRefreshInFlight) return;
    if (this.usersSubject.value.length && now - this.lastUsersRefreshAt < 30_000) {
      return;
    }

    this.usersRefreshInFlight = true;

    this.fetchAllTeamMembers()
      .subscribe((users) => {
        this.usersRefreshInFlight = false;
        this.lastUsersRefreshAt = Date.now();
        const current = this.currentUserSubject.value;
        if (!current) {
          this.usersSubject.next(users);
          this.persistCachedUsers(users);
          return;
        }

        const hasCurrentUser = users.some((user) => user.id === current.id);
        const resolvedUsers = hasCurrentUser ? users : [current, ...users];
        if (!resolvedUsers.length && this.usersSubject.value.length) {
          return;
        }
        this.usersSubject.next(resolvedUsers);
        this.persistCachedUsers(resolvedUsers);
      });
  }

  private fetchAllTeamMembers(): Observable<User[]> {
    const limit = 100;
    const pageRequest = (page: number): Observable<ApiResponse<PaginatedData<BackendUser>>> =>
      this.http.get<ApiResponse<PaginatedData<BackendUser>>>(`${this.apiBase}/users`, {
        params: new HttpParams().set('page', String(page)).set('limit', String(limit))
      });

    return pageRequest(1).pipe(
      switchMap((first) => {
        const firstPage = first.data;
        const totalPages = firstPage.pagination.totalPages;
        if (totalPages <= 1) {
          return of(firstPage.items);
        }

        const restRequests = Array.from({ length: totalPages - 1 }, (_, index) => pageRequest(index + 2));
        return forkJoin(restRequests).pipe(
          map((responses) => [firstPage.items, ...responses.map((item) => item.data.items)].flat())
        );
      }),
      map((items) => items.map((item) => this.mapUser(item))),
      catchError(() => {
        const current = this.currentUserSubject.value;
        const fallbackUsers = this.usersSubject.value.length ? this.usersSubject.value : current ? [current] : [];
        return of(fallbackUsers);
      })
    );
  }

  private persistSession(payload: BackendAuthPayload): void {
    const user = this.mapUser(payload.user);
    const session: AuthSession = {
      token: payload.accessToken,
      refreshToken: payload.refreshToken,
      userId: user.id,
      roles: user.roles,
      permissions: user.permissions
    };
    StorageUtil.write(AUTH_KEY, session);
  }

  private clearSession(): void {
    StorageUtil.remove(AUTH_KEY);
    StorageUtil.remove(AUTH_USER_KEY);
    StorageUtil.remove(AUTH_USERS_KEY);
    this.currentUserSubject.next(null);
    this.usersSubject.next([]);
    this.lastUsersRefreshAt = 0;
  }

  private hydrateCachedUser(): void {
    const session = this.getSession();
    if (!session?.token) return;

    const cachedUser = StorageUtil.read<User | null>(AUTH_USER_KEY, null);
    if (!cachedUser) return;

    this.currentUserSubject.next(cachedUser);
  }

  private hydrateCachedUsers(): void {
    const session = this.getSession();
    if (!session?.token) return;

    const cachedUsers = StorageUtil.read<User[]>(AUTH_USERS_KEY, []);
    if (!Array.isArray(cachedUsers) || !cachedUsers.length) return;

    this.usersSubject.next(cachedUsers);
  }

  private persistCachedUser(user: User): void {
    StorageUtil.write(AUTH_USER_KEY, user);
  }

  private persistCachedUsers(users: User[]): void {
    StorageUtil.write(AUTH_USERS_KEY, users);
  }

  private mapUser(raw: BackendUser): User {
    const role: Role = ROLE_SET.has(raw.role) ? raw.role : 'EMPLOYEE';
    const permissions = (Array.isArray(raw.permissions) ? raw.permissions : [])
      .map((permission) => (typeof permission === 'string' ? permission.trim().toUpperCase() : ''))
      .filter((permission): permission is Permission => PERMISSION_SET.has(permission as Permission));

    return {
      id: raw.id,
      employeeId: raw.employeeId ?? undefined,
      adminId: raw.adminId ?? undefined,
      name: raw.name,
      email: raw.email ?? undefined,
      mobile: raw.phone ?? undefined,
      department: raw.department ?? undefined,
      profilePhotoUrl: raw.profilePhotoUrl ?? undefined,
      joiningDate: raw.joiningDate ?? undefined,
      dateOfBirth: raw.dateOfBirth ?? undefined,
      gender: raw.gender ?? undefined,
      bloodGroup: raw.bloodGroup ?? undefined,
      emergencyContact: raw.emergencyContact ?? undefined,
      address: raw.address ?? undefined,
      designation: raw.designation,
      roles: [role],
      permissions,
      city: raw.city,
      workMode: raw.workMode,
      managerId: raw.managerId ?? undefined,
      managerName: raw.manager?.name ?? undefined,
      managerEmployeeId: raw.manager?.employeeId ?? undefined,
      teamMemberIds: Array.isArray(raw.teamMembers)
        ? raw.teamMembers.map((item) => item.id)
        : [],
      userFlag: this.resolveUserFlag(role, permissions)
    };
  }

  getUserFlag(user: User | null): UserFlag | null {
    if (!user) return null;
    return user.userFlag ?? this.resolveUserFlag(user.roles[0] ?? 'EMPLOYEE', user.permissions);
  }

  private resolveUserFlag(role: Role, permissions: Permission[]): UserFlag {
    if (role === 'ADMIN') return 'ADMIN';
    if (role === 'HR') return 'HR';
    if (permissions.includes('TEAM_LEAD') || permissions.includes('MANAGER')) return 'TL';
    return 'EMPLOYEE';
  }
}
