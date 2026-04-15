import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { permissionGuard } from '../../core/guards/permission.guard';
import { roleGuard } from '../../core/guards/role.guard';

export const EMPLOYEE_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['EMPLOYEE', 'HR'] },
    loadComponent: () =>
      import('../../core/layouts/employee-layout/employee-layout.component').then((m) => m.EmployeeLayoutComponent),
    children: [
      {
        path: 'dashboard',
        data: { view: 'time-track' },
        loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'attendance',
        data: { view: 'attendance' },
        loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'timesheet',
        loadComponent: () => import('./timesheet/timesheet.component').then((m) => m.TimesheetComponent)
      },
      {
        path: 'work-timesheet',
        loadComponent: () =>
          import('./work-timesheet/work-timesheet.component').then((m) => m.WorkTimesheetComponent)
      },
      {
        path: 'credentials',
        loadComponent: () =>
          import('./credential-manager/credential-manager.component').then((m) => m.CredentialManagerComponent)
      },
      { path: 'leave', loadComponent: () => import('./leave/leave.component').then((m) => m.LeaveComponent) },
      {
        path: 'leave/request',
        loadComponent: () => import('./leave-request/leave-request.component').then((m) => m.LeaveRequestComponent)
      },
      {
        path: 'leave/approvals',
        canActivate: [permissionGuard],
        data: { permissions: ['APPROVE_LEAVE', 'MANAGER', 'TEAM_LEAD'] },
        loadComponent: () =>
          import('./leave-approvals/leave-approvals.component').then((m) => m.LeaveApprovalsComponent)
      },
      {
        path: 'ars/request',
        loadComponent: () => import('./ars-request/ars-request.component').then((m) => m.ArsRequestComponent)
      },
      {
        path: 'ars/status',
        loadComponent: () => import('./ars-status/ars-status.component').then((m) => m.ArsStatusComponent)
      },
      {
        path: 'ars/approvals',
        canActivate: [permissionGuard],
        data: { permissions: ['APPROVE_ARS', 'MANAGER', 'TEAM_LEAD'] },
        loadComponent: () => import('./ars-approvals/ars-approvals.component').then((m) => m.ArsApprovalsComponent)
      },
      {
        path: 'register-user',
        canActivate: [permissionGuard],
        data: { permission: 'CREATE_USER', roles: ['HR'] },
        loadComponent: () => import('./register-user/register-user.component').then((m) => m.RegisterUserComponent)
      },
      {
        path: 'announcements',
        loadComponent: () =>
          import('./announcements/announcements.component').then((m) => m.AnnouncementsComponent)
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./notifications/notifications.component').then((m) => m.NotificationsComponent)
      },
      { path: 'policies', loadComponent: () => import('./policies/policies.component').then((m) => m.PoliciesComponent) },
      { path: 'holiday', loadComponent: () => import('./holiday/holiday.component').then((m) => m.HolidayComponent) },
      {
        path: 'projects',
        loadComponent: () => import('./projects/projects.component').then((m) => m.ProjectsComponent)
      },
      {
        path: 'employee-connect',
        loadComponent: () =>
          import('./employee-connect/employee-connect.component').then((m) => m.EmployeeConnectComponent)
      },
      { path: 'profile', loadComponent: () => import('./profile/profile.component').then((m) => m.ProfileComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'attendance' }
    ]
  }
];
