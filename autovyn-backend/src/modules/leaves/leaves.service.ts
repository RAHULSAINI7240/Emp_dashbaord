import { LeaveType, Permission, Prisma, RequestStatus, Role } from '@prisma/client';
import { AppError } from '../../utils/app-error';
import { buildPaginationMeta, getPagination } from '../../utils/pagination';
import { attendanceService } from '../attendance/attendance.service';
import { dateKeyToUtcDate, formatUtcDateToKey, normalizeAndSortDates } from '../../utils/date-time';
import { leavesRepository } from './leaves.repository';
import { usersRepository } from '../users/users.repository';
import { policiesRepository } from '../policies/policies.repository';
import { toLeaveTypeAllowanceMap } from '../policies/policy-config';

interface AuthContext {
  userId: string;
  role: Role;
  permissions: Permission[];
}

interface LeaveRequestPayload {
  approverId: string;
  type: LeaveType;
  duration: 'FULL_DAY' | 'HALF_DAY';
  halfDaySession?: 'FIRST_HALF' | 'SECOND_HALF';
  reason: string;
  dates: string[];
}

interface ListQuery {
  status?: RequestStatus;
  page?: number;
  limit?: number;
  search?: string;
}

const LEAVE_APPROVER_PERMISSIONS: Permission[] = ['APPROVE_LEAVE', 'MANAGER', 'TEAM_LEAD'];

const hasLeaveApprovalAccess = (permissions: Permission[]): boolean =>
  LEAVE_APPROVER_PERMISSIONS.some((permission) => permissions.includes(permission));

const canApproveLeave = (auth: AuthContext): boolean => auth.role === 'ADMIN' || hasLeaveApprovalAccess(auth.permissions);

const serializeLeave = (leave: {
  id: string;
  employeeId: string;
  approverId: string;
  type: LeaveType;
  duration: 'FULL_DAY' | 'HALF_DAY';
  halfDaySession: 'FIRST_HALF' | 'SECOND_HALF' | null;
  reason: string;
  dates: string[];
  status: RequestStatus;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  actedAt: Date | null;
  employee: {
    id: string;
    employeeId: string | null;
    name: string;
    managerId: string | null;
  };
  approver: {
    id: string;
    employeeId: string | null;
    adminId: string | null;
    name: string;
  };
}) => ({
  id: leave.id,
  employeeId: leave.employeeId,
  approverId: leave.approverId,
  type: leave.type,
  duration: leave.duration,
  halfDaySession: leave.halfDaySession,
  reason: leave.reason,
  dates: leave.dates,
  status: leave.status,
  comment: leave.comment,
  createdAt: leave.createdAt,
  updatedAt: leave.updatedAt,
  actedAt: leave.actedAt,
  employee: leave.employee,
  approver: leave.approver
});

const ensureApproverConstraints = (leave: Awaited<ReturnType<typeof leavesRepository.findById>>, auth: AuthContext): void => {
  if (!leave) {
    throw new AppError('Leave request not found.', 404, 'LEAVE_NOT_FOUND');
  }

  if (leave.status !== 'PENDING') {
    throw new AppError('Only pending requests can be acted upon.', 400, 'LEAVE_NOT_PENDING');
  }

  if (auth.role === 'ADMIN') {
    return;
  }

  if (!hasLeaveApprovalAccess(auth.permissions)) {
    throw new AppError('Missing leave approval permission.', 403, 'FORBIDDEN_LEAVE_APPROVAL');
  }

  if (leave.approverId !== auth.userId) {
    throw new AppError('You are not the selected approver.', 403, 'LEAVE_APPROVER_MISMATCH');
  }

  if (leave.employeeId === auth.userId) {
    throw new AppError('Self-approval is not allowed.', 403, 'SELF_APPROVAL_NOT_ALLOWED');
  }

};

const getTodayUtcDateKey = (): string => new Date().toISOString().slice(0, 10);

const assertFutureDatesOnly = (dates: string[]): void => {
  const todayKey = getTodayUtcDateKey();
  const invalid = dates.find((date) => date <= todayKey);
  if (invalid) {
    throw new AppError('Leave can only be requested for future dates.', 400, 'LEAVE_DATE_MUST_BE_FUTURE');
  }
};

const calculateUnits = (duration: 'FULL_DAY' | 'HALF_DAY', dates: string[]): number => (duration === 'HALF_DAY' ? 0.5 : 1) * dates.length;

const canUserApproveLeave = (user: { role: Role; permissions: Permission[]; isActive: boolean }): boolean =>
  user.isActive && (user.role === 'ADMIN' || hasLeaveApprovalAccess(user.permissions));

const getEligibleApproversForEmployee = async (employeeId: string): Promise<{
  approvers: Array<{ id: string; name: string; role: Role; permissions: Permission[]; isActive: boolean }>;
  defaultApproverId: string | null;
}> => {
  const employee = await leavesRepository.findEmployeeById(employeeId);
  if (!employee) {
    throw new AppError('Employee not found.', 404, 'EMPLOYEE_NOT_FOUND');
  }

  const activeApprovers = await leavesRepository.listActiveLeaveApprovers();
  const filteredApprovers = activeApprovers.filter((item) => item.id !== employee.id);
  const approverById = new Map(filteredApprovers.map((item) => [item.id, item]));

  const eligible = new Map<string, (typeof filteredApprovers)[number]>();
  let managerApproverId: string | null = null;

  if (employee.managerId) {
    const manager = approverById.get(employee.managerId);
    if (manager && canUserApproveLeave(manager)) {
      managerApproverId = manager.id;
      eligible.set(manager.id, manager);
    }
  }

  const defaultAdmin = await leavesRepository.findFirstActiveAdmin();

  if (defaultAdmin && defaultAdmin.id !== employee.id && canUserApproveLeave(defaultAdmin)) {
    eligible.set(defaultAdmin.id, defaultAdmin);
  }

  const approvers = Array.from(eligible.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const defaultApproverId = managerApproverId ?? defaultAdmin?.id ?? approvers[0]?.id ?? null;
  return { approvers, defaultApproverId };
};

export const leavesService = {
  async approvers(auth: AuthContext) {
    if (auth.role === 'ADMIN') {
      const approvers = await leavesRepository.listActiveLeaveApprovers();
      return {
        defaultApproverId: approvers[0]?.id ?? null,
        items: approvers
      };
    }

    const eligible = await getEligibleApproversForEmployee(auth.userId);
    return {
      defaultApproverId: eligible.defaultApproverId,
      items: eligible.approvers
    };
  },

  async expirePendingLeaves(): Promise<void> {
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = dateKeyToUtcDate(todayKey);

    const pending = await leavesRepository.listPendingToExpire(today);
    if (!pending.length) return;

    await leavesRepository.expireMany(pending.map((item) => item.id));

    for (const leave of pending) {
      for (const date of leave.dates) {
        await attendanceService.upsertStatus(leave.employeeId, date, 'ABSENT');
      }
    }
  },

  async requestLeave(auth: AuthContext, payload: LeaveRequestPayload) {
    await this.expirePendingLeaves();

    if (auth.role === 'ADMIN') {
      throw new AppError('Admin cannot create employee leave request endpoint.', 403, 'ADMIN_LEAVE_REQUEST_NOT_ALLOWED');
    }

    if (payload.type === 'HALF_DAY') {
      throw new AppError('Use leave type (CASUAL/SICK/SPECIAL/EMERGENCY) with duration HALF_DAY.', 400, 'INVALID_LEAVE_TYPE');
    }

    if (payload.duration === 'HALF_DAY' && !payload.halfDaySession) {
      throw new AppError('Half-day session is required.', 400, 'HALF_DAY_SESSION_REQUIRED');
    }

    const approver = await leavesRepository.findApproverById(payload.approverId);
    if (!approver || !approver.isActive) {
      throw new AppError('Approver not found or inactive.', 400, 'INVALID_APPROVER');
    }

    const approverCanApprove = approver.role === 'ADMIN' || hasLeaveApprovalAccess(approver.permissions);
    if (!approverCanApprove) {
      throw new AppError('Selected approver cannot approve leave.', 400, 'APPROVER_CANNOT_APPROVE_LEAVE');
    }

    if (auth.userId === approver.id) {
      throw new AppError('Self-approval is not allowed.', 403, 'SELF_APPROVAL_NOT_ALLOWED');
    }

    const eligible = await getEligibleApproversForEmployee(auth.userId);
    if (eligible.approvers.length) {
      const allowedIds = new Set(eligible.approvers.map((item) => item.id));
      if (!allowedIds.has(payload.approverId)) {
        throw new AppError(
          `For your team, leave approver must be one of: ${eligible.approvers.map((item) => item.name).join(', ')}.`,
          400,
          'INVALID_TEAM_APPROVER'
        );
      }
    }

    const dates = normalizeAndSortDates(payload.dates);
    assertFutureDatesOnly(dates);

    if (payload.duration === 'HALF_DAY' && dates.length !== 1) {
      throw new AppError('Half-day leave allows only one date.', 400, 'HALF_DAY_SINGLE_DATE_ONLY');
    }

    const startDate = dateKeyToUtcDate(dates[0]);
    const endDate = dateKeyToUtcDate(dates[dates.length - 1]);

    const created = await leavesRepository.create({
      employeeId: auth.userId,
      approverId: payload.approverId,
      type: payload.type,
      duration: payload.duration,
      halfDaySession: payload.duration === 'HALF_DAY' ? payload.halfDaySession : null,
      reason: payload.reason,
      dates,
      startDate,
      endDate,
      status: 'PENDING'
    });

    return serializeLeave(created);
  },

  async myLeaves(auth: AuthContext, query: ListQuery) {
    await this.expirePendingLeaves();

    const { page, limit, skip } = getPagination(query);

    const where = {
      employeeId: auth.userId,
      ...(query.status ? { status: query.status } : {})
    };

    const [rows, total] = await Promise.all([
      leavesRepository.list({ where, skip, take: limit }),
      leavesRepository.count(where)
    ]);

    return {
      items: rows.map(serializeLeave),
      pagination: buildPaginationMeta(page, limit, total)
    };
  },

  async pendingApprovals(auth: AuthContext, query: ListQuery) {
    await this.expirePendingLeaves();

    if (!canApproveLeave(auth)) {
      throw new AppError('Leave approval permission required.', 403, 'FORBIDDEN_LEAVE_APPROVAL');
    }

    const { page, limit, skip } = getPagination(query);

    const where: Prisma.LeaveRequestWhereInput = {
      status: 'PENDING' as const,
      ...(auth.role === 'ADMIN'
        ? {}
        : {
            approverId: auth.userId
          }),
      ...(query.search
        ? {
            OR: [
              {
                employee: {
                  is: { name: { contains: query.search, mode: 'insensitive' as const } }
                }
              },
              {
                employee: {
                  is: { employeeId: { contains: query.search, mode: 'insensitive' as const } }
                }
              }
            ]
          }
        : {})
    };

    const [rows, total] = await Promise.all([
      leavesRepository.list({ where, skip, take: limit }),
      leavesRepository.count(where)
    ]);

    return {
      items: rows.map(serializeLeave),
      pagination: buildPaginationMeta(page, limit, total)
    };
  },

  async approvalHistory(auth: AuthContext, query: ListQuery) {
    await this.expirePendingLeaves();

    if (!canApproveLeave(auth)) {
      throw new AppError('Leave approval permission required.', 403, 'FORBIDDEN_LEAVE_APPROVAL');
    }

    const { page, limit, skip } = getPagination(query);

    const where: Prisma.LeaveRequestWhereInput = {
      status: query.status ?? ({ in: ['APPROVED', 'DECLINED', 'EXPIRED'] as RequestStatus[] }),
      ...(auth.role === 'ADMIN'
        ? {}
        : {
            approverId: auth.userId
          }),
      ...(query.search
        ? {
            OR: [
              {
                employee: {
                  is: { name: { contains: query.search, mode: 'insensitive' as const } }
                }
              },
              {
                employee: {
                  is: { employeeId: { contains: query.search, mode: 'insensitive' as const } }
                }
              }
            ]
          }
        : {})
    };

    const [rows, total] = await Promise.all([
      leavesRepository.list({ where, skip, take: limit }),
      leavesRepository.count(where)
    ]);

    return {
      items: rows.map(serializeLeave),
      pagination: buildPaginationMeta(page, limit, total)
    };
  },

  async approve(auth: AuthContext, leaveId: string, comment?: string) {
    await this.expirePendingLeaves();

    const leave = await leavesRepository.findById(leaveId);
    ensureApproverConstraints(leave, auth);

    const updated = await leavesRepository.updateStatus(leaveId, 'APPROVED', comment);

    for (const date of updated.dates) {
      await attendanceService.upsertStatus(updated.employeeId, date, updated.duration === 'HALF_DAY' ? 'HALF_DAY' : 'LEAVE');
    }

    return serializeLeave(updated);
  },

  async decline(auth: AuthContext, leaveId: string, comment?: string) {
    await this.expirePendingLeaves();

    const leave = await leavesRepository.findById(leaveId);
    ensureApproverConstraints(leave, auth);

    const updated = await leavesRepository.updateStatus(leaveId, 'DECLINED', comment);
    return serializeLeave(updated);
  },

  async summary(auth: AuthContext) {
    await this.expirePendingLeaves();

    const leaves = await leavesRepository.listByEmployee(auth.userId);
    const latestPolicy = await policiesRepository.latest();
    const leaveAllowances = toLeaveTypeAllowanceMap(latestPolicy);
    const activeRequests = leaves.filter((item) => item.status === 'PENDING' || item.status === 'APPROVED');

    const byType = {
      CASUAL: { taken: 0, approved: 0, pending: 0 },
      SICK: { taken: 0, approved: 0, pending: 0 },
      SPECIAL: { taken: 0, approved: 0, pending: 0 },
      EMERGENCY: { taken: 0, approved: 0, pending: 0 }
    };

    let approvedUnits = 0;
    let pendingUnits = 0;
    let totalUnits = 0;

    for (const item of activeRequests) {
      if (item.type === 'HALF_DAY') continue;

      const units = calculateUnits(item.duration, item.dates);
      byType[item.type].taken += units;
      totalUnits += units;
      if (item.status === 'APPROVED') {
        byType[item.type].approved += units;
        approvedUnits += units;
      } else if (item.status === 'PENDING') {
        byType[item.type].pending += units;
        pendingUnits += units;
      }
    }

    const totalAllowance = Object.values(leaveAllowances).reduce((sum, item) => sum + item, 0);
    const totalRemaining = totalAllowance - totalUnits;

    return {
      totalAllowance,
      totalTaken: totalUnits,
      approvedTaken: approvedUnits,
      pendingTaken: pendingUnits,
      totalRemaining,
      totalOverdrawn: totalRemaining < 0 ? Math.abs(totalRemaining) : 0,
      byType: {
        CASUAL: {
          allowed: leaveAllowances.CASUAL,
          taken: byType.CASUAL.taken,
          approved: byType.CASUAL.approved,
          pending: byType.CASUAL.pending,
          remaining: leaveAllowances.CASUAL - byType.CASUAL.taken,
          overdrawn: Math.max(0, byType.CASUAL.taken - leaveAllowances.CASUAL)
        },
        SICK: {
          allowed: leaveAllowances.SICK,
          taken: byType.SICK.taken,
          approved: byType.SICK.approved,
          pending: byType.SICK.pending,
          remaining: leaveAllowances.SICK - byType.SICK.taken,
          overdrawn: Math.max(0, byType.SICK.taken - leaveAllowances.SICK)
        },
        SPECIAL: {
          allowed: leaveAllowances.SPECIAL,
          taken: byType.SPECIAL.taken,
          approved: byType.SPECIAL.approved,
          pending: byType.SPECIAL.pending,
          remaining: leaveAllowances.SPECIAL - byType.SPECIAL.taken,
          overdrawn: Math.max(0, byType.SPECIAL.taken - leaveAllowances.SPECIAL)
        },
        EMERGENCY: {
          allowed: leaveAllowances.EMERGENCY,
          taken: byType.EMERGENCY.taken,
          approved: byType.EMERGENCY.approved,
          pending: byType.EMERGENCY.pending,
          remaining: leaveAllowances.EMERGENCY - byType.EMERGENCY.taken,
          overdrawn: Math.max(0, byType.EMERGENCY.taken - leaveAllowances.EMERGENCY)
        }
      }
    };
  }
};
