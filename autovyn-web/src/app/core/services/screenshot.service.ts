import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api.model';
import { AuthService } from './auth.service';

export interface ScreenshotEntry {
  id: string;
  imageData: string;
  deviceId: string | null;
  capturedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ScreenshotService {
  private get apiBase(): string {
    return environment.apiBaseUrl;
  }

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {}

  getByUserAndDate(userId: string, date: string): Observable<ScreenshotEntry[]> {
    const params = new HttpParams().set('userId', userId).set('date', date);
    return this.http
      .get<ApiResponse<ScreenshotEntry[]>>(`${this.apiBase}/screenshots`, { params })
      .pipe(
        map((response) => response.data),
        catchError(() => of([]))
      );
  }

  getRecentByUser(userId: string, days = 2): Observable<ScreenshotEntry[]> {
    const params = new HttpParams().set('userId', userId).set('days', String(days));
    return this.http
      .get<ApiResponse<ScreenshotEntry[]>>(`${this.apiBase}/screenshots/recent`, { params })
      .pipe(
        map((response) => response.data),
        catchError(() => of([]))
      );
  }

  async connectStream(
    userId: string,
    days: number,
    onScreenshots: (items: ScreenshotEntry[]) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const session = this.authService.getSession();
    if (!session?.token) {
      return;
    }

    const url = new URL(`${this.apiBase}/screenshots/stream`);
    url.searchParams.set('userId', userId);
    url.searchParams.set('days', String(days));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.token}`,
        Accept: 'text/event-stream'
      },
      signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`Screenshot stream failed with status ${response.status}.`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf('\n\n');

      while (separatorIndex >= 0) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf('\n\n');

        const lines = rawEvent.split('\n').map((l) => l.trim()).filter(Boolean);
        const dataLine = lines.find((l) => l.startsWith('data:'));
        if (!dataLine) continue;

        try {
          const items = JSON.parse(dataLine.slice(5).trim());
          if (Array.isArray(items) && items.length > 0) {
            onScreenshots(items);
          }
        } catch {
          // ignore malformed payloads
        }
      }
    }
  }
}
