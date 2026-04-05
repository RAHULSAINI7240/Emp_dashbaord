import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, combineLatest, firstValueFrom, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { AttendanceService } from '../../../core/services/attendance.service';
import { LeaveService } from '../../../core/services/leave.service';
import { PunchAuditService } from '../../../core/services/punch-audit.service';
import { ToastService } from '../../../core/services/toast.service';
import { WorklogService } from '../../../core/services/worklog.service';
import { AttendanceDay } from '../../../shared/models/attendance.model';
import { FaceScanType, PunchAuditLog } from '../../../shared/models/punch-audit.model';
import { User } from '../../../shared/models/user.model';
import { WorklogEmployeeSummary, WorklogSummary } from '../../../shared/models/worklog.model';
import { HOLIDAY_CALENDAR } from '../../../shared/utils/holiday-data';
import { AiAnalyticsService } from './analytics/ai-analytics.service';
import { AiEfficiencyCardComponent } from './analytics/ai-efficiency-card.component';
import { FocusAnalyticsService } from './analytics/focus-analytics.service';
import { FocusAnalyticsCardComponent } from './analytics/focus-analytics-card.component';
import { KpiTrendCardComponent } from './analytics/kpi-trend-card.component';
import { PredictionCardComponent } from './analytics/prediction-card.component';
import { WorkHeatmapComponent } from './analytics/work-heatmap.component';
import { ProductivityAttendanceLog } from './analytics/analytics.models';
import { BadgeEngineService } from './gamification/badge-engine.service';
import { BadgeShowcaseComponent } from './gamification/badge-showcase.component';
import { InsightsEngineService } from './insights/insights-engine.service';
import { InsightsPanelComponent } from './insights/insights-panel.component';
import { WorkStatusService } from './realtime/work-status.service';

interface PunchLocation {
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
}

interface AttendanceLog {
  date: string;
  punchIn?: string;
  punchOut?: string;
  workMode: 'OFFICE' | 'HOME';
  workMinutes: number;
  lateByMinutes: number;
  inLocation?: PunchLocation;
  outLocation?: PunchLocation;
  faceVerified: boolean;
  faceScanType: FaceScanType;
  punchInPhoto?: string;
}

interface FaceCaptureEvidence {
  verified: boolean;
  scanType: FaceScanType;
  photoDataUrl?: string;
}

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

interface WorklogTrendBar {
  date: string;
  label: string;
  activeSeconds: number;
  inactiveSeconds: number;
  totalSeconds: number;
  activePercent: number;
  inactivePercent: number;
  targetPercent: number;
  productivityPercent: number;
}

interface WorklogSmartSummary {
  icon: string;
  text: string;
}

type CalendarStatus = 'PRESENT' | 'LATE' | 'OVERTIME' | 'LEAVE' | 'ABSENT' | 'WEEKEND' | 'HOLIDAY' | 'INVALID' | 'UPCOMING';

interface CalendarDay {
  date: string;
  day: number;
  status: CalendarStatus;
  log?: AttendanceLog;
}

type DashboardView = 'attendance' | 'time-track';

type FaceDetectorCtor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect(input: CanvasImageSource): Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

@Component({
  selector: 'app-dashboard',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatIconModule,
    NgFor,
    NgIf,
    KpiTrendCardComponent,
    AiEfficiencyCardComponent,
    FocusAnalyticsCardComponent,
    WorkHeatmapComponent,
    PredictionCardComponent,
    BadgeShowcaseComponent,
    InsightsPanelComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements AfterViewInit, OnDestroy, OnInit {
  private readonly vscodeRefreshIntervalMs = 10_000;
  @ViewChild('swipeTrack') swipeTrack?: ElementRef<HTMLElement>;
  @ViewChild('swipeKnob') swipeKnob?: ElementRef<HTMLElement>;
  @ViewChild('cameraPreview') cameraPreview?: ElementRef<HTMLVideoElement>;

  readonly requiredWorkMinutes = 8 * 60 + 30;
  readonly punchInCutoffMinutes = 9 * 60 + 50;
  viewMode: DashboardView = 'time-track';
  isAdminView = false;
  viewedEmployeeId: string | null = null;
  viewedEmployeeName = 'Employee';

  mode = new FormControl<'OFFICE' | 'HOME'>('OFFICE', { nonNullable: true });
  now = new Date();
  isPunchedIn = false;
  punchInTime = '--:--';
  punchOutTime = '--:--';
  currentLocationLabel = 'Location tracking starts after punch in';
  lastPunchLocationLabel = 'No punch location captured yet';
  faceCheckStatus = 'Face not verified today';
  totalEmployees = 0;
  monthlyLeaveDays = 0;
  monthlyWeekendDays = 0;
  monthlyFestivalDays = 0;
  monthlyOffDays = 0;
  monthlyWorkedDays = 0;
  vscodeSummary: WorklogSummary | null = null;
  vscodePrimarySummary: WorklogEmployeeSummary | null = null;
  vscodeLoading = false;
  approvedLeaveDates = new Set<string>();
  calendarMonthKeys: string[] = [];
  calendarCursor = 0;
  selectedCalendarDate: string | null = null;
  readonly weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly calendarLegend: CalendarStatus[] = ['PRESENT', 'LATE', 'LEAVE', 'ABSENT', 'WEEKEND', 'HOLIDAY', 'OVERTIME', 'UPCOMING'];
  facePreviewPhotoUrl = '';
  previewImageUrl: string | null = null;
  cameraCaptureOpen = false;
  cameraCaptureBusy = false;
  cameraCaptureError = '';

  knobOffset = 0;
  attendanceLogs: AttendanceLog[] = [];
  private isDragging = false;
  private isPunchProcessing = false;
  private activePointerId: number | null = null;
  private dragStartX = 0;
  private dragStartOffset = 0;
  private dragDistance = 0;
  private maxSwipe = 0;
  private readonly knobGap = 4;
  private readonly officeAnchor = { lat: 12.9716, lng: 77.5946 };
  private readonly officeRadiusKm = 2;
  private locationWatchId: number | null = null;
  private cameraStream: MediaStream | null = null;
  private pendingFaceCaptureResolve: ((value: FaceCaptureEvidence) => void) | null = null;
  private employeeUsers: User[] = [];
  private readonly subscriptions = new Subscription();
  private currentLeaderboardRank = 1;
  private vscodeRefreshHandle: ReturnType<typeof setInterval> | null = null;
  private clockHandle: ReturnType<typeof setInterval> | null = null;
  private worklogStreamAbortController: AbortController | null = null;
  private worklogStreamReconnectHandle: ReturnType<typeof setTimeout> | null = null;

  get aiSnapshot() {
    return this.aiAnalyticsService.snapshot;
  }

  get focusSnapshot() {
    return this.focusAnalyticsService.snapshot;
  }

  get kpiTrendMetrics() {
    return this.aiAnalyticsService.kpiTrends;
  }

  get badges() {
    return this.badgeEngineService.badges;
  }

  get leaderboard() {
    return this.badgeEngineService.leaderboard;
  }

  get latestUnlockedBadgeId() {
    return this.badgeEngineService.latestUnlockedBadgeId;
  }

  get insightCards() {
    return this.insightsEngineService.insights;
  }

  get insightsLoading() {
    return this.insightsEngineService.loading;
  }

  get predictionSnapshot() {
    return this.insightsEngineService.prediction;
  }

  get dashboardSubjectName(): string {
    if (this.isAdminView) return this.viewedEmployeeName;
    return this.authService.getCurrentUserSnapshot()?.name ?? 'Employee';
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
    const logMap = new Map(this.attendanceLogs.map((log) => [log.date, log]));
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

  get hasTodayPunchIn(): boolean {
    return !!this.getTodayAttendanceLog()?.punchIn;
  }

  get hasTodayPunchOut(): boolean {
    return !!this.getTodayAttendanceLog()?.punchOut;
  }

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    public readonly authService: AuthService,
    private readonly attendanceService: AttendanceService,
    private readonly leaveService: LeaveService,
    private readonly punchAuditService: PunchAuditService,
    private readonly toastService: ToastService,
    private readonly workStatusService: WorkStatusService,
    private readonly aiAnalyticsService: AiAnalyticsService,
    private readonly focusAnalyticsService: FocusAnalyticsService,
    private readonly badgeEngineService: BadgeEngineService,
    private readonly insightsEngineService: InsightsEngineService,
    private readonly worklogService: WorklogService
  ) {
    this.resolveViewMode();
    this.resolveViewContext();
    this.monthlyWeekendDays = this.countWeekendDays(this.now);
    this.monthlyFestivalDays = this.countFestivalDays(this.now);
    this.monthlyOffDays = this.countMonthlyOffDays(this.now);
    this.syncCalendarMonths();
    this.loadOrganizationData();

    if (this.isAdminView) {
      this.loadAdminViewLogs();
      this.loadLeaveData();
      this.initializeVsCodeWorklogSummary();
      return;
    }

    this.restoreState();
    this.restoreLogs();
    this.applyLatestAttendanceSnapshot();
    this.seedStaticMonthlyLogsIfEmpty();
    this.refreshLocationSummaries();
    this.syncAuditLogs();
    this.monthlyWorkedDays = this.monthlyCompletedLogs.length;
    this.loadLeaveData();
    void this.loadEmployeeAttendanceData();
    this.syncPremiumAnalytics();
    this.initializeVsCodeWorklogSummary();
  }

  ngOnInit(): void {
    this.clockHandle = setInterval(() => {
      this.now = new Date();
    }, 1000);
  }

  ngAfterViewInit(): void {
    if (this.viewMode !== 'attendance' || this.isAdminView) return;
    this.setMaxSwipe();
    if (this.isPunchedIn) {
      this.startLiveLocationTracking();
    }
  }

  ngOnDestroy(): void {
    if (this.clockHandle) {
      clearInterval(this.clockHandle);
      this.clockHandle = null;
    }
    if (this.vscodeRefreshHandle) {
      clearInterval(this.vscodeRefreshHandle);
      this.vscodeRefreshHandle = null;
    }
    if (this.worklogStreamReconnectHandle) {
      clearTimeout(this.worklogStreamReconnectHandle);
      this.worklogStreamReconnectHandle = null;
    }
    if (this.worklogStreamAbortController) {
      this.worklogStreamAbortController.abort();
      this.worklogStreamAbortController = null;
    }
    this.closeCameraCapture();
    this.stopLiveLocationTracking();
    this.subscriptions.unsubscribe();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.viewMode !== 'attendance' || this.isAdminView) return;
    this.setMaxSwipe();
  }

  get swipeLabel(): string {
    if (this.isAttendanceLockedForToday()) {
      return 'Attendance completed for today. You can punch in again tomorrow.';
    }
    return this.isPunchedIn ? 'Swipe left to Punch Out' : 'Swipe right to Punch In (face + location check)';
  }

  get punchStatusLabel(): string {
    if (this.hasTodayPunchOut) return 'Attendance completed';
    if (this.isPunchedIn) return 'Currently punched in';
    return 'Ready for punch in';
  }

  get punchStatusIcon(): string {
    if (this.hasTodayPunchOut) return 'task_alt';
    if (this.isPunchedIn) return 'radio_button_checked';
    return 'schedule';
  }

  get punchActionTitle(): string {
    if (this.hasTodayPunchOut) return 'Attendance Completed';
    return this.isPunchedIn ? '<- Swipe to Punch Out' : 'Swipe to Punch In ->';
  }

  get punchActionHint(): string {
    if (this.hasTodayPunchOut) {
      return 'Today punch in and punch out are already recorded.';
    }
    return this.isPunchedIn ? 'Swipe left to finish work.' : 'Swipe right to start punch in.';
  }

  get greetingMessage(): string {
    const hour = this.now.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  get maxPunchInLabel(): string {
    return '09:50 AM';
  }

  get requiredWorkLabel(): string {
    return this.minutesToHHMM(this.requiredWorkMinutes);
  }

  get monthLabel(): string {
    return this.now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  get reportLogs(): AttendanceLog[] {
    return [...this.attendanceLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }

  get completedLogs(): AttendanceLog[] {
    return this.attendanceLogs.filter((log) => !!log.punchIn && !!log.punchOut);
  }

  get lateDaysCount(): number {
    return this.completedLogs.filter((log) => log.lateByMinutes > 0).length;
  }

  get averageWorkLabel(): string {
    if (!this.completedLogs.length) return '--:--';
    const total = this.completedLogs.reduce((sum, log) => sum + log.workMinutes, 0);
    return this.minutesToHHMM(Math.round(total / this.completedLogs.length));
  }

  get monthlyAverageWorkLabel(): string {
    if (!this.monthlyCompletedLogs.length) return '--:--';
    const total = this.monthlyCompletedLogs.reduce((sum, log) => sum + log.workMinutes, 0);
    return this.minutesToHHMM(Math.round(total / this.monthlyCompletedLogs.length));
  }

  get monthTargetProgress(): number {
    if (!this.monthlyCompletedLogs.length) return 0;
    const totalWorked = this.monthlyCompletedLogs.reduce((sum, log) => sum + log.workMinutes, 0);
    const targetTotal = this.monthlyCompletedLogs.length * this.requiredWorkMinutes;
    if (targetTotal <= 0) return 0;
    return Math.min(Math.round((totalWorked / targetTotal) * 100), 100);
  }

  get punctualityRate(): number {
    if (!this.monthlyCompletedLogs.length) return 0;
    const onTime = this.monthlyCompletedLogs.filter((log) => log.lateByMinutes === 0).length;
    return Math.round((onTime / this.monthlyCompletedLogs.length) * 100);
  }

  get monthlyCompletedLogs(): AttendanceLog[] {
    return this.completedLogs.filter((log) => this.isSameMonth(log.date, this.now));
  }

  get complianceRate(): number {
    if (!this.completedLogs.length) return 0;
    const compliant = this.completedLogs.filter(
      (log) => log.lateByMinutes === 0 && log.workMinutes >= this.requiredWorkMinutes
    ).length;
    return Math.round((compliant / this.completedLogs.length) * 100);
  }

  get aiInsights(): string[] {
    if (!this.completedLogs.length) {
      return ['Start punching in/out regularly. Once data is available, smart attendance insights will appear here.'];
    }
    const averageStartMinute = Math.round(
      this.completedLogs.reduce((sum, log) => sum + this.minuteOfDay(log.punchIn), 0) / this.completedLogs.length
    );
    const averageWorkMinute = Math.round(
      this.completedLogs.reduce((sum, log) => sum + log.workMinutes, 0) / this.completedLogs.length
    );
    const lateDays = this.completedLogs.filter((log) => log.lateByMinutes > 0).length;

    return [
      `AI trend: average punch-in is ${this.formatMinuteOfDay(averageStartMinute)} (target is ${this.maxPunchInLabel}).`,
      `AI trend: average working duration is ${this.minutesToHHMM(averageWorkMinute)} against required ${this.requiredWorkLabel}.`,
      lateDays > 0
        ? `AI alert: ${lateDays} day(s) were late. Improve punctuality for better compliance.`
        : 'AI score: excellent punctuality so far. No late punch-ins found in completed logs.'
    ];
  }

  get attendanceMixBars(): AnalyticsBar[] {
    const monthTotal = this.daysInMonth(this.now);
    return [
      this.createBarStat('Worked Days', this.monthlyWorkedDays, monthTotal, '#2cc3af', 'work_history'),
      this.createBarStat('Leave Days', this.monthlyLeaveDays, monthTotal, '#f5a623', 'event_busy'),
      this.createBarStat('Weekend Days', this.monthlyWeekendDays, monthTotal, '#7b8ba8', 'weekend'),
      this.createBarStat('Festival Days', this.monthlyFestivalDays, monthTotal, '#8e5cf7', 'celebration')
    ];
  }

  get employeeSegmentBars(): AnalyticsBar[] {
    const byMode = this.organizationModeCounts();
    const total = Math.max(this.totalEmployees, 1);
    return [
      this.createBarStat('WFO', byMode.WFO, total, '#2d8cf0', 'business'),
      this.createBarStat('WFH', byMode.WFH, total, '#20bf6b', 'home'),
      this.createBarStat('Hybrid', byMode.HYBRID, total, '#8854d0', 'hub')
    ];
  }

  get weeklyTrend(): TrendPoint[] {
    const points: TrendPoint[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const dateKey = this.dateKey(date);
      const log = this.attendanceLogs.find((item) => item.date === dateKey);
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

  selectCalendarDay(day: CalendarDay): void {
    this.selectedCalendarDate = day.date;
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

  get productivityLogs(): ProductivityAttendanceLog[] {
    return this.completedLogs.map((log) => ({
      date: log.date,
      workMinutes: log.workMinutes,
      lateByMinutes: log.lateByMinutes,
      workMode: log.workMode,
      punchIn: log.punchIn,
      punchOut: log.punchOut
    }));
  }

  get workingHours(): string {
    const todayLog = this.getTodayAttendanceLog();
    if (!todayLog?.punchIn) return '--:--';
    const inDate = new Date(todayLog.punchIn);
    if (Number.isNaN(inDate.getTime())) return '--:--';

    const outDate = todayLog.punchOut ? new Date(todayLog.punchOut) : this.now;
    if (Number.isNaN(outDate.getTime())) return '--:--';

    const diffSeconds = Math.max(0, Math.floor((outDate.getTime() - inDate.getTime()) / 1000));
    return this.secondsToHHMM(diffSeconds);
  }

  get vscodeActiveLabel(): string {
    return this.secondsToHHMM(this.vscodePrimarySummary?.activeSeconds ?? this.vscodeSummary?.totalActiveSeconds ?? 0);
  }

  get vscodeInactiveLabel(): string {
    return this.secondsToHHMM(
      this.vscodePrimarySummary?.inactiveSeconds ?? this.vscodeSummary?.totalInactiveSeconds ?? 0
    );
  }

  get vscodeTrackedLabel(): string {
    return this.secondsToHHMM(
      this.vscodePrimarySummary?.totalTrackedSeconds ?? this.vscodeSummary?.totalTrackedSeconds ?? 0
    );
  }

  get vscodeTodayTrackedLabel(): string {
    return this.secondsToHHMM(this.vscodeTodaySummary?.totalSeconds ?? 0);
  }

  get vscodeTodayActiveLabel(): string {
    return this.secondsToHHMM(this.vscodeTodaySummary?.activeSeconds ?? 0);
  }

  get vscodeAverageTrackedLabel(): string {
    const daily = this.vscodePrimarySummary?.daily ?? [];
    if (!daily.length) return '00:00';
    const averageSeconds = daily.reduce((sum, day) => sum + day.totalSeconds, 0) / daily.length;
    return this.secondsToHHMM(averageSeconds);
  }

  get vscodeTargetLabel(): string {
    return this.secondsToHHMM(this.requiredWorkMinutes * 60);
  }

  get vscodeIdleRatio(): number {
    const tracked = this.vscodePrimarySummary?.totalTrackedSeconds ?? this.vscodeSummary?.totalTrackedSeconds ?? 0;
    const inactive = this.vscodePrimarySummary?.inactiveSeconds ?? this.vscodeSummary?.totalInactiveSeconds ?? 0;
    if (tracked <= 0) return 0;
    return Math.round((inactive / tracked) * 100);
  }

  get vscodeBestFocusDayLabel(): string {
    const days = this.vscodePrimarySummary?.daily ?? [];
    if (!days.length) return 'No tracked day';

    const bestDay = days.reduce((best, day) => {
      if (!best) return day;
      return day.productivityPercent > best.productivityPercent ? day : best;
    }, days[0]);

    return new Date(`${bestDay.date}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  get trackerSourceLabel(): string {
    return this.formatTrackerSource(this.vscodePrimarySummary?.lastHeartbeatEditor);
  }

  get trackerConnectionLabel(): string {
    const source = this.trackerSourceLabel;
    const liveStatus = this.vscodePrimarySummary?.liveStatus;

    if (!this.vscodePrimarySummary || !liveStatus || liveStatus === 'OFFLINE') {
      return `${source} Offline`;
    }

    if (liveStatus === 'IDLE') {
      return `${source} Idle`;
    }

    return `${source} Connected`;
  }

  get trackerConnectionNote(): string {
    const liveStatus = this.vscodePrimarySummary?.liveStatus;
    const source = this.trackerSourceLabel;

    if (!this.vscodePrimarySummary || !liveStatus || liveStatus === 'OFFLINE') {
      return `No fresh heartbeat is coming from the ${source.toLowerCase()} right now.`;
    }

    return `Live tracking data from the ${source.toLowerCase()} is syncing to the dashboard and being stored for future reports.`;
  }

  get agentLoginId(): string {
    const user = this.authService.getCurrentUserSnapshot();
    return user?.employeeId?.trim() || user?.adminId?.trim() || '';
  }

  get agentLoginHint(): string {
    if (this.agentLoginId) {
      return `Install it once, then sign in with ${this.agentLoginId} and your current password. After that it can launch automatically when your system starts.`;
    }

    return 'Install it once, then sign in with your employee ID and current password. After that it can launch automatically when your system starts.';
  }

  get vscodeStatus(): { label: string; icon: string; tone: 'active' | 'inactive' | 'idle' } {
    const liveStatus = this.vscodePrimarySummary?.liveStatus;
    if (!this.vscodePrimarySummary || liveStatus === 'OFFLINE' || !liveStatus) {
      return {
        label: 'Tracker Offline',
        icon: 'power_off',
        tone: 'inactive'
      };
    }

    if (liveStatus === 'IDLE') {
      return {
        label: 'Tracker Idle',
        icon: 'pause_circle',
        tone: 'idle'
      };
    }

    return {
      label: 'Tracker Active',
      icon: 'radio_button_checked',
      tone: 'active'
    };
  }

  get vscodeWeekActiveLabel(): string {
    const total = this.vscodeDailyTrend.reduce((sum, day) => sum + day.activeSeconds, 0);
    return this.secondsToHHMM(total);
  }

  get vscodeWeekInactiveLabel(): string {
    const total = this.vscodeDailyTrend.reduce((sum, day) => sum + day.inactiveSeconds, 0);
    return this.secondsToHHMM(total);
  }

  get vscodeWeekAverageLabel(): string {
    const days = this.vscodeDailyTrend;
    if (!days.length) return '00:00';
    const total = days.reduce((sum, day) => sum + day.totalSeconds, 0) / days.length;
    return this.secondsToHHMM(total);
  }

  get vscodeSmartSummaries(): WorklogSmartSummary[] {
    const status = this.vscodeStatus;
    const trackerSource = this.trackerSourceLabel;
    const trackerSourceLower = trackerSource.toLowerCase();

    if (status.tone === 'inactive') {
      return [
        {
          icon: 'desktop_access_disabled',
          text: `${trackerSource} is offline for this employee. Ask them to sign in on their tracker so live tracking starts again.`
        },
        {
          icon: 'visibility_off',
          text: `Until fresh heartbeats arrive from the ${trackerSourceLower}, the dashboard will keep this employee in inactive status.`
        }
      ];
    }

    const todayTracked = this.vscodeTodaySummary?.totalSeconds ?? 0;
    const targetSeconds = this.requiredWorkMinutes * 60;
    const deltaSeconds = todayTracked - targetSeconds;
    const trendLine =
      deltaSeconds >= 0
        ? `Today is ahead of target by ${this.secondsToHHMM(deltaSeconds)}.`
        : `Today is behind target by ${this.secondsToHHMM(Math.abs(deltaSeconds))}.`;

    const idleLine =
      this.vscodeIdleRatio >= 35
        ? `Idle share is ${this.vscodeIdleRatio}%, which suggests long breaks or unfocused tracked time.`
        : `Idle share is ${this.vscodeIdleRatio}%, which is within a healthy focus range.`;

    return [
      {
        icon: 'auto_awesome',
        text: `${trendLine} Average tracked time this week is ${this.vscodeWeekAverageLabel}. Total tracked this month is ${this.vscodeTrackedLabel}.`
      },
      {
        icon: 'psychology',
        text: `${idleLine} Best focus day was ${this.vscodeBestFocusDayLabel}. Last heartbeat: ${this.vscodeLastHeartbeatLabel}.`
      }
    ];
  }

  get vscodeLastHeartbeatLabel(): string {
    const value = this.vscodePrimarySummary?.lastHeartbeatAt;
    if (!value) return 'not available';

    return new Date(value).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  get vscodeDailyTrend(): WorklogTrendBar[] {
    const dailyMap = new Map((this.vscodePrimarySummary?.daily ?? []).map((day) => [day.date, day]));
    const targetSeconds = this.requiredWorkMinutes * 60;
    const sevenDays = Array.from({ length: 7 }, (_value, index) => {
      const date = new Date(this.now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = this.dateKey(date);
      return (
        dailyMap.get(key) ?? {
          date: key,
          activeSeconds: 0,
          inactiveSeconds: 0,
          totalSeconds: 0,
          productivityPercent: 0
        }
      );
    });

    const maxSeconds = Math.max(targetSeconds, ...sevenDays.map((day) => day.totalSeconds), 1);

    return sevenDays.map((day) => {
      const totalPercent = (day.totalSeconds / maxSeconds) * 100;
      const activePercent = day.totalSeconds > 0 ? (day.activeSeconds / day.totalSeconds) * totalPercent : 0;
      const inactivePercent = day.totalSeconds > 0 ? (day.inactiveSeconds / day.totalSeconds) * totalPercent : 0;

      return {
        date: day.date,
        label: new Date(`${day.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }),
        activeSeconds: day.activeSeconds,
        inactiveSeconds: day.inactiveSeconds,
        totalSeconds: day.totalSeconds,
        activePercent,
        inactivePercent,
        targetPercent: (targetSeconds / maxSeconds) * 100,
        productivityPercent: day.productivityPercent
      };
    });
  }

  private get vscodeTodaySummary() {
    const todayKey = this.dateKey(this.now);
    return this.vscodePrimarySummary?.daily.find((day) => day.date === todayKey) ?? null;
  }

  minutesToHHMM(totalMinutes: number): string {
    const safe = Math.max(totalMinutes, 0);
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  openImagePreview(imageUrl: string): void {
    this.previewImageUrl = imageUrl;
  }

  closeImagePreview(): void {
    this.previewImageUrl = null;
  }

  secondsToHHMM(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  timelineStartPercent(log: AttendanceLog): number {
    if (!log.punchIn) return 0;
    return this.clampPercent((this.minuteOfDay(log.punchIn) / (24 * 60)) * 100);
  }

  timelineEndPercent(log: AttendanceLog): number {
    if (!log.punchOut) return this.timelineStartPercent(log);
    return this.clampPercent((this.minuteOfDay(log.punchOut) / (24 * 60)) * 100);
  }

  timelineWidthPercent(log: AttendanceLog): number {
    return Math.max(this.timelineEndPercent(log) - this.timelineStartPercent(log), 0.8);
  }

  gaugeStyle(percent: number, color: string): string {
    return `conic-gradient(${color} 0 ${percent}%, #e4e9f6 ${percent}% 100%)`;
  }

  downloadDesktopAgent(): void {
    const targetUrl = this.resolveDesktopAgentDownloadUrl();
    if (!targetUrl) {
      this.toastService.show('Desktop app download is not configured yet.', 'error');
      return;
    }

    if (this.agentLoginId && targetUrl.pathname.toLowerCase().endsWith('.html')) {
      targetUrl.searchParams.set('employeeId', this.agentLoginId);
      const employeeName = this.authService.getCurrentUserSnapshot()?.name?.trim();
      if (employeeName) {
        targetUrl.searchParams.set('employeeName', employeeName);
      }
    }

    const opened = window.open(targetUrl.toString(), '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.href = targetUrl.toString();
    }

    this.toastService.show('Open the installer, finish setup, then sign in to the desktop app.', 'info');
  }

  copyAgentLoginId(): void {
    if (!this.agentLoginId) {
      this.toastService.show('Employee ID is not available for this account.', 'error');
      return;
    }

    const copied = this.tryClipboardCopy(this.agentLoginId);
    if (!copied) {
      this.toastService.show('Unable to copy employee ID.', 'error');
      return;
    }

    this.toastService.show('Employee ID copied.', 'success');
  }

  startSwipe(event: PointerEvent): void {
    if (this.isAdminView) return;
    if (this.isPunchProcessing) return;
    if (!this.canPerformCurrentSwipeAction()) {
      this.toastService.show('Today attendance is already completed. Next punch-in will be available tomorrow.', 'info');
      return;
    }
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    this.isDragging = true;
    this.activePointerId = event.pointerId;
    this.dragStartX = event.clientX;
    this.dragStartOffset = this.knobOffset;
    this.dragDistance = 0;
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  @HostListener('window:pointermove', ['$event'])
  moveSwipe(event: PointerEvent): void {
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
    if (!this.isDragging) return;
    const delta = event.clientX - this.dragStartX;
    this.dragDistance = Math.max(this.dragDistance, Math.abs(delta));
    this.knobOffset = Math.min(this.maxSwipe, Math.max(0, this.dragStartOffset + delta));
  }

  @HostListener('window:pointerup', ['$event'])
  @HostListener('window:pointercancel', ['$event'])
  async endSwipe(event: PointerEvent): Promise<void> {
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
    if (!this.isDragging) return;
    this.isDragging = false;
    this.activePointerId = null;
    if (this.isPunchProcessing) return;
    const completed = this.isPunchedIn
      ? this.dragDistance > 24 && this.knobOffset <= this.maxSwipe * 0.18
      : this.dragDistance > 24 && this.knobOffset >= this.maxSwipe * 0.82;
    if (!completed) {
      this.knobOffset = this.restingOffset();
      return;
    }
    this.knobOffset = this.isPunchedIn ? 0 : this.maxSwipe;
    this.isPunchProcessing = true;
    const success = await this.togglePunch();
    this.isPunchProcessing = false;
    if (!success) {
      this.knobOffset = this.restingOffset();
      return;
    }
    setTimeout(() => (this.knobOffset = this.restingOffset()), 180);
  }

  private async togglePunch(): Promise<boolean> {
    if (this.isAdminView) {
      this.toastService.show('Admin view is read-only. Punch actions are disabled.', 'info');
      return false;
    }
    if (!this.ensureAuthenticatedSession()) {
      return false;
    }
    this.workStatusService.markActivity();
    const now = new Date();
    const todayLog = this.attendanceLogs.find((item) => item.date === this.dateKey(now));

    if (!this.isPunchedIn) {
      if (todayLog?.punchIn || todayLog?.punchOut) {
        this.toastService.show('Punch-in already recorded for today. You can punch in again tomorrow.', 'info');
        return false;
      }
      const faceEvidence = await this.captureFaceEvidence();
      if (!faceEvidence.verified) {
        this.faceCheckStatus = 'Face not detected in camera frame';
        this.toastService.show('Face not detected. Punch in blocked.', 'error');
        return false;
      }
      if (!faceEvidence.photoDataUrl) {
        this.toastService.show('Photo capture is mandatory for punch in.', 'error');
        return false;
      }

      const location = await this.captureLocation(true);
      if (!location) {
        this.toastService.show('Location access is required for punch in.', 'error');
        return false;
      }

      try {
        const attendanceDay = await firstValueFrom(this.attendanceService.punchIn());
        const punchInAt = attendanceDay.punchInUtc ? new Date(attendanceDay.punchInUtc) : now;
        this.isPunchedIn = true;
        this.punchInTime = this.isoTimeLabel(punchInAt.toISOString());
        this.punchOutTime = '--:--';
        this.faceCheckStatus = `Verified (${this.scanTypeLabel(faceEvidence.scanType)}) at ${this.punchInTime}`;
        this.facePreviewPhotoUrl = faceEvidence.photoDataUrl ?? '';
        this.lastPunchLocationLabel = this.formatLocation(location, this.mode.value);
        this.currentLocationLabel = this.formatLocation(location, this.mode.value);
        this.upsertPunchInLog(punchInAt, location, faceEvidence);
        this.startLiveLocationTracking();
        this.toastService.show('Punched In successfully', 'success');
      } catch (error) {
        this.toastService.show(this.resolvePunchError(error, 'Unable to punch in.'), 'error');
        return false;
      }
    } else {
      if (!todayLog?.punchIn || !!todayLog?.punchOut) {
        this.toastService.show('Punch-out is only allowed once after today punch-in.', 'info');
        this.isPunchedIn = false;
        return false;
      }
      const location = await this.captureLocation(false);
      try {
        const attendanceDay = await firstValueFrom(this.attendanceService.punchOut());
        const punchOutAt = attendanceDay.punchOutUtc ? new Date(attendanceDay.punchOutUtc) : now;
        this.isPunchedIn = false;
        this.punchOutTime = this.isoTimeLabel(punchOutAt.toISOString());
        this.upsertPunchOutLog(punchOutAt, location);
        this.stopLiveLocationTracking();
        this.currentLocationLabel = 'Location tracking starts after punch in';
        if (location) {
          const today = this.attendanceLogs.find((item) => item.date === this.dateKey(now));
          this.lastPunchLocationLabel = this.formatLocation(location, today?.workMode ?? this.mode.value);
        }
        this.toastService.show('Punched Out successfully', 'info');
      } catch (error) {
        this.toastService.show(this.resolvePunchError(error, 'Unable to punch out.'), 'error');
        return false;
      }
    }
    this.persistState();
    this.persistLogs();
    this.monthlyWorkedDays = this.monthlyCompletedLogs.length;
    this.syncAuditLog(this.dateKey(now));
    await this.loadEmployeeAttendanceData();
    this.syncCalendarMonths();
    this.syncPremiumAnalytics();
    return true;
  }

  private setMaxSwipe(): void {
    const track = this.swipeTrack?.nativeElement;
    const knob = this.swipeKnob?.nativeElement;
    if (!track || !knob) return;
    this.maxSwipe = Math.max(track.clientWidth - knob.offsetWidth - this.knobGap * 2, 0);
    this.knobOffset = this.isDragging ? Math.min(this.knobOffset, this.maxSwipe) : this.restingOffset();
  }

  private restingOffset(): number {
    return this.isPunchedIn ? this.maxSwipe : 0;
  }

  private userId(): string {
    if (this.isAdminView) return this.viewedEmployeeId ?? 'default';
    return this.authService.getCurrentUserSnapshot()?.id || 'default';
  }

  private stateKey(): string {
    return `autovyn_punch_state_${this.userId()}`;
  }

  private logsKey(): string {
    return `autovyn_attendance_logs_${this.userId()}`;
  }

  private resolveViewMode(): void {
    const routeView = this.route.snapshot.data['view'];
    if (routeView === 'attendance' || routeView === 'time-track') {
      this.viewMode = routeView;
      return;
    }
    this.viewMode = this.route.snapshot.queryParamMap.get('tab') === 'daily' ? 'time-track' : 'attendance';
  }

  private resolveViewContext(): void {
    this.isAdminView = this.route.snapshot.data['adminView'] === true;
    if (!this.isAdminView) return;
    this.viewedEmployeeId = this.route.snapshot.paramMap.get('id') ?? this.route.parent?.snapshot.paramMap.get('id') ?? null;
  }

  private restoreState(): void {
    const raw = localStorage.getItem(this.stateKey());
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        isPunchedIn: boolean;
        punchInTime: string;
        punchOutTime: string;
        stateDate?: string;
      };
      const todayKey = this.dateKey(new Date());
      if (!parsed.stateDate || parsed.stateDate !== todayKey) {
        this.isPunchedIn = false;
        this.punchInTime = '--:--';
        this.punchOutTime = '--:--';
        return;
      }
      this.isPunchedIn = parsed.isPunchedIn;
      this.punchInTime = parsed.punchInTime;
      this.punchOutTime = parsed.punchOutTime;
    } catch {
      // Ignore malformed local state.
    }
  }

  private restoreLogs(): void {
    const raw = localStorage.getItem(this.logsKey());
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as AttendanceLog[];
      if (!Array.isArray(parsed)) return;
      this.attendanceLogs = parsed
        .filter((item) => !!item && typeof item.date === 'string')
        .map((item) => ({
          ...item,
          workMode: item.workMode ?? 'OFFICE',
          faceScanType: item.faceScanType ?? 'SIMULATED'
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-90);
      const lastPhoto = [...this.attendanceLogs].reverse().find((log) => !!log.punchInPhoto)?.punchInPhoto;
      this.facePreviewPhotoUrl = lastPhoto ?? '';
      this.monthlyWorkedDays = this.monthlyCompletedLogs.length;
      this.syncCalendarMonths();
      this.syncPremiumAnalytics();
    } catch {
      // Ignore malformed local state.
    }
  }

  private seedStaticMonthlyLogsIfEmpty(): void {
    if (this.attendanceLogs.length > 0) return;
    this.monthlyWorkedDays = 0;
  }

  private generateStaticMonthLogs(base: Date): AttendanceLog[] {
    const officeLat = 12.9716;
    const officeLng = 77.5946;
    const monthLogs: AttendanceLog[] = [];
    const year = base.getFullYear();
    const month = base.getMonth();
    const totalDays = this.daysInMonth(base);

    for (let day = 1; day <= totalDays; day += 1) {
      const currentDate = new Date(year, month, day);
      const weekDay = currentDate.getDay();
      if (weekDay === 0 || weekDay === 6 || day % 10 === 0) continue;

      const punchInMinute = 9 * 60 + 2 + ((day * 7) % 62);
      const workMinute = 8 * 60 + 12 + ((day * 11) % 96);
      const punchOutMinute = Math.min(punchInMinute + workMinute, 22 * 60 + 30);
      const punchInDate = new Date(year, month, day, Math.floor(punchInMinute / 60), punchInMinute % 60, 0, 0);
      const punchOutDate = new Date(
        year,
        month,
        day,
        Math.floor(punchOutMinute / 60),
        punchOutMinute % 60,
        0,
        0
      );
      const inLocation: PunchLocation = {
        lat: officeLat + ((day % 5) - 2) * 0.00035,
        lng: officeLng + ((day % 7) - 3) * 0.00028,
        accuracy: 9 + (day % 13),
        capturedAt: punchInDate.toISOString()
      };
      const outLocation: PunchLocation = {
        lat: officeLat + ((day % 6) - 3) * 0.00042,
        lng: officeLng + ((day % 4) - 2) * 0.00031,
        accuracy: 8 + (day % 12),
        capturedAt: punchOutDate.toISOString()
      };

      monthLogs.push({
        date: this.dateKey(currentDate),
        punchIn: punchInDate.toISOString(),
        punchOut: punchOutDate.toISOString(),
        workMode: day % 3 === 0 ? 'HOME' : 'OFFICE',
        workMinutes: this.minutesBetween(punchInDate.toISOString(), punchOutDate.toISOString()),
        lateByMinutes: Math.max(punchInMinute - this.punchInCutoffMinutes, 0),
        inLocation,
        outLocation,
        faceVerified: true,
        faceScanType: 'SIMULATED'
      });
    }

    return monthLogs;
  }

  private persistState(): void {
    if (this.isAdminView) return;
    localStorage.setItem(
      this.stateKey(),
      JSON.stringify({
        isPunchedIn: this.isPunchedIn,
        punchInTime: this.punchInTime,
        punchOutTime: this.punchOutTime,
        stateDate: this.dateKey(new Date())
      })
    );
  }

  private canPerformCurrentSwipeAction(): boolean {
    const today = this.attendanceLogs.find((item) => item.date === this.dateKey(new Date()));
    if (this.isPunchedIn) {
      return !!today?.punchIn && !today.punchOut;
    }
    return !today?.punchIn && !today?.punchOut;
  }

  private isAttendanceLockedForToday(): boolean {
    const today = this.attendanceLogs.find((item) => item.date === this.dateKey(new Date()));
    return !!today?.punchOut;
  }

  private persistLogs(): void {
    if (this.isAdminView) return;
    localStorage.setItem(this.logsKey(), JSON.stringify(this.attendanceLogs.slice(-90)));
  }

  private formatNow(): string {
    return new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  private lateByMinutes(date: Date): number {
    const cutoff = new Date(date);
    cutoff.setHours(9, 50, 0, 0);
    const diff = date.getTime() - cutoff.getTime();
    return Math.max(Math.floor(diff / 60000), 0);
  }

  private upsertPunchInLog(now: Date, location: PunchLocation, faceEvidence: FaceCaptureEvidence): void {
    const log = this.ensureTodayLog(now);
    log.punchIn = now.toISOString();
    log.punchOut = undefined;
    log.workMode = this.mode.value;
    log.workMinutes = 0;
    log.lateByMinutes = this.lateByMinutes(now);
    log.inLocation = location;
    log.outLocation = undefined;
    log.faceVerified = true;
    log.faceScanType = faceEvidence.scanType;
    log.punchInPhoto = faceEvidence.photoDataUrl;
  }

  private upsertPunchOutLog(now: Date, location: PunchLocation | null): void {
    const log = this.ensureTodayLog(now);
    if (!log.punchIn) {
      log.punchIn = now.toISOString();
      log.lateByMinutes = this.lateByMinutes(now);
    }
    log.workMode = log.workMode || this.mode.value;
    log.punchOut = now.toISOString();
    log.workMinutes = this.minutesBetween(log.punchIn, log.punchOut);
    if (location) {
      log.outLocation = location;
    }
  }

  private ensureTodayLog(now: Date): AttendanceLog {
    const dateKey = this.dateKey(now);
    let log = this.attendanceLogs.find((item) => item.date === dateKey);
    if (!log) {
      log = {
        date: dateKey,
        workMode: this.mode.value,
        workMinutes: 0,
        lateByMinutes: 0,
        faceVerified: false,
        faceScanType: 'SIMULATED'
      };
      this.attendanceLogs = [...this.attendanceLogs, log];
    }
    return log;
  }

  private dateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private minutesBetween(fromIso: string, toIso: string): number {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const diff = to.getTime() - from.getTime();
    if (Number.isNaN(diff) || diff <= 0) return 0;
    return Math.floor(diff / 60000);
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

  private formatMinuteOfDay(totalMinutes: number): string {
    const hours24 = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  private async captureLocation(required: boolean): Promise<PunchLocation | null> {
    if (!navigator.geolocation) {
      return required ? this.developmentLocationFallback() : null;
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: new Date().toISOString()
          }),
        () => resolve(required ? this.developmentLocationFallback() : null),
        { enableHighAccuracy: true, maximumAge: 0, timeout: required ? 9000 : 7000 }
      );
    });
  }

  private async captureFaceEvidence(): Promise<FaceCaptureEvidence> {
    const developmentFallback = this.developmentFaceFallback();
    if (developmentFallback && this.shouldBypassBrowserCameraCapture()) {
      return developmentFallback;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      if (developmentFallback) return developmentFallback;
      this.toastService.show('Camera access is not available on this browser.', 'error');
      return { verified: false, scanType: 'CAMERA_ONLY' };
    }

    const evidence = await this.captureFaceFromDialog();
    if (evidence.verified && evidence.photoDataUrl) {
      return evidence;
    }
    return developmentFallback ?? evidence;
  }

  async confirmFaceCapture(): Promise<void> {
    if (this.cameraCaptureBusy) return;
    const video = this.cameraPreview?.nativeElement;
    if (!video || !this.cameraStream) {
      this.resolveFaceCapture({ verified: false, scanType: 'CAMERA_ONLY' });
      return;
    }
    this.cameraCaptureBusy = true;
    const evidence = await this.extractFaceEvidence(video);
    this.cameraCaptureBusy = false;
    this.resolveFaceCapture(evidence);
  }

  cancelFaceCapture(): void {
    this.resolveFaceCapture({ verified: false, scanType: 'CAMERA_ONLY' });
  }

  private async captureFaceFromDialog(): Promise<FaceCaptureEvidence> {
    if (this.pendingFaceCaptureResolve) {
      this.resolveFaceCapture({ verified: false, scanType: 'CAMERA_ONLY' });
    }

    this.cameraCaptureOpen = true;
    this.cameraCaptureBusy = false;
    this.cameraCaptureError = 'Requesting camera permission...';
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      await this.bindCameraStream();
      this.cameraCaptureError = 'Capturing face automatically...';
      await this.delay(280);
      const video = this.cameraPreview?.nativeElement;
      if (!video) {
        this.closeCameraCapture();
        return { verified: false, scanType: 'CAMERA_ONLY' };
      }
      const evidence = await this.extractFaceEvidence(video);
      this.closeCameraCapture();
      return evidence;
    } catch {
      this.closeCameraCapture();
      return { verified: false, scanType: 'CAMERA_ONLY' };
    }
  }

  private async bindCameraStream(): Promise<void> {
    await this.delay(0);
    const video = this.cameraPreview?.nativeElement;
    if (!video || !this.cameraStream) {
      throw new Error('Camera preview is unavailable');
    }
    video.srcObject = this.cameraStream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    await video.play();
  }

  private async extractFaceEvidence(video: HTMLVideoElement): Promise<FaceCaptureEvidence> {
    const FaceDetectorApi = (window as Window & { FaceDetector?: FaceDetectorCtor }).FaceDetector;
    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    const scale = Math.min(1, 640 / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(2, Math.round(sourceWidth * scale));
    const height = Math.max(2, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return { verified: false, scanType: 'CAMERA_ONLY' };
    }
    context.drawImage(video, 0, 0, width, height);
    const photoDataUrl = canvas.toDataURL('image/jpeg', 0.82);

    if (!FaceDetectorApi) {
      return { verified: true, scanType: 'CAMERA_ONLY', photoDataUrl };
    }

    try {
      const detector = new FaceDetectorApi({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(canvas);
      if (faces.length > 0) {
        return { verified: true, scanType: 'FACE_DETECTOR', photoDataUrl };
      }

      if (!environment.production) {
        return { verified: true, scanType: 'CAMERA_ONLY', photoDataUrl };
      }

      return { verified: false, scanType: 'CAMERA_ONLY', photoDataUrl };
    } catch {
      if (!environment.production) {
        return { verified: true, scanType: 'CAMERA_ONLY', photoDataUrl };
      }

      return { verified: false, scanType: 'CAMERA_ONLY', photoDataUrl };
    }
  }

  private resolveFaceCapture(evidence: FaceCaptureEvidence): void {
    const resolve = this.pendingFaceCaptureResolve;
    this.pendingFaceCaptureResolve = null;
    this.closeCameraCapture();
    resolve?.(evidence);
  }

  private closeCameraCapture(): void {
    this.cameraCaptureOpen = false;
    this.cameraCaptureBusy = false;
    this.cameraCaptureError = '';
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
    const video = this.cameraPreview?.nativeElement;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  private ensureAuthenticatedSession(): boolean {
    if (this.authService.getSession()?.token) {
      return true;
    }

    this.toastService.show('Session expired. Please login again.', 'error');
    void this.router.navigateByUrl('/auth/login');
    return false;
  }

  private developmentLocationFallback(): PunchLocation | null {
    if (!this.canUseDevelopmentPunchFallback()) {
      return null;
    }

    this.toastService.show('Using simulated location for LAN development.', 'info');
    const anchor =
      this.mode.value === 'HOME'
        ? { lat: this.officeAnchor.lat + 0.018, lng: this.officeAnchor.lng + 0.021 }
        : this.officeAnchor;

    return {
      lat: anchor.lat,
      lng: anchor.lng,
      accuracy: 25,
      capturedAt: new Date().toISOString()
    };
  }

  private developmentFaceFallback(): FaceCaptureEvidence | null {
    if (!this.canUseDevelopmentPunchFallback()) {
      return null;
    }

    this.toastService.show('Using simulated camera verification for LAN development.', 'info');
    return {
      verified: true,
      scanType: 'SIMULATED',
      photoDataUrl: this.createDevelopmentFacePhotoDataUrl()
    };
  }

  private canUseDevelopmentPunchFallback(): boolean {
    return !environment.production && !globalThis.isSecureContext;
  }

  private shouldBypassBrowserCameraCapture(): boolean {
    return this.canUseDevelopmentPunchFallback();
  }

  private createDevelopmentFacePhotoDataUrl(): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
        <rect width="320" height="240" fill="#e8eefc"/>
        <circle cx="160" cy="92" r="42" fill="#7a8fb8"/>
        <rect x="92" y="148" width="136" height="54" rx="27" fill="#7a8fb8"/>
        <text x="160" y="222" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#2f3d5c">
          LAN DEV FACE CHECK
        </text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  private startLiveLocationTracking(): void {
    if (this.isAdminView) return;
    if (!navigator.geolocation || this.locationWatchId !== null) return;
    this.locationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const live: PunchLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString()
        };
        this.currentLocationLabel = this.formatLocation(live, this.mode.value);
      },
      () => {
        this.currentLocationLabel = 'Location permission denied';
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  private stopLiveLocationTracking(): void {
    if (this.locationWatchId === null || !navigator.geolocation) return;
    navigator.geolocation.clearWatch(this.locationWatchId);
    this.locationWatchId = null;
  }

  private refreshLocationSummaries(): void {
    this.currentLocationLabel = this.isPunchedIn ? 'Acquiring live location...' : 'Location tracking starts after punch in';
    const latest = [...this.attendanceLogs]
      .reverse()
      .find((log) => !!log.outLocation || !!log.inLocation);
    const location = latest?.outLocation || latest?.inLocation;
    if (location) {
      this.lastPunchLocationLabel = this.formatLocation(location, latest?.workMode ?? 'OFFICE');
      return;
    }
    this.lastPunchLocationLabel = 'No punch location captured yet';
  }

  private formatLocation(location: PunchLocation, mode: 'OFFICE' | 'HOME'): string {
    const locationType = this.locationTypeLabel(location, mode);
    return `${locationType} • ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} (±${Math.round(location.accuracy)}m)`;
  }

  scanTypeLabel(scanType: FaceScanType): string {
    if (scanType === 'FACE_DETECTOR') return 'Face Detector';
    if (scanType === 'CAMERA_ONLY') return 'Camera Only';
    return 'Simulated';
  }

  private locationTypeLabel(location: PunchLocation, mode: 'OFFICE' | 'HOME'): string {
    if (mode === 'HOME') return 'Home Zone';
    const km = this.distanceKm(location.lat, location.lng, this.officeAnchor.lat, this.officeAnchor.lng);
    return km <= this.officeRadiusKm ? 'Office Zone' : 'Remote Zone';
  }

  private distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const rad = (value: number) => (value * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  private syncAuditLogs(): void {
    if (this.isAdminView) return;
    this.attendanceLogs.forEach((log) => this.syncAuditLog(log.date));
  }

  private syncAuditLog(dateKey: string): void {
    if (this.isAdminView) return;
    const currentUser = this.authService.getCurrentUserSnapshot();
    if (!currentUser) return;
    const log = this.attendanceLogs.find((item) => item.date === dateKey);
    if (!log) return;

    this.punchAuditService.upsertFromAttendanceLog(currentUser.id, currentUser.name, {
      date: log.date,
      mode: log.workMode,
      punchIn: log.punchIn,
      punchOut: log.punchOut,
      workMinutes: log.workMinutes,
      lateByMinutes: log.lateByMinutes,
      inLocation: log.inLocation,
      outLocation: log.outLocation,
      faceVerified: log.faceVerified,
      faceScanType: log.faceScanType,
      punchInPhoto: log.punchInPhoto
    });
  }

  private loadOrganizationData(): void {
    this.subscriptions.add(
      this.authService.getUsers().subscribe((users: User[]) => {
        const employees = users.filter((user) => user.roles.includes('EMPLOYEE'));
        this.employeeUsers = employees;
        this.totalEmployees = employees.length;
        this.syncPremiumAnalytics();
      })
    );
  }

  private async loadEmployeeAttendanceData(): Promise<void> {
    if (this.isAdminView) return;

    const currentUser = this.authService.getCurrentUserSnapshot();
    if (!currentUser) return;

    try {
      const [days, auditLogs] = await Promise.all([
        firstValueFrom(this.attendanceService.getAttendance(currentUser.id)),
        firstValueFrom(
          this.punchAuditService.getAllLogs().pipe(map((logs) => logs.filter((log) => log.employeeId === currentUser.id)))
        )
      ]);

      this.attendanceLogs = this.mergeAttendanceLogs(days, auditLogs);
      this.monthlyWorkedDays = this.monthlyCompletedLogs.length;
      this.applyLatestAttendanceSnapshot();
      this.refreshLocationSummaries();
      this.syncCalendarMonths();
      this.syncPremiumAnalytics();
      this.persistLogs();

      if (this.viewMode === 'attendance') {
        this.setMaxSwipe();
      }

      if (this.isPunchedIn) {
        this.startLiveLocationTracking();
      } else {
        this.stopLiveLocationTracking();
      }
    } catch {
      // Keep the current local state if backend sync fails.
    }
  }

  private mergeAttendanceLogs(days: AttendanceDay[], auditLogs: PunchAuditLog[]): AttendanceLog[] {
    const auditMap = new Map(auditLogs.map((log) => [log.date, this.mapAuditLogToAttendance(log)]));
    const merged = new Map<string, AttendanceLog>();

    days.forEach((day) => {
      const log = this.mapAttendanceDayToLog(day, auditMap.get(day.date));
      if (log) {
        merged.set(day.date, log);
      }
    });

    auditMap.forEach((log, date) => {
      if (!merged.has(date)) {
        merged.set(date, log);
      }
    });

    return Array.from(merged.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-90);
  }

  private mapAttendanceDayToLog(day: AttendanceDay, auditLog?: AttendanceLog): AttendanceLog | null {
    const punchIn = day.punchInUtc ?? auditLog?.punchIn;
    const punchOut = day.punchOutUtc ?? auditLog?.punchOut;

    if (!punchIn && !punchOut && !auditLog) {
      return null;
    }

    return {
      date: day.date,
      punchIn,
      punchOut,
      workMode: auditLog?.workMode ?? 'OFFICE',
      workMinutes:
        day.workingMinutes ??
        auditLog?.workMinutes ??
        (punchIn && punchOut ? this.minutesBetween(punchIn, punchOut) : 0),
      lateByMinutes: auditLog?.lateByMinutes ?? (punchIn ? this.lateByMinutes(new Date(punchIn)) : 0),
      inLocation: auditLog?.inLocation,
      outLocation: auditLog?.outLocation,
      faceVerified: auditLog?.faceVerified ?? false,
      faceScanType: auditLog?.faceScanType ?? 'SIMULATED',
      punchInPhoto: auditLog?.punchInPhoto
    };
  }

  private resolvePunchError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }
    return fallback;
  }

  private loadLeaveData(): void {
    const employeeId = this.isAdminView ? this.viewedEmployeeId : this.authService.getCurrentUserSnapshot()?.id;
    if (!employeeId) return;
    this.subscriptions.add(
      this.leaveService.getByEmployee(employeeId).subscribe((requests) => {
        this.approvedLeaveDates = new Set(
          requests
            .filter((request) => request.status === 'APPROVED')
            .flatMap((request) => request.dates)
        );
        this.monthlyLeaveDays = this.countLeaveDaysByMonth(this.now);
        this.syncCalendarMonths();
      })
    );
  }

  private initializeVsCodeWorklogSummary(): void {
    this.loadVsCodeWorklogSummary();
    this.initializeWorklogLiveStream();
    this.vscodeRefreshHandle = setInterval(() => {
      this.loadVsCodeWorklogSummary();
    }, this.vscodeRefreshIntervalMs);
  }

  private loadVsCodeWorklogSummary(): void {
    if (this.vscodeLoading) return;

    const now = new Date();
    const from = this.dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const to = this.dateKey(now);
    const targetUserId = this.isAdminView ? this.viewedEmployeeId ?? undefined : undefined;

    this.vscodeLoading = true;
    this.subscriptions.add(
      this.worklogService.getSummary(from, to, targetUserId).subscribe((summary) => {
        this.vscodeSummary = summary;
        this.vscodePrimarySummary = summary?.employees[0] ?? null;
        this.vscodeLoading = false;
      })
    );
  }

  private initializeWorklogLiveStream(): void {
    if (this.isAdminView || typeof window === 'undefined') {
      return;
    }

    if (this.worklogStreamReconnectHandle) {
      clearTimeout(this.worklogStreamReconnectHandle);
      this.worklogStreamReconnectHandle = null;
    }

    if (this.worklogStreamAbortController) {
      this.worklogStreamAbortController.abort();
    }

    const controller = new AbortController();
    this.worklogStreamAbortController = controller;

    void this.worklogService
      .connectLiveStream(() => {
        this.loadVsCodeWorklogSummary();
      }, controller.signal)
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }

        this.worklogStreamReconnectHandle = setTimeout(() => {
          this.worklogStreamReconnectHandle = null;
          this.initializeWorklogLiveStream();
        }, 2000);
      });
  }

  private formatTrackerSource(source: string | null | undefined): string {
    const normalized = source?.trim().toLowerCase();
    if (!normalized) {
      return 'Work tracker';
    }

    if (normalized === 'vscode' || normalized === 'vscode-extension') {
      return 'VS Code extension';
    }

    if (normalized === 'desktop-agent' || normalized === 'desktop-app' || normalized === 'desktop-tracker') {
      return 'Desktop tracker app';
    }

    if (normalized === 'browser' || normalized === 'web') {
      return 'Browser tracker';
    }

    return normalized
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private resolveDesktopAgentDownloadUrl(): URL | null {
    const value = String(environment.desktopAgentDownloadUrl || '').trim();
    if (!value) {
      return null;
    }

    try {
      return new URL(value, window.location.origin);
    } catch {
      return null;
    }
  }

  private tryClipboardCopy(value: string): boolean {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  }

  private organizationModeCounts(): Record<'WFO' | 'WFH' | 'HYBRID', number> {
    const counts: Record<'WFO' | 'WFH' | 'HYBRID', number> = { WFO: 0, WFH: 0, HYBRID: 0 };
    this.employeeUsers.forEach((user) => {
      if (user.workMode === 'WFH') {
        counts.WFH += 1;
      } else if (user.workMode === 'HYBRID') {
        counts.HYBRID += 1;
      } else {
        counts.WFO += 1;
      }
    });
    return counts;
  }

  private createBarStat(label: string, value: number, total: number, color: string, icon: string): AnalyticsBar {
    const percent = total > 0 ? Math.round((value / total) * 100) : 0;
    return { label, value, percent, color, icon };
  }

  private syncCalendarMonths(): void {
    const previous = this.activeCalendarMonthKey;
    const keys = new Set<string>([this.monthKey(this.now)]);
    this.attendanceLogs.forEach((log) => keys.add(log.date.slice(0, 7)));
    this.approvedLeaveDates.forEach((date) => keys.add(date.slice(0, 7)));
    this.calendarMonthKeys = Array.from(keys).sort();
    const existing = this.calendarMonthKeys.indexOf(previous);
    this.calendarCursor = existing > -1 ? existing : Math.max(this.calendarMonthKeys.length - 1, 0);
    if (!this.selectedCalendarDate || !this.calendarDays.some((day) => day.date === this.selectedCalendarDate)) {
      this.selectedCalendarDate = this.calendarDays[0]?.date ?? null;
    }
  }

  private resolveCalendarStatus(
    dateKey: string,
    date: Date,
    today: Date,
    log?: AttendanceLog
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

  private loadAdminViewLogs(): void {
    if (!this.viewedEmployeeId) return;
    this.subscriptions.add(
      combineLatest([this.authService.getUsers(), this.punchAuditService.getAllLogs()])
        .pipe(
          map(([users, logs]) => {
            const selectedUser = users.find((item) => item.id === this.viewedEmployeeId);
            const selectedLogs = logs
              .filter((item) => item.employeeId === this.viewedEmployeeId)
              .map((item) => this.mapAuditLogToAttendance(item))
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(-90);
            return { selectedUser, selectedLogs };
          })
        )
        .subscribe(({ selectedUser, selectedLogs }) => {
          this.viewedEmployeeName = selectedUser?.name ?? this.viewedEmployeeId ?? 'Employee';
          this.attendanceLogs = selectedLogs;
          this.monthlyWorkedDays = this.monthlyCompletedLogs.length;
          this.applyLatestAttendanceSnapshot();
          this.refreshLocationSummaries();
          this.syncCalendarMonths();
          this.syncPremiumAnalytics();
        })
    );
  }

  private mapAuditLogToAttendance(log: PunchAuditLog): AttendanceLog {
    return {
      date: log.date,
      punchIn: log.punchIn,
      punchOut: log.punchOut,
      workMode: log.mode,
      workMinutes: log.workMinutes,
      lateByMinutes: log.lateByMinutes,
      inLocation: log.inLocation
        ? {
            lat: log.inLocation.lat,
            lng: log.inLocation.lng,
            accuracy: log.inLocation.accuracy,
            capturedAt: log.inLocation.capturedAt
          }
        : undefined,
      outLocation: log.outLocation
        ? {
            lat: log.outLocation.lat,
            lng: log.outLocation.lng,
            accuracy: log.outLocation.accuracy,
            capturedAt: log.outLocation.capturedAt
          }
        : undefined,
      faceVerified: log.faceVerified,
      faceScanType: log.faceScanType,
      punchInPhoto: log.punchInPhoto
    };
  }

  private applyLatestAttendanceSnapshot(): void {
    const todayLog = this.getTodayAttendanceLog();
    if (!todayLog) {
      this.resetTodayAttendanceSnapshot();
      return;
    }

    this.punchInTime = todayLog.punchIn ? this.isoTimeLabel(todayLog.punchIn) : '--:--';
    this.punchOutTime = todayLog.punchOut ? this.isoTimeLabel(todayLog.punchOut) : '--:--';
    this.faceCheckStatus = todayLog.faceVerified ? `Verified (${this.scanTypeLabel(todayLog.faceScanType)})` : 'Face not verified today';
    this.facePreviewPhotoUrl = todayLog.punchInPhoto ?? '';
    this.isPunchedIn = !!todayLog.punchIn && !todayLog.punchOut;
    this.currentLocationLabel =
      this.isPunchedIn && todayLog.inLocation
        ? this.formatLocation(todayLog.inLocation, todayLog.workMode)
        : 'Location tracking starts after punch in';
  }

  private getTodayAttendanceLog(): AttendanceLog | null {
    const todayKey = this.dateKey(new Date());
    return this.attendanceLogs.find((item) => item.date === todayKey) ?? null;
  }

  private resetTodayAttendanceSnapshot(): void {
    this.punchInTime = '--:--';
    this.punchOutTime = '--:--';
    this.faceCheckStatus = 'Face not verified today';
    this.facePreviewPhotoUrl = '';
    this.currentLocationLabel = 'Location tracking starts after punch in';
    this.isPunchedIn = false;
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

  private syncPremiumAnalytics(): void {
    const logs = this.productivityLogs;
    this.aiAnalyticsService.setAttendanceLogs(logs);
    this.focusAnalyticsService.setAttendanceLogs(logs);

    const ai = this.aiSnapshot();
    const workStreakDays = this.currentWorkStreakDays(logs);
    const estimatedScore = Math.round(this.focusSnapshot().focusScore * 0.6 + ai.efficiency * 0.4);
    this.currentLeaderboardRank = this.badgeEngineService.updateCurrentUserRank(estimatedScore);

    this.badgeEngineService.updateBadges({
      aiEfficiency: ai.efficiency,
      workStreakDays,
      punctualityRate: this.punctualityRate,
      productivityBoost: ai.productivityBoostPercent,
      leaderboardRank: this.currentLeaderboardRank
    });

    this.insightsEngineService.update({
      logs,
      aiEfficiency: ai.efficiency,
      aiBoostPercent: ai.productivityBoostPercent,
      focusScore: this.focusSnapshot().focusScore,
      leaderboardRank: this.currentLeaderboardRank
    });
  }

  private currentWorkStreakDays(logs: ProductivityAttendanceLog[]): number {
    const sortedDates = logs.map((log) => log.date).sort((a, b) => a.localeCompare(b));
    if (!sortedDates.length) return 0;

    let streak = 1;
    let best = 1;

    for (let index = 1; index < sortedDates.length; index += 1) {
      const prev = new Date(sortedDates[index - 1] ?? '');
      const curr = new Date(sortedDates[index] ?? '');
      if (Number.isNaN(prev.getTime()) || Number.isNaN(curr.getTime())) continue;
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diffDays === 1) {
        streak += 1;
        best = Math.max(best, streak);
      } else {
        streak = 1;
      }
    }

    return best;
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

  private daysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
