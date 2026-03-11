import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgFor, NgIf } from '@angular/common';
import { Badge, LeaderboardEntry } from './badge.model';

@Component({
  selector: 'app-badge-showcase',
  imports: [NgFor, NgIf, MatIconModule],
  templateUrl: './badge-showcase.component.html',
  styleUrl: './badge-showcase.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BadgeShowcaseComponent {
  @Input({ required: true }) badges: Badge[] = [];
  @Input({ required: true }) leaderboard: LeaderboardEntry[] = [];
  @Input() unlockedBadgeId: string | null = null;
}
