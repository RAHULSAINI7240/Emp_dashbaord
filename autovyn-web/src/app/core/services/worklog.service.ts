import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../shared/models/api.model';
import { WorklogSummary } from '../../shared/models/worklog.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class WorklogService {
  private get apiBase(): string {
    return environment.apiBaseUrl;
  }

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {}

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

  async connectLiveStream(
    onPresence: (payload: unknown) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const session = this.authService.getSession();
    if (!session?.token) {
      return;
    }

    const response = await fetch(`${this.apiBase}/worklog/stream`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.token}`,
        Accept: 'text/event-stream'
      },
      signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`Worklog live stream failed with status ${response.status}.`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf('\n\n');

      while (separatorIndex >= 0) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf('\n\n');

        const lines = rawEvent
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        const dataLine = lines.find((line) => line.startsWith('data:'));
        if (!dataLine) {
          continue;
        }

        try {
          onPresence(JSON.parse(dataLine.slice(5).trim()));
        } catch {
          // Ignore malformed stream payloads and keep the connection alive.
        }
      }
    }
  }

  private timezoneOffsetMinutes(): number {
    return new Date().getTimezoneOffset();
  }
}
