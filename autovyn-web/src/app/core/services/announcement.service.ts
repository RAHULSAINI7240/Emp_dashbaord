import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginatedData } from '../../shared/models/api.model';

export interface AnnouncementItem {
  id: string;
  title: string;
  text: string;
  image?: string;
  createdAt: string;
}

interface BackendAnnouncement {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  createdAt: string;
}

interface AnnouncementCreatePayload {
  title: string;
  body: string;
  imageUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class AnnouncementService {
  private get apiBase(): string {
    return environment.apiBaseUrl;
  }

  constructor(private readonly http: HttpClient) {}

  list(page = 1, limit = 50): Observable<AnnouncementItem[]> {
    return this.http
      .get<ApiResponse<PaginatedData<BackendAnnouncement>>>(`${this.apiBase}/announcements`, {
        params: new HttpParams().set('page', String(page)).set('limit', String(limit))
      })
      .pipe(
        map((response) =>
          response.data.items.map((item) => ({
            id: item.id,
            title: item.title,
            text: item.body,
            image: item.imageUrl ?? undefined,
            createdAt: item.createdAt
          }))
        ),
        catchError(() => of([]))
      );
  }

  create(payload: AnnouncementCreatePayload): Observable<AnnouncementItem | null> {
    return this.http.post<ApiResponse<BackendAnnouncement>>(`${this.apiBase}/announcements`, payload).pipe(
      map((response) => ({
        id: response.data.id,
        title: response.data.title,
        text: response.data.body,
        image: response.data.imageUrl ?? undefined,
        createdAt: response.data.createdAt
      })),
      catchError(() => of(null))
    );
  }
}
