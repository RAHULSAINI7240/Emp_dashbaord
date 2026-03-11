import { MissingType, Permission, RequestStatus, Role } from '@prisma/client';
import { env } from '../../config/env';
import { AppError } from '../../utils/app-error';
import { dateKeyToUtcDate, formatUtcDateToKey, parseIsoDateTime } from '../../utils/date-time';
import { buildPaginationMeta, getPagination } from '../../utils/pagination';
import { attendanceService } from '../attendance/attendance.service';
import { arsRepository } from './ars.repository';

interface AuthContext {
  userId: string;
  role: Role;
  permissions: Permission[];
}

interface ArsRequestPayload {
  date: string;
  missingType: string;
  reason: string;
  approverId?: string;
}

interface ArsApprovePayload {
  correctedPunchIn?: string;
  correctedPunchOut?: string;
  comment?: string;
}

interface ListQuery {
  status?: RequestStatus;
  page?: number;
  limit?: number;
  search?: string;
}

const normalizeMissingType = (value: string): MissingType => {
  if (value === 'MISSING_PUNCH_IN') return 'MISSING_IN';
  if (value === 'MISSING_PUNCH_OUT') return 'MISSING_OUT';
  if (value === 'MISSING_IN' || value === 'MISSING_OUT' || value === 'BOTH') return value;
  throw new AppError('Invalid missingType.', 400, 'INVALID_MISSING_TYPE');
};

const canApproveArs = (auth: AuthContext): boolean => auth.role === 'ADMIN' || auth.permissions.includes('APPROVE_ARS');

const serializeArs = (request: {
  id: string;
  employeeId: string;
  approverId: string;
  date: Date;
  missingType: MissingType;
  reason: string;
  status: RequestStatus;
  correctedPunchInAt: Date | null;
  correctedPunchOutAt: Date | null;
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
  id: request.id,
  employeeId: request.employeeId,
  approverId: request.approverId,
  date: formatUtcDateToKey(request.date),
  missingType: request.missingType,
  reason: request.reason,
  status: request.status,
  correctedPunchInAt: request.correctedPunchInAt,
  correctedPunchOutAt: request.correctedPunchOutAt,
  comment: request.comment,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  actedAt: request.actedAt,
  employee: request.employee,
  approver: request.approver
});

const ensureApproverConstraints = (request: Awaited<ReturnType<typeof arsRepository.findById>>, auth: AuthContext): void => {
  if (!request) {
    throw new AppError('ARS request not found.', 404, 'ARS_NOT_FOUND');
  }

  if (request.status !== 'PENDING') {
    throw new AppError('Only pending ARS requests can be acted upon.', 400, 'ARS_NOT_PENDING');
  }

  if (auth.role === 'ADMIN') {
    return;
  }

  if (!auth.permissions.includes('APPROVE_ARS')) {
    throw new AppError('Missing ARS approval permission.', 403, 'FORBIDDEN_ARS_APPROVAL');
  }

  if (request.approverId !== auth.userId) {
    throw new AppError('You are not the selected ARS approver.', 403, 'ARS_APPROVER_MISMATCH');
  }

  if (request.employeeId === auth.userId) {
    throw new AppError('Self-approval is not allowed.', 403, 'SELF_APPROVAL_NOT_ALLOWED');
  }

  if (request.employee.managerId !== auth.userId) {
    throw new AppError('You can approve only your team members.', 403, 'TEAM_SCOPE_VIOLATION');
  }
};

const resolveApproverId = async (auth: AuthContext, explicitApproverId?: string): Promise<string> => {
  if (explicitApproverId) {
    const approver = await arsRepository.findApproverById(explicitApproverId);
    if (!approver || !approver.isActive) {
      throw new AppError('Approver not found or inactive.', 400, 'INVALID_APPROVER');
    }

    if (!(approver.role === 'ADMIN' || approver.permissions.includes('APPROVE_ARS'))) {
      throw new AppError('Selected approver does not have ARS approval permission.', 400, 'APPROVER_CANNOT_APPROVE_ARS');
    }

    if (approver.id === auth.userId && auth.role !== 'ADMIN') {
      throw new AppError('Self-approval is not allowed.', 403, 'SELF_APPROVAL_NOT_ALLOWED');
    }

    return approver.id;
  }

  const requester = await arsRepository.findUserById(auth.userId);
  if (!requester || !requester.isActive) {
    throw new AppError('Requester not found.', 404, 'REQUESTER_NOT_FOUND');
  }

  const adminApprover = async (): Promise<string> => {
    const admin = await arsRepository.findFirstAdminApprover();
    if (!admin) {
      throw new AppError('No active admin found for ARS approval.', 500, 'ARS_ADMIN_APPROVER_MISSING');
    }
    return admin.id;
  };

  const managerApprover = async (): Promise<string | null> => {
    if (!requester.managerId) return null;
    const manager = await arsRepository.findApproverById(requester.managerId);
    if (!manager || !manager.isActive) return null;
    if (manager.role === 'ADMIN' || manager.permissions.includes('APPROVE_ARS')) {
      return manager.id;
    }
    return null;
  };

  if (env.ARS_APPROVER_MODE === 'ADMIN') {
    return adminApprover();
  }

  if (env.ARS_APPROVER_MODE === 'MANAGER') {
    return (await managerApprover()) ?? adminApprover();
  }

  return (await managerApprover()) ?? adminApprover();
};

export const arsService = {
  async request(auth: AuthContext, payload: ArsRequestPayload) {
    if (auth.role === 'ADMIN') {
      throw new AppError('Admin cannot create employee ARS request endpoint.', 403, 'ADMIN_ARS_REQUEST_NOT_ALLOWED');
    }

    const approverId = await resolveApproverId(auth, payload.approverId);
    const missingType = normalizeMissingType(payload.missingType);

    const created = await arsRepository.create({
      employeeId: auth.userId,
      approverId,
      date: dateKeyToUtcDate(payload.date),
      missingType,
      reason: payload.reason,
      status: 'PENDING'
    });

    return serializeArs(created);
  },

  async my(auth: AuthContext, query: ListQuery) {
    const { page, limit, skip } = getPagination(query);

    const where = {
      employeeId: auth.userId,
      ...(query.status ? { status: query.status } : {})
    };

    const [rows, total] = await Promise.all([
      arsRepository.list({ where, skip, take: limit }),
      arsRepository.count(where)
    ]);

    return {
      items: rows.map(serializeArs),
      pagination: buildPaginationMeta(page, limit, total)
    };
  },

  async pendingApprovals(auth: AuthContext, query: ListQuery) {
    if (!canApproveArs(auth)) {
      throw new AppError('ARS approval permission required.', 403, 'FORBIDDEN_ARS_APPROVAL');
    }

    const { page, limit, skip } = getPagination(query);

    const where = {
      status: 'PENDING' as const,
      ...(auth.role === 'ADMIN'
        ? {}
        : {
            approverId: auth.userId,
            employee: {
              is: {
                managerId: auth.userId
              }
            }
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
      arsRepository.list({ where, skip, take: limit }),
      arsRepository.count(where)
    ]);

    return {
      items: rows.map(serializeArs),
      pagination: buildPaginationMeta(page, limit, total)
    };
  },

  async approve(auth: AuthContext, requestId: string, payload: ArsApprovePayload) {
    const request = await arsRepository.findById(requestId);
    ensureApproverConstraints(request, auth);

    const correctedPunchInAt = payload.correctedPunchIn ? parseIsoDateTime(payload.correctedPunchIn) : undefined;
    const correctedPunchOutAt = payload.correctedPunchOut ? parseIsoDateTime(payload.correctedPunchOut) : undefined;

    const updated = await arsRepository.updateStatus(requestId, 'APPROVED', {
      correctedPunchInAt,
      correctedPunchOutAt,
      comment: payload.comment
    });

    await attendanceService.upsertCorrectedPunch(
      updated.employeeId,
      formatUtcDateToKey(updated.date),
      'PRESENT',
      correctedPunchInAt,
      correctedPunchOutAt
    );

    return serializeArs(updated);
  },

  async decline(auth: AuthContext, requestId: string, comment?: string) {
    const request = await arsRepository.findById(requestId);
    ensureApproverConstraints(request, auth);

    const updated = await arsRepository.updateStatus(requestId, 'DECLINED', {
      comment
    });

    return serializeArs(updated);
  }
};
