import { Component, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { BottomNavComponent } from '../../../shared/components/bottom-nav/bottom-nav.component';
import { HeaderComponent } from '../../../shared/components/header/header.component';
import { SidebarComponent, NavItem } from '../../../shared/components/sidebar/sidebar.component';
import { ToastComponent } from '../../../shared/components/toast/toast.component';
import { User } from '../../../shared/models/user.model';

@Component({
  selector: 'app-employee-layout',
  imports: [RouterOutlet, SidebarComponent, HeaderComponent, BottomNavComponent, ToastComponent],
  templateUrl: './employee-layout.component.html',
  styleUrl: './employee-layout.component.scss'
})
export class EmployeeLayoutComponent implements OnDestroy {
  headerTitle = 'Employee Portal';
  navItems: NavItem[] = [];
  private readonly subscription = new Subscription();

  private readonly baseNavItems: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', link: '/employee/dashboard' },
    { label: 'Attendance', icon: 'fact_check', link: '/employee/attendance' },
    { label: 'Autovyn Cal', icon: 'calendar_month', link: '/employee/timesheet' },
    { label: 'Timesheet', icon: 'assignment', link: '/employee/work-timesheet' },
    { label: 'Credential Manager', icon: 'key', link: '/employee/credentials' },
    { label: 'Leave', icon: 'event_available', link: '/employee/leave' },
    { label: 'Announcements', icon: 'campaign', link: '/employee/announcements' },
    { label: 'Notifications', icon: 'notifications', link: '/employee/notifications' },
    { label: 'Policies', icon: 'policy', link: '/employee/policies' },
    { label: 'Holiday', icon: 'beach_access', link: '/employee/holiday' },
    { label: 'Projects', icon: 'workspaces', link: '/employee/projects' },
    { label: 'Connect', icon: 'groups', link: '/employee/employee-connect' },
    { label: 'Profile', icon: 'person', link: '/employee/profile' }
  ];

  constructor(private readonly authService: AuthService) {
    this.applyUserNav(this.authService.getCurrentUserSnapshot());
    this.subscription.add(
      this.authService.currentUser$.subscribe((user) => {
        this.applyUserNav(user);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private applyUserNav(user: User | null): void {
    this.headerTitle = user?.roles.includes('HR') ? 'HR Portal' : 'Employee Portal';
    const navItems = [...this.baseNavItems];

    if (user?.roles.includes('HR') || user?.permissions.includes('CREATE_USER')) {
      navItems.splice(3, 0, { label: 'Register User', icon: 'person_add', link: '/employee/register-user' });
    }

    if (user?.permissions.includes('APPROVE_LEAVE')) {
      navItems.push({ label: 'Leave Approvals', icon: 'task', link: '/employee/leave/approvals' });
    }

    if (user?.permissions.includes('APPROVE_ARS')) {
      navItems.push({ label: 'ARS Approvals', icon: 'done_all', link: '/employee/ars/approvals' });
    }

    this.navItems = navItems;
  }
}
