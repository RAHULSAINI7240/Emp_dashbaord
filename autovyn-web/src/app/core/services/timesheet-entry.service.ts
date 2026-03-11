import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { TimesheetEntry, TimesheetEntryInput } from '../../shared/models/timesheet-entry.model';
import { StorageUtil } from '../../shared/utils/storage.util';
import { AuthService } from './auth.service';

const STORAGE_KEY = 'autovyn_timesheet_entries';

@Injectable({ providedIn: 'root' })
export class TimesheetEntryService {
  private readonly entriesSubject = new BehaviorSubject<TimesheetEntry[]>(this.readStorage());
  readonly entries$ = this.entriesSubject.asObservable();

  constructor(private readonly authService: AuthService) {}

  create(input: TimesheetEntryInput): Observable<TimesheetEntry | null> {
    const user = this.authService.getCurrentUserSnapshot();
    if (!user) return of(null);

    const now = new Date().toISOString();
    const entry: TimesheetEntry = {
      id: this.createId(),
      userId: user.id,
      date: input.date.trim(),
      ticketId: input.ticketId.trim().toUpperCase(),
      taskTitle: input.taskTitle.trim(),
      taskDetails: input.taskDetails.trim(),
      workHours: input.workHours,
      status: input.status,
      aiTool: input.aiTool.trim(),
      aiHours: input.aiHours,
      aiUsageSummary: input.aiUsageSummary.trim(),
      createdAt: now,
      updatedAt: now
    };

    this.save([entry, ...this.entriesSubject.value]);
    return of(entry);
  }

  update(id: string, input: TimesheetEntryInput): Observable<TimesheetEntry | null> {
    const user = this.authService.getCurrentUserSnapshot();
    if (!user) return of(null);

    const existing = this.entriesSubject.value.find((item) => item.id === id && item.userId === user.id);
    if (!existing) return of(null);

    const updated: TimesheetEntry = {
      ...existing,
      date: input.date.trim(),
      ticketId: input.ticketId.trim().toUpperCase(),
      taskTitle: input.taskTitle.trim(),
      taskDetails: input.taskDetails.trim(),
      workHours: input.workHours,
      status: input.status,
      aiTool: input.aiTool.trim(),
      aiHours: input.aiHours,
      aiUsageSummary: input.aiUsageSummary.trim(),
      updatedAt: new Date().toISOString()
    };

    this.save(this.entriesSubject.value.map((item) => (item.id === id ? updated : item)));
    return of(updated);
  }

  delete(id: string): Observable<boolean> {
    const user = this.authService.getCurrentUserSnapshot();
    if (!user) return of(false);

    const next = this.entriesSubject.value.filter((item) => !(item.id === id && item.userId === user.id));
    if (next.length === this.entriesSubject.value.length) return of(false);

    this.save(next);
    return of(true);
  }

  private save(items: TimesheetEntry[]): void {
    StorageUtil.write(STORAGE_KEY, items);
    this.entriesSubject.next(items);
  }

  private readStorage(): TimesheetEntry[] {
    return StorageUtil.read<TimesheetEntry[]>(STORAGE_KEY, []);
  }

  private createId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `ts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
