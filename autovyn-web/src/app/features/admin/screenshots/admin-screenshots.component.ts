import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { NgFor, NgIf, DatePipe, SlicePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ScreenshotService, ScreenshotEntry } from '../../../core/services/screenshot.service';
import { User } from '../../../shared/models/user.model';

@Component({
  selector: 'app-admin-screenshots',
  imports: [NgFor, NgIf, DatePipe, SlicePipe, MatIconModule],
  templateUrl: './admin-screenshots.component.html',
  styleUrls: ['./admin-screenshots.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminScreenshotsComponent implements OnDestroy {
  employees: User[] = [];
  selectedEmployee: User | null = null;
  screenshots: ScreenshotEntry[] = [];
  loading = false;
  previewUrl: string | null = null;

  private subscription: Subscription | null = null;
  private streamAbortController: AbortController | null = null;
  private streamReconnectHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly authService: AuthService,
    private readonly screenshotService: ScreenshotService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.authService.getUsers().subscribe((users) => {
      this.employees = users.filter((u) => !u.roles.includes('ADMIN'));
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.disconnectStream();
  }

  get todayDate(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  selectEmployee(user: User): void {
    this.selectedEmployee = user;
    this.screenshots = [];
    this.loading = true;
    this.cdr.markForCheck();

    this.subscription?.unsubscribe();
    this.disconnectStream();

    this.subscription = this.screenshotService
      .getByUserAndDate(user.id, this.todayDate)
      .subscribe((items) => {
        this.screenshots = items;
        this.loading = false;
        this.cdr.markForCheck();
        this.connectLiveStream();
      });
  }

  openPreview(url: string): void {
    this.previewUrl = url;
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
        this.todayDate,
        (items) => {
          const existingIds = new Set(this.screenshots.map((s) => s.id));
          const newItems = items.filter((item) => !existingIds.has(item.id));
          if (newItems.length > 0) {
            this.screenshots = [...newItems, ...this.screenshots];
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
}
