import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api.model';
import { AttendanceDay, AttendanceStatus } from '../../shared/models/attendance.model';

interface BackendAttendanceDay {
  date: string;
  status: AttendanceStatus;
  punchInUtc: string | null;
  punchOutUtc: string | null;
  punchInLocal: string | null;
  punchOutLocal: string | null;
  workingMinutes: number | null;
  workingHours: string | null;
  holiday?: {
    name: string;
    imageUrl?: string | null;
  } | null;
}

interface BackendMonthAttendance {
  month: string;
  calendar: BackendAttendanceDay[];
}

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private get apiBase(): string {
    return environment.apiBaseUrl;
  }

  constructor(private readonly http: HttpClient) {}

  getAttendance(_employeeId: string): Observable<AttendanceDay[]> {
    const months = this.recentMonthKeys(3);

    return forkJoin(
      months.map((month) =>
        this.http
          .get<ApiResponse<BackendMonthAttendance>>(`${this.apiBase}/attendance/month`, {
            params: this.buildTimezoneParams().set('month', month)
          })
          .pipe(
            map((response) => response.data.calendar.map((item) => this.mapDay(item))),
            catchError(() => of([] as AttendanceDay[]))
          )
      )
    ).pipe(
      map((chunks) => chunks.flat().sort((a, b) => a.date.localeCompare(b.date))),
      catchError(() => of([]))
    );
  }

  punchIn(): Observable<AttendanceDay> {
    return this.http
      .post<ApiResponse<BackendAttendanceDay>>(`${this.apiBase}/attendance/punch-in`, {
        timezoneOffsetMinutes: this.timezoneOffsetMinutes()
      })
      .pipe(
        map((response) => this.mapDay(response.data)),
        catchError((error: HttpErrorResponse) =>
          throwError(() => new Error(this.resolveApiErrorMessage(error, 'Unable to punch in.')))
        )
      );
  }

  punchOut(): Observable<AttendanceDay> {
    return this.http
      .post<ApiResponse<BackendAttendanceDay>>(`${this.apiBase}/attendance/punch-out`, {
        timezoneOffsetMinutes: this.timezoneOffsetMinutes()
      })
      .pipe(
        map((response) => this.mapDay(response.data)),
        catchError((error: HttpErrorResponse) =>
          throwError(() => new Error(this.resolveApiErrorMessage(error, 'Unable to punch out.')))
        )
      );
  }

  upsertDay(_employeeId: string, _date: string, _status: AttendanceStatus, _punchIn?: string, _punchOut?: string): void {
    // Attendance state is now source-of-truth from backend APIs.
  }

  private mapDay(day: BackendAttendanceDay): AttendanceDay {
    return {
      date: day.date,
      status: day.status,
      punchIn: day.punchInLocal ?? undefined,
      punchOut: day.punchOutLocal ?? undefined,
      punchInUtc: day.punchInUtc ?? undefined,
      punchOutUtc: day.punchOutUtc ?? undefined,
      workingMinutes: day.workingMinutes ?? undefined,
      workingHours: day.workingHours ?? undefined,
      holidayName: day.holiday?.name ?? undefined,
      holidayImageUrl: day.holiday?.imageUrl ?? undefined
    };
  }

  private recentMonthKeys(count: number): string[] {
    const now = new Date();
    const keys: string[] = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      keys.push(`${date.getFullYear()}-${month}`);
    }
    return keys;
  }

  private timezoneOffsetMinutes(): number {
    return new Date().getTimezoneOffset();
  }

  private buildTimezoneParams(): HttpParams {
    return new HttpParams().set('timezoneOffsetMinutes', String(this.timezoneOffsetMinutes()));
  }

  private resolveApiErrorMessage(error: HttpErrorResponse, fallback: string): string {
    const messageFromApi =
      (error.error && typeof error.error === 'object' && 'message' in error.error ? (error.error.message as string) : '') || '';
    const message = messageFromApi || error.message || fallback;
    return typeof message === 'string' && message.trim() ? message.trim() : fallback;
  }
}
