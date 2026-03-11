import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api.model';
import { WorklogSummary } from '../../shared/models/worklog.model';

@Injectable({ providedIn: 'root' })
export class WorklogService {
  private get apiBase(): string {
    return environment.apiBaseUrl;
  }

  constructor(private readonly http: HttpClient) {}

  getSummary(from: string, to: string, userId?: string): Observable<WorklogSummary | null> {
    let params = new HttpParams()
      .set('from', from)
      .set('to', to)
      .set('timezoneOffsetMinutes', String(this.timezoneOffsetMinutes()));

    if (userId) {
      params = params.set('userId', userId);
    }

    return this.http
      .get<ApiResponse<WorklogSummary>>(`${this.apiBase}/worklog/summary`, { params })
      .pipe(
        map((response) => response.data),
        catchError(() => of(null))
      );
  }

  private timezoneOffsetMinutes(): number {
    return new Date().getTimezoneOffset();
  }
}
