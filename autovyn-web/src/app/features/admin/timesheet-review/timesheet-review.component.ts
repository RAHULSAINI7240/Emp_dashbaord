import { Component, OnDestroy } from '@angular/core';
import { DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, combineLatest, startWith } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { PunchAuditService } from '../../../core/services/punch-audit.service';
import { TimesheetEntryService } from '../../../core/services/timesheet-entry.service';
import { PunchAuditLog } from '../../../shared/models/punch-audit.model';
import { TimesheetEntry, TimesheetStatus } from '../../../shared/models/timesheet-entry.model';
import { User } from '../../../shared/models/user.model';

type PunchState = 'PUNCHED_IN' | 'PUNCHED_OUT' | 'NO_PUNCH';
type DayFillState = 'FILLED' | 'PENDING' | 'UPCOMING' | 'WEEKEND';

interface EmployeeListSummary {
  user: User;
  code: string;
  allEntries: TimesheetEntry[];
  yearEntries: TimesheetEntry[];
  monthEntries: TimesheetEntry[];
  todayEntries: TimesheetEntry[];
  latestEntry: TimesheetEntry | null;
  yearHours: number;
  monthHours: number;
  todayHours: number;
  filledDaysInMonth: number;
  pendingDaysInMonth: number;
  punchState: PunchState;
  todayPunchLog: PunchAuditLog | null;
  latestPunchLog: PunchAuditLog | null;
}

interface DayStatusItem {
  date: string;
  dayNumber: number;
  weekLabel: string;
  state: DayFillState;
  label: string;
  totalHours: number;
  entryCount: number;
  firstLoggedAt: string | null;
  lastUpdatedAt: string | null;
  entries: TimesheetEntry[];
}

interface MonthOverviewItem {
  monthNumber: string;
  monthKey: string;
  label: string;
  totalHours: number;
  tasks: number;
  filledDays: number;
  pendingDays: number;
  completedTasks: number;
}

@Component({
  selector: 'app-timesheet-review',
  imports: [NgFor, NgIf, DatePipe, DecimalPipe, ReactiveFormsModule, MatIconModule],
  templateUrl: './timesheet-review.component.html',
  styleUrl: './timesheet-review.component.scss'
})
export class TimesheetReviewComponent implements OnDestroy {
  readonly today = this.dateKey(new Date());
  readonly currentYear = this.today.slice(0, 4);
  readonly currentMonthNumber = this.today.slice(5, 7);
  readonly monthPicker = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];
  readonly taskStatusOptions: Array<TimesheetStatus | 'ALL'> = ['ALL', 'COMPLETED', 'IN_PROGRESS', 'REVIEW', 'BLOCKED'];
  readonly filters;

  yearOptions: string[] = [this.currentYear];
  employeeSummaries: EmployeeListSummary[] = [];
  visibleEmployees: EmployeeListSummary[] = [];
  dayStatusItems: DayStatusItem[] = [];
  selectedDayEntries: TimesheetEntry[] = [];
  yearMonthOverviews: MonthOverviewItem[] = [];
  selectedEmployeeId: string | null = null;
  selectedDayKey: string | null = null;
  organizationStats = {
    totalEmployees: 0,
    filledToday: 0,
    pendingToday: 0,
    livePunch: 0,
    monthHours: 0,
    yearHours: 0
  };

  private usersCache: User[] = [];
  private entriesCache: TimesheetEntry[] = [];
  private punchLogsCache: PunchAuditLog[] = [];
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly timesheetEntryService: TimesheetEntryService,
    private readonly punchAuditService: PunchAuditService
  ) {
    this.filters = this.fb.nonNullable.group({
      search: [''],
      year: [this.currentYear],
      month: [this.currentMonthNumber],
      taskStatus: ['ALL' as TimesheetStatus | 'ALL']
    });

    this.subscriptions.add(
      combineLatest([
        this.authService.getUsers(),
        this.timesheetEntryService.entries$,
        this.punchAuditService.getAllLogs(),
        this.filters.valueChanges.pipe(startWith(this.filters.getRawValue()))
      ]).subscribe(([users, entries, logs]) => {
        this.usersCache = users;
        this.entriesCache = entries;
        this.punchLogsCache = logs;
        this.rebuildView();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get selectedMonthKey(): string {
    return `${this.filters.controls.year.value}-${this.filters.controls.month.value}`;
  }

  get selectedMonthLabel(): string {
    return this.formatMonthLabel(this.selectedMonthKey);
  }

  get selectedEmployeeSummary(): EmployeeListSummary | null {
    if (!this.selectedEmployeeId) return null;
    return this.employeeSummaries.find((item) => item.user.id === this.selectedEmployeeId) ?? null;
  }

  get selectedDaySummary(): DayStatusItem | null {
    if (!this.selectedDayKey) return null;
    return this.dayStatusItems.find((item) => item.date === this.selectedDayKey) ?? null;
  }

  get selectedTaskStatusLabel(): string {
    const status = this.filters.controls.taskStatus.value;
    return status === 'ALL' ? 'All task statuses' : this.statusLabel(status);
  }

  get detailHeroTitle(): string {
    return this.selectedEmployeeSummary ? `${this.selectedEmployeeSummary.user.name} Timesheet Overview` : 'Timesheet Overview';
  }

  selectEmployee(userId: string): void {
    this.selectedEmployeeId = userId;
    this.rebuildView();
  }

  selectDay(dayKey: string): void {
    this.selectedDayKey = dayKey;
    this.updateSelectedDayEntries();
  }

  selectMonth(monthNumber: string): void {
    this.filters.controls.month.setValue(monthNumber);
  }

  statusLabel(status: TimesheetStatus): string {
    return status.replace('_', ' ');
  }

  punchStateLabel(state: PunchState): string {
    switch (state) {
      case 'PUNCHED_IN':
        return 'Punched In';
      case 'PUNCHED_OUT':
        return 'Punched Out';
      default:
        return 'No Punch Yet';
    }
  }

  punchStateIcon(state: PunchState): string {
    switch (state) {
      case 'PUNCHED_IN':
        return 'radio_button_checked';
      case 'PUNCHED_OUT':
        return 'task_alt';
      default:
        return 'schedule';
    }
  }

  dayStateIcon(state: DayFillState): string {
    switch (state) {
      case 'FILLED':
        return 'task_alt';
      case 'PENDING':
        return 'assignment_late';
      case 'WEEKEND':
        return 'weekend';
      default:
        return 'schedule';
    }
  }

  aiShare(entry: TimesheetEntry): number {
    if (entry.workHours <= 0) return 0;
    return Math.min(Math.round((entry.aiHours / entry.workHours) * 100), 100);
  }

  employeeAiShare(summary: EmployeeListSummary): number {
    if (summary.monthHours <= 0) return 0;
    const totalAiHours = summary.monthEntries.reduce((sum, item) => sum + item.aiHours, 0);
    return Math.min(Math.round((totalAiHours / summary.monthHours) * 100), 100);
  }

  resetFilters(): void {
    this.filters.setValue({
      search: '',
      year: this.currentYear,
      month: this.currentMonthNumber,
      taskStatus: 'ALL'
    });
  }

  private rebuildView(): void {
    const selectedYear = this.filters.controls.year.value;
    const selectedMonth = this.filters.controls.month.value;
    const search = this.filters.controls.search.value.trim().toLowerCase();

    this.yearOptions = Array.from(new Set([this.currentYear, ...this.entriesCache.map((item) => item.date.slice(0, 4))]))
      .sort()
      .reverse();

    const employees = [...this.usersCache]
      .filter((user) => !user.roles.includes('ADMIN'))
      .sort((a, b) => a.name.localeCompare(b.name));
    const sortedEntries = [...this.entriesCache].sort(
      (a, b) => `${b.date}-${b.updatedAt}`.localeCompare(`${a.date}-${a.updatedAt}`)
    );
    const sortedLogs = [...this.punchLogsCache].sort((a, b) =>
      `${b.date}-${b.punchOut ?? ''}-${b.punchIn ?? ''}`.localeCompare(`${a.date}-${a.punchOut ?? ''}-${a.punchIn ?? ''}`)
    );

    this.employeeSummaries = employees
      .map((user) => {
        const code = user.employeeId || user.adminId || user.id;
        const allEntries = sortedEntries.filter((item) => item.userId === user.id);
        const yearEntries = allEntries.filter((item) => item.date.startsWith(selectedYear));
        const monthEntries = yearEntries.filter((item) => item.date.startsWith(`${selectedYear}-${selectedMonth}`));
        const todayEntries = allEntries.filter((item) => item.date === this.today);
        const userLogs = sortedLogs.filter((log) => log.employeeId === user.id);
        const todayPunchLog = userLogs.find((log) => log.date === this.today) ?? null;
        const latestPunchLog = userLogs[0] ?? null;
        const dayStates = this.buildDayStatusItems(monthEntries, selectedYear, selectedMonth);
        const punchState: PunchState = todayPunchLog?.punchIn
          ? todayPunchLog.punchOut
            ? 'PUNCHED_OUT'
            : 'PUNCHED_IN'
          : 'NO_PUNCH';

        return {
          user,
          code,
          allEntries,
          yearEntries,
          monthEntries,
          todayEntries,
          latestEntry: allEntries[0] ?? null,
          yearHours: yearEntries.reduce((sum, item) => sum + item.workHours, 0),
          monthHours: monthEntries.reduce((sum, item) => sum + item.workHours, 0),
          todayHours: todayEntries.reduce((sum, item) => sum + item.workHours, 0),
          filledDaysInMonth: dayStates.filter((item) => item.state === 'FILLED').length,
          pendingDaysInMonth: dayStates.filter((item) => item.state === 'PENDING').length,
          punchState,
          todayPunchLog,
          latestPunchLog
        };
      })
      .sort((a, b) => {
        if (a.todayEntries.length !== b.todayEntries.length) {
          return Number(b.todayEntries.length > 0) - Number(a.todayEntries.length > 0);
        }
        return a.user.name.localeCompare(b.user.name);
      });

    this.organizationStats = {
      totalEmployees: this.employeeSummaries.length,
      filledToday: this.employeeSummaries.filter((item) => item.todayEntries.length > 0).length,
      pendingToday: this.employeeSummaries.filter((item) => item.todayEntries.length === 0).length,
      livePunch: this.employeeSummaries.filter((item) => item.punchState === 'PUNCHED_IN').length,
      monthHours: this.employeeSummaries.reduce((sum, item) => sum + item.monthHours, 0),
      yearHours: this.employeeSummaries.reduce((sum, item) => sum + item.yearHours, 0)
    };

    this.visibleEmployees = this.employeeSummaries.filter(
      (summary) =>
        !search ||
        this.matchesText(summary.user.name, search) ||
        this.matchesText(summary.code, search) ||
        this.matchesText(summary.user.department, search) ||
        this.matchesText(summary.user.designation, search) ||
        this.matchesText(summary.latestEntry?.ticketId, search) ||
        this.matchesText(summary.latestEntry?.taskTitle, search)
    );

    if (!this.visibleEmployees.length) {
      this.selectedEmployeeId = null;
      this.dayStatusItems = [];
      this.selectedDayEntries = [];
      this.yearMonthOverviews = [];
      this.selectedDayKey = null;
      return;
    }

    if (!this.selectedEmployeeId || !this.visibleEmployees.some((item) => item.user.id === this.selectedEmployeeId)) {
      this.selectedEmployeeId = this.visibleEmployees[0].user.id;
    }

    const selectedEmployee = this.selectedEmployeeSummary;
    if (!selectedEmployee) return;

    this.dayStatusItems = this.buildDayStatusItems(selectedEmployee.monthEntries, selectedYear, selectedMonth);
    this.yearMonthOverviews = this.buildMonthOverviewItems(selectedEmployee.yearEntries, selectedYear);

    if (
      !this.selectedDayKey ||
      !this.dayStatusItems.some((item) => item.date === this.selectedDayKey) ||
      !this.selectedDayKey.startsWith(this.selectedMonthKey)
    ) {
      this.selectedDayKey = this.resolveDefaultDayKey();
    }

    this.updateSelectedDayEntries();
  }

  private updateSelectedDayEntries(): void {
    const selectedDay = this.selectedDaySummary;
    const taskStatus = this.filters.controls.taskStatus.value;
    const entries = selectedDay?.entries ?? [];
    this.selectedDayEntries =
      taskStatus === 'ALL' ? entries : entries.filter((item) => item.status === taskStatus);
  }

  private resolveDefaultDayKey(): string | null {
    const todayInMonth = this.dayStatusItems.find((item) => item.date === this.today);
    if (todayInMonth) return todayInMonth.date;

    const latestFilled = [...this.dayStatusItems].reverse().find((item) => item.state === 'FILLED');
    return latestFilled?.date ?? this.dayStatusItems[0]?.date ?? null;
  }

  private buildMonthOverviewItems(entries: TimesheetEntry[], year: string): MonthOverviewItem[] {
    return this.monthPicker.map((month) => {
      const monthKey = `${year}-${month.value}`;
      const monthEntries = entries.filter((item) => item.date.startsWith(monthKey));
      const dayStates = this.buildDayStatusItems(monthEntries, year, month.value);

      return {
        monthNumber: month.value,
        monthKey,
        label: month.label,
        totalHours: monthEntries.reduce((sum, item) => sum + item.workHours, 0),
        tasks: monthEntries.length,
        filledDays: dayStates.filter((item) => item.state === 'FILLED').length,
        pendingDays: dayStates.filter((item) => item.state === 'PENDING').length,
        completedTasks: monthEntries.filter((item) => item.status === 'COMPLETED').length
      };
    });
  }

  private buildDayStatusItems(entries: TimesheetEntry[], year: string, monthNumber: string): DayStatusItem[] {
    const monthIndex = Number(monthNumber) - 1;
    const totalDays = new Date(Number(year), monthIndex + 1, 0).getDate();
    const todayDate = new Date(`${this.today}T00:00:00`);

    return Array.from({ length: totalDays }, (_, index) => {
      const dayNumber = index + 1;
      const date = `${year}-${monthNumber}-${String(dayNumber).padStart(2, '0')}`;
      const dateValue = new Date(`${date}T00:00:00`);
      const dayEntries = entries.filter((item) => item.date === date);
      const isFuture = dateValue.getTime() > todayDate.getTime();
      const isWeekend = dateValue.getDay() === 0 || dateValue.getDay() === 6;
      let state: DayFillState = 'PENDING';

      if (dayEntries.length > 0) {
        state = 'FILLED';
      } else if (isFuture) {
        state = 'UPCOMING';
      } else if (isWeekend) {
        state = 'WEEKEND';
      }

      return {
        date,
        dayNumber,
        weekLabel: dateValue.toLocaleDateString('en-US', { weekday: 'short' }),
        state,
        label: this.dayStateLabel(state),
        totalHours: dayEntries.reduce((sum, item) => sum + item.workHours, 0),
        entryCount: dayEntries.length,
        firstLoggedAt: dayEntries.length ? [...dayEntries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0].createdAt : null,
        lastUpdatedAt: dayEntries.length ? [...dayEntries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].updatedAt : null,
        entries: dayEntries
      };
    });
  }

  private dayStateLabel(state: DayFillState): string {
    switch (state) {
      case 'FILLED':
        return 'Filled';
      case 'PENDING':
        return 'Pending';
      case 'WEEKEND':
        return 'Weekend';
      default:
        return 'Upcoming';
    }
  }

  private matchesText(value: string | null | undefined, query: string): boolean {
    return (value ?? '').toLowerCase().includes(query);
  }

  private formatMonthLabel(monthKey: string): string {
    const date = new Date(`${monthKey}-01T00:00:00`);
    return Number.isNaN(date.getTime())
      ? monthKey
      : date.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric'
        });
  }

  private dateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
