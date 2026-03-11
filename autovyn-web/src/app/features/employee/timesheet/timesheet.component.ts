import { Component } from '@angular/core';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { combineLatest, map } from 'rxjs';
import { AttendanceDay } from '../../../shared/models/attendance.model';
import { AuthService } from '../../../core/services/auth.service';
import { AttendanceService } from '../../../core/services/attendance.service';
import { PunchAuditService } from '../../../core/services/punch-audit.service';
import { PunchAuditLog } from '../../../shared/models/punch-audit.model';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ArsService } from '../../../core/services/ars.service';
import { ARSRequest, MissingType } from '../../../shared/models/ars.model';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-timesheet',
  imports: [NgFor, NgIf, DatePipe, EmptyStateComponent, SkeletonComponent, ReactiveFormsModule],
  templateUrl: './timesheet.component.html',
  styleUrls: ['./timesheet.component.scss']
})
export class TimesheetComponent {
  loading = true;
  allDays: AttendanceDay[] = [];
  days: AttendanceDay[] = [];
  selected?: AttendanceDay;
  selectedAudit?: PunchAuditLog;
  monthKeys: string[] = [];
  monthCursor = 0;
  activeMonthTitleDate = '';
  weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  calendarSlots: Array<AttendanceDay | null> = [];
  statuses = ['PRESENT', 'LEAVE', 'ABSENT', 'HALF_DAY', 'LATE', 'HOLIDAY', 'WEEKEND', 'OVERTIME', 'UPCOMING'];
  arsRequests: ARSRequest[] = [];
  arsByDate = new Map<string, ARSRequest[]>();
  arsPopupOpen = false;
  submittingArs = false;
  arsReasonOptions = [
    'Forgot to punch',
    'Network issue',
    'Biometric mismatch',
    'System sync delay',
    'On-site field work',
    'Travel/Client visit'
  ];
  arsForm;
  private auditByDate = new Map<string, PunchAuditLog>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly attendanceService: AttendanceService,
    private readonly punchAuditService: PunchAuditService,
    private readonly arsService: ArsService,
    private readonly toastService: ToastService
  ) {
    this.arsForm = this.fb.group({
      missingType: ['BOTH' as MissingType, Validators.required],
      workMode: ['OFFICE', Validators.required],
      reasonTag: ['', Validators.required],
      remark: ['']
    });

    const user = this.authService.getCurrentUserSnapshot();
    if (!user) return;
    combineLatest([
      this.attendanceService.getAttendance(user.id),
      this.punchAuditService.getAllLogs().pipe(
        map((logs) => logs.filter((log) => log.employeeId === user.id))
      ),
      this.arsService.requests$.pipe(map((items) => items.filter((item) => item.employeeId === user.id)))
    ]).subscribe(([days, logs, arsRequests]) => {
      this.auditByDate = new Map(logs.map((log) => [log.date, log]));
      this.arsRequests = [...arsRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      this.arsByDate = this.arsRequests.reduce((acc, item) => {
        const entries = acc.get(item.date) ?? [];
        entries.push(item);
        acc.set(item.date, entries);
        return acc;
      }, new Map<string, ARSRequest[]>());
      this.allDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
      this.monthKeys = this.distinctMonthKeys(this.allDays);
      this.monthCursor = Math.max(this.monthKeys.length - 1, 0);
      this.setActiveMonth(this.monthKeys[this.monthCursor]);
      this.loading = false;
    });
  }

  get canGoPrevMonth(): boolean {
    return this.monthCursor > 0;
  }

  get canGoNextMonth(): boolean {
    return this.monthCursor < this.monthKeys.length - 1;
  }

  prevMonth(): void {
    if (!this.canGoPrevMonth) return;
    this.monthCursor -= 1;
    this.setActiveMonth(this.monthKeys[this.monthCursor]);
  }

  nextMonth(): void {
    if (!this.canGoNextMonth) return;
    this.monthCursor += 1;
    this.setActiveMonth(this.monthKeys[this.monthCursor]);
  }

  selectDay(day: AttendanceDay): void {
    this.selected = day;
    this.selectedAudit = this.auditByDate.get(day.date);
  }

  openArsPopup(): void {
    if (!this.selected || !this.canRequestArs()) return;
    this.arsPopupOpen = true;
    this.arsForm.reset({
      missingType: this.defaultMissingTypeForSelected(),
      workMode: 'OFFICE',
      reasonTag: '',
      remark: ''
    });
  }

  closeArsPopup(): void {
    if (this.submittingArs) return;
    this.arsPopupOpen = false;
  }

  submitArs(): void {
    if (!this.selected || this.arsForm.invalid || this.submittingArs) {
      this.arsForm.markAllAsTouched();
      return;
    }

    const user = this.authService.getCurrentUserSnapshot();
    if (!user) return;

    const formValue = this.arsForm.getRawValue();
    const remark = (formValue.remark || '').trim();
    const reason = `Type: ${formValue.reasonTag} | WorkMode: ${formValue.workMode}${remark ? ` | Remark: ${remark}` : ''}`;

    this.submittingArs = true;
    this.arsService
      .create({
        employeeId: user.id,
        approverId: '',
        date: this.selected.date,
        missingType: formValue.missingType as MissingType,
        reason
      })
      .subscribe({
        next: (created) => {
          this.submittingArs = false;
          if (!created) {
            this.toastService.show('Unable to submit ARS request.', 'error');
            return;
          }
          this.toastService.show('ARS request submitted.', 'success');
          this.arsPopupOpen = false;
        },
        error: () => {
          this.submittingArs = false;
          this.toastService.show('Unable to submit ARS request.', 'error');
        }
      });
  }

  hasSelectedPunchData(): boolean {
    if (!this.selected) return false;
    return Boolean(
      this.selectedAudit?.punchIn ||
      this.selectedAudit?.punchOut ||
      this.selected?.punchIn ||
      this.selected?.punchOut
    );
  }

  showHolidayPosterOnly(): boolean {
    return Boolean(this.selected?.status === 'HOLIDAY' && !this.hasSelectedPunchData());
  }

  selectedHolidayTitle(): string {
    return this.selected?.holidayName || 'Holiday';
  }

  punchInLabel(): string {
    if (this.selectedAudit?.punchIn) return this.isoTimeLabel(this.selectedAudit.punchIn);
    return this.selected?.punchIn || '--:--';
  }

  punchOutLabel(): string {
    if (this.selectedAudit?.punchOut) return this.isoTimeLabel(this.selectedAudit.punchOut);
    return this.selected?.punchOut || '--:--';
  }

  workingHoursLabel(): string {
    if (typeof this.selectedAudit?.workMinutes === 'number') {
      return this.minutesToHHMM(this.selectedAudit.workMinutes);
    }
    return this.selected?.workingHours || '--:--';
  }

  monthTotalWorkingHoursLabel(): string {
    const total = this.days.reduce((sum, day) => {
      const fromHours = this.hhmmToMinutes(day.workingHours);
      if (fromHours > 0) return sum + fromHours;

      if (day.punchIn && day.punchOut) {
        const inDate = new Date(day.punchIn);
        const outDate = new Date(day.punchOut);
        const diff = outDate.getTime() - inDate.getTime();
        if (!Number.isNaN(diff) && diff > 0) return sum + Math.floor(diff / 60000);
      }
      return sum;
    }, 0);
    return this.minutesToHHMM(total);
  }

  faceScanLabel(): string {
    if (!this.selectedAudit) return '--';
    if (!this.selectedAudit.faceVerified) return 'Not verified';
    if (this.selectedAudit.faceScanType === 'FACE_DETECTOR') return 'Face Detector';
    if (this.selectedAudit.faceScanType === 'CAMERA_ONLY') return 'Camera Only';
    return 'Simulated';
  }

  private distinctMonthKeys(days: AttendanceDay[]): string[] {
    return Array.from(new Set(days.map((day) => day.date.slice(0, 7)))).sort();
  }

  private setActiveMonth(monthKey?: string): void {
    if (!monthKey) {
      this.days = [];
      this.calendarSlots = [];
      this.selected = undefined;
      this.activeMonthTitleDate = '';
      return;
    }
    this.activeMonthTitleDate = `${monthKey}-01`;
    this.days = this.allDays
      .filter((day) => day.date.startsWith(monthKey))
      .map((day) => this.normalizeUpcomingDay(day));
    this.calendarSlots = this.buildCalendarSlots(this.days, monthKey);
    this.selected = this.days.find((day) => !this.isUpcoming(day)) ?? this.days[0];
    this.selectedAudit = this.selected ? this.auditByDate.get(this.selected.date) : undefined;
  }

  statusCount(status: string): number {
    return this.days.filter((day) => day.status === status).length;
  }

  selectedArs(): ARSRequest | undefined {
    if (!this.selected) return undefined;
    return (this.arsByDate.get(this.selected.date) ?? [])[0];
  }

  canRequestArs(): boolean {
    if (!this.selected) return false;
    if (this.isUpcoming(this.selected)) return false;
    if (!(this.selected.status === 'ABSENT' || this.selected.status === 'HALF_DAY')) return false;
    const existing = this.selectedArs();
    return !existing || existing.status === 'DECLINED' || existing.status === 'EXPIRED';
  }

  statusLabel(status: string): string {
    return status === 'UPCOMING' ? 'Upcoming' : status.replace('_', ' ');
  }

  private defaultMissingTypeForSelected(): MissingType {
    if (!this.selected || this.selected.status === 'ABSENT') return 'BOTH';
    if (this.selected.punchIn && !this.selected.punchOut) return 'MISSING_PUNCH_OUT';
    if (!this.selected.punchIn && this.selected.punchOut) return 'MISSING_PUNCH_IN';
    return 'BOTH';
  }

  private buildCalendarSlots(days: AttendanceDay[], monthKey: string): Array<AttendanceDay | null> {
    const first = new Date(`${monthKey}-01T00:00:00.000Z`);
    const offset = first.getUTCDay();
    const slots: Array<AttendanceDay | null> = Array.from({ length: offset }, () => null);
    return [...slots, ...days];
  }

  private normalizeUpcomingDay(day: AttendanceDay): AttendanceDay {
    if (!this.isFutureDate(day.date)) return day;
    return {
      ...day,
      status: 'UPCOMING',
      punchIn: undefined,
      punchOut: undefined,
      workingHours: undefined
    };
  }

  private isUpcoming(day: AttendanceDay): boolean {
    return day.status === 'UPCOMING';
  }

  private isFutureDate(dateKey: string): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(`${dateKey}T00:00:00`);
    date.setHours(0, 0, 0, 0);
    return date.getTime() > today.getTime();
  }

  private isoTimeLabel(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  private minutesToHHMM(totalMinutes: number): string {
    const safe = Math.max(totalMinutes, 0);
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  private hhmmToMinutes(value?: string): number {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return 0;
    const [hours, minutes] = value.split(':').map((part) => Number(part));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
    return hours * 60 + minutes;
  }
}
