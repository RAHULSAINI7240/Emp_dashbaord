import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { AuthService } from '../../../core/services/auth.service';
import { LeaveService } from '../../../core/services/leave.service';
import { ToastService } from '../../../core/services/toast.service';
import { User } from '../../../shared/models/user.model';

@Component({
  selector: 'app-leave-request',
  imports: [
    ReactiveFormsModule,
    NgFor,
    NgIf,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './leave-request.component.html',
  styleUrl: './leave-request.component.scss'
})
export class LeaveRequestComponent {
  approvers: User[] = [];
  selectedDates: string[] = [];
  selectedCalendarDate: Date | null = null;
  minDate = new Date();
  teamHint = '';
  defaultApproverLabel = '';
  readonly requestTips = [
    'Only future dates can be submitted through the leave desk.',
    'Half-day leave allows one date and requires a session selection.',
    'Leave approval is restricted to your eligible approvers from policy and reporting hierarchy.'
  ];
  form;
  futureDateFilter = (date: Date | null): boolean => {
    if (!date) return false;
    const selected = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const today = new Date();
    const current = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return selected > current;
  };

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly leaveService: LeaveService,
    private readonly toastService: ToastService
  ) {
    this.form = this.fb.group({
      type: ['CASUAL', Validators.required],
      duration: ['FULL_DAY', Validators.required],
      halfDaySession: [''],
      reason: ['', Validators.required],
      approverId: ['', Validators.required]
    });

    this.form.get('duration')?.valueChanges.subscribe((duration) => {
      if (duration === 'HALF_DAY') {
        this.form.get('halfDaySession')?.setValidators([Validators.required]);
        if (this.selectedDates.length > 1) {
          this.selectedDates = [this.selectedDates[0]];
          this.toastService.show('Half-day leave supports one date only. Kept the first selected date.', 'info');
        }
      } else {
        this.form.patchValue({ halfDaySession: '' });
        this.form.get('halfDaySession')?.clearValidators();
      }
      this.form.get('halfDaySession')?.updateValueAndValidity();
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.minDate = tomorrow;

    this.leaveService.getEligibleApprovers().subscribe(({ defaultApproverId, items }) => {
      this.approvers = items;
      if (!items.length) {
        this.teamHint = 'No eligible approver available.';
        return;
      }

      const suggestedApprover = items.find((item) => item.id === defaultApproverId) ?? items[0];
      this.form.patchValue({ approverId: suggestedApprover?.id ?? '' });
      this.defaultApproverLabel = suggestedApprover
        ? suggestedApprover.name
        : '';
      this.teamHint = suggestedApprover
        ? `Approval goes only to your reporting manager or Vikash Yadav. Default selection: ${suggestedApprover.name}`
        : 'Approval goes only to your reporting manager or Vikash Yadav.';
    });
  }

  get isHalfDay(): boolean {
    return this.form.getRawValue().duration === 'HALF_DAY';
  }

  get selectedTypeLabel(): string {
    const value = this.form.getRawValue().type;
    const labels: Record<string, string> = {
      CASUAL: 'Casual Leave',
      SICK: 'Sick Leave',
      SPECIAL: 'Special Leave',
      EMERGENCY: 'Emergency Leave'
    };

    return labels[value || 'CASUAL'] ?? 'Casual Leave';
  }

  get selectedDurationLabel(): string {
    return this.isHalfDay ? 'Half Day' : 'Full Day';
  }

  get selectedApproverName(): string {
    const approverId = this.form.getRawValue().approverId;
    const selectedName = this.approvers.find((item) => item.id === approverId)?.name || this.defaultApproverLabel;
    return selectedName || 'Not selected';
  }

  get selectedUnits(): number {
    if (!this.selectedDates.length) return 0;
    return this.isHalfDay ? 0.5 : this.selectedDates.length;
  }

  onDatePicked(date: Date | null): void {
    if (!date) return;
    const normalized = this.toIsoDate(date);
    if (normalized < this.toIsoDate(this.minDate)) {
      this.toastService.show('Only future dates are allowed for leave request.', 'error');
      return;
    }
    if (this.form.getRawValue().duration === 'HALF_DAY' && this.selectedDates.length >= 1) {
      this.toastService.show('Half-day leave can be requested for one date only.', 'error');
      return;
    }
    if (this.selectedDates.includes(normalized)) {
      this.toastService.show('Date already selected.', 'info');
      return;
    }
    this.selectedDates = [...this.selectedDates, normalized].sort((a, b) => a.localeCompare(b));
    this.selectedCalendarDate = null;
  }

  removeDate(date: string): void {
    this.selectedDates = this.selectedDates.filter((item) => item !== date);
  }

  clearDates(): void {
    this.selectedDates = [];
  }

  formatDate(date: string): string {
    const [year, month, day] = date.split('-').map((value) => Number(value));
    const local = new Date(year, (month || 1) - 1, day || 1);
    return local.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatUnits(value: number): string {
    const normalized = Number.isInteger(value) ? value.toString() : value.toFixed(1);
    return normalized.replace(/\.0$/, '');
  }

  private toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const user = this.authService.getCurrentUserSnapshot();
    if (!user) return;
    const payload = this.form.getRawValue();
    const dates = this.selectedDates;
    if (!dates?.length) {
      this.toastService.show('Please select at least one leave date.', 'error');
      return;
    }
    const minIsoDate = this.toIsoDate(this.minDate);
    if (dates.some((date) => date < minIsoDate)) {
      this.toastService.show('Only future dates are allowed for leave request.', 'error');
      return;
    }
    if (payload.duration === 'HALF_DAY' && !payload.halfDaySession) {
      this.toastService.show('Please choose first-half or second-half for half-day leave.', 'error');
      return;
    }
    if (payload.duration === 'HALF_DAY' && dates.length !== 1) {
      this.toastService.show('Half-day leave can be requested for one date only.', 'error');
      return;
    }

    this.leaveService
      .create({
        employeeId: user.id,
        approverId: payload.approverId || '',
        type: payload.type as any,
        duration: payload.duration as any,
        halfDaySession: (payload.halfDaySession || undefined) as any,
        reason: payload.reason || '',
        dates
      })
      .subscribe(() => {
        this.toastService.show('Leave request submitted', 'success');
        const fallbackApproverId = this.approvers[0]?.id ?? '';
        this.form.reset({ type: 'CASUAL', duration: 'FULL_DAY', halfDaySession: '', approverId: fallbackApproverId });
        this.selectedDates = [];
        this.selectedCalendarDate = null;
      });
  }
}
