import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WorkStatusService } from './work-status.service';

@Component({
  selector: 'app-live-status-badge',
  imports: [MatTooltipModule],
  templateUrl: './live-status-badge.component.html',
  styleUrl: './live-status-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LiveStatusBadgeComponent {
  private readonly workStatusService = inject(WorkStatusService);

  readonly status = this.workStatusService.status;
  readonly sessionLabel = this.workStatusService.sessionDurationLabel;
  readonly tooltip = this.workStatusService.tooltip;

  readonly statusLabel = computed(() => {
    if (this.status() === 'ACTIVE') return 'Active';
    if (this.status() === 'IDLE') return 'Idle';
    return 'Offline';
  });

  constructor() {}
}
