import { Injectable, computed, signal } from '@angular/core';
import { InsightCard, PredictionSnapshot, ProductivityAttendanceLog } from '../analytics/analytics.models';

interface InsightInput {
  logs: ProductivityAttendanceLog[];
  aiEfficiency: number;
  aiBoostPercent: number;
  focusScore: number;
  leaderboardRank: number;
}

@Injectable({ providedIn: 'root' })
export class InsightsEngineService {
  private readonly inputState = signal<InsightInput>({
    logs: [],
    aiEfficiency: 0,
    aiBoostPercent: 0,
    focusScore: 0,
    leaderboardRank: 1
  });

  readonly loading = signal(true);

  readonly insights = computed<InsightCard[]>(() => {
    const input = this.inputState();
    const logs = input.logs;
    const hourBand = this.bestHourBand(logs);
    const bestDay = this.bestWeekday(logs);

    return [
      {
        id: 'peak-window',
        title: 'Peak Performance Window',
        message: `You are most productive between ${hourBand}.`,
        tone: 'positive'
      },
      {
        id: 'ai-boost',
        title: 'AI Impact',
        message: `AI usage boosts your performance by ${input.aiBoostPercent}%.`,
        tone: 'positive'
      },
      {
        id: 'best-day',
        title: 'Best Day Insight',
        message: `You work ${Math.max(8, Math.min(30, input.aiEfficiency - 55))}% better on ${bestDay}s.`,
        tone: 'neutral'
      },
      {
        id: 'focus-window',
        title: 'Focus Alert',
        message: `Your focus drops after 4 PM. Schedule heavy tasks before then to retain momentum.`,
        tone: 'caution'
      }
    ];
  });

  readonly prediction = computed<PredictionSnapshot>(() => {
    const input = this.inputState();
    const currentWeekHours = this.currentWeekHours(input.logs);
    const daysCompleted = this.completedWorkdaysThisWeek(input.logs);

    const projectedHours = Number(((currentWeekHours / Math.max(daysCompleted, 1)) * 5).toFixed(1));
    const expectedProductivityScore = Math.round(input.focusScore * 0.58 + input.aiEfficiency * 0.42);
    const paceMessage = `At this pace, you will complete ${projectedHours}h this week.`;

    return {
      projectedHours,
      expectedProductivityScore,
      predictedRank: Math.max(1, input.leaderboardRank),
      paceMessage
    };
  });

  update(input: InsightInput): void {
    this.loading.set(true);
    this.inputState.set(input);

    // Simulate backend analytics latency so skeleton loaders are visible but brief.
    setTimeout(() => this.loading.set(false), 650);
  }

  private bestHourBand(logs: ProductivityAttendanceLog[]): string {
    if (!logs.length) return '10 AM - 1 PM';

    const hours = logs
      .map((log) => (log.punchIn ? new Date(log.punchIn).getHours() : 10))
      .filter((hour) => !Number.isNaN(hour));

    const average = Math.round(hours.reduce((sum, hour) => sum + hour, 0) / Math.max(hours.length, 1));

    if (average < 10) return '9 AM - 12 PM';
    if (average <= 12) return '10 AM - 1 PM';
    if (average <= 14) return '11 AM - 2 PM';
    return '1 PM - 4 PM';
  }

  private bestWeekday(logs: ProductivityAttendanceLog[]): string {
    if (!logs.length) return 'Tuesday';

    const map = new Map<string, { total: number; count: number }>();
    logs.forEach((log) => {
      const date = new Date(log.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      const stat = map.get(dayName) ?? { total: 0, count: 0 };
      stat.total += log.workMinutes;
      stat.count += 1;
      map.set(dayName, stat);
    });

    let winner = 'Tuesday';
    let bestAvg = 0;
    map.forEach((value, day) => {
      const avg = value.total / Math.max(value.count, 1);
      if (avg > bestAvg) {
        bestAvg = avg;
        winner = day;
      }
    });

    return winner;
  }

  private currentWeekHours(logs: ProductivityAttendanceLog[]): number {
    const { startOfWeek, endOfWeek } = this.weekRange();
    const minutes = logs
      .filter((log) => {
        const d = new Date(log.date);
        return d >= startOfWeek && d <= endOfWeek;
      })
      .reduce((sum, log) => sum + log.workMinutes, 0);

    return Number((minutes / 60).toFixed(1));
  }

  private completedWorkdaysThisWeek(logs: ProductivityAttendanceLog[]): number {
    const { startOfWeek, endOfWeek } = this.weekRange();
    return logs.filter((log) => {
      const d = new Date(log.date);
      return d >= startOfWeek && d <= endOfWeek;
    }).length;
  }

  private weekRange(): { startOfWeek: Date; endOfWeek: Date } {
    const today = new Date();
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() + mondayOffset);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return { startOfWeek, endOfWeek };
  }
}
