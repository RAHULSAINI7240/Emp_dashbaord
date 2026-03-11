import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { WorkStatusService } from '../realtime/work-status.service';
import { FocusSnapshot, ProductivityAttendanceLog } from './analytics.models';

@Injectable({ providedIn: 'root' })
export class FocusAnalyticsService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly logsState = signal<ProductivityAttendanceLog[]>([]);
  private readonly idleSeconds = signal(0);
  private readonly activeSeconds = signal(1);
  private readonly simulationTick = signal(0);

  readonly snapshot = computed<FocusSnapshot>(() => {
    const logs = this.logsState();
    const streakMinutes = this.longestSession(logs);
    const contextSwitches = this.contextSwitchCount(logs);

    const totalTrackedSeconds = this.activeSeconds() + this.idleSeconds();
    const liveIdlePercent = Math.round((this.idleSeconds() / Math.max(totalTrackedSeconds, 1)) * 100);

    const historicalIdlePercent = logs.length
      ? Math.round(
          (logs.reduce((sum, log) => sum + Math.min(Math.max(log.lateByMinutes, 0), 60), 0) / (logs.length * 60)) * 100
        )
      : 12;

    const distractionPercent = Math.max(
      4,
      Math.min(58, Math.round(historicalIdlePercent * 0.65 + liveIdlePercent * 0.35 + Math.sin(this.simulationTick()) * 2))
    );

    const longestSessionScore = Math.min(100, Math.round((streakMinutes / (8.5 * 60)) * 100));
    const lowContextSwitchScore = Math.max(0, 100 - contextSwitches * 7);
    const lowIdleScore = Math.max(0, 100 - distractionPercent);

    const focusScore = Math.round(longestSessionScore * 0.4 + lowContextSwitchScore * 0.3 + lowIdleScore * 0.3);
    const weeklyFocusScores = this.weeklyTrend(logs, focusScore);
    const trendDelta = weeklyFocusScores[weeklyFocusScores.length - 1] - weeklyFocusScores[0];

    return {
      focusScore,
      longestContinuousSessionMinutes: streakMinutes,
      contextSwitches,
      distractionPercent,
      trendDelta,
      weeklyFocusScores
    };
  });

  constructor(private readonly workStatusService: WorkStatusService) {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.simulationTick.update((value) => value + 0.2);
        if (this.workStatusService.status() === 'IDLE') {
          this.idleSeconds.update((value) => value + 1);
          return;
        }
        if (this.workStatusService.status() === 'ACTIVE') {
          this.activeSeconds.update((value) => value + 1);
        }
      });
  }

  setAttendanceLogs(logs: ProductivityAttendanceLog[]): void {
    this.logsState.set([...logs]);
  }

  private longestSession(logs: ProductivityAttendanceLog[]): number {
    if (!logs.length) return 0;
    return Math.max(...logs.map((log) => log.workMinutes));
  }

  private contextSwitchCount(logs: ProductivityAttendanceLog[]): number {
    if (!logs.length) return 0;
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    let switches = 0;
    let previousMode = sorted[0]?.workMode;

    for (let index = 1; index < sorted.length; index += 1) {
      const currentMode = sorted[index]?.workMode;
      if (currentMode && previousMode && currentMode !== previousMode) {
        switches += 1;
      }
      previousMode = currentMode;
    }

    const deepWorkBreaks = sorted.filter((log) => log.workMinutes < 5 * 60).length;
    return switches + deepWorkBreaks;
  }

  private weeklyTrend(logs: ProductivityAttendanceLog[], fallback: number): number[] {
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    const recent = sorted.slice(-7);

    if (!recent.length) {
      return Array.from({ length: 7 }).map((_, index) => Math.max(42, Math.min(96, fallback - 4 + index * 1.2)));
    }

    return recent.map((log, index) => {
      const sessionScore = Math.min(100, (log.workMinutes / (8.5 * 60)) * 100);
      const punctualityScore = log.lateByMinutes > 0 ? Math.max(40, 92 - log.lateByMinutes) : 94;
      const blended = Math.round(sessionScore * 0.65 + punctualityScore * 0.35 + Math.sin(index) * 2);
      return Math.max(35, Math.min(99, blended));
    });
  }
}
