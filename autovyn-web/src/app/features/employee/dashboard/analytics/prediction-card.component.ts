import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AnimatedNumberComponent } from './animated-number.component';
import { PredictionSnapshot } from './analytics.models';

@Component({
  selector: 'app-prediction-card',
  imports: [MatIconModule, AnimatedNumberComponent],
  templateUrl: './prediction-card.component.html',
  styleUrl: './prediction-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PredictionCardComponent {
  @Input({ required: true }) prediction!: PredictionSnapshot;
}
