import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api.model';

export interface ProjectPerson {
  id: string;
  name: string;
  employeeId?: string;
  adminId?: string;
  designation: string;
  department?: string;
  city: string;
  roleLabel?: string;
  managerId?: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  client: string;
  summary: string;
  category: string;
  status: string;
  teamName?: string;
  frontendStack?: string;
  backendStack?: string;
  qaSummary?: string;
  supportSummary?: string;
  modules: string[];
  highlights: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
    employeeId?: string;
    adminId?: string;
    designation: string;
  };
  members: ProjectPerson[];
}

export interface ProjectWorkspace {
  canManage: boolean;
  items: ProjectItem[];
  assignableUsers: ProjectPerson[];
}

export interface SaveProjectInput {
  name: string;
  client: string;
  summary: string;
  category: string;
  status: string;
  teamName?: string;
  frontendStack?: string;
  backendStack?: string;
  qaSummary?: string;
  supportSummary?: string;
  modules: string[];
  highlights: string[];
  memberIds: string[];
  memberRoles?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private get apiBase(): string {
    return environment.apiBaseUrl;
  }

  constructor(private readonly http: HttpClient) {}

  getWorkspace(): Observable<ProjectWorkspace> {
    return this.http
      .get<ApiResponse<ProjectWorkspace>>(`${this.apiBase}/projects`, {
        headers: new HttpHeaders({
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache'
        }),
        params: new HttpParams().set('_ts', String(Date.now()))
      })
      .pipe(
      map((response) => response.data),
      catchError(() =>
        of({
          canManage: false,
          items: [],
          assignableUsers: []
        })
      )
    );
  }

  create(payload: SaveProjectInput): Observable<ProjectItem | null> {
    return this.http.post<ApiResponse<ProjectItem>>(`${this.apiBase}/projects`, payload).pipe(
      map((response) => response.data),
      catchError(() => of(null))
    );
  }

  update(projectId: string, payload: SaveProjectInput): Observable<ProjectItem | null> {
    return this.http.put<ApiResponse<ProjectItem>>(`${this.apiBase}/projects/${projectId}`, payload).pipe(
      map((response) => response.data),
      catchError(() => of(null))
    );
  }
}
