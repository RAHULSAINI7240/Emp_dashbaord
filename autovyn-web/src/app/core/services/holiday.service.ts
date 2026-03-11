import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api.model';

export interface HolidayItem {
  id: string;
  date: string;
  name: string;
  imageUrl?: string;
}

interface BackendHolidayList {
  year: number;
  items: Array<{
    id: string;
    date: string;
    name: string;
    imageUrl?: string | null;
  }>;
}

interface HolidayCreatePayload {
  date: string;
  name: string;
  imageUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class HolidayService {
  private get apiBase(): string {
    return environment.apiBaseUrl;
  }

  constructor(private readonly http: HttpClient) {}

  listByYear(year: number): Observable<HolidayItem[]> {
    return this.http
      .get<ApiResponse<BackendHolidayList>>(`${this.apiBase}/holidays`, {
        params: new HttpParams().set('year', String(year))
      })
      .pipe(
        map((response) =>
          response.data.items.map((item) => ({
            id: item.id,
            date: item.date,
            name: item.name,
            imageUrl: item.imageUrl ?? undefined
          }))
        ),
        catchError(() => of([]))
      );
  }

  create(payload: HolidayCreatePayload): Observable<HolidayItem | null> {
    return this.http.post<ApiResponse<{ id: string; date: string; name: string; imageUrl?: string | null }>>(
      `${this.apiBase}/holidays`,
      payload
    ).pipe(
      map((response) => ({
        id: response.data.id,
        date: response.data.date,
        name: response.data.name,
        imageUrl: response.data.imageUrl ?? undefined
      })),
      catchError(() => of(null))
    );
  }
}
