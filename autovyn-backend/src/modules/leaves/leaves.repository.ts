import { Prisma, RequestStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';

interface ListParams {
  where: Prisma.LeaveRequestWhereInput;
  skip: number;
  take: number;
}

export const leavesRepository = {
  findFirstActiveAdmin() {
    return prisma.user.findFirst({
      where: {
        isActive: true,
        role: 'ADMIN'
      },
      select: {
        id: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true
      },
      orderBy: [{ name: 'asc' }]
    });
  },

  findApproverById(approverId: string) {
    return prisma.user.findUnique({
      where: { id: approverId },
      select: {
        id: true,
        role: true,
        permissions: true,
        isActive: true
      }
    });
  },

  listActiveLeaveApprovers() {
    return prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ role: 'ADMIN' }, { permissions: { hasSome: ['APPROVE_LEAVE', 'MANAGER', 'TEAM_LEAD'] } }]
      },
      select: {
        id: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }]
    });
  },

  findEmployeeById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        designation: true,
        managerId: true
      }
    });
  },

  create(data: Prisma.LeaveRequestUncheckedCreateInput) {
    return prisma.leaveRequest.create({
      data,
      include: {
        employee: { select: { id: true, employeeId: true, name: true, managerId: true } },
        approver: { select: { id: true, employeeId: true, adminId: true, name: true } }
      }
    });
  },

  count(where: Prisma.LeaveRequestWhereInput) {
    return prisma.leaveRequest.count({ where });
  },

  list({ where, skip, take }: ListParams) {
    return prisma.leaveRequest.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        employee: { select: { id: true, employeeId: true, name: true, managerId: true } },
        approver: { select: { id: true, employeeId: true, adminId: true, name: true } }
      }
    });
  },

  listByEmployee(employeeId: string) {
    return prisma.leaveRequest.findMany({
      where: { employeeId },
      orderBy: [{ createdAt: 'desc' }]
    });
  },

  findById(id: string) {
    return prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, employeeId: true, name: true, managerId: true } },
        approver: { select: { id: true, employeeId: true, adminId: true, name: true } }
      }
    });
  },

  updateStatus(id: string, status: RequestStatus, comment?: string) {
    return prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        comment,
        actedAt: new Date()
      },
      include: {
        employee: { select: { id: true, employeeId: true, name: true, managerId: true } },
        approver: { select: { id: true, employeeId: true, adminId: true, name: true } }
      }
    });
  },

  listPendingToExpire(before: Date) {
    return prisma.leaveRequest.findMany({
      where: {
        status: 'PENDING',
        startDate: {
          lt: before
        }
      }
    });
  },

  expireMany(ids: string[]) {
    if (!ids.length) {
      return Promise.resolve({ count: 0 });
    }

    return prisma.leaveRequest.updateMany({
      where: {
        id: { in: ids },
        status: 'PENDING'
      },
      data: {
        status: 'EXPIRED',
        comment: 'Auto-expired: not approved before leave start date.',
        actedAt: new Date()
      }
    });
  }
};
