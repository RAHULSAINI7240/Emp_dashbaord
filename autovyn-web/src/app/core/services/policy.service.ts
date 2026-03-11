import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api.model';

export interface PolicyData {
  attendancePolicy: string;
  leavePolicy: string;
  leaveAllowances: {
    casual: number;
    sick: number;
    special: number;
    emergency: number;
    total: number;
  };
}

interface BackendPolicy {
  attendancePolicy: string;
  leavePolicy: string;
  leaveAllowances?: {
    casual: number;
    sick: number;
    special: number;
    emergency: number;
    total: number;
  };
}

@Injectable({ providedIn: 'root' })
export class PolicyService {
  private get apiBase(): string {
    return environment.apiBaseUrl;
  }

  constructor(private readonly http: HttpClient) {}

  getPolicies(): Observable<PolicyData | null> {
    return this.http.get<ApiResponse<BackendPolicy>>(`${this.apiBase}/policies`).pipe(
      map((response) => ({
        attendancePolicy: response.data.attendancePolicy,
        leavePolicy: response.data.leavePolicy,
        leaveAllowances: response.data.leaveAllowances ?? {
          casual: 6,
          sick: 5,
          special: 6,
          emergency: 1,
          total: 18
        }
      })),
      catchError(() => of(null))
    );
  }
}
