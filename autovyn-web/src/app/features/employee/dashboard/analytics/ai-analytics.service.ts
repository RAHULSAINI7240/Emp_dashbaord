import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { AiEfficiencySnapshot, KpiTrendMetric, ProductivityAttendanceLog } from './analytics.models';

@Injectable({ providedIn: 'root' })
export class AiAnalyticsService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly logsState = signal<ProductivityAttendanceLog[]>([]);
  private readonly tick = signal(0);

  readonly snapshot = computed<AiEfficiencySnapshot>(() => {
    const logs = this.logsState();
    const totalDays = Math.max(logs.length, 1);
    const lateDays = logs.filter((item) => item.lateByMinutes > 0).length;
    const completedRatio = Math.min(logs.length / 22, 1);

    const dynamicAccepted = Math.round(48 + completedRatio * 22 + Math.sin(this.tick() / 2) * 4);
    const dynamicRejected = Math.round(13 + lateDays * 0.4 + Math.cos(this.tick() / 2.8) * 2);

    const acceptedCount = Math.max(dynamicAccepted, 1);
    const rejectedCount = Math.max(dynamicRejected, 0);
    const totalSuggestions = Math.max(acceptedCount + rejectedCount, 1);

    const acceptedPercent = Math.round((acceptedCount / totalSuggestions) * 100);
    const rejectedPercent = 100 - acceptedPercent;
    const efficiency = acceptedPercent;

    const baselineLastWeek = 67;
    const efficiencyDelta = efficiency - baselineLastWeek;

    const timeSavedMinutes = acceptedCount * 9;
    const estimatedTimeSavedHours = Number((timeSavedMinutes / 60).toFixed(1));

    const aiUsageRate = Math.max(35, Math.min(96, Math.round(52 + completedRatio * 38 - lateDays * 0.8)));
    const productivityBoostPercent = Math.max(
      8,
      Math.min(28, Math.round(efficiency * 0.17 + aiUsageRate * 0.09 - rejectedPercent * 0.04))
    );

    const weeklyEfficiency = this.buildWeeklyEfficiency(efficiency);

    return {
      acceptedCount,
      rejectedCount,
      acceptedPercent,
      rejectedPercent,
      efficiency,
      efficiencyDelta,
      estimatedTimeSavedHours,
      productivityBoostPercent,
      aiUsageRate,
      insightMessage: `AI improves your coding speed by ${productivityBoostPercent}%`,
      weeklyEfficiency
    };
  });

  readonly kpiTrends = computed<KpiTrendMetric[]>(() => {
    const snap = this.snapshot();
    const logs = this.logsState();
    const targetMinutes = 8.5 * 60;
    const compliantDays = logs.filter((log) => log.workMinutes >= targetMinutes && log.lateByMinutes === 0).length;
    const compliance = logs.length ? Math.round((compliantDays / logs.length) * 100) : 0;

    const weekly = this.sliceCurrentAndPreviousWeek(logs);
    const weekCompliance = this.complianceFor(weekly.current);
    const lastWeekCompliance = this.complianceFor(weekly.previous);

    const avgHoursCurrent = this.averageHours(weekly.current);
    const avgHoursLast = this.averageHours(weekly.previous);

    return [
      {
        id: 'compliance',
        label: 'Compliance',
        icon: 'verified',
        value: compliance,
        suffix: '%',
        changePercent: this.changeVsLastWeek(weekCompliance, lastWeekCompliance)
      },
      {
        id: 'ai-usage',
        label: 'AI Usage',
        icon: 'smart_toy',
        value: snap.aiUsageRate,
        suffix: '%',
        changePercent: snap.efficiencyDelta
      },
      {
        id: 'time-saved',
        label: 'Time Saved',
        icon: 'timer',
        value: snap.estimatedTimeSavedHours,
        suffix: 'h',
        decimals: 1,
        changePercent: Math.max(0, Math.round(snap.estimatedTimeSavedHours - 6))
      },
      {
        id: 'avg-hours',
        label: 'Avg Work Hours',
        icon: 'monitoring',
        value: avgHoursCurrent,
        suffix: 'h',
        decimals: 1,
        changePercent: this.changeVsLastWeek(avgHoursCurrent, avgHoursLast)
      }
    ];
  });

  constructor() {
    interval(6000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.tick.update((value) => value + 1);
      });
  }

  setAttendanceLogs(logs: ProductivityAttendanceLog[]): void {
    this.logsState.set([...logs]);
  }

  private buildWeeklyEfficiency(base: number): number[] {
    return Array.from({ length: 7 }).map((_, index) => {
      const wobble = Math.sin((this.tick() + index) / 2.3) * 4;
      return Math.max(45, Math.min(98, Math.round(base - 6 + index * 0.8 + wobble)));
    });
  }

  private sliceCurrentAndPreviousWeek(logs: ProductivityAttendanceLog[]): {
    current: ProductivityAttendanceLog[];
    previous: ProductivityAttendanceLog[];
  } {
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    const current = sorted.slice(-7);
    const previous = sorted.slice(-14, -7);
    return { current, previous };
  }

  private complianceFor(logs: ProductivityAttendanceLog[]): number {
    if (!logs.length) return 0;
    const targetMinutes = 8.5 * 60;
    const compliantDays = logs.filter((log) => log.workMinutes >= targetMinutes && log.lateByMinutes === 0).length;
    return Math.round((compliantDays / logs.length) * 100);
  }

  private averageHours(logs: ProductivityAttendanceLog[]): number {
    if (!logs.length) return 0;
    const minutes = logs.reduce((sum, item) => sum + item.workMinutes, 0);
    return Number((minutes / logs.length / 60).toFixed(1));
  }

  private changeVsLastWeek(current: number, previous: number): number {
    if (previous === 0) return current === 0 ? 0 : Math.round(current);
    return Math.round(((current - previous) / previous) * 100);
  }
}
