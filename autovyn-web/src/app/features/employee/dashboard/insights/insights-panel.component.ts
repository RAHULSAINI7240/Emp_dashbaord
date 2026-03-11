import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { InsightCard } from '../analytics/analytics.models';

@Component({
  selector: 'app-insights-panel',
  imports: [NgFor, NgIf, MatIconModule, SkeletonComponent],
  templateUrl: './insights-panel.component.html',
  styleUrl: './insights-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InsightsPanelComponent {
  @Input() loading = false;
  @Input({ required: true }) insights: InsightCard[] = [];
}
