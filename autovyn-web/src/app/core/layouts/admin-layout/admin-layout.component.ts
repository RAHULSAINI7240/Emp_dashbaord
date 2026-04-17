import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../../../shared/components/header/header.component';
import { SidebarComponent, NavItem } from '../../../shared/components/sidebar/sidebar.component';
import { ToastComponent } from '../../../shared/components/toast/toast.component';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, HeaderComponent, SidebarComponent, ToastComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent {
  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'space_dashboard', link: '/admin/dashboard' },
    { label: 'Attendance', icon: 'fact_check', link: '/admin/attendance' },
    { label: 'Autovyn Cal', icon: 'calendar_month', link: '/admin/timesheet' },
    { label: 'Employees', icon: 'badge', link: '/admin/employees' },
    { label: 'Approvals', icon: 'approval', link: '/admin/approvals' },
    { label: 'Employee Monitoring', icon: 'screenshot_monitor', link: '/admin/screenshots' },
    { label: 'Projects', icon: 'workspaces', link: '/admin/projects' },
    { label: 'Credential Manager', icon: 'key', link: '/admin/credentials' },
    { label: 'Announcements', icon: 'campaign', link: '/admin/announcements' },
    { label: 'Policies', icon: 'policy', link: '/admin/policies' },
    { label: 'Holiday', icon: 'beach_access', link: '/admin/holiday' },
    { label: 'Connect', icon: 'groups', link: '/admin/employee-connect' },
    { label: 'Profile', icon: 'person', link: '/admin/profile' }
  ];
}
