import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, interval, merge } from 'rxjs';

export type LiveWorkStatus = 'ACTIVE' | 'IDLE' | 'OFFLINE';

interface PersistedWorkStatus {
  sessionStartMs: number;
  lastActivityMs: number;
}

@Injectable({ providedIn: 'root' })
export class WorkStatusService {
  private readonly idleThresholdMs = 5 * 60 * 1000;
  private readonly storageKey = 'autovyn_work_status_v1';
  private readonly destroyRef = inject(DestroyRef);

  private readonly sessionStartMs = signal(Date.now());
  private readonly lastActivityMs = signal(Date.now());
  private readonly nowMs = signal(Date.now());
  private readonly currentStatus = signal<LiveWorkStatus>('ACTIVE');

  readonly status = computed(() => this.currentStatus());
  readonly sessionDurationSeconds = computed(() => Math.floor((this.nowMs() - this.sessionStartMs()) / 1000));
  readonly sessionDurationLabel = computed(() => this.toDuration(this.sessionDurationSeconds()));
  readonly lastActivityLabel = computed(() =>
    new Date(this.lastActivityMs()).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  );
  readonly tooltip = computed(
    () =>
      `Status: ${this.status()} | Session: ${this.sessionDurationLabel()} | Last activity: ${this.lastActivityLabel()}`
  );

  constructor() {
    this.restore();
    this.bindTracking();
    this.recalculateStatus();
  }

  markActivity(): void {
    const now = Date.now();
    this.lastActivityMs.set(now);
    this.nowMs.set(now);
    this.recalculateStatus();
    this.persist();
  }

  private bindTracking(): void {
    if (typeof window === 'undefined') return;

    const activity$ = merge(
      fromEvent(window, 'mousemove'),
      fromEvent(window, 'keydown'),
      fromEvent(window, 'click'),
      fromEvent(window, 'touchstart'),
      fromEvent(window, 'scroll')
    );

    activity$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.markActivity();
    });

    merge(fromEvent(window, 'online'), fromEvent(window, 'offline'))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.nowMs.set(Date.now());
        this.recalculateStatus();
      });

    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.nowMs.set(Date.now());
        this.recalculateStatus();
      });
  }

  private recalculateStatus(): void {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.currentStatus.set('OFFLINE');
      return;
    }

    const inactiveForMs = this.nowMs() - this.lastActivityMs();
    this.currentStatus.set(inactiveForMs >= this.idleThresholdMs ? 'IDLE' : 'ACTIVE');
  }

  private restore(): void {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PersistedWorkStatus;
      if (typeof parsed.sessionStartMs === 'number' && typeof parsed.lastActivityMs === 'number') {
        this.sessionStartMs.set(parsed.sessionStartMs);
        this.lastActivityMs.set(parsed.lastActivityMs);
      }
    } catch {
      // Ignore malformed local storage payload.
    }
  }

  private persist(): void {
    localStorage.setItem(
      this.storageKey,
      JSON.stringify({
        sessionStartMs: this.sessionStartMs(),
        lastActivityMs: this.lastActivityMs()
      } satisfies PersistedWorkStatus)
    );
  }

  private toDuration(totalSeconds: number): string {
    const safe = Math.max(totalSeconds, 0);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}
