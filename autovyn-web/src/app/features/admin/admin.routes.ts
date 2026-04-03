import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { roleGuard } from '../../core/guards/role.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, roleGuard],
    data: { role: 'ADMIN' },
    loadComponent: () =>
      import('../../core/layouts/admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.AdminDashboardComponent)
      },
      {
        path: 'attendance',
        data: { view: 'attendance' },
        loadComponent: () => import('../employee/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'timesheet',
        loadComponent: () =>
          import('./timesheet-review/timesheet-review.component').then((m) => m.TimesheetReviewComponent)
      },
      {
        path: 'employees',
        loadComponent: () => import('./employees/employees.component').then((m) => m.EmployeesComponent)
      },
      {
        path: 'employees/:id',
        data: { view: 'time-track', adminView: true },
        loadComponent: () => import('../employee/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'approvals',
        loadComponent: () => import('./approvals/approvals.component').then((m) => m.AdminApprovalsComponent)
      },
      {
        path: 'projects',
        loadComponent: () => import('../employee/projects/projects.component').then((m) => m.ProjectsComponent)
      },
      {
        path: 'credentials',
        loadComponent: () =>
          import('../employee/credential-manager/credential-manager.component').then((m) => m.CredentialManagerComponent)
      },
      {
        path: 'announcements',
        loadComponent: () =>
          import('../employee/announcements/announcements.component').then((m) => m.AnnouncementsComponent)
      },
      {
        path: 'policies',
        loadComponent: () => import('../employee/policies/policies.component').then((m) => m.PoliciesComponent)
      },
      {
        path: 'holiday',
        loadComponent: () => import('../employee/holiday/holiday.component').then((m) => m.HolidayComponent)
      },
      {
        path: 'employee-connect',
        loadComponent: () =>
          import('../employee/employee-connect/employee-connect.component').then((m) => m.EmployeeConnectComponent)
      },
      {
        path: 'profile',
        loadComponent: () => import('../employee/profile/profile.component').then((m) => m.ProfileComponent)
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  }
];
