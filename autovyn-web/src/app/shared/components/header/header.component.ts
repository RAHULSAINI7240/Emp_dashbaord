import { Component, Input } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { LiveStatusBadgeComponent } from '../../../features/employee/dashboard/realtime/live-status-badge.component';

@Component({
  selector: 'app-header',
  imports: [RouterLink, MatIconModule, LiveStatusBadgeComponent, AsyncPipe, NgIf],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  @Input() title = 'Autovyn';
  readonly unreadCount$;

  constructor(
    public authService: AuthService,
    private readonly notificationService: NotificationService
  ) {
    this.unreadCount$ = this.notificationService.unreadCount$;
  }

  get notificationRoute(): string {
    return this.authService.hasRole('ADMIN') ? '/admin/approvals' : '/employee/notifications';
  }

  get profileRoute(): string {
    return this.authService.hasRole('ADMIN') ? '/admin/dashboard' : '/employee/profile';
  }
}
