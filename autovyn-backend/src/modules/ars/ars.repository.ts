import { MissingType, Prisma, RequestStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';

interface ListParams {
  where: Prisma.ArsRequestWhereInput;
  skip: number;
  take: number;
}

export const arsRepository = {
  findUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        permissions: true,
        managerId: true,
        isActive: true
      }
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

  findFirstAdminApprover() {
    return prisma.user.findFirst({
      where: {
        role: 'ADMIN',
        isActive: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  },

  create(data: Prisma.ArsRequestUncheckedCreateInput) {
    return prisma.arsRequest.create({
      data,
      include: {
        employee: { select: { id: true, employeeId: true, name: true, managerId: true } },
        approver: { select: { id: true, employeeId: true, adminId: true, name: true } }
      }
    });
  },

  count(where: Prisma.ArsRequestWhereInput) {
    return prisma.arsRequest.count({ where });
  },

  list({ where, skip, take }: ListParams) {
    return prisma.arsRequest.findMany({
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

  findById(id: string) {
    return prisma.arsRequest.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, employeeId: true, name: true, managerId: true } },
        approver: { select: { id: true, employeeId: true, adminId: true, name: true } }
      }
    });
  },

  updateStatus(
    id: string,
    status: RequestStatus,
    data?: {
      correctedPunchInAt?: Date;
      correctedPunchOutAt?: Date;
      comment?: string;
    }
  ) {
    return prisma.arsRequest.update({
      where: { id },
      data: {
        status,
        correctedPunchInAt: data?.correctedPunchInAt,
        correctedPunchOutAt: data?.correctedPunchOutAt,
        comment: data?.comment,
        actedAt: new Date()
      },
      include: {
        employee: { select: { id: true, employeeId: true, name: true, managerId: true } },
        approver: { select: { id: true, employeeId: true, adminId: true, name: true } }
      }
    });
  }
};
