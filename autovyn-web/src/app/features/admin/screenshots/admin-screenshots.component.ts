import { AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { NgFor, NgIf, DatePipe, SlicePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, combineLatest } from 'rxjs';
import { AgentLiveStatus, AgentStatusService } from '../../../core/services/agent-status.service';
import { AuthService } from '../../../core/services/auth.service';
import { ScreenshotService, ScreenshotEntry } from '../../../core/services/screenshot.service';
import { User } from '../../../shared/models/user.model';

interface MonitoringEmployee extends User {
  agentActive: boolean;
  agentLiveStatus: AgentLiveStatus;
}

@Component({
  selector: 'app-admin-screenshots',
  imports: [NgFor, NgIf, DatePipe, SlicePipe, MatIconModule],
  templateUrl: './admin-screenshots.component.html',
  styleUrls: ['./admin-screenshots.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminScreenshotsComponent implements OnDestroy, AfterViewChecked {
  readonly recentWindowDays = 2;
  employees: MonitoringEmployee[] = [];
  selectedEmployee: MonitoringEmployee | null = null;
  screenshots: ScreenshotEntry[] = [];
  loading = false;
  previewUrl: string | null = null;

  @ViewChild('previewBackdrop') previewBackdrop?: ElementRef<HTMLElement>;
  private needsFocus = false;

  private readonly rosterSubscription = new Subscription();
  private subscription: Subscription | null = null;
  private streamAbortController: AbortController | null = null;
  private streamReconnectHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly agentStatusService: AgentStatusService,
    private readonly authService: AuthService,
    private readonly screenshotService: ScreenshotService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.rosterSubscription.add(
      combineLatest([this.authService.getUsers(), this.agentStatusService.getTeamStatusMap()]).subscribe(([users, statusMap]) => {
        this.employees = users
          .filter((u) => !u.roles.includes('ADMIN'))
          .map((user) => this.decorateEmployee(user, statusMap));

        if (this.selectedEmployee) {
          this.selectedEmployee =
            this.employees.find((employee) => employee.id === this.selectedEmployee?.id) ?? this.selectedEmployee;
        }

        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.rosterSubscription.unsubscribe();
    this.subscription?.unsubscribe();
    this.disconnectStream();
  }

  selectEmployee(user: MonitoringEmployee): void {
    this.selectedEmployee = user;
    this.screenshots = [];
    this.loading = true;
    this.cdr.markForCheck();

    this.subscription?.unsubscribe();
    this.disconnectStream();

    this.subscription = this.screenshotService
      .getRecentByUser(user.id, this.recentWindowDays)
      .subscribe((items) => {
        this.screenshots = this.sortScreenshots(items);
        this.loading = false;
        this.cdr.markForCheck();
        this.connectLiveStream();
      });
  }

  ngAfterViewChecked(): void {
    if (this.needsFocus && this.previewBackdrop) {
      this.previewBackdrop.nativeElement.focus();
      this.needsFocus = false;
    }
  }

  openPreview(url: string): void {
    this.previewUrl = url;
    this.needsFocus = true;
    this.cdr.markForCheck();
  }

  closePreview(): void {
    this.previewUrl = null;
    this.cdr.markForCheck();
  }

  goBack(): void {
    this.selectedEmployee = null;
    this.screenshots = [];
    this.disconnectStream();
    this.cdr.markForCheck();
  }

  private connectLiveStream(): void {
    if (!this.selectedEmployee) return;

    this.disconnectStream();
    const controller = new AbortController();
    this.streamAbortController = controller;

    void this.screenshotService
      .connectStream(
        this.selectedEmployee.id,
        this.recentWindowDays,
        (items) => {
          const existingIds = new Set(this.screenshots.map((s) => s.id));
          const newItems = items.filter((item) => !existingIds.has(item.id));
          if (newItems.length > 0) {
            this.screenshots = this.sortScreenshots([...newItems, ...this.screenshots]);
            this.cdr.markForCheck();
          }
        },
        controller.signal
      )
      .catch(() => {
        if (controller.signal.aborted) return;
        this.streamReconnectHandle = setTimeout(() => {
          this.streamReconnectHandle = null;
          this.connectLiveStream();
        }, 5000);
      });
  }

  private disconnectStream(): void {
    if (this.streamReconnectHandle) {
      clearTimeout(this.streamReconnectHandle);
      this.streamReconnectHandle = null;
    }
    if (this.streamAbortController) {
      this.streamAbortController.abort();
      this.streamAbortController = null;
    }
  }

  private sortScreenshots(items: ScreenshotEntry[]): ScreenshotEntry[] {
    return [...items].sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
  }

  private decorateEmployee(user: User, statusMap: Map<string, AgentLiveStatus>): MonitoringEmployee {
    const agentLiveStatus = statusMap.get(user.id) ?? 'OFFLINE';
    return {
      ...user,
      agentLiveStatus,
      agentActive: this.agentStatusService.isAgentActive(agentLiveStatus)
    };
  }
}
