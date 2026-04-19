import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { WorklogSummary } from '../../shared/models/worklog.model';
import { WorklogService } from './worklog.service';

export type AgentLiveStatus = 'ACTIVE' | 'IDLE' | 'OFFLINE';

@Injectable({ providedIn: 'root' })
export class AgentStatusService {
  constructor(private readonly worklogService: WorklogService) {}

  getUserStatus(userId: string): Observable<AgentLiveStatus> {
    const dateKey = this.todayKey();
    return this.worklogService.getSummary(dateKey, dateKey, userId).pipe(
      map((summary) => this.resolveUserStatus(summary, userId)),
      catchError(() => of<AgentLiveStatus>('OFFLINE'))
    );
  }

  getTeamStatusMap(): Observable<Map<string, AgentLiveStatus>> {
    const dateKey = this.todayKey();
    return this.worklogService.getSummary(dateKey, dateKey).pipe(
      map((summary) => this.buildStatusMap(summary)),
      catchError(() => of(new Map<string, AgentLiveStatus>()))
    );
  }

  isAgentActive(status: AgentLiveStatus | null | undefined): boolean {
    return status === 'ACTIVE' || status === 'IDLE';
  }

  private resolveUserStatus(summary: WorklogSummary | null, userId: string): AgentLiveStatus {
    return this.buildStatusMap(summary).get(userId) ?? 'OFFLINE';
  }

  private buildStatusMap(summary: WorklogSummary | null): Map<string, AgentLiveStatus> {
    return new Map((summary?.employees ?? []).map((item) => [item.user.id, item.liveStatus]));
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
