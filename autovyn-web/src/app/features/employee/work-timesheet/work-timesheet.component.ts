import { Component } from '@angular/core';
import { DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';
import { TimesheetEntryService } from '../../../core/services/timesheet-entry.service';
import { ToastService } from '../../../core/services/toast.service';
import { TimesheetEntry, TimesheetEntryInput, TimesheetStatus } from '../../../shared/models/timesheet-entry.model';

@Component({
  selector: 'app-work-timesheet',
  imports: [NgFor, NgIf, DatePipe, DecimalPipe, ReactiveFormsModule, MatIconModule],
  templateUrl: './work-timesheet.component.html',
  styleUrl: './work-timesheet.component.scss'
})
export class WorkTimesheetComponent {
  readonly today = this.dateKey(new Date());
  readonly statusOptions: TimesheetStatus[] = ['IN_PROGRESS', 'COMPLETED', 'REVIEW', 'BLOCKED'];
  readonly aiTools = ['Manually', 'GitHub Copilot', 'ChatGPT', 'Claude', 'Cursor', 'Gemini', 'Perplexity', 'Other'];
  readonly form;
  entries: TimesheetEntry[] = [];
  editingId: string | null = null;
  selectedMonth = this.today.slice(0, 7);

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly timesheetEntryService: TimesheetEntryService,
    private readonly toastService: ToastService
  ) {
    this.form = this.fb.group({
      date: [this.today, Validators.required],
      ticketId: ['', Validators.required],
      taskTitle: ['', [Validators.required, Validators.minLength(4)]],
      taskDetails: ['', [Validators.required, Validators.minLength(8)]],
      workHours: [8, [Validators.required, Validators.min(0.5), Validators.max(24)]],
      status: ['COMPLETED' as TimesheetStatus, Validators.required],
      aiTool: ['Manually', Validators.required],
      aiHours: [0, [Validators.required, Validators.min(0), Validators.max(24)]],
      aiUsageSummary: ['', [Validators.required, Validators.minLength(4)]]
    });

    this.timesheetEntryService.entries$
      .pipe(
        map((items) => {
          const userId = this.authService.getCurrentUserSnapshot()?.id;
          return items
            .filter((item) => item.userId === userId)
            .sort((a, b) => {
              const dateCompare = b.date.localeCompare(a.date);
              return dateCompare !== 0 ? dateCompare : b.updatedAt.localeCompare(a.updatedAt);
            });
        })
      )
      .subscribe((entries) => {
        this.entries = entries;
      });
  }

  get monthOptions(): string[] {
    const keys = new Set<string>([this.selectedMonth, this.today.slice(0, 7)]);
    this.entries.forEach((item) => keys.add(item.date.slice(0, 7)));
    return Array.from(keys).sort().reverse();
  }

  get selectedMonthEntries(): TimesheetEntry[] {
    return this.entries.filter((item) => item.date.startsWith(this.selectedMonth));
  }

  get totalHours(): number {
    return this.selectedMonthEntries.reduce((sum, item) => sum + item.workHours, 0);
  }

  get totalAiHours(): number {
    return this.selectedMonthEntries.reduce((sum, item) => sum + item.aiHours, 0);
  }

  get completedCount(): number {
    return this.selectedMonthEntries.filter((item) => item.status === 'COMPLETED').length;
  }

  get hasTodayEntry(): boolean {
    return this.entries.some((item) => item.date === this.today);
  }

  get selectedMonthLabel(): string {
    return new Date(`${this.selectedMonth}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.show('Fill all mandatory fields before saving the timesheet.', 'error');
      return;
    }

    const raw = this.form.getRawValue();
    const payload: TimesheetEntryInput = {
      date: raw.date ?? '',
      ticketId: raw.ticketId ?? '',
      taskTitle: raw.taskTitle ?? '',
      taskDetails: raw.taskDetails ?? '',
      workHours: Number(raw.workHours ?? 0),
      status: (raw.status ?? 'COMPLETED') as TimesheetStatus,
      aiTool: raw.aiTool ?? '',
      aiHours: Number(raw.aiHours ?? 0),
      aiUsageSummary: raw.aiUsageSummary ?? ''
    };

    if (payload.aiHours > payload.workHours) {
      this.toastService.show('AI hours cannot be greater than total working hours.', 'error');
      return;
    }

    const request$ = this.editingId
      ? this.timesheetEntryService.update(this.editingId, payload)
      : this.timesheetEntryService.create(payload);

    request$.subscribe((saved) => {
      if (!saved) {
        this.toastService.show('Unable to save timesheet entry.', 'error');
        return;
      }
      this.selectedMonth = saved.date.slice(0, 7);
      this.toastService.show(this.editingId ? 'Timesheet entry updated.' : 'Timesheet entry added.', 'success');
      this.resetForm();
    });
  }

  edit(entry: TimesheetEntry): void {
    this.editingId = entry.id;
    this.form.patchValue({
      date: entry.date,
      ticketId: entry.ticketId,
      taskTitle: entry.taskTitle,
      taskDetails: entry.taskDetails,
      workHours: entry.workHours,
      status: entry.status,
      aiTool: entry.aiTool,
      aiHours: entry.aiHours,
      aiUsageSummary: entry.aiUsageSummary
    });
  }

  remove(entry: TimesheetEntry): void {
    this.timesheetEntryService.delete(entry.id).subscribe((deleted) => {
      if (!deleted) {
        this.toastService.show('Unable to delete timesheet entry.', 'error');
        return;
      }
      if (this.editingId === entry.id) {
        this.resetForm();
      }
      this.toastService.show('Timesheet entry deleted.', 'success');
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.form.reset({
      date: this.today,
      ticketId: '',
      taskTitle: '',
      taskDetails: '',
      workHours: 8,
      status: 'COMPLETED',
      aiTool: 'Manually',
      aiHours: 0,
      aiUsageSummary: ''
    });
  }

  setMonth(month: string): void {
    this.selectedMonth = month;
  }

  statusLabel(status: TimesheetStatus): string {
    return status.replace('_', ' ');
  }

  aiUtilization(entry: TimesheetEntry): number {
    if (entry.workHours <= 0) return 0;
    return Math.min(Math.round((entry.aiHours / entry.workHours) * 100), 100);
  }

  private dateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
