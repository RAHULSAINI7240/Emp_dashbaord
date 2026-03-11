import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, combineLatest, map, of, switchMap, tap, timer } from 'rxjs';
import { AnnouncementService } from './announcement.service';
import { ArsService } from './ars.service';
import { AuthService } from './auth.service';
import { HolidayService } from './holiday.service';
import { LeaveService } from './leave.service';

export type NotificationType = 'ANNOUNCEMENT' | 'HOLIDAY' | 'LEAVE' | 'ARS';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  imageUrl?: string;
  route?: string;
  read: boolean;
}

const STORAGE_KEY = 'autovyn_notifications_read';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  readonly notifications$ = this.notificationsSubject.asObservable();
  readonly unreadCount$ = this.notifications$.pipe(map((items) => items.filter((item) => !item.read).length));

  constructor(
    private readonly authService: AuthService,
    private readonly announcementService: AnnouncementService,
    private readonly holidayService: HolidayService,
    private readonly leaveService: LeaveService,
    private readonly arsService: ArsService
  ) {
    this.authService.currentUser$
      .pipe(
        switchMap((user) => {
          if (!user) {
            this.notificationsSubject.next([]);
            return of(null);
          }
          const isAdmin = user.roles.includes('ADMIN');
          const refreshMs = isAdmin ? 15000 : 30000;
          return timer(0, refreshMs).pipe(switchMap(() => this.load(user.id, isAdmin)));
        })
      )
      .subscribe();
  }

  refresh(): void {
    const userId = this.authService.getCurrentUserSnapshot()?.id;
    if (!userId) {
      this.notificationsSubject.next([]);
      return;
    }
    const isAdmin = this.authService.getCurrentUserSnapshot()?.roles.includes('ADMIN') ?? false;
    this.load(userId, isAdmin).subscribe();
  }

  markAllAsRead(): void {
    const userId = this.authService.getCurrentUserSnapshot()?.id;
    if (!userId) return;
    const current = this.notificationsSubject.value;
    if (!current.length) return;

    const readIds = new Set(this.getReadIds(userId));
    current.forEach((item) => readIds.add(item.id));
    this.saveReadIds(userId, Array.from(readIds));
    this.notificationsSubject.next(current.map((item) => ({ ...item, read: true })));
  }

  markAsRead(notificationId: string): void {
    const userId = this.authService.getCurrentUserSnapshot()?.id;
    if (!userId) return;
    const current = this.notificationsSubject.value;
    if (!current.some((item) => item.id === notificationId)) return;

    const readIds = new Set(this.getReadIds(userId));
    readIds.add(notificationId);
    this.saveReadIds(userId, Array.from(readIds));
    this.notificationsSubject.next(current.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
  }

  private load(userId: string, isAdmin: boolean): Observable<null> {
    return combineLatest([
      this.announcementService.list(1, 20),
      this.holidayService.listByYear(new Date().getFullYear()),
      this.leaveService.getByEmployee(userId),
      this.leaveService.getByApprover(userId),
      this.arsService.getByEmployee(userId),
      this.arsService.getByApprover(userId)
    ]).pipe(
      map(([announcements, holidays, leaves, leaveApprovals, ars, arsApprovals]) => {
        const readIds = new Set(this.getReadIds(userId));

        const announcementNotifications: AppNotification[] = announcements.map((item) => ({
          id: `announcement:${item.id}`,
          type: 'ANNOUNCEMENT',
          title: item.title,
          message: item.text,
          createdAt: item.createdAt,
          imageUrl: item.image,
          route: '/employee/announcements',
          read: readIds.has(`announcement:${item.id}`)
        }));

        const holidayNotifications: AppNotification[] = holidays.map((item) => ({
          id: `holiday:${item.id}`,
          type: 'HOLIDAY',
          title: `Holiday Update: ${item.name}`,
          message: `Holiday on ${new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          createdAt: new Date(item.date).toISOString(),
          imageUrl: item.imageUrl,
          route: '/employee/holiday',
          read: readIds.has(`holiday:${item.id}`)
        }));

        const leaveNotifications: AppNotification[] = leaves.map((item) => ({
          id: `leave:${item.id}`,
          type: 'LEAVE',
          title: `Leave ${item.status}`,
          message: `${item.type} leave request ${item.status.toLowerCase()}.`,
          createdAt: item.createdAt,
          route: '/employee/leave',
          read: readIds.has(`leave:${item.id}`)
        }));

        const approvalLeaveNotifications: AppNotification[] = leaveApprovals
          .filter((item) => item.status === 'PENDING')
          .map((item) => ({
            id: `leave-approval:${item.id}`,
            type: 'LEAVE' as const,
            title: 'Leave Approval Pending',
            message: `New ${item.type.toLowerCase()} leave request is waiting for your approval.`,
            createdAt: item.createdAt,
            route: isAdmin ? '/admin/approvals' : '/employee/leave/approvals',
            read: readIds.has(`leave-approval:${item.id}`)
          }));

        const arsNotifications: AppNotification[] = ars.map((item) => ({
          id: `ars:${item.id}`,
          type: 'ARS',
          title: `ARS ${item.status}`,
          message: `ARS request for ${new Date(item.date).toLocaleDateString('en-US')} is ${item.status.toLowerCase()}.`,
          createdAt: item.createdAt,
          route: '/employee/ars/status',
          read: readIds.has(`ars:${item.id}`)
        }));

        const approvalArsNotifications: AppNotification[] = arsApprovals
          .filter((item) => item.status === 'PENDING')
          .map((item) => ({
            id: `ars-approval:${item.id}`,
            type: 'ARS' as const,
            title: 'ARS Approval Pending',
            message: `New ARS request (${new Date(item.date).toLocaleDateString('en-US')}) is waiting for your approval.`,
            createdAt: item.createdAt,
            route: isAdmin ? '/admin/approvals' : '/employee/ars/approvals',
            read: readIds.has(`ars-approval:${item.id}`)
          }));

        return [
          ...announcementNotifications,
          ...holidayNotifications,
          ...leaveNotifications,
          ...approvalLeaveNotifications,
          ...arsNotifications,
          ...approvalArsNotifications
        ]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 80);
      }),
      tap((items) => this.notificationsSubject.next(items)),
      map(() => null),
      catchError(() => {
        this.notificationsSubject.next([]);
        return of(null);
      })
    );
  }

  private getReadIds(userId: string): string[] {
    const all = this.readStorage();
    return Array.isArray(all[userId]) ? all[userId] : [];
  }

  private saveReadIds(userId: string, ids: string[]): void {
    const all = this.readStorage();
    all[userId] = ids;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  private readStorage(): Record<string, string[]> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
}
