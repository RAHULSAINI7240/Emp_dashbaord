import { Component } from '@angular/core';
import { NgFor } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { LeaveService } from '../../../core/services/leave.service';
import { PolicyService } from '../../../core/services/policy.service';
import { LeaveRequest, LeaveSummary } from '../../../shared/models/leave.model';

type LeaveTypeKey = keyof LeaveSummary['byType'];

interface SummaryRow {
  key: LeaveTypeKey;
  label: string;
  allowed: number;
  taken: number;
  approved: number;
  pending: number;
  remaining: number;
  overdrawn: number;
  color: string;
  usedPercent: number;
  overdrawPercent: number;
}

interface ActionLink {
  title: string;
  copy: string;
  link: string;
  eyebrow: string;
}

const DEFAULT_ALLOWANCES = {
  casual: 6,
  sick: 5,
  special: 6,
  emergency: 1,
  total: 18
};

const TYPE_META: Record<LeaveTypeKey, { label: string; color: string }> = {
  CASUAL: { label: 'Casual Leave', color: '#1f6feb' },
  SICK: { label: 'Sick Leave', color: '#0f9d7a' },
  SPECIAL: { label: 'Special Leave', color: '#e58f1e' },
  EMERGENCY: { label: 'Emergency Leave', color: '#d1496b' }
};

@Component({
  selector: 'app-leave',
  imports: [RouterLink, NgFor],
  templateUrl: './leave.component.html',
  styleUrl: './leave.component.scss'
})
export class LeaveComponent {
  summaryRows: SummaryRow[] = [];
  donutBackground = 'conic-gradient(#e4ebf5 0deg 360deg)';
  overview = {
    totalAllowance: DEFAULT_ALLOWANCES.total,
    totalTaken: 0,
    approvedTaken: 0,
    pendingTaken: 0,
    totalRemaining: DEFAULT_ALLOWANCES.total,
    totalOverdrawn: 0
  };

  readonly actions: ActionLink[] = [
    {
      eyebrow: 'Apply',
      title: 'Create Leave Request',
      copy: 'Submit a new leave plan with the correct approver and date range.',
      link: '/employee/leave/request'
    },
    {
      eyebrow: 'History',
      title: 'Review Leave Logs',
      copy: 'Track every pending, approved, declined, and expired leave request.',
      link: '/employee/leave/approvals'
    },
    {
      eyebrow: 'WFH',
      title: 'Open WFH Logs',
      copy: 'Review work-from-home records without mixing them into leave balance.',
      link: '/employee/ars/status'
    },
    {
      eyebrow: 'Corrections',
      title: 'Raise ARS Request',
      copy: 'Fix missing punches and attendance corrections from one place.',
      link: '/employee/ars/request'
    }
  ];

  constructor(
    private readonly authService: AuthService,
    private readonly leaveService: LeaveService,
    private readonly policyService: PolicyService
  ) {
    this.loadSummary();
  }

  formatDays(value: number): string {
    const normalized = Number.isInteger(value) ? value.toString() : value.toFixed(1);
    return normalized.replace(/\.0$/, '');
  }

  trackByKey(_index: number, item: SummaryRow): string {
    return item.key;
  }

  private loadSummary(): void {
    this.leaveService.getSummary().subscribe((summary) => {
      if (summary) {
        this.applySummary(summary);
        return;
      }

      const userId = this.authService.getCurrentUserSnapshot()?.id;
      if (!userId) {
        this.applySummary(this.createEmptySummary());
        return;
      }

      forkJoin({
        requests: this.leaveService.getByEmployee(userId),
        policy: this.policyService.getPolicies()
      }).subscribe(({ requests, policy }) => {
        this.applySummary(this.createSummaryFromRequests(requests, policy?.leaveAllowances ?? DEFAULT_ALLOWANCES));
      });
    });
  }

  private applySummary(summary: LeaveSummary): void {
    this.overview = {
      totalAllowance: summary.totalAllowance,
      totalTaken: summary.totalTaken,
      approvedTaken: summary.approvedTaken,
      pendingTaken: summary.pendingTaken,
      totalRemaining: summary.totalRemaining,
      totalOverdrawn: summary.totalOverdrawn
    };
    this.donutBackground = this.buildDonutBackground(summary);

    this.summaryRows = (Object.keys(summary.byType) as LeaveTypeKey[]).map((key) => {
      const item = summary.byType[key];
      const meta = TYPE_META[key];
      const safeAllowed = item.allowed > 0 ? item.allowed : 1;

      return {
        key,
        label: meta.label,
        allowed: item.allowed,
        taken: item.taken,
        approved: item.approved,
        pending: item.pending,
        remaining: item.remaining,
        overdrawn: item.overdrawn,
        color: meta.color,
        usedPercent: Math.min(100, Math.max(0, (item.taken / safeAllowed) * 100)),
        overdrawPercent: item.remaining < 0 ? Math.min(100, (Math.abs(item.remaining) / safeAllowed) * 100) : 0
      };
    });
  }

  private createEmptySummary(): LeaveSummary {
    return {
      totalAllowance: DEFAULT_ALLOWANCES.total,
      totalTaken: 0,
      approvedTaken: 0,
      pendingTaken: 0,
      totalRemaining: DEFAULT_ALLOWANCES.total,
      totalOverdrawn: 0,
      byType: {
        CASUAL: { allowed: DEFAULT_ALLOWANCES.casual, taken: 0, approved: 0, pending: 0, remaining: DEFAULT_ALLOWANCES.casual, overdrawn: 0 },
        SICK: { allowed: DEFAULT_ALLOWANCES.sick, taken: 0, approved: 0, pending: 0, remaining: DEFAULT_ALLOWANCES.sick, overdrawn: 0 },
        SPECIAL: { allowed: DEFAULT_ALLOWANCES.special, taken: 0, approved: 0, pending: 0, remaining: DEFAULT_ALLOWANCES.special, overdrawn: 0 },
        EMERGENCY: { allowed: DEFAULT_ALLOWANCES.emergency, taken: 0, approved: 0, pending: 0, remaining: DEFAULT_ALLOWANCES.emergency, overdrawn: 0 }
      }
    };
  }

  private createSummaryFromRequests(
    requests: LeaveRequest[],
    allowances: { casual: number; sick: number; special: number; emergency: number; total: number }
  ): LeaveSummary {
    const activeRequests = requests.filter((item) => item.status === 'PENDING' || item.status === 'APPROVED');
    const summary: LeaveSummary = {
      totalAllowance: allowances.total,
      totalTaken: 0,
      approvedTaken: 0,
      pendingTaken: 0,
      totalRemaining: allowances.total,
      totalOverdrawn: 0,
      byType: {
        CASUAL: { allowed: allowances.casual, taken: 0, approved: 0, pending: 0, remaining: allowances.casual, overdrawn: 0 },
        SICK: { allowed: allowances.sick, taken: 0, approved: 0, pending: 0, remaining: allowances.sick, overdrawn: 0 },
        SPECIAL: { allowed: allowances.special, taken: 0, approved: 0, pending: 0, remaining: allowances.special, overdrawn: 0 },
        EMERGENCY: { allowed: allowances.emergency, taken: 0, approved: 0, pending: 0, remaining: allowances.emergency, overdrawn: 0 }
      }
    };

    activeRequests.forEach((item) => {
      if (item.type === 'HALF_DAY') {
        return;
      }

      const units = (item.duration === 'HALF_DAY' ? 0.5 : 1) * item.dates.length;
      const target = summary.byType[item.type];
      target.taken += units;

      if (item.status === 'APPROVED') {
        target.approved += units;
        summary.approvedTaken += units;
      } else if (item.status === 'PENDING') {
        target.pending += units;
        summary.pendingTaken += units;
      }

      summary.totalTaken += units;
    });

    (Object.keys(summary.byType) as LeaveTypeKey[]).forEach((key) => {
      const item = summary.byType[key];
      item.remaining = item.allowed - item.taken;
      item.overdrawn = Math.max(0, item.taken - item.allowed);
    });

    summary.totalRemaining = summary.totalAllowance - summary.totalTaken;
    summary.totalOverdrawn = Math.max(0, summary.totalTaken - summary.totalAllowance);

    return summary;
  }

  private buildDonutBackground(summary: LeaveSummary): string {
    const chartTotal = Math.max(summary.totalAllowance, summary.totalTaken, 1);
    let cursor = 0;
    const segments: string[] = [];

    (Object.keys(summary.byType) as LeaveTypeKey[]).forEach((key) => {
      const value = summary.byType[key].taken;
      if (value <= 0) {
        return;
      }

      const next = cursor + (value / chartTotal) * 360;
      segments.push(`${TYPE_META[key].color} ${cursor.toFixed(2)}deg ${next.toFixed(2)}deg`);
      cursor = next;
    });

    if (cursor < 360) {
      segments.push(`#e7edf7 ${cursor.toFixed(2)}deg 360deg`);
    }

    return `conic-gradient(${segments.join(', ')})`;
  }
}
