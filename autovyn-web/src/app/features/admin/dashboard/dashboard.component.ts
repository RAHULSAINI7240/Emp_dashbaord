import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { combineLatest, map } from 'rxjs';
import { ArsService } from '../../../core/services/ars.service';
import { AuthService } from '../../../core/services/auth.service';
import { LeaveService } from '../../../core/services/leave.service';
import { ProjectItem, ProjectService } from '../../../core/services/project.service';
import { WorklogService } from '../../../core/services/worklog.service';
import { User } from '../../../shared/models/user.model';
import { WorklogEmployeeSummary } from '../../../shared/models/worklog.model';

interface StatCard {
  label: string;
  value: string;
  helper: string;
  icon: string;
  tone: 'primary' | 'success' | 'warning' | 'danger';
}

interface TeamSnapshot {
  user: User;
  projectCount: number;
  liveStatus: 'ACTIVE' | 'IDLE' | 'OFFLINE';
  productivityPercent: number;
  trackedHours: number;
}

interface InsightItem {
  title: string;
  detail: string;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  icon: string;
}

@Component({
  selector: 'app-admin-dashboard',
  imports: [NgFor, NgIf, AsyncPipe, RouterLink, MatIconModule, DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class AdminDashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly leaveService = inject(LeaveService);
  private readonly arsService = inject(ArsService);
  private readonly projectService = inject(ProjectService);
  private readonly worklogService = inject(WorklogService);

  readonly today = new Date();
  readonly from = this.formatDateInput(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  readonly to = this.formatDateInput(new Date());

  readonly vm$ = combineLatest([
    this.authService.getUsers(),
    this.leaveService.requests$,
    this.arsService.requests$,
    this.projectService.getWorkspace(),
    this.worklogService.getSummary(this.from, this.to)
  ]).pipe(
    map(([users, leaveRequests, arsRequests, projectWorkspace, worklog]) => {
      const employees = users.filter((user) => !user.roles.includes('ADMIN'));
      const activeProjects = projectWorkspace.items.filter((project) => project.status.toLowerCase() === 'active');
      const pendingLeaves = leaveRequests.filter((item) => item.status === 'PENDING');
      const pendingArs = arsRequests.filter((item) => item.status === 'PENDING');
      const workEmployees = worklog?.employees ?? [];
      const productivityAverage = workEmployees.length
        ? Math.round(workEmployees.reduce((sum, item) => sum + item.productivityPercent, 0) / workEmployees.length)
        : 0;

      const statCards: StatCard[] = [
        {
          label: 'Employees',
          value: String(employees.length),
          helper: `${employees.filter((user) => user.roles.includes('HR')).length} HR / ${employees.filter((user) => user.roles.includes('EMPLOYEE')).length} workforce`,
          icon: 'groups',
          tone: 'primary'
        },
        {
          label: 'Active Projects',
          value: String(activeProjects.length),
          helper: `${projectWorkspace.items.length} total tracked projects`,
          icon: 'workspaces',
          tone: 'success'
        },
        {
          label: 'Pending Approvals',
          value: String(pendingLeaves.length + pendingArs.length),
          helper: `${pendingLeaves.length} leave + ${pendingArs.length} ARS`,
          icon: 'approval',
          tone: 'warning'
        },
        {
          label: 'Productivity',
          value: `${productivityAverage}%`,
          helper: `Last 7 days average`,
          icon: 'insights',
          tone: productivityAverage >= 75 ? 'success' : productivityAverage >= 55 ? 'warning' : 'danger'
        }
      ];

      const employeeProjectCounts = new Map<string, number>();
      projectWorkspace.items.forEach((project) =>
        project.members.forEach((member) =>
          employeeProjectCounts.set(member.id, (employeeProjectCounts.get(member.id) ?? 0) + 1)
        )
      );

      const worklogByUserId = new Map(workEmployees.map((item) => [item.user.id, item]));
      const teamSnapshots: TeamSnapshot[] = employees
        .map((user) => {
          const summary = worklogByUserId.get(user.id);
          return {
            user,
            projectCount: employeeProjectCounts.get(user.id) ?? 0,
            liveStatus: summary?.liveStatus ?? 'OFFLINE',
            productivityPercent: summary?.productivityPercent ?? 0,
            trackedHours: Number((((summary?.totalTrackedSeconds ?? 0) / 3600) || 0).toFixed(1))
          };
        })
        .sort((a, b) => {
          if (b.projectCount !== a.projectCount) return b.projectCount - a.projectCount;
          return b.productivityPercent - a.productivityPercent;
        });

      const focusProjects = [...projectWorkspace.items]
        .sort((a, b) => {
          const statusScore = (project: ProjectItem) => (project.status.toLowerCase() === 'active' ? 1 : 0);
          return statusScore(b) - statusScore(a) || b.members.length - a.members.length;
        })
        .slice(0, 4);

      const topPerformers = [...workEmployees]
        .sort((a, b) => b.productivityPercent - a.productivityPercent)
        .slice(0, 5);

      const aiInsights = this.buildInsights({
        employees,
        activeProjects,
        projectWorkspace,
        pendingLeaves,
        pendingArs,
        topPerformers,
        workEmployees,
        teamSnapshots
      });

      return {
        statCards,
        focusProjects,
        topPerformers,
        teamSnapshots: teamSnapshots.slice(0, 8),
        aiInsights
      };
    })
  );

  constructor() {}

  trackByLabel(_: number, item: { label: string }): string {
    return item.label;
  }

  trackByProject(_: number, item: ProjectItem): string {
    return item.id;
  }

  trackByUser(_: number, item: TeamSnapshot | WorklogEmployeeSummary): string {
    return item.user.id;
  }

  private buildInsights(context: {
    employees: User[];
    activeProjects: ProjectItem[];
    projectWorkspace: { items: ProjectItem[] };
    pendingLeaves: Array<{ employeeId: string }>;
    pendingArs: Array<{ employeeId: string }>;
    topPerformers: WorklogEmployeeSummary[];
    workEmployees: WorklogEmployeeSummary[];
    teamSnapshots: TeamSnapshot[];
  }): InsightItem[] {
    const insights: InsightItem[] = [];

    const employeesWithoutProjects = context.employees.filter(
      (user) => !context.projectWorkspace.items.some((project) => project.members.some((member) => member.id === user.id))
    );
    if (employeesWithoutProjects.length) {
      insights.push({
        title: 'Unallocated employees detected',
        detail: `${employeesWithoutProjects.length} employees have no active project assignment right now.`,
        tone: 'warning',
        icon: 'person_search'
      });
    }

    const lowProductivity = context.workEmployees.filter((employee) => employee.productivityPercent < 55);
    if (lowProductivity.length) {
      insights.push({
        title: 'Work attention needed',
        detail: `${lowProductivity.length} employees are below 55% productivity in the last 7 days.`,
        tone: 'danger',
        icon: 'trending_down'
      });
    }

    if (context.pendingLeaves.length + context.pendingArs.length > 0) {
      insights.push({
        title: 'Approval queue is active',
        detail: `${context.pendingLeaves.length + context.pendingArs.length} items are waiting for action.`,
        tone: 'primary',
        icon: 'pending_actions'
      });
    }

    const overloadedProjects = context.activeProjects.filter((project) => project.members.length >= 6);
    if (overloadedProjects.length) {
      insights.push({
        title: 'Large squad projects running',
        detail: `${overloadedProjects.length} active projects have 6+ members and need manager attention.`,
        tone: 'success',
        icon: 'hub'
      });
    }

    if (context.topPerformers[0]) {
      insights.push({
        title: 'Top performer this week',
        detail: `${context.topPerformers[0].user.name} is leading at ${context.topPerformers[0].productivityPercent}% productivity.`,
        tone: 'success',
        icon: 'emoji_events'
      });
    }

    return insights.slice(0, 4);
  }

  private formatDateInput(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
