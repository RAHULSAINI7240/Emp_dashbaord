import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AnimatedNumberComponent } from './animated-number.component';

@Component({
  selector: 'app-kpi-trend-card',
  imports: [MatIconModule, AnimatedNumberComponent],
  templateUrl: './kpi-trend-card.component.html',
  styleUrl: './kpi-trend-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KpiTrendCardComponent {
  @Input({ required: true }) label = '';
  @Input({ required: true }) icon = 'insights';
  @Input({ required: true }) value = 0;
  @Input() suffix = '';
  @Input() decimals = 0;
  @Input() changePercent = 0;

  get isPositive(): boolean {
    return this.changePercent >= 0;
  }
}
