import { Component } from '@angular/core';
import { AsyncPipe, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AppNotification, NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-notifications',
  imports: [NgFor, NgIf, AsyncPipe, DatePipe, RouterLink, NgClass, MatIconModule],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss'
})
export class NotificationsComponent {
  readonly notifications$;
  readonly unreadCount$;

  constructor(private readonly notificationService: NotificationService) {
    this.notifications$ = this.notificationService.notifications$;
    this.unreadCount$ = this.notificationService.unreadCount$;
    this.notificationService.refresh();
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  markAsRead(notification: AppNotification): void {
    if (notification.read) return;
    this.notificationService.markAsRead(notification.id);
  }

  typeIcon(type: AppNotification['type']): string {
    if (type === 'ANNOUNCEMENT') return 'campaign';
    if (type === 'HOLIDAY') return 'celebration';
    if (type === 'LEAVE') return 'event_available';
    return 'fact_check';
  }
}
