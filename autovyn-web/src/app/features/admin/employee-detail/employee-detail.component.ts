import { Component, OnDestroy } from '@angular/core';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, combineLatest, map } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';
import { LeaveService } from '../../../core/services/leave.service';
import { PunchAuditService } from '../../../core/services/punch-audit.service';
import { PunchAuditLog, PunchLocationType } from '../../../shared/models/punch-audit.model';
import { User } from '../../../shared/models/user.model';
import { HOLIDAY_CALENDAR } from '../../../shared/utils/holiday-data';

interface AnalyticsBar {
  label: string;
  value: number;
  percent: number;
  color: string;
  icon: string;
}

interface TrendPoint {
  label: string;
  minutes: number;
  percent: number;
  late: boolean;
}

type CalendarStatus =
  | 'PRESENT'
  | 'LATE'
  | 'OVERTIME'
  | 'LEAVE'
  | 'ABSENT'
  | 'WEEKEND'
  | 'HOLIDAY'
  | 'INVALID'
  | 'UPCOMING';

interface CalendarDay {
  date: string;
  day: number;
  status: CalendarStatus;
  log?: PunchAuditLog;
}

@Component({
  selector: 'app-employee-detail',
  imports: [DatePipe, NgFor, NgIf, RouterLink, MatIconModule],
  templateUrl: './employee-detail.component.html',
  styleUrl: './employee-detail.component.scss'
})
export class EmployeeDetailComponent implements OnDestroy {
  readonly requiredWorkMinutes = 8 * 60 + 30;
  now = new Date();
  employee?: User;
  logs: PunchAuditLog[] = [];
  monthlyLeaveDays = 0;
  approvedLeaveDates = new Set<string>();
  selectedLogDate: string | null = null;
  selectedCalendarDate: string | null = null;
  previewImageUrl: string | null = null;
  calendarMonthKeys: string[] = [];
  calendarCursor = 0;
  readonly weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly calendarLegend: CalendarStatus[] = ['PRESENT', 'LATE', 'LEAVE', 'ABSENT', 'WEEKEND', 'HOLIDAY', 'OVERTIME', 'UPCOMING'];
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
    private readonly leaveService: LeaveService,
    private readonly punchAuditService: PunchAuditService
  ) {
    const employeeId = this.route.snapshot.paramMap.get('id') ?? '';
    this.subscriptions.add(
      combineLatest([this.authService.getUsers(), this.punchAuditService.getAllLogs(), this.leaveService.requests$])
        .pipe(
          map(([users, logs, leaveRequests]) => ({
            employee: users.find((item) => item.id === employeeId),
            logs: logs.filter((item) => item.employeeId === employeeId).sort((a, b) => b.date.localeCompare(a.date)),
            leaveDates: new Set(
              leaveRequests
                .filter((request) => request.employeeId === employeeId && request.status === 'APPROVED')
                .flatMap((request) => request.dates)
            )
          }))
        )
        .subscribe((data) => {
          this.employee = data.employee;
          this.logs = data.logs;
          this.approvedLeaveDates = data.leaveDates;
          this.monthlyLeaveDays = this.countLeaveDaysByMonth(this.now);
          this.syncCalendarMonths();
          if (!this.selectedLogDate && this.reportLogs.length) {
            this.selectedLogDate = this.reportLogs[0].date;
          }
          if (!this.selectedCalendarDate && this.calendarDays.length) {
            this.selectedCalendarDate = this.calendarDays[0].date;
          }
        })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get monthLabel(): string {
    return this.now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  get monthlyLogs(): PunchAuditLog[] {
    return this.logs.filter((log) => this.isSameMonth(log.date, this.now));
  }

  get reportLogs(): PunchAuditLog[] {
    return [...this.monthlyLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 16);
  }

  get selectedLog(): PunchAuditLog | null {
    if (!this.selectedLogDate) return null;
    return this.reportLogs.find((log) => log.date === this.selectedLogDate) ?? null;
  }

  get activeCalendarMonthKey(): string {
    return this.calendarMonthKeys[this.calendarCursor] ?? this.monthKey(this.now);
  }

  get calendarMonthLabel(): string {
    return new Date(`${this.activeCalendarMonthKey}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  get canGoPrevCalendarMonth(): boolean {
    return this.calendarCursor > 0;
  }

  get canGoNextCalendarMonth(): boolean {
    return this.calendarCursor < this.calendarMonthKeys.length - 1;
  }

  get calendarDays(): CalendarDay[] {
    const monthDate = new Date(`${this.activeCalendarMonthKey}-01`);
    if (Number.isNaN(monthDate.getTime())) return [];

    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const total = this.daysInMonth(monthDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const logMap = new Map(this.logs.map((log) => [log.date, log]));
    const days: CalendarDay[] = [];

    for (let day = 1; day <= total; day += 1) {
      const current = new Date(year, month, day);
      current.setHours(0, 0, 0, 0);
      const key = this.dateKey(current);
      const log = logMap.get(key);
      days.push({
        date: key,
        day,
        status: this.resolveCalendarStatus(key, current, today, log),
        log
      });
    }

    return days;
  }

  get calendarGridCells(): Array<CalendarDay | null> {
    const monthDate = new Date(`${this.activeCalendarMonthKey}-01`);
    if (Number.isNaN(monthDate.getTime())) return [];
    const prefix = monthDate.getDay();
    return [...Array.from({ length: prefix }, () => null), ...this.calendarDays];
  }

  get selectedCalendarDay(): CalendarDay | null {
    if (!this.selectedCalendarDate) return null;
    return this.calendarDays.find((day) => day.date === this.selectedCalendarDate) ?? null;
  }

  get trackedDays(): number {
    return this.monthlyLogs.length;
  }

  get lateDays(): number {
    return this.monthlyLogs.filter((log) => log.lateByMinutes > 0).length;
  }

  get monthlyWeekendDays(): number {
    return this.countWeekendDays(this.now);
  }

  get monthlyFestivalDays(): number {
    return this.countFestivalDays(this.now);
  }

  get monthlyOffDays(): number {
    return this.countMonthlyOffDays(this.now);
  }

  get averageWorkLabel(): string {
    if (!this.monthlyLogs.length) return '--:--';
    const total = this.monthlyLogs.reduce((sum, log) => sum + log.workMinutes, 0);
    return this.minutesToHHMM(Math.round(total / this.monthlyLogs.length));
  }

  get complianceRate(): number {
    if (!this.monthlyLogs.length) return 0;
    const compliant = this.monthlyLogs.filter(
      (log) => log.lateByMinutes === 0 && log.workMinutes >= this.requiredWorkMinutes
    ).length;
    return Math.round((compliant / this.monthlyLogs.length) * 100);
  }

  get monthTargetProgress(): number {
    if (!this.monthlyLogs.length) return 0;
    const totalWorked = this.monthlyLogs.reduce((sum, log) => sum + log.workMinutes, 0);
    const targetTotal = this.monthlyLogs.length * this.requiredWorkMinutes;
    if (targetTotal <= 0) return 0;
    return Math.min(Math.round((totalWorked / targetTotal) * 100), 100);
  }

  get attendanceMixBars(): AnalyticsBar[] {
    const monthTotal = this.daysInMonth(this.now);
    return [
      this.createBarStat('Worked Days', this.trackedDays, monthTotal, '#2cc3af', 'work_history'),
      this.createBarStat('Late Days', this.lateDays, monthTotal, '#f07d35', 'alarm'),
      this.createBarStat('Leave Days', this.monthlyLeaveDays, monthTotal, '#f5a623', 'event_busy'),
      this.createBarStat('Weekend + Festival', this.monthlyOffDays, monthTotal, '#6f7f9d', 'event')
    ];
  }

  get weeklyTrend(): TrendPoint[] {
    const points: TrendPoint[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const dateKey = this.dateKey(date);
      const log = this.monthlyLogs.find((item) => item.date === dateKey);
      const minutes = log?.workMinutes ?? 0;
      points.push({
        label: date.toLocaleDateString('en-US', { weekday: 'short' }),
        minutes,
        percent: Math.min(Math.round((minutes / this.requiredWorkMinutes) * 100), 100),
        late: (log?.lateByMinutes ?? 0) > 0
      });
    }
    return points;
  }

  selectLog(log: PunchAuditLog): void {
    this.selectedLogDate = log.date;
  }

  selectCalendarDay(day: CalendarDay): void {
    this.selectedCalendarDate = day.date;
  }

  openImagePreview(imageUrl: string): void {
    this.previewImageUrl = imageUrl;
  }

  closeImagePreview(): void {
    this.previewImageUrl = null;
  }

  prevCalendarMonth(): void {
    if (!this.canGoPrevCalendarMonth) return;
    this.calendarCursor -= 1;
    this.selectedCalendarDate = this.calendarDays[0]?.date ?? null;
  }

  nextCalendarMonth(): void {
    if (!this.canGoNextCalendarMonth) return;
    this.calendarCursor += 1;
    this.selectedCalendarDate = this.calendarDays[0]?.date ?? null;
  }

  calendarStatusLabel(status: CalendarStatus): string {
    if (status === 'UPCOMING') return 'Upcoming';
    return status.replace('_', ' ');
  }

  timelineStartPercent(log: PunchAuditLog): number {
    if (!log.punchIn) return 0;
    return this.clampPercent((this.minuteOfDay(log.punchIn) / (24 * 60)) * 100);
  }

  timelineEndPercent(log: PunchAuditLog): number {
    if (!log.punchOut) return this.timelineStartPercent(log);
    return this.clampPercent((this.minuteOfDay(log.punchOut) / (24 * 60)) * 100);
  }

  timelineWidthPercent(log: PunchAuditLog): number {
    return Math.max(this.timelineEndPercent(log) - this.timelineStartPercent(log), 0.8);
  }

  minutesToHHMM(totalMinutes: number): string {
    const safe = Math.max(totalMinutes, 0);
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  locationTypeLabel(locationType?: PunchLocationType): string {
    if (locationType === 'OFFICE_ZONE') return 'Office Zone';
    if (locationType === 'HOME_ZONE') return 'Home Zone';
    if (locationType === 'REMOTE_ZONE') return 'Remote Zone';
    return 'Unknown';
  }

  private createBarStat(label: string, value: number, total: number, color: string, icon: string): AnalyticsBar {
    const percent = total > 0 ? Math.round((value / total) * 100) : 0;
    return { label, value, percent, color, icon };
  }

  private syncCalendarMonths(): void {
    const previous = this.activeCalendarMonthKey;
    const keys = new Set<string>([this.monthKey(this.now)]);
    this.logs.forEach((log) => keys.add(log.date.slice(0, 7)));
    this.approvedLeaveDates.forEach((date) => keys.add(date.slice(0, 7)));
    this.calendarMonthKeys = Array.from(keys).sort();

    const existing = this.calendarMonthKeys.indexOf(previous);
    this.calendarCursor = existing > -1 ? existing : Math.max(this.calendarMonthKeys.length - 1, 0);
  }

  private resolveCalendarStatus(
    dateKey: string,
    date: Date,
    today: Date,
    log?: PunchAuditLog
  ): CalendarStatus {
    if (log) {
      if (!log.punchIn || !log.punchOut) return 'INVALID';
      if (log.workMinutes >= this.requiredWorkMinutes + 60) return 'OVERTIME';
      if (log.lateByMinutes > 0) return 'LATE';
      return 'PRESENT';
    }

    if (this.isHoliday(dateKey)) return 'HOLIDAY';
    if (date.getDay() === 0 || date.getDay() === 6) return 'WEEKEND';
    if (this.approvedLeaveDates.has(dateKey)) return 'LEAVE';
    if (dateKey === this.dateKey(new Date())) return 'UPCOMING';
    if (date.getTime() > today.getTime()) return 'UPCOMING';
    return 'ABSENT';
  }

  private isHoliday(dateKey: string): boolean {
    return HOLIDAY_CALENDAR.some((holiday) => holiday.date === dateKey);
  }

  private countLeaveDaysByMonth(base: Date): number {
    return Array.from(this.approvedLeaveDates).filter((date) => this.isSameMonth(date, base)).length;
  }

  private monthKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private minuteOfDay(iso?: string): number {
    if (!iso) return 0;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 0;
    return date.getHours() * 60 + date.getMinutes();
  }

  private clampPercent(value: number): number {
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
  }

  private dateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private daysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  private countFestivalDays(date: Date): number {
    return HOLIDAY_CALENDAR.filter((holiday) => this.isSameMonth(holiday.date, date)).length;
  }

  private countWeekendDays(date: Date): number {
    const total = this.daysInMonth(date);
    let weekends = 0;
    for (let day = 1; day <= total; day += 1) {
      const current = new Date(date.getFullYear(), date.getMonth(), day);
      const weekDay = current.getDay();
      if (weekDay === 0 || weekDay === 6) {
        weekends += 1;
      }
    }
    return weekends;
  }

  private countMonthlyOffDays(base: Date): number {
    const offDates = new Set<string>();
    const total = this.daysInMonth(base);
    for (let day = 1; day <= total; day += 1) {
      const current = new Date(base.getFullYear(), base.getMonth(), day);
      const weekDay = current.getDay();
      if (weekDay === 0 || weekDay === 6) {
        offDates.add(this.dateKey(current));
      }
    }
    HOLIDAY_CALENDAR.forEach((holiday) => {
      if (this.isSameMonth(holiday.date, base)) {
        offDates.add(this.dateKey(new Date(holiday.date)));
      }
    });
    return offDates.size;
  }

  private isSameMonth(dateValue: string, base: Date): boolean {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === base.getFullYear() && date.getMonth() === base.getMonth();
  }
}
