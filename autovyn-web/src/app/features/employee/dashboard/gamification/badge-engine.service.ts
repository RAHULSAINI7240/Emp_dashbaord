import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { Badge, BadgeEvaluationInput, LeaderboardEntry } from './badge.model';

@Injectable({ providedIn: 'root' })
export class BadgeEngineService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly badgesState = signal<Badge[]>([]);
  private readonly leaderboardState = signal<LeaderboardEntry[]>([]);
  private readonly unlockedBadgeState = signal<string | null>(null);

  readonly badges = computed(() => this.badgesState());
  readonly leaderboard = computed(() => this.leaderboardState());
  readonly latestUnlockedBadgeId = computed(() => this.unlockedBadgeState());

  constructor(private readonly authService: AuthService) {
    this.bootstrapLeaderboard();
    this.bootstrapBadges();
    this.simulateLeaderboardProgress();
  }

  updateBadges(input: BadgeEvaluationInput): void {
    const next = this.createBadgeState(input);
    const previous = this.badgesState();

    const justUnlocked = next.find((badge) => {
      const oldBadge = previous.find((item) => item.id === badge.id);
      return badge.unlocked && !oldBadge?.unlocked;
    });

    if (justUnlocked) {
      this.unlockedBadgeState.set(justUnlocked.id);
      setTimeout(() => this.unlockedBadgeState.set(null), 1800);
    }

    this.badgesState.set(next);
  }

  updateCurrentUserRank(score: number): number {
    const currentUserId = this.authService.getCurrentUserSnapshot()?.id;
    if (!currentUserId) return 1;

    const updated = this.leaderboardState().map((entry) =>
      entry.id === currentUserId
        ? {
            ...entry,
            score,
            badges: this.badgesState().filter((badge) => badge.unlocked).length
          }
        : entry
    );

    const sorted = [...updated].sort((a, b) => b.score - a.score);
    this.leaderboardState.set(sorted);
    return Math.max(sorted.findIndex((entry) => entry.id === currentUserId) + 1, 1);
  }

  private bootstrapBadges(): void {
    this.badgesState.set(this.createBadgeState({
      aiEfficiency: 0,
      workStreakDays: 0,
      punctualityRate: 0,
      productivityBoost: 0,
      leaderboardRank: 99
    }));
  }

  private bootstrapLeaderboard(): void {
    this.authService
      .getUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((users) => {
        const employees = users.filter((user) => user.roles.includes('EMPLOYEE')).slice(0, 6);
        const seeded = employees.map((user, index) => ({
          id: user.id,
          name: user.name,
          score: 72 - index * 6,
          badges: Math.max(1, 4 - index)
        }));

        const current = this.authService.getCurrentUserSnapshot();
        if (current && !seeded.some((entry) => entry.id === current.id)) {
          seeded.push({ id: current.id, name: current.name, score: 68, badges: 2 });
        }

        this.leaderboardState.set(seeded.sort((a, b) => b.score - a.score));
      });
  }

  private simulateLeaderboardProgress(): void {
    interval(5000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const next = this.leaderboardState().map((entry, index) => {
          const drift = Math.sin((Date.now() / 1000 + index) * 0.6) * 2;
          return { ...entry, score: Math.max(40, Math.min(99, Math.round(entry.score + drift))) };
        });

        this.leaderboardState.set([...next].sort((a, b) => b.score - a.score));
      });
  }

  private createBadgeState(input: BadgeEvaluationInput): Badge[] {
    return [
      {
        id: 'weekly-top-performer',
        title: 'Weekly Top Performer',
        icon: 'military_tech',
        description: 'Rank #1 on this week leaderboard.',
        unlocked: input.leaderboardRank === 1,
        progressPercent: this.progressFromRank(input.leaderboardRank)
      },
      {
        id: 'five-day-streak',
        title: '5-Day Work Streak',
        icon: 'local_fire_department',
        description: 'Complete focused work sessions for 5 consecutive days.',
        unlocked: input.workStreakDays >= 5,
        progressPercent: Math.min(100, Math.round((input.workStreakDays / 5) * 100))
      },
      {
        id: 'ai-master',
        title: 'AI Master',
        icon: 'smart_toy',
        description: 'Maintain 80%+ AI efficiency.',
        unlocked: input.aiEfficiency >= 80,
        progressPercent: Math.min(100, Math.round((input.aiEfficiency / 80) * 100))
      },
      {
        id: 'perfect-punctuality',
        title: 'Perfect Punctuality',
        icon: 'schedule',
        description: 'Hold 95%+ punctuality across the month.',
        unlocked: input.punctualityRate >= 95,
        progressPercent: Math.min(100, Math.round((input.punctualityRate / 95) * 100))
      },
      {
        id: 'productivity-booster',
        title: 'Productivity Booster',
        icon: 'rocket_launch',
        description: 'Achieve 15%+ AI productivity boost.',
        unlocked: input.productivityBoost >= 15,
        progressPercent: Math.min(100, Math.round((input.productivityBoost / 15) * 100))
      }
    ];
  }

  private progressFromRank(rank: number): number {
    if (rank <= 1) return 100;
    if (rank <= 2) return 80;
    if (rank <= 3) return 60;
    if (rank <= 5) return 45;
    return 20;
  }
}
