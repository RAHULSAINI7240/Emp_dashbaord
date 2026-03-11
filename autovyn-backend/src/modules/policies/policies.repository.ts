import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

export const policiesRepository = {
  create(data: Prisma.PolicyUncheckedCreateInput) {
    return prisma.policy.create({
      data,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            adminId: true,
            employeeId: true
          }
        }
      }
    });
  },

  latest() {
    return prisma.policy.findFirst({
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            adminId: true,
            employeeId: true
          }
        }
      }
    });
  }
};
